const https = require('https');

const NAME = 'Gemini';
const MODEL = 'gemini-2.0-flash';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode !== 200)
            return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
          try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON parse failed')); }
        });
      }
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// Distribute answer sentences across grounding chunks
function buildResults(answer, chunks) {
  if (!chunks.length) {
    return [{ title: 'Gemini Answer', url: '', snippet: answer.slice(0, 400), publishedDate: null }];
  }

  const sentences = answer.match(/[^.!?\n]+[.!?\n]+/g) || [answer];
  const perChunk = Math.ceil(sentences.length / chunks.length);

  return chunks.slice(0, 5).map((chunk, i) => {
    const web = chunk.web || {};
    const snippet = sentences.slice(i * perChunk, (i + 1) * perChunk).join(' ').trim();
    return {
      title: web.title || web.uri || 'Result',
      url: web.uri || '',
      snippet: snippet || answer.slice(i * 150, (i + 1) * 150),
      publishedDate: null,
    };
  });
}

async function search(query) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const path = `/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const start = Date.now();
  const data = await post(path, {
    contents: [{ parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
  });
  const latencyMs = Date.now() - start;

  const candidate = data.candidates?.[0];
  const answer = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const results = buildResults(answer, chunks);

  return { results, latencyMs, rawCount: chunks.length };
}

module.exports = { search, NAME };
