import { config } from 'dotenv';

export function loadScriptEnv(paths?: string[]): void {
  config({
    override: false,
    path: paths ?? ['.env', '.env.local'],
    quiet: true,
  });
}
