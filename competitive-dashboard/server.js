require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = 3000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — research is slower, cache longer

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const cache = {};

function isFresh(entry) {
  return entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

// Build a competitive-intel query that asks for a mix of signals, not just funding
function buildQuery(company) {
  return (
    `${company} AI company competitive intelligence 2025-2026: ` +
    `product launches and new features, key partnerships and distribution deals, ` +
    `enterprise go-to-market moves, competitive positioning vs rivals, ` +
    `customer wins and market expansion. ` +
    `Include funding only when it signals a strategic direction. ` +
    `Prioritize signals that reveal competitive threat and product direction.`
  );
}

function researchYDC(query) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.YDC_API_KEY;
    if (!apiKey) return reject(new Error('YDC_API_KEY not set'));

    const body = JSON.stringify({ input: query }); // research API uses "input", not "query"
    const options = {
      hostname: 'api.you.com',
      path: '/v1/research',
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        if (res.statusCode !== 200)
          return reject(new Error(`API returned ${res.statusCode}: ${raw.slice(0, 200)}`));
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Failed to parse API response')); }
      });
    });

    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Research API timeout (90s)')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Section parsing ────────────────────────────────────────────────────────────

const LABEL_RULES = [
  [['PRODUCT', 'LAUNCH', 'PLATFORM', 'FEATURE', 'RELEASE'],   'Product'],
  [['PARTNERSHIP', 'DEAL', 'DISTRIBUTION', 'INTEGRATION'],     'Partnerships'],
  [['COMPETITIVE', 'POSITIONING', 'STRATEGY', 'MOVE'],         'Strategy'],
  [['CUSTOMER', 'MARKET', 'GROWTH', 'USER', 'TRACTION'],       'Market'],
  [['HIRING', 'PEOPLE', 'TEAM', 'LEADERSHIP', 'EXECUTIVE'],    'People'],
  [['FUNDING', 'REVENUE', 'FINANCIAL', 'VALUATION', 'SCALE'],  'Funding'],
  [['SUMMARY'],                                                  'Summary'],
];

function getSectionLabel(title) {
  const upper = title.toUpperCase();
  for (const [keywords, label] of LABEL_RULES) {
    if (keywords.some((k) => upper.includes(k))) return label;
  }
  return 'Intel';
}

// Priority order for display — funding last
const LABEL_ORDER = ['Product', 'Partnerships', 'Strategy', 'Market', 'People', 'Intel', 'Summary', 'Funding'];

function parseSections(content) {
  const sections = [];
  let current = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Section header: line IS its own uppercase (all-caps), ≥10 chars, no bullet prefix, no citations
    const isHeader =
      line.length >= 10 &&
      line === line.toUpperCase() &&
      !/^[-•–—]/.test(line) &&
      !/\[\[/.test(line);

    if (isHeader) {
      if (current && current.bullets.length) sections.push(current);
      const cleanTitle = line.replace(/\s*\([^)]*\)\s*$/, '').trim();
      current = { title: cleanTitle, label: getSectionLabel(cleanTitle), bullets: [] };
    } else if (current && /^[-•–—]/.test(line)) {
      // Match -, •, – (en-dash U+2013), — (em-dash U+2014)
      // The research API uses • for sub-section names and – for actual detail bullets
      const cleaned = line
        .replace(/^[-•–—]\s*/, '')
        .replace(/\s*\[\[\d+\]\]/g, '')  // strip [[n]] citation markers
        .replace(/‑/g, '-')              // normalize non-breaking hyphens
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (cleaned.length > 20) current.bullets.push(cleaned);
    }
  }
  if (current && current.bullets.length) sections.push(current);

  return sections.filter((s) => !/^SCOPE/i.test(s.title));
}

function extractResults(researchData) {
  const content = researchData.output?.content || '';
  const sources = researchData.output?.sources || [];

  const sections = parseSections(content);

  // Sort by priority — surface competitive signals before funding
  sections.sort((a, b) => {
    const ai = LABEL_ORDER.indexOf(a.label);
    const bi = LABEL_ORDER.indexOf(b.label);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  return sections.slice(0, 3).map((section, i) => {
    const src = sources[i] || sources[0] || {};
    const snippet = section.bullets.slice(0, 3).join(' • ');
    let source = '';
    let url = src.url || '#';
    try { source = new URL(url).hostname.replace('www.', ''); } catch {}

    return {
      title: section.title,
      label: section.label,
      snippet: snippet || '(no details extracted)',
      source,
      url,
    };
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────────

app.get('/api/search', async (req, res) => {
  const names = (req.query.companies || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (!names.length) return res.status(400).json({ error: 'No company names provided' });

  if (req.query.refresh === 'true') names.forEach((n) => delete cache[n]);

  const results = await Promise.all(
    names.map(async (name) => {
      if (isFresh(cache[name])) return { company: name, ...cache[name], cached: true };

      try {
        const apiData = await researchYDC(buildQuery(name));
        const results = extractResults(apiData);
        const entry = { results, fetchedAt: Date.now() };
        cache[name] = entry;
        return { company: name, ...entry, cached: false };
      } catch (err) {
        return { company: name, error: err.message, fetchedAt: Date.now(), cached: false };
      }
    })
  );

  res.json({ results });
});

app.delete('/api/cache', (_req, res) => {
  Object.keys(cache).forEach((k) => delete cache[k]);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Competitive dashboard running at http://localhost:${PORT}`);
  if (!process.env.YDC_API_KEY) console.warn('WARNING: YDC_API_KEY not set');
});
