/**
 * Tests for shared/md-table-parser.js — Markdown table parser
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseTables, splitTableCells, parseAlignment, isSeparatorRow } = require('../md-table-parser');

describe('splitTableCells', () => {
  it('should split a simple row', () => {
    assert.deepStrictEqual(splitTableCells('| a | b | c |'), ['a', 'b', 'c']);
  });

  it('should preserve empty cells (P0-1)', () => {
    assert.deepStrictEqual(splitTableCells('| a |  | c |'), ['a', '', 'c']);
  });

  it('should handle escaped pipes (P0-2)', () => {
    const cells = splitTableCells('| a\\|b | c |');
    assert.strictEqual(cells[0], 'a|b');
    assert.strictEqual(cells[1], 'c');
  });

  it('should trim whitespace in cells', () => {
    assert.deepStrictEqual(splitTableCells('|  a  |  b  |'), ['a', 'b']);
  });
});

describe('parseAlignment', () => {
  it('should detect left alignment', () => {
    assert.strictEqual(parseAlignment(':---'), 'left');
  });

  it('should detect center alignment', () => {
    assert.strictEqual(parseAlignment(':---:'), 'center');
  });

  it('should detect right alignment', () => {
    assert.strictEqual(parseAlignment('---:'), 'right');
  });

  it('should detect no alignment', () => {
    assert.strictEqual(parseAlignment('---'), null);
  });
});

describe('isSeparatorRow', () => {
  it('should identify separator rows', () => {
    assert.ok(isSeparatorRow('| --- | --- |'));
    assert.ok(isSeparatorRow('| :--- | ---: |'));
    assert.ok(isSeparatorRow('| :---: |'));
  });

  it('should not identify data rows', () => {
    assert.ok(!isSeparatorRow('| a | b |'));
    assert.ok(!isSeparatorRow('# Heading'));
  });
});

describe('parseTables', () => {
  it('should parse a simple table', () => {
    const tables = parseTables('| a | b |\n| --- | --- |\n| 1 | 2 |');
    assert.strictEqual(tables.length, 1);
    assert.deepStrictEqual(tables[0].headers, ['a', 'b']);
    assert.deepStrictEqual(tables[0].rows, [['1', '2']]);
  });

  it('should parse multiple tables', () => {
    const tables = parseTables('| a |\n| - |\n| 1 |\n\ntext\n\n| x |\n| - |\n| y |');
    assert.strictEqual(tables.length, 2);
  });

  it('should detect alignments', () => {
    const tables = parseTables('| L | C | R |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |');
    assert.deepStrictEqual(tables[0].aligns, ['left', 'center', 'right']);
  });

  it('should handle empty cells', () => {
    const tables = parseTables('| a |  | c |\n| --- | --- | --- |\n| 1 |  | 3 |');
    assert.deepStrictEqual(tables[0].headers, ['a', '', 'c']);
    assert.deepStrictEqual(tables[0].rows[0], ['1', '', '3']);
  });

  it('should handle tables without alignment row', () => {
    const tables = parseTables('| a | b |\n| 1 | 2 |');
    assert.strictEqual(tables.length, 0); // no separator row = not matched by regex
  });

  it('should return empty array for no tables', () => {
    const tables = parseTables('just text\nno table here');
    assert.strictEqual(tables.length, 0);
  });

  it('should handle escaped pipes in cells', () => {
    const tables = parseTables('| a\\|b | c |\n| --- | --- |\n| x\\|y | z |');
    assert.strictEqual(tables[0].headers[0], 'a|b');
    assert.strictEqual(tables[0].rows[0][0], 'x|y');
  });

  it('should parse tables without outer pipes', () => {
    const tables = parseTables('a | b\n--- | ---\n1 | 2');
    assert.strictEqual(tables.length, 1);
    assert.deepStrictEqual(tables[0].headers, ['a', 'b']);
    assert.deepStrictEqual(tables[0].rows, [['1', '2']]);
  });

  it('should not parse tables inside fenced code', () => {
    const tables = parseTables('```md\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```');
    assert.strictEqual(tables.length, 0);
  });

  it('should not merge adjacent tables', () => {
    const tables = parseTables('| a |\n| --- |\n| 1 |\n| b |\n| --- |\n| 2 |');
    assert.strictEqual(tables.length, 2);
    assert.deepStrictEqual(tables[0].headers, ['a']);
    assert.deepStrictEqual(tables[1].headers, ['b']);
  });

  it('should pad short rows to the header width', () => {
    const tables = parseTables('| a | b |\n| --- | --- |\n| 1 |');
    assert.deepStrictEqual(tables[0].rows[0], ['1', '']);
  });
});
