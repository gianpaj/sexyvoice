#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const exec = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const help = `Usage: node scripts/benchmark-daily-stats.mjs --label <name> --date YYYY-MM-DD [options]

  --label       Required filename label: letters, digits, underscores, hyphens
                Start with a letter or digit; maximum 80 characters
  --date        Required valid calendar date, YYYY-MM-DD
  --url         Default: https://sv.dev/api/daily-stats
                Local hosts only: localhost, 127.0.0.1, [::1], sv.dev
  --runs        Measured requests, 1..20; default: 5
  --output-dir  Default: scripts/.cache/daily-stats-benchmark
                Relative paths resolve from the repository root
  --help, -h    Show this help without making requests

Runs one excluded warmup, then sequential measurements with cache=off.
Requires curl and trusted local TLS certificates; never follows redirects.
Each request has a 300-second limit. Failures abort without retrying.
After a timeout, wait for the server request to finish before rerunning.
Reports and headers stay in private local files. Console output excludes reports.
`;

function options() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        date: { type: 'string' },
        help: { short: 'h', type: 'boolean' },
        label: { type: 'string' },
        'output-dir': {
          default: 'scripts/.cache/daily-stats-benchmark',
          type: 'string',
        },
        runs: { default: '5', type: 'string' },
        url: { default: 'https://sv.dev/api/daily-stats', type: 'string' },
      },
    }));
  } catch (cause) {
    throw new Error('Invalid arguments. Use --help for usage.', { cause });
  }
  if (values.help) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(values.label ?? '')) {
    throw new Error('--label is required and must be a safe filename label.');
  }
  const date = new Date(`${values.date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(values.date ?? '') ||
    values.date.startsWith('0000-') ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== values.date
  ) {
    throw new Error(
      '--date must be a valid calendar date in YYYY-MM-DD format.',
    );
  }
  if (!/^(?:[1-9]|1\d|20)$/.test(values.runs)) {
    throw new Error('--runs must be an integer from 1 to 20.');
  }
  let url;
  try {
    url = new URL(values.url);
  } catch (cause) {
    throw new Error('--url must be a valid local HTTP or HTTPS URL.', {
      cause,
    });
  }
  if (
    !(
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]', 'sv.dev'].includes(url.hostname)
    ) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(
      '--url must use an allowed local host without credentials or a fragment.',
    );
  }
  if (!values['output-dir'].trim()) {
    throw new Error('--output-dir must not be empty.');
  }
  url.searchParams.set('date', values.date);
  url.searchParams.set('cache', 'off');
  return {
    date: values.date,
    label: values.label,
    outputDir: path.resolve(repoRoot, values['output-dir']),
    runs: Number(values.runs),
    url,
  };
}

function summarize(attempts) {
  const measured = attempts.filter((item) => item.ok && item.phase === 'run');
  const stats = (key) => {
    const sorted = measured.map((item) => item[key]).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return {
      max: sorted.at(-1),
      median:
        sorted.length % 2
          ? sorted[middle]
          : (sorted[middle - 1] + sorted[middle]) / 2,
      min: sorted[0],
    };
  };
  return {
    successfulRuns: measured.length,
    time_starttransfer: stats('time_starttransfer'),
    time_total: stats('time_total'),
    units: 'seconds',
  };
}

async function request(url, attempt) {
  await writeFile(attempt.headersPath, '', { flag: 'wx', mode: 0o600 });
  await writeFile(attempt.bodyPath, '', { flag: 'wx', mode: 0o600 });
  // Ignore curlrc and proxies so local requests cannot be redirected elsewhere.
  const args = [
    '--disable',
    '--silent',
    '--noproxy',
    '*',
    '--proto',
    '=http,https',
    '--max-time',
    '300',
    '--dump-header',
    attempt.headersPath,
    '--output',
    attempt.bodyPath,
    '--write-out',
    '%{time_total}\t%{time_starttransfer}\t%{http_code}',
  ];
  if (url.hostname === 'sv.dev' || url.hostname === 'localhost') {
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    args.push('--resolve', `${url.hostname}:${port}:127.0.0.1`);
  }
  args.push('--url', url.href);
  let stdout;
  let curlFailure;
  try {
    ({ stdout } = await exec('curl', args, { maxBuffer: 64 * 1024 }));
  } catch (error) {
    stdout = error.stdout ?? '';
    // Never print child-process errors: they can contain headers or body data.
    attempt.curlExitCode = error.code ?? null;
    curlFailure =
      error.code === 28
        ? 'curl timed out; wait for the server request to finish before rerunning.'
        : 'curl failed; check curl availability, local server, and TLS trust.';
  }
  const timing = stdout
    .trim()
    .match(/^(\d+(?:\.\d+)?)\t(\d+(?:\.\d+)?)\t(\d{3})$/);
  if (timing) {
    attempt.time_total = Number(timing[1]);
    attempt.time_starttransfer = Number(timing[2]);
    attempt.http_code = Number(timing[3]);
  }
  if (curlFailure) throw new Error(curlFailure);
  if (!timing) throw new Error('Missing or invalid curl timing output.');
  if (attempt.http_code !== 200) {
    throw new Error(`Expected HTTP 200; received ${attempt.http_code}.`);
  }
  const rawHeaders = await readFile(attempt.headersPath, 'utf8');
  const finalHeaders = rawHeaders
    .split(/\r?\n\r?\n/)
    .filter((block) => /^HTTP\/\S+\s+\d{3}/.test(block))
    .at(-1);
  const headers = new Headers();
  for (const line of (finalHeaders ?? '').split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
  }
  if (headers.get('x-daily-stats-cache') !== 'bypass') {
    throw new Error('Expected X-Daily-Stats-Cache: bypass.');
  }
  if (
    headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'text/plain'
  ) {
    throw new Error(
      'Expected a text/plain report, not JSON or another response type.',
    );
  }
  const body = await readFile(attempt.bodyPath);
  if (!body.toString('utf8').trim()) throw new Error('Report body is empty.');
  attempt.sha256 = createHash('sha256').update(body).digest('hex');
  attempt.ok = true;
}

async function main() {
  const config = options();
  if (!config) {
    console.log(help);
    return;
  }
  process.umask(0o077);
  await mkdir(config.outputDir, { mode: 0o700, recursive: true });
  const directory = await mkdtemp(
    path.join(config.outputDir, `${config.label}-`),
  );
  const resultsPath = path.join(directory, 'results.json');
  const results = {
    attempts: [],
    date: config.date,
    failure: null,
    label: config.label,
    requestedRuns: config.runs,
    startedAt: new Date().toISOString(),
    summary: summarize([]),
    url: config.url.href,
  };
  const save = () =>
    writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`, {
      mode: 0o600,
    });
  await save();
  console.log(`${config.label} results: ${resultsPath}`);
  for (let index = 0; index <= config.runs; index++) {
    const name = index === 0 ? 'warmup' : `run-${index}`;
    const attempt = {
      bodyPath: path.join(directory, `${name}.txt`),
      headersPath: path.join(directory, `${name}.headers`),
      index,
      ok: false,
      phase: index === 0 ? 'warmup' : 'run',
    };
    results.attempts.push(attempt);
    try {
      await request(config.url, attempt);
      console.log(
        `${config.label} ${name}: total=${attempt.time_total}s ttfb=${attempt.time_starttransfer}s sha256=${attempt.sha256}`,
      );
    } catch (error) {
      results.failure = { message: error.message, request: name };
      process.exitCode = 1;
    }
    results.summary = summarize(results.attempts);
    await save();
    if (results.failure) break;
  }
  console.log(`${config.label} summary: ${JSON.stringify(results.summary)}`);
  if (results.failure) {
    // Failure details are in the private JSON; do not echo response-derived errors.
    console.error(`${config.label} failed: ${resultsPath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
