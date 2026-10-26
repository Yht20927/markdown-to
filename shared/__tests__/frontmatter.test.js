const test = require('node:test');
const assert = require('node:assert/strict');
const { stripFrontmatter } = require('../frontmatter');

test('frontmatter: strips a leading YAML block', () => {
  const md = '---\ntitle: Doc\nauthor: Me\n---\n# Heading\n\nBody\n';
  assert.equal(stripFrontmatter(md), '# Heading\n\nBody\n');
});

test('frontmatter: handles CRLF and a BOM', () => {
  const md = '\uFEFF---\r\ntitle: Doc\r\n---\r\n\r\nBody\r\n';
  assert.equal(stripFrontmatter(md), 'Body\r\n');
});

test('frontmatter: supports ... as the closing delimiter', () => {
  assert.equal(stripFrontmatter('---\ntitle: Doc\n...\nBody'), 'Body');
});

test('frontmatter: leaves text without a closing delimiter untouched', () => {
  const md = '---\ntitle: Doc\n# Heading\n';
  assert.equal(stripFrontmatter(md), md);
});

test('frontmatter: does not treat a thematic break as frontmatter', () => {
  const md = '---\n\nBody\n';
  assert.equal(stripFrontmatter(md), md);
});

test('frontmatter: supports an empty body', () => {
  assert.equal(stripFrontmatter('---\ntitle: Doc\n---\n'), '');
});

test('frontmatter: non-string input is returned unchanged', () => {
  assert.equal(stripFrontmatter(null), null);
});
