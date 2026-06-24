const https = require('https');

const NAME = 'You.com';

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('JSON parse failed')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function normalizeHit(hit) {
  return {
    title: hit.title || '(no title)',
    url: hit.url || '',
    snippet: (hit.snippets && hit.snippets[0]) || hit.description || hit.snippet || '',
    publishedDate: hit.page_age || hit.published || hit.datePublished || null,
  };
}

async function search(query) {
  const apiKey = process.env.YDC_API_KEY;
  if (!apiKey) throw new Error('YDC_API_KEY not set');

  const body = JSON.stringify({ query });
  const start = Date.now();
  const data = await httpsPost(
    'ydc-index.io',
    '/v1/search',
    { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body
  );
  const latencyMs = Date.now() - start;

  // Handle both { hits: [...] } and { results: { web: [...] } } shapes
  const rawHits =
    (Array.isArray(data.hits) ? data.hits : null) ||
    (data.results && Array.isArray(data.results.web) ? data.results.web : null) ||
    (Array.isArray(data.results) ? data.results : null) ||
    [];

  return {
    results: rawHits.slice(0, 5).map(normalizeHit),
    latencyMs,
    rawCount: rawHits.length,
  };
}

module.exports = { search, NAME };
