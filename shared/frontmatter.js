/**
 * Strip YAML frontmatter from Markdown before conversion.
 *
 * This is intentionally a delimiter-based remover, not a YAML parser: the
 * converters do not currently consume frontmatter metadata, and leaving it in
 * the body corrupts output in every target format.
 */

const FRONTMATTER_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/**
 * @param {string} markdown
 * @returns {string} Markdown body without a leading YAML frontmatter block
 */
function stripFrontmatter(markdown) {
  if (typeof markdown !== 'string') return markdown;
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match) return markdown;
  return markdown.slice(match[0].length).replace(/^\r?\n/, '');
}

module.exports = { stripFrontmatter };
