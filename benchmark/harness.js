require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs       = require('fs');
const path     = require('path');
const youcom   = require('./adapters/youcom');
const registry = require('./adapters/competitor');
const judge    = require('./judge');
const { generate: generateReport } = require('./report');

// Parse --competitor <name> from argv
const flagIdx = process.argv.indexOf('--competitor');
const competitorName = flagIdx !== -1 ? process.argv[flagIdx + 1] : null;

if (!competitorName) {
  console.log('\nUsage:  node harness.js --competitor <name>');
  console.log(`Options: ${registry.AVAILABLE.join(', ')}\n`);
  process.exit(0);
}

const competitor = registry.load(competitorName);

const QUERIES_FILE = path.join(__dirname, 'queries.txt');
const REPORT_FILE  = path.join(__dirname, 'report.md');

function loadQueries() {
  if (!fs.existsSync(QUERIES_FILE)) {
    console.error(`ERROR: ${QUERIES_FILE} not found.`);
    console.error('Create it with one search query per line (up to 10).');
    process.exit(1);
  }
  const queries = fs
    .readFileSync(QUERIES_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .slice(0, 10);

  if (!queries.length) {
    console.error('ERROR: No queries found in queries.txt');
    process.exit(1);
  }
  return queries;
}

function pad(str, len) {
  return String(str).slice(0, len).padEnd(len);
}

async function runQuery(query, index, total) {
  const label = `[${String(index + 1).padStart(2)}/${total}]`;
  process.stdout.write(`${label} ${pad(query, 55)} `);

  const [ydcSettled, compSettled] = await Promise.allSettled([
    youcom.search(query),
    competitor.search(query),
  ]);

  const ydc = ydcSettled.status === 'fulfilled'
    ? ydcSettled.value
    : { error: ydcSettled.reason.message, results: [], latencyMs: null, rawCount: 0 };

  const comp = compSettled.status === 'fulfilled'
    ? compSettled.value
    : { error: compSettled.reason.message, results: [], latencyMs: null, rawCount: 0 };

  let verdict = { winner: 'error', reasoning: 'One or both APIs failed' };
  if (ydc.results.length && comp.results.length) {
    verdict = await judge.compare(query, ydc.results, comp.results);
  }

  const winLabel = {
    ydc:        `✓ YDC`,
    competitor: `✓ ${competitor.NAME}`,
    tie:        `= tie`,
    error:      `✗ err`,
  }[verdict.winner] ?? verdict.winner;

  const ydcMs  = ydc.latencyMs  != null ? `${ydc.latencyMs}ms`  : 'err';
  const compMs = comp.latencyMs != null ? `${comp.latencyMs}ms` : 'err';
  console.log(`${pad(ydcMs, 7)} / ${pad(compMs, 7)}  ${winLabel}`);

  return { query, ydc, comp, verdict };
}

async function main() {
  const queries = loadQueries();

  console.log(`\n${'─'.repeat(80)}`);
  console.log(` Search API Benchmark: You.com  vs  ${competitor.NAME}`);
  console.log(`${'─'.repeat(80)}`);
  console.log(` Queries: ${queries.length}  |  Judge: claude-haiku-4-5  |  Report: ${REPORT_FILE}`);
  console.log(`${'─'.repeat(80)}\n`);

  const rows = [];
  for (let i = 0; i < queries.length; i++) {
    const row = await runQuery(queries[i], i, queries.length);
    rows.push(row);
  }

  console.log('\nGenerating report...');
  const markdown = await generateReport(rows, competitor.NAME);
  fs.writeFileSync(REPORT_FILE, markdown, 'utf8');

  // Print aggregate summary to console
  const judged   = rows.filter((r) => ['ydc', 'competitor', 'tie'].includes(r.verdict.winner));
  const ydcWins  = judged.filter((r) => r.verdict.winner === 'ydc').length;
  const compWins = judged.filter((r) => r.verdict.winner === 'competitor').length;
  const ties     = judged.filter((r) => r.verdict.winner === 'tie').length;

  console.log(`\n${'─'.repeat(80)}`);
  console.log(` Results: YDC ${ydcWins} wins  |  ${competitor.NAME} ${compWins} wins  |  ${ties} ties  (${judged.length} judged)`);
  console.log(`${'─'.repeat(80)}`);
  console.log(` Report written → ${REPORT_FILE}\n`);
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
