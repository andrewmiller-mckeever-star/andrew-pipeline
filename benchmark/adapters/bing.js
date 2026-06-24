const https = require('https');

const NAME = 'Bing';

function get(path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.bing.microsoft.com', path, method: 'GET', headers },
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
    title: hit.name || '(no title)',
    url: hit.url || '',
    snippet: hit.snippet || hit.description || '',
    publishedDate: hit.datePublished || hit.dateLastCrawled || null,
  };
}

async function search(query) {
  const apiKey = process.env.BING_API_KEY;
  if (!apiKey) throw new Error('BING_API_KEY not set');

  const path = `/v7.0/search?q=${encodeURIComponent(query)}&count=5&mkt=en-US&responseFilter=Webpages`;
  const start = Date.now();
  const data = await get(path, { 'Ocp-Apim-Subscription-Key': apiKey });
  const latencyMs = Date.now() - start;

  const rawHits = data.webPages?.value || [];
  return { results: rawHits.slice(0, 5).map(normalizeHit), latencyMs, rawCount: rawHits.length };
}

module.exports = { search, NAME };
