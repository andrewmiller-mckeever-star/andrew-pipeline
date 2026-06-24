// Adapter registry — maps --competitor <name> to the right module
const ADAPTERS = {
  brave:      () => require('./brave'),
  bing:       () => require('./bing'),
  exa:        () => require('./exa'),
  tavily:     () => require('./tavily'),
  perplexity: () => require('./perplexity'),
  gemini:     () => require('./gemini'),
};

const AVAILABLE = Object.keys(ADAPTERS);

function load(name) {
  const factory = ADAPTERS[name?.toLowerCase()];
  if (!factory) {
    console.error(`Unknown competitor: "${name}"`);
    console.error(`Available: ${AVAILABLE.join(', ')}`);
    process.exit(1);
  }
  return factory();
}

module.exports = { load, AVAILABLE };
