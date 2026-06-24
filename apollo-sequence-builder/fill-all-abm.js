#!/usr/bin/env node
/**
 * Fill ALL 5 remaining ABM Account Research Google Docs
 * Accounts: Atlassian, Reddit, Inception, HighRadius, Informatica
 * - Copies Bella's template for each account
 * - Fills in all research data via Find & Replace
 * - Sets text to black, restores white section headers
 */
const { chromium } = require('playwright');
const path = require('path');

const CHROME_USER_DATA = path.join(process.env.HOME, '.apollo-playwright-profile');
const SECTION_HEADERS = ['COMPANY SNAPSHOT','BUYING COMMITTEE','ACCOUNT INTELLIGENCE','OUTREACH PLAN','OPEN OPPORTUNITY'];

// Template doc IDs (Bella's originals)
const TEMPLATES = {
  atlassian:  '1tD7rCAjUMHn8f7Tcf4L29qDWuh4aWQZuplDvXCkyd8w',
  reddit:     '15lrF7YQw2lbP4OieZH_NQhy7do0Sob0X3ozJI6j2elU',
  inception:  '1K4TImLJlFQpKHhNkZE9KtlAR2-9Cx2fbOY6hjCzAIF0',
  highradius: '1hEl8uYdCf3-82ckXB2fUjzGaIpJp9FbJSxY1X1_mukE',
  informatica:'1b4Rg3TJxiLgG6RmC7sy8_pWQef6a2f3vwvkN7-8-7Ck',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function repAll(page, find, replace) {
  const fi = page.locator('input[aria-label="Find"]');
  const ri = page.locator('input[aria-label="Replace with"]');
  await fi.click({clickCount:3}); await fi.fill(find); await page.waitForTimeout(200);
  await ri.click({clickCount:3}); await ri.fill(replace); await page.waitForTimeout(200);
  const rb = page.locator('button').filter({hasText:/^Replace all$/});
  if (await rb.isEnabled().catch(()=>false)) { await rb.click(); await page.waitForTimeout(600); }
}
async function repOnce(page, find, replace) {
  const fi = page.locator('input[aria-label="Find"]');
  const ri = page.locator('input[aria-label="Replace with"]');
  await fi.click({clickCount:3}); await fi.fill(find); await page.waitForTimeout(200);
  await ri.click({clickCount:3}); await ri.fill(replace); await page.waitForTimeout(200);
  const rb = page.locator('button').filter({hasText:/^Replace$/}).first();
  if (await rb.isEnabled().catch(()=>false)) { await rb.click(); await page.waitForTimeout(400); }
}
// For long placeholders: replace unique SHORT end-portion with full text, then delete beginning
async function repLong(page, deleteChunks, replaceChunk, fullReplacement) {
  await repAll(page, replaceChunk, fullReplacement);
  for (const c of deleteChunks) await repAll(page, c, '');
}
async function fillContacts(page, contacts) {
  for (const [n]    of contacts) await repOnce(page, 'First Last', n);
  for (const [,t]   of contacts) await repOnce(page, 'VP / Director of...', t);
  for (const [,,e]  of contacts) await repOnce(page, 'email@company.com', e);
  for (const [,,,l] of contacts) await repOnce(page, 'linkedin.com/in/...', l);
  await repAll(page, 'Yes / No', 'No');
}
async function setColorBlack(page) {
  await page.keyboard.press('Meta+a'); await page.waitForTimeout(600);
  const btn = page.locator('[aria-label="Text color"]');
  const box = await btn.boundingBox().catch(()=>null);
  if (!box) return;
  await page.mouse.click(box.x + box.width - 4, box.y + box.height/2); await page.waitForTimeout(700);
  // Try aria-label first
  const black = page.locator('[aria-label="#000000"]').first();
  if (await black.isVisible().catch(()=>false)) { await black.click(); await page.waitForTimeout(500); return; }
  // Fallback: first cell in palette
  const pal = await page.locator('.docs-colormenuitems, .goog-palette').first().boundingBox().catch(()=>null);
  if (pal) { await page.mouse.click(pal.x + 11, pal.y + 11); await page.waitForTimeout(500); }
}
async function setHeadersWhite(page) {
  // Open F&R
  await page.keyboard.press('Meta+Shift+H'); await page.waitForTimeout(1200);
  const fi = page.locator('input[aria-label="Find"]');
  const nextBtn = page.locator('button').filter({hasText:/^Next$/});
  const colorBtn = page.locator('[aria-label="Text color"]');
  async function makeWhite(text) {
    await fi.click({clickCount:3}); await fi.fill(text); await page.waitForTimeout(300);
    if (!await nextBtn.isEnabled().catch(()=>false)) return;
    await nextBtn.click(); await page.waitForTimeout(400);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const box = await colorBtn.boundingBox().catch(()=>null);
    if (!box) return;
    await page.mouse.click(box.x + box.width - 4, box.y + box.height/2); await page.waitForTimeout(600);
    // Try aria-label for white
    const white = page.locator('[aria-label="#ffffff"], [aria-label="white"]').first();
    if (await white.isVisible().catch(()=>false)) { await white.click(); await page.waitForTimeout(400); }
    else {
      const pal = await page.locator('.docs-colormenuitems, .goog-palette').first().boundingBox().catch(()=>null);
      if (pal) { await page.mouse.click(pal.x + pal.width - 11, pal.y + 11); await page.waitForTimeout(400); }
    }
    // Re-open F&R
    await page.keyboard.press('Meta+Shift+H'); await page.waitForTimeout(800);
  }
  for (const h of SECTION_HEADERS) await makeWhite(h);
  await makeWhite('Full Name'); // buying committee column headers
  await page.keyboard.press('Escape');
}

// ─── ACCOUNT CONFIGS ──────────────────────────────────────────────────────────

async function fillAtlassian(page) {
  console.log('  Filling Atlassian...');
  await repAll(page,'Your name','Andrew Miller-McKeever');
  await repAll(page,'Generic Intro / Competitive Displacement / Trigger-News / Databricks Customer / Open Opportunity','Trigger / News-Based');
  await repAll(page,'MM/DD/YYYY','06/01/2026');
  await repAll(page,'https://...','https://www.atlassian.com');
  await repAll(page,'e.g. Fintech / Healthcare AI / Enterprise SaaS','Enterprise Collaboration & Developer Productivity Software');
  await repAll(page,'City, State / Country','Sydney, Australia (global HQ); San Francisco, CA (US HQ)');
  await repAll(page,'e.g. 500-1,000','~13,800 (FY2025)');
  await repAll(page,'e.g. Series C / Public / PE-backed','Public (NASDAQ: TEAM)');
  await repAll(page,'e.g. $50M raised Q3 2025','IPO — December 9, 2015');
  await repAll(page,'e.g. Andreessen Horowitz, Sequoia','Pre-IPO: Accel Partners ($60M Series C, 2010)');
  await repAll(page,'Year','2002');
  await repAll(page,'One or two sentences: what does this company do and why do they exist?',
    'Atlassian builds collaboration and productivity software — Jira, Confluence, Jira Service Management, Loom, Trello — used by software teams worldwide. Their AI platform, Rovo, provides enterprise search across Atlassian and 3rd-party SaaS, conversational AI chat, and agentic automation layered on their Teamwork Graph organizational knowledge layer. Revenue was $5.22B in FY2025 with 32% YoY revenue growth in Q3 FY2026.');
  await repLong(page,
    ['Shared investors, advisors, or board members? Team network overlaps (former '],
    'colleagues, mutual connections)? Note name, relationship, and whether an intro is worth pursuing.',
    'CONFIRMED DATABRICKS CUSTOMER — DB AE: Kyle Souders, status: Client Intro Made. PRIORITY path into account. Julien Bassan (Product Partnerships) replied 06/01/2026 — partnerships gatekeeper, not the API buyer. Run CTD for Taroon Mandhana (new CTO, ex-Meta/Microsoft).');
  await repLong(page,
    ['What problems are they likely experiencing that we solve? '],
    'What friction exists in their current stack or workflow? Reference job postings, reviews, or intel from Clay.',
    '1. Rovo Search lacks real-time external/web intelligence — only covers Atlassian ecosystem. 2. Rovo Deep Research now offers web search as optional add-on — clear signal they see the gap. 3. Rovo LLM backbone (OpenAI GPT, Claude, Gemini) is multi-model, but external retrieval layer is unsolved. 4. March 2026 10% layoffs — urgency to show ROI on AI spend. 5. New CTO Taroon Mandhana (March 2026) is in early evaluation mode for the AI stack.');
  await repLong(page,
    ['What makes them a strong ICP fit? '],
    "What specific value do we provide or problem do we solve for them? What's the hook?",
    "You.com's AI Search API powers the external web intelligence layer that Rovo's Deep Research and Rovo Agents are missing — grounding Atlassian's agentic workflows in real-time, cited web context without requiring Atlassian to build or maintain a web index. Position as the retrieval layer UNDERNEATH Rovo, not competing with it.");
  await fillContacts(page,[
    ['Taroon Mandhana','Chief Technology Officer (started March 2026)','tmandhana@atlassian.com','https://www.linkedin.com/in/taroonm'],
    ['Brendan Haire','VP Engineering, AI Platform and AI Chat/Agents','bhaire@atlassian.com','https://www.linkedin.com/in/brendanhaire'],
    ['Jamil Valliani','VP / Head of Product, AI','jvalliani@atlassian.com','https://www.linkedin.com/in/jamil-valliani-b131881'],
    ['Ryan Leask','VP, Data Science','rleask@atlassian.com','https://www.linkedin.com/in/ryanleask'],
    ['Tanya Chen','Senior VP of Engineering','tchen@atlassian.com','https://www.linkedin.com/in/tanyach'],
  ]);
  await repAll(page,'Competitor 1','AI/LLM');
  await repAll(page,'Competitor 2','Search / Knowledge Retrieval');
  await repAll(page,'Partner / Integration','Cloud Infrastructure');
  await repOnce(page,'e.g. SerpApi','OpenAI GPT (GPT-4 family), Anthropic Claude, Google Gemini 3 Flash');
  await repOnce(page,'e.g. SerpApi','Rovo Deep Research (web search add-on — direct gap)');
  await repOnce(page,'e.g. SerpApi','Google Cloud Platform (GKE, AI Hypercomputer)');
  await repOnce(page,'e.g. LinkedIn post, Clay','Atlassian publicly disclosed; multi-model LLM confirmed');
  await repOnce(page,'e.g. LinkedIn post, Clay','Atlassian Rovo features page: search the web if you ask it to');
  await repOnce(page,'e.g. LinkedIn post, Clay','April 2026 Google Cloud partnership announcement');
  await repOnce(page,'Confirmed / Suspected','High'); await repOnce(page,'Confirmed / Suspected','High'); await repOnce(page,'Confirmed / Suspected','High');
  await repOnce(page,'Displacement / Integration','Integration — multi-model arch aligns with You.com model-agnostic API');
  await repOnce(page,'Displacement / Integration','Integration — You.com is the external retrieval layer for Rovo agents');
  await repOnce(page,'Displacement / Integration','Integration — You.com API callable from GCP-hosted services');
  await repAll(page,'Funding','New Leadership');
  await repAll(page,'e.g. Raised Series B - $45M led by Accel Partners','Taroon Mandhana appointed CTO (March 2026, ex-Meta, ex-Microsoft). New CTO with fresh mandate during AI transformation — prime outreach window before locked into existing vendor relationships.');
  await repAll(page,'MM/YYYY','03/2026');
  await repAll(page,'Hot / Warm / Monitor','Hot');
  await repAll(page,'New Leadership','Earnings / AI Momentum');
  await repAll(page,'e.g. New VP of AI Engineering hired from Google DeepMind','Q3 FY2026 earnings (May 1, 2026): 32% revenue growth to $1.8B. Rovo usage growing 20%+ MoM. Stock jumped ~25% after earnings. AI search explicitly cited as revenue driver.');
  await repAll(page,'M\\&A / News','Product Expansion / Partnership');
  await repAll(page,'e.g. Acquired DataCo; expanding AI division to 3x headcount','Expanded Google Cloud partnership at Cloud Next 26 (April 22, 2026): Gemini 3 Flash now powers select Rovo capabilities; bidirectional MCP server integrations. Named 2026 Google Cloud Partner of Year.');
  await repAll(page,'e.g. Data + AI Summit','N/A');
  await repAll(page,'DD/MM/YYYY','N/A');
  await repAll(page,'Name / Title / Role (Sponsor / Speaker / Attendee)','N/A');
  await repAll(page,'e.g. Request meeting at booth','N/A');
  await repAll(page,'No / Yes – https://...','No');
  await repAll(page,'Yes / Not yet — planned start: MM/DD','Not yet — coordinate with Databricks AE Kyle Souders first');
  await repAll(page,'Connected / Pending / Not yet sent','Not yet sent');
  await repAll(page,'https://…','N/A');
  await repAll(page,'Yes / No – campaign name:','No');
  await repLong(page,['Write your 1-2 sentence personalized hook. Reference a specific piece of intel (news, competitor, event, or persona detail) that '],
    'makes this outreach relevant to THIS account right now.',
    "Taroon — congrats on stepping into the CTO role at a pivotal moment. Rovo's 20%+ monthly growth is a strong signal, but the one gap every enterprise AI search product hits is grounding agents in real-time external web intelligence — internal knowledge graphs answer what do we know, but not what's happening now in the market. You.com's AI Search API is how companies like yours add that layer without building or maintaining a web index. Given the Gemini/GCP partnership and your move into agentic workflows, there's a clean integration story. Worth a 20-minute call?");
  await repAll(page,'Any shared connections, investors, or advisors who could make an intro? Note name and relationship.',
    'PRIORITY: Databricks co-sell — Kyle Souders (DB AE) has already made a Client Intro. This is the fastest path to the engineering/product buyer. Julien Bassan (Partnerships) replied 06/01 but is a gatekeeper, not the API buyer.');
  await repLong(page,['Timing considerations, sensitivities, rep-specific tactics, '],
    'competitive objections to prepare for.',
    'DEDUP: 37 contacts already in SF, multiple active sequences running (WNBA Suite, AI Agent Conf, HumanX). Coordinate with Kyle Souders (Databricks AE) before any new outreach. Do NOT pursue Julien Bassan as the primary sales path. Tamar Yehoshua (CPO) is in SF and was sent WNBA invite 05/2026.');
  await repAll(page,'As it appears in Salesforce','N/A — no open opportunity');
  await repAll(page,'e.g. Discovery / Evaluation / Negotiation','N/A');
  await repAll(page,'e.g. $80K ARR','N/A');
  await repAll(page,'e.g. Technical demo scheduled / Proposal sent / Awaiting legal review','N/A');
  await repLong(page,['Names, titles, and roles in the decision '],'(Champion, Economic Buyer, Legal, Procurement, etc.)','N/A — no open opportunity. Key SF contacts: Tamar Yehoshua (CPO), Amit Apuntambekar (SVP Platform Eng), Ming Gong (Director Product Strategy), Rick Maharaj (Field CTO). Julien Bassan (Product Partnerships) replied 06/01.');
  await repLong(page,['What objections has the AE heard? '],'What is blocking progress? What competitors are being considered in parallel?','N/A — no open opportunity. PRIORITY: Coordinate with Databricks AE Kyle Souders before any outreach — Client Intro Made status. Active account with 37 SF contacts and 4+ sequences already run.');
  await repAll(page,'What does the AE need to move this deal forward? Case study, competitive one-pager, reference customer intro, tailored content, or other asset?','N/A — no open opportunity. When engaged: Rovo Deep Research integration angle + co-sell with Databricks as the approach. Reference Windsurf case study (AI coding agent with You.com).');
}

async function fillReddit(page) {
  console.log('  Filling Reddit...');
  await repAll(page,'Your name','Andrew Miller-McKeever');
  await repAll(page,'Generic Intro / Competitive Displacement / Trigger-News / Databricks Customer / Open Opportunity','Trigger / News-Based');
  await repAll(page,'MM/DD/YYYY','06/01/2026');
  await repAll(page,'https://...','https://www.reddit.com');
  await repAll(page,'e.g. Fintech / Healthcare AI / Enterprise SaaS','Social Media / User-Generated Content / AI Search');
  await repAll(page,'City, State / Country','San Francisco, CA');
  await repAll(page,'e.g. 500-1,000','2,555 (as of Dec 31, 2025)');
  await repAll(page,'e.g. Series C / Public / PE-backed','Public (NYSE: RDDT)');
  await repAll(page,'e.g. $50M raised Q3 2025','IPO — March 21, 2024; raised $748M; initial valuation ~$6.4B');
  await repAll(page,'e.g. Andreessen Horowitz, Sequoia','Pre-IPO: Andreessen Horowitz, Fidelity, Tencent; now publicly traded');
  await repAll(page,'Year','2005');
  await repAll(page,'One or two sentences: what does this company do and why do they exist?',
    "Reddit operates the world's largest online community platform (~1.5B+ posts across 100K+ subreddits). Revenue is primarily advertising ($2.06B of $2.2B total in 2025). Reddit is pivoting hard into AI-powered search via Reddit Answers (grew from 1M to 15M weekly users in 2025). In Q3 2026, Reddit will unify traditional search and Reddit Answers into a single AI-personalized experience.");
  await repLong(page,
    ['Shared investors, advisors, or board members? Team network overlaps (former '],
    'colleagues, mutual connections)? Note name, relationship, and whether an intro is worth pursuing.',
    'a16z invested pre-IPO — check for shared investor connections with You.com. Account is already HEAVILY worked in SF (65+ contacts, 6 sequences). Amit Puntambekar (CTO, joined Feb 2026) is the fresh entry point not yet touched in prior outreach. NOTE: Andrew previously flagged Reddit as potential swap — confirm with Nick before proceeding.');
  await repLong(page,['What problems are they likely experiencing that we solve? '],
    'What friction exists in their current stack or workflow? Reference job postings, reviews, or intel from Clay.',
    '1. Reddit Answers needs to deliver high-quality grounded answers from across the web — not just from Reddit corpus — to compete with Perplexity, Google AI Overviews, and ChatGPT Search. 2. Moving toward unified AI search by Q3 2026 — need real-time web search grounding beyond Reddit data. 3. Expanding Reddit Answers internationally (5 new languages Q4 2025) requires multilingual web search quality.');
  await repLong(page,['What makes them a strong ICP fit? '],
    "What specific value do we provide or problem do we solve for them? What's the hook?",
    "You.com's AI Search API can power Reddit Answers' web-grounding layer — giving Reddit's AI search access to real-time, high-quality web results and multi-source synthesis beyond Reddit's own corpus. Directly accelerates their Q3 2026 unified search roadmap.");
  await fillContacts(page,[
    ['Amit Puntambekar','CTO (joined Feb 2026, ex-Atlassian/Meta)','amit@reddit.com','https://www.linkedin.com/in/amitpuntambekar'],
    ['Matthew Snelham','VP of Engineering, Infrastructure','matthew.snelham@reddit.com','https://www.linkedin.com/in/msnelham'],
    ['Roelof Van Zwol','EVP, Ads Monetization, ML & Data Science','roelof.vanzwol@reddit.com','https://www.linkedin.com/in/roelofvanzwol'],
    ['Evan Ettinger','VP of Engineering, Reddit Ads','evan.ettinger@reddit.com','https://www.linkedin.com/in/evan-ettinger-4a88a515b'],
    ['Tomer Dekel','Director of Data Science & Analytics','tomer.dekel@reddit.com','https://www.linkedin.com/in/tomer-dekel-47733914'],
  ]);
  await repAll(page,'Competitor 1','Cloud / AI Platform');
  await repAll(page,'Competitor 2','AI Models / LLMs');
  await repAll(page,'Partner / Integration','AI Search / NLP');
  await repOnce(page,'e.g. SerpApi','Google Cloud / Vertex AI (official partnership expanded March 2025)');
  await repOnce(page,'e.g. SerpApi','OpenAI API (inferred from $70M/yr partnership)');
  await repOnce(page,'e.g. SerpApi','MeaningCloud (acquired June 2022 — NLP/content understanding)');
  await repOnce(page,'e.g. LinkedIn post, Clay','Official partnership announcement March 2025');
  await repOnce(page,'e.g. LinkedIn post, Clay','Reddit OpenAI partnership announcement');
  await repOnce(page,'e.g. LinkedIn post, Clay','Reddit acquisition records');
  await repOnce(page,'Confirmed / Suspected','High'); await repOnce(page,'Confirmed / Suspected','Medium'); await repOnce(page,'Confirmed / Suspected','High');
  await repOnce(page,'Displacement / Integration','Integration — You.com API complements Vertex AI by adding real-time web search grounding');
  await repOnce(page,'Displacement / Integration','Integration — You.com can layer in as web search grounding API alongside LLM powering Reddit Answers');
  await repOnce(page,'Displacement / Integration','Low relevance — NLP layer for moderation, not search retrieval');
  await repAll(page,'Funding','New Executive Hire');
  await repAll(page,'e.g. Raised Series B - $45M led by Accel Partners','Amit Puntambekar joined as CTO in late February 2026, coming from Atlassian and Meta. He is now accountable for accelerating product innovation through AI and ML and owns the Reddit Answers/AI search roadmap. New execs in first 90 days are the highest-conversion window.');
  await repAll(page,'MM/YYYY','02/2026');
  await repAll(page,'Hot / Warm / Monitor','Hot');
  await repAll(page,'New Leadership','Product Milestone / Roadmap');
  await repAll(page,'e.g. New VP of AI Engineering hired from Google DeepMind','Reddit announced it will unify traditional search and Reddit Answers into a single AI-personalized experience by Q3 2026. This is an active build requiring web search grounding infrastructure — live procurement window.');
  await repAll(page,'M\\&A / News','Revenue / Strategic Shift');
  await repAll(page,'e.g. Acquired DataCo; expanding AI division to 3x headcount','Reddit Answers grew 15x (1M to 15M weekly users) in 2025. CEO Steve Huffman called AI-powered search our next big opportunity and an enormous market.');
  await repAll(page,'e.g. Data + AI Summit','N/A');
  await repAll(page,'DD/MM/YYYY','N/A');
  await repAll(page,'Name / Title / Role (Sponsor / Speaker / Attendee)','N/A');
  await repAll(page,'e.g. Request meeting at booth','N/A');
  await repAll(page,'No / Yes – https://...','No');
  await repAll(page,'Yes / Not yet — planned start: MM/DD','Not yet — CONFIRM WITH NICK FIRST (flagged as potential swap); dedup 65+ SF contacts before enrolling');
  await repAll(page,'Connected / Pending / Not yet sent','Not yet sent');
  await repAll(page,'https://…','N/A');
  await repAll(page,'Yes / No – campaign name:','No');
  await repLong(page,['Write your 1-2 sentence personalized hook. Reference a specific piece of intel (news, competitor, event, or persona detail) that '],
    'makes this outreach relevant to THIS account right now.',
    "Amit just joined as CTO with an explicit mandate to accelerate product innovation through AI and ML — and Reddit Answers needs to cross from 15M to 150M weekly users. The gap between a great Reddit-native answer and a great internet answer is web search grounding. You.com's AI Search API is the fastest way to give Reddit Answers real-time web intelligence without rebuilding your retrieval stack from scratch.");
  await repAll(page,'Any shared connections, investors, or advisors who could make an intro? Note name and relationship.',
    'Run CTD tool for connections to Amit Puntambekar (new CTO, ex-Meta/Atlassian). a16z invested pre-IPO — check for shared investor introductions.');
  await repLong(page,['Timing considerations, sensitivities, rep-specific tactics, '],
    'competitive objections to prepare for.',
    'CONFIRM WITH NICK: Andrew previously flagged Reddit as swap candidate. DEDUP REQUIRED: 65+ contacts, 6 prior sequences. Review Reddit Outbound - Search & Deep Search APIs sequence results. Fresh angle: Amit Puntambekar (CTO, Feb 2026) was NOT part of prior outreach. Max Lu (Research Engineer) just enrolled in DAIS 2026 sequence today 06/01.');
  await repAll(page,'As it appears in Salesforce','N/A — no open opportunity');
  await repAll(page,'e.g. Discovery / Evaluation / Negotiation','N/A');
  await repAll(page,'e.g. $80K ARR','N/A');
  await repAll(page,'e.g. Technical demo scheduled / Proposal sent / Awaiting legal review','N/A');
  await repLong(page,['Names, titles, and roles in the decision '],'(Champion, Economic Buyer, Legal, Procurement, etc.)','N/A — no open opportunity. Key SF contacts: Maria Angelidou-Smith (CPO), Steve Huffman (CEO), Matthew Snelham (VP Engineering), Kumar Kittusamy (Product Lead Enterprise Data/LLM/Search), Ryan Gum (Staff PM Search Experience). 65+ contacts total.');
  await repLong(page,['What objections has the AE heard? '],'What is blocking progress? What competitors are being considered in parallel?','N/A — no open opportunity. HEAVY prior outreach: 6 sequences run including Reddit Outbound - Search & Deep Search APIs (Feb 2026). Multiple contacts already sequenced. Dedup thoroughly before new ABM sequence. Coordinate with Nick on whether Reddit is still a target account.');
  await repAll(page,'What does the AE need to move this deal forward? Case study, competitive one-pager, reference customer intro, tailored content, or other asset?','N/A — no open opportunity. When engaged: lead with the unified search Q3 2026 deadline as the urgent hook. DuckDuckGo case study (freshness, real-time updates) is the most relevant proof point for Reddit.');
}

async function fillInception(page) {
  console.log('  Filling Inception Labs...');
  await repAll(page,'Your name','Andrew Miller-McKeever');
  await repAll(page,'Generic Intro / Competitive Displacement / Trigger-News / Databricks Customer / Open Opportunity','Trigger / News-Based');
  await repAll(page,'MM/DD/YYYY','06/01/2026');
  await repAll(page,'https://...','https://www.inceptionlabs.ai');
  await repAll(page,'e.g. Fintech / Healthcare AI / Enterprise SaaS','AI Infrastructure / Generative AI / LLM Provider');
  await repAll(page,'City, State / Country','Palo Alto, CA');
  await repAll(page,'e.g. 500-1,000','~37 (as of April 2026)');
  await repAll(page,'e.g. Series C / Public / PE-backed','Seed');
  await repAll(page,'e.g. $50M raised Q3 2025','$50M Seed — November 6, 2025');
  await repAll(page,'e.g. Andreessen Horowitz, Sequoia','Menlo Ventures (lead), Mayfield, NVentures (NVIDIA), M12 (Microsoft), Snowflake Ventures, Databricks Investment, AWS Startups, Andrew Ng, Andrej Karpathy');
  await repAll(page,'Year','2024');
  await repAll(page,'One or two sentences: what does this company do and why do they exist?',
    'Inception Labs builds diffusion large language models (dLLMs) — a fundamentally different LLM architecture where tokens are generated in parallel rather than sequentially. Their flagship Mercury family (Mercury, Mercury Coder, Mercury 2) delivers 5-10x faster inference than autoregressive LLMs (>1,000 tokens/sec) at a fraction of the cost. Available on AWS Bedrock, Azure AI Foundry, and Vercel AI Gateway. Key use cases: real-time voice agents, agentic/multi-step AI workflows, RAG pipelines, and enterprise search.');
  await repLong(page,
    ['Shared investors, advisors, or board members? Team network overlaps (former '],
    'colleagues, mutual connections)? Note name, relationship, and whether an intro is worth pursuing.',
    'Databricks Investment is a shared ecosystem connection — check if You.com has Databricks partnership signals for warm intro to Stefano Ermon or Aditya Grover. NVIDIA (NVentures) and Microsoft (M12) are other potential bridge investors. NOTE: Stefano Ermon (CEO) and Kumar Chellapilla (VP Eng) are already in ACTIVE sequences launched 05/28/2026 — only 4 days ago. DO NOT re-sequence. Monitor for replies.');
  await repAll(page,'One or two sentences: what does this company do and why do they exist?',
    "Inception Labs builds diffusion large language models (dLLMs) — Mercury family delivers 5-10x faster inference than autoregressive LLMs (>1,000 tokens/sec) at a fraction of the cost. Available on AWS Bedrock, Azure AI Foundry, and Vercel AI Gateway. Key use cases: real-time voice agents, agentic AI workflows, RAG pipelines, and enterprise search.");
  await repLong(page,['What problems are they likely experiencing that we solve? '],
    'What friction exists in their current stack or workflow? Reference job postings, reviews, or intel from Clay.',
    "Mercury's enterprise customers are bottlenecked by LLM latency in production agentic workflows — Mercury solves the generation speed problem but relies on external web intelligence and real-time data retrieval to ground agents in current facts. #1 promoted use case is fast structured RAG — needs a best-in-class web search API to feed their dLLMs accurate, fresh information at the speed their architecture enables.");
  await repLong(page,['What makes them a strong ICP fit? '],
    "What specific value do we provide or problem do we solve for them? What's the hook?",
    "You.com's AI Search API is the ideal retrieval layer to pair with Mercury's ultra-low-latency inference: Mercury handles generation at 1,000+ tokens/sec while You.com handles fresh, accurate web intelligence retrieval. Natural integration partner for Inception's enterprise customers building grounded, real-time AI agents. Mercury 2 is explicitly marketed for fast structured RAG — workflows that are only as good as the retrieval layer feeding them.");
  await fillContacts(page,[
    ['Stefano Ermon','Co-Founder & CEO','ermon@inceptionlabs.ai','https://www.linkedin.com/in/ermon/'],
    ['Kumar Chellapilla','VP of Engineering','kumar@inceptionlabs.ai','Not found'],
    ['Aditya Grover','Co-Founder & CTO','aditya@inceptionlabs.ai','https://www.linkedin.com/in/aditya-grover'],
    ['Volodymyr Kuleshov','Co-Founder (Cornell Tech)','Not found in Apollo','https://www.linkedin.com/in/volodymyr-kuleshov-6aa83294/'],
    ['(No additional contacts)','(Company has ~37 total employees)','N/A','N/A'],
  ]);
  await repAll(page,'Competitor 1','LLM Inference / Model Serving');
  await repAll(page,'Competitor 2','Cloud Distribution');
  await repAll(page,'Partner / Integration','Data / AI Partner');
  await repOnce(page,'e.g. SerpApi','Mercury dLLMs (Mercury, Mercury Coder, Mercury 2) — proprietary diffusion architecture');
  await repOnce(page,'e.g. SerpApi','AWS Bedrock & SageMaker JumpStart; Azure AI Foundry');
  await repOnce(page,'e.g. SerpApi','Databricks (investor + integration partner); Snowflake (investor)');
  await repOnce(page,'e.g. LinkedIn post, Clay','Company product documentation and press releases');
  await repOnce(page,'e.g. LinkedIn post, Clay','Official blog announcements; confirmed investor relationships');
  await repOnce(page,'e.g. LinkedIn post, Clay','Funding announcement; investor participation');
  await repOnce(page,'Confirmed / Suspected','Confirmed'); await repOnce(page,'Confirmed / Suspected','Confirmed'); await repOnce(page,'Confirmed / Suspected','High');
  await repOnce(page,'Displacement / Integration','Core product — You.com is the retrieval layer partner, not a competitor');
  await repOnce(page,'Displacement / Integration','Enterprise distribution channel — GA on Bedrock and Azure AI Foundry');
  await repOnce(page,'Displacement / Integration','Integration — potential warm intro path via Databricks partnership');
  await repAll(page,'Funding','Product Launch');
  await repAll(page,'e.g. Raised Series B - $45M led by Accel Partners','Mercury 2 launched February 24, 2026 — world first reasoning diffusion LLM, >1,000 tokens/sec, 128K context, native tool use, JSON output. Explicitly positioned for RAG pipelines and agentic search workflows. This is their biggest product moment and signals active enterprise GTM push.');
  await repAll(page,'MM/YYYY','02/2026');
  await repAll(page,'Hot / Warm / Monitor','Hot');
  await repAll(page,'New Leadership','Funding / Headcount Expansion');
  await repAll(page,'e.g. New VP of AI Engineering hired from Google DeepMind','$50M Seed closed November 2025 led by Menlo Ventures with NVIDIA, Microsoft, Snowflake, Databricks, AWS as investors. Earmarked for product development and expanding research/engineering teams with new market expansion targeted by late 2026.');
  await repAll(page,'M\\&A / News','Cloud Distribution Expansion');
  await repAll(page,'e.g. Acquired DataCo; expanding AI division to 3x headcount','Mercury now GA on AWS Bedrock, SageMaker JumpStart, and Azure AI Foundry — signals active enterprise GTM ramp and readiness to land Fortune 500 procurement.');
  await repAll(page,'e.g. Data + AI Summit','N/A'); await repAll(page,'DD/MM/YYYY','N/A'); await repAll(page,'Name / Title / Role (Sponsor / Speaker / Attendee)','N/A'); await repAll(page,'e.g. Request meeting at booth','N/A');
  await repAll(page,'No / Yes – https://...','No');
  await repAll(page,'Yes / Not yet — planned start: MM/DD','HOLD — sequences already active since 05/28/2026 (Stefano Ermon + Kumar Chellapilla). Wait for replies or sequence completion before adding new touches.');
  await repAll(page,'Connected / Pending / Not yet sent','Not yet sent');
  await repAll(page,'https://…','N/A'); await repAll(page,'Yes / No – campaign name:','No');
  await repLong(page,['Write your 1-2 sentence personalized hook. Reference a specific piece of intel (news, competitor, event, or persona detail) that '],
    'makes this outreach relevant to THIS account right now.',
    "Inception's Mercury 2 is explicitly marketed for fast structured RAG and agentic search pipelines — workflows that are only as good as the retrieval layer feeding them. You.com's AI Search API gives Mercury-powered agents grounded, citation-backed web intelligence at the speed your architecture demands. As you scale Mercury into Fortune 500 customer support, coding, and voice use cases, You.com becomes the web intelligence backbone that keeps those agents accurate and current.");
  await repAll(page,'Any shared connections, investors, or advisors who could make an intro? Note name and relationship.',
    'Databricks Investment is a shared ecosystem connection — check for You.com Databricks partnership intro path to Stefano Ermon or Aditya Grover. Also check for shared NVIDIA or Microsoft M12 connections.');
  await repLong(page,['Timing considerations, sensitivities, rep-specific tactics, '],
    'competitive objections to prepare for.',
    'HOLD: Both primary sequences launched 05/28 (Stefano Ermon Exec Sponsor seq + Kumar Chellapilla Engineering Leader seq). Too early to evaluate (4 days). Wait for replies or sequence completion before adding new touches. Aditya Grover (Co-Founder CTO, aditya@inceptionlabs.ai) is NOT yet in SF — can add as secondary contact if primary sequences do not convert. Small company (37 people) — every touch is high-visibility.');
  await repAll(page,'As it appears in Salesforce','N/A — no open opportunity');
  await repAll(page,'e.g. Discovery / Evaluation / Negotiation','N/A');
  await repAll(page,'e.g. $80K ARR','N/A');
  await repAll(page,'e.g. Technical demo scheduled / Proposal sent / Awaiting legal review','N/A');
  await repLong(page,['Names, titles, and roles in the decision '],'(Champion, Economic Buyer, Legal, Procurement, etc.)','N/A — no open opportunity. Contacts in SF: Stefano Ermon (CEO, ermon@inceptionlabs.ai) + Kumar Chellapilla (VP Eng, kumar@inceptionlabs.ai). Both in active sequences since 05/28.');
  await repLong(page,['What objections has the AE heard? '],'What is blocking progress? What competitors are being considered in parallel?','N/A — no open opportunity. NOTE: Both sequences launched 05/28 — only 4 days old. Do not add additional touches yet. Monitor for replies from Ermon and Chellapilla.');
  await repAll(page,'What does the AE need to move this deal forward? Case study, competitive one-pager, reference customer intro, tailored content, or other asset?','N/A — no open opportunity. When engaged: Harvey AI case study (agentic search API use case for fast structured RAG) is the most relevant proof point for Inception context.');
}

async function fillHighRadius(page) {
  console.log('  Filling HighRadius...');
  await repAll(page,'Your name','Andrew Miller-McKeever');
  await repAll(page,'Generic Intro / Competitive Displacement / Trigger-News / Databricks Customer / Open Opportunity','Trigger / News-Based');
  await repAll(page,'MM/DD/YYYY','06/01/2026');
  await repAll(page,'https://...','https://www.highradius.com');
  await repAll(page,'e.g. Fintech / Healthcare AI / Enterprise SaaS','Fintech / Financial Software SaaS (Order-to-Cash, Treasury, AP Automation)');
  await repAll(page,'City, State / Country','Houston, TX (major engineering hub in Hyderabad, India)');
  await repAll(page,'e.g. 500-1,000','~4,000-4,500 (4,477 as of April 2026)');
  await repAll(page,'e.g. Series C / Public / PE-backed','Series C (private, unicorn)');
  await repAll(page,'e.g. $50M raised Q3 2025','$300M Series C, March 2021 — $3.1B valuation');
  await repAll(page,'e.g. Andreessen Horowitz, Sequoia','ICONIQ Growth, Tiger Global, D1 Capital Partners, Susquehanna Growth Equity, Frank Slootman (angel), Michael Scarpelli (angel), PNC Bank (strategic)');
  await repAll(page,'Year','2006 (Sashi Narahari, CEO)');
  await repAll(page,'One or two sentences: what does this company do and why do they exist?',
    "HighRadius is the world's leading Autonomous Finance Platform for the Office of the CFO. Their platform deploys 190+ AI agents across Order-to-Cash (AR automation, cash application, collections, credit), Accounts Payable, Treasury Management, Financial Close, and B2B Payments. They serve 1,300+ enterprise customers including 200+ Fortune 1000 companies (3M, Unilever, Hershey's) and process $10.3T in annual transactions. Flagship AI: FreedaGPT (OpenAI-powered GenAI assistant for CFO teams). 2027 goal: 90%+ touchless autonomous finance.");
  await repLong(page,
    ['Shared investors, advisors, or board members? Team network overlaps (former '],
    'colleagues, mutual connections)? Note name, relationship, and whether an intro is worth pursuing.',
    'Frank Slootman (angel investor, ex-Snowflake CEO) is a potential bridge via Snowflake ecosystem. Databricks co-sell available via Harsha Chejarla (harsha.chejarla@databricks.com) — HighRadius is a Databricks Prospect. Run CTD for connections to Vikas Nagpal (CTO) or Prasanna Boni (CPO). STATUS: 3 buying committee contacts enrolled in ABM Trigger/News-Based sequence on 06/01/2026.');
  await repLong(page,['What problems are they likely experiencing that we solve? '],
    'What friction exists in their current stack or workflow? Reference job postings, reviews, or intel from Clay.',
    '1. FreedaGPT and 190+ AI agents lack real-time external web intelligence — live company credit risk signals, news-driven counterparty risk, supplier financial health, macroeconomic context. 2. AI agents make collections decisions but have no web-aware context about a debtor current financial state (layoffs, funding news, bankruptcy signals). 3. Evaluating which LLM/search infrastructure to build vs. buy as agentic AI scales. 4. Internal teams need AI-assisted research on 1,300+ enterprise customers.');
  await repLong(page,['What makes them a strong ICP fit? '],
    "What specific value do we provide or problem do we solve for them? What's the hook?",
    "You.com's AI Search API grounds FreedaGPT agents and collections AI with real-time web intelligence — surfacing debtor news, credit signals, supplier financial health inside the platform. The agents making real-time decisions on $10T transactions without web intelligence is the core pain point. You.com Enterprise can also augment internal search for HighRadius's 4,000+ employees scaling toward the 2027 autonomous finance vision.");
  await fillContacts(page,[
    ['Vikas Nagpal','Chief Technology Officer (joined Jan 2025)','vikas.nagpal@highradius.com','https://www.linkedin.com/in/vikas-nagpal-08a87113'],
    ['Prasanna Boni','Chief Product Officer (promoted May 2025)','prasanna.boni@highradius.com','https://www.linkedin.com/in/prasanna-boni-b4abb09'],
    ['Lohit Vankina','Director, Engineering (AI/ML/GenAI) (promoted Jan 2025)','lohit.vankina@highradius.com','https://www.linkedin.com/in/lohit-vankina'],
    ['Sashi Narahari','Founder & CEO','Not found in Apollo','https://www.linkedin.com/in/sashi-narahari'],
    ['(No additional contacts)','(CLEAN SLATE — no prior sequences)','N/A','N/A'],
  ]);
  await repAll(page,'Competitor 1','LLM / GenAI');
  await repAll(page,'Competitor 2','Search / Retrieval');
  await repAll(page,'Partner / Integration','Cloud Infrastructure');
  await repOnce(page,'e.g. SerpApi','OpenAI (GPT-4 class) — confirmed in FreedaGPT press release');
  await repOnce(page,'e.g. SerpApi','Elasticsearch');
  await repOnce(page,'e.g. SerpApi','AWS (primary) + GCP + Azure');
  await repOnce(page,'e.g. LinkedIn post, Clay','FreedaGPT launch press release'); await repOnce(page,'e.g. LinkedIn post, Clay','Apollo tech stack intelligence'); await repOnce(page,'e.g. LinkedIn post, Clay','Apollo tech stack intelligence');
  await repOnce(page,'Confirmed / Suspected','High'); await repOnce(page,'Confirmed / Suspected','High'); await repOnce(page,'Confirmed / Suspected','High');
  await repOnce(page,'Displacement / Integration','Integration — You.com Search API augments with real-time web-grounded layer on top of OpenAI');
  await repOnce(page,'Displacement / Integration','Integration — You.com API supplements Elasticsearch with web-grounded results');
  await repOnce(page,'Displacement / Integration','Integration — You.com API integrates via REST into any cloud');
  await repAll(page,'Funding','Product Launch / Pricing Pivot');
  await repAll(page,'e.g. Raised Series B - $45M led by Accel Partners','At Radiance 2026 (Feb 27, 2026), HighRadius launched outcome-based pricing — $0 implementation fee, $0 subscription until go-live. Also introduced Algo Quotient (AQ) concept and AI Managers as the future of CFO org design. Signals aggressive growth push and need to demonstrate measurable AI ROI.');
  await repAll(page,'MM/YYYY','02/2026');
  await repAll(page,'Hot / Warm / Monitor','Hot');
  await repAll(page,'New Leadership','Agentic AI Expansion');
  await repAll(page,'e.g. New VP of AI Engineering hired from Google DeepMind','Radiance 2025: 190+ AI agents shipping across 6 product suites with formal 2027 goal of 90%+ touchless autonomous finance. Massive AI buildout requiring external data feeds, web intelligence, and LLM grounding infrastructure.');
  await repAll(page,'M\\&A / News','New Executive Hires (AI/Product)');
  await repAll(page,'e.g. Acquired DataCo; expanding AI division to 3x headcount','Vikas Nagpal joined as CTO Jan 2025. Prasanna Boni promoted to CPO May 2025. Lohit Vankina promoted to Director AI/ML/GenAI Jan 2025. New leadership wave actively building out the AI platform — prime window for new vendor relationships.');
  await repAll(page,'e.g. Data + AI Summit','Radiance 2027 (upcoming)'); await repAll(page,'DD/MM/YYYY','TBD'); await repAll(page,'Name / Title / Role (Sponsor / Speaker / Attendee)','Vikas Nagpal / CTO / likely attendee'); await repAll(page,'e.g. Request meeting at booth','Request meeting with CTO at Radiance');
  await repAll(page,'No / Yes – https://...','No');
  await repAll(page,'Yes / Not yet — planned start: MM/DD','ACTIVE — Vikas Nagpal, Prasanna Boni, Lohit Vankina enrolled in ABM Trigger/News-Based on 06/01/2026');
  await repAll(page,'Connected / Pending / Not yet sent','Not yet sent');
  await repAll(page,'https://…','N/A'); await repAll(page,'Yes / No – campaign name:','No');
  await repLong(page,['Write your 1-2 sentence personalized hook. Reference a specific piece of intel (news, competitor, event, or persona detail) that '],
    'makes this outreach relevant to THIS account right now.',
    "Vikas — saw the Radiance 2026 launch of outcome-based pricing and the 190-agent autonomous finance buildout. As your team scales FreedaGPT and the collections AI to make real-time decisions on $10T+ in transactions, one gap we consistently see is LLM agents that lack live external signals — credit news, debtor financial health, supplier risk. You.com's AI Search API is how teams like yours ground those agents in real-world web intelligence, without building a crawl/index stack from scratch. Would it be worth a 20-minute call?");
  await repAll(page,'Any shared connections, investors, or advisors who could make an intro? Note name and relationship.',
    'Frank Slootman (angel, ex-Snowflake CEO) — bridge via Snowflake ecosystem. Run CTD. Coordinate Databricks co-sell with Harsha Chejarla (harsha.chejarla@databricks.com).');
  await repLong(page,['Timing considerations, sensitivities, rep-specific tactics, '],
    'competitive objections to prepare for.',
    'CLEANEST ACCOUNT IN THIS SET: No prior sequences, essentially untouched. Lohit Vankina (Director AI/ML/GenAI) is the most direct technical buyer for an AI Search API. 3 contacts enrolled in ABM Trigger/News-Based sequence on 06/01/2026. The agents making real-time decisions on $10T transactions without web intelligence is the most vivid pain point — use in all messaging.');
  await repAll(page,'As it appears in Salesforce','N/A — no open opportunity');
  await repAll(page,'e.g. Discovery / Evaluation / Negotiation','N/A');
  await repAll(page,'e.g. $80K ARR','N/A');
  await repAll(page,'e.g. Technical demo scheduled / Proposal sent / Awaiting legal review','N/A');
  await repLong(page,['Names, titles, and roles in the decision '],'(Champion, Economic Buyer, Legal, Procurement, etc.)','N/A — no open opportunity. SF contacts (1): Rajendra Krishna, Sr. Manager Product Marketing (low priority). All 3 buying committee contacts are net-new — no prior sequences.');
  await repLong(page,['What objections has the AE heard? '],'What is blocking progress? What competitors are being considered in parallel?','N/A — no open opportunity. Account is essentially untouched — no sequences, no engagement. Databricks co-sell with Harsha Chejarla is the best entry point beyond cold outreach.');
  await repAll(page,'What does the AE need to move this deal forward? Case study, competitive one-pager, reference customer intro, tailored content, or other asset?','N/A — no open opportunity. When engaged: fintech-specific use case (counterparty risk intelligence, supplier financial health signals in collections AI) would resonate most. Salesforce case study relevant given their CRM.');
}

async function fillInformatica(page) {
  console.log('  Filling Informatica...');
  await repAll(page,'Your name','Andrew Miller-McKeever');
  await repAll(page,'Generic Intro / Competitive Displacement / Trigger-News / Databricks Customer / Open Opportunity','Trigger / News-Based');
  await repAll(page,'MM/DD/YYYY','06/01/2026');
  await repAll(page,'https://...','https://www.informatica.com');
  await repAll(page,'e.g. Fintech / Healthcare AI / Enterprise SaaS','Enterprise Cloud Data Management / Data Integration Software');
  await repAll(page,'City, State / Country','Redwood City, CA');
  await repAll(page,'e.g. 500-1,000','~5,000-5,500');
  await repAll(page,'e.g. Series C / Public / PE-backed','Acquired by Salesforce — completed November 18, 2025 for ~$8B in cash');
  await repAll(page,'e.g. $50M raised Q3 2025','NYSE: INFA — acquired by Salesforce Nov 18, 2025 for ~$8B');
  await repAll(page,'e.g. Andreessen Horowitz, Sequoia','Salesforce (acquirer); previously Permira and CPPIB (took private 2015); re-listed NYSE Oct 2021');
  await repAll(page,'Year','1993 (Gaurav Dhillon and Diaz Nesamoney)');
  await repAll(page,'One or two sentences: what does this company do and why do they exist?',
    'Informatica (now a Salesforce business unit) is the enterprise data management infrastructure layer. Its flagship product, IDMC (Intelligent Data Management Cloud), provides data integration, data quality, governance, Master Data Management, and metadata management across multi-cloud and hybrid environments. CLAIRE AI engine powers CLAIRE Agents, CLAIRE GPT, and AI-assisted data pipelines. As of Informatica World 2026 (May 2026), pivoting to headless data services — all IDMC capabilities as API/MCP-native services that AI agents can invoke directly.');
  await repLong(page,
    ['Shared investors, advisors, or board members? Team network overlaps (former '],
    'colleagues, mutual connections)? Note name, relationship, and whether an intro is worth pursuing.',
    'Salesforce is the parent company — any You.com connections into Salesforce AI ecosystem (Agentforce, Data Cloud) could create warm path. Databricks co-sell via Randy Welsh (randy.welsh@databricks.com). WARM CONTACTS: Murthy Vanka (Giants game Jul 2025 + 49ers suite Dec 2025 via Marium Ali). Run CTD for Savinay Berry (new GM, ex-OpenText) and Rahul Auradkar (Salesforce). STATUS: 4 contacts enrolled in ABM Trigger/News-Based on 06/01/2026.');
  await repLong(page,['What problems are they likely experiencing that we solve? '],
    'What friction exists in their current stack or workflow? Reference job postings, reviews, or intel from Clay.',
    '1. CLAIRE Agents integrate with Azure OpenAI and Anthropic Claude but have no governed, enterprise-grade web search layer for agents needing to enrich records or answer questions requiring current external knowledge. 2. New headless MCP-first strategy means Informatica needs composable AI services — You.com AI Search API is a natural fit as a governed web intelligence tool. 3. New GM Savinay Berry (<90 days) — high receptivity to differentiated vendor conversations during transition. 4. Post-acquisition integration pressure from Salesforce.');
  await repLong(page,['What makes them a strong ICP fit? '],
    "What specific value do we provide or problem do we solve for them? What's the hook?",
    "You.com AI Search API as the external knowledge/web intelligence layer for CLAIRE Agents — enabling AI agents to enrich data records, answer questions, and make decisions grounded in current web intelligence, not just internal governed data. You.com can be exposed as an MCP-native tool server, plugging directly into Informatica's new headless architecture. CLAIRE already runs Azure OpenAI and Anthropic Claude — You.com Search pairs naturally as the retrieval layer.");
  await fillContacts(page,[
    ['Savinay Berry','General Manager, Informatica (Salesforce) — new as of May 2026','No email found in Apollo (try savinay.berry@salesforce.com)','https://www.linkedin.com/in/savinayberry'],
    ['Krish Vitaldevara','Chief Product Officer, EVP','kvitaldevara@informatica.com','https://www.linkedin.com/in/krishvi'],
    ['James Gregory','VP, AI, Data and Enterprise Platforms & Infrastructure','jgregory@informatica.com','https://www.linkedin.com/in/james-gregory-9bb87a31'],
    ['Murthy Vanka','SVP Engineering, Data Integration and Chief Architect (WARM contact)','mvanka@informatica.com','https://www.linkedin.com/in/mvanka'],
    ['Rahul Auradkar','President & GM, Data & AI Foundations, Salesforce','rauradkar@salesforce.com','https://www.linkedin.com/in/rahulauradkar'],
  ]);
  await repAll(page,'Competitor 1','AI/LLM');
  await repAll(page,'Competitor 2','Data Platform');
  await repAll(page,'Partner / Integration','Integration Protocol');
  await repOnce(page,'e.g. SerpApi','Azure OpenAI (GPT-4 family); Anthropic Claude — both confirmed in CLAIRE GPT blog');
  await repOnce(page,'e.g. SerpApi','Databricks (Mosaic AI); Snowflake Cortex AI — both in IDMC Summer 2025 release');
  await repOnce(page,'e.g. SerpApi','Model Context Protocol (MCP) — MCP server launched in IDMC April 2026');
  await repOnce(page,'e.g. LinkedIn post, Clay','Informatica blog: CLAIRE GPT explicitly integrates Azure OpenAI and Anthropic Claude');
  await repOnce(page,'e.g. LinkedIn post, Clay','IDMC Summer 2025 release notes new Databricks Mosaic AI and Snowflake Cortex AI connectors');
  await repOnce(page,'e.g. LinkedIn post, Clay','Informatica launched dedicated MCP server in IDMC (April 2026); headless architecture at Informatica World 2026');
  await repOnce(page,'Confirmed / Suspected','High'); await repOnce(page,'Confirmed / Suspected','High'); await repOnce(page,'Confirmed / Suspected','High');
  await repOnce(page,'Displacement / Integration','Integration — direct ecosystem alignment; CLAIRE already runs Claude; You.com Search pairs naturally as retrieval layer');
  await repOnce(page,'Displacement / Integration','Integration — shared Databricks ecosystem; potential warm intro path via Databricks partnership');
  await repOnce(page,'Displacement / Integration','Integration — You.com AI Search API can be exposed as MCP tool server, plugging directly into headless IDMC');
  await repAll(page,'Funding','Leadership Change');
  await repAll(page,'e.g. Raised Series B - $45M led by Accel Partners','New GM Savinay Berry (ex-OpenText CPO/CTO) appointed to lead Informatica post-acquisition. Only 72 hours into the role at Informatica World 2026 (May 2026). New leaders evaluate and reset vendor relationships in first 90 days — WINDOW OPEN NOW.');
  await repAll(page,'MM/YYYY','05/2026');
  await repAll(page,'Hot / Warm / Monitor','Hot');
  await repAll(page,'New Leadership','M&A / Acquisition');
  await repAll(page,'e.g. New VP of AI Engineering hired from Google DeepMind','Salesforce completed $8B acquisition of Informatica on November 18, 2025. Post-acquisition integration ongoing with significant executive turnover. Organizational restructuring creates new vendor evaluation windows.');
  await repAll(page,'M\\&A / News','Product Launch / Strategy Shift');
  await repAll(page,'e.g. Acquired DataCo; expanding AI division to 3x headcount','Informatica World 2026 (Las Vegas, May 2026): Company unveiled headless IDMC architecture — all data management capabilities exposed as API/MCP-native services for AI agents. CLAIRE is now a fully headless, multi-agent intelligence layer. Dramatically increases need for composable AI services including web search.');
  await repAll(page,'e.g. Data + AI Summit','Informatica World 2026 (Las Vegas)'); await repAll(page,'DD/MM/YYYY','05/2026'); await repAll(page,'Name / Title / Role (Sponsor / Speaker / Attendee)','Savinay Berry (new GM) / Keynote Speaker'); await repAll(page,'e.g. Request meeting at booth','Post-conference outreach referencing headless IDMC announcement');
  await repAll(page,'No / Yes – https://...','No');
  await repAll(page,'Yes / Not yet — planned start: MM/DD','ACTIVE — Krish Vitaldevara, James Gregory, Murthy Vanka, Rahul Auradkar enrolled in ABM Trigger/News-Based on 06/01/2026. Savinay Berry pending email confirmation.');
  await repAll(page,'Connected / Pending / Not yet sent','Not yet sent');
  await repAll(page,'https://…','N/A'); await repAll(page,'Yes / No – campaign name:','No');
  await repLong(page,['Write your 1-2 sentence personalized hook. Reference a specific piece of intel (news, competitor, event, or persona detail) that '],
    'makes this outreach relevant to THIS account right now.',
    "Savinay — congrats on the new GM role at Informatica. The headless IDMC strategy unveiled at Informatica World is exactly the right architecture for the agentic era, and the MCP-native layer you're building is a natural place where You.com's AI Search API adds instant value: giving CLAIRE Agents and your customers' agents a governed, enterprise-grade window into real-time web intelligence — so agents aren't limited to internal data when they need to enrich records, answer market questions, or ground decisions in current context. Worth a 20-minute call?");
  await repAll(page,'Any shared connections, investors, or advisors who could make an intro? Note name and relationship.',
    'Run CTD for Savinay Berry (ex-OpenText CPO/CTO) and Rahul Auradkar (Salesforce). Databricks co-sell with Randy Welsh (randy.welsh@databricks.com). Murthy Vanka is the warmest existing contact (Giants game + 49ers suite via Marium Ali).');
  await repLong(page,['Timing considerations, sensitivities, rep-specific tactics, '],
    'competitive objections to prepare for.',
    'TIMING CRITICAL: Savinay Berry appointed May 2026. Reach out within 30 days. Murthy Vanka is the warmest contact — use re-engagement hook: A lot has changed since the 49ers game. Savinay Berry just kicked off the headless IDMC era at Informatica World, and the MCP-native architecture for CLAIRE Agents creates a direct use case for You.com AI Search API. 4-month engagement gap from prior rep (Marium Ali/David Wacker). Apollo bulk enrichment complete — Krish Vitaldevara, James Gregory, Murthy Vanka, Rahul Auradkar all have verified emails.');
  await repAll(page,'As it appears in Salesforce','N/A — no open opportunity');
  await repAll(page,'e.g. Discovery / Evaluation / Negotiation','N/A');
  await repAll(page,'e.g. $80K ARR','N/A');
  await repAll(page,'e.g. Technical demo scheduled / Proposal sent / Awaiting legal review','N/A');
  await repLong(page,['Names, titles, and roles in the decision '],'(Champion, Economic Buyer, Legal, Procurement, etc.)','N/A — no open opportunity. Key SF contacts: Murthy Vanka (GVP Chief Architect — WARM via event invites), Suresh Sbathini (SVP Software Engineering — WARM via event invites), Kevin Bennett (VP Global Marketing AI Analytics), Omar Keblawi (Director Enterprise Architecture AI Governance).');
  await repLong(page,['What objections has the AE heard? '],'What is blocking progress? What competitors are being considered in parallel?','N/A — no open opportunity. 4-month engagement gap after strong event-based outreach from Marium Ali. Account was previously worked by Marium Ali (event-based) and David Wacker (Davos follow-up). Andrew now owns. No Apollo sequences previously run on this account.');
  await repAll(page,'What does the AE need to move this deal forward? Case study, competitive one-pager, reference customer intro, tailored content, or other asset?','N/A — no open opportunity. When engaged: MCP integration one-pager showing You.com as a composable web intelligence tool server for IDMC headless architecture would resonate. Salesforce connection (Rahul Auradkar as exec sponsor angle).');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launchPersistentContext(CHROME_USER_DATA, {
    channel: 'chrome', headless: false, args: ['--profile-directory=Default'], slowMo: 20,
  });
  const page = await browser.newPage();
  const results = [];

  const accounts = [
    { key: 'atlassian',  name: 'Atlassian',   fill: fillAtlassian,  title: 'Atlassian ABM Account Research - Finalized' },
    { key: 'reddit',     name: 'Reddit',       fill: fillReddit,     title: 'Reddit ABM Account Research - Finalized' },
    { key: 'inception',  name: 'Inception',    fill: fillInception,  title: 'Inception ABM Account Research - Finalized' },
    { key: 'highradius', name: 'HighRadius',   fill: fillHighRadius, title: 'HighRadius ABM Account Research - Finalized' },
    { key: 'informatica',name: 'Informatica',  fill: fillInformatica,title: 'Informatica ABM Account Research - Finalized' },
  ];

  for (const acct of accounts) {
    console.log(`\n========== ${acct.name} ==========`);
    try {
      // 1. Copy the template
      console.log('  Copying template...');
      await page.goto(`https://docs.google.com/document/d/${TEMPLATES[acct.key]}/copy`, {waitUntil:'domcontentloaded', timeout:30000});
      await page.waitForTimeout(3000);
      await page.locator('button:has-text("Make a copy")').click();
      await page.waitForTimeout(5000);
      const docId = page.url().match(/\/document\/d\/([^\/]+)\//)?.[1];
      console.log('  New doc ID:', docId);

      // 2. Open F&R
      await page.click('text=Edit');
      await page.waitForTimeout(500);
      await page.click('text=Find and replace');
      await page.waitForTimeout(1200);

      // 3. Fill content
      await acct.fill(page);

      // 4. Close F&R
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);

      // 5. Change all text to black
      console.log('  Setting text to black...');
      await setColorBlack(page);

      // 6. Restore white on section headers
      console.log('  Restoring white headers...');
      await setHeadersWhite(page);

      // 7. Rename doc
      const titleInput = page.locator('input[aria-label="Rename"]');
      if (await titleInput.isVisible().catch(()=>false)) {
        await titleInput.click({clickCount:3});
        await titleInput.fill(acct.title);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
      }

      // 8. Wait for save
      await page.waitForTimeout(3000);
      results.push({ name: acct.name, id: docId, url: `https://docs.google.com/document/d/${docId}/edit` });
      console.log(`  ✅ Done: https://docs.google.com/document/d/${docId}/edit`);
    } catch (err) {
      console.error(`  ❌ Error for ${acct.name}:`, err.message.substring(0,200));
      results.push({ name: acct.name, id: 'ERROR', url: 'ERROR: ' + err.message.substring(0,100) });
    }
  }

  // Print matrix
  console.log('\n\n========== FINAL MATRIX ==========');
  console.log('Account      | Doc Link');
  console.log('-------------|----------------------------------------------');
  for (const r of results) {
    console.log(`${r.name.padEnd(13)}| ${r.url}`);
  }

  await page.waitForTimeout(3000);
  await browser.close();
})();
