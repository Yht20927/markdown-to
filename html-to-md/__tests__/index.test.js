const { describe, it } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cli = path.join(__dirname, '..', 'index.js');

function run(args) {
  return spawnSync(process.execPath, [cli, 'convert', ...args], { encoding: 'utf-8' });
}

describe('html-to-md CLI', () => {
  it('converts HTML and preserves KaTeX, tasks, and table alignment', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'html-to-md-'));
    const input = path.join(dir, 'input.html');
    const output = path.join(dir, 'output.md');
    fs.writeFileSync(input, '\n    <p>Math <span class="katex"><annotation encoding="application/x-tex">x_i</annotation><span>x</span></span></p><ul><li><input checked type="checkbox"> done</li></ul><table><tr><th align="right">R</th></tr><tr><td>1</td></tr></table>');
    const result = run(['-i', input, '-o', output]);
    assert.strictEqual(result.status, 0, result.stderr);
    const md = fs.readFileSync(output, 'utf-8');
    assert.ok(!md.startsWith(' '), md);
    assert.ok(md.includes('$x_i$'), md);
    assert.ok(md.includes('[x] done'), md);
    assert.ok(md.includes('| ---: |'), md);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports a missing input without a stack trace', () => {
    const result = run(['-i', '/tmp/html-to-md-does-not-exist.html', '-o', '/tmp/out.md']);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Input file not found/);
    assert.doesNotMatch(result.stderr, /\n\s+at /);
  });
});
