import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/claude.yml', import.meta.url),
  'utf8',
);
const reviewers = [
  'code-quality-reviewer',
  'performance-reviewer',
  'test-coverage-reviewer',
  'documentation-accuracy-reviewer',
  'security-code-reviewer',
];
const reviewEnv = {
  REVIEW_PR: '731',
  REVIEW_REPO: 'example/review-probe',
  REVIEW_SHA: 'a'.repeat(40),
  REVIEW_BASE: 'b'.repeat(40),
  REVIEW_RUN_KEY: '987654/2',
};
const instructions = [
  `The review commit is ${reviewEnv.REVIEW_SHA}.`,
  'Do not replace it with a newer SHA.',
  `Verify git rev-parse HEAD before reviewing git diff ${reviewEnv.REVIEW_BASE}...${reviewEnv.REVIEW_SHA}.`,
  'Check Run Unit Tests for this SHA before publishing the final assessment.',
  `Publish with gh pr comment ${reviewEnv.REVIEW_PR} --repo ${reviewEnv.REVIEW_REPO}.`,
  '__REVIEW_COMPLETION_MARKER__',
  'Include the completion marker only after completing the code review.',
].join('\n');

function workflowStep(name: string) {
  const body = workflow.split(`      - name: ${name}\n`)[1];
  if (!body) throw new Error(`The workflow must include the ${name} step`);
  return body.split('\n      - name: ')[0];
}

const trustedConfigPaths = [
  '.claude',
  '.mcp.json',
  '.claude.json',
  '.gitmodules',
  '.ripgreprc',
  'CLAUDE.md',
  'CLAUDE.local.md',
  '.husky',
];

function restoreScript() {
  const script = workflowStep('Restore trusted dispatch configuration')
    .match(/^ {8}run: \|\n((?:^ {10}[^\n]*(?:\n|$)|^\n)*)/m)?.[1]
    .replace(/^ {10}/gm, '');
  if (!script)
    throw new Error('Trusted configuration restore must include Bash');
  return script;
}

function gitFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'claude-trusted-config-'));
  const repository = join(directory, 'repository');
  mkdirSync(repository);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_DIR: undefined,
    GIT_WORK_TREE: undefined,
    GIT_INDEX_FILE: undefined,
    GIT_EDITOR: 'true',
    GIT_TERMINAL_PROMPT: '0',
  };
  function git(...args: string[]) {
    const result = spawnSync(
      'git',
      [
        '--no-pager',
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'user.name=Review probe fixture',
        '-c',
        'user.email=review-probe@example.invalid',
        ...args,
      ],
      { cwd: repository, env, encoding: 'utf8', timeout: 10_000 },
    );
    if (result.status !== 0)
      throw new Error(`Fixture git failed: ${result.stderr}`);
    return result.stdout.trim();
  }
  function write(path: string, content: string) {
    const target = join(repository, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  function commit(message: string) {
    git('add', '--all');
    git('commit', '--quiet', '-m', message);
    return git('rev-parse', 'HEAD');
  }
  function restore(sha: string) {
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', restoreScript()],
      {
        cwd: repository,
        env: { ...env, TRUSTED_CONFIG_SHA: sha },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    if (result.status !== 0)
      throw new Error(`Restore failed: ${result.stderr}`);
  }
  try {
    git('init', '--quiet', '--initial-branch=main', '--template=');
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return { directory, repository, git, write, commit, restore };
}

function parseOutputs(text: string) {
  const outputs: Record<string, string> = {};
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const multiline = /^(\w+)<<(.+)$/.exec(line);
    if (multiline) {
      const [, name, delimiter] = multiline;
      const value: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== delimiter) {
        value.push(lines[index]);
        index += 1;
      }
      if (lines[index] !== delimiter) {
        throw new Error(`Output ${name} must be terminated`);
      }
      if (outputs[name] !== undefined) {
        throw new Error(`Output ${name} must be unique`);
      }
      outputs[name] = value.join('\n');
    } else {
      const singleLine = /^(\w+)=(.*)$/.exec(line);
      if (!singleLine) {
        throw new Error('GITHUB_OUTPUT must contain only output records');
      }
      if (outputs[singleLine[1]] !== undefined) {
        throw new Error(`Output ${singleLine[1]} must be unique`);
      }
      outputs[singleLine[1]] = singleLine[2];
    }
  }
  return outputs;
}

function runPrompt(mode: string, overrides: NodeJS.ProcessEnv = {}) {
  const step = workflowStep('Select review prompt');
  const script = step
    .split("          python3 - <<'PY'\n")[1]
    ?.split('\n          PY')[0]
    ?.replace(/^ {10}/gm, '');
  if (!script) {
    throw new Error(
      'Prompt selection must execute the inline Python from YAML',
    );
  }
  const directory = mkdtempSync(join(tmpdir(), 'claude-review-probe-'));
  const outputFile = join(directory, 'output');
  try {
    const result = spawnSync('python3', ['-c', script], {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        ...reviewEnv,
        REVIEW_MODE: mode,
        REVIEW_INSTRUCTIONS: instructions,
        ...overrides,
        GITHUB_OUTPUT: outputFile,
      },
    });
    if (result.status !== 0 || result.stderr) {
      throw new Error(`Prompt selection failed: ${result.stderr}`);
    }
    const outputs = parseOutputs(readFileSync(outputFile, 'utf8'));
    if (Object.keys(outputs).sort().join(',') !== 'marker,prompt') {
      throw new Error('Prompt selection must emit exactly marker and prompt');
    }
    if (!(outputs.prompt && outputs.marker) || /[\r\n]/.test(outputs.marker)) {
      throw new Error('Prompt and single-line marker outputs must be nonempty');
    }
    return outputs;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectedMarker(prefix = 'Review marker: claude-review') {
  return `${prefix}/${reviewEnv.REVIEW_RUN_KEY}/${reviewEnv.REVIEW_SHA}/${reviewEnv.REVIEW_BASE}`;
}

test('dispatch exposes only the two explicit probe modes and defaults to smoke', () => {
  const dispatch = workflow.match(
    /^ {2}workflow_dispatch:\n([\s\S]*?)(?=^ {2}\w|^jobs:)/m,
  )?.[1];
  assert.ok(dispatch, 'Manual probes require workflow_dispatch');
  const prInput = dispatch
    .split('      pr_number:\n')[1]
    ?.split('\n      mode:')[0];
  assert.ok(prInput);
  assert.match(prInput, /type: string/);
  assert.match(prInput, /required: true/);
  const modeInput = dispatch.split('      mode:\n')[1];
  assert.ok(modeInput);
  assert.match(modeInput, /type: choice/);
  assert.match(modeInput, /default: posting-smoke/);
  const options = modeInput.match(/^ {8}options:\n((?:^ {10}- .+\n?)+)/m)?.[1];
  assert.ok(options);
  assert.deepEqual(
    options
      .trim()
      .split('\n')
      .map((line) => line.trim().replace(/^- /, ''))
      .sort(),
    ['direct-review', 'posting-smoke'],
  );
});

test('review context gates dispatch to the default branch and validates inputs', () => {
  const context = workflow
    .split('  review-context:\n')[1]
    ?.split('\n  claude-review:')[0];
  assert.ok(context);
  const condition = context.split('    if:')[1]?.split('    runs-on:')[0];
  assert.ok(condition);
  assert.match(condition, /github\.event_name == 'workflow_dispatch'/);
  assert.match(condition, /github\.ref(?:_name)?/);
  assert.match(condition, /github\.event\.repository\.default_branch/);
  assert.match(context, /\^\[1-9\]\[0-9\]\*\$/);
  for (const mode of ['posting-smoke', 'direct-review', 'slash-review']) {
    assert.ok(context.includes(mode), `Context must handle ${mode}`);
  }
  assert.match(context, /exit 1/);
  for (const output of ['pr', 'mode']) {
    assert.match(
      context,
      new RegExp(
        `^ {6}${output}: \\$\\{\\{ steps\\.[\\w-]+\\.outputs\\.${output} \\}\\}`,
        'm',
      ),
    );
  }
});

test('posting-smoke checks out workflow code and skips dependency setup', () => {
  const checkout = workflowStep('Checkout review commit');
  assert.match(
    checkout,
    /ref: \$\{\{ needs\.review-context\.outputs\.mode == 'posting-smoke' && github\.workflow_sha \|\| needs\.review-context\.outputs\.sha \}\}/,
  );
  for (const name of [
    'Install pnpm',
    'Setup Node.js',
    'Install dependencies',
  ]) {
    assert.match(
      workflowStep(name),
      /^ {8}if: needs\.review-context\.outputs\.mode != 'posting-smoke'$/m,
      `${name} must not execute PR dependency setup during posting-smoke`,
    );
  }
});

test('direct-review restores exactly the eight trusted configuration paths', () => {
  const step = workflowStep('Restore trusted dispatch configuration');
  assert.match(
    step,
    /^ {8}if: needs\.review-context\.outputs\.mode == 'direct-review'$/m,
  );
  assert.match(
    step,
    /^ {10}TRUSTED_CONFIG_SHA: \$\{\{ github\.workflow_sha \}\}$/m,
  );
  const script = restoreScript();
  const paths = script.match(/^for path in (.+); do$/m)?.[1];
  assert.ok(paths);
  assert.deepEqual(paths.split(' '), trustedConfigPaths);
  assert.ok(script.includes('rm -rf -- "$path"'));
  assert.ok(script.includes('git cat-file -e "$TRUSTED_CONFIG_SHA:$path"'));
  assert.ok(
    script.includes(
      'git restore --source "$TRUSTED_CONFIG_SHA" --staged --worktree -- "$path"',
    ),
  );
  assert.ok(
    workflow.indexOf('      - name: Restore trusted dispatch configuration\n') <
      workflow.indexOf('      - name: PR Review\n'),
    'Trusted configuration must be restored before the action reads it',
  );
});

test('restore Bash replaces PR configuration and removes PR-only hooks and files', () => {
  const fixture = gitFixture();
  after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  const trusted = {
    '.claude/settings.json': '{"permissions":{"allow":[]}}\n',
    '.claude/agents/trusted.md': 'Trusted agent instructions\n',
    '.claude.json': '{"trusted":true}\n',
    '.ripgreprc': '--hidden\n',
    'CLAUDE.md': 'Trusted repository instructions\n',
    '.husky/pre-commit': '#!/bin/sh\nexit 0\n',
  };
  for (const [path, content] of Object.entries(trusted))
    fixture.write(path, content);
  fixture.write('src/app.ts', 'export const value = "trusted";\n');
  const trustedSha = fixture.commit('fixture: add trusted configuration');
  for (const path of Object.keys(trusted))
    fixture.write(path, 'MALICIOUS_PR_CONFIG\n');
  const prOnly = [
    '.claude/hooks/malicious.sh',
    '.claude/settings.local.json',
    '.mcp.json',
    '.gitmodules',
    'CLAUDE.local.md',
    '.husky/malicious-hook',
  ];
  for (const path of prOnly) fixture.write(path, 'MALICIOUS_PR_ONLY_CONFIG\n');
  const prCode = 'export const value = "PR code must remain";\n';
  fixture.write('src/app.ts', prCode);
  const prSha = fixture.commit('fixture: add untrusted PR configuration');

  fixture.restore(trustedSha);

  for (const [path, content] of Object.entries(trusted)) {
    assert.equal(
      readFileSync(join(fixture.repository, path), 'utf8'),
      content,
      path,
    );
    assert.equal(fixture.git('show', `:${path}`), content.trim(), path);
  }
  for (const path of prOnly) {
    assert.equal(existsSync(join(fixture.repository, path)), false, path);
  }
  assert.deepEqual(
    readdirSync(join(fixture.repository, '.claude'), {
      recursive: true,
    }).sort(),
    ['agents', 'agents/trusted.md', 'settings.json'],
  );
  assert.deepEqual(readdirSync(join(fixture.repository, '.husky')), [
    'pre-commit',
  ]);
  assert.equal(
    readFileSync(join(fixture.repository, 'src/app.ts'), 'utf8'),
    prCode,
  );
  assert.equal(fixture.git('rev-parse', 'HEAD'), prSha);
});

test('restore Bash replaces a PR .claude symlink without deleting its outside target', () => {
  const fixture = gitFixture();
  after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  fixture.write('.claude/settings.json', '{"trusted":true}\n');
  const trustedSha = fixture.commit(
    'fixture: add trusted Claude configuration',
  );
  const outside = join(fixture.directory, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'keep.txt'), 'OUTSIDE_TARGET_MUST_SURVIVE\n');
  rmSync(join(fixture.repository, '.claude'), { recursive: true });
  symlinkSync(outside, join(fixture.repository, '.claude'));
  fixture.write('.mcp.json', 'MALICIOUS_PR_ONLY_CONFIG\n');
  fixture.commit('fixture: replace configuration with a symlink');
  assert.equal(
    lstatSync(join(fixture.repository, '.claude')).isSymbolicLink(),
    true,
  );

  fixture.restore(trustedSha);

  assert.equal(
    lstatSync(join(fixture.repository, '.claude')).isSymbolicLink(),
    false,
  );
  assert.equal(
    readFileSync(join(fixture.repository, '.claude/settings.json'), 'utf8'),
    '{"trusted":true}\n',
  );
  assert.equal(existsSync(join(fixture.repository, '.mcp.json')), false);
  assert.deepEqual(readdirSync(outside), ['keep.txt']);
  assert.equal(
    readFileSync(join(outside, 'keep.txt'), 'utf8'),
    'OUTSIDE_TARGET_MUST_SURVIVE\n',
  );
});

test('review action explicitly disables full output and the SDK debug override', () => {
  const action = workflowStep('PR Review');
  const env = action.split('        env:\n')[1]?.split('        with:\n')[0];
  assert.ok(
    env,
    'Debug override must be disabled in the action step environment',
  );
  assert.match(env, /^ {10}ACTIONS_STEP_DEBUG: ["']false["']$/m);
  const inputs = action.split('        with:\n')[1];
  assert.ok(inputs);
  assert.match(inputs, /^ {10}show_full_output: false$/m);
});

test('prompt selection receives pinned context and retains the review instructions', () => {
  const step = workflowStep('Select review prompt');
  assert.match(step, /^ {8}id: review-prompt$/m);
  for (const variable of [
    ...Object.keys(reviewEnv),
    'REVIEW_MODE',
    'REVIEW_INSTRUCTIONS',
  ]) {
    assert.match(step, new RegExp(`^ {10}${variable}:`, 'm'));
  }
  assert.match(step, /needs\.review-context\.outputs\.mode/);
  assert.match(step, /needs\.review-context\.outputs\.pr/);
  assert.match(step, /needs\.review-context\.outputs\.sha/);
  assert.match(step, /needs\.review-context\.outputs\.base/);
  for (const rule of [
    'Do not replace it with a newer SHA.',
    'git rev-parse HEAD',
    'git checkout --detach',
    'git diff',
    '5-minute total budget',
    'gh run list',
    'gh run watch',
    'gh run view',
    'Recheck the PR head before posting',
    'gh pr comment',
    '__REVIEW_COMPLETION_MARKER__',
    'Include the completion marker only after completing the code review.',
  ]) {
    assert.ok(step.includes(rule), `Pinned instructions must retain: ${rule}`);
  }
});

test('slash-review leads with the command and includes pinned instructions', () => {
  const { prompt, marker } = runPrompt('slash-review');
  assert.equal(marker, expectedMarker());
  assert.ok(
    prompt.startsWith(
      `/review-pr REPO: ${reviewEnv.REVIEW_REPO} PR_NUMBER: ${reviewEnv.REVIEW_PR}\n`,
    ),
  );
  assert.ok(
    prompt.includes(
      instructions.replace('__REVIEW_COMPLETION_MARKER__', marker),
    ),
  );
  assert.doesNotMatch(
    prompt,
    /__REVIEW_COMPLETION_MARKER__|claude-publication-smoke/,
  );
});

test('direct-review requests all five agents without a leading slash command', () => {
  const { prompt, marker } = runPrompt('direct-review');
  assert.equal(marker, expectedMarker());
  assert.doesNotMatch(prompt.trimStart(), /^\//);
  for (const reviewer of reviewers)
    assert.ok(prompt.includes(reviewer), reviewer);
  assert.ok(
    prompt.includes(
      instructions.replace('__REVIEW_COMPLETION_MARKER__', marker),
    ),
  );
  assert.doesNotMatch(
    prompt,
    /__REVIEW_COMPLETION_MARKER__|claude-publication-smoke/,
  );
});

test('posting-smoke requests one exact publication command without review work', () => {
  const { prompt, marker } = runPrompt('posting-smoke');
  assert.equal(
    marker,
    expectedMarker('Diagnostic marker: claude-publication-smoke'),
  );
  assert.doesNotMatch(prompt.trimStart(), /^\//);
  assert.doesNotMatch(
    prompt,
    /__REVIEW_COMPLETION_MARKER__|Review marker:|claude-review\//,
  );
  for (const reviewer of reviewers)
    assert.ok(!prompt.includes(reviewer), reviewer);
  assert.ok(!prompt.includes(instructions));
  const commands = [...prompt.matchAll(/^\s*(gh pr comment\b)/gm)];
  assert.equal(
    commands.length,
    1,
    'Smoke must supply exactly one gh pr comment command',
  );
  const commandStart = commands[0].index + commands[0][0].indexOf('gh');
  const parsed = spawnSync(
    'python3',
    [
      '-c',
      [
        'import json, shlex, sys',
        'words = shlex.shlex(sys.stdin.read(), posix=True)',
        'words.whitespace_split = True',
        "words.commenters = ''",
        'print(json.dumps([next(words) for _ in range(8)]))',
      ].join('\n'),
    ],
    { input: prompt.slice(commandStart), encoding: 'utf8', timeout: 10_000 },
  );
  assert.equal(parsed.status, 0, parsed.stderr);
  const args: string[] = JSON.parse(parsed.stdout);
  assert.deepEqual(args.slice(0, 7), [
    'gh',
    'pr',
    'comment',
    reviewEnv.REVIEW_PR,
    '--repo',
    reviewEnv.REVIEW_REPO,
    '--body',
  ]);
  assert.equal(
    args[7].replace(/\n+/g, '\n'),
    `Claude publication smoke test — not a code review.\n${marker}`,
  );
  assert.match(
    prompt,
    /(?:do not|don't|no)[^\n.]*(?:inspect|read|review)[^\n.]*(?:code|files)|(?:do not|don't|no)[^\n.]*code inspection/i,
  );
  assert.match(prompt, /(?:do not|don't|no)[^\n.]*tests/i);
  assert.match(prompt, /(?:do not|don't|no)[^\n.]*(?:subagents|agents)/i);
});

test('selected output drives the action, diagnostics, and strict publication verifier', () => {
  const action = workflowStep('PR Review');
  assert.match(
    action,
    /uses: anthropics\/claude-code-action@34968b5981d5d170904281aa3df6f3c0d4a28855/,
  );
  assert.match(
    action,
    /prompt: \$\{\{ steps\.review-prompt\.outputs\.prompt \}\}/,
  );
  assert.ok(
    action.includes(
      '--allowedTools "Bash(pnpm:*),Bash(git:*),Bash(gh pr comment:*),Bash(gh pr view:*),Bash(gh run list:*),Bash(gh run view:*),Bash(gh run watch:*),Bash(sleep 15),mcp__github_inline_comment__create_inline_comment"',
    ),
  );
  const diagnostics = workflowStep('Summarize review execution');
  assert.match(
    diagnostics,
    /EXPECTED_PUBLICATION_MARKER: \$\{\{ steps\.review-prompt\.outputs\.marker \}\}/,
  );
  const verifier = workflowStep('Verify review publication');
  assert.match(
    verifier,
    /REVIEW_RUN_MARKER: \$\{\{ steps\.review-prompt\.outputs\.marker \}\}/,
  );
  assert.ok(verifier.includes('.user.login == "claude[bot]"'));
  assert.ok(verifier.includes('contains($marker)'));
});
