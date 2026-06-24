const https = require('https');

const NAME = 'Brave';

function get(path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.search.brave.com', path, method: 'GET', headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode !== 200)
            return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
          try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON parse failed')); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function normalizeHit(hit) {
  return {
    title: hit.title || '(no title)',
    url: hit.url || '',
    snippet: (hit.extra_snippets && hit.extra_snippets[0]) || hit.description || '',
    publishedDate: hit.page_age || hit.age || null,
  };
}

async function search(query) {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) throw new Error('BRAVE_API_KEY not set');

  const path = `/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&search_lang=en`;
  const start = Date.now();
  const data = await get(path, {
    'X-Subscription-Token': apiKey,
    'Accept': 'application/json',
    'Accept-Encoding': 'identity',
  });
  const latencyMs = Date.now() - start;

  const rawHits = data.web?.results || [];
  return { results: rawHits.slice(0, 5).map(normalizeHit), latencyMs, rawCount: rawHits.length };
}

module.exports = { search, NAME };
