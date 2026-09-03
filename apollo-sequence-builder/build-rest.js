#!/usr/bin/env node
// REST-based Apollo sequence builder (fallback when Playwright login is unavailable).
// Creates 4 sequences x 7 touches from a *-4seq-content.json file, fills content,
// transfers ownership to Andrew, leaves SEQUENCE INACTIVE, individual steps active.
const fs = require('fs');
const path = require('path');
// This repo is public. Account identifiers live in ae-config.md, which is gitignored.
// Env wins; ae-config.md is the fallback.
function aeConfig(key) {
  if (process.env[key]) return process.env[key];
  for (const base of [__dirname, path.join(__dirname, '..')]) {
    const p = path.join(base, 'ae-config.md');
    if (fs.existsSync(p)) {
      const m = fs.readFileSync(p, 'utf8').match(new RegExp('^' + key + ':\\s*(.+)$', 'm'));
      if (m) return m[1].trim().replace(/`/g, '');
    }
  }
  console.error(`${key} is not set. Add it to ae-config.md or export it.`);
  process.exit(1);
}
const KEY = process.env.APOLLO_API_KEY;
const OWNER = aeConfig('APOLLO_USER_ID');
const BASE = 'https://api.apollo.io/v1';
const contentFile = process.argv[2];
if (!KEY) { console.error('APOLLO_API_KEY not set'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(contentFile, 'utf8'));

// gap (in days) from the previous step, matching the 7-touch cadence (1,2,5,8,11,14,17)
const WAIT_DAYS = [0, 1, 3, 3, 3, 3, 3];

// content step.type -> Apollo step type
const TYPE_MAP = {
  automatic_email: 'auto_email',
  manual_email: 'manual_email',
  linkedin_connect: 'linkedin_step_connect',
  linkedin_message: 'linkedin_step_message',
  phone_call: 'call',
  action_item: 'action_item',
};

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${txt.slice(0, 300)}`);
  return json;
}

function htmlize(text) {
  return '<div>' + String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
}

async function buildSequence(seq) {
  const out = { name: seq.name, steps: [] };
  // 1. create sequence (inactive)
  const created = await api('POST', '/emailer_campaigns', { name: seq.name, user_id: OWNER, permissions: 'team_can_use', active: false });
  const camp = created.emailer_campaign || created;
  const seqId = camp.id;
  out.id = seqId;
  // 2. transfer ownership (Apollo ignores user_id on POST)
  await api('PUT', `/emailer_campaigns/${seqId}`, { user_id: OWNER });

  // 3. steps in order
  for (let i = 0; i < seq.steps.length; i++) {
    const step = seq.steps[i];
    const apolloType = TYPE_MAP[step.type];
    if (!apolloType) throw new Error(`unknown step type ${step.type}`);
    const stepBody = {
      emailer_campaign_id: seqId,
      position: i + 1,
      type: apolloType,
      wait_time: WAIT_DAYS[i],
      wait_mode: 'day',
    };
    // notes live on the step for call / action_item
    if (apolloType === 'call' || apolloType === 'action_item') {
      stepBody.note = step.task_note || '';
    }
    const r = await api('POST', '/emailer_steps', stepBody);
    const estep = r.emailer_step;
    const touch = r.emailer_touch;
    const rec = { position: i + 1, type: apolloType, step_id: estep.id };

    // fill email content
    if (apolloType === 'auto_email' || apolloType === 'manual_email') {
      const tmplId = touch.emailer_template_id;
      const tbody = { body_text: step.body, body_html: htmlize(step.body) };
      if (step.email_type !== 'reply' && step.subject) tbody.subject = step.subject;
      if (step.email_type === 'reply') tbody.subject = ''; // reply inherits thread
      await api('PUT', `/emailer_templates/${tmplId}`, tbody);
      // mark touch reviewed/active so step is live (sequence stays inactive)
      try { await api('PUT', `/emailer_touches/${touch.id}`, { status: 'active' }); } catch (e) { rec.touch_status_warn = e.message.slice(0,80); }
      rec.template_id = tmplId;
    }
    // fill linkedin message content
    if (apolloType === 'linkedin_step_connect' || apolloType === 'linkedin_step_message') {
      const tmplId = touch.emailer_template_id;
      await api('PUT', `/emailer_templates/${tmplId}`, { body_text: step.message, body_html: htmlize(step.message) });
      rec.template_id = tmplId;
    }
    out.steps.push(rec);
    process.stdout.write(`  [${seq.name.split('Seq ')[1].slice(0,1)}] T${i+1} ${apolloType} ok\n`);
  }
  return out;
}

(async () => {
  const results = { account: data.account, built_at: new Date().toISOString(), sequences: [] };
  for (const seq of data.sequences) {
    try {
      console.log(`Building: ${seq.name}`);
      const r = await buildSequence(seq);
      r.status = r.steps.length === 7 ? 'ok' : 'partial';
      results.sequences.push(r);
      console.log(`  -> ${r.id} (${r.steps.length} steps) ${r.status}`);
    } catch (e) {
      console.error(`  FAILED ${seq.name}: ${e.message}`);
      results.sequences.push({ name: seq.name, status: 'failed', error: e.message });
    }
  }
  const outFile = contentFile.replace(/\.json$/, '_results.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log('Results written: ' + outFile);
})();
