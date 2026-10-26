const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createTurndown } = require('../turndown-factory');

function convert(html) {
  return createTurndown().turndown(html);
}

describe('turndown-factory P0 fixes', () => {
  it('should drop head, script and style content', () => {
    const md = convert('<html><head><title>T</title><style>.x{}</style><script>alert(1)</script></head><body><h1>Hi</h1><script>bad()</script><style>p{}</style></body></html>');
    assert.ok(md.includes('# Hi'), md);
    assert.ok(!md.includes('T'), md);
    assert.ok(!md.includes('.x{}'), md);
    assert.ok(!md.includes('alert(1)'), md);
    assert.ok(!md.includes('bad()'), md);
    assert.ok(!md.includes('p{}'), md);
  });

  it('should preserve inline formatting in table cells', () => {
    const md = convert('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><strong>x</strong></td><td><a href="https://e.test">link</a></td></tr></tbody></table>');
    assert.ok(md.includes('| **x** | [link](https://e.test) |'), md);
  });

  it('should escape pipes and convert breaks in table cells', () => {
    const md = convert('<table><tr><th>A|B</th><th>C</th></tr><tr><td>1<br>2</td><td>c</td></tr></table>');
    assert.ok(md.includes('| A\\|B | C |'), md);
    assert.ok(md.includes('| 1<br>2 | c |'), md);
    assert.ok(!md.includes('| 1  <br>2 |'), md);
  });

  it('should handle rows directly under table', () => {
    const md = convert('<table><tr><th>H</th></tr><tr><td>v</td></tr></table>');
    assert.ok(md.includes('| H |'), md);
    assert.ok(md.includes('| v |'), md);
  });
});
