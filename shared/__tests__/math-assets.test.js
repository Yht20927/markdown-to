const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildMathHeadExtras, inlineKatexCss, isDarkTemplate } = require('../math-assets');

describe('math-assets P0 fixes', () => {
  it('should inline KaTeX font files as data URIs', () => {
    const css = inlineKatexCss();
    assert.ok(css.length > 1000, 'KaTeX CSS should be present');
    assert.ok(css.includes('data:font/woff2;base64,'), 'fonts should be embedded');
    assert.doesNotMatch(css, /url\(['"]?fonts\//, 'no unresolved relative font URLs');
  });

  it('should include a highlight theme', () => {
    const light = buildMathHeadExtras({ dark: false });
    const dark = buildMathHeadExtras({ dark: true });
    assert.ok(light.includes('<style>'));
    assert.notStrictEqual(light, dark);
  });

  it('should detect dark templates from id or background', () => {
    assert.strictEqual(isDarkTemplate({ id: 'github-dark', colors: {} }), true);
    assert.strictEqual(isDarkTemplate({ id: 'x', colors: { background: '#0D1117' } }), true);
    assert.strictEqual(isDarkTemplate({ id: 'x', colors: { background: '#ffffff' } }), false);
  });
});
