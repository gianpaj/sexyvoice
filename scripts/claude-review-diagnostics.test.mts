import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/claude.yml', import.meta.url),
  'utf8',
);
const step = workflow
  .split('      - name: Summarize review execution\n')[1]
  ?.split('      - name: Verify review publication')[0];
if (!step) {
  throw new Error('The workflow must include the diagnostics step');
}
const script = step
  .split("          python3 - <<'PY'\n")[1]
  ?.split('\n          PY')[0]
  ?.replace(/^ {10}/gm, '');
if (!script) {
  throw new Error('The diagnostics step must contain the Python script');
}

function runDiagnostics(
  execution: unknown,
  raw = false,
  env: NodeJS.ProcessEnv = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'claude-diagnostics-'));
  const executionFile = join(directory, 'claude-execution-output.json');
  const summaryFile = join(directory, 'summary.md');
  try {
    if (execution !== undefined) {
      writeFileSync(
        executionFile,
        raw ? String(execution) : JSON.stringify(execution),
      );
    }
    const result = spawnSync('python3', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPECTED_PUBLICATION_MARKER: undefined,
        ...env,
        CLAUDE_EXECUTION_FILE: executionFile,
        GITHUB_STEP_SUMMARY: summaryFile,
        RUNNER_TEMP: directory,
      },
    });
    if (result.status !== 0 || result.stderr) {
      throw new Error('Diagnostics must finish successfully without stderr');
    }
    return {
      diagnostics: JSON.parse(result.stdout),
      output: result.stdout + readFileSync(summaryFile, 'utf8'),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const reviewers = [
  'code-quality-reviewer',
  'performance-reviewer',
  'test-coverage-reviewer',
  'documentation-accuracy-reviewer',
  'security-code-reviewer',
];
const knownTools = [
  'Agent',
  'Task',
  'Skill',
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'mcp__github_inline_comment__create_inline_comment',
];

function reviewerValues(value: boolean | null | number) {
  return Object.fromEntries(reviewers.map((name) => [name, value]));
}

function toolRequest(name: unknown, input: unknown = {}) {
  return {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name, input }] },
  };
}

function commentRequest(id = 'publish') {
  return {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id,
          name: 'Bash',
          input: {
            command: "gh pr comment 635 --repo owner/repo --body 'SECRET_BODY'",
          },
        },
      ],
    },
  };
}

test('checks publication even when diagnostics or review execution fails', () => {
  assert.ok(
    / {6}- name: Verify review publication\n {8}if: \$\{\{ always\(\) \}\}/.test(
      workflow,
    ),
    'Publication verification must run regardless of earlier step outcomes',
  );
});

test('attempts diagnostics even when the review is skipped or cancelled', () => {
  assert.ok(
    /^ {8}if: \$\{\{ always\(\) \}\}/.test(step),
    'Diagnostics must not depend on a success or failure review outcome',
  );
});

test('counts a direct publication request and its successful tool result', () => {
  const { diagnostics, output } = runDiagnostics([
    commentRequest(),
    {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'publish',
            content: 'SECRET_TOOL_RESULT',
          },
        ],
      },
    },
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'SECRET_TEXT',
    },
  ]);
  assert.equal(diagnostics.execution_log, 'available');
  assert.equal(diagnostics.sdk_result, 'success');
  assert.deepEqual(diagnostics.direct_pr_comment_requests, {
    requested: 1,
    succeeded: 1,
    failed: 0,
    unconfirmed: 0,
  });
  assert.doesNotMatch(output, /SECRET/);
});

test('summarizes denials without exposing names outside the fixed allowlist', () => {
  const { diagnostics, output } = runDiagnostics([
    commentRequest(),
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      permission_denials: [
        {
          tool_name: 'Bash',
          tool_input: {
            command: "gh pr comment 635 --body 'SECRET_DENIED_BODY'",
          },
        },
        { tool_name: 'Skill', tool_input: { skill: 'SECRET_SKILL' } },
        { tool_name: '::error::SECRET_TOOL_NAME', tool_input: 'SECRET_INPUT' },
      ],
      result: 'SECRET_RESPONSE',
      errors: ['SECRET_ERROR'],
      session_id: 'SECRET_SESSION',
    },
  ]);
  assert.deepEqual(diagnostics.denied_tools, { Bash: 1, Skill: 1, other: 1 });
  assert.deepEqual(diagnostics.denied_bash_operations, { pr_comment: 1 });
  assert.equal(diagnostics.direct_pr_comment_requests.unconfirmed, 1);
  assert.doesNotMatch(output, /SECRET|::error::/);
});

test('counts failed publication results without printing their errors', () => {
  const { diagnostics, output } = runDiagnostics([
    commentRequest(),
    {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'publish',
            is_error: true,
            content: 'SECRET_DENIAL_REASON',
          },
        ],
      },
    },
  ]);
  assert.equal(diagnostics.sdk_result, 'missing');
  assert.equal(diagnostics.direct_pr_comment_requests.failed, 1);
  assert.equal(diagnostics.direct_pr_comment_requests.unconfirmed, 0);
  assert.doesNotMatch(output, /SECRET/);
});

test('does not mistake a mention of the publishing command for a direct request', () => {
  const request = commentRequest();
  request.message.content[0].input.command = 'echo "gh pr comment SECRET"';
  const { diagnostics, output } = runDiagnostics([request]);
  assert.equal(diagnostics.direct_pr_comment_requests.requested, 0);
  assert.doesNotMatch(output, /SECRET/);
});

test('counts assignment-prefixed publication requests and denials without leaking values', () => {
  for (const command of [
    "GH_TOKEN=SECRET_TOKEN gh pr comment 635 --body 'SECRET_BODY'",
    "env GH_TOKEN='SECRET TOKEN' gh pr comment 635 --body 'SECRET_BODY'",
    "A=SECRET_ONE B='SECRET TWO' env -- GH_TOKEN=SECRET_TOKEN gh pr comment 635 --body 'SECRET_BODY'",
  ]) {
    const request = commentRequest();
    request.message.content[0].input.command = command;
    const { diagnostics, output } = runDiagnostics([
      request,
      {
        type: 'result',
        subtype: 'success',
        permission_denials: [{ tool_name: 'Bash', tool_input: { command } }],
      },
    ]);
    assert.equal(diagnostics.direct_pr_comment_requests.requested, 1);
    assert.deepEqual(diagnostics.denied_bash_operations, { pr_comment: 1 });
    assert.doesNotMatch(output, /SECRET/);
  }
});

test('classifies the command prefix without parsing its heredoc body', () => {
  const request = commentRequest();
  request.message.content[0].input.command =
    "GH_TOKEN=SECRET_TOKEN gh pr comment 635 --body-file - <<'EOF'\nauthor's SECRET note\nEOF";
  const { diagnostics, output } = runDiagnostics([request]);
  assert.equal(diagnostics.direct_pr_comment_requests.requested, 1);
  assert.doesNotMatch(output, /SECRET/);
});

test('does not classify prefixed mentions, quoted executable names, or malformed commands as publication', () => {
  for (const command of [
    'GH_TOKEN=SECRET_TOKEN echo "gh pr comment"',
    'env GH_TOKEN=SECRET_TOKEN echo gh pr comment',
    'GH_TOKEN=SECRET_TOKEN "gh pr comment"',
    "GH_TOKEN='SECRET_UNTERMINATED gh pr comment",
  ]) {
    const request = commentRequest();
    request.message.content[0].input.command = command;
    const { diagnostics, output } = runDiagnostics([request]);
    assert.equal(diagnostics.direct_pr_comment_requests.requested, 0);
    assert.doesNotMatch(output, /SECRET/);
  }
});

test('reports a missing trace without printing its path', () => {
  const { diagnostics, output } = runDiagnostics(undefined);
  assert.equal(diagnostics.execution_log, 'missing');
  assert.doesNotMatch(output, /claude-diagnostics-/);
});

test('reports malformed JSON without echoing sensitive parser input', () => {
  const { diagnostics, output } = runDiagnostics('SECRET_INVALID_JSON', true);
  assert.equal(diagnostics.execution_log, 'invalid');
  assert.doesNotMatch(output, /SECRET/);
});

test('rejects a trace with an unexpected top-level shape', () => {
  const { diagnostics, output } = runDiagnostics({ error: 'SECRET_ERROR' });
  assert.equal(diagnostics.execution_log, 'invalid');
  assert.doesNotMatch(output, /SECRET/);
});

test('uses null registration fields when init metadata is unavailable', () => {
  for (const metadata of [
    {},
    { slash_commands: null, agents: null },
    { slash_commands: 'SECRET_REGISTRATION', agents: 'SECRET_AGENTS' },
    { slash_commands: {}, agents: {} },
  ]) {
    const { diagnostics, output } = runDiagnostics([
      { type: 'system', subtype: 'init', ...metadata },
    ]);
    assert.equal(diagnostics.registered_review_command, null);
    assert.deepEqual(diagnostics.registered_reviewers, reviewerValues(null));
    assert.doesNotMatch(output, /SECRET/);
  }
});

test('reports only exact fixed command and reviewer registrations', () => {
  for (const registered of [false, true]) {
    const { diagnostics, output } = runDiagnostics([
      {
        type: 'system',
        subtype: 'init',
        slash_commands: [
          ...(registered ? ['review-pr'] : []),
          '/review-pr',
          'review-pr SECRET_ARGUMENT',
          '::error::SECRET_COMMAND',
          null,
          { name: 'review-pr', secret: 'SECRET_METADATA' },
        ],
        agents: [
          ...(registered ? reviewers : []),
          ...reviewers.map((name) => `${name}-SECRET_SUFFIX`),
          '::error::SECRET_AGENT',
          null,
          { name: reviewers[0], secret: 'SECRET_METADATA' },
        ],
      },
    ]);
    assert.equal(diagnostics.registered_review_command, registered);
    assert.deepEqual(
      diagnostics.registered_reviewers,
      reviewerValues(registered),
    );
    assert.doesNotMatch(output, /SECRET|::error::/);
  }
});

test('keeps command and reviewer registration states independent', () => {
  const { diagnostics } = runDiagnostics([
    {
      type: 'system',
      subtype: 'init',
      slash_commands: [],
      agents: [reviewers[0], reviewers[2]],
    },
    { type: 'system', subtype: 'SECRET_NON_INIT', agents: reviewers },
  ]);
  assert.equal(diagnostics.registered_review_command, false);
  assert.deepEqual(diagnostics.registered_reviewers, {
    ...reviewerValues(false),
    [reviewers[0]]: true,
    [reviewers[2]]: true,
  });
});

test('counts review-pr Skill requests by the first whitespace-delimited word', () => {
  const { diagnostics, output } = runDiagnostics([
    ...[
      'review-pr',
      'review-pr SECRET_ARGUMENTS',
      '  review-pr\tSECRET_ARGUMENTS\nSECRET_ARGUMENTS',
      'review-pr\nSECRET_ARGUMENTS',
      '/review-pr',
      'review-pr-SECRET_SUFFIX',
      'SECRET_PREFIX review-pr',
      '',
      null,
      ['review-pr', 'SECRET_ARGUMENTS'],
      { secret: 'SECRET_SKILL' },
    ].map((skill) => toolRequest('Skill', { skill })),
    toolRequest('Skill', null),
    toolRequest('Skill', 'SECRET_INPUT'),
    toolRequest('Agent', { skill: 'review-pr' }),
    {
      type: 'user',
      message: {
        content: [
          { type: 'tool_use', name: 'Skill', input: { skill: 'review-pr' } },
        ],
      },
    },
  ]);
  assert.equal(diagnostics.review_pr_skill_requests, 4);
  assert.doesNotMatch(output, /SECRET/);
});

test('counts only fixed reviewer names requested through Agent or Task', () => {
  const requests = reviewers.flatMap((name) => [
    toolRequest('Agent', { subagent_type: name, prompt: 'SECRET_PROMPT' }),
    toolRequest('Task', { subagent_type: name, prompt: 'SECRET_PROMPT' }),
    toolRequest('Skill', { subagent_type: name }),
    toolRequest('Agent', { subagent_type: `${name} SECRET_ARGUMENT` }),
  ]);
  const { diagnostics, output } = runDiagnostics([
    ...requests,
    toolRequest('Agent', { subagent_type: '::error::SECRET_AGENT' }),
    toolRequest('Task', { subagent_type: ['SECRET_AGENT'] }),
    toolRequest('Agent', { subagent_type: { name: 'SECRET_AGENT' } }),
    toolRequest('Agent', null),
    toolRequest('Task', 'SECRET_INPUT'),
  ]);
  assert.deepEqual(diagnostics.reviewer_requests, reviewerValues(2));
  assert.doesNotMatch(output, /SECRET|::error::/);
});

test('counts and sequences only allowlisted tool names and other', () => {
  const names = [...knownTools, '::error::SECRET_TOOL', null, ['SECRET_TOOL']];
  const { diagnostics, output } = runDiagnostics([
    ...names.map((name) => toolRequest(name, { secret: 'SECRET_INPUT' })),
    {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'SECRET_TEXT' }] },
    },
    {
      type: 'user',
      message: { content: [{ type: 'tool_use', name: 'Read' }] },
    },
  ]);
  assert.deepEqual(diagnostics.tool_counts, {
    ...Object.fromEntries(knownTools.map((name) => [name, 1])),
    other: 3,
  });
  assert.deepEqual(diagnostics.tool_sequence, [
    ...knownTools,
    'other',
    'other',
    'other',
  ]);
  assert.equal(diagnostics.tool_sequence_truncated, false);
  assert.doesNotMatch(output, /SECRET|::error::/);
});

test('bounds the tool sequence at 40 without truncating aggregate counts', () => {
  for (const total of [0, 39, 40, 41, 75]) {
    const names = Array.from({ length: total }, (_, index) =>
      index % 2 === 0 ? 'Read' : 'SECRET_UNKNOWN_TOOL',
    );
    const { diagnostics, output } = runDiagnostics(
      names.map((name) => toolRequest(name)),
    );
    assert.deepEqual(
      diagnostics.tool_sequence,
      names.slice(0, 40).map((name) => (name === 'Read' ? name : 'other')),
    );
    assert.equal(diagnostics.tool_sequence_truncated, total > 40);
    assert.deepEqual(
      diagnostics.tool_counts,
      total === 0
        ? {}
        : { Read: Math.ceil(total / 2), other: Math.floor(total / 2) },
    );
    assert.doesNotMatch(output, /SECRET/);
  }
});

test('reports safe defaults when no execution trace can be read', () => {
  for (const execution of [undefined, 'SECRET_INVALID_JSON', {}]) {
    const { diagnostics } = runDiagnostics(
      execution,
      typeof execution === 'string',
    );
    assert.equal(diagnostics.registered_review_command, null);
    assert.deepEqual(diagnostics.registered_reviewers, reviewerValues(null));
    assert.equal(diagnostics.review_pr_skill_requests, 0);
    assert.deepEqual(diagnostics.reviewer_requests, reviewerValues(0));
    assert.deepEqual(diagnostics.tool_counts, {});
    assert.deepEqual(diagnostics.tool_sequence, []);
    assert.equal(diagnostics.tool_sequence_truncated, false);
    assert.equal(diagnostics.final_response_present, false);
    assert.equal(diagnostics.final_response_has_marker, false);
  }
});

test('uses only the last result response for presence and marker detection', () => {
  const marker = 'SECRET_EXPECTED_MARKER';
  for (const response of ['', null, false, 42, [], { secret: marker }]) {
    const { diagnostics, output } = runDiagnostics(
      [
        { type: 'result', subtype: 'success', result: marker },
        { type: 'result', subtype: 'success', result: response },
        { type: 'assistant', message: { content: marker } },
      ],
      false,
      { EXPECTED_PUBLICATION_MARKER: marker },
    );
    assert.equal(diagnostics.final_response_present, false);
    assert.equal(diagnostics.final_response_has_marker, false);
    assert.doesNotMatch(output, /SECRET/);
  }
  const { diagnostics } = runDiagnostics([
    { type: 'result', result: marker },
    { type: 'result' },
  ]);
  assert.equal(diagnostics.final_response_present, false);
  assert.equal(diagnostics.final_response_has_marker, false);
});

test('checks a nonempty expected marker without emitting hostile result text', () => {
  const marker = 'SECRET_EXPECTED_MARKER';
  const response = `::error::SECRET_RESULT\n\u001b[31m\n\x60\x60\x60\n${marker}\nSECRET_END`;
  for (const expected of [undefined, '', 'SECRET_MISMATCH', marker]) {
    const { diagnostics, output } = runDiagnostics(
      [
        { type: 'result', result: 'SECRET_EARLIER_RESULT' },
        { type: 'result', subtype: 'success', result: response },
        toolRequest('Read', { result: 'SECRET_TRAILING_INPUT' }),
      ],
      false,
      { EXPECTED_PUBLICATION_MARKER: expected },
    );
    assert.equal(diagnostics.final_response_present, true);
    assert.equal(diagnostics.final_response_has_marker, expected === marker);
    assert.doesNotMatch(output, /SECRET|::error::/);
    assert.ok(!output.includes('\u001b'));
  }
});

test('classifies existing and probe Bash denials without exposing arguments', () => {
  const cases: [string, string][] = [
    ['gh pr comment 731 --body SECRET_BODY', 'pr_comment'],
    ['gh pr view 731 --json SECRET_FIELD', 'pr_view'],
    ['gh pr diff 731 --repo SECRET_REPO', 'pr_diff'],
    ['gh api repos/SECRET_REPO/issues', 'gh_api'],
    ['gh run list --repo SECRET_REPO', 'ci_read'],
    ['gh run view SECRET_RUN', 'ci_read'],
    ['gh run watch SECRET_RUN', 'ci_read'],
    ['git diff SECRET_SHA', 'git'],
    ['pnpm test SECRET_FILE', 'pnpm'],
    ['sleep 15', 'sleep'],
    ...['cat', 'printf', 'echo', 'tee', 'touch'].map(
      (name): [string, string] => [`${name} SECRET_ARGUMENT`, 'file_io'],
    ),
    ...['bash', 'sh', 'zsh', '/bin/bash', '/bin/sh', '/bin/zsh'].map(
      (name): [string, string] => [
        `${name} -c 'gh pr comment 731 --body SECRET_BODY'`,
        'shell_wrapper',
      ],
    ),
    ['cd SECRET_DIRECTORY', 'shell_setup'],
    ['SECRET_PROGRAM SECRET_ARGUMENT', 'other'],
    ['gh pr SECRET_OPERATION', 'other'],
  ];
  for (const [command, category] of cases) {
    for (const prefix of ['', 'env -- SECRET_TOKEN=SECRET_VALUE ']) {
      const { diagnostics, output } = runDiagnostics([
        {
          type: 'result',
          permission_denials: [
            { tool_name: 'Bash', tool_input: { command: prefix + command } },
          ],
        },
      ]);
      assert.deepEqual(diagnostics.denied_bash_operations, { [category]: 1 });
      assert.doesNotMatch(output, /SECRET/);
    }
  }
});

test('handles unexpected nested content without printing it', () => {
  const { diagnostics, output } = runDiagnostics([
    null,
    { type: 'assistant', message: { content: 'SECRET_CONTENT' } },
    { type: 'result', subtype: 'SECRET_SUBTYPE', permission_denials: 'SECRET' },
  ]);
  assert.equal(diagnostics.sdk_result, 'other');
  assert.deepEqual(diagnostics.denied_tools, {});
  assert.doesNotMatch(output, /SECRET/);
});
