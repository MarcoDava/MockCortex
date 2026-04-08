// Module-level store for interview video blob URLs.
// Survives React navigation within the same tab session.
const _blobs = new Map<number, string>();

export function storeVideoBlob(index: number, blobUrl: string) {
  const old = _blobs.get(index);
  if (old) URL.revokeObjectURL(old);
  _blobs.set(index, blobUrl);
}

export function getVideoBlob(index: number): string | undefined {
  return _blobs.get(index);
}

export function clearVideoStore() {
  _blobs.forEach((url) => URL.revokeObjectURL(url));
  _blobs.clear();
}
