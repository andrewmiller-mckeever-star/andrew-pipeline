const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

function freshnessPct(results) {
  if (!results.length) return 'N/A';
  const n = results.filter((r) => r.publishedDate).length;
  return `${Math.round((n / results.length) * 100)}%`;
}

function avgSnippetLen(results) {
  if (!results.length) return 0;
  return Math.round(results.reduce((s, r) => s + r.snippet.length, 0) / results.length);
}

function avg(nums) {
  const valid = nums.filter((n) => n != null);
  if (!valid.length) return null;
  return Math.round(valid.reduce((s, n) => s + n, 0) / valid.length);
}

function cell(val, fallback = 'err') {
  return val != null ? String(val) : fallback;
}

async function generate(rows, competitorName) {
  const compName = competitorName || 'Competitor';
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // ── Per-query table ────────────────────────────────────────────────────────
  const header =
    `| # | Query | YDC Lat | ${compName} Lat | YDC Res | ${compName} Res ` +
    `| YDC Fresh | ${compName} Fresh | YDC Snip | ${compName} Snip | Winner |`;
  const divider =
    `|---|-------|---------|${'-'.repeat(compName.length + 4)}|---------|${'-'.repeat(compName.length + 4)}` +
    `|-----------|${'-'.repeat(compName.length + 7)}|----------|${'-'.repeat(compName.length + 6)}|--------|`;

  const tableRows = rows.map((row, i) => {
    const { ydc, comp, verdict } = row;
    const ydcLat  = ydc.latencyMs  != null ? `${ydc.latencyMs}ms`  : 'err';
    const compLat = comp.latencyMs != null ? `${comp.latencyMs}ms` : 'err';
    const winLabel =
      verdict.winner === 'ydc'        ? '✓ YDC'         :
      verdict.winner === 'competitor' ? `✓ ${compName}` :
      verdict.winner === 'tie'        ? '= Tie'          : '✗ err';

    return (
      `| ${i + 1} | ${row.query} ` +
      `| ${ydcLat} | ${compLat} ` +
      `| ${cell(ydc.results.length)} | ${cell(comp.results.length)} ` +
      `| ${freshnessPct(ydc.results)} | ${freshnessPct(comp.results)} ` +
      `| ${avgSnippetLen(ydc.results)} | ${avgSnippetLen(comp.results)} ` +
      `| ${winLabel} |`
    );
  });

  // ── Aggregate stats ────────────────────────────────────────────────────────
  const ydcLats  = rows.map((r) => r.ydc.latencyMs);
  const compLats = rows.map((r) => r.comp.latencyMs);
  const allYdc   = rows.flatMap((r) => r.ydc.results);
  const allComp  = rows.flatMap((r) => r.comp.results);

  const judgedRows  = rows.filter((r) => ['ydc', 'competitor', 'tie'].includes(r.verdict.winner));
  const ydcWins     = judgedRows.filter((r) => r.verdict.winner === 'ydc').length;
  const compWins    = judgedRows.filter((r) => r.verdict.winner === 'competitor').length;
  const ties        = judgedRows.filter((r) => r.verdict.winner === 'tie').length;
  const winPct = (n) =>
    judgedRows.length ? `${Math.round((n / judgedRows.length) * 100)}%` : 'N/A';

  const ydcAvgLat  = avg(ydcLats);
  const compAvgLat = avg(compLats);

  const aggTable = [
    `| Metric | You.com | ${compName} |`,
    `|--------|---------|${'-'.repeat(compName.length + 2)}|`,
    `| Avg latency | ${cell(ydcAvgLat, 'N/A')}ms | ${cell(compAvgLat, 'N/A')}ms |`,
    `| Freshness score | ${freshnessPct(allYdc)} | ${freshnessPct(allComp)} |`,
    `| Avg snippet length | ${avgSnippetLen(allYdc)} chars | ${avgSnippetLen(allComp)} chars |`,
    `| Relevance wins | ${ydcWins} (${winPct(ydcWins)}) | ${compWins} (${winPct(compWins)}) |`,
    `| Ties | ${ties} | — |`,
  ].join('\n');

  // ── LLM summary ───────────────────────────────────────────────────────────
  const verdictLines = rows
    .map((r) => `- "${r.query}": ${r.verdict.winner} — ${r.verdict.reasoning}`)
    .join('\n');

  const summaryPrompt =
    `You benchmarked two search APIs (You.com vs ${compName}) across ${rows.length} queries.\n\n` +
    `Aggregate results:\n` +
    `- You.com: avg latency ${cell(ydcAvgLat, 'N/A')}ms, freshness ${freshnessPct(allYdc)}, ` +
    `relevance wins ${ydcWins}/${judgedRows.length} (${winPct(ydcWins)})\n` +
    `- ${compName}: avg latency ${cell(compAvgLat, 'N/A')}ms, freshness ${freshnessPct(allComp)}, ` +
    `relevance wins ${compWins}/${judgedRows.length} (${winPct(compWins)})\n` +
    `- Ties: ${ties}\n\n` +
    `Per-query verdicts:\n${verdictLines}\n\n` +
    `Write a single paragraph (3–5 sentences) summarising the benchmark findings. ` +
    `Be specific and data-driven. Mention standout wins, weaknesses, and a bottom-line recommendation.`;

  let summary = '*(summary unavailable)*';
  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: summaryPrompt }],
    });
    summary = resp.content[0].text.trim();
  } catch (err) {
    summary = `*(summary error: ${err.message})*`;
  }

  // ── Assemble markdown ──────────────────────────────────────────────────────
  return [
    `# Search API Benchmark: You.com vs ${compName}`,
    `*Generated: ${now} UTC — ${rows.length} queries*`,
    '',
    '## Per-Query Results',
    '',
    header,
    divider,
    ...tableRows,
    '',
    '## Aggregate Statistics',
    '',
    aggTable,
    '',
    '## LLM Summary',
    '',
    summary,
    '',
    '---',
    `*Relevance judged by claude-haiku-4-5 with randomised A/B assignment to reduce position bias.*`,
  ].join('\n');
}

module.exports = { generate };
