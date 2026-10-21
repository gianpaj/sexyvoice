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

function runDiagnostics(execution: unknown, raw = false) {
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
