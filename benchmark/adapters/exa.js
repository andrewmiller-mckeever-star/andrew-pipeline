const https = require('https');

const NAME = 'Exa';

function post(body, headers) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname: 'api.exa.ai',
        path: '/search',
        method: 'POST',
        headers: { ...headers, 'Content-Length': buf.length },
      },
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
    req.write(buf);
    req.end();
  });
}

function normalizeHit(hit) {
  return {
    title: hit.title || '(no title)',
    url: hit.url || '',
    snippet: hit.text || hit.summary || hit.extract || '',
    publishedDate: hit.publishedDate || null,
  };
}

async function search(query) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error('EXA_API_KEY not set');

  const start = Date.now();
  const data = await post(
    { query, numResults: 5, useAutoprompt: true, type: 'auto' },
    { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
  );
  const latencyMs = Date.now() - start;

  const rawHits = data.results || [];
  return { results: rawHits.slice(0, 5).map(normalizeHit), latencyMs, rawCount: rawHits.length };
}

module.exports = { search, NAME };
