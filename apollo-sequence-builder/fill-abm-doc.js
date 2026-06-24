#!/usr/bin/env node
/**
 * Fill LexisNexis ABM Account Research Google Doc
 * Uses apollo playwright profile
 * 
 * Key approach for long placeholder texts (>100 chars):
 * - Google Docs Find & Replace has ~100 char search limit
 * - Split long placeholders: replace unique END portion with full text,
 *   then delete the beginning portions
 */
const { chromium } = require('playwright');
const path = require('path');

const CHROME_USER_DATA = path.join(process.env.HOME, '.apollo-playwright-profile');
const DOC_ID = process.env.DOC_ID || '1M35_iWLiXOxmeqHy5UG6_P8lzV8WIm5J4aHcZHekEBg';
const DOC_URL = `https://docs.google.com/document/d/${DOC_ID}/edit`;

async function rep(page, findText, replaceText, useReplaceOnce = false) {
  const fi = page.locator('input[aria-label="Find"]');
  const ri = page.locator('input[aria-label="Replace with"]');
  
  await fi.click({ clickCount: 3 });
  await fi.fill(findText);
  await page.waitForTimeout(250);
  await ri.click({ clickCount: 3 });
  await ri.fill(replaceText);
  await page.waitForTimeout(250);

  if (useReplaceOnce) {
    const rb = page.locator('button').filter({ hasText: /^Replace$/ }).first();
    const ok = await rb.isEnabled().catch(() => false);
    if (ok) { await rb.click(); await page.waitForTimeout(400); return true; }
    return false;
  } else {
    const rb = page.locator('button').filter({ hasText: /^Replace all$/ });
    const ok = await rb.isEnabled().catch(() => false);
    if (ok) { await rb.click(); await page.waitForTimeout(600); console.log(`  ✓ ${findText.substring(0,55)}`); return true; }
    else { console.log(`  - skip (no match): ${findText.substring(0,55)}`); return false; }
  }
}

// For long texts: replace unique portion + delete the rest
async function repLong(page, deleteChunks, replaceChunk, fullReplacement) {
  // Step 1: replace the unique END portion with full replacement text
  await rep(page, replaceChunk, fullReplacement);
  // Step 2: delete the beginning/middle chunks that are now orphaned
  for (const chunk of deleteChunks) {
    await rep(page, chunk, '');
  }
}

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launchPersistentContext(CHROME_USER_DATA, {
    channel: 'chrome', headless: false,
    args: ['--profile-directory=Default'],
    slowMo: 20,
  });
  const page = await browser.newPage();
  try {
    console.log('Loading doc...');
    await page.goto(DOC_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    console.log('Title:', await page.title());

    // Open Find & Replace
    await page.click('text=Edit');
    await page.waitForTimeout(500);
    await page.click('text=Find and replace');
    await page.waitForTimeout(1200);

    // ── HEADER ──────────────────────────────────────────────────────────
    console.log('\n[Header]');
    await rep(page, 'Your name', 'Andrew Miller-McKeever');
    await rep(page, 'Generic Intro / Competitive Displacement / Trigger-News / Databricks Customer / Open Opportunity', 'Trigger / News-Based');
    await rep(page, 'MM/DD/YYYY', '06/01/2026');

    // ── SECTION 1: COMPANY SNAPSHOT ─────────────────────────────────────
    console.log('\n[Section 1]');
    await rep(page, 'https://...', 'https://www.lexisnexis.com');
    await rep(page, 'e.g. Fintech / Healthcare AI / Enterprise SaaS', 'Legal Technology & Information Services / Data Analytics');
    await rep(page, 'City, State / Country', 'New York City, NY 10017, USA');
    await rep(page, 'e.g. 500-1,000', '~11,900 (Legal & Professional globally); ~9,800 (Risk Solutions)');
    await rep(page, 'e.g. Series C / Public / PE-backed', 'Subsidiary — owned by RELX plc (LSE/NYSE: REL)');
    await rep(page, 'e.g. $50M raised Q3 2025', 'N/A (part of RELX plc)');
    await rep(page, 'e.g. Andreessen Horowitz, Sequoia', 'N/A (RELX plc is parent; publicly traded)');
    await rep(page, 'Year', '1970');

    // Portfolio/Network Connections (long - split approach)
    // Original: "Shared investors... ...worth pursuing."
    await repLong(page,
      ['Shared investors, advisors, or board members? Team network overlaps (former '],
      'colleagues, mutual connections)? Note name, relationship, and whether an intro is worth pursuing.',
      'No direct shared investors with You.com. Databricks co-sell available via AE Andrew Lupton (andrew.lupton@databricks.com). Run CTD tool before cold outreach.'
    );

    // What They Do (70 chars - should work directly)
    await rep(page, 'One or two sentences: what does this company do and why do they exist?',
      'LexisNexis is a global information and analytics company providing AI-powered legal research, business intelligence, regulatory data, risk management, and workflow solutions. Flagship products include Lexis+ with Protege (agentic legal AI), Nexis+ AI (business intelligence GenAI platform), and LexisNexis Risk Solutions. Serves law firms, corporate legal departments, government agencies, and financial institutions in 150+ countries.');

    // Pain Points (long - split approach)
    // Original starts: "What problems are they likely experiencing..."
    await repLong(page,
      ['What problems are they likely experiencing that we solve? '],
      'What friction exists in their current stack or workflow? Reference job postings, reviews, or intel from Clay.',
      '1. Open-web grounding gap: Protege General AI and Nexis+ AI surface open-web insights — need reliable real-time web search layer. 2. Multi-model AI: runs GPT-5, Claude Sonnet, GPT-4o, o3 concurrently — needs model-agnostic search API. 3. Hallucination accuracy: Min Chen (Chief AI Officer) says hallucination has concrete consequences in legal AI. 4. Competitive pressure from Thomson Reuters (CoCounsel) and Harvey AI.'
    );

    // Business/Use Case (long - split approach)
    await repLong(page,
      ['What makes them a strong ICP fit? '],
      "What specific value do we provide or problem do we solve for them? What's the hook?",
      "You.com's AI Search API powers the open-web retrieval layer inside Protege General AI and Nexis+ AI — delivering cited, real-time web results that meet their responsible-AI standards, without building a web crawler. Model-agnostic, matching their multi-LLM architecture (GPT-5, Claude, Mistral). Direct ICP: they already explicitly surface open-web results and need enterprise-grade infrastructure for it."
    );

    // ── SECTION 2: BUYING COMMITTEE ─────────────────────────────────────
    console.log('\n[Section 2]');
    const contacts = [
      ['Min Chen', 'SVP & Chief AI Officer', 'No email in Apollo (try min.chen@lexisnexis.com)', 'https://www.linkedin.com/in/minchen2/'],
      ['Greg Dickason', 'CTO & EVP', 'greg.dickason@lexisnexis.com.au (verify)', 'https://www.linkedin.com/in/greg-dickason-633920/'],
      ['Anshul (last name TBC)', 'Senior Director, Global AI Workflows, Strategy & Operations', 'Not found in Apollo', 'Not found'],
      ['Maura (last name TBC)', 'VP, Legal AI & Protege Global Marketing', 'Not found in Apollo', 'Not found'],
      ['Philippe (last name TBC)', 'CTO, Risk Solutions', 'Not found in Apollo', 'Not found'],
    ];
    for (const [name,,, ] of contacts) await rep(page, 'First Last', name, true);
    for (const [, title,, ] of contacts) await rep(page, 'VP / Director of...', title, true);
    for (const [,, email, ] of contacts) await rep(page, 'email@company.com', email, true);
    for (const [,,, li] of contacts) await rep(page, 'linkedin.com/in/...', li, true);
    await rep(page, 'Yes / No', 'No'); // 1st Contact column (all No)
    console.log('  ✓ Buying committee done');

    // ── SECTION 3: ACCOUNT INTELLIGENCE ────────────────────────────────
    console.log('\n[Section 3]');
    await rep(page, 'Competitor 1', 'AI Models / LLMs');
    await rep(page, 'Competitor 2', 'Search / RAG Infrastructure');
    await rep(page, 'Partner / Integration', 'Cloud Infrastructure');

    const tools = [
      'OpenAI GPT-5, GPT-4o, o3; Claude Sonnet 4; Mistral (fine-tuned SLMs)',
      'Proprietary Agentic RAG (LexisNexis-built)',
      'Microsoft Azure (LLM hosting + Copilot integrations)',
    ];
    const howId = [
      'LexisNexis press releases; Min Chen interview Dec 2025',
      'LexisNexis product documentation',
      'Microsoft 365/Copilot integrations announced',
    ];
    const confid = ['Confirmed', 'Confirmed', 'Suspected'];
    const impact = [
      'Integration — multi-model arch means You.com API must be model-agnostic',
      'Integration — You.com Search API is the open-web retrieval layer for their RAG pipeline',
      'Integration — You.com API callable from Azure-hosted services',
    ];
    for (let i = 0; i < 3; i++) {
      await rep(page, 'e.g. SerpApi', tools[i], true);
      await rep(page, 'e.g. LinkedIn post, Clay', howId[i], true);
      await rep(page, 'Confirmed / Suspected', confid[i], true);
      await rep(page, 'Displacement / Integration', impact[i], true);
    }

    // Trigger Events
    await rep(page, 'Funding', 'Product Launch / Rebrand');
    await rep(page, 'e.g. Raised Series B - $45M led by Accel Partners',
      'Lexis+ AI rebranded to Lexis+ with Protege (Feb 2026) — now explicitly ships open-web grounding inside Protege General AI and Nexis+ AI. Creates direct infrastructure need for enterprise web search API.');
    await rep(page, 'MM/YYYY', '02/2026');
    await rep(page, 'Hot / Warm / Monitor', 'Hot');
    await rep(page, 'New Leadership', 'M&A / Acquisition');
    await rep(page, 'e.g. New VP of AI Engineering hired from Google DeepMind',
      'RELX signed put option to acquire Doctrine (European legal AI platform) April 28, 2026. Signals aggressive AI expansion; will need open-web search API in additional languages.');
    await rep(page, 'M\\&A / News', 'Product Expansion');
    await rep(page, 'e.g. Acquired DataCo; expanding AI division to 3x headcount',
      'Nexis+ AI launched Next Generation Search (Jan 30, 2025) — conversational search across licensed AND open-web sources. The open-web component is an active product priority.');

    // Events table
    await rep(page, 'e.g. Data + AI Summit', 'N/A');
    await rep(page, 'DD/MM/YYYY', 'N/A');
    await rep(page, 'Name / Title / Role (Sponsor / Speaker / Attendee)', 'N/A');
    await rep(page, 'e.g. Request meeting at booth', 'N/A');

    // ── SECTION 4: OUTREACH PLAN ────────────────────────────────────────
    console.log('\n[Section 4]');
    await rep(page, 'No / Yes – https://...', 'No');
    await rep(page, 'Yes / Not yet — planned start: MM/DD', 'Not yet — planned start: TBD');
    await rep(page, 'Connected / Pending / Not yet sent', 'Not yet sent');
    await rep(page, 'https://…', 'N/A');
    await rep(page, 'Yes / No – campaign name:', 'No');

    // Opening hook (long - split)
    await repLong(page,
      ['Write your 1-2 sentence personalized hook. Reference a specific piece of intel (news, competitor, event, or persona detail) that '],
      'makes this outreach relevant to THIS account right now.',
      "LexisNexis just rebranded Lexis+ AI to Lexis+ with Protege and is now explicitly shipping open-web grounding inside Protege General AI and Nexis+ AI. The challenge: web search quality and citability become load-bearing for your legal AI accuracy story — and building that crawler in-house is a distraction from your core content advantage. You.com's AI Search API is the enterprise-grade web retrieval layer that drops into your existing Agentic RAG pipeline, works across your multi-model stack (GPT-5, Claude, Mistral), and delivers cited results that meet your responsible-AI standards."
    );

    // Warm intro (shorter - try direct)
    await rep(page, 'Any shared connections, investors, or advisors who could make an intro? Note name and relationship.',
      'No direct shared investors. Databricks co-sell: coordinate with Andrew Lupton (andrew.lupton@databricks.com). Run CTD tool before cold outreach.');

    // Additional notes (long - split)
    await repLong(page,
      ['Timing considerations, sensitivities, rep-specific tactics, '],
      'competitive objections to prepare for.',
      'DEDUP REQUIRED: 19 contacts already in SF, active sequences running (Lockbox Campaign, NYC Dinner, LexisNexis x You.com follow-up 05/27). Check before adding new contacts. Min Chen has no email in Apollo. Greg Dickason email is Australian regional — verify before sending. Databricks co-sell via Andrew Lupton.'
    );

    // ── SECTION 5: OPEN OPPORTUNITY ─────────────────────────────────────
    console.log('\n[Section 5]');
    await rep(page, 'As it appears in Salesforce', 'N/A — no open opportunity');
    await rep(page, 'e.g. Discovery / Evaluation / Negotiation', 'N/A');
    await rep(page, 'e.g. $80K ARR', 'N/A');
    await rep(page, 'e.g. Technical demo scheduled / Proposal sent / Awaiting legal review', 'N/A');

    // Key Stakeholders (long - split)
    await repLong(page,
      ['Names, titles, and roles in the decision '],
      '(Champion, Economic Buyer, Legal, Procurement, etc.)',
      'N/A — no open opportunity. Key SF contacts: Justin Fagden (Strategic Partnerships), Jeff Reihl (Technology Chairman), Bob Perry (VP Software Engineering), Serena Wellen (VP Product Management), Jeff Jenkins (CISO)'
    );

    // Known Objections (long - split)
    await repLong(page,
      ['What objections has the AE heard? '],
      'What is blocking progress? What competitors are being considered in parallel?',
      'N/A — no open opportunity. Note: Active sequences running on lower-level contacts. Min Chen and Greg Dickason (primary buying committee) not yet reached.'
    );

    // Marketing Support (shorter)
    await rep(page, 'What does the AE need to move this deal forward? Case study, competitive one-pager, reference customer intro, tailored content, or other asset?',
      'N/A — no open opportunity. When engaged: Harvey AI case study or legal tech customer reference most relevant. Competitive one-pager vs. Thomson Reuters CoCounsel also useful.');

    // Name field in Section 5 (careful - "Name" is very generic)
    // The Primary AE field has placeholder "Name" — skip for now to avoid false replacements

    // ── CLOSE & RENAME ───────────────────────────────────────────────────
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Rename
    const titleInput = page.locator('input[aria-label="Rename"]');
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.click({ clickCount: 3 });
      await titleInput.fill('LexisNexis ABM Account Research - Finalized');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }

    console.log('\n✅ DONE!');
    console.log(`URL: https://docs.google.com/document/d/${DOC_ID}/edit`);
  } catch (err) {
    console.error('\n❌ Error:', err.message.substring(0, 200));
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
})();
