#!/usr/bin/env node
/**
 * Fill in LexisNexis ABM Account Research Google Doc
 * Uses existing Chrome profile (logged into Google)
 */

const { chromium } = require('playwright');
const path = require('path');

const CHROME_USER_DATA = path.join(process.env.HOME, 'Library/Application Support/Google/Chrome');
const CHROME_PROFILE = 'Default';
const DOC_ID = '1VyfcGaVu35BkX5V8sjWf4leHMxDOwgjfyykp3YCLFaU';
const DOC_URL = `https://docs.google.com/document/d/${DOC_ID}/edit`;

const REPLACEMENTS = [
  // Header
  ['Your name', 'Andrew Miller-McKeever'],
  ['Generic Intro / Competitive Displacement / Trigger-News / Databricks Customer / Open Opportunity', 'Trigger / News-Based'],
  ['MM/DD/YYYY', '06/01/2026'],

  // Section 1 - Company Snapshot
  ['https://...', 'https://www.lexisnexis.com'],
  ['e.g. Fintech / Healthcare AI / Enterprise SaaS', 'Legal Technology & Information Services / Data Analytics'],
  ['City, State / Country', 'New York City, NY 10017, USA'],
  ['e.g. 500-1,000', '~11,900 (Legal & Professional globally); ~9,800 (Risk Solutions)'],
  ['e.g. Series C / Public / PE-backed', 'Subsidiary — owned by RELX plc (LSE/NYSE: REL)'],
  ['e.g. $50M raised Q3 2025', 'N/A (part of RELX plc)'],
  ['e.g. Andreessen Horowitz, Sequoia', 'N/A (RELX plc is parent; publicly traded)'],
  ['Year', '1970'],
  [
    'Shared investors, advisors, or board members? Team network overlaps (former colleagues, mutual connections)? Note name, relationship, and whether an intro is worth pursuing.',
    'No direct shared investors with You.com. Databricks co-sell available via AE Andrew Lupton (andrew.lupton@databricks.com). Run CTD tool before cold outreach.'
  ],
  [
    'One or two sentences: what does this company do and why do they exist?',
    'LexisNexis is a global information and analytics company providing AI-powered legal research, business intelligence, regulatory data, risk management, and workflow solutions. Flagship products include Lexis+ with Protege (agentic legal AI assistant), Nexis+ AI (business intelligence with GenAI), and LexisNexis Risk Solutions. They serve law firms, corporate legal departments, government agencies, and financial institutions in 150+ countries.'
  ],
  [
    'What problems are they likely experiencing that we solve? What friction exists in their current stack or workflow? Reference job postings, reviews, or intel from Clay.',
    '1. Open-web grounding gap: Protege General AI and Nexis+ AI surface open-web insights — need reliable real-time web search layer. 2. Multi-model AI: runs GPT-5, Claude Sonnet, GPT-4o, o3 concurrently — needs model-agnostic search API. 3. Hallucination accuracy: Min Chen (Chief AI Officer) says hallucination has concrete consequences in legal AI. 4. Competitive pressure from Thomson Reuters (CoCounsel) and Harvey AI.'
  ],
  [
    "What makes them a strong ICP fit? What specific value do we provide or problem do we solve for them? What's the hook?",
    "You.com's AI Search API powers the open-web retrieval layer inside Protege General AI and Nexis+ AI — delivering cited, real-time web results that meet their responsible-AI standards, without building a web crawler. Model-agnostic, matching their multi-LLM architecture (GPT-5, Claude, Mistral). Direct ICP: they already explicitly surface open-web results and need enterprise-grade infrastructure for it."
  ],

  // Section 3 - Tech Stack (unique row headers)
  ['Competitor 1', 'AI Models / LLMs'],
  ['Competitor 2', 'Search / RAG Infrastructure'],
  ['Partner / Integration', 'Cloud Infrastructure'],

  // Section 3 - Trigger Events (unique descriptions)
  ['e.g. Raised Series B - $45M led by Accel Partners', 'Lexis+ AI rebranded to Lexis+ with Protege (Feb 2026) — now explicitly ships open-web grounding inside Protege General AI and Nexis+ AI. Creates direct infrastructure need for a high-quality web search API.'],
  ['MM/YYYY', '02/2026'],
  ['Hot / Warm / Monitor', 'Hot'],
  ['e.g. New VP of AI Engineering hired from Google DeepMind', 'RELX signed put option to acquire Doctrine (European legal AI platform) on April 28, 2026. Signals aggressive AI capability expansion; will need open-web search API in additional languages.'],
  ['e.g. Acquired DataCo; expanding AI division to 3x headcount', 'Nexis+ AI launched Next Generation Search (January 30, 2025) — conversational search across licensed AND open-web sources. Open-web component is an active product priority.'],

  // Section 4 - Outreach Plan
  ['No / Yes – https://...', 'No'],
  ['Yes / Not yet — planned start: MM/DD', 'Not yet — planned start: TBD'],
  ['Connected / Pending / Not yet sent', 'Not yet sent'],
  ['https://…', 'N/A'],
  ['Yes / No – campaign name:', 'No'],
  [
    'Write your 1-2 sentence personalized hook. Reference a specific piece of intel (news, competitor, event, or persona detail) that makes this outreach relevant to THIS account right now.',
    "LexisNexis just rebranded Lexis+ AI to Lexis+ with Protege and is now explicitly shipping open-web grounding inside Protege General AI and Nexis+ AI. The challenge: web search quality and citability become load-bearing for your legal AI's accuracy story — and building that crawler in-house is a distraction from your core content advantage. You.com's AI Search API is the enterprise-grade web retrieval layer that drops into your existing Agentic RAG pipeline, works across your multi-model stack (GPT-5, Claude, Mistral), and delivers cited results that meet your responsible-AI standards."
  ],
  [
    'Any shared connections, investors, or advisors who could make an intro? Note name and relationship.',
    'No direct shared investors. Databricks co-sell: coordinate with Andrew Lupton (andrew.lupton@databricks.com). Run CTD tool before outreach.'
  ],
  [
    'Timing considerations, sensitivities, rep-specific tactics, competitive objections to prepare for.',
    'DEDUP: 19 contacts already in SF, active sequences running (Lockbox Campaign, NYC Dinner, LexisNexis x You.com follow-up on 05/27). Check before adding new contacts. Min Chen has no email in Apollo — may need LinkedIn outreach. Greg Dickason email is Australian regional address — verify before sending. Databricks co-sell available via Andrew Lupton.'
  ],

  // Section 5 - Open Opportunity
  ['Yes / No', 'No'],
  ['As it appears in Salesforce', 'N/A — no open opportunity'],
  ['e.g. Discovery / Evaluation / Negotiation', 'N/A'],
  ['e.g. $80K ARR', 'N/A'],
  ['e.g. Technical demo scheduled / Proposal sent / Awaiting legal review', 'N/A — no open opportunity'],
  [
    'Names, titles, and roles in the decision (Champion, Economic Buyer, Legal, Procurement, etc.)',
    'N/A — no open opportunity. Key SF contacts: Justin Fagden (Strategic Partnerships), Jeff Reihl (Technology Chairman), Bob Perry (VP Software Engineering), Serena Wellen (VP Product Management), Jeff Jenkins (CISO)'
  ],
  [
    'What objections has the AE heard? What is blocking progress? What competitors are being considered in parallel?',
    'N/A — no open opportunity. Note: Active sequences already running on lower-level contacts. Min Chen and Greg Dickason (primary buying committee) not yet reached.'
  ],
  [
    'What does the AE need to move this deal forward? Case study, competitive one-pager, reference customer intro, tailored content, or other asset?',
    'N/A — no open opportunity. If engaged: Harvey AI case study or legal tech customer reference would be most relevant for LexisNexis context.'
  ],
];

async function doReplace(page, findText, replaceText) {
  const findInput = page.locator('input[aria-label="Find"]');
  const replaceInput = page.locator('input[aria-label="Replace with"]');
  const replaceAllBtn = page.locator('button:has-text("Replace all")');

  await findInput.click({ clickCount: 3 });
  await findInput.fill(findText);
  await page.waitForTimeout(300);

  await replaceInput.click({ clickCount: 3 });
  await replaceInput.fill(replaceText);
  await page.waitForTimeout(300);

  await replaceAllBtn.click();
  await page.waitForTimeout(800);
  console.log(`  ✓ Replaced: "${findText.substring(0, 50)}..."`);
}

async function fillBuyingCommittee(page) {
  // Close Find & Replace dialog first
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const contacts = [
    { name: 'Min Chen', title: 'SVP & Chief AI Officer', email: 'No email found in Apollo (LinkedIn: linkedin.com/in/minchen2)', linkedin: 'https://www.linkedin.com/in/minchen2/', first: 'No' },
    { name: 'Greg Dickason', title: 'CTO & EVP', email: 'greg.dickason@lexisnexis.com.au (verify)', linkedin: 'https://www.linkedin.com/in/greg-dickason-633920/', first: 'No' },
    { name: 'Anshul [last name TBC]', title: 'Senior Director, Global AI Workflows, Strategy & Operations', email: 'Not found in Apollo', linkedin: 'Not found', first: 'No' },
    { name: 'Maura [last name TBC]', title: 'VP, Legal AI & Protege Global Marketing', email: 'Not found in Apollo', linkedin: 'Not found', first: 'No' },
    { name: 'Philippe [last name TBC]', title: 'CTO, Risk Solutions', email: 'Not found in Apollo', linkedin: 'Not found', first: 'No' },
  ];

  // Use Find & Replace to handle the buying committee rows
  // Since all rows have identical placeholder text, we'll replace them one at a time
  // by using "Replace" (not "Replace all")

  // Open Find & Replace
  await page.keyboard.press('Meta+Shift+H');
  await page.waitForTimeout(1000);

  const findInput = page.locator('input[aria-label="Find"]');
  const replaceInput = page.locator('input[aria-label="Replace with"]');
  const replaceBtn = page.locator('button:has-text("Replace")').first(); // "Replace" not "Replace all"
  const replaceAllBtn = page.locator('button:has-text("Replace all")');

  // Replace "First Last" one at a time for each contact
  for (const contact of contacts) {
    await findInput.click({ clickCount: 3 });
    await findInput.fill('First Last');
    await replaceInput.click({ clickCount: 3 });
    await replaceInput.fill(contact.name);
    await replaceBtn.click(); // Replace first occurrence only
    await page.waitForTimeout(500);
  }

  // Replace "VP / Director of..." one at a time
  for (const contact of contacts) {
    await findInput.click({ clickCount: 3 });
    await findInput.fill('VP / Director of...');
    await replaceInput.click({ clickCount: 3 });
    await replaceInput.fill(contact.title);
    await replaceBtn.click();
    await page.waitForTimeout(500);
  }

  // Replace "email@company.com" one at a time
  for (const contact of contacts) {
    await findInput.click({ clickCount: 3 });
    await findInput.fill('email@company.com');
    await replaceInput.click({ clickCount: 3 });
    await replaceInput.fill(contact.email);
    await replaceBtn.click();
    await page.waitForTimeout(500);
  }

  // Replace "linkedin.com/in/..." one at a time
  for (const contact of contacts) {
    await findInput.click({ clickCount: 3 });
    await findInput.fill('linkedin.com/in/...');
    await replaceInput.click({ clickCount: 3 });
    await replaceInput.fill(contact.linkedin);
    await replaceBtn.click();
    await page.waitForTimeout(500);
  }

  // Replace "Yes / No" with "No" for all 5 rows (Replace all is fine here)
  await findInput.click({ clickCount: 3 });
  await findInput.fill('Yes / No');
  await replaceInput.click({ clickCount: 3 });
  await replaceInput.fill('No');
  await replaceAllBtn.click();
  await page.waitForTimeout(500);

  console.log('  ✓ Buying committee filled');
}

async function fillTechStack(page) {
  const findInput = page.locator('input[aria-label="Find"]');
  const replaceInput = page.locator('input[aria-label="Replace with"]');
  const replaceBtn = page.locator('button').filter({ hasText: /^Replace$/ });

  const tools = [
    'OpenAI GPT-5, GPT-4o, o3; Claude Sonnet 4; Mistral (fine-tuned SLMs)',
    'Proprietary Agentic RAG (LexisNexis-built)',
    'Microsoft Azure (for LLM hosting and Copilot integrations)',
  ];
  const howId = [
    'LexisNexis press releases; Min Chen interview (Artificial Lawyer, Dec 2025)',
    'LexisNexis product documentation',
    'Microsoft 365/Copilot integrations announced',
  ];
  const confidence = ['High', 'High', 'Medium'];
  const impact = [
    'Multi-model architecture means You.com API must be model-agnostic — strong fit signal',
    'You.com Search API slots into their RAG pipeline as the open-web retrieval layer',
    'You.com API callable from Azure-hosted services',
  ];

  for (let i = 0; i < 3; i++) {
    // Replace "e.g. SerpApi" one at a time
    await findInput.click({ clickCount: 3 });
    await findInput.fill('e.g. SerpApi');
    await replaceInput.click({ clickCount: 3 });
    await replaceInput.fill(tools[i]);
    await replaceBtn.click();
    await page.waitForTimeout(500);

    // Replace "e.g. LinkedIn post, Clay" one at a time
    await findInput.click({ clickCount: 3 });
    await findInput.fill('e.g. LinkedIn post, Clay');
    await replaceInput.click({ clickCount: 3 });
    await replaceInput.fill(howId[i]);
    await replaceBtn.click();
    await page.waitForTimeout(500);

    // Replace "Confirmed / Suspected" one at a time
    await findInput.click({ clickCount: 3 });
    await findInput.fill('Confirmed / Suspected');
    await replaceInput.click({ clickCount: 3 });
    await replaceInput.fill(confidence[i]);
    await replaceBtn.click();
    await page.waitForTimeout(500);

    // Replace "Displacement / Integration" one at a time
    await findInput.click({ clickCount: 3 });
    await findInput.fill('Displacement / Integration');
    await replaceInput.click({ clickCount: 3 });
    await replaceInput.fill(impact[i]);
    await replaceBtn.click();
    await page.waitForTimeout(500);
  }

  console.log('  ✓ Tech stack filled');
}

(async () => {
  console.log('Launching Chrome with existing profile...');

  const browser = await chromium.launchPersistentContext(CHROME_USER_DATA, {
    channel: 'chrome',
    headless: false,
    args: [`--profile-directory=${CHROME_PROFILE}`],
    slowMo: 50,
  });

  const page = await browser.newPage();

  try {
    console.log(`Opening Google Doc: ${DOC_URL}`);
    await page.goto(DOC_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check we're on the right page
    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Open Find & Replace
    console.log('Opening Find & Replace...');
    await page.keyboard.press('Meta+Shift+H');
    await page.waitForTimeout(2000);

    const findInput = page.locator('input[aria-label="Find"]');
    const isVisible = await findInput.isVisible().catch(() => false);
    if (!isVisible) {
      console.error('Find & Replace dialog not found!');
      // Try via menu
      await page.click('text=Edit');
      await page.waitForTimeout(500);
      await page.click('text=Find and replace');
      await page.waitForTimeout(1000);
    }

    // Do all unique replacements
    console.log('Running replacements...');
    for (const [find, replace] of REPLACEMENTS) {
      await doReplace(page, find, replace);
    }

    // Fill buying committee
    console.log('Filling buying committee...');
    await fillBuyingCommittee(page);

    // Fill tech stack
    console.log('Filling tech stack...');
    await fillTechStack(page);

    // Close dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);

    // Rename document
    const titleInput = page.locator('input[aria-label="Rename"]');
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.click({ clickCount: 3 });
      await titleInput.fill('LexisNexis ABM Account Research - Finalized');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }

    console.log('\n✅ Done! Document filled successfully.');
    console.log(`URL: ${DOC_URL}`);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
