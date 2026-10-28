/**
 * Unified placeholder system for all converters.
 * Uses NUL character prefix for zero collision risk with Markdown content.
 *
 * Replaces the old pattern of `<<CODEBLOCK_N>>`, `__FENCED_N__`, `<!--CB:N-->`
 * with a consistent format that survives all intermediate transformations.
 */

const PREFIX = '\x00'; // NUL character — never appears in Markdown

function make(tag, i) {
  return `${PREFIX}${tag}:${i}${PREFIX}`;
}

// Matches any placeholder: CB, IM, BM, CODEBLOCK, TABLE, FN, etc.
const RE = /\x00(CB|IM|BM|CODEBLOCK|MATHBLOCK|TABLE|FN|FNDEF|BOLD|BOLDITALIC|IC|FENCED|ESC):\d+\x00/g;

/**
 * Assert all placeholders have been restored. Throws if any remain.
 */
function assertAllRestored(text) {
  const leak = text.match(RE);
  if (leak) {
    throw new Error(`Placeholder leaked: ${leak.join(', ')}`);
  }
}

module.exports = { PREFIX, make, RE, assertAllRestored };
