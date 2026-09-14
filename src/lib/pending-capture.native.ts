import { Directory, File, Paths } from 'expo-file-system';

import type { PendingCapture } from '@/lib/pending-capture.types';

export type { PendingCapture } from '@/lib/pending-capture.types';

const DRAFT_DIRECTORY = new Directory(Paths.document, 'pending-capture-v1');
const MANIFEST_NAME = 'capture.json';

let pending: PendingCapture | null = null;
let writes: Promise<void> = Promise.resolve();
let revision = 0;

function isPendingCapture(value: unknown): value is PendingCapture {
  if (!value || typeof value !== 'object') return false;
  const capture = value as Partial<PendingCapture>;
  return (
    typeof capture.imageUri === 'string' &&
    (capture.videoUri === null || typeof capture.videoUri === 'string') &&
    (capture.selfieUri === null || typeof capture.selfieUri === 'string') &&
    typeof capture.width === 'number' &&
    typeof capture.height === 'number'
  );
}

function extensionFor(uri: string, fallback: string): string {
  try {
    return new File(uri).extension || fallback;
  } catch {
    return fallback;
  }
}

async function copyIntoDraft(uri: string, name: string, id: string): Promise<string> {
  const extension = extensionFor(uri, name === 'video' ? '.mov' : '.jpg');
  const destination = new File(DRAFT_DIRECTORY, `${id}-${name}${extension}`);
  await new File(uri).copy(destination, { overwrite: true });
  return destination.uri;
}

function deleteIfTemporary(uri: string): void {
  if (!uri.startsWith(Paths.cache.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The durable copy is already committed. Cache trimming is best effort.
  }
}

function manifestJson(capture: PendingCapture): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(capture, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString();
    if (value && typeof value === 'object') {
      if (seen.has(value)) return undefined;
      seen.add(value);
    }
    return value;
  });
}

function removeUnreferencedDraftFiles(capture: PendingCapture): void {
  const media = [capture.imageUri, capture.videoUri, capture.selfieUri].filter(
    (uri): uri is string => !!uri
  );
  const keep = new Set([MANIFEST_NAME, ...media.map((uri) => new File(uri).name)]);
  for (const entry of DRAFT_DIRECTORY.list()) {
    if (!keep.has(entry.name)) entry.delete();
  }
}

async function persist(capture: PendingCapture, expectedRevision: number): Promise<void> {
  DRAFT_DIRECTORY.create({ intermediates: true, idempotent: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const created: string[] = [];

  try {
    const [imageUri, videoUri, selfieUri] = await Promise.all([
      copyIntoDraft(capture.imageUri, 'image', id).then((uri) => {
        created.push(uri);
        return uri;
      }),
      capture.videoUri
        ? copyIntoDraft(capture.videoUri, 'video', id).then((uri) => {
            created.push(uri);
            return uri;
          })
        : null,
      capture.selfieUri
        ? copyIntoDraft(capture.selfieUri, 'selfie', id).then((uri) => {
            created.push(uri);
            return uri;
          })
        : null,
    ]);

    const next: PendingCapture = { ...capture, imageUri, videoUri, selfieUri };
    if (expectedRevision !== revision) {
      for (const uri of created) new File(uri).delete();
      return;
    }
    const temporaryManifest = new File(DRAFT_DIRECTORY, `capture-${id}.json`);
    temporaryManifest.create({ overwrite: true });
    temporaryManifest.write(manifestJson(next));
    await temporaryManifest.move(new File(DRAFT_DIRECTORY, MANIFEST_NAME), {
      overwrite: true,
    });

    pending = next;

    // The manifest now names a complete replacement, so obsolete media from
    // the prior draft can be removed without risking the restorable copy.
    removeUnreferencedDraftFiles(next);

    deleteIfTemporary(capture.imageUri);
    if (capture.videoUri) deleteIfTemporary(capture.videoUri);
    if (capture.selfieUri) deleteIfTemporary(capture.selfieUri);
  } catch (error) {
    for (const uri of created) {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        // Preserve the persistence error; this is only partial-copy cleanup.
      }
    }
    throw error;
  }
}

export function setPendingCapture(capture: PendingCapture): Promise<void> {
  const expectedRevision = ++revision;
  const operation = writes.then(() => persist(capture, expectedRevision));
  writes = operation.catch(() => {});
  return operation;
}

export function getPendingCapture(): PendingCapture | null {
  if (pending) return pending;

  try {
    const manifest = new File(DRAFT_DIRECTORY, MANIFEST_NAME);
    if (!manifest.exists) return null;
    const restored: unknown = JSON.parse(manifest.textSync());
    if (!isPendingCapture(restored) || !new File(restored.imageUri).exists) {
      clearPendingCapture();
      return null;
    }
    if (restored.videoUri && !new File(restored.videoUri).exists) restored.videoUri = null;
    if (restored.selfieUri && !new File(restored.selfieUri).exists) restored.selfieUri = null;
    removeUnreferencedDraftFiles(restored);
    pending = restored;
    return restored;
  } catch {
    clearPendingCapture();
    return null;
  }
}

export function clearPendingCapture(): void {
  revision += 1;
  pending = null;
  try {
    if (DRAFT_DIRECTORY.exists) DRAFT_DIRECTORY.delete();
  } catch {
    // A later save recreates the directory; a failed trim is non-fatal.
  }
}
