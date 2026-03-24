#!/usr/bin/env python3
"""
YDC Sales Pipeline — AE Setup Server
Web-based configuration wizard for onboarding new account executives.

Usage:
    python setup_server.py
    open http://localhost:8002

Zero dependencies beyond Python stdlib.
"""

import json
import re
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

BASE_DIR    = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "ae-config.md"
PORT        = 8002

# ── Config I/O ────────────────────────────────────────────────────────────────

def parse_config() -> dict:
    text   = CONFIG_PATH.read_text()
    config = {}
    for block in re.findall(r'```\n(.*?)\n```', text, re.DOTALL):
        for line in block.strip().splitlines():
            m = re.match(r'^(\w+):\s*(.*)', line.strip())
            if m:
                config[m.group(1)] = m.group(2).strip()
    return config


def write_config(updates: dict):
    text = CONFIG_PATH.read_text()
    for key, value in updates.items():
        text = re.sub(
            r'^(' + re.escape(key) + r':)(\s+).*$',
            lambda m, v=value: m.group(1) + m.group(2) + v,
            text, flags=re.MULTILINE
        )
    CONFIG_PATH.write_text(text)


# ── Connection tests ──────────────────────────────────────────────────────────

def expand(p: str) -> Path:
    return Path(p).expanduser()

def test_rclone(remote: str, folder: str) -> dict:
    try:
        r1 = subprocess.run(['rclone', 'listremotes'], capture_output=True, text=True, timeout=6)
        if f'{remote}:' not in r1.stdout.splitlines():
            avail = ', '.join(r1.stdout.strip().splitlines()) or 'none'
            return {'ok': False, 'msg': f'Remote "{remote}" not found. Available: {avail}'}
        r2 = subprocess.run(['rclone', 'ls', f'{remote}:{folder}/'],
                            capture_output=True, text=True, timeout=10)
        if r2.returncode == 0:
            return {'ok': True, 'msg': f'"{remote}:" connected — folder accessible'}
        return {'ok': False, 'msg': f'Folder "{folder}" not found — create it in Drive first'}
    except FileNotFoundError:
        return {'ok': False, 'msg': 'rclone not installed'}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'msg': 'Timed out — check network or re-auth'}
    except Exception as e:
        return {'ok': False, 'msg': str(e)}

def test_node() -> dict:
    try:
        r = subprocess.run(['node', '--version'], capture_output=True, text=True, timeout=5)
        return {'ok': r.returncode == 0, 'msg': f'Node.js {r.stdout.strip()} installed' if r.returncode == 0 else 'node --version failed'}
    except FileNotFoundError:
        return {'ok': False, 'msg': 'Node.js not installed'}

def test_apollo_builder(path_str: str) -> dict:
    p = expand(path_str)
    if not p.exists():          return {'ok': False, 'msg': f'Directory not found: {p}'}
    if not (p / 'build-sequences.js').exists():
                                return {'ok': False, 'msg': 'build-sequences.js missing — copy from repo'}
    return {'ok': True, 'msg': 'Script found'}

def test_playwright(path_str: str) -> dict:
    p   = expand(path_str)
    nm  = p / 'node_modules'
    pw  = nm / '.bin' / 'playwright'
    if not nm.exists():  return {'ok': False, 'msg': 'node_modules missing — run npm install'}
    if not pw.exists():  return {'ok': False, 'msg': 'Playwright not found — run npm install'}
    return {'ok': True, 'msg': 'Playwright installed'}

def test_sales_deck(path_str: str) -> dict:
    p = expand(path_str)
    if p.exists():
        return {'ok': True, 'msg': f'Found ({p.stat().st_size / 1048576:.1f} MB)'}
    return {'ok': False, 'msg': f'File not found — download from shared Drive'}

def run_all_tests(cfg: dict) -> dict:
    return {
        'rclone':         test_rclone(cfg.get('RCLONE_REMOTE', 'gdrive'), cfg.get('GDRIVE_FOLDER', '')),
        'node':           test_node(),
        'apollo_builder': test_apollo_builder(cfg.get('APOLLO_BUILDER_PATH', '')),
        'playwright':     test_playwright(cfg.get('APOLLO_BUILDER_PATH', '')),
        'sales_deck':     test_sales_deck(cfg.get('SALES_DECK_PATH', '')),
    }


# ── HTML ──────────────────────────────────────────────────────────────────────

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>YDC Pipeline &mdash; AE Setup</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:           #f2f2f5;
  --surface:      #ffffff;
  --surface2:     #f7f7fa;
  --border:       #e2e2ea;
  --border2:      #c8c8d4;
  --text:         #18181f;
  --muted:        #64648a;
  --blue:         #2563eb;
  --blue-light:   #eff6ff;
  --blue-border:  #bfdbfe;
  --green:        #16a34a;
  --green-light:  #f0fdf4;
  --green-border: #86efac;
  --red:          #dc2626;
  --red-light:    #fef2f2;
  --amber:        #b45309;
  --amber-light:  #fffbeb;
  --amber-border: #fcd34d;
  --purple:       #6d28d9;
  --purple-light: #f5f3ff;
  --purple-border:#ddd6fe;
  --radius:       10px;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.55;
  min-height: 100vh;
}

/* ── Header ───────────────────────────────────────────────────────── */
.header {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 28px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 100;
}
.logo {
  width: 26px; height: 26px; flex-shrink: 0;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800; color: #fff;
}
.header-title { font-size: 13.5px; font-weight: 600; }
.header-file {
  margin-left: auto;
  font-size: 10.5px; color: var(--muted);
  font-family: ui-monospace, monospace;
  background: var(--surface2); border: 1px solid var(--border);
  padding: 2px 7px; border-radius: 4px;
}

/* ── Wizard shell ─────────────────────────────────────────────────── */
.wizard {
  max-width: 560px;
  margin: 40px auto;
  padding: 0 16px 60px;
}

/* ── Step indicator ───────────────────────────────────────────────── */
.stepper {
  display: flex; align-items: center;
  margin-bottom: 32px;
}
.st-item {
  display: flex; flex-direction: column; align-items: center;
  cursor: pointer; flex-shrink: 0;
}
.st-circle {
  width: 30px; height: 30px; border-radius: 50%;
  border: 2px solid var(--border2);
  background: var(--surface);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: var(--muted);
  transition: all 0.25s;
  position: relative; z-index: 1;
}
.st-label {
  font-size: 10px; font-weight: 500; color: var(--muted);
  margin-top: 5px; white-space: nowrap;
  transition: color 0.25s;
}
.st-line {
  flex: 1; height: 2px;
  background: var(--border);
  margin: 0 4px;
  margin-bottom: 20px; /* offset for label height */
  transition: background 0.25s;
}

/* Step states */
.st-item.active .st-circle {
  border-color: var(--blue); background: var(--blue); color: #fff;
}
.st-item.active .st-label { color: var(--blue); font-weight: 600; }

.st-item.done .st-circle {
  border-color: var(--green); background: var(--green-light); color: var(--green);
}
.st-item.done .st-label { color: var(--green); }
.st-line.done { background: var(--green); }

/* ── Card ─────────────────────────────────────────────────────────── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow: hidden;
}

.card-header {
  padding: 24px 28px 0;
}
.step-eyebrow {
  font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--blue); margin-bottom: 6px;
}
.card-title {
  font-size: 20px; font-weight: 700; color: var(--text);
  margin-bottom: 6px; line-height: 1.3;
}
.card-sub {
  font-size: 13px; color: var(--muted); line-height: 1.5;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
}

.card-body { padding: 24px 28px; }

.card-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 28px;
  border-top: 1px solid var(--border);
  background: var(--surface2);
}

/* ── Fields ───────────────────────────────────────────────────────── */
.field { margin-bottom: 16px; }
.field:last-child { margin-bottom: 0; }
.field label {
  display: flex; align-items: center; gap: 5px;
  font-size: 12.5px; font-weight: 500;
  color: var(--text); margin-bottom: 6px;
}
.req { color: var(--red); font-size: 10px; }
.opt {
  font-size: 10px; font-weight: 400;
  color: var(--muted);
  background: var(--surface2); border: 1px solid var(--border);
  padding: 1px 6px; border-radius: 10px;
}
.field-hint { font-size: 11.5px; color: var(--muted); margin-top: 5px; }
.field-warn { display: none; font-size: 11.5px; color: var(--amber); margin-top: 5px; }
.field-warn.show { display: block; }

input[type="text"],
input[type="email"],
input[type="password"] {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 13.5px; font-family: inherit; color: var(--text);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
}
input.warn  { border-color: var(--amber-border); }
input.valid { border-color: var(--green-border); }
input::placeholder { color: var(--border2); }

.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 480px) { .field-row { grid-template-columns: 1fr; } }

/* ── Folder browser ───────────────────────────────────────────────── */
.browse-wrap { position: relative; }
.browse-wrap input { padding-right: 74px; }
.browse-btn {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  background: var(--surface2); border: 1px solid var(--border2); border-radius: 5px;
  cursor: pointer; color: var(--blue); font-size: 11px; font-weight: 600;
  font-family: inherit; padding: 3px 8px; line-height: 1.4;
  white-space: nowrap;
}
.browse-btn:hover { background: var(--blue-light); border-color: var(--blue); }
.dir-picker {
  display: none; position: absolute; left: 0; right: 0; top: calc(100% + 4px);
  background: var(--surface); border: 1px solid var(--border2); border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.12); z-index: 200; overflow: hidden;
}
.dir-picker.open { display: block; }
.dir-crumb {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  background: var(--surface2); font-size: 11.5px;
}
.dir-crumb-path {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--muted); font-family: ui-monospace, monospace; direction: rtl; text-align: left;
}
.dir-up {
  flex-shrink: 0; background: none; border: none; cursor: pointer;
  color: var(--blue); font-size: 13px; padding: 0 2px; line-height: 1;
}
.dir-up:disabled { color: var(--border2); cursor: default; }
.dir-list { max-height: 220px; overflow-y: auto; }
.dir-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px; cursor: pointer; font-size: 13px;
  border-bottom: 1px solid var(--border);
  transition: background 0.1s;
}
.dir-item:last-child { border-bottom: none; }
.dir-item:hover { background: var(--blue-light); }
.dir-item.selected { background: var(--blue-light); border-left: 3px solid var(--blue); }
.dir-icon { font-size: 14px; flex-shrink: 0; }
.dir-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir-enter {
  flex-shrink: 0; font-size: 16px; font-weight: 600; color: var(--muted);
  background: none; border: none; cursor: pointer; padding: 4px 8px;
  line-height: 1; border-radius: 4px; transition: background 0.1s, color 0.1s;
}
.dir-enter:hover { color: var(--blue); background: var(--blue-light); }
.dir-actions {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; border-top: 1px solid var(--border);
  background: var(--surface2);
}
.dir-select-btn {
  font-size: 12px; font-weight: 600; padding: 5px 14px;
  background: var(--blue); color: #fff; border: none; border-radius: 6px; cursor: pointer;
}
.dir-select-btn:hover { background: #1d4ed8; }
.dir-cancel { font-size: 12px; color: var(--muted); background: none; border: none; cursor: pointer; }
.dir-cancel:hover { color: var(--text); }
.dir-empty { padding: 16px 12px; color: var(--muted); font-size: 12px; text-align: center; }

.input-wrap { position: relative; }
.input-wrap input { padding-right: 38px; }
.toggle-pw {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer;
  color: var(--blue); font-size: 11.5px; font-weight: 500;
  font-family: inherit; padding: 3px 4px; line-height: 1;
  text-decoration: underline; text-underline-offset: 2px;
}
.toggle-pw:hover { color: #1d4ed8; }

/* ── Buttons ──────────────────────────────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 18px; border-radius: 8px;
  border: none; cursor: pointer;
  font-size: 13.5px; font-weight: 500; font-family: inherit;
  transition: all 0.15s; white-space: nowrap;
}
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }

.btn-primary {
  background: var(--blue); color: #fff;
  box-shadow: 0 1px 3px rgba(37,99,235,0.3);
}
.btn-primary:hover:not(:disabled) { background: #1d4ed8; }

.btn-ghost {
  background: var(--surface); color: var(--text);
  border: 1px solid var(--border);
}
.btn-ghost:hover:not(:disabled) { background: var(--surface2); border-color: var(--border2); }

.btn-link {
  background: none; border: none; padding: 0;
  color: var(--muted); font-size: 12.5px;
  text-decoration: underline; text-underline-offset: 2px;
  cursor: pointer; font-family: inherit;
}
.btn-link:hover { color: var(--text); }

/* ── Connection test block ────────────────────────────────────────── */
.test-block {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 14px;
}
.test-block:last-child { margin-bottom: 0; }

.test-row {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px;
  background: var(--surface2);
}
.test-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: var(--border2); transition: background 0.2s;
}
.test-dot.ok   { background: var(--green); }
.test-dot.err  { background: var(--red); }
.test-dot.spin {
  background: var(--blue);
  animation: blink 0.65s ease-in-out infinite alternate;
}
@keyframes blink { from { opacity: 0.2; } to { opacity: 1; } }

.test-name { font-size: 13px; font-weight: 500; flex: 1; }
.test-msg  { font-size: 11.5px; color: var(--muted); }
.test-msg.ok  { color: var(--green); }
.test-msg.err { color: var(--red); }

.test-btn {
  flex-shrink: 0;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 4px 10px;
  font-size: 11.5px; font-weight: 500; color: var(--muted);
  cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.test-btn:hover { border-color: var(--blue); color: var(--blue); background: var(--blue-light); }
.test-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Fix command inside test block */
.fix-block {
  display: none;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--purple-light);
}
.fix-block.show { display: block; }
.fix-label { font-size: 11px; color: var(--muted); margin-bottom: 5px; }
.fix-block code {
  display: block;
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 11.5px; color: var(--purple);
  background: rgba(109,40,217,0.07);
  padding: 4px 8px; border-radius: 5px; margin-bottom: 4px;
}
.fix-btns { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
.copy-btn {
  background: none; border: 1px solid var(--purple-border);
  border-radius: 5px; padding: 3px 9px;
  font-size: 11px; color: var(--purple);
  cursor: pointer; font-family: inherit; transition: background 0.15s;
}
.copy-btn:hover { background: var(--purple-border); }
.copy-btn.copied { color: var(--green); border-color: var(--green-border); }
.terminal-btn {
  background: #1a1a1a; border: 1px solid #444;
  border-radius: 5px; padding: 3px 9px;
  font-size: 11px; color: #e8e8e8;
  cursor: pointer; font-family: inherit; transition: background 0.15s;
  display: inline-flex; align-items: center; gap: 4px;
}
.terminal-btn:hover { background: #333; }
.terminal-btn.launched { color: #4ade80; border-color: #4ade80; }

/* ── Info box ─────────────────────────────────────────────────────── */
.info-box {
  display: flex; gap: 10px;
  background: var(--blue-light); border: 1px solid var(--blue-border);
  border-radius: 8px; padding: 12px 14px;
  margin-bottom: 18px;
  font-size: 12.5px; color: #1e40af; line-height: 1.5;
}
.info-box .icon { flex-shrink: 0; font-size: 15px; margin-top: 1px; }

.warn-box {
  display: flex; gap: 10px;
  background: var(--amber-light); border: 1px solid var(--amber-border);
  border-radius: 8px; padding: 12px 14px;
  margin-bottom: 18px;
  font-size: 12.5px; color: var(--amber); line-height: 1.5;
}
.warn-box .icon { flex-shrink: 0; font-size: 15px; margin-top: 1px; }

/* ── Done step ────────────────────────────────────────────────────── */
.done-hero {
  text-align: center; padding: 8px 0 20px;
}
.done-icon  { font-size: 48px; margin-bottom: 12px; }
.done-title { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
.done-sub   { font-size: 13.5px; color: var(--muted); }

.summary-list {
  border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  margin-bottom: 20px;
}
.summary-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.summary-row:last-child { border-bottom: none; }
.summary-label { flex: 1; color: var(--muted); }
.summary-val   { font-weight: 500; }
.summary-dot   { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.summary-dot.ok  { background: var(--green); }
.summary-dot.err { background: var(--red); }
.summary-dot.skip { background: var(--border2); }

/* ── Step panels ──────────────────────────────────────────────────── */
.step-panel { display: none; }
.step-panel.active { display: block; }

/* ── Inline code ──────────────────────────────────────────────────── */
code.inline {
  font-family: ui-monospace, monospace; font-size: 11.5px;
  background: var(--surface2); border: 1px solid var(--border);
  padding: 1px 5px; border-radius: 4px;
}

/* ── Footer nav helpers ───────────────────────────────────────────── */
.footer-left  { display: flex; align-items: center; gap: 10px; }
.footer-right { display: flex; align-items: center; gap: 10px; }
.step-counter { font-size: 11.5px; color: var(--muted); }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="logo">Y</div>
  <span class="header-title">YDC Sales Pipeline &mdash; AE Setup</span>
  <span class="header-file">ae-config.md</span>
</div>

<div class="wizard">

  <!-- Step indicator -->
  <div class="stepper" id="stepper">
    <div class="st-item active" id="st-1" onclick="jumpTo(1)">
      <div class="st-circle" id="sc-1">1</div>
      <span class="st-label">Identity</span>
    </div>
    <div class="st-line" id="sl-1"></div>
    <div class="st-item" id="st-2" onclick="jumpTo(2)">
      <div class="st-circle" id="sc-2">2</div>
      <span class="st-label">Builder</span>
    </div>
    <div class="st-line" id="sl-2"></div>
    <div class="st-item" id="st-3" onclick="jumpTo(3)">
      <div class="st-circle" id="sc-3">3</div>
      <span class="st-label">Drive</span>
    </div>
    <div class="st-line" id="sl-3"></div>
    <div class="st-item" id="st-4" onclick="jumpTo(4)">
      <div class="st-circle" id="sc-4">4</div>
      <span class="st-label">Deck</span>
    </div>
    <div class="st-line" id="sl-4"></div>
    <div class="st-item" id="st-5" onclick="jumpTo(5)">
      <div class="st-circle" id="sc-5">&#10003;</div>
      <span class="st-label">Done</span>
    </div>
  </div>

  <!-- ═══════════════════ STEP 1: IDENTITY ═══════════════════ -->
  <div class="step-panel active" id="panel-1">
    <div class="card">
      <div class="card-header">
        <div class="step-eyebrow">Step 1 of 4</div>
        <div class="card-title">Let&rsquo;s get you set up</div>
        <div class="card-sub">
          These details appear in every outreach email signature, Apollo sequence label,
          and account plan generated by the pipeline. Use your name exactly as you want
          it to appear in a cold email.
        </div>
      </div>
      <div class="card-body">
        <div class="field-row">
          <div class="field">
            <label>Full Name <span class="req">*</span></label>
            <input type="text" id="AE_NAME" placeholder="Full name"
                   oninput="autoFirstName()" onblur="checkStep1()">
            <div class="field-hint">In signatures &amp; Apollo labels</div>
          </div>
          <div class="field">
            <label>First Name <span class="req">*</span></label>
            <input type="text" id="AE_FIRST_NAME" placeholder="First name"
                   data-manual="false" onblur="checkStep1()">
            <div class="field-hint">Auto-filled from Full Name</div>
          </div>
        </div>
        <div class="field">
          <label>You.com Email <span class="req">*</span></label>
          <input type="email" id="AE_EMAIL" placeholder="name@you.com"
                 onblur="validateEmail()">
          <div class="field-warn" id="warn-email">&#9888; Should end in @you.com</div>
        </div>
        <div class="field">
          <label>Title <span class="req">*</span></label>
          <input type="text" id="AE_TITLE" placeholder="e.g. API Sales, You.com"
                 onblur="checkStep1()">
          <div class="field-hint">Appears in email signatures</div>
        </div>
      </div>
      <div class="card-footer">
        <div class="footer-left">
          <span class="step-counter" id="s1-err" style="color:var(--red)"></span>
        </div>
        <div class="footer-right">
          <button class="btn btn-primary" id="s1-next" onclick="saveAndNext(1)" disabled>
            Continue &rarr;
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════ STEP 2: APOLLO BUILDER ═══════════════════ -->
  <div class="step-panel" id="panel-2">
    <div class="card">
      <div class="card-header">
        <div class="step-eyebrow">Step 2 of 4</div>
        <div class="card-title">Apollo Sequence Builder</div>
        <div class="card-sub">
          A local Node.js + Playwright script that automates sequence creation in Apollo&rsquo;s UI.
          It runs outside Claude to avoid browser errors burning conversation tokens.
        </div>
      </div>
      <div class="card-body">
        <div class="field" style="margin-bottom:20px; position:relative;">
          <label>Script Directory <span class="req">*</span></label>
          <div class="browse-wrap">
            <input type="text" id="APOLLO_BUILDER_PATH"
                   placeholder="~/Desktop/YDC Pipeline/apollo-sequence-builder"
                   oninput="closePicker()" autocomplete="off">
            <button class="browse-btn" type="button" onclick="openPicker()">&#128193; Browse</button>
          </div>
          <div class="field-hint">
            Folder containing <code class="inline">build-sequences.js</code> &mdash; type a path or click Browse
          </div>
          <!-- Inline directory picker -->
          <div class="dir-picker" id="dirPicker">
            <div class="dir-crumb">
              <button class="dir-up" id="dirUp" onclick="pickerUp()" title="Go up">&#8593;</button>
              <span class="dir-crumb-path" id="dirCrumb">/</span>
            </div>
            <div class="dir-list" id="dirList"></div>
            <div class="dir-actions">
              <button class="dir-cancel" onclick="closePicker()">Cancel</button>
              <button class="dir-select-btn" onclick="selectCurrentDir()">
                Select This Folder
              </button>
            </div>
          </div>
        </div>

        <!-- Three sequential checks -->
        <div class="test-block">
          <div class="test-row">
            <div class="test-dot" id="dot-apollo_builder"></div>
            <span class="test-name">Script directory</span>
            <span class="test-msg" id="msg-apollo_builder">Not tested</span>
            <button class="test-btn" onclick="runTest('apollo_builder')">Check</button>
          </div>
          <div class="fix-block" id="fix-apollo_builder">
            <div class="fix-label">Create the directory and copy the script from the repo:</div>
            <code>mkdir -p ~/Desktop/YDC\\ Pipeline/apollo-sequence-builder</code>
            <code>cp apollo-sequence-builder/* ~/Desktop/YDC\\ Pipeline/apollo-sequence-builder/</code>
            <div class="fix-btns">
              <button class="copy-btn" onclick="copyText(this,'mkdir -p ~/Desktop/YDC\\ Pipeline/apollo-sequence-builder && cp apollo-sequence-builder/* ~/Desktop/YDC\\ Pipeline/apollo-sequence-builder/')">Copy</button>
              <button class="terminal-btn" onclick="openInTerminal(this,'mkdir -p ~/Desktop/YDC\\ Pipeline/apollo-sequence-builder && cp apollo-sequence-builder/* ~/Desktop/YDC\\ Pipeline/apollo-sequence-builder/')">&#x2318; Open in Terminal</button>
            </div>
          </div>
        </div>

        <div class="test-block">
          <div class="test-row">
            <div class="test-dot" id="dot-node"></div>
            <span class="test-name">Node.js</span>
            <span class="test-msg" id="msg-node">Not tested</span>
            <button class="test-btn" onclick="runTest('node')">Check</button>
          </div>
          <div class="fix-block" id="fix-node">
            <div class="fix-label">Install Node.js via Homebrew:</div>
            <code>brew install node</code>
            <div class="fix-btns">
              <button class="copy-btn" onclick="copyText(this,'brew install node')">Copy</button>
              <button class="terminal-btn" onclick="openInTerminal(this,'brew install node')">&#x2318; Open in Terminal</button>
            </div>
          </div>
        </div>

        <div class="test-block">
          <div class="test-row">
            <div class="test-dot" id="dot-playwright"></div>
            <span class="test-name">Playwright (npm install)</span>
            <span class="test-msg" id="msg-playwright">Not tested</span>
            <button class="test-btn" onclick="runTest('playwright')">Check</button>
          </div>
          <div class="fix-block" id="fix-playwright">
            <div class="fix-label">Install dependencies in the script directory:</div>
            <code>cd ~/Desktop/YDC\\ Pipeline/apollo-sequence-builder</code>
            <code>npm install</code>
            <div class="fix-btns">
              <button class="copy-btn" onclick="copyText(this,'cd ~/Desktop/YDC\\ Pipeline/apollo-sequence-builder && npm install')">Copy</button>
              <button class="terminal-btn" onclick="openInTerminal(this,'cd ~/Desktop/YDC\\ Pipeline/apollo-sequence-builder && npm install')">&#x2318; Open in Terminal</button>
            </div>
          </div>
        </div>

        <div style="margin-top:14px">
          <button class="btn btn-ghost" style="width:100%;justify-content:center"
                  onclick="runTestGroup(['apollo_builder','node','playwright'])">
            &#9654; Test All Three
          </button>
        </div>
      </div>
      <div class="card-footer">
        <div class="footer-left">
          <button class="btn btn-ghost" onclick="goTo(1)">&larr; Back</button>
        </div>
        <div class="footer-right">
          <button class="btn-link" onclick="saveAndNext(2, true)">Skip for now</button>
          <button class="btn btn-primary" onclick="saveAndNext(2)">Continue &rarr;</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════ STEP 3: GOOGLE DRIVE ═══════════════════ -->
  <div class="step-panel" id="panel-3">
    <div class="card">
      <div class="card-header">
        <div class="step-eyebrow">Step 3 of 4</div>
        <div class="card-title">Google Drive</div>
        <div class="card-sub">
          Account plan documents (.docx) are uploaded to your Drive automatically after
          each pipeline run using rclone &mdash; a CLI tool for cloud storage.
        </div>
      </div>
      <div class="card-body">
        <div class="info-box">
          <span class="icon">&#x2139;&#xFE0F;</span>
          <div>
            <strong>First time?</strong> Install and authenticate rclone:<br>
            <code class="inline" style="display:inline-block;margin-top:5px">brew install rclone</code>
            &nbsp;then&nbsp;
            <code class="inline">rclone config</code>
            &nbsp;&rarr; New remote &rarr; name it <em>gdrive</em> &rarr; type: Google Drive &rarr; follow OAuth.
          </div>
        </div>

        <div class="field-row" style="margin-bottom:20px">
          <div class="field">
            <label>rclone Remote <span class="req">*</span></label>
            <input type="text" id="RCLONE_REMOTE" placeholder="gdrive">
            <div class="field-hint">
              Verify with <code class="inline">rclone listremotes</code>
            </div>
          </div>
          <div class="field">
            <label>Drive Folder <span class="req">*</span></label>
            <input type="text" id="GDRIVE_FOLDER"
                   placeholder="Account Plans, Lists &amp; Personalized Sequences">
            <div class="field-hint">Must exist in your Drive</div>
          </div>
        </div>

        <div class="test-block">
          <div class="test-row">
            <div class="test-dot" id="dot-rclone"></div>
            <span class="test-name">rclone + Drive folder</span>
            <span class="test-msg" id="msg-rclone">Not tested</span>
            <button class="test-btn" onclick="runTest('rclone')">Test</button>
          </div>
          <div class="fix-block" id="fix-rclone">
            <div class="fix-label">Install rclone and set up Google Drive remote:</div>
            <code>brew install rclone</code>
            <code>rclone config</code>
            <div class="fix-btns">
              <button class="copy-btn" onclick="copyText(this,'brew install rclone && rclone config')">Copy</button>
              <button class="terminal-btn" onclick="openInTerminal(this,'brew install rclone && rclone config')">&#x2318; Open in Terminal</button>
            </div>
          </div>
        </div>
      </div>
      <div class="card-footer">
        <div class="footer-left">
          <button class="btn btn-ghost" onclick="goTo(2)">&larr; Back</button>
        </div>
        <div class="footer-right">
          <button class="btn-link" onclick="saveAndNext(3, true)">Skip for now</button>
          <button class="btn btn-primary" onclick="saveAndNext(3)">Continue &rarr;</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════ STEP 4: SALES DECK ═══════════════════ -->
  <div class="step-panel" id="panel-4">
    <div class="card">
      <div class="card-header">
        <div class="step-eyebrow">Step 4 of 4</div>
        <div class="card-title">Sales Deck PDF</div>
        <div class="card-sub">
          The current You.com pitch bible. Claude reads this at the start of each pipeline
          run for pitch framing, case study references, and competitive positioning.
        </div>
      </div>
      <div class="card-body">
        <div class="warn-box">
          <span class="icon">&#x1F4C2;</span>
          <span>
            Download the latest deck from the shared Google Drive folder
            (ask your manager or sales ops if you don&rsquo;t have access).
            Save it locally and paste the path below.
          </span>
        </div>

        <div class="field" style="margin-bottom:20px">
          <label>Local PDF Path <span class="req">*</span></label>
          <input type="text" id="SALES_DECK_PATH"
                 placeholder="~/Downloads/You.com - AI Search Infra Pitch Deck.pdf">
          <div class="field-hint">Full local path including filename</div>
        </div>

        <div class="test-block">
          <div class="test-row">
            <div class="test-dot" id="dot-sales_deck"></div>
            <span class="test-name">Sales deck file</span>
            <span class="test-msg" id="msg-sales_deck">Not tested</span>
            <button class="test-btn" onclick="runTest('sales_deck')">Check</button>
          </div>
          <div class="fix-block" id="fix-sales_deck">
            <div class="fix-label">
              File not found at that path. Download the deck, update the path above, then re-check.
            </div>
          </div>
        </div>
      </div>
      <div class="card-footer">
        <div class="footer-left">
          <button class="btn btn-ghost" onclick="goTo(3)">&larr; Back</button>
        </div>
        <div class="footer-right">
          <button class="btn-link" onclick="saveAndNext(4, true)">Skip for now</button>
          <button class="btn btn-primary" onclick="saveAndNext(4)">Finish &amp; Review &rarr;</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════ STEP 5: DONE ═══════════════════ -->
  <div class="step-panel" id="panel-5">
    <div class="card">
      <div class="card-body">

        <div class="done-hero" id="done-hero">
          <div class="done-icon">&#x2705;</div>
          <div class="done-title">You&rsquo;re all set!</div>
          <div class="done-sub">Configuration saved to ae-config.md</div>
        </div>

        <!-- Summary -->
        <div class="summary-list" id="summaryList">
          <!-- populated by JS -->
        </div>

        <!-- MCP reminder -->
        <div class="warn-box">
          <span class="icon">&#9888;&#xFE0F;</span>
          <div>
            <strong>Two more things not configured here:</strong><br>
            <strong>Apollo MCP</strong> and <strong>Slack MCP</strong> are connected in
            Claude Code settings &mdash; not this file. Ask your admin for the server config
            and compare it against <code class="inline">settings.json</code> in this repo.
          </div>
        </div>

        <!-- Launch -->
        <div style="text-align:center; padding-top: 4px;">
          <p style="font-size:13px; color:var(--muted); margin-bottom:14px;">
            Open a terminal in the project directory and start Claude Code:
          </p>
          <div style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:12px 16px; font-family:ui-monospace,monospace; font-size:13px; margin-bottom:16px; text-align:left;">
            cd /path/to/ydc-sales-pipeline<br>claude
          </div>
          <p style="font-size:12.5px; color:var(--muted);">
            Then say: <em>&ldquo;Run pipeline for [Company Name]&rdquo;</em>
          </p>
        </div>

      </div>
      <div class="card-footer" style="justify-content:center">
        <button class="btn btn-ghost" onclick="goTo(1)">&#x21BA; Start over</button>
      </div>
    </div>
  </div>

  <!-- Start over — always visible below the card -->
  <div style="text-align:center; margin-top:16px;">
    <button class="btn-link" onclick="confirmStartOver()"
            style="font-size:12px; color:var(--muted);">
      &#x21BA; Start over &amp; clear saved values
    </button>
  </div>

</div><!-- /wizard -->

<script>
// ── State ─────────────────────────────────────────────────────────────────────
let current = 1;
const TOTAL  = 4;

// Fields saved on each step
const STEP_FIELDS = {
  1: ['AE_NAME','AE_FIRST_NAME','AE_EMAIL','AE_TITLE'],
  2: ['APOLLO_BUILDER_PATH'],
  3: ['RCLONE_REMOTE','GDRIVE_FOLDER'],
  4: ['SALES_DECK_PATH'],
};

// Map service key → API endpoint suffix
const SVC_ENDPOINT = {
  rclone:         'rclone',
  node:           'node',
  apollo_builder: 'apollo-builder',
  playwright:     'playwright',
  sales_deck:     'sales-deck',
};

// Track test results for summary
const testResults = {};

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('AE_FIRST_NAME')
    .addEventListener('input', e => e.target.dataset.manual = 'true');

  await loadAllFields();
  restoreState();
  updateStepper();
});

async function loadAllFields() {
  try {
    const cfg = await (await fetch('/api/config')).json();
    const ALL_FIELDS = ['AE_NAME','AE_FIRST_NAME','AE_EMAIL','AE_TITLE',
                        'APOLLO_BUILDER_PATH','SALES_DECK_PATH',
                        'RCLONE_REMOTE','GDRIVE_FOLDER'];
    ALL_FIELDS.forEach(k => {
      const el = document.getElementById(k);
      if (!el) return;
      el.value = cfg[k] || '';
    });
    // If identity loaded, mark first-name as manual so auto-fill doesn't clobber it
    if (cfg.AE_FIRST_NAME) {
      document.getElementById('AE_FIRST_NAME').dataset.manual = 'true';
    }
    // Re-run step 1 validation so Continue unlocks if fields are already filled
    checkStep1();
  } catch (e) { console.error('Load failed', e); }
}

// Persist & restore wizard position using localStorage
function saveState() {
  const done = [];
  for (let i = 1; i <= 4; i++) {
    const c = document.getElementById('sc-' + i);
    if (c && c.dataset.done === 'true') done.push(i);
  }
  localStorage.setItem('ydc_step',  current);
  localStorage.setItem('ydc_done',  JSON.stringify(done));
}

function restoreState() {
  const savedStep = parseInt(localStorage.getItem('ydc_step') || '1', 10);
  const savedDone = JSON.parse(localStorage.getItem('ydc_done') || '[]');

  // Restore completed badges
  savedDone.forEach(i => {
    const c = document.getElementById('sc-' + i);
    if (c) { c.dataset.done = 'true'; c.textContent = '\\u2713'; }
    const line = document.getElementById('sl-' + i);
    if (line) line.classList.add('done');
  });

  // Restore step (clamp to valid range)
  if (savedStep > 1) goTo(Math.min(savedStep, 5));
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goTo(n) {
  document.getElementById('panel-' + current).classList.remove('active');
  current = n;
  document.getElementById('panel-' + current).classList.add('active');
  updateStepper();
  saveState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function jumpTo(n) {
  // Only allow jumping to completed steps or current+1
  if (n <= current || n === current + 1) goTo(n);
}

async function saveAndNext(step, skip = false) {
  // Collect fields for this step
  const data = {};
  (STEP_FIELDS[step] || []).forEach(k => {
    const el = document.getElementById(k);
    if (el) data[k] = el.value.trim();
  });

  // Save to ae-config.md
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (e) { console.error('Save failed', e); }

  // Mark step done in stepper
  markDone(step);

  // If this is the last step, show done screen with summary
  if (step >= TOTAL) {
    await buildSummary();
    goTo(5);
  } else {
    goTo(step + 1);
  }
}

function updateStepper() {
  for (let i = 1; i <= 5; i++) {
    const item   = document.getElementById('st-' + i);
    const circle = document.getElementById('sc-' + i);
    if (!item) continue;
    item.classList.remove('active', 'done');
    if (i === current) {
      item.classList.add('active');
    } else if (circle && circle.dataset.done === 'true') {
      item.classList.add('done');
    }
    if (i < 5) {
      const line = document.getElementById('sl-' + i);
      if (line) {
        line.classList.toggle('done', circle && circle.dataset.done === 'true');
      }
    }
  }
}

function markDone(step) {
  const circle = document.getElementById('sc-' + step);
  if (!circle) return;
  circle.dataset.done = 'true';
  circle.textContent  = '✓';
  updateStepper();
}

// ── Step 1 validation ─────────────────────────────────────────────────────────
function autoFirstName() {
  const first = document.getElementById('AE_FIRST_NAME');
  if (first.dataset.manual === 'true') return;
  const full  = document.getElementById('AE_NAME').value.trim();
  first.value = full.split(/\\s+/)[0] || '';
  checkStep1();
}

function validateEmail() {
  const el   = document.getElementById('AE_EMAIL');
  const warn = document.getElementById('warn-email');
  const v    = el.value.trim();
  const bad  = v && !v.endsWith('@you.com');
  el.classList.toggle('warn',  bad);
  el.classList.toggle('valid', !bad && !!v);
  warn.classList.toggle('show', bad);
  checkStep1();
}

function checkStep1() {
  const name  = document.getElementById('AE_NAME').value.trim();
  const first = document.getElementById('AE_FIRST_NAME').value.trim();
  const email = document.getElementById('AE_EMAIL').value.trim();
  const title = document.getElementById('AE_TITLE').value.trim();
  const ok    = name && first && email && email.endsWith('@you.com') && title;
  const btn   = document.getElementById('s1-next');
  const err   = document.getElementById('s1-err');
  btn.disabled = !ok;
  if (!ok && (name || email || title)) {
    err.textContent = email && !email.endsWith('@you.com')
      ? 'Email must end in @you.com'
      : 'Fill in all fields to continue';
  } else {
    err.textContent = '';
  }
}

// ── Connection tests ──────────────────────────────────────────────────────────
async function runTest(svc) {
  setChecking(svc);
  // Save current step's fields first so the server uses the latest values
  const stepForSvc = { rclone: 3, node: 2, apollo_builder: 2, playwright: 2, sales_deck: 4 };
  const step = stepForSvc[svc];
  if (step) {
    const data = {};
    (STEP_FIELDS[step] || []).forEach(k => {
      const el = document.getElementById(k);
      if (el) data[k] = el.value.trim();
    });
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(() => {});
  }

  try {
    const res = await fetch('/api/test/' + SVC_ENDPOINT[svc], { method: 'POST' });
    const r   = await res.json();
    setResult(svc, r.ok, r.msg);
    testResults[svc] = r;
  } catch (e) {
    setResult(svc, false, 'Request failed');
    testResults[svc] = { ok: false, msg: 'Request failed' };
  }
}

async function runTestGroup(svcs) {
  for (const svc of svcs) await runTest(svc);
}

function setChecking(svc) {
  const dot = document.getElementById('dot-' + svc);
  const msg = document.getElementById('msg-' + svc);
  const fix = document.getElementById('fix-' + svc);
  if (dot) dot.className = 'test-dot spin';
  if (msg) { msg.textContent = 'Checking\u2026'; msg.className = 'test-msg'; }
  if (fix) fix.classList.remove('show');
}

function setResult(svc, ok, text) {
  const dot = document.getElementById('dot-' + svc);
  const msg = document.getElementById('msg-' + svc);
  const fix = document.getElementById('fix-' + svc);
  if (dot) dot.className = 'test-dot ' + (ok ? 'ok' : 'err');
  if (msg) { msg.textContent = text || ''; msg.className = 'test-msg ' + (ok ? 'ok' : 'err'); }
  if (fix) ok ? fix.classList.remove('show') : fix.classList.add('show');
}

// ── Done / Summary ────────────────────────────────────────────────────────────
async function buildSummary() {
  // Run all tests fresh for the summary
  try {
    const res     = await fetch('/api/test/all', { method: 'POST' });
    const results = await res.json();
    Object.assign(testResults, results);
  } catch (e) {}

  const cfg = await (await fetch('/api/config')).json().catch(() => ({}));

  const rows = [
    { label: 'Identity',         val: cfg.AE_NAME || '—',     svc: null },
    { label: 'Email',            val: cfg.AE_EMAIL || '—',    svc: null },
    { label: 'rclone + Drive',   val: null,                   svc: 'rclone' },
    { label: 'Node.js',          val: null,                   svc: 'node' },
    { label: 'Apollo Builder',   val: null,                   svc: 'apollo_builder' },
    { label: 'Playwright',       val: null,                   svc: 'playwright' },
    { label: 'Sales Deck',       val: null,                   svc: 'sales_deck' },
  ];

  const list = document.getElementById('summaryList');
  list.innerHTML = rows.map(row => {
    let dotClass = 'skip', valStr = row.val || '';
    if (row.svc) {
      const r = testResults[row.svc];
      if (r) {
        dotClass = r.ok ? 'ok' : (row.opt ? 'skip' : 'err');
        valStr   = r.msg || '';
      } else {
        valStr = row.opt ? 'Skipped' : 'Not tested';
      }
    }
    return `<div class="summary-row">
      <div class="summary-dot ${dotClass}"></div>
      <span class="summary-label">${row.label}</span>
      <span class="summary-val">${valStr}</span>
    </div>`;
  }).join('');

  // Update hero based on pass rate
  const total  = Object.keys(testResults).length;
  const passed = Object.values(testResults).filter(r => r.ok).length;
  const hero   = document.getElementById('done-hero');
  if (passed === total && total > 0) {
    hero.querySelector('.done-icon').textContent = '\\u2705';
    hero.querySelector('.done-title').textContent = "You're all set!";
    hero.querySelector('.done-sub').textContent   = 'All connections verified.';
  } else {
    hero.querySelector('.done-icon').textContent = '\\uD83D\\uDCCB';
    hero.querySelector('.done-title').textContent = 'Config saved';
    hero.querySelector('.done-sub').textContent   =
      `${passed} of ${total} connections verified — fix the red items above then re-run setup.`;
  }
}

// ── Folder picker ─────────────────────────────────────────────────────────────
let pickerCurrentPath = null;

async function openPicker() {
  const input  = document.getElementById('APOLLO_BUILDER_PATH');
  const picker = document.getElementById('dirPicker');
  const raw    = input.value.trim() || '~';
  await loadDir(raw);
  picker.classList.add('open');
  // Stop all clicks inside the picker from reaching the document handler
  picker.onclick = e => e.stopPropagation();
  // Close on outside click
  setTimeout(() => document.addEventListener('click', outsidePickerClick, { once: true }), 10);
}

function outsidePickerClick(e) {
  const picker = document.getElementById('dirPicker');
  if (!picker.contains(e.target) && !e.target.classList.contains('browse-btn')) {
    closePicker();
  } else {
    // Re-attach if click was inside
    setTimeout(() => document.addEventListener('click', outsidePickerClick, { once: true }), 10);
  }
}

function closePicker() {
  document.getElementById('dirPicker').classList.remove('open');
}

async function loadDir(path) {
  const list = document.getElementById('dirList');
  list.innerHTML = '<div class="dir-empty">Loading\u2026</div>';
  try {
    const res  = await fetch('/api/browse?path=' + encodeURIComponent(path));
    const data = await res.json();
    pickerCurrentPath = data.current;
    document.getElementById('dirCrumb').textContent = data.current;
    document.getElementById('dirUp').disabled = !data.parent;

    if (data.entries.length === 0) {
      list.innerHTML = '<div class="dir-empty">No sub-folders here</div>';
      return;
    }
    list.innerHTML = data.entries.map(e => {
      const safePath = e.path.replace(/"/g, '&quot;');
      const safeName = e.name.replace(/</g, '&lt;');
      return `<div class="dir-item" data-path="${safePath}">
        <span class="dir-icon">&#128193;</span>
        <span class="dir-name dir-name-click" data-path="${safePath}">${safeName}</span>
        <button class="dir-enter" data-path="${safePath}" title="Open folder">&#8594;</button>
      </div>`;
    }).join('');

    // Click folder name/icon → select it; click arrow → navigate into it
    list.querySelectorAll('.dir-item').forEach(row => {
      row.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target.classList.contains('dir-enter')) {
          loadDir(e.target.dataset.path);
        } else {
          pickerCurrentPath = row.dataset.path;
          document.getElementById('dirCrumb').textContent = pickerCurrentPath;
          list.querySelectorAll('.dir-item').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
        }
      });
    });
  } catch (err) {
    list.innerHTML = '<div class="dir-empty">Failed to load directory</div>';
  }
}

function pickerUp() {
  const crumb = document.getElementById('dirCrumb').textContent;
  const up    = crumb.split('/').slice(0, -1).join('/') || '/';
  loadDir(up || '/');
}

function selectCurrentDir() {
  if (!pickerCurrentPath) return;
  document.getElementById('APOLLO_BUILDER_PATH').value = pickerCurrentPath;
  closePicker();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function togglePw(id, btn) {
  const el  = document.getElementById(id);
  el.type   = el.type === 'password' ? 'text' : 'password';
  btn.textContent = el.type === 'text' ? 'Hide' : 'Show';
}

// ── Start over ────────────────────────────────────────────────────────────────
function confirmStartOver() {
  if (!confirm('Clear all saved values and start from the beginning?')) return;
  startOver();
}

async function startOver() {
  // Clear every field in the DOM
  const allFields = ['AE_NAME','AE_FIRST_NAME','AE_EMAIL','AE_TITLE',
                     'APOLLO_BUILDER_PATH','SALES_DECK_PATH',
                     'RCLONE_REMOTE','GDRIVE_FOLDER'];
  allFields.forEach(k => {
    const el = document.getElementById(k);
    if (el) { el.value = ''; el.className = el.className.replace(/\\b(warn|valid)\\b/g, '').trim(); }
  });

  // Clear warnings
  ['warn-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });

  // Reset all test dots + messages
  ['rclone','node','apollo_builder','playwright','sales_deck'].forEach(svc => {
    const dot = document.getElementById('dot-' + svc);
    const msg = document.getElementById('msg-' + svc);
    const fix = document.getElementById('fix-' + svc);
    if (dot) dot.className = 'test-dot';
    if (msg) { msg.textContent = 'Not tested'; msg.className = 'test-msg'; }
    if (fix) fix.classList.remove('show');
  });

  // Reset step badges back to numbers
  for (let i = 1; i <= 4; i++) {
    const circle = document.getElementById('sc-' + i);
    if (circle) { circle.dataset.done = 'false'; circle.textContent = i; }
    const line = document.getElementById('sl-' + i);
    if (line) line.classList.remove('done');
  }

  // Reset first-name manual flag
  const fn = document.getElementById('AE_FIRST_NAME');
  if (fn) fn.dataset.manual = 'false';

  // Wipe config on server
  const blank = {};
  allFields.forEach(k => blank[k] = '');
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blank)
  }).catch(() => {});

  // Clear persisted state
  localStorage.removeItem('ydc_step');
  localStorage.removeItem('ydc_done');

  // Back to step 1
  goTo(1);
  document.getElementById('s1-next').disabled = true;
  document.getElementById('s1-err').textContent = '';
}

async function copyText(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = '\\u2713 Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  } catch (e) { btn.textContent = 'Failed'; }
}

async function openInTerminal(btn, cmd) {
  try {
    const res = await fetch('/api/open-terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    });
    const r = await res.json();
    if (r.ok) {
      const orig = btn.innerHTML;
      btn.textContent = '\\u2713 Launched!';
      btn.classList.add('launched');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('launched'); }, 2500);
    } else {
      btn.textContent = 'Failed';
    }
  } catch (e) { btn.textContent = 'Failed'; }
}
</script>
</body>
</html>"""


# ── HTTP Handler ──────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args): pass

    def send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, html: str):
        body = html.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self) -> dict:
        n = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(n)) if n else {}

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path in ('/', '/setup'):
            self.send_html(HTML)
        elif self.path == '/api/config':
            self.send_json(parse_config())
        elif self.path.startswith('/api/browse'):
            from urllib.parse import urlparse, parse_qs, unquote
            qs   = parse_qs(urlparse(self.path).query)
            raw  = unquote(qs.get('path', ['~'])[0])
            root = Path(raw).expanduser().resolve()
            if not root.exists():
                root = Path.home()
            try:
                entries = sorted(
                    [{'name': e.name, 'path': str(e)} for e in root.iterdir() if e.is_dir()],
                    key=lambda x: x['name'].lower()
                )
            except PermissionError:
                entries = []
            parent = str(root.parent) if root != root.parent else None
            self.send_json({'current': str(root), 'parent': parent, 'entries': entries})
        else:
            self.send_response(404); self.end_headers()

    def do_POST(self):
        if self.path == '/api/config':
            write_config(self.read_body())
            self.send_json({'ok': True, 'message': 'Saved'})

        elif self.path == '/api/test/all':
            self.send_json(run_all_tests(parse_config()))

        elif self.path == '/api/open-terminal':
            cmd = self.read_body().get('command', '')
            # Escape double quotes inside the command for AppleScript
            safe = cmd.replace('\\', '\\\\').replace('"', '\\"')
            script = f'tell application "Terminal" to do script "{safe}"'
            r = subprocess.run(['osascript', '-e', script], capture_output=True)
            subprocess.run(['osascript', '-e', 'tell application "Terminal" to activate'])
            self.send_json({'ok': r.returncode == 0})

        elif self.path.startswith('/api/test/'):
            svc = self.path.split('/')[-1]
            cfg = parse_config()
            dispatch = {
                'rclone':         lambda: test_rclone(cfg.get('RCLONE_REMOTE', 'gdrive'), cfg.get('GDRIVE_FOLDER', '')),
                'node':           test_node,
                'apollo-builder': lambda: test_apollo_builder(cfg.get('APOLLO_BUILDER_PATH', '')),
                'playwright':     lambda: test_playwright(cfg.get('APOLLO_BUILDER_PATH', '')),
                'sales-deck':     lambda: test_sales_deck(cfg.get('SALES_DECK_PATH', '')),
            }
            fn = dispatch.get(svc)
            self.send_json(fn() if fn else {'ok': False, 'msg': f'Unknown: {svc}'})

        else:
            self.send_response(404); self.end_headers()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    print(f'\n  YDC Pipeline Setup  →  http://localhost:{PORT}\n')
    print(f'  Config: {CONFIG_PATH}')
    print(f'  Ctrl+C to stop\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Stopped.')
