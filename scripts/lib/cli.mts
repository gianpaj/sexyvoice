import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ParseArgsConfig, parseArgs } from 'node:util';
import { config } from 'dotenv';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Env files a command reads when it gets no `--env-file`, highest precedence
 * first. The first file that sets a variable wins, and a variable already set
 * in the shell beats every file.
 */
export const DEFAULT_ENV_FILES = [
  'scripts/.env.local',
  'apps/web/.env.local',
  'scripts/.env',
  'apps/web/.env',
].map((file) => path.join(REPOSITORY_ROOT, file));

/** Resolve a path argument from the directory the command was run in. */
export function inputPath(file: string): string {
  // pnpm runs package scripts in scripts/ and keeps the caller's directory in
  // INIT_CWD, so the root aliases accept root-relative paths and shell globs.
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
}

/**
 * Load the `--env-file` files, or DEFAULT_ENV_FILES when there are none. A
 * named file must exist, so a typo cannot fall back to another environment.
 */
export function loadScriptEnv(envFiles: string[] = []): void {
  const files = envFiles.map(inputPath);
  const missing = files.filter((file) => !existsSync(file));
  if (missing.length > 0) {
    throw new Error(`Env file not found: ${missing.join(', ')}`);
  }
  config({
    override: false,
    path: files.length > 0 ? files : DEFAULT_ENV_FILES,
    quiet: true,
  });
}

export function requiredEnv(
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`Missing env.${name}`);
  }
  return value;
}

/**
 * Parse the command's arguments. pnpm 11 forwards a literal `--` ahead of
 * them, so one leading `--` is dropped. Unknown options are errors.
 */
export function parseCliArgs<T extends Omit<ParseArgsConfig, 'args'>>(
  options: T,
  argv: string[] = process.argv.slice(2),
) {
  return parseArgs({
    ...options,
    args: argv[0] === '--' ? argv.slice(1) : argv,
  });
}

export function isLocalUrl(url: string): boolean {
  const { hostname } = new URL(url);
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

/** Tell the operator which database the command is about to use. */
export function printDatabaseTarget(url: string, readOnly: boolean): void {
  const target = isLocalUrl(url) ? 'LOCAL' : 'PRODUCTION';
  const access = readOnly ? 'read-only' : 'read-write';
  console.warn(`Supabase: ${new URL(url).host} (${target}, ${access})`);
}

/**
 * Run `main` when `moduleUrl` is the entry point, so tests can import the
 * command. A thrown error prints its message and sets exit code 1.
 */
export function runScript(
  moduleUrl: string,
  main: () => Promise<void> | void,
): void {
  if (!isEntryPoint(moduleUrl)) {
    return;
  }
  Promise.resolve()
    .then(main)
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

function isEntryPoint(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
