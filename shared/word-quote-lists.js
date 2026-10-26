const MAX_DEPTH = 5;

const quoteListChains = [];
for (let depth = 1; depth <= MAX_DEPTH; depth++) {
  for (let mask = 0; mask < 2 ** depth; mask++) {
    quoteListChains.push(Array.from({ length: depth }, (_, index) => (
      (mask & (1 << index)) ? 'ol' : 'ul'
    )));
  }
}

function quoteListStyleName(chain) {
  return `Quote ${chain.map((tag) => (tag === 'ol' ? 'Ordered' : 'Bullet')).join(' ')}`;
}

function quoteListStyleId(chain) {
  return `Quote${chain.map((tag) => (tag === 'ol' ? 'Ol' : 'Ul')).join('')}`;
}

function quoteListPath(chain) {
  return chain.map((tag) => `${tag} > li`).join(' > ');
}

module.exports = { quoteListChains, quoteListStyleName, quoteListStyleId, quoteListPath };
