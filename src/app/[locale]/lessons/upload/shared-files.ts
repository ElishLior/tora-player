/**
 * Files shared to the app from the Android share sheet (WhatsApp → Share →
 * נגן תורה). The manifest's share_target POSTs them to
 * /he/lessons/share-target; public/sw.js stashes each file in this Cache
 * Storage bucket and redirects to /he/lessons/upload?shared=1, where the
 * upload page takes them. Keep the names in sync with SHARE_STASH and the
 * X-File-* headers in public/sw.js.
 */
const SHARE_STASH = 'share-target-v2';

/** Take every stashed shared file (in share order) and clear the stash. */
export async function takeSharedFiles(): Promise<File[]> {
  if (!('caches' in window)) return [];
  const cache = await caches.open(SHARE_STASH);
  const requests = [...(await cache.keys())].sort((a, b) => (a.url < b.url ? -1 : 1));
  const files: File[] = [];
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    const blob = await response.blob();
    files.push(
      new File([blob], decodeURIComponent(response.headers.get('X-File-Name') || 'shared-file'), {
        type: blob.type,
        lastModified: Number(response.headers.get('X-File-Modified')) || Date.now(),
      }),
    );
  }
  await caches.delete(SHARE_STASH);
  return files;
}
