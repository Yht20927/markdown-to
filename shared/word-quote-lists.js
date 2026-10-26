const MAX_DEPTH = 5;

const quoteListChains = [];
for (let depth = 1; depth <= MAX_DEPTH; depth++) {
  for (let mask = 0; mask < 2 ** depth; mask++) {
    quoteListChains.push(Array.from({ length: depth }, (_, index) => (
      (mask & (1 << index)) ? 'ol' : 'ul'
    )));
  }
}

function quoteListStyleName(chain, quoteDepth = 1) {
  const prefix = quoteDepth > 1 ? `Quote ${quoteDepth}` : 'Quote';
  return `${prefix} ${chain.map((tag) => (tag === 'ol' ? 'Ordered' : 'Bullet')).join(' ')}`;
}

function quoteListStyleId(chain, quoteDepth = 1) {
  const id = chain.map((tag) => (tag === 'ol' ? 'Ol' : 'Ul')).join('');
  return quoteDepth > 1 ? `Quote${quoteDepth}${id}` : `Quote${id}`;
}

function quoteListPath(chain, quoteDepth = 1) {
  return `${'blockquote > '.repeat(quoteDepth)}${chain.map((tag) => `${tag} > li`).join(' > ')}`;
}

module.exports = { quoteListChains, quoteListStyleName, quoteListStyleId, quoteListPath };
