import type { ReportReason } from '@/lib/database.types';
import { blockUser } from '@/lib/friends';
import { supabase } from '@/lib/supabase';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Trakassering' },
  { value: 'nudity', label: 'Nakenhet' },
  { value: 'violence', label: 'Vold' },
  { value: 'other', label: 'Noe annet' },
];

export type ReportTarget = {
  reportedUserId: string;
  postId?: string;
  commentId?: string;
};

/** File a report. Required by App Store guideline 1.2. */
export async function reportContent(
  selfId: string,
  target: ReportTarget,
  reason: ReportReason,
  details?: string
): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: selfId,
    reported_user_id: target.reportedUserId,
    post_id: target.postId ?? null,
    comment_id: target.commentId ?? null,
    reason,
    details: details?.trim() || null,
  });
  if (error) throw error;
}

/**
 * File a report and, optionally, block the person in one action.
 *
 * The report is filed first: if blocking fails we still want the report on
 * record, whereas a block with no report tells moderation nothing. Blocking is
 * what actually protects the user — it revokes album access immediately
 * through are_friends() — so a failure there is surfaced to the caller.
 */
export async function blockAndReport(
  selfId: string,
  target: ReportTarget,
  reason: ReportReason,
  details: string | undefined,
  alsoBlock: boolean
): Promise<void> {
  await reportContent(selfId, target, reason, details);
  if (alsoBlock) {
    await blockUser(selfId, target.reportedUserId);
  }
}

/**
 * Permanently delete the signed-in user's account.
 *
 * Goes through an Edge Function because removing an auth user needs the
 * service role. The function derives the user from the caller's own token, so
 * there is nothing here that could be pointed at somebody else.
 */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });

  if (error) throw error;
  if (!data?.deleted) throw new Error('Kontoen ble ikke slettet.');

  // The account is gone; drop the now-meaningless local session.
  await supabase.auth.signOut();
}
