/**
 * R2 keys and public URLs. The uploaders and the voice catalog SQL derive both
 * here, so the key and URL recorded at upload match the ones the SQL writes.
 */

/** A validated folder: '' or '.' is the bucket root; trailing slashes drop. */
export function r2Folder(folder: string): string {
  const trimmed = folder === '.' ? '' : folder.replace(/\/+$/, '');
  const parts = trimmed ? trimmed.split('/') : [];
  if (
    parts.some(
      (part) => !part || part === '.' || part === '..' || part.includes('\\'),
    )
  ) {
    throw new Error(
      `Folder must contain relative folder names without . or .. segments: ${folder}`,
    );
  }
  return trimmed;
}

export function r2ObjectKey(folder: string, filename: string): string {
  const parent = r2Folder(folder);
  return parent ? `${parent}/${filename}` : filename;
}

/** Parse a public file host; only a bare HTTPS origin is accepted. */
export function parsePublicOrigin(url: string): URL {
  const origin = new URL(url);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  ) {
    throw new Error('Public URL must be an HTTPS origin');
  }
  return origin;
}

/** The public URL of an R2 key, with each key segment percent-encoded. */
export function r2PublicUrl(origin: string, key: string): string {
  return new URL(
    key.split('/').map(encodeURIComponent).join('/'),
    parsePublicOrigin(origin),
  ).href;
}
