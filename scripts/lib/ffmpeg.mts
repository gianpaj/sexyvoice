import { spawnSync } from 'node:child_process';

export interface AudioToolOptions {
  maxBuffer?: number;
  /** Completes "ffmpeg failed …": `for "a.mp3"` or `to encode a.mp3`. */
  task: string;
  timeoutMs?: number;
}

/**
 * Run ffmpeg or ffprobe. A failure names the tool and task and says what to
 * do: install FFmpeg, shorten the input, or check the file.
 */
export function runAudioTool(
  tool: 'ffmpeg' | 'ffprobe',
  args: string[],
  { maxBuffer = 1024 * 1024, task, timeoutMs = 120_000 }: AudioToolOptions,
): { stderr: string; stdout: Buffer } {
  const result = spawnSync(tool, args, {
    maxBuffer,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
  });
  if (result.error || result.status !== 0) {
    const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
    let advice = 'Check that the input is a readable, valid local audio file.';
    if (code === 'ENOENT') {
      advice = `Install FFmpeg and ensure ${tool} is on PATH.`;
    } else if (code === 'ETIMEDOUT') {
      advice = `Processing exceeded ${timeoutMs / 1000} seconds; use a shorter input.`;
    } else if (code === 'ENOBUFS') {
      advice = `Output exceeded the ${maxBuffer / 1024 / 1024} MiB buffer; use a shorter input.`;
    }
    const detail = result.error?.message || result.stderr?.toString().trim();
    throw new Error(
      `${tool} failed ${task}: ${detail || `exit ${result.status}, signal ${result.signal}`}. ${advice}`,
      { cause: result.error },
    );
  }
  return { stderr: result.stderr.toString(), stdout: result.stdout };
}

export function probeDurationSeconds(path: string): number {
  const { stdout } = runAudioTool(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ],
    { task: `for ${JSON.stringify(path)}`, timeoutMs: 10_000 },
  );
  const seconds = Number(stdout.toString().trim());
  if (!(Number.isFinite(seconds) && seconds > 0)) {
    throw new Error(`Invalid audio duration: ${path}`);
  }
  return seconds;
}
