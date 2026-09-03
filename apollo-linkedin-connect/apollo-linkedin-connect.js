#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// --- Config ---
const DRY_RUN = process.env.DRY_RUN === 'true';
const DELAY_MIN = parseInt(process.env.DELAY_MIN || '8000', 10);
const DELAY_MAX = parseInt(process.env.DELAY_MAX || '12000', 10);
// Dedicated Playwright profile — same pattern as ~/.apollo-playwright-profile for Apollo
// Run save-session.js once to log in; profile persists across restarts indefinitely
const LINKEDIN_PROFILE = path.join(process.env.HOME, '.linkedin-playwright-profile');
const STATS_FILE = path.join(__dirname, 'linkedin-run-stats.json');

const DAILY_CONNECT_CAP = parseInt(process.env.DAILY_CONNECT_CAP || '40', 10);
const WEEKLY_CONNECT_CAP = parseInt(process.env.WEEKLY_CONNECT_CAP || '200', 10);

// --- Salesforce activity logging ---
// Apollo's CRM sync only pushes EMAIL steps to Salesforce, so every LinkedIn connect,
// DM, and post-like was invisible in SFDC: the script's only record was an Apollo
// contact note. These write a real Task against the contact so LinkedIn touches show
// up in activity history alongside the [Apollo] and [Gong] email records.
// Set SFDC_LOG=false to disable.
const { execFile } = require('child_process');
const SFDC_LOG_ENABLED = process.env.SFDC_LOG !== 'false';
const SFDC_ORG = process.env.SFDC_USERNAME || 'andrew.miller-mckeever@you.com';
const SFDC_OWNER_ID = process.env.SFDC_USER_ID || '005Vq000009j4ezIAA';
// SFDC_API_VERSION is set as "66.0" in the environment, with no leading "v". The
// REST path needs "v66.0", so an unnormalized value produced /services/data/66.0/...
// and a 404 that looked like an auth problem. Normalize rather than trust the env.
const SFDC_API_VERSION = (() => {
  const raw = (process.env.SFDC_API_VERSION || '64.0').trim();
  return raw.startsWith('v') ? raw : `v${raw}`;
})();
let sfdcAuth = null;

// Controlled-testing limits (added 2026-07-30 for supervised verification runs).
// TASK_LIMIT caps how many tasks a single run will process. ONLY_TYPE restricts the run
// to one Apollo task type. Both default to unrestricted, and both log what they dropped.
const TASK_LIMIT = parseInt(process.env.TASK_LIMIT || '0', 10);
const ONLY_TYPE = process.env.ONLY_TYPE || '';
// ONLY_CONTACT restricts a run to a single contact (Apollo contact id, or a name substring).
// Used for supervised one-person verification runs.
const ONLY_CONTACT = process.env.ONLY_CONTACT || '';
const ANDREW_USER_ID = '69c2b4822d0a4900117855af';

// Apollo task type for "LinkedIn - interact with post" sequence steps (Touch 5).
// Apollo's REST API returns this as 'linkedin_step_interact_post' — a distinct type,
// not 'action_item' as initially assumed before querying a live sequence step.
const LINKEDIN_INTERACT_POST_TYPE = 'linkedin_step_interact_post';

// Newer sequences (Docker, usage V2) surface Touch-5-style engagement steps as
// 'linkedin_step_view_profile'. Handled identically to interact_post: visit
// profile, like most recent post (last 14 days), mark complete regardless.
const LINKEDIN_VIEW_PROFILE_TYPE = 'linkedin_step_view_profile';

// Fallback: sequences built before the dedicated step types were known surface
// as action_item with one of these note markers. Markers are chosen so that
// non-engagement action items (e.g. "SQL follow up") never match.
const POST_LIKE_NOTE_MARKERS = [
  'Like most recent LinkedIn post',   // original marker (pre-2026-06 sequences)
  'Like or comment on a recent post', // usage V2 / Workato / Dataiku sequences
  'engage 1-2 recent posts',          // whale-account Touch 5 variant
];

// Single source of truth for "is this a Touch-5 post-engagement task" —
// used by the fetch filter, the summary grouping, and the handler branch.
function isPostEngagementTask(t) {
  return t.type === LINKEDIN_INTERACT_POST_TYPE ||
         t.type === LINKEDIN_VIEW_PROFILE_TYPE ||
         (t.type === 'action_item' && POST_LIKE_NOTE_MARKERS.some((m) => (t.note || '').includes(m)));
}

// DM overrides: contact_id → dm_text (bypasses Apollo custom-field template lookup)
// Used when {{contact.Draft LinkedIn Message XXXX}} fields are not yet populated in Apollo.
const DM_OVERRIDES_FILE = path.join(__dirname, 'dm-overrides.json');
// Per-contact Touch-2 connect notes, used when the campaign's connect step has no
// note text. Same pattern as dm-overrides.json: keyed by Apollo contact id.
const CONNECT_OVERRIDES_FILE = path.join(__dirname, 'connect-overrides.json');
let DM_OVERRIDES = {};
try {
  const raw = fs.readFileSync(DM_OVERRIDES_FILE, 'utf-8');
  const parsed = JSON.parse(raw);
  // Strip the _note key if present
  DM_OVERRIDES = Object.fromEntries(Object.entries(parsed).filter(([k]) => !k.startsWith('_')));
  if (Object.keys(DM_OVERRIDES).length > 0) {
    console.log(`[INFO] Loaded ${Object.keys(DM_OVERRIDES).length} DM overrides from dm-overrides.json`);
  }
} catch (e) {
  // File doesn't exist or can't be parsed — run without overrides
}

let CONNECT_OVERRIDES = {};
try {
  const raw = fs.readFileSync(CONNECT_OVERRIDES_FILE, 'utf-8');
  const parsed = JSON.parse(raw);
  CONNECT_OVERRIDES = Object.fromEntries(Object.entries(parsed).filter(([k]) => !k.startsWith('_')));
  if (Object.keys(CONNECT_OVERRIDES).length > 0) {
    console.log(`[INFO] Loaded ${Object.keys(CONNECT_OVERRIDES).length} connect-note overrides from connect-overrides.json`);
  }
} catch (e) {
  // File doesn't exist or can't be parsed — run without overrides
}

// --- Logging ---
const log = {
  info: (...a) => console.log(`[INFO]`, ...a),
  ok:   (...a) => console.log(`[OK]`, ...a),
  warn: (...a) => console.log(`[WARN]`, ...a),
  err:  (...a) => console.error(`[ERR]`, ...a),
  dry:  (...a) => console.log(`[DRY_RUN]`, ...a),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDelay = () => sleep(DELAY_MIN + Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN)));

// --- Results tracking ---
const results = {
  connects_sent: [],
  dms_sent: [],
  posts_liked: [],
  posts_skipped_no_content: [],
  skipped_cap: [],
  skipped_already: [],         // already connected / pending
  skipped_no_url: [],          // contact has no LinkedIn URL — completed to advance the sequence
  skipped_not_connected: [],   // DM target not yet connected
  skipped_placeholder: [],     // DM has unfilled [BRACKETS]
  blocked_wrong_thread: [],    // DM aborted — could not prove the open chat belonged to the target
  dm_undeliverable: [],        // no channel could reach them; task advanced anyway
  sfdc_logged: [],             // LinkedIn activity written to Salesforce
  sfdc_skipped: [],            // could not write SFDC activity (no id / no auth / API error)
  errors: [],
};

/**
 * Run ledger + circuit breaker (added 2026-07-30).
 *
 * On 2026-07-28 a stale LinkedIn chat overlay caused 9 of 12 DMs to be typed into
 * the FIRST recipient's thread (Jordan Soldo got 4 people's messages, Josh Lucas got 4).
 * Every task still reported success and was marked complete, so nothing retried.
 *
 * The ledger records which contact each verified conversation received a message for.
 * If one conversation is ever about to receive a second contact's message, the whole
 * run aborts immediately rather than continuing to cross-send.
 */
const threadLedger = new Map(); // normalized conversation name -> { contactId, contactName }
let runAborted = false;
let runAbortReason = '';

// ============================================================
//  APOLLO REST API HELPERS
// ============================================================

function apolloHeaders() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) { log.err('APOLLO_API_KEY env var is not set'); process.exit(1); }
  return { 'X-Api-Key': key, 'Content-Type': 'application/json' };
}

/**
 * Fetch all of Andrew's pending LinkedIn tasks.
 *
 * Both `task_types` and `assignee_ids` API filters are broken — they return all
 * 15,000+ org-wide tasks regardless. We fetch sorted DESC by due date and filter
 * client-side for Andrew's user_id + LinkedIn task types + status=scheduled.
 *
 * Stops after 3 consecutive pages with zero matching tasks, or after 30 pages.
 * Returns tasks sorted oldest-due-first (process overdue first).
 */
async function fetchAndrewLinkedInTasks() {
  log.info('Fetching LinkedIn tasks from Apollo REST API...');
  const allTasks = [];
  let emptyPageStreak = 0;

  for (let page = 1; page <= 30; page++) {
    const resp = await fetch('https://api.apollo.io/api/v1/tasks/search', {
      method: 'POST',
      headers: apolloHeaders(),
      body: JSON.stringify({
        // Scope directly to Andrew. Without this, the search returns the full
        // ~16k org-wide queue and Andrew's tasks sit past the early-stop cutoff,
        // so the client-side filter never sees them (fetch returns 0). The
        // user_ids filter DOES work at the API (unlike the broken assignee_ids).
        user_ids: [ANDREW_USER_ID],
        sort_by_field: 'task_due_at',
        sort_ascending: false,
        per_page: 100,
        page,
      }),
    });

    if (!resp.ok) {
      log.err(`Task search failed on page ${page}: HTTP ${resp.status}`);
      break;
    }

    const data = await resp.json();
    const pageTasks = data.tasks || [];

    const matching = pageTasks.filter((t) =>
      t.user_id === ANDREW_USER_ID &&
      (t.type === 'linkedin_step_connect' ||
       t.type === 'linkedin_step_message' ||
       isPostEngagementTask(t)) &&
      t.status === 'scheduled'
    );

    if (matching.length === 0) {
      emptyPageStreak++;
      log.info(`  Page ${page}: 0 matching (streak: ${emptyPageStreak})`);
      // Don't stop early until page 10 — Andrew's tasks are on pages 5-8
      // (pages 1-4 are all teammates' tasks with a different user_id)
      if (page >= 10 && emptyPageStreak >= 3) {
        log.info('  3 consecutive empty pages after page 10 — stopping fetch');
        break;
      }
    } else {
      emptyPageStreak = 0;
      allTasks.push(...matching);
      log.info(`  Page ${page}: ${matching.length} matching (running total: ${allTasks.length})`);
    }

    if (pageTasks.length < 100) {
      log.info('  Last page of results reached');
      break;
    }
  }

  // ONEOFF_CONTACT_ID re-does a Touch 7 whose Apollo task is already completed.
  // The task record is bookkeeping; when a send failed for a bug rather than for
  // unreachability, the message still needs to go out. This runs the SAME verified
  // send path with no task attached, so there is no second implementation to drift.
  const oneoff = (process.env.ONEOFF_CONTACT_ID || '').trim();
  if (oneoff) {
    // Fetch by id. contacts/search does not resolve an id passed as a keyword.
    const resp = await fetch(`https://api.apollo.io/v1/contacts/${encodeURIComponent(oneoff)}`, {
      headers: apolloHeaders(),
    }).catch(() => null);
    const data = resp && resp.ok ? await resp.json().catch(() => ({})) : {};
    const c = data.contact || null;
    if (!c) { log.err(`ONEOFF_CONTACT_ID=${oneoff} — contact not found in Apollo`); return []; }
    log.warn(`ONEOFF mode: ${c.name} <${c.email || 'no email'}> — no Apollo task will be modified`);
    return [{ id: null, type: 'linkedin_step_message', due_at: new Date().toISOString(), emailer_campaign_id: null, contact: c }];
  }

  // ONLY_CONTACT limits a run to one person (name or Apollo contact id). Used to
  // prove a send path on a single contact before spending InMail credits at scale.
  const only = (process.env.ONLY_CONTACT || '').trim().toLowerCase();
  if (only) {
    const before = allTasks.length;
    const filtered = allTasks.filter((t) => {
      const c = t.contact || {};
      return String(c.id || '').toLowerCase() === only
        || String(c.name || '').toLowerCase().includes(only);
    });
    log.warn(`ONLY_CONTACT="${process.env.ONLY_CONTACT}" — ${filtered.length} of ${before} tasks kept`);
    return filtered.sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  }

  // Sort oldest due_at first — process overdue tasks before upcoming ones
  return allTasks.sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
}

/**
 * Fetch the LinkedIn step template body from a campaign.
 * Returns empty string for connect steps with no note — that's valid (send without note).
 *
 * 3-step lookup:
 *   emailer_steps[] → find step with matching type
 *   emailer_touches[] → find touch with emailer_step_id == step.id
 *   emailer_templates[] → find template with id == touch.emailer_template_id
 */
const campaignCache = {};

async function getLinkedInTemplate(campaignId, taskType) {
  if (!campaignCache[campaignId]) {
    const resp = await fetch(`https://api.apollo.io/v1/emailer_campaigns/${campaignId}`, {
      headers: apolloHeaders(),
    });
    if (!resp.ok) {
      log.warn(`Could not fetch campaign ${campaignId}: HTTP ${resp.status}`);
      return '';
    }
    campaignCache[campaignId] = await resp.json();
  }

  const data = campaignCache[campaignId];
  const step = (data.emailer_steps || []).find((s) => s.type === taskType);
  if (!step) {
    log.warn(`No step of type "${taskType}" found in campaign ${campaignId}`);
    return '';
  }
  const touch = (data.emailer_touches || []).find((t) => t.emailer_step_id === step.id);
  if (!touch) {
    log.warn(`No touch found for step ${step.id} in campaign ${campaignId}`);
    return '';
  }
  const template = (data.emailer_templates || []).find((t) => t.id === touch.emailer_template_id);
  return template?.body_text || '';
}

/**
 * Substitute template variables. Both {{first_name}} (newer sequences) and
 * {{contact.first_name}} (older sequences) formats are used in Apollo.
 * Also strips em dashes (—) and replaces with a comma+space, since LinkedIn DMs
 * go out as plain text and em dashes look unprofessional / break some clients.
 */
function renderTemplate(text, contact) {
  if (!text) return '';
  return text
    .replace(/\{\{contact\.first_name\}\}/g, contact.first_name || '')
    .replace(/\{\{contact\.last_name\}\}/g, contact.last_name || '')
    .replace(/\{\{contact\.name\}\}/g, contact.name || '')
    .replace(/\{\{first_name\}\}/g, contact.first_name || '')
    .replace(/\{\{last_name\}\}/g, contact.last_name || '')
    .replace(/\s*—\s*/g, ', ');  // em dash → comma (e.g. "Hey Elise — Staff PM" → "Hey Elise, Staff PM")
}

/**
 * Mark an Apollo task as completed via REST.
 * Note: URL path is /v1/ (NOT /api/v1/)
 */
async function markTaskComplete(taskId) {
  // ONEOFF runs carry no Apollo task: the task was already logged complete, the
  // message itself just was not delivered. Nothing to update in that case.
  if (!taskId) { log.info('No Apollo task attached (one-off run) — nothing to mark complete'); return true; }
  if (DRY_RUN) {
    log.dry(`Would mark task ${taskId} complete`);
    return true;
  }
  const resp = await fetch(`https://api.apollo.io/v1/tasks/${taskId}`, {
    method: 'PUT',
    headers: apolloHeaders(),
    body: JSON.stringify({ status: 'completed' }),
  });
  if (!resp.ok) {
    log.warn(`Failed to mark task ${taskId} complete: HTTP ${resp.status}`);
    return false;
  }
  log.ok(`Task ${taskId} marked complete`);
  return true;
}

/**
 * Fetch a Salesforce access token from the already-authenticated sf CLI.
 * Called once per run. Failure is non-fatal: LinkedIn work still happens, the
 * SFDC Task is just skipped and reported in the summary.
 */
async function initSfdcAuth() {
  if (!SFDC_LOG_ENABLED) return null;
  // Resolve the sf binary by absolute path. launchd does not inherit a login PATH,
  // so a bare 'sf' silently fails there and every scheduled run wrote ZERO
  // Salesforce records while still reporting success. Same root cause as the
  // APOLLO_API_KEY bug: never assume a login shell's environment in a launchd job.
  const SF_CANDIDATES = [
    process.env.SF_CLI_PATH,
    '/Users/andrew/.nvm/versions/node/v24.14.1/bin/sf',
    '/opt/homebrew/bin/sf',
    '/usr/local/bin/sf',
    'sf',
  ].filter(Boolean);
  const sfBin = SF_CANDIDATES.find((c) => c === 'sf' || fs.existsSync(c)) || 'sf';
  if (sfBin === 'sf') {
    log.warn('Could not resolve an absolute path to the sf CLI — Salesforce logging may fail under launchd');
  }
  // sf ships with a `#!/usr/bin/env -S node` shebang, so it needs `node` on PATH.
  // Under launchd PATH is minimal and the spawn dies with "env: node: No such file".
  // Derive the node bin directory from the running interpreter, which is always right.
  const nodeBin = path.dirname(process.execPath);
  const spawnEnv = {
    ...process.env,
    PATH: [nodeBin, process.env.PATH || '', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
      .filter(Boolean).join(':'),
  };
  return new Promise((resolve) => {
    execFile(sfBin, ['org', 'display', '--target-org', SFDC_ORG, '--verbose', '--json'],
      { timeout: 45000, maxBuffer: 4 * 1024 * 1024, env: spawnEnv }, (err, stdout) => {
        if (err) { log.warn(`Salesforce auth failed (${err.message}) — LinkedIn activity will NOT be logged to SFDC`); return resolve(null); }
        try {
          // sf can print an update-available notice before the JSON body.
          const body = stdout.slice(stdout.indexOf('{'));
          const r = JSON.parse(body).result || {};
          if (!r.accessToken || !r.instanceUrl) { log.warn('Salesforce auth returned no token — activity will NOT be logged to SFDC'); return resolve(null); }
          resolve({ token: r.accessToken, instanceUrl: r.instanceUrl });
        } catch (e) { log.warn(`Salesforce auth parse failed: ${e.message}`); resolve(null); }
      });
  });
}

/**
 * Write a completed LinkedIn Task to Salesforce against the contact.
 * Requires the Apollo contact to carry a Salesforce contact id; PLG-created
 * contacts that never synced will not have one, which is reported, not fatal.
 */
async function logSfdcActivity(contact, subject, description) {
  if (!SFDC_LOG_ENABLED) return;
  if (DRY_RUN) { log.dry(`Would log SFDC Task for ${contact.name}: "${subject}"`); return; }
  if (!sfdcAuth) { results.sfdc_skipped.push({ name: contact.name, reason: 'no salesforce auth' }); return; }

  // Apollo's salesforce_contact_id is often empty even when the contact exists in
  // Salesforce (Aidan Quest was skipped this way while sitting in SFDC under the
  // same email). Fall back to an email lookup before giving up, so an Apollo sync
  // gap does not silently drop the activity record.
  let whoId = contact.salesforce_contact_id || contact.salesforce_id;
  let whatId = contact.salesforce_account_id || null;

  if (!whoId && contact.email && sfdcAuth) {
    const soql = `SELECT Id, AccountId FROM Contact WHERE Email='${String(contact.email).replace(/'/g, "\\'")}' LIMIT 1`;
    const lookup = await fetch(
      `${sfdcAuth.instanceUrl}/services/data/${SFDC_API_VERSION}/query?q=${encodeURIComponent(soql)}`,
      { headers: { Authorization: `Bearer ${sfdcAuth.token}` } },
    ).catch(() => null);
    if (lookup && lookup.ok) {
      const found = await lookup.json().catch(() => ({}));
      const rec = (found.records || [])[0];
      if (rec) {
        whoId = rec.Id;
        if (!whatId) whatId = rec.AccountId || null;
        log.info(`Resolved ${contact.name} in Salesforce by email (${contact.email})`);
      }
    }
  }

  if (!whoId) {
    log.warn(`No Salesforce contact for ${contact.name} (${contact.email || 'no email'}) — SFDC activity not logged`);
    results.sfdc_skipped.push({ name: contact.name, reason: 'not found in Salesforce' });
    return;
  }

  // WhatId links the activity to the ACCOUNT. Without it the Task shows on the
  // contact's timeline but is absent from the account's activity history, and any
  // account-level activity check misses it entirely. Every Apollo/Gong task on these
  // contacts carries it; the first LinkedIn tasks written here did not.
  if (!whatId) {
    log.warn(`No Salesforce account id for ${contact.name} — activity will not appear on the account timeline`);
  }

  const body = JSON.stringify({
    Subject: subject,
    Status: 'Completed',
    TaskSubtype: 'LinkedIn',
    Type: 'LinkedIn message',
    ActivityDate: new Date().toISOString().slice(0, 10),
    WhoId: whoId,
    ...(whatId ? { WhatId: whatId } : {}),
    OwnerId: SFDC_OWNER_ID,
    Description: description,
  });

  const resp = await fetch(`${sfdcAuth.instanceUrl}/services/data/${SFDC_API_VERSION}/sobjects/Task`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sfdcAuth.token}`, 'Content-Type': 'application/json' },
    body,
  }).catch((e) => { log.warn(`SFDC Task write failed for ${contact.name}: ${e.message}`); return null; });

  if (!resp || !resp.ok) {
    const detail = resp ? `HTTP ${resp.status}` : 'network error';
    log.warn(`SFDC Task not created for ${contact.name} (${detail})`);
    results.sfdc_skipped.push({ name: contact.name, reason: detail });
    return;
  }
  const out = await resp.json().catch(() => ({}));
  log.ok(`SFDC activity logged for ${contact.name} (${out.id || 'created'})`);
  results.sfdc_logged.push({ name: contact.name, id: out.id || null });
}

/**
 * Find the subject of the most recent email we sent this contact, from Salesforce.
 *
 * InMail to a non-connection requires a subject line. Rather than invent
 * prospect-facing copy, reuse the subject of the last email actually sent, so the
 * LinkedIn touch reads as a continuation of the same thread of conversation.
 *
 * Salesforce stores those as activity subjects in two shapes:
 *   "[Apollo >>] [Email] Credits offer (whenever you're ready) - [Seq: YDC | ...]"
 *   "[Gong Out] Credits offer (whenever you're ready)"
 * Both are stripped down to the bare human subject.
 */
async function getLastEmailSubject(contact) {
  if (!sfdcAuth) return null;
  const whoId = contact.salesforce_contact_id || contact.salesforce_id;
  if (!whoId) return null;

  const soql = `SELECT Subject, ActivityDate, CreatedDate FROM Task `
    + `WHERE WhoId='${whoId}' AND (Subject LIKE '[Gong Out]%' OR Subject LIKE '[Apollo >>] [Email]%') `
    + `ORDER BY CreatedDate DESC LIMIT 10`;
  const resp = await fetch(
    `${sfdcAuth.instanceUrl}/services/data/${SFDC_API_VERSION}/query?q=${encodeURIComponent(soql)}`,
    { headers: { Authorization: `Bearer ${sfdcAuth.token}` } },
  ).catch(() => null);
  if (!resp || !resp.ok) return null;
  const data = await resp.json().catch(() => ({}));

  for (const rec of data.records || []) {
    let subj = String(rec.Subject || '')
      .replace(/^\[Gong Out\]\s*/i, '')
      .replace(/^\[Apollo >>\]\s*\[Email\]\s*/i, '')
      .replace(/\s*-\s*\[Seq:[^\]]*\]\s*$/i, '')
      .replace(/^(re|fwd):\s*/i, '')
      .trim();
    // Skip automated/meaningless subjects rather than send one to a prospect.
    if (subj && subj.length >= 3 && subj.length <= 120 && !/^\(no subject\)$/i.test(subj)) {
      return subj;
    }
  }
  return null;
}

/**
 * Add a note to an Apollo contact after a LinkedIn action.
 */
async function addContactNote(contactId, noteBody) {
  if (DRY_RUN) {
    log.dry(`Would add note to contact ${contactId}: "${noteBody}"`);
    return;
  }
  const resp = await fetch('https://api.apollo.io/v1/notes', {
    method: 'POST',
    headers: apolloHeaders(),
    body: JSON.stringify({ contact_id: contactId, body: noteBody }),
  }).catch((e) => { log.warn(`Note write failed: ${e.message}`); return null; });
  if (resp && !resp.ok) {
    log.warn(`Note write returned HTTP ${resp.status} for contact ${contactId}`);
  }
}

/**
 * Returns true if the DM text contains unfilled template placeholders that
 * require manual editing before sending.
 */
function hasUnfilledPlaceholder(text) {
  if (!text) return false;
  // [ALL CAPS IN BRACKETS] — manual fill-in markers
  if (/\[[A-Z][A-Z\s]{2,}\]/.test(text)) return true;
  // Any {{...}} that isn't a known name variable — catches {{contact.Draft LinkedIn Message XXXX}} etc.
  const knownVars = ['first_name}}', 'last_name}}', 'contact.first_name}}', 'contact.last_name}}', 'contact.name}}'];
  const templateTokens = text.match(/\{\{[^}]+\}\}/g) || [];
  for (const token of templateTokens) {
    if (!knownVars.some((v) => token.endsWith(v))) return true;
  }
  return false;
}

// ============================================================
//  CONNECT CAP TRACKING
// ============================================================

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch {
    return { connects_by_date: {} };
  }
}

function saveStats(stats) {
  if (!DRY_RUN) {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  }
}

function getConnectsSentToday(stats) {
  return stats.connects_by_date[todayISO()] || 0;
}

function getConnectsSentThisWeek(stats) {
  const today = new Date();
  // Monday = day 1, Sunday = day 7
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  return Object.entries(stats.connects_by_date)
    .filter(([d]) => new Date(d) >= monday)
    .reduce((sum, [, n]) => sum + n, 0);
}

function recordConnectSent(stats) {
  const today = todayISO();
  stats.connects_by_date[today] = (stats.connects_by_date[today] || 0) + 1;
  saveStats(stats);
}

// ============================================================
//  LINKEDIN AUTOMATION (PLAYWRIGHT) — UNCHANGED FROM ORIGINAL
// ============================================================

async function detectLinkedInState(liPage) {
  await sleep(2000);

  const buttonInfo = await liPage.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')];
    return btns
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({
        tag: b.tagName,
        text: b.textContent.trim().substring(0, 60),
        ariaLabel: b.getAttribute('aria-label') || '',
        y: Math.round(b.getBoundingClientRect().y),
        inAside: !!b.closest('aside'),
        href: b.getAttribute('href') || '',
      }))
      .filter((b) => {
        const t = (b.text + ' ' + b.ariaLabel).toLowerCase();
        return t.includes('connect') || t.includes('follow') || t.includes('pending')
          || t.includes('message') || t.includes('more') || t.includes('save in sales');
      });
  }).catch(() => []);
  log.info('LinkedIn action elements:', JSON.stringify(buttonInfo, null, 0));

  const connectLinkExists = buttonInfo.some((b) =>
    b.href && b.href.includes('custom-invite') && !b.inAside
  );
  if (connectLinkExists) return 'connect';

  const hasMessage = buttonInfo.some((b) => b.text === 'Message' && !b.inAside && b.y < 600);
  const hasFollow = buttonInfo.some((b) => {
    const a = b.ariaLabel.toLowerCase();
    return (b.text === 'Follow' || a.startsWith('follow')) && !b.inAside && b.y > 100;
  });
  const hasDots = buttonInfo.some((b) => {
    const a = b.ariaLabel.toLowerCase();
    const t = b.text.toLowerCase();
    return (a === 'more' || a === 'more actions' || t === 'more' || t === 'more actions') && !b.inAside && b.y < 800;
  });

  if (hasMessage && !connectLinkExists) return 'connected';
  if (hasFollow && hasDots) return 'dots_menu';

  const hasPending = buttonInfo.some((b) => b.text === 'Pending' && !b.inAside && b.y < 550);
  if (hasPending) return 'pending';

  const hasConnectBtn = buttonInfo.some((b) => {
    const a = b.ariaLabel.toLowerCase();
    const t = b.text.toLowerCase();
    // aria-label "Invite X to connect" / "Connect with X", or button text exactly "Connect"
    return (a.includes('to connect') || a.startsWith('connect') || t === 'connect')
      && !b.inAside && b.y > 50 && b.y < 800;
  });
  if (hasConnectBtn) return 'connect';

  if (hasDots) return 'dots_menu';

  return 'unknown';
}

/**
 * After clicking Connect, handle whatever modal/dialog LinkedIn shows.
 * LinkedIn has changed their connect flow multiple times; this tries all known patterns.
 *
 * Patterns handled (in order):
 *   0. Email input (LinkedIn sometimes gates connection with email verification)
 *   1. "How do you know [Name]?" dialog (relationship selection step)
 *   2. Textarea directly visible in modal (new 2026 LinkedIn flow — no "Add a note" click)
 *   3. Old flow: "Add a note" / "Send without a note" two-button layout
 *   4. "Send without a note" alone (some variants)
 *   5. Any primary send button inside a detected modal (last resort)
 */
async function handleConnectModal(liPage, note, email) {
  await sleep(2500);

  // Pattern 0: email input
  const emailInput = liPage.locator('input[name="email"], input[placeholder*="email" i], input[type="email"]').first();
  if (await emailInput.isVisible({ timeout: 1500 }).catch(() => false)) {
    if (email) {
      log.info(`LinkedIn asking for email, entering: ${email}`);
      await emailInput.fill(email);
      await sleep(500);
      await liPage.locator('button:has-text("Send"), button[aria-label="Send invitation"]').first()
        .click().catch(() => null);
      await sleep(1500);
      return true;
    }
    log.warn('LinkedIn asking for email but no email available for this contact');
    return false;
  }

  // Pattern 1: "How do you know [Name]?" dialog
  const howKnow = liPage.locator('h2:has-text("How do you know"), h3:has-text("How do you know")').first();
  if (await howKnow.isVisible({ timeout: 1500 }).catch(() => false)) {
    log.info('"How do you know" dialog detected — selecting Other');
    const otherOption = liPage.locator('label:has-text("Other"), [data-test-connection-kind="OTHER"]').first();
    if (await otherOption.isVisible().catch(() => false)) {
      await otherOption.click();
      await sleep(500);
    }
    const proceedBtn = liPage.locator('button:has-text("Connect"), button:has-text("Continue"), button:has-text("Next")').first();
    if (await proceedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await proceedBtn.click();
      await sleep(2000);
    }
    // Fall through — note dialog may follow
  }

  // Pattern 2: textarea already visible in a modal (new LinkedIn connect flow)
  const dialogTextarea = liPage.locator(
    '[role="dialog"] textarea, dialog textarea, .artdeco-modal textarea, textarea[name="message"]'
  ).first();
  if (await dialogTextarea.isVisible({ timeout: 4000 }).catch(() => false)) {
    log.info('Direct textarea visible in modal (new LinkedIn connect flow)');
    if (note) await dialogTextarea.fill(note);
    await sleep(500);
    const sendBtn = liPage.locator(
      'button[aria-label="Send invitation"], button.artdeco-button--primary:has-text("Send"), ' +
      'button:has-text("Send now"), button:has-text("Connect"), button:has-text("Done")'
    ).first();
    if (await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      // Fallback: last button inside the dialog
      await liPage.locator('[role="dialog"] button, .artdeco-modal button').last().click().catch(() => null);
    }
    await sleep(1500);
    return true;
  }

  // Pattern 3: old two-button layout ("Add a note" / "Send without a note")
  // IMPORTANT: LinkedIn's interop-outlet shadow DOM intercepts pointer events on modal buttons,
  // so regular .click() times out. Use el.evaluate((el) => el.click()) to bypass both the
  // shadow DOM interception and any viewport constraints — same fix as the DM send button.
  const addNoteBtn = liPage.locator(
    'button:has-text("Add a note"), button:has-text("Add a message"), button:has-text("Add note")'
  ).first();
  const sendWithoutBtn = liPage.locator(
    'button:has-text("Send without a note"), button:has-text("Send without"), button:has-text("Skip")'
  ).first();

  if (await addNoteBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    log.info('Old LinkedIn modal (Add a note / Send without a note)');
    if (note) {
      await addNoteBtn.evaluate((el) => el.click());
      await sleep(1000);
      const textarea = liPage.locator('textarea').first();
      await textarea.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
      // Fill via JS — same reason: interop-outlet can block focus/fill
      await textarea.evaluate((el, text) => {
        el.focus();
        document.execCommand('selectAll');
        document.execCommand('insertText', false, text);
      }, note);
      await sleep(500);
      const sendBtn = liPage.locator('button.artdeco-button--primary:has-text("Send"), button:has-text("Send")').first();
      const sendEl = await sendBtn.elementHandle().catch(() => null);
      if (sendEl) {
        await sendEl.evaluate((el) => el.click());
      }
    } else {
      const sendWithoutEl = await sendWithoutBtn.elementHandle().catch(() => null);
      if (sendWithoutEl) {
        await sendWithoutEl.evaluate((el) => el.click());
      } else {
        // Fallback: primary button via JS
        await liPage.evaluate(() => {
          const btn = document.querySelector('button.artdeco-button--primary');
          if (btn) btn.click();
        });
      }
    }
    await sleep(1500);
    return true;
  }

  // Pattern 4: "Send without a note" alone
  if (await sendWithoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    log.info('"Send without a note" visible directly — sending');
    const sendWithoutEl = await sendWithoutBtn.elementHandle().catch(() => null);
    if (sendWithoutEl) {
      await sendWithoutEl.evaluate((el) => el.click());
    }
    await sleep(1500);
    return true;
  }

  // Pattern 5: any primary send button in a detected modal (last resort)
  const anyModalSend = liPage.locator(
    '[role="dialog"] button:has-text("Send"), [role="dialog"] button[type="submit"], ' +
    '.artdeco-modal button:has-text("Send")'
  ).first();
  if (await anyModalSend.isVisible({ timeout: 2000 }).catch(() => false)) {
    log.info('Last-resort: clicking primary send button inside modal');
    await anyModalSend.evaluate((el) => el.click());
    await sleep(1500);
    return true;
  }

  // Nothing matched — log diagnostic info for the next run
  log.warn('Connect modal did not appear — none of the known patterns matched');
  const pageState = await liPage.evaluate(() =>
    [...document.querySelectorAll('button, [role="dialog"]')]
      .filter((b) => b.offsetParent !== null)
      .slice(0, 20)
      .map((b) => ({
        tag: b.tagName,
        text: b.textContent.trim().substring(0, 60),
        ariaLabel: b.getAttribute('aria-label') || '',
      }))
  ).catch(() => []);
  log.info('Page state after failed connect click:', JSON.stringify(pageState, null, 0));
  return false;
}

async function sendConnectionRequest(liPage, note, email) {
  // Try selectors in priority order — LinkedIn has changed button/link structure over time
  let clicked = false;

  // 1. Old: <a href="...custom-invite..."> link
  const connectLink = liPage.locator('main a[href*="custom-invite"]').first();
  if (await connectLink.isVisible().catch(() => false)) {
    log.info('Found Connect link (custom-invite), clicking...');
    if (!DRY_RUN) await connectLink.click();
    else log.dry('Would click Connect link');
    clicked = true;
  }

  // 2. Button with aria-label containing "connect" (e.g. "Invite X to connect", "Connect with X")
  if (!clicked) {
    const ariaBtn = liPage.locator('main button[aria-label*="connect" i]:not([aria-label*="Sales" i])').first();
    if (await ariaBtn.isVisible().catch(() => false)) {
      log.info('Found Connect button via aria-label, clicking...');
      if (!DRY_RUN) await ariaBtn.click();
      else log.dry('Would click Connect (aria-label)');
      clicked = true;
    }
  }

  // 3. Plain "Connect" button text
  if (!clicked) {
    const textBtn = liPage.locator('main button:has-text("Connect"), main a:has-text("Connect")').first();
    if (await textBtn.isVisible().catch(() => false)) {
      log.info('Found Connect button via text, clicking...');
      if (!DRY_RUN) await textBtn.click();
      else log.dry('Would click Connect (text)');
      clicked = true;
    }
  }

  if (!clicked) {
    log.err('Could not find Connect link or button');
    return false;
  }

  if (DRY_RUN) {
    if (note) log.dry(`Would add note: "${note.substring(0, 50)}..."`);
    else log.dry('Would send without a note');
    return true;
  }

  return handleConnectModal(liPage, note, email);
}

async function handleMoreMenuConnect(liPage, note) {
  const dotsClicked = await liPage.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    for (const btn of buttons) {
      const label = btn.getAttribute('aria-label') || '';
      const text = btn.textContent.trim();
      const rect = btn.getBoundingClientRect();
      if ((label === 'More' || label === 'More actions' || text === 'More' || text === 'More actions') && rect.y < 800) {
        btn.click();
        return true;
      }
    }
    return false;
  }).catch(() => false);

  if (!dotsClicked) {
    log.warn('Could not find dots/more button');
    return false;
  }
  await sleep(1500);

  const connectOption = liPage.locator('[role="menuitem"][href*="custom-invite"], [role="menuitem"]:has-text("Connect")').first();
  const optionVisible = await connectOption.isVisible({ timeout: 3000 }).catch(() => false);
  if (!optionVisible) {
    log.warn('Connect not found in dropdown menu');
    return false;
  }

  if (DRY_RUN) {
    log.dry(`Would click Connect in More menu, then ${note ? 'add note' : 'send without note'}`);
    await liPage.keyboard.press('Escape').catch(() => null);
    return true;
  }

  await connectOption.click();
  return handleConnectModal(liPage, note, '');
}

/**
 * Close any open LinkedIn messaging overlays before starting a new DM.
 * LinkedIn's chat panel is a persistent SPA element that survives page navigation.
 * If we don't close it before moving to the next profile, the contenteditable
 * selector finds the previous contact's chat box instead of the new one, and
 * subsequent messages get typed into (and sent to) the wrong person.
 */
/**
 * Deep-scan the page for open LinkedIn message conversations.
 *
 * LinkedIn renders messaging inside shadow DOM (#interop-outlet). document.querySelectorAll
 * does NOT pierce shadow roots, so we walk the tree manually, descending into every open
 * shadowRoot. This is what the old getByRole()-based cleanup failed to reach.
 *
 * Each open conversation has a close control labelled "Close your conversation with [Name]",
 * which is the authoritative per-conversation identity signal — that name is who the compose
 * box will actually send to.
 *
 * Returns { conversationNames: string[], composeCount: number }.
 */
async function scanConversationOverlays(liPage) {
  return await liPage.evaluate(() => {
    const all = [];
    const walk = (root, depth) => {
      if (depth > 25) return;
      let els;
      try { els = root.querySelectorAll('*'); } catch (_) { return; }
      for (const el of els) {
        all.push(el);
        if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      }
    };
    walk(document, 0);

    const label = (el) => {
      const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
      const txt = (el.textContent || '').trim();
      return aria || txt;
    };

    // BUTTON only. The close control is a <button> containing a <span> with the
    // same text, so matching any element counted every open conversation twice
    // and tripped the "multiple conversations open" guardrail on a single chat.
    const conversationNames = [];
    for (const el of all) {
      if (el.tagName !== 'BUTTON') continue;
      const t = label(el);
      const m = t.match(/^Close your conversation with\s+(.+?)\s*$/i);
      if (m) conversationNames.push(m[1].trim());
    }

    let composeCount = 0;
    for (const el of all) {
      if (!el.getAttribute) continue;
      if (el.getAttribute('contenteditable') !== 'true') continue;
      const cls = String(el.className || '');
      const ph = el.getAttribute('data-placeholder') || '';
      if (cls.includes('msg-form__contenteditable') || /message/i.test(ph)) composeCount++;
    }

    return { conversationNames, composeCount };
  }).catch(() => ({ conversationNames: [], composeCount: 0 }));
}

/**
 * The signed-in account's own display name, detected once per run.
 *
 * LinkedIn now labels conversation close buttons with BOTH participants
 * ("Close your conversation with Andrew Miller-McKeever, MBA and Jane Doe").
 * Without stripping the owner's own name out, namesMatch's single-shared-token
 * fallback made every thread label match any contact who shared a token with
 * the owner — e.g. contact "Andrew Helmreich" matched a thread with "Abbi K.
 * Beckwith" purely on "andrew". That is a cross-delivery hole, so the self
 * participant is removed before any recipient comparison.
 */
let SELF_NAME = null;

async function detectSelfName(liPage) {
  return await liPage.evaluate(() => {
    const alts = [...document.querySelectorAll('img[alt]')]
      .map((i) => (i.getAttribute('alt') || '').trim())
      .filter((a) => a && !/^View\b/i.test(a));
    return alts[0] || null;
  }).catch(() => null);
}

/**
 * Remove the account owner from a two-party thread label, returning just the
 * counterpart. A participant counts as "self" only on a 2+ token overlap with
 * SELF_NAME, so a contact who merely shares a first name is never stripped.
 */
function stripSelfParticipant(threadName) {
  if (!SELF_NAME) return threadName;
  const selfTokens = nameTokens(SELF_NAME);
  if (!selfTokens.length) return threadName;
  const parts = String(threadName).split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return threadName;
  const others = parts.filter((p) => {
    const pt = nameTokens(p);
    if (!pt.length) return true;
    const overlap = pt.filter((t) => selfTokens.includes(t)).length;
    return overlap < 2;
  });
  return others.length ? others.join(' and ') : threadName;
}

/**
 * Read the connection degree from the profile top card ("1st" / "2nd" / "3rd").
 *
 * The top card renders first inside <main>, so the first degree token in its
 * innerText is the profile owner's own badge, not a recommended profile's.
 *
 * Only 1st-degree connections can be sent a normal LinkedIn DM. On 2nd/3rd
 * degree profiles the "Message" control is an InMail/premium path that never
 * opens a free compose box, which the script previously misread as a technical
 * failure (conversation_not_opened) and logged as an error.
 */
async function getProfileDegree(liPage) {
  return await liPage.evaluate(() => {
    const txt = (document.querySelector('main') || {}).innerText || '';
    const m = txt.match(/·\s*(1st|2nd|3rd\+?)/);
    return m ? m[1].replace('+', '') : null;
  }).catch(() => null);
}

/**
 * Extract the encoded member id shared by a public profile URN and a Sales
 * Navigator lead URN.
 *
 *   public profile : urn:li:fsd_profile:ACoAAAz5Tv0BGDh4P5xzvG0m0z-fx4Zu033tIlw
 *   sales nav lead : /sales/lead/ACwAAAz5Tv0BfT0EUWF1XDD2F_kC10uWQbLHBaU,...
 *
 * The third character encodes the entity type and differs (o vs w); the run that
 * follows encodes the member. Comparing that run is an exact identity check, which
 * is what makes it safe to reach a lead through a name search: the search only
 * proposes candidates, this decides.
 */
function memberKeyFromUrn(urn) {
  if (!urn) return null;
  const m = String(urn).match(/AC[a-zA-Z]A{2,}[A-Za-z0-9_-]+/);
  if (!m) return null;
  const raw = m[0];
  // Drop the 3-char type prefix, then keep the 9-char member id. Byte 12 onward is
  // a per-entity signature that differs between the profile and lead URNs, so
  // including it rejects every genuine match. Verified against a known pair:
  //   ACoAAAz5Tv0BGDh4...  ->  AAAz5Tv0B
  //   ACwAAAz5Tv0BfT0E...  ->  AAAz5Tv0B
  // A shorter member id makes the signature bleed in and the compare fail, which
  // errs toward refusing to send rather than sending to the wrong person.
  return raw.slice(3, 12) || null;
}

/**
 * Read the person's real display name from the public profile top card.
 *
 * Apollo names are frequently truncated by the PLG signup parser ("Sapir M",
 * "Akash S", "A. Tamazyan"), and a Sales Navigator keyword search on a truncated
 * name returns either nothing or the wrong people. LinkedIn's own rendering of the
 * name is authoritative, so it is what the lead search should use.
 */
async function getProfileDisplayName(liPage) {
  return await liPage.evaluate(() => {
    const h = document.querySelector('main h1');
    if (h && h.textContent.trim()) return h.textContent.trim();
    const txt = (document.querySelector('main') || {}).innerText || '';
    const first = txt.split('\n').map((l) => l.trim()).filter(Boolean)[0];
    return first || null;
  }).catch(() => null);
}

/** Read the profile URN off the profile's Message link (most reliable source). */
async function getProfileUrn(liPage) {
  return await liPage.evaluate(() => {
    // DANGER, read before editing. This returns the identity anchor that every
    // downstream recipient check is compared against. If it returns the wrong
    // person, all three Sales Navigator checks "pass" against a stranger.
    //
    // The old version took the first `main a` with a profileUrn. LinkedIn puts
    // "People also viewed" cards inside <main>, each with its own Message link, so
    // on any profile lacking its OWN Message button (i.e. every non-connection) the
    // first match was a sidebar stranger. Verified on Frank Munz, where it returned
    // the URN behind aria-label "Message Carine Oliveira".
    //
    // Rules now: ignore anything inside <aside>, and require every remaining
    // candidate to agree on one member id. Disagreement or absence returns null,
    // which makes the caller abort rather than guess.
    const own = [...document.querySelectorAll('main a')].filter((el) => {
      if (el.closest('aside')) return false;
      return /profileUrn=/.test(el.getAttribute('href') || '');
    });
    if (!own.length) return null;

    const urns = [...new Set(own.map((el) => {
      const m = decodeURIComponent(el.getAttribute('href'))
        .match(/profileUrn=urn:li:fsd_profile:([A-Za-z0-9_-]+)/);
      return m ? m[1] : null;
    }).filter(Boolean))];

    if (urns.length !== 1) return null;   // ambiguous: refuse to pick one
    return urns[0];
  }).catch(() => null);
}


/**
 * Send a direct linkedin.com DM via the profile's own compose URL.
 *
 * Why this exists: the overlay-based path (sendDirectMessage) requires a
 * "Close your conversation with X" control to prove the recipient, and LinkedIn no
 * longer renders that label, so every direct DM failed with conversation_not_opened
 * and fell through to Sales Navigator.
 *
 * The compose page carries a stronger anchor: a /in/<slug> link for its own
 * recipient. The slug is compared against Apollo's linkedin_url, which is
 * authoritative and cannot be confused with a sidebar card the way a scraped URN
 * could. Verified before typing and again before Send.
 *
 * Returns { ok, reason, thread }.
 */
async function sendDirectMessageViaComposeUrl(liPage, message, contact) {
  const contactName = (contact && contact.name) || 'Unknown';
  const wantSlug = (extractLinkedInSlug(contact.linkedin_url) || '').toLowerCase();
  if (!wantSlug) return { ok: false, reason: 'no_profile_slug' };
  if (!message) return { ok: false, reason: 'empty_message' };

  // The profile's OWN Message link, excluding "People also viewed" cards.
  const href = await liPage.evaluate(() => {
    const own = [...document.querySelectorAll('main a')].filter((el) => !el.closest('aside')
      && /^Message\b/i.test((el.textContent || '').trim())
      && /\/messaging\/compose/.test(el.getAttribute('href') || ''));
    return own.length ? own[0].getAttribute('href') : null;
  }).catch(() => null);
  if (!href) return { ok: false, reason: 'no_own_compose_link' };

  await liPage.goto(href.startsWith('http') ? href : `https://www.linkedin.com${href}`,
    { waitUntil: 'load', timeout: 45000 }).catch(() => null);

  const COMPOSE = 'div.msg-form__contenteditable[contenteditable="true"], [contenteditable="true"].msg-form__contenteditable';
  let ready = false;
  for (let i = 0; i < 15; i++) {
    await sleep(1500);
    if ((await liPage.locator(COMPOSE).count().catch(() => 0)) > 0) { ready = true; break; }
  }
  if (!ready) return { ok: false, reason: 'compose_page_not_ready' };

  // Read the recipient the compose page names, from the compose box's own ancestry.
  const readRecipient = async () => liPage.evaluate(({ sel }) => {
    const box = document.querySelector(sel);
    if (!box) return { composeCount: 0, slugs: [] };
    const all = document.querySelectorAll(sel);
    let node = box;
    for (let i = 0; i < 12 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const links = [...node.querySelectorAll('a[href*="/in/"]')];
      if (links.length) {
        const slugs = [...new Set(links.map((a) => {
          const m = (a.getAttribute('href') || '').match(/\/in\/([^/?#]+)/);
          return m ? m[1].toLowerCase() : null;
        }).filter(Boolean))];
        return { composeCount: all.length, slugs };
      }
    }
    return { composeCount: all.length, slugs: [] };
  }, { sel: COMPOSE }).catch(() => ({ composeCount: -1, slugs: [] }));

  const assertRecipient = async (stage) => {
    const r = await readRecipient();
    if (r.composeCount !== 1) {
      log.warn(`Direct DM [${stage}]: expected 1 compose box for ${contactName}, found ${r.composeCount}`);
      return { ok: false, reason: `compose_count:${r.composeCount}` };
    }
    if (r.slugs.length === 0) {
      log.warn(`Direct DM [${stage}]: compose page names no recipient for ${contactName}`);
      return { ok: false, reason: 'compose_recipient_unknown' };
    }
    if (r.slugs.length > 1 || r.slugs[0] !== wantSlug) {
      log.err(`Direct DM [${stage}]: compose targets ${JSON.stringify(r.slugs)} but the task targets "${wantSlug}". Refusing.`);
      return { ok: false, reason: `compose_wrong_recipient:${r.slugs.join(',')}` };
    }
    log.ok(`Direct DM [${stage}]: recipient verified as /in/${r.slugs[0]}`);
    return { ok: true };
  };

  const pre = await assertRecipient('pre-type');
  if (!pre.ok) return { ok: false, reason: pre.reason };

  if (DRY_RUN) {
    log.dry(`Would send direct LinkedIn DM to ${contactName} (/in/${wantSlug}): "${message.substring(0, 60)}..."`);
    return { ok: true, reason: 'dry_run', thread: contactName };
  }

  const box = liPage.locator(COMPOSE).first();
  await box.click().catch(() => null);
  await sleep(400);
  await liPage.keyboard.insertText(message).catch(() => null);
  await sleep(1200);

  const typed = (await box.innerText().catch(() => '')).trim();
  if (typed !== message.trim()) {
    log.warn(`Direct DM: compose content mismatch for ${contactName} (${typed.length} vs ${message.length} chars)`);
    return { ok: false, reason: 'compose_fill_failed' };
  }

  const post = await assertRecipient('pre-send');
  if (!post.ok) return { ok: false, reason: post.reason };

  const send = liPage.locator('button.msg-form__send-button, button:has-text("Send")').first();
  let enabled = false;
  for (let i = 0; i < 12; i++) {
    enabled = await send.isEnabled().catch(() => false);
    if (enabled) break;
    await sleep(500);
  }
  if (!enabled) return { ok: false, reason: 'send_disabled' };
  await send.evaluate((el) => el.click()).catch(() => null);
  await sleep(5000);

  // Positive confirmation: the text must appear in the thread and the compose empty.
  const confirmed = await liPage.evaluate(({ sel, snippet }) => {
    const box = document.querySelector(sel);
    const cleared = !box || !(box.innerText || '').includes(snippet);
    const inThread = (document.body.innerText || '').includes(snippet);
    return { cleared, inThread };
  }, { sel: COMPOSE, snippet: message.slice(0, 40) }).catch(() => ({ cleared: false, inThread: false }));

  if (!confirmed.inThread) {
    log.err(`Direct DM: could not confirm delivery to ${contactName}. TREAT AS UNKNOWN — verify manually.`);
    return { ok: false, reason: 'send_unconfirmed_verify_manually' };
  }
  if (!confirmed.cleared) {
    log.err(`Direct DM: compose still holds the text for ${contactName} — treat as UNKNOWN, verify manually.`);
    return { ok: false, reason: 'send_unconfirmed_verify_manually' };
  }

  log.ok(`Direct LinkedIn DM sent to ${contactName} (/in/${wantSlug}, confirmed in thread)`);
  return { ok: true, reason: 'direct_compose_url', thread: contactName };
}

/**
 * Send a message through Sales Navigator (InMail).
 *
 * Used when the ordinary linkedin.com Message control cannot open a compose box,
 * which is every non-1st-degree contact. Consumes one InMail credit per send.
 *
 * Identity is proven by member key, never by name alone. If the key cannot be
 * matched the send is abandoned, same fail-closed rule as the regular DM path.
 */
/**
 * Read WHO the currently open Sales Navigator compose box will send to.
 *
 * This is the check whose absence caused a cross-delivery on 2026-08-24: a message
 * addressed to Albert Tamazyan reached Shuja Mohammed because the code verified the
 * lead PAGE and then typed into whichever compose box happened to be on screen.
 * Clicking Message can surface the messaging overlay with a previous conversation
 * already open, and that conversation is a different person.
 *
 * The compose overlay contains a "Recipient information" region holding a
 * /sales/lead/<urn> link for its own recipient. That link is the authoritative
 * answer to "who receives what I type", so it is read from the compose box's own
 * ancestor chain rather than from the page at large.
 */
async function readComposeRecipient(liPage) {
  return await liPage.evaluate(({ walkSrc }) => {
    // eslint-disable-next-line no-new-func
    const all = new Function(`${walkSrc} return all;`)();
    const boxes = all.filter((el) => el.tagName === 'TEXTAREA'
      && /type your message/i.test(
        `${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''}`));
    if (boxes.length !== 1) return { composeCount: boxes.length, urns: [], names: [] };

    let node = boxes[0];
    for (let i = 0; i < 12 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const links = [...node.querySelectorAll('a[href*="/sales/lead/"]')];
      if (links.length) {
        const urns = [...new Set(links.map((a) => {
          const m = (a.getAttribute('href') || '').match(/\/sales\/lead\/([A-Za-z0-9_-]+)/);
          return m ? m[1] : null;
        }).filter(Boolean))];
        const names = [...new Set(links
          .map((a) => (a.textContent || '').trim().split('\n')[0].trim())
          .filter(Boolean))];
        return { composeCount: 1, urns, names };
      }
    }
    return { composeCount: 1, urns: [], names: [] };
  }, { walkSrc: DEEP_WALK_SRC }).catch(() => ({ composeCount: -1, urns: [], names: [] }));
}

/**
 * Prove the open compose box belongs to the intended member, or refuse.
 * Fails closed on every ambiguity: no compose, several composes, no recipient
 * link, several distinct recipients, or a recipient that is not the target.
 */
async function assertComposeRecipient(liPage, wantKey, contactName, stage) {
  const rec = await readComposeRecipient(liPage);
  if (rec.composeCount !== 1) {
    log.warn(`Sales Navigator [${stage}]: expected exactly 1 compose box for ${contactName}, found ${rec.composeCount}`);
    return { ok: false, reason: `sn_compose_count:${rec.composeCount}` };
  }
  const keys = [...new Set(rec.urns.map((u) => memberKeyFromUrn(u)).filter(Boolean))];
  if (keys.length === 0) {
    log.warn(`Sales Navigator [${stage}]: compose box names no recipient for ${contactName}`);
    return { ok: false, reason: 'sn_compose_recipient_unknown' };
  }
  if (keys.length > 1) {
    log.err(`Sales Navigator [${stage}]: compose box lists ${keys.length} recipients (${rec.names.join(', ')}) — refusing`);
    return { ok: false, reason: `sn_compose_multi_recipient:${keys.length}` };
  }
  if (keys[0] !== wantKey) {
    log.err(`Sales Navigator [${stage}]: compose box would send to "${rec.names.join(', ') || keys[0]}" but the task targets "${contactName}". Refusing.`);
    return { ok: false, reason: `sn_compose_wrong_recipient:${rec.names[0] || keys[0]}` };
  }
  log.ok(`Sales Navigator [${stage}]: compose recipient verified as ${rec.names[0] || wantKey} (key ${keys[0]})`);
  return { ok: true, name: rec.names[0] || contactName };
}

/**
 * Send a message through Sales Navigator (InMail).
 *
 * Used when the ordinary linkedin.com Message control cannot open a compose box.
 * Consumes one InMail credit per send for non-connections.
 *
 * Identity is proven three times and never by name alone:
 *   1. the search result's lead URN must carry the target's member key
 *   2. the rendered lead page must show the target's name
 *   3. the COMPOSE BOX ITSELF must name the target as its recipient, checked
 *      immediately before typing AND again immediately before Send
 * Step 3 is the one whose absence caused the 2026-08-24 cross-delivery.
 */
async function sendViaSalesNavigator(liPage, message, contact, profileUrn, displayName, subject, degree) {
  const contactName = (contact && contact.name) || 'Unknown';
  const searchName = displayName || contactName;
  const wantKey = memberKeyFromUrn(profileUrn);
  if (!wantKey) {
    log.warn(`Sales Navigator: no trustworthy identity anchor for ${contactName} — refusing. `
      + `A non-connection's profile exposes no Message link of its own, so there is no URN to verify against.`);
    return { ok: false, reason: 'no_member_key' };
  }

  // Non-connection InMail is DISABLED (2026-08-25).
  //
  // The only identity anchor available on a profile is its own Message link's
  // profileUrn, and non-connections do not have one. Scraping "the first profileUrn
  // in <main>" returned a sidebar stranger's id, which would have let all three
  // recipient checks pass against the wrong person. A Sales Navigator lead page
  // exposes no public /in/ slug either, so there is currently no safe way to prove
  // a non-connection's identity end to end.
  //
  // Re-enable only once a verified anchor exists for non-connections. The override
  // is here for a supervised experiment, not for production runs.
  if (degree && degree !== '1st' && process.env.ALLOW_INMAIL_NON_CONNECTION !== 'true') {
    log.warn(`Sales Navigator: InMail to non-connections is disabled (${contactName} is ${degree} degree) — nothing sent`);
    return { ok: false, reason: 'sn_non_connection_disabled' };
  }

  // Variation selectors and ZWJ are combining marks, so \p{M} would keep them and
  // leave an invisible character in the query. Strip those first, then anything
  // that is not a letter, mark, space, or ordinary name punctuation.
  const cleanName = String(searchName)
    .replace(/[︀-️‍⃣�]/g, '')
    .replace(/[^\p{L}\p{M}\s'.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Hard reset before touching Sales Navigator. The linkedin.com messaging overlay
  // is a persistent SPA element that survives navigation, and a leftover compose
  // from the failed direct-DM attempt prevents the Sales Navigator compose from
  // mounting at all (observed as sn_compose_did_not_open even though a standalone
  // visit opens it every time).
  await liPage.goto('https://www.linkedin.com/sales/home', { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => null);
  await sleep(4000);

  // Two passes. Name plus company is precise, but the company term is often why a
  // search returns zero rows. Query precision does not affect safety: the member
  // key and the compose check decide identity, the search only proposes candidates.
  const attempts = [];
  const company = (contact.organization_name || '').trim();
  if (company) attempts.push(`${cleanName} ${company}`);
  attempts.push(cleanName);

  let match = null;
  for (const terms of attempts) {
    log.info(`Sales Navigator: searching "${terms}"`);
    const q = encodeURIComponent(terms);
    await liPage.goto(
      `https://www.linkedin.com/sales/search/people?query=(spellCorrectionEnabled:true,keywords:${q})`,
      { waitUntil: 'domcontentloaded', timeout: 60000 },
    ).catch(() => null);
    await sleep(9000);

    const leads = await liPage.evaluate(() => [...document.querySelectorAll('a[href*="/sales/lead/"]')]
      .map((a) => a.getAttribute('href'))).catch(() => []);

    match = (leads || []).find((h) => {
      const m = String(h).match(/\/sales\/lead\/([A-Za-z0-9_-]+)/);
      return m && memberKeyFromUrn(m[1]) === wantKey;
    });
    if (match) break;
    log.info(`Sales Navigator: ${(leads || []).length} candidates, none matching key ${wantKey}`);
  }

  if (!match) {
    log.warn(`Sales Navigator: no lead matching member key ${wantKey} for ${contactName} after ${attempts.length} search(es)`);
    return { ok: false, reason: 'sn_lead_not_found' };
  }

  await liPage.goto(match.startsWith('http') ? match : `https://www.linkedin.com${match}`,
    { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  await sleep(8000);

  // Check 2: the lead page rendered the right person. The first h1 is a generic
  // a11y heading, so document.title is the stable source.
  const leadName = await liPage.evaluate(() => {
    const t = (document.title || '').match(/^(.+?)\s*\|\s*Sales Navigator/);
    if (t) return t[1].trim();
    for (const h of document.querySelectorAll('h1')) {
      const m = (h.textContent || '').trim().match(/^Basic lead information for\s+(.+)$/i);
      if (m) return m[1].trim();
    }
    for (const h of document.querySelectorAll('h1')) {
      const txt = (h.textContent || '').trim();
      if (txt && txt.length < 60 && !/sales navigator|lead page|basic lead/i.test(txt)) return txt;
    }
    return null;
  }).catch(() => null);
  if (!leadName || !(namesMatch(contactName, leadName) || namesMatch(searchName, leadName))) {
    log.err(`Sales Navigator: lead page shows "${leadName || 'unknown'}" but the task targets "${contactName}". Refusing to send.`);
    return { ok: false, reason: `sn_name_mismatch:${leadName || 'unknown'}` };
  }
  log.ok(`Sales Navigator: verified lead "${leadName}" (member key ${wantKey})`);

  // Open the compose. The overlay can take well over the old fixed 7s wait to
  // mount, and a single missed click read as "no compose box", so the click is
  // retried and the compose is polled for.
  // LinkedIn renders this textarea with NO placeholder attribute in some states and
  // carries the label in aria-label instead, so matching on placeholder alone found
  // nothing and read as "compose did not open". Match either attribute.
  const COMPOSE_SEL = 'textarea[placeholder*="Type your message" i], textarea[aria-label*="Type your message" i]';
  const composeBox = () => liPage.locator(COMPOSE_SEL);
  // Lead pages carry a variable number of "Message" controls (2 on most, 3 on
  // others), so .first() was a coin flip and clicking the wrong one opened nothing.
  // Try each candidate until a compose actually appears. This cannot cause a
  // misdelivery: whichever compose opens still has to pass the recipient check
  // below before a single character is typed.
  const msgLocator = liPage.locator('button:has-text("Message"), a:has-text("Message")');
  const candidates = await msgLocator.count().catch(() => 0);
  if (!candidates) return { ok: false, reason: 'sn_message_button_not_found' };
  log.info(`Sales Navigator: ${candidates} Message control(s) on the lead page`);

  let opened = false;
  for (let c = 0; c < candidates && !opened; c++) {
    const bb = await msgLocator.nth(c).boundingBox().catch(() => null);
    if (!bb) continue;
    await liPage.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await sleep(250);
    await liPage.mouse.down();
    await sleep(90);
    await liPage.mouse.up();

    for (let i = 0; i < 12; i++) {
      await sleep(1000);
      if ((await composeBox().count().catch(() => 0)) > 0) { opened = true; break; }
    }
    if (!opened) log.info(`Sales Navigator: Message control ${c + 1}/${candidates} opened no compose, trying the next`);
  }
  if (!opened) {
    // Report what was actually on the page so this is diagnosable from the log
    // instead of needing a separate reproduction.
    const diag = await liPage.evaluate(() => ({
      url: location.href.slice(0, 90),
      textareas: document.querySelectorAll('textarea').length,
      msgButtons: [...document.querySelectorAll('button,a')]
        .map((e) => (e.textContent || '').trim())
        .filter((t) => /^message/i.test(t)).slice(0, 5),
    })).catch(() => null);
    log.warn(`Sales Navigator compose diagnostics: ${JSON.stringify(diag)}`);
    return { ok: false, reason: 'sn_compose_did_not_open' };
  }

  // Check 3a: prove the compose box is this person's BEFORE typing a character.
  const preCheck = await assertComposeRecipient(liPage, wantKey, contactName, 'pre-type');
  if (!preCheck.ok) return { ok: false, reason: preCheck.reason };

  const box = composeBox();

  if (DRY_RUN) {
    log.dry(`Would send Sales Navigator InMail to ${preCheck.name}: "${message.substring(0, 60)}..." (costs 1 InMail credit)`);
    return { ok: true, reason: 'dry_run', thread: preCheck.name };
  }

  // Clear any draft LinkedIn saved from an earlier attempt. Typing appends, so a
  // leftover draft would produce doubled text.
  await box.fill('').catch(() => null);
  await sleep(300);
  await box.click().catch(() => null);
  await sleep(400);

  // Type with real keyboard events. Sales Navigator is an Ember app and its Send
  // button stays disabled unless the framework's own input binding fires.
  // locator.fill() sets the value and passes an inputValue() check, so the compose
  // looks filled while Send remains disabled and the click does nothing.
  await liPage.keyboard.insertText(message).catch(() => null);
  await sleep(1200);

  const typed = await box.inputValue().catch(() => '');
  if (typed.trim() !== message.trim()) {
    log.warn(`Sales Navigator: compose content mismatch for ${contactName} (${typed.length} vs ${message.length} chars)`);
    return { ok: false, reason: 'sn_content_mismatch' };
  }

  // InMail to a non-connection requires a Subject; Send stays disabled without one.
  // 1st-degree regular messages have no subject field at all. Fail closed rather
  // than invent prospect-facing copy: a missing subject is a config gap, not
  // something to auto-generate.
  const subjectField = liPage.locator('input[placeholder*="Subject" i], input[aria-label*="Subject" i]').first();
  const needsSubject = (await subjectField.count().catch(() => 0)) > 0;
  if (needsSubject) {
    if (!subject || !subject.trim()) {
      log.warn(`Sales Navigator: InMail to ${contactName} requires a subject and none is configured — nothing sent. Add {"subject","body"} to dm-overrides.json.`);
      return { ok: false, reason: 'sn_subject_required' };
    }
    await subjectField.click().catch(() => null);
    await sleep(300);
    await liPage.keyboard.insertText(subject.trim()).catch(() => null);
    await sleep(800);
    const gotSubject = await subjectField.inputValue().catch(() => '');
    if (gotSubject.trim() !== subject.trim()) {
      log.warn(`Sales Navigator: subject did not take for ${contactName} ("${gotSubject}")`);
      return { ok: false, reason: 'sn_subject_fill_failed' };
    }
    log.info(`Sales Navigator: InMail subject set to "${subject.trim()}"`);
  }

  // Check 3b: re-prove the recipient. The overlay can switch threads between
  // typing and sending, and only the state at Send time actually matters.
  const postCheck = await assertComposeRecipient(liPage, wantKey, contactName, 'pre-send');
  if (!postCheck.ok) return { ok: false, reason: postCheck.reason };

  const send = liPage.locator('button:has-text("Send")').first();
  const sbb = await send.boundingBox().catch(() => null);
  if (!sbb) return { ok: false, reason: 'sn_send_button_not_found' };

  // Send must be enabled. A disabled button swallows the click, which previously
  // read as a mysterious "compose still open".
  let enabled = false;
  for (let i = 0; i < 12; i++) {
    enabled = await send.isEnabled().catch(() => false);
    if (enabled) break;
    await sleep(500);
  }
  if (!enabled) {
    log.warn(`Sales Navigator: Send stayed disabled for ${contactName} — nothing sent`);
    return { ok: false, reason: 'sn_send_disabled' };
  }

  await liPage.mouse.move(sbb.x + sbb.width / 2, sbb.y + sbb.height / 2);
  await sleep(200);
  await liPage.mouse.down();
  await sleep(90);
  await liPage.mouse.up();
  await sleep(6000);

  // POSITIVE confirmation. Absence of an error is not proof of delivery: the
  // cross-delivery run reported "not sent" while the message was in flight to the
  // wrong person. Require the message body to be visible in a thread belonging to
  // the verified recipient.
  const confirmed = await liPage.evaluate(({ walkSrc, snippet, wantUrnKey }) => {
    // eslint-disable-next-line no-new-func
    const all = new Function(`${walkSrc} return all;`)();
    const hit = all.find((el) => el.children.length === 0
      && (el.textContent || '').includes(snippet));
    if (!hit) return { seen: false, rightThread: false };
    let node = hit;
    for (let i = 0; i < 14 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const links = [...node.querySelectorAll('a[href*="/sales/lead/"]')];
      for (const a of links) {
        const m = (a.getAttribute('href') || '').match(/\/sales\/lead\/([A-Za-z0-9_-]+)/);
        if (m && m[1].slice(3, 12) === wantUrnKey) return { seen: true, rightThread: true };
      }
    }
    return { seen: true, rightThread: false };
  }, { walkSrc: DEEP_WALK_SRC, snippet: message.slice(0, 40), wantUrnKey: wantKey })
    .catch(() => ({ seen: false, rightThread: false }));

  if (!confirmed.seen) {
    log.err(`Sales Navigator: could not confirm the message reached ${contactName}. TREAT AS UNKNOWN, not as unsent — verify the thread manually.`);
    return { ok: false, reason: 'sn_send_unconfirmed_verify_manually' };
  }
  if (!confirmed.rightThread) {
    log.err(`Sales Navigator: message text is visible but NOT in ${contactName}'s thread. Possible misdelivery — check the inbox immediately.`);
    return { ok: false, reason: 'sn_possible_misdelivery' };
  }

  log.ok(`Sales Navigator InMail sent to ${preCheck.name} (confirmed in their thread)`);
  return { ok: true, reason: 'sales_navigator', thread: preCheck.name };
}

/** Normalize a person name to comparable lowercase tokens. */
function nameTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Tolerant name match between Apollo's contact name and LinkedIn's display name.
 *
 * Deliberately tolerant of partial mismatches (Apollo "Chi Z" vs LinkedIn "Alex Chi"
 * share the "chi" token and pass) but strict about unrelated people — "Jordan Soldo"
 * and "Ali Saberi" share nothing and are blocked. Paired with the exactly-one-conversation
 * assertion in sendDirectMessage, this is what makes cross-delivery structurally impossible.
 */
function namesMatch(apolloName, linkedinName) {
  const a = nameTokens(apolloName);
  const b = nameTokens(linkedinName);
  if (!a.length || !b.length) return false;
  const aj = a.join(' ');
  const bj = b.join(' ');
  if (aj === bj || aj.includes(bj) || bj.includes(aj)) return true;
  return a.some((t) => b.includes(t));
}

/**
 * Close every open message overlay and PROVE it worked.
 *
 * The old version clicked a close button, swallowed all errors, and returned void —
 * "non-fatal, proceed anyway". When it silently failed, the stale overlay stayed open
 * and the next contact's DM was typed into it. It is now escalating and verified:
 * click closers (deep) -> Escape -> full reload, re-checking after each step.
 *
 * Returns true only when zero conversations and zero compose boxes remain.
 */
async function closeMessageOverlays(liPage, { allowReload = true } = {}) {
  const isClean = (s) => s.conversationNames.length === 0 && s.composeCount === 0;

  let state = await scanConversationOverlays(liPage);
  if (isClean(state)) return true;

  for (let attempt = 1; attempt <= 3; attempt++) {
    // Step 1: click every close control, piercing shadow DOM.
    await liPage.evaluate(() => {
      const all = [];
      const walk = (root, depth) => {
        if (depth > 25) return;
        let els;
        try { els = root.querySelectorAll('*'); } catch (_) { return; }
        for (const el of els) {
          all.push(el);
          if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
        }
      };
      walk(document, 0);
      for (const el of all) {
        const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
        const txt = (el.textContent || '').trim();
        if (/^Close your conversation/i.test(aria || txt)) {
          try { el.click(); } catch (_) { /* keep going */ }
        }
      }
    }).catch(() => null);
    await sleep(600);

    state = await scanConversationOverlays(liPage);
    if (isClean(state)) return true;

    // Step 2: Escape.
    await liPage.keyboard.press('Escape').catch(() => null);
    await sleep(400);
    state = await scanConversationOverlays(liPage);
    if (isClean(state)) return true;

    // Step 3: hard reset via reload — the overlay cannot survive this.
    if (allowReload) {
      log.warn(`Overlay still open (${state.conversationNames.join(', ') || state.composeCount + ' compose box(es)'}) — reloading page to clear it`);
      await liPage.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      await sleep(2000);
      state = await scanConversationOverlays(liPage);
      if (isClean(state)) return true;
    }
  }

  log.err(`Could not clear message overlays after 3 attempts (open: ${state.conversationNames.join(', ')})`);
  return false;
}

/** Walk document + all open shadow roots. Injected into the page by the DM helpers. */
const DEEP_WALK_SRC = `
  const all = [];
  const walk = (root, d) => {
    if (d > 25) return;
    let els;
    try { els = root.querySelectorAll('*'); } catch (_) { return; }
    for (const el of els) {
      all.push(el);
      if (el.shadowRoot) walk(el.shadowRoot, d + 1);
    }
  };
  walk(document, 0);
`;

/** Normalize whitespace for comparing typed vs rendered message text. */
function normWhitespace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/**
 * Send a LinkedIn DM to a SPECIFIC contact, refusing to send if we cannot prove
 * the open conversation belongs to them.
 *
 * Rewritten 2026-07-30 after the 2026-07-28 cross-delivery incident. The old version
 * took only (liPage, message) — it had no idea who it was writing to, selected the
 * compose box and Send button with page-wide .first(), and returned true
 * unconditionally. A stale overlay therefore sent 9 people's messages to 3 wrong
 * recipients and marked every task complete.
 *
 * Four guardrails, in order. Every one fails CLOSED: if we cannot verify, we do not
 * type and do not send. Worst case is a queued task and a loud log, never a
 * message to the wrong person.
 *
 *   1. Start from a provably empty messaging state (verified overlay cleanup).
 *   2. Assert exactly ONE conversation is open after clicking Message.
 *   3. Assert that conversation's recipient matches this contact.
 *   4. Circuit breaker: abort the run if one thread would receive two contacts' messages.
 *
 * Returns { ok, reason, thread }.
 */
async function sendDirectMessage(liPage, message, contact) {
  const contactName = (contact && contact.name) || 'Unknown';
  const contactId = contact && contact.id;

  if (!message) {
    log.warn('No message text — skipping DM');
    return { ok: false, reason: 'empty_message' };
  }

  if (DRY_RUN) {
    // Open the conversation for real (read-only) so dry run reflects what would
    // actually happen. Reporting a blanket success here hid the fact that this
    // path cannot open a compose box for non-connections, and left the Sales
    // Navigator fallback untested.
    const clean = await closeMessageOverlays(liPage);
    if (!clean) return { ok: false, reason: 'overlay_not_cleared' };
    const btn = liPage.locator('main button:has-text("Message"), main a:has-text("Message")').first();
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btn.click({ timeout: 8000 }).catch(() => null);
    }
    let scanDry = { conversationNames: [], composeCount: 0 };
    for (let i = 0; i < 8; i++) {
      scanDry = await scanConversationOverlays(liPage);
      if (scanDry.conversationNames.length > 0) break;
      await sleep(500);
    }
    log.dry(`Pre-send state: ${scanDry.conversationNames.length} conversation(s) open [${scanDry.conversationNames.join(', ')}], ${scanDry.composeCount} compose box(es)`);
    if (scanDry.conversationNames.length === 0) {
      await closeMessageOverlays(liPage, { allowReload: false });
      return { ok: false, reason: 'conversation_not_opened' };
    }
    const cp = stripSelfParticipant(scanDry.conversationNames[0]);
    if (!namesMatch(contactName, cp)) return { ok: false, reason: `recipient_mismatch:${cp}` };
    log.dry(`Would send LinkedIn DM to ${contactName}: "${message.substring(0, 60)}${message.length > 60 ? '...' : ''}"`);
    await closeMessageOverlays(liPage);
    return { ok: true, reason: 'dry_run', thread: cp };
  }

  // ---- GUARDRAIL 1: provably empty messaging state before we open anything ----
  const clean = await closeMessageOverlays(liPage);
  if (!clean) {
    log.err(`Refusing to DM ${contactName} — could not clear stale message overlays first`);
    return { ok: false, reason: 'overlay_not_cleared' };
  }

  // Open the conversation from the profile's Message button.
  const msgBtn = liPage.locator('main button:has-text("Message"), main a:has-text("Message")').first();
  const btnVisible = await msgBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (!btnVisible) {
    const msgBtnAria = liPage.locator('main [aria-label*="message" i], main [aria-label*="Message"]').first();
    const ariaVisible = await msgBtnAria.isVisible().catch(() => false);
    if (!ariaVisible) {
      log.warn('Message button not found on LinkedIn profile — is the contact connected?');
      return { ok: false, reason: 'message_button_not_found' };
    }
    const e1 = await msgBtnAria.click({ timeout: 8000 }).then(() => null).catch((e) => e.message);
    if (e1) log.warn(`Message control click failed: ${e1}`);
  } else {
    const e2 = await msgBtn.click({ timeout: 8000 }).then(() => null).catch((e) => e.message);
    if (e2) log.warn(`Message control click failed: ${e2}`);
  }

  // ---- GUARDRAIL 2: exactly one conversation must now be open ----
  let scan = { conversationNames: [], composeCount: 0 };
  for (let i = 0; i < 16; i++) {
    scan = await scanConversationOverlays(liPage);
    if (scan.conversationNames.length > 0) break;
    await sleep(500);
  }

  if (scan.conversationNames.length === 0) {
    log.warn(`Could not find an open conversation for ${contactName} after clicking Message`);
    await closeMessageOverlays(liPage, { allowReload: false });
    return { ok: false, reason: 'conversation_not_opened' };
  }

  if (scan.conversationNames.length > 1) {
    log.err(`${scan.conversationNames.length} conversations open at once (${scan.conversationNames.join(', ')}) — refusing to send to avoid cross-delivery`);
    await closeMessageOverlays(liPage);
    return { ok: false, reason: `multiple_conversations_open:${scan.conversationNames.length}` };
  }

  const threadName = scan.conversationNames[0];
  // LinkedIn labels the thread with both participants. Compare against the
  // counterpart only, so a shared first name with the account owner cannot
  // satisfy the match.
  const counterpart = stripSelfParticipant(threadName);

  // ---- GUARDRAIL 3: the open conversation must belong to THIS contact ----
  if (!namesMatch(contactName, counterpart)) {
    log.err(`RECIPIENT MISMATCH — task targets "${contactName}" but the open chat is with "${counterpart}" (thread label: "${threadName}"). Refusing to send.`);
    await closeMessageOverlays(liPage);
    return { ok: false, reason: `recipient_mismatch:${counterpart}` };
  }
  log.ok(`Verified conversation recipient: "${counterpart}" matches task target "${contactName}"`);

  // ---- GUARDRAIL 4: circuit breaker on repeat use of one thread ----
  const ledgerKey = nameTokens(counterpart).join(' ');
  const prior = threadLedger.get(ledgerKey);
  if (prior && prior.contactId !== contactId) {
    runAborted = true;
    runAbortReason = `thread "${threadName}" was about to receive messages for two different contacts (${prior.contactName}, then ${contactName})`;
    log.err(`CIRCUIT BREAKER TRIPPED: ${runAbortReason}`);
    await closeMessageOverlays(liPage);
    return { ok: false, reason: 'ledger_conflict' };
  }
  threadLedger.set(ledgerKey, { contactId, contactName });

  // ---- Type into the single verified compose box ----
  // Deep-find via evaluate (pierces shadow DOM) and re-assert a single box, so we can
  // never resolve to another conversation's input. execCommand keeps React's synthetic
  // events happy and sidesteps the fixed-overlay viewport problem.
  const typeResult = await liPage.evaluate(({ text, walkSrc }) => {
    // eslint-disable-next-line no-new-func
    const all = new Function(`${walkSrc} return all;`)();
    const boxes = all.filter((el) => el.getAttribute
      && el.getAttribute('contenteditable') === 'true'
      && (String(el.className || '').includes('msg-form__contenteditable')
        || /message/i.test(el.getAttribute('data-placeholder') || '')));
    if (boxes.length !== 1) return { error: `compose_count:${boxes.length}` };
    const el = boxes[0];
    el.focus();
    document.execCommand('selectAll');
    document.execCommand('insertText', false, text);
    return { typed: (el.textContent || '').trim() };
  }, { text: message, walkSrc: DEEP_WALK_SRC }).catch((e) => ({ error: e.message }));

  if (typeResult.error) {
    log.err(`Could not fill compose box for ${contactName} (${typeResult.error}) — nothing typed`);
    await closeMessageOverlays(liPage);
    return { ok: false, reason: `compose_fill_failed:${typeResult.error}` };
  }

  // Confirm what landed in the box is actually our message before sending.
  const snippet = normWhitespace(message).substring(0, 40);
  if (!normWhitespace(typeResult.typed).includes(snippet)) {
    log.err(`Compose box content does not match the intended message for ${contactName} — refusing to send`);
    await closeMessageOverlays(liPage);
    return { ok: false, reason: 'compose_content_mismatch' };
  }
  log.info('Message text verified in compose box');
  await sleep(500);

  // ---- Send, scoped to this conversation ----
  const sendResult = await liPage.evaluate(({ walkSrc }) => {
    // eslint-disable-next-line no-new-func
    const all = new Function(`${walkSrc} return all;`)();
    const candidates = all.filter((el) => {
      const tag = el.tagName;
      if (tag !== 'BUTTON' && el.getAttribute && el.getAttribute('role') !== 'button') return false;
      const cls = String(el.className || '');
      const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
      const txt = (el.textContent || '').trim();
      const looksLikeSend = cls.includes('msg-form__send-button')
        || /^send\b/i.test(aria) || /^send$/i.test(txt);
      return looksLikeSend && !el.disabled;
    });
    if (candidates.length === 0) return { error: 'no_send_button' };
    try { candidates[0].click(); } catch (e) { return { error: 'click_failed:' + e.message }; }
    return { clicked: true };
  }, { walkSrc: DEEP_WALK_SRC }).catch((e) => ({ error: e.message }));

  if (sendResult.error === 'no_send_button') {
    log.info('Send button not found, trying keyboard shortcut...');
    await liPage.keyboard.press('Meta+Enter').catch(() => null);
  } else if (sendResult.error) {
    log.err(`Send click failed for ${contactName}: ${sendResult.error}`);
    await closeMessageOverlays(liPage);
    return { ok: false, reason: `send_click_failed:${sendResult.error}` };
  }

  await sleep(1500);

  // ---- Confirm delivery. No blind success logging. ----
  const confirm = await liPage.evaluate(({ snip, walkSrc }) => {
    // eslint-disable-next-line no-new-func
    const all = new Function(`${walkSrc} return all;`)();
    const boxes = all.filter((el) => el.getAttribute
      && el.getAttribute('contenteditable') === 'true'
      && (String(el.className || '').includes('msg-form__contenteditable')
        || /message/i.test(el.getAttribute('data-placeholder') || '')));
    const composeText = boxes.map((el) => (el.textContent || '').trim()).join('');
    const bodyText = all.map((el) => (el.childElementCount === 0 ? (el.textContent || '') : '')).join(' ');
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    return {
      composeCleared: norm(composeText).length === 0,
      snippetInThread: norm(bodyText).includes(snip),
    };
  }, { snip: snippet, walkSrc: DEEP_WALK_SRC }).catch(() => ({ composeCleared: false, snippetInThread: false }));

  if (!confirm.composeCleared && !confirm.snippetInThread) {
    log.err(`Could not confirm DM to ${contactName} was sent — leaving task open for retry`);
    await closeMessageOverlays(liPage);
    return { ok: false, reason: 'send_unconfirmed' };
  }
  if (!confirm.snippetInThread) {
    log.warn('Compose box cleared but message not found in thread — treating as sent (avoids duplicate resend)');
  }

  log.ok(`LinkedIn DM sent to ${threadName}`);

  // Leave the next task a clean slate. This is belt-and-braces: guardrail 1 re-verifies.
  await closeMessageOverlays(liPage, { allowReload: false });

  return { ok: true, reason: 'sent', thread: threadName };
}

// ============================================================
//  LINKEDIN POST INTERACTION (Touch 5)
// ============================================================

function extractLinkedInSlug(url) {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * Navigate to prospect's LinkedIn activity feed, find the most recent post
 * within 14 days, and like it. Returns 'liked', 'no_recent_post', or 'already_liked'.
 *
 * Timestamps LinkedIn uses: Xh, Xd, 1w, 2w = within 14 days. 3w+ = too old.
 * Posts are ordered newest-first on /recent-activity/all/.
 */
async function likeRecentPost(liPage, contact) {
  const slug = extractLinkedInSlug(contact.linkedin_url);
  if (!slug) {
    log.warn(`Cannot extract LinkedIn slug from: ${contact.linkedin_url}`);
    return 'no_slug';
  }

  log.info(`Navigating to activity feed for ${contact.name}...`);
  await liPage.goto(`https://www.linkedin.com/in/${slug}/recent-activity/all/`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await closeMessageOverlays(liPage);
  await sleep(2500);

  // Read timestamps of the first 5 posts
  const timestamps = await liPage.evaluate(() => {
    const els = document.querySelectorAll(
      'span.update-components-actor__sub-description span[aria-hidden="true"]'
    );
    return Array.from(els).slice(0, 5).map((el) => el.textContent.trim());
  }).catch(() => []);

  log.info(`Post timestamps: ${timestamps.length ? timestamps.join(' | ') : 'none found'}`);

  if (timestamps.length === 0) {
    log.info(`No posts found for ${contact.name}`);
    return 'no_recent_post';
  }

  // Check if the most recent post is within 14 days
  // h = hours, d = days (1-13), 1w or 2w = 7-14 days. 3w+ is too old.
  const mostRecent = timestamps[0];
  // Edited posts render as "6d • Edited •" — strip to the leading age token
  // before matching, or every edited post fails the anchored regexes.
  const ageToken = mostRecent.split('•')[0].trim();
  const isRecent = /^\d+h$/.test(ageToken) ||
                   /^\d+d$/.test(ageToken) ||
                   /^[12]w$/.test(ageToken);

  if (!isRecent) {
    log.info(`Most recent post is too old (${mostRecent}) — skipping like`);
    return 'no_recent_post';
  }

  if (DRY_RUN) {
    log.dry(`Would like most recent post for ${contact.name} (timestamp: "${mostRecent}")`);
    return 'liked';
  }

  // Click Like on the first unliked post
  const liked = await liPage.evaluate(() => {
    const btn = document.querySelector('button[aria-label="React Like"]');
    if (!btn) return false;
    btn.click();
    return true;
  }).catch(() => false);

  if (liked) {
    log.ok(`Liked most recent post for ${contact.name} (${mostRecent})`);
    return 'liked';
  }

  // Button not found — may already be liked
  log.info(`Like button not found for ${contact.name} — post may already be liked`);
  return 'already_liked';
}

// ============================================================
//  MAIN
// ============================================================

async function main() {
  log.info('Apollo LinkedIn Tasks Automator (REST API mode)');
  log.info(`Mode: ${DRY_RUN ? 'DRY RUN (no actions, no completions)' : 'LIVE'}`);
  log.info(`Delay between tasks: ${DELAY_MIN}–${DELAY_MAX}ms`);
  log.info(`Connect caps: ${DAILY_CONNECT_CAP}/day | ${WEEKLY_CONNECT_CAP}/week`);
  log.info('');

  // 1. PREREQUISITES
  if (!process.env.APOLLO_API_KEY) {
    log.err('APOLLO_API_KEY env var is not set');
    process.exit(1);
  }

  if (!fs.existsSync(LINKEDIN_PROFILE)) {
    log.err(`LinkedIn profile not found: ${LINKEDIN_PROFILE}`);
    log.err('Run "node save-session.js" once to log into LinkedIn and create the profile.');
    process.exit(1);
  }

  log.info('Launching headless Playwright browser with LinkedIn profile...');
  let context;
  try {
    context = await chromium.launchPersistentContext(LINKEDIN_PROFILE, {
      headless: true,
      args: ['--no-first-run', '--no-default-browser-check'],
    });
  } catch (e) {
    log.err(`Failed to launch browser: ${e.message}`);
    process.exit(1);
  }

  const liPage = context.pages()[0] || await context.newPage();

  // Verify LinkedIn session
  await liPage.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  const isLoggedOut = await liPage.locator('text="Sign in"').first().isVisible().catch(() => false)
    || await liPage.locator('text="Join now"').first().isVisible().catch(() => false)
    || await liPage.locator('text="Agree & Join"').first().isVisible().catch(() => false);

  if (isLoggedOut) {
    log.err('LinkedIn session expired. Run "node save-session.js" to log in again (Chrome does not need to be quit).');
    await context.close().catch(() => null);
    process.exit(1);
  }
  log.ok('LinkedIn session active');

  // Needed to strip the account owner out of two-party thread labels before any
  // recipient comparison. Detected once; guardrails degrade safe if it is null.
  SELF_NAME = await detectSelfName(liPage);
  if (SELF_NAME) {
    log.info(`Signed in as: ${SELF_NAME}`);
  } else {
    log.warn('Could not detect the signed-in account name — thread labels will be matched unstripped');
  }

  // Salesforce activity logging (Apollo's CRM sync never pushes LinkedIn steps).
  sfdcAuth = await initSfdcAuth();
  if (sfdcAuth) {
    log.info(`Salesforce activity logging enabled (${sfdcAuth.instanceUrl})`);
  } else if (SFDC_LOG_ENABLED) {
    log.warn('Salesforce activity logging unavailable this run');
  }

  try {
    // 2. FETCH TASKS (REST — no browser needed)
    let tasks = await fetchAndrewLinkedInTasks();

    // Apply controlled-testing limits. Never silently truncate: log what was dropped.
    if (ONLY_TYPE) {
      const before = tasks.length;
      tasks = tasks.filter((t) => t.type === ONLY_TYPE);
      log.info(`ONLY_TYPE=${ONLY_TYPE} — narrowed ${before} tasks to ${tasks.length}`);
    }
    if (ONLY_CONTACT) {
      const before = tasks.length;
      const needle = ONLY_CONTACT.toLowerCase();
      tasks = tasks.filter((t) => {
        const c = t.contact || {};
        return String(c.id || '').toLowerCase() === needle
          || String(c.name || '').toLowerCase().includes(needle);
      });
      log.info(`ONLY_CONTACT=${ONLY_CONTACT} — narrowed ${before} tasks to ${tasks.length}`);
    }
    if (TASK_LIMIT > 0 && tasks.length > TASK_LIMIT) {
      log.info(`TASK_LIMIT=${TASK_LIMIT} — processing first ${TASK_LIMIT} of ${tasks.length} tasks, remaining ${tasks.length - TASK_LIMIT} left untouched`);
      tasks = tasks.slice(0, TASK_LIMIT);
    }

    if (tasks.length === 0) {
      log.info('No LinkedIn tasks pending for Andrew. Nothing to do.');
      await context.close().catch(() => null);
      return;
    }

    const connects = tasks.filter((t) => t.type === 'linkedin_step_connect');
    const dms = tasks.filter((t) => t.type === 'linkedin_step_message');
    const postLikes = tasks.filter(isPostEngagementTask);
    log.info(`Found ${tasks.length} tasks: ${connects.length} connect requests | ${dms.length} DMs | ${postLikes.length} post likes`);

    // 3. CHECK CONNECT CAPS
    const stats = loadStats();
    const sentToday = getConnectsSentToday(stats);
    const sentThisWeek = getConnectsSentThisWeek(stats);
    log.info(`Connect budget: ${sentToday}/${DAILY_CONNECT_CAP} today | ${sentThisWeek}/${WEEKLY_CONNECT_CAP} this week`);

    const weeklyCapHit = sentThisWeek >= WEEKLY_CONNECT_CAP;
    if (weeklyCapHit) {
      log.warn(`Weekly connect cap reached (${sentThisWeek}/${WEEKLY_CONNECT_CAP}) — all connect tasks will be skipped today`);
    }

    // 4. PREFETCH CAMPAIGN TEMPLATES
    const uniqueCampaignIds = [...new Set(tasks.map((t) => t.emailer_campaign_id).filter(Boolean))];
    log.info(`Prefetching templates for ${uniqueCampaignIds.length} sequences...`);
    for (const id of uniqueCampaignIds) {
      await getLinkedInTemplate(id, 'linkedin_step_connect'); // populates cache
    }
    log.info('Templates loaded');
    log.info('');

    // 5. PROCESS EACH TASK
    let dailyConnectCount = sentToday;
    const today = todayISO();

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const contact = task.contact || {};
      const contactName = contact.name || 'Unknown';
      const taskType = task.type;
      const dueStr = task.due_at ? task.due_at.split('T')[0] : '?';

      log.info(`--- Task ${i + 1}/${tasks.length}: [${taskType}] ${contactName} (due ${dueStr}) ---`);

      // ---- NO LINKEDIN URL ----
      // Nothing to act on, so the task is completed to let the sequence advance to
      // its next step rather than stalling the contact on a step that can never run.
      // Completing it silently used to hide the contact entirely: it landed in the
      // same summary bucket as genuinely-connected people and left no trace in
      // Apollo. It is now its own summary bucket plus a note on the contact, so the
      // missing URL is findable and fixable after the fact.
      if (!contact.linkedin_url) {
        log.warn(`No LinkedIn URL for ${contactName} — completing task so the sequence advances`);
        results.skipped_no_url.push({
          name: contactName,
          email: contact.email || null,
          taskType,
          contactId: contact.id || null,
        });
        if (contact.id) {
          await addContactNote(
            contact.id,
            `You.com automation: ${taskType} task skipped because this contact has no LinkedIn URL in Apollo. `
            + `The task was marked complete so the sequence advances to the next step. `
            + `Add a LinkedIn URL to re-enable LinkedIn touches for this contact.`
          );
        }
        // Record the closure in Salesforce too. An Apollo note alone leaves no trace
        // in the CRM that the step was handled, so the account history would show a
        // silent gap where a LinkedIn touch should be.
        await logSfdcActivity(
          contact,
          '[LinkedIn] Step closed — no LinkedIn URL',
          `${taskType} could not be actioned: this contact has no LinkedIn URL in Apollo.\n`
          + `The Apollo task was marked complete so the sequence advances to the next step.\n`
          + `No LinkedIn message or connection request was sent.\n`
          + `Add a LinkedIn URL in Apollo to re-enable LinkedIn touches for this contact.`,
        );
        await markTaskComplete(task.id);
        continue;
      }

      try {
        // ---- CONNECT TASK ----
        if (taskType === 'linkedin_step_connect') {

          // Cap check
          if (weeklyCapHit) {
            log.info(`Skipping connect — weekly cap reached`);
            results.skipped_cap.push({ name: contactName, reason: 'weekly cap' });
            // DO NOT mark complete — leave for next run
            continue;
          }
          if (dailyConnectCount >= DAILY_CONNECT_CAP) {
            log.info(`Skipping connect — daily cap reached (${dailyConnectCount}/${DAILY_CONNECT_CAP})`);
            results.skipped_cap.push({ name: contactName, reason: 'daily cap' });
            // DO NOT mark complete — leave for tomorrow
            continue;
          }

          // Connect note: per-contact override first, else the campaign template.
          // Campaigns frequently carry an empty connect step, which would otherwise
          // send a bare invite to a senior prospect.
          let rawNote;
          if (CONNECT_OVERRIDES[contact.id]) {
            rawNote = CONNECT_OVERRIDES[contact.id];
            log.info(`[OVERRIDE] Using connect-overrides.json for ${contactName}`);
          } else {
            rawNote = await getLinkedInTemplate(task.emailer_campaign_id, 'linkedin_step_connect');
          }
          const note = renderTemplate(rawNote, contact);
          if (note) {
            log.info(`Connect note (${note.length} chars): "${note.substring(0, 60)}${note.length > 60 ? '...' : ''}"`);
          } else {
            log.info('No connect note (will send without)');
          }

          // Navigate to LinkedIn profile
          log.info(`Navigating to ${contact.linkedin_url}`);
          await liPage.goto(contact.linkedin_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await closeMessageOverlays(liPage);

          const state = await detectLinkedInState(liPage);
          log.info(`LinkedIn state: ${state}`);

          if (state === 'pending') {
            log.info('Already pending — marking complete, no send');
            results.skipped_already.push({ name: contactName, reason: 'already pending' });
            // Record the closure in the CRM. No request was sent, but the step WAS
            // handled and the sequence advanced, so the account history should say so.
            await logSfdcActivity(contact, '[LinkedIn] Step closed — invite already pending',
              `linkedin_step_connect closed: a connection request to this person is already pending on LinkedIn.\n`
              + `No new request was sent. The Apollo task was completed so the sequence advances.\n`
              + `Profile: ${contact.linkedin_url || 'unknown'}`);
            await markTaskComplete(task.id);

          } else if (state === 'connected') {
            log.info('Already connected — marking complete, no send');
            results.skipped_already.push({ name: contactName, reason: 'already connected' });
            await logSfdcActivity(contact, '[LinkedIn] Step closed — already connected',
              `linkedin_step_connect closed: already connected to this person on LinkedIn.\n`
              + `No connection request was needed or sent. The Apollo task was completed so the sequence advances.\n`
              + `Profile: ${contact.linkedin_url || 'unknown'}`);
            await markTaskComplete(task.id);

          } else if (state === 'connect') {
            const sent = await sendConnectionRequest(liPage, note, contact.email || '');
            if (sent) {
              log.ok(`Connection request sent to ${contactName}${note ? ' (with note)' : ''}`);
              await markTaskComplete(task.id);
              await addContactNote(contact.id, `LinkedIn connection request sent — ${today}`);
              await logSfdcActivity(contact, '[LinkedIn] Connection request sent',
                `LinkedIn connection request sent via apollo-linkedin-connect.js (Apollo Touch 2).\nProfile: ${contact.linkedin_url || 'unknown'}`);
              dailyConnectCount++;
              recordConnectSent(stats);
              results.connects_sent.push({ name: contactName, note: !!note });
            } else {
              log.err(`Failed to send connection to ${contactName}`);
              results.errors.push({ name: contactName, type: 'connect', reason: 'send failed' });
            }

          } else if (state === 'dots_menu') {
            log.info('Connect is behind dots menu, opening...');
            const sent = await handleMoreMenuConnect(liPage, note);
            if (sent) {
              log.ok(`Connection request sent to ${contactName} (via More menu)`);
              await markTaskComplete(task.id);
              await addContactNote(contact.id, `LinkedIn connection request sent — ${today}`);
              await logSfdcActivity(contact, '[LinkedIn] Connection request sent',
                `LinkedIn connection request sent via apollo-linkedin-connect.js (Apollo Touch 2).\nProfile: ${contact.linkedin_url || 'unknown'}`);
              dailyConnectCount++;
              recordConnectSent(stats);
              results.connects_sent.push({ name: contactName, note: !!note });
            } else {
              results.errors.push({ name: contactName, type: 'connect', reason: 'more menu failed' });
            }

          } else {
            log.warn(`Unknown LinkedIn state for ${contactName} — skipping`);
            results.skipped_already.push({ name: contactName, reason: `unknown state: ${state}` });
            await logSfdcActivity(contact, '[LinkedIn] Step closed — profile state unreadable',
              `linkedin_step_connect closed: the LinkedIn profile did not present a readable connect/message state (${state}).\n`
              + `NO connection request or message was sent. The Apollo task was completed so the sequence advances.\n`
              + `Profile: ${contact.linkedin_url || 'unknown'}`);
            await markTaskComplete(task.id);
          }

        // ---- DM TASK ----
        } else if (taskType === 'linkedin_step_message') {

          // Check dm-overrides.json first (bypasses Apollo custom-field template lookup)
          let dmText;
          let dmSubject = '';
          // An override is either a plain string (body only) or {subject, body}.
          // InMail to a non-connection REQUIRES a subject, so the object form exists
          // to carry it. String form stays valid for 1st-degree regular messages.
          if (DM_OVERRIDES[contact.id]) {
            const ov = DM_OVERRIDES[contact.id];
            if (typeof ov === 'object' && ov !== null) {
              dmText = ov.body || '';
              dmSubject = ov.subject || '';
            } else {
              dmText = ov;
            }
            log.info(`[OVERRIDE] Using dm-overrides.json for ${contactName}`);
          } else {
            // Get DM text from campaign template
            const rawDm = await getLinkedInTemplate(task.emailer_campaign_id, 'linkedin_step_message');
            dmText = renderTemplate(rawDm, contact);

            // Check for unfilled placeholders
            if (hasUnfilledPlaceholder(dmText)) {
              log.warn(`Unfilled placeholder in DM for ${contactName} — skipping (needs manual fill)`);
              results.skipped_placeholder.push({ name: contactName });
              // DO NOT mark complete — leave for manual editing
              continue;
            }
          }

          if (!dmText) {
            log.warn(`Empty DM text for ${contactName} — skipping`);
            results.skipped_placeholder.push({ name: contactName, reason: 'empty template' });
            continue;
          }

          log.info(`DM text (${dmText.length} chars): "${dmText.substring(0, 80)}${dmText.length > 80 ? '...' : ''}"`);

          // Navigate to LinkedIn profile
          log.info(`Navigating to ${contact.linkedin_url}`);
          await liPage.goto(contact.linkedin_url, { waitUntil: 'domcontentloaded', timeout: 30000 });

          // Close any chat overlay left open from the previous contact — LinkedIn's
          // messaging panel survives navigation. sendDirectMessage re-verifies this and
          // refuses to send if it cannot reach a clean state, so a failure here is not silent.
          await closeMessageOverlays(liPage);

          // Verify connection status before sending DM
          const state = await detectLinkedInState(liPage);
          log.info(`LinkedIn state: ${state}`);

          // Connection status is NOT a gate. This account has Sales Navigator with
          // InMail, so a non-1st-degree contact is still reachable: the ordinary
          // linkedin.com Message control just does nothing for them, so those DMs
          // route through Sales Navigator instead. An unaccepted invite must never
          // park a Touch 7 task in the queue forever.
          const degree = await getProfileDegree(liPage);
          log.info(`Connection degree: ${degree || 'unknown'} (state: ${state})`);

          // Capture the profile URN before leaving the profile — it is the identity
          // key that lets a Sales Navigator name search be resolved safely.
          const profileUrn = await getProfileUrn(liPage);
          const displayName = await getProfileDisplayName(liPage);
          if (displayName && displayName !== contactName) {
            log.info(`LinkedIn shows this person as "${displayName}" (Apollo has "${contactName}")`);
          }

          // Compose-URL path first: it has a stronger anchor (profile slug) than the
          // overlay path, which cannot verify a recipient at all since LinkedIn stopped
          // rendering the "Close your conversation with X" label.
          let sendRes = await sendDirectMessageViaComposeUrl(liPage, dmText, contact);
          if (!sendRes.ok && !String(sendRes.reason).startsWith('compose_wrong_recipient')) {
            log.info(`Compose-URL DM unavailable for ${contactName} (${sendRes.reason}) — trying the legacy overlay path`);
            await liPage.goto(contact.linkedin_url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
            sendRes = await sendDirectMessage(liPage, dmText, contact);
          }

          // A guardrail block means we could not PROVE the recipient. Never retry
          // those through another channel; that is exactly how cross-delivery happens.
          const guardrailBlocked = !sendRes.ok && (
            sendRes.reason === 'overlay_not_cleared'
            || sendRes.reason === 'ledger_conflict'
            || sendRes.reason.startsWith('recipient_mismatch')
            || sendRes.reason.startsWith('multiple_conversations_open')
            || sendRes.reason === 'compose_content_mismatch'
            || sendRes.reason.startsWith('compose_fill_failed')
          );

          // Ordinary linkedin.com messaging simply does not open for non-connections.
          // That is a channel limitation, not an identity doubt, so fall back to
          // Sales Navigator InMail, which this account has credits for.
          if (!sendRes.ok && !guardrailBlocked) {
            log.info(`Direct DM unavailable for ${contactName} (${sendRes.reason}) — trying Sales Navigator InMail`);
            let subjectForInMail = dmSubject;
            if (!subjectForInMail) {
              subjectForInMail = await getLastEmailSubject(contact);
              if (subjectForInMail) {
                log.info(`InMail subject reused from the last email sent: "${subjectForInMail}"`);
              } else {
                log.warn(`No prior email subject found for ${contactName} — an InMail will stop rather than invent one`);
              }
            }
            const snRes = await sendViaSalesNavigator(liPage, dmText, contact, profileUrn, displayName, subjectForInMail, degree);
            if (snRes.ok) sendRes = snRes;
            else log.warn(`Sales Navigator fallback failed for ${contactName} (${snRes.reason})`);
          }

          if (sendRes.ok) {
            // Only a verified recipient + confirmed send reaches this branch.
            const via = sendRes.reason === 'sales_navigator' ? 'Sales Navigator InMail' : 'LinkedIn DM';
            await markTaskComplete(task.id);
            await addContactNote(contact.id, `${via} sent — ${today}`);
            await logSfdcActivity(contact, `[LinkedIn] ${via} sent`,
              `${via} sent via apollo-linkedin-connect.js (Apollo Touch 7).\nProfile: ${contact.linkedin_url || 'unknown'}\n\nMessage:\n${dmText}`);
            results.dms_sent.push({ name: contactName, thread: sendRes.thread, via });
          } else if (guardrailBlocked) {
            log.err(`DM to ${contactName} BLOCKED by safety check (${sendRes.reason}) — nothing sent, task left open`);
            results.blocked_wrong_thread.push({ name: contactName, reason: sendRes.reason });
          } else {
            // Could not reach them on either channel. Per Andrew: a non-acceptance is
            // not a gate, so the task still advances rather than retrying nightly
            // forever. It is reported loudly so the miss is never silent.
            log.warn(`Could not message ${contactName} on either channel (${sendRes.reason}) — completing task so the sequence advances`);
            await markTaskComplete(task.id);
            await addContactNote(contact.id,
              `LinkedIn Touch 7 could not be delivered (${sendRes.reason}) — task completed to advance the sequence — ${today}`);
            // Every path that closes a task must leave a CRM record. This one did not,
            // so 8 Touch 7s were closed with no trace in Salesforce and the account
            // history showed nothing at all for them.
            await logSfdcActivity(contact, '[LinkedIn] Step closed — could not be delivered',
              `linkedin_step_message could not be delivered on either channel (${sendRes.reason}).\n`
              + `Tried the direct LinkedIn DM and Sales Navigator InMail.\n`
              + `NO message was sent. The Apollo task was completed so the sequence advances.\n`
              + `Profile: ${contact.linkedin_url || 'unknown'}`);
            results.dm_undeliverable.push({ name: contactName, reason: sendRes.reason });
          }

          // Circuit breaker: one thread was about to receive two people's messages.
          // Stop the entire run rather than risk another cross-delivery.
          if (runAborted) {
            log.err('');
            log.err('=== RUN ABORTED BY CIRCUIT BREAKER ===');
            log.err(runAbortReason);
            log.err('Remaining tasks left untouched. Investigate before re-running.');
            break;
          }

        // ---- POST-LIKE / PROFILE-VIEW TASK (Touch 5) ----
        } else if (isPostEngagementTask(task)) {

          log.info(`Navigating to ${contact.linkedin_url}`);
          const outcome = await likeRecentPost(liPage, contact);

          // Mark complete regardless of outcome — no recent post is a valid result
          await markTaskComplete(task.id);

          if (outcome === 'liked') {
            await addContactNote(contact.id, `LinkedIn post liked — ${today}`);
            await logSfdcActivity(contact, '[LinkedIn] Post liked',
              `Liked the contact's most recent LinkedIn post via apollo-linkedin-connect.js (Apollo Touch 5).\nProfile: ${contact.linkedin_url || 'unknown'}`);
            results.posts_liked.push({ name: contactName });
          } else {
            await addContactNote(contact.id, `LinkedIn post check — no recent post found — ${today}`);
            results.posts_skipped_no_content.push({ name: contactName, reason: outcome });
          }
        }

      } catch (taskErr) {
        log.err(`Error on ${contactName}: ${taskErr.message}`);
        results.errors.push({ name: contactName, type: taskType, reason: taskErr.message });

        // Close any stray LinkedIn tabs
        for (const p of context.pages()) {
          if (p !== liPage && p.url().includes('linkedin.com')) {
            await p.close().catch(() => null);
          }
        }
        await liPage.bringToFront().catch(() => null);
      }

      await randomDelay();
    }

  } catch (err) {
    log.err(`Fatal error: ${err.message}`);
    console.error(err);
  } finally {
    // 6. FINAL STATS FLUSH
    saveStats(loadStats());

    // 7. SUMMARY
    const totalSent = results.connects_sent.length + results.dms_sent.length + results.posts_liked.length;
    const totalSkipped = results.skipped_cap.length + results.skipped_already.length
      + results.skipped_no_url.length + results.dm_undeliverable.length
      + results.skipped_not_connected.length + results.skipped_placeholder.length
      + results.posts_skipped_no_content.length;

    log.info('');
    log.info('========== SUMMARY ==========');
    log.info(`Connect cap: ${getConnectsSentToday(loadStats())}/${DAILY_CONNECT_CAP} sent today | ${getConnectsSentThisWeek(loadStats())}/${WEEKLY_CONNECT_CAP} sent this week`);
    log.info('');

    if (results.connects_sent.length > 0) {
      log.info(`✅ Connects sent (${results.connects_sent.length}):`);
      for (const t of results.connects_sent) {
        log.info(`    • ${t.name}${t.note ? ' [with note]' : ''}`);
      }
    }

    if (results.dm_undeliverable.length > 0) {
      log.warn(`⚠️  Could not be messaged on any channel — task advanced (${results.dm_undeliverable.length}): ${results.dm_undeliverable.map((t) => `${t.name} (${t.reason})`).join(', ')}`);
      log.warn('   → No Touch 7 message reached these people. The sequence moved on regardless.');
    }

    if (results.dms_sent.length > 0) {
      log.info(`✅ DMs sent (${results.dms_sent.length}):`);
      for (const t of results.dms_sent) {
        // Print the VERIFIED thread name alongside the intended target. If these ever
        // disagree in a log, cross-delivery is happening and the run should be stopped.
        log.info(`    • ${t.name}${t.via ? ` [${t.via}]` : ''}${t.thread && t.thread !== t.name ? ` [thread: ${t.thread}]` : ''}`);
      }
    }

    if (results.posts_liked.length > 0) {
      log.info(`✅ Posts liked (${results.posts_liked.length}):`);
      for (const t of results.posts_liked) {
        log.info(`    • ${t.name}`);
      }
    }

    if (results.posts_skipped_no_content.length > 0) {
      log.info(`⏭  No recent post — marked complete (${results.posts_skipped_no_content.length}): ${results.posts_skipped_no_content.map((t) => t.name).join(', ')}`);
    }

    if (results.sfdc_logged.length > 0) {
      log.info(`📋 Salesforce activity logged (${results.sfdc_logged.length}): ${results.sfdc_logged.map((t) => t.name).join(', ')}`);
    }

    if (results.sfdc_skipped.length > 0) {
      log.warn(`⚠️  Salesforce activity NOT logged (${results.sfdc_skipped.length}): ${results.sfdc_skipped.map((t) => `${t.name} (${t.reason})`).join(', ')}`);
    }

    if (results.skipped_cap.length > 0) {
      log.info(`⏭  Skipped — cap reached (${results.skipped_cap.length}): ${results.skipped_cap.map((t) => t.name).join(', ')}`);
    }

    if (results.skipped_already.length > 0) {
      log.info(`⏭  Skipped — already connected/pending (${results.skipped_already.length}): ${results.skipped_already.map((t) => `${t.name} (${t.reason})`).join(', ')}`);
    }

    if (results.skipped_no_url.length > 0) {
      log.warn(`⚠️  No LinkedIn URL — task completed, sequence advanced (${results.skipped_no_url.length}):`);
      for (const t of results.skipped_no_url) {
        log.warn(`    • ${t.name}${t.email ? ` <${t.email}>` : ' <no email>'} [${t.taskType}]`);
      }
      log.warn('   → No LinkedIn touch happened for these people. Add a LinkedIn URL in Apollo to re-enable it.');
    }

    if (results.skipped_not_connected.length > 0) {
      log.info(`⏳ Skipped — not connected yet (${results.skipped_not_connected.length}): ${results.skipped_not_connected.map((t) => `${t.name}${t.reason ? ` (${t.reason})` : ''}`).join(', ')}`);
      log.info('   → These are Touch 7 DMs waiting on a Touch 2 connect being accepted. Not errors.');
    }

    if (results.skipped_placeholder.length > 0) {
      log.warn(`⚠️  Skipped — unfilled placeholder (${results.skipped_placeholder.length}): ${results.skipped_placeholder.map((t) => t.name).join(', ')}`);
      log.warn('   → Edit these DMs manually in Apollo before next run');
    }

    if (results.blocked_wrong_thread.length > 0) {
      log.err(`🛑 DMs BLOCKED by recipient safety check (${results.blocked_wrong_thread.length}) — nothing was sent to these people:`);
      for (const t of results.blocked_wrong_thread) {
        log.err(`    • ${t.name}: ${t.reason}`);
      }
      log.err('   → Tasks left OPEN and will retry. No message reached a wrong recipient.');
    }

    if (results.errors.length > 0) {
      log.err(`❌ Errors (${results.errors.length}):`);
      for (const t of results.errors) {
        log.err(`    • ${t.name} [${t.type}]: ${t.reason}`);
      }
    }

    if (runAborted) {
      log.err('');
      log.err('🛑 RUN ABORTED BY CIRCUIT BREAKER');
      log.err(`   ${runAbortReason}`);
      log.err('   Tasks after the abort point were not processed.');
    }

    log.info('');
    log.info(`Total processed: ${totalSent} sent | ${totalSkipped} skipped | ${results.blocked_wrong_thread.length} blocked | ${results.errors.length} errors`);

    if (DRY_RUN) {
      log.info('');
      log.info('** DRY RUN — no actions or completions were made **');
    }

    log.info('Closing browser...');
    await context.close().catch(() => null);
  }
}

main().catch((e) => {
  log.err(e.message);
  process.exit(1);
});
