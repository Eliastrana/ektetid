import type { FriendshipStatus, Profile } from '@/lib/database.types';
import { notify } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

export type FriendRequest = {
  profile: Profile;
  status: FriendshipStatus;
  /** True when the signed-in user sent it, false when they received it. */
  outgoing: boolean;
};

export type FriendSuggestion = Profile & { mutualCount: number };

export async function listFriendSuggestions(limit = 12): Promise<FriendSuggestion[]> {
  const { data, error } = await supabase.rpc('friend_suggestions', { p_limit: limit });
  if (error) throw error;
  return data.map(({ mutual_count, ...profile }) => ({
    ...profile,
    mutualCount: Number(mutual_count),
  }));
}

/**
 * Find people by username.
 *
 * profiles is readable by every signed-in user so search can work at all;
 * the profiles_select policy still hides anyone involved in a block.
 */
export async function searchProfiles(query: string, selfId: string): Promise<Profile[]> {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('username', `${term}%`)
    .neq('id', selfId)
    .limit(20);

  if (error) throw error;
  return data;
}

/** Every friendship edge involving the signed-in user, in either direction. */
export async function listFriendships(selfId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(
      `requester_id, addressee_id, status,
       requester:profiles!friendships_requester_id_fkey(*),
       addressee:profiles!friendships_addressee_id_fkey(*)`
    )
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return data.map((row) => {
    const outgoing = row.requester_id === selfId;
    return {
      outgoing,
      status: row.status,
      profile: (outgoing ? row.addressee : row.requester) as unknown as Profile,
    };
  });
}

export async function sendFriendRequest(selfId: string, addresseeId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: selfId, addressee_id: addresseeId });
  if (error) throw error;
  notify('friend_request', addresseeId);
}

/**
 * Accept an incoming request. Only the addressee can do this — the
 * friendships_update policy allows either party to write, but a requester
 * accepting their own request would be meaningless.
 */
export async function acceptFriendRequest(requesterId: string, selfId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('requester_id', requesterId)
    .eq('addressee_id', selfId);
  if (error) throw error;
  notify('friend_accepted', requesterId);
}

/** Decline a request, or remove an existing friend. Symmetric either way. */
export async function removeFriendship(selfId: string, otherId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${selfId},addressee_id.eq.${otherId}),` +
        `and(requester_id.eq.${otherId},addressee_id.eq.${selfId})`
    );
  if (error) throw error;
}

/**
 * Block someone. Required by App Store guideline 1.2 for user-generated
 * content. A block hides both profiles from each other and, through
 * are_friends(), removes all access to each other's albums.
 */
export async function blockUser(selfId: string, otherId: string): Promise<void> {
  await removeFriendship(selfId, otherId);
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: selfId, addressee_id: otherId, status: 'blocked' });
  if (error) throw error;
}
