import assert from 'node:assert/strict';
import { test } from 'node:test';

import { escapeCsv, parseCsv, toCsv } from './lib/csv.mts';

test('neutralizes spreadsheet formulas in CSV text', () => {
  assert.equal(
    escapeCsv('=HYPERLINK("https://example.com")'),
    '"\'=HYPERLINK(""https://example.com"")"',
  );
  assert.equal(escapeCsv('user@example.com'), 'user@example.com');
  assert.equal(escapeCsv('last, first'), '"last, first"');
  assert.equal(escapeCsv('-1+1'), "'-1+1");
  assert.equal(escapeCsv('+34@mail.example'), "'+34@mail.example");
});

test('keeps numbers numeric and blanks empty', () => {
  assert.equal(escapeCsv(-50), '-50');
  assert.equal(escapeCsv(true), 'true');
  assert.equal(escapeCsv(null), '');
  assert.equal(escapeCsv(undefined), '');
});

test('writes a header and one line per row', () => {
  assert.equal(
    toCsv(
      ['id', 'email'],
      [
        ['a', '=1'],
        ['b', null],
      ],
    ),
    "id,email\na,'=1\nb,\n",
  );
});

test('parses quoted commas, doubled quotes, newlines and CRLF', () => {
  const { columns, rows } = parseCsv(
    'source_id,end_reasons , note\r\n' +
      'a,"[""credit_limit""]","two\nlines"\r\n' +
      '\r\n' +
      'b,,plain\n',
  );

  assert.deepEqual(columns, ['source_id', 'end_reasons', 'note']);
  assert.deepEqual(rows, [
    { end_reasons: '["credit_limit"]', note: 'two\nlines', source_id: 'a' },
    { end_reasons: '', note: 'plain', source_id: 'b' },
  ]);
});

test('reads back what it writes', () => {
  const text = toCsv(
    ['name', 'value'],
    [
      ['comma, inside', 'quote " inside'],
      ['plain', 'x'],
    ],
  );
  assert.deepEqual(parseCsv(text).rows, [
    { name: 'comma, inside', value: 'quote " inside' },
    { name: 'plain', value: 'x' },
  ]);
});
