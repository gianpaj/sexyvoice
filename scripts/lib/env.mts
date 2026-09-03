import { config } from 'dotenv';

export function loadScriptEnv(): void {
  config({
    override: false,
    path: ['.env', '.env.local'],
  });
}
