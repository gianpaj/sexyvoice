import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** An ISO timestamp with `:` and `.` replaced, for file names. */
export function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Write a report that must not exist yet; its directory is created. */
export async function writeNewJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, jsonText(value), { encoding: 'utf8', flag: 'wx' });
}

/**
 * Replace a JSON file in one rename, so a reader or a crash never sees half a
 * file. Returns the number of bytes written.
 */
export async function replaceJson(
  filePath: string,
  value: unknown,
  { mode }: { mode?: number } = {},
): Promise<number> {
  const text = jsonText(value);
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx', mode });
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
  return Buffer.byteLength(text);
}
