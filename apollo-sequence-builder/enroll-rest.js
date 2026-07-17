#!/usr/bin/env node
// Create contacts + enroll into the 4 Sap Concur sequences via Apollo REST.
// Sequences stay INACTIVE. Contacts without email enroll with sequence_no_email:true.
const fs = require('fs');
const KEY = process.env.APOLLO_API_KEY;
const BASE = 'https://api.apollo.io/v1';
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(method, path, body, tries = 2) {
  for (let t = 0; t < tries; t++) {
    const res = await fetch(BASE + path, {
      method, headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await res.text();
    let json; try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
    if (res.ok) return json;
    if (t === tries - 1) throw new Error(`${method} ${path} -> ${res.status} ${txt.slice(0, 200)}`);
    await sleep(1500);
  }
}

(async () => {
  const report = { created: 0, dupes: 0, per_seq: {}, no_email_enrolled: [], errors: [] };
  for (const [k, seq] of Object.entries(cfg.sequences)) {
    const withEmail = [], noEmail = [];
    for (const c of seq.contacts) {
      const payload = {
        first_name: c.first_name, last_name: c.last_name, title: c.title,
        organization_name: cfg.account,
        label_names: ['Whale Pipeline', seq.label],
      };
      if (c.email) payload.email = c.email;
      try {
        const r = await api('POST', '/contacts', payload);
        const contact = r.contact || r;
        c.contact_id = contact.id;
        if (r.is_duplicate || contact.merged) report.dupes++; else report.created++;
        if (c.email) withEmail.push(c.contact_id); else { noEmail.push(c.contact_id); report.no_email_enrolled.push(`${c.first_name} ${c.last_name} (Seq ${k})`); }
        process.stdout.write(`  [${k}] contact ${c.first_name} ${c.last_name} -> ${c.contact_id}${c.email ? '' : ' (NO EMAIL)'}\n`);
      } catch (e) {
        report.errors.push(`contact ${c.first_name} ${c.last_name}: ${e.message}`);
        process.stdout.write(`  [${k}] CONTACT FAIL ${c.first_name} ${c.last_name}: ${e.message}\n`);
      }
      await sleep(300);
    }
    // enroll: do email + no-email separately so flags are correct
    const enroll = async (ids, noEmailFlag) => {
      if (!ids.length) return 0;
      const body = {
        emailer_campaign_id: seq.id,
        contact_ids: ids,
        send_email_from_email_account_id: cfg.send_from,
        sequence_active_in_other_campaigns: true,
        sequence_finished_in_other_campaigns: true,
        sequence_same_company_in_same_campaign: true,
        sequence_no_email: noEmailFlag,
      };
      const r = await api('POST', `/emailer_campaigns/${seq.id}/add_contact_ids`, body);
      const added = (r.contacts || r.emailer_campaign_contacts || []).length || ids.length;
      return added;
    };
    let enrolled = 0;
    try { enrolled += await enroll(withEmail, false); } catch (e) { report.errors.push(`enroll ${k} email: ${e.message}`); }
    await sleep(500);
    try { enrolled += await enroll(noEmail, true); } catch (e) { report.errors.push(`enroll ${k} noemail: ${e.message}`); }
    report.per_seq[k] = { seq_id: seq.id, contacts: seq.contacts.length, enrolled };
    process.stdout.write(`  [${k}] enrolled ${enrolled}/${seq.contacts.length}\n`);
    await sleep(500);
  }
  fs.writeFileSync(process.argv[2].replace(/\.json$/, '_results.json'), JSON.stringify(report, null, 2));
  console.log('\n=== ENROLL REPORT ===');
  console.log(JSON.stringify(report, null, 2));
})();
