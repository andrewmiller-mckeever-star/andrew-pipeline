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
import os
import re
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

BASE_DIR      = Path(__file__).parent
CONFIG_PATH   = BASE_DIR / "ae-config.md"
DOWNLOADS_DIR = BASE_DIR / "downloads"
DOWNLOADS_DIR.mkdir(exist_ok=True)
PORT        = 8002

def brew_env() -> dict:
    """Return an env dict with Homebrew bin paths prepended to PATH.

    The wizard server inherits whatever PATH was active when it launched.
    Homebrew installs binaries to /opt/homebrew/bin (Apple Silicon) or
    /usr/local/bin (Intel) — neither is guaranteed to be in that PATH.
    Passing this env to subprocess.run() ensures node, rclone, etc. are
    found even when the server was started from a shell without brew in PATH.
    """
    env  = os.environ.copy()
    brew_paths = '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin'
    env['PATH'] = brew_paths + ':' + env.get('PATH', '')
    return env

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
            r'^(' + re.escape(key) + r':)\s*.*$',
            lambda m, v=value: m.group(1) + (' ' + v if v else ''),
            text, flags=re.MULTILINE
        )
    CONFIG_PATH.write_text(text)


# ── Connection tests ──────────────────────────────────────────────────────────

def expand(p: str) -> Path:
    return Path(p).expanduser()

def resolve_drive_folder_url(remote: str, folder_url: str) -> dict:
    """Parse a Google Drive folder URL and resolve the folder name via rclone lsjson."""
    import json as _json
    m = re.search(r'/folders/([a-zA-Z0-9_-]+)', folder_url)
    if not m:
        return {'ok': False, 'msg': 'Could not find a folder ID in that URL — make sure you copied the full Drive folder link'}
    folder_id = m.group(1)
    try:
        # First check whether the remote is configured at all
        remotes_r = subprocess.run(['rclone', 'listremotes'], capture_output=True, text=True, timeout=6, env=brew_env())
        stderr_lower = remotes_r.stderr.lower()
        if 'config file' in stderr_lower and 'not found' in stderr_lower:
            return {'ok': False, 'msg': 'not_configured',
                    'detail': 'rclone has not been configured yet. Run rclone config in Terminal to set up your Google Drive remote.'}
        configured = [r.rstrip(':') for r in remotes_r.stdout.strip().splitlines()]
        if remote not in configured:
            available = ', '.join(configured) if configured else 'none'
            return {'ok': False, 'msg': 'not_configured',
                    'detail': f'No remote named "{remote}" found. Run rclone config to create one. Available: {available}'}

        r = subprocess.run(
            ['rclone', 'lsjson', f'{remote}:', '--dirs-only', '--no-modtime'],
            capture_output=True, text=True, timeout=20, env=brew_env()
        )
        if r.returncode != 0:
            err_lines = [l for l in r.stderr.strip().splitlines() if 'ERROR' in l or 'Failed' in l]
            err = err_lines[0] if err_lines else r.stderr.strip().splitlines()[0] if r.stderr.strip() else 'unknown error'
            if 'token' in err.lower() or 'oauth' in err.lower() or 'auth' in err.lower():
                return {'ok': False, 'msg': 'not_configured',
                        'detail': f'Google Drive auth expired. Run rclone config reconnect {remote}: to re-authenticate.'}
            return {'ok': False, 'msg': f'rclone error — {err}'}
        folders = _json.loads(r.stdout or '[]')
        for f in folders:
            if f.get('ID') == folder_id:
                return {'ok': True, 'msg': f'Resolved: {f["Name"]}', 'name': f['Name']}
        return {'ok': False, 'msg': 'Folder not found in the root of your Drive — make sure the folder is at the top level (not nested inside another folder)'}
    except FileNotFoundError:
        return {'ok': False, 'msg': 'rclone not installed — complete the rclone CLI check first'}
    except _json.JSONDecodeError:
        return {'ok': False, 'msg': 'Could not parse rclone output — try re-authenticating with rclone config reconnect'}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'msg': 'Timed out — check your network or re-authenticate'}
    except Exception as e:
        return {'ok': False, 'msg': str(e)}

def test_rclone_remote(remote: str) -> dict:
    """Verify the remote exists in config then do a live connection test via rclone lsd."""
    try:
        # Step 1 — remote in config?
        r = subprocess.run(['rclone', 'listremotes'], capture_output=True, text=True, timeout=6, env=brew_env())
        stderr_lower = r.stderr.lower()
        if 'config file' in stderr_lower and 'not found' in stderr_lower:
            return {'ok': False, 'msg': 'rclone has not been configured yet — run rclone config to set up your Google Drive remote'}
        configured = [x.rstrip(':') for x in r.stdout.strip().splitlines()]
        if remote not in configured:
            available = ', '.join(configured) if configured else 'none'
            return {'ok': False, 'msg': f'No remote named "{remote}" found (available: {available}) — run rclone config to create it'}
        # Step 2 — live connection test: list Drive root directories
        r2 = subprocess.run(
            ['rclone', 'lsd', f'{remote}:', '--max-depth', '1'],
            capture_output=True, text=True, timeout=15, env=brew_env()
        )
        if r2.returncode == 0:
            return {'ok': True, 'msg': f'Remote "{remote}" connected — Google Drive authenticated'}
        err = r2.stderr.strip().splitlines()[0] if r2.stderr.strip() else 'connection failed'
        if 'token' in err.lower() or 'oauth' in err.lower() or 'auth' in err.lower():
            return {'ok': False, 'msg': f'Authentication expired — run: rclone config reconnect {remote}:'}
        return {'ok': False, 'msg': f'Could not connect to Drive: {err}'}
    except FileNotFoundError:
        return {'ok': False, 'msg': 'rclone not installed'}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'msg': 'Connection timed out — check your network or re-authenticate'}
    except Exception as e:
        return {'ok': False, 'msg': str(e)}

def test_rclone_install() -> dict:
    try:
        r = subprocess.run(['rclone', '--version'], capture_output=True, text=True, timeout=6, env=brew_env())
        version = r.stdout.splitlines()[0] if r.stdout else 'rclone'
        return {'ok': True, 'msg': f'{version} installed'}
    except FileNotFoundError:
        return {'ok': False, 'msg': 'rclone not installed — install via Homebrew'}
    except Exception as e:
        return {'ok': False, 'msg': str(e)}

def test_rclone(remote: str, folder: str) -> dict:
    try:
        r1 = subprocess.run(['rclone', 'listremotes'], capture_output=True, text=True, timeout=6, env=brew_env())
        if f'{remote}:' not in r1.stdout.splitlines():
            avail = ', '.join(r1.stdout.strip().splitlines()) or 'none'
            return {'ok': False, 'msg': f'Remote "{remote}" not found. Available: {avail}'}
        r2 = subprocess.run(['rclone', 'ls', f'{remote}:{folder}/'],
                            capture_output=True, text=True, timeout=10, env=brew_env())
        if r2.returncode == 0:
            return {'ok': True, 'msg': f'"{remote}:" connected — folder accessible'}
        return {'ok': False, 'msg': f'Folder "{folder}" not found — create it in Drive first'}
    except FileNotFoundError:
        return {'ok': False, 'msg': 'rclone not installed'}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'msg': 'Timed out — check network or re-auth'}
    except Exception as e:
        return {'ok': False, 'msg': str(e)}

def test_brew() -> dict:
    try:
        r = subprocess.run(['brew', '--version'], capture_output=True, text=True, timeout=5, env=brew_env())
        version = r.stdout.splitlines()[0] if r.stdout else 'Homebrew'
        return {'ok': r.returncode == 0, 'msg': f'{version} installed' if r.returncode == 0 else 'brew --version failed'}
    except FileNotFoundError:
        return {'ok': False, 'msg': 'Homebrew not installed'}
    except Exception as e:
        return {'ok': False, 'msg': str(e)}

def test_node() -> dict:
    try:
        r = subprocess.run(['node', '--version'], capture_output=True, text=True, timeout=5, env=brew_env())
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
    if not path_str or not path_str.strip():
        return {'ok': False, 'msg': 'No file path saved — download the deck first'}
    p = expand(path_str.strip())
    if p.exists() and p.is_file():
        size_mb = p.stat().st_size / 1048576
        return {'ok': True, 'msg': f'Found ({size_mb:.1f} MB)'}
    return {'ok': False, 'msg': f'File not found — download from shared Drive'}

def _drive_api_token(remote: str) -> str:
    """Return a fresh OAuth access token for the given rclone remote.
    Runs a lightweight rclone op first so rclone refreshes the token if needed."""
    import configparser as _cp, json as _json, os as _os
    # Touch Drive to let rclone refresh the token file if it has expired
    subprocess.run(['rclone', 'about', f'{remote}:', '--json'],
                   capture_output=True, timeout=15, env=brew_env())
    cfg_path = subprocess.run(['rclone', 'config', 'file'],
                              capture_output=True, text=True, env=brew_env()).stdout.strip()
    # 'rclone config file' prints e.g. "Configuration file is stored at:\n/path/rclone.conf\n"
    for line in cfg_path.splitlines():
        line = line.strip()
        if line.endswith('.conf') or line.endswith('.ini'):
            cfg_path = line
            break
    else:
        cfg_path = _os.path.expanduser('~/.config/rclone/rclone.conf')
    cfg = _cp.ConfigParser()
    cfg.read(cfg_path)
    if remote not in cfg:
        raise ValueError(f'Remote "{remote}" not found in rclone config')
    return _json.loads(cfg[remote]['token'])['access_token']


def resolve_drive_file_url(remote: str, file_url: str) -> dict:
    """Resolve a Google Drive file URL via the Drive API (instant, no tree scan)."""
    import urllib.request as _ur, json as _json
    m = re.search(r'/(?:file/d|presentation/d|document/d|spreadsheets/d|d)/([a-zA-Z0-9_-]+)', file_url)
    if not m:
        return {'ok': False, 'msg': 'Could not find a file ID in that URL'}
    file_id = m.group(1)
    try:
        token = _drive_api_token(remote)
        api_url = f'https://www.googleapis.com/drive/v3/files/{file_id}?fields=id,name,mimeType,parents'
        req = _ur.Request(api_url, headers={'Authorization': f'Bearer {token}'})
        data = _json.loads(_ur.urlopen(req, timeout=10).read())
        parent_id = (data.get('parents') or [''])[0]
        # path encodes parent_id|file_name so download can scope rclone to that one folder
        return {'ok': True, 'name': data['name'],
                'path': f"{parent_id}|{data['name']}",
                'mime': data['mimeType'], 'file_id': file_id}
    except FileNotFoundError:
        return {'ok': False, 'msg': 'rclone not installed'}
    except Exception as e:
        code = getattr(e, 'code', None)
        if code == 401:
            return {'ok': False, 'msg': 'Authentication expired — go back to Step 3 and click Test to refresh'}
        if code == 404:
            return {'ok': False, 'msg': 'File not found — make sure the file is shared with your account'}
        return {'ok': False, 'msg': str(e)}


def download_drive_file(remote: str, path: str, name: str, mime: str = '') -> dict:
    """Download a Drive file by scoping rclone to the parent folder (no full-tree scan)."""
    import os as _os, json as _json
    is_google_native = mime.startswith('application/vnd.google-apps.')
    # path = "PARENT_FOLDER_ID|filename" set by resolve_drive_file_url
    if '|' in path:
        parent_id, fname = path.split('|', 1)
        src = f'{remote},root_folder_id={parent_id}:'
    else:
        # Legacy fallback: treat path as a regular rclone path
        from pathlib import Path as _P
        p = _P(path)
        parent = str(p.parent)
        fname = p.name
        src = f'{remote}:{parent}' if parent and parent != '.' else f'{remote}:'
    # Wildcard suffix so the include pattern matches after export extension is added
    include_pattern = fname + ('*' if is_google_native else '')
    _ext_map = {
        'application/vnd.google-apps.presentation': 'pptx',
        'application/vnd.google-apps.document':     'docx',
        'application/vnd.google-apps.spreadsheet':  'xlsx',
    }
    cmd = ['rclone', 'copy', src, str(DOWNLOADS_DIR), '--include', include_pattern]
    if is_google_native:
        cmd += ['--drive-export-formats', _ext_map.get(mime, 'pdf')]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            err = next(
                (l for l in r.stderr.splitlines() if 'ERROR' in l or 'Failed' in l),
                r.stderr.strip().splitlines()[0] if r.stderr.strip() else 'download failed'
            )
            return {'ok': False, 'msg': f'Download failed: {err}'}
        base = _os.path.splitext(fname)[0]
        for ext in ('.pptx', '.pdf', '.docx', '.xlsx', '.ppt'):
            candidate = DOWNLOADS_DIR / (base + ext)
            if candidate.exists():
                return {'ok': True, 'msg': f'Downloaded: {candidate.name}',
                        'local_path': str(candidate)}
        existing = [f for f in DOWNLOADS_DIR.iterdir() if base.lower() in f.stem.lower()]
        if existing:
            return {'ok': True, 'msg': f'Downloaded: {existing[0].name}',
                    'local_path': str(existing[0])}
        listed = [f.name for f in DOWNLOADS_DIR.iterdir()]
        debug = f' | rclone: {r.stderr.strip()[:200]}' if r.stderr.strip() else ''
        return {'ok': False, 'msg': f'File not found after download. downloads/ contains: {listed or "nothing"}{debug}'}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'msg': 'Download timed out — check your network'}
    except Exception as e:
        return {'ok': False, 'msg': str(e)}

def _check_project_mcp_permissions(uuid: str) -> bool:
    """Return True if the project settings.json grants permissions for the given MCP UUID."""
    import json as _json
    proj_settings = BASE_DIR / 'settings.json'
    try:
        data = _json.loads(proj_settings.read_text())
        allowed = data.get('permissions', {}).get('allow', [])
        return any(uuid in entry for entry in allowed)
    except Exception:
        return False

def test_apollo_mcp() -> dict:
    apollo_uuid = '1bce6c2a-2c4c-4908-a5e8-f1bca738186e'
    if _check_project_mcp_permissions(apollo_uuid):
        return {'ok': True, 'msg': 'Apollo tools enabled for this project'}
    return {'ok': False, 'msg': 'Apollo permissions missing from project settings.json'}

def test_slack_mcp() -> dict:
    slack_uuid = '440c028e-25dc-49ef-9cbd-6650b738bb3d'
    if _check_project_mcp_permissions(slack_uuid):
        return {'ok': True, 'msg': 'Slack tools enabled for this project'}
    return {'ok': False, 'msg': 'Slack permissions missing from project settings.json'}

def run_all_tests(cfg: dict) -> dict:
    return {
        'rclone_install': test_rclone_install(),
        'rclone_remote':  test_rclone_remote(cfg.get('RCLONE_REMOTE', 'gdrive')),
        'rclone':         test_rclone(cfg.get('RCLONE_REMOTE', 'gdrive'), cfg.get('GDRIVE_FOLDER', '')),
        'node':           test_node(),
        'apollo_builder': test_apollo_builder(cfg.get('APOLLO_BUILDER_PATH', '')),
        'playwright':     test_playwright(cfg.get('APOLLO_BUILDER_PATH', '')),
        'sales_deck':     test_sales_deck(cfg.get('SALES_DECK_PATH', '')),
        'apollo_mcp':     test_apollo_mcp(),
        'slack_mcp':      test_slack_mcp(),
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
.btn-primary:disabled { background: #93c5fd; box-shadow: none; cursor: not-allowed; }

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

/* ── Prompt chips ─────────────────────────────────────────────────── */
.prompt-chip {
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; padding: 9px 14px;
  display: flex; align-items: baseline; gap: 10px; font-size: 13px;
}
.prompt-label {
  font-size: 10.5px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .04em; color: var(--blue); flex-shrink: 0; min-width: 90px;
}
.prompt-text { color: var(--text); line-height: 1.5; }
.prompt-text em { font-style: normal; opacity: .6; }

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
      <div class="st-circle" id="sc-5">5</div>
      <span class="st-label">MCP</span>
    </div>
    <div class="st-line" id="sl-5"></div>
    <div class="st-item" id="st-6" onclick="jumpTo(6)">
      <div class="st-circle" id="sc-6">&#10003;</div>
      <span class="st-label">Done</span>
    </div>
  </div>

  <!-- ═══════════════════ STEP 1: IDENTITY ═══════════════════ -->
  <div class="step-panel active" id="panel-1">
    <div class="card">
      <div class="card-header">
        <div class="step-eyebrow">Step 1 of 5</div>
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
        <div class="step-eyebrow">Step 2 of 5</div>
        <div class="card-title">Apollo Sequence Builder</div>
        <div class="card-sub">
          A local Node.js + Playwright script that automates sequence creation in Apollo&rsquo;s UI.
          It runs outside Claude to avoid browser errors burning conversation tokens.
        </div>
      </div>
      <div class="card-body">

        <!-- Homebrew prerequisite check -->
        <div class="test-block">
          <div class="test-row">
            <div class="test-dot" id="dot-brew"></div>
            <span class="test-name">Homebrew</span>
            <span class="test-msg" id="msg-brew">Checking&hellip;</span>
            <button class="test-btn" onclick="runTest('brew')">Check</button>
          </div>
          <div class="fix-block" id="fix-brew">
            <div class="fix-label">Install Homebrew (required for Node.js and rclone):</div>
            <code>/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"</code>
            <div class="fix-btns">
              <button class="copy-btn" onclick="copyText(this,'/bin/bash -c &quot;$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)&quot;')">Copy</button>
              <button class="terminal-btn" onclick="openInTerminal(this,'/bin/bash -c &quot;$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)&quot;')">&#x2318; Open in Terminal</button>
            </div>
          </div>
        </div>

        <!-- Rest of Step 2: hidden until Homebrew passes -->
        <div id="step2-tools" style="display:none">

        <div class="field" style="margin-bottom:20px; position:relative;">
          <label>Script Directory <span class="req">*</span></label>
          <div class="browse-wrap">
            <input type="text" id="APOLLO_BUILDER_PATH"
                   placeholder="~/Desktop/YDC Pipeline/apollo-sequence-builder"
                   oninput="closePicker(); syncPlaywrightPath()" autocomplete="off">
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
            <code id="fix-playwright-path">cd ...</code>
            <code>eval "$(/opt/homebrew/bin/brew shellenv)" &amp;&amp; npm install</code>
            <div class="fix-btns">
              <button class="copy-btn" onclick="copyText(this, 'eval &quot;$(/opt/homebrew/bin/brew shellenv)&quot; && cd ' + document.getElementById('APOLLO_BUILDER_PATH').value.trim() + ' && npm install')">Copy</button>
              <button class="terminal-btn" onclick="openInTerminal(this, 'eval &quot;$(/opt/homebrew/bin/brew shellenv)&quot; && cd ' + document.getElementById('APOLLO_BUILDER_PATH').value.trim() + ' && npm install')">&#x2318; Open in Terminal</button>
            </div>
          </div>
        </div>

        </div><!-- /step2-tools -->

      </div>
      <div class="card-footer">
        <div class="footer-left">
          <button class="btn btn-ghost" onclick="goTo(1)">&larr; Back</button>
        </div>
        <div class="footer-right">
          <button class="btn-link" onclick="saveAndNext(2, true)">Skip for now</button>
          <button class="btn btn-primary" id="btn-continue-2" onclick="saveAndNext(2)" disabled>Continue &rarr;</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════ STEP 3: GOOGLE DRIVE ═══════════════════ -->
  <div class="step-panel" id="panel-3">
    <div class="card">
      <div class="card-header">
        <div class="step-eyebrow">Step 3 of 5</div>
        <div class="card-title">Google Drive</div>
        <div class="card-sub">
          Account plan documents (.docx) are saved to a folder in your Google Drive after
          each pipeline run. This uses rclone &mdash; a command-line tool that syncs files
          to cloud storage.
        </div>
      </div>
      <div class="card-body">

        <!-- ── Step A: Install rclone ───────────────────────────────────── -->
        <div style="margin-bottom:14px">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-dark)">Connect your Google Drive</div>
        </div>

        <div class="test-block" style="margin-bottom:20px">
          <div class="test-row">
            <div class="test-dot" id="dot-rclone_install"></div>
            <span class="test-name">rclone CLI</span>
            <span class="test-msg" id="msg-rclone_install">Not tested</span>
            <button class="test-btn" onclick="runTest('rclone_install')">Check</button>
          </div>
          <div class="fix-block" id="fix-rclone_install">
            <div class="fix-label">Install rclone via Homebrew, then re-check:</div>
            <code>brew install rclone</code>
            <div class="fix-btns">
              <button class="copy-btn" onclick="copyText(this,'brew install rclone')">Copy</button>
              <button class="terminal-btn" onclick="openInTerminal(this,'brew install rclone')">&#x2318; Open in Terminal</button>
            </div>
          </div>
        </div>

        <!-- ── Step B: shown after rclone CLI passes ────────────────────── -->
        <div id="rclone-remote-section" style="display:none">

          <hr style="border:none;border-top:1px solid var(--border);margin:0 0 20px">

          <div class="test-block" style="margin-bottom:0">
            <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px">
              <div class="test-dot spin" id="dot-rclone_remote" style="margin-top:2px;flex-shrink:0"></div>
              <div style="flex:1">
                <div style="font-weight:500;font-size:14px;color:var(--text)">Configure remote access to Google Drive</div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap">
                  <span class="test-msg" id="msg-rclone_remote">Checking&hellip;</span>
                  <button class="terminal-btn" id="btn-rclone-terminal" style="display:none;flex-shrink:0"
                          onclick="openInTerminal(this,'rclone config delete gdrive; rclone config')">&#x2318; Open in Terminal</button>
                  <button class="test-btn" id="btn-rclone-recheck" style="display:none;flex-shrink:0"
                          onclick="runTest('rclone_remote')">Check again</button>
                  <button class="btn btn-ghost" id="btn-rclone-delete" style="display:none;flex-shrink:0;font-size:12px;padding:4px 10px;color:var(--red);border-color:var(--red)"
                          onclick="deleteRcloneConfig()">Delete Config</button>
                </div>
              </div>
            </div>

            <!-- Step-by-step instructions — shown when remote not configured -->
            <div id="rclone-instructions" style="display:none;margin-top:12px;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:8px">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-dark);margin-bottom:6px">If you&rsquo;ve attempted this before, clean up first:</div>
              <div style="background:var(--code-bg);border-radius:6px;padding:8px 12px;font-family:monospace;font-size:13px;color:var(--text);margin-bottom:14px">rclone config delete gdrive</div>
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-dark);margin-bottom:10px">Then run <code style="font-size:11px;text-transform:none">rclone config</code> and follow these steps:</div>
              <ol style="margin:0;padding-left:18px;font-size:13px;color:var(--text);line-height:1.9;display:flex;flex-direction:column;gap:4px">
                <li>Enter <code class="inline">n</code> for <strong>New remote</strong></li>
                <li>Enter <code class="inline">gdrive</code> as the remote name</li>
                <li>Enter <code class="inline">24</code> for <strong>Google Drive</strong> storage</li>
                <li>Leave <strong>Client ID</strong> blank — press <kbd style="font-size:11px;padding:1px 5px;border:1px solid var(--border);border-radius:3px;background:#fff">Return</kbd> <span style="color:var(--gray-dark)">(uses rclone&rsquo;s built-in credentials)</span></li>
                <li>Leave <strong>Client Secret</strong> blank — press <kbd style="font-size:11px;padding:1px 5px;border:1px solid var(--border);border-radius:3px;background:#fff">Return</kbd></li>
                <li>Enter <code class="inline">1</code> for full access to all files in your Google Drive</li>
                <li>Leave <strong>Service Account</strong> blank — press <kbd style="font-size:11px;padding:1px 5px;border:1px solid var(--border);border-radius:3px;background:#fff">Return</kbd></li>
                <li>Enter <code class="inline">n</code> for Advanced Config</li>
                <li>Enter <code class="inline">y</code> for browser authentication — a sign-in window will open</li>
                <li>Enter <code class="inline">n</code> to configure as a Shared Drive</li>
                <li>Enter <code class="inline">y</code> to keep the <strong>gdrive</strong> remote</li>
                <li>Enter <code class="inline">q</code> to quit config</li>
              </ol>
            </div>
          </div>

        </div>

        <!-- ── Step C: shown after remote check passes ────────────────────── -->
        <div id="rclone-folder-section" style="display:none">

          <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">

          <!-- RCLONE_REMOTE is set by instructions to 'gdrive' — saved silently -->
          <input type="hidden" id="RCLONE_REMOTE" value="gdrive">

          <div style="margin-bottom:14px">
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-dark)">Where your account plans will live</div>
          </div>

          <div class="field" style="margin-bottom:6px">
            <label>Google Drive Folder URL <span class="req">*</span></label>
            <div class="browse-wrap">
              <input type="text" id="GDRIVE_FOLDER_URL"
                     placeholder="https://drive.google.com/drive/folders/..."
                     oninput="clearDriveResolve()" autocomplete="off" style="font-size:12px">
              <button class="browse-btn" type="button" onclick="resolveDriveFolder()">Resolve</button>
            </div>
            <div class="field-hint">
              Create a folder in Google Drive for your account plans, open it in your browser,
              then paste the URL here. We&rsquo;ll look up the folder name automatically.
            </div>
            <div id="drive-resolve-msg" style="display:none;margin-top:6px;font-size:13px;font-weight:500"></div>
            <!-- Hidden field — populated by Resolve, read by rclone and saved to config -->
            <input type="hidden" id="GDRIVE_FOLDER">
          </div>

        </div>

      </div>
      <div class="card-footer">
        <div class="footer-left">
          <button class="btn btn-ghost" onclick="goTo(2)">&larr; Back</button>
        </div>
        <div class="footer-right">
          <button class="btn-link" onclick="saveAndNext(3, true)">Skip for now</button>
          <button class="btn btn-primary" id="btn-continue-3" onclick="saveAndNext(3)" disabled>Continue &rarr;</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════ STEP 4: SALES DECK ═══════════════════ -->
  <div class="step-panel" id="panel-4">
    <div class="card">
      <div class="card-header">
        <div class="step-eyebrow">Step 4 of 5</div>
        <div class="card-title">Sales Deck PDF</div>
        <div class="card-sub">
          The current You.com pitch bible. Claude reads this at the start of each pipeline
          run for pitch framing, case study references, and competitive positioning.
        </div>
      </div>
      <div class="card-body">

        <div class="field" style="margin-bottom:6px">
          <label>Google Drive File URL <span class="req">*</span></label>
          <div class="browse-wrap">
            <input type="text" id="SALES_DECK_URL"
                   placeholder="https://drive.google.com/file/d/... or docs.google.com/presentation/d/..."
                   oninput="clearDeckResolve()" autocomplete="off" style="font-size:12px">
            <button class="browse-btn" type="button" onclick="resolveDeckFile()">Resolve</button>
          </div>
          <div class="field-hint">
            Open the sales deck in Google Drive and paste the URL. Supports PDF, PowerPoint, and Google Slides.
            The file will be downloaded to <code class="inline">ydc-sales-pipeline/downloads/</code> as a PDF.
          </div>
          <div id="deck-resolve-msg" style="display:none;margin-top:6px;font-size:13px;font-weight:500"></div>
        </div>

        <!-- Download section — shown after resolve -->
        <div id="deck-download-section" style="display:none;margin-top:14px">
          <button class="btn btn-primary" id="btn-deck-download" onclick="downloadDeckFile()"
                  style="width:100%;justify-content:center">
            &#x2193; Download to downloads/
          </button>
          <div id="deck-download-msg" style="display:none;margin-top:8px;font-size:13px;font-weight:500"></div>
        </div>

        <!-- Hidden fields populated by resolve + download -->
        <input type="hidden" id="SALES_DECK_URL_RESOLVED_NAME">
        <input type="hidden" id="SALES_DECK_URL_RESOLVED_PATH">
        <input type="text"   id="SALES_DECK_PATH" style="display:none">

        <div class="test-block" style="margin-top:16px">
          <div class="test-row">
            <div class="test-dot" id="dot-sales_deck"></div>
            <span class="test-name">Sales deck file</span>
            <span class="test-msg" id="msg-sales_deck">Not tested</span>
            <button class="test-btn" onclick="runTest('sales_deck')">Check</button>
          </div>
          <div class="fix-block" id="fix-sales_deck">
            <div class="fix-label">File not found — use the Download button above to fetch it from Drive.</div>
          </div>
        </div>
      </div>
      <div class="card-footer">
        <div class="footer-left">
          <button class="btn btn-ghost" onclick="goTo(3)">&larr; Back</button>
        </div>
        <div class="footer-right">
          <button class="btn-link" onclick="saveAndNext(4, true)">Skip for now</button>
          <button class="btn btn-primary" onclick="saveAndNext(4)">Continue &rarr;</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════ STEP 5: MCP CONNECTIONS ═══════════════════ -->
  <div class="step-panel" id="panel-5">
    <div class="card">
      <div class="card-header">
        <div class="step-eyebrow">Step 5 of 5</div>
        <div class="card-title">MCP Connections</div>
        <div class="card-sub">
          Apollo and Slack are built-in capabilities of Claude Code — no separate installation needed.
          This step confirms the tool permissions are enabled for this project.
        </div>
      </div>
      <div class="card-body">

        <div class="test-block">
          <div class="test-row">
            <div class="test-dot" id="dot-apollo_mcp"></div>
            <span class="test-name">Apollo</span>
            <span class="test-msg" id="msg-apollo_mcp">Not tested</span>
            <button class="test-btn" onclick="runTest('apollo_mcp')">Check</button>
          </div>
          <div class="fix-block" id="fix-apollo_mcp">
            <div class="fix-label">Apollo tool permissions are missing from this project&rsquo;s
              <code class="inline">settings.json</code>. Contact your pipeline admin to get the
              correct <code class="inline">settings.json</code> for this repo.</div>
          </div>

          <div class="test-row">
            <div class="test-dot" id="dot-slack_mcp"></div>
            <span class="test-name">Slack</span>
            <span class="test-msg" id="msg-slack_mcp">Not tested</span>
            <button class="test-btn" onclick="runTest('slack_mcp')">Check</button>
          </div>
          <div class="fix-block" id="fix-slack_mcp">
            <div class="fix-label">Slack tool permissions are missing from this project&rsquo;s
              <code class="inline">settings.json</code>. Contact your pipeline admin to get the
              correct <code class="inline">settings.json</code> for this repo.</div>
          </div>
        </div>

        <div style="margin-top:16px;padding:12px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--gray-dark)">
          <strong style="color:var(--text)">How this works:</strong>
          Apollo and Slack are provided as Claude tools — Claude can search contacts, create sequences,
          and read Slack channels directly during pipeline runs. The project&rsquo;s
          <code class="inline">settings.json</code> controls which tools are permitted.
          If checks pass, you&rsquo;re ready to run the pipeline.
        </div>

      </div>
      <div class="card-footer">
        <div class="footer-left">
          <button class="btn btn-ghost" onclick="goTo(4)">&larr; Back</button>
        </div>
        <div class="footer-right">
          <button class="btn-link" onclick="saveAndNext(5, true)">Skip for now</button>
          <button class="btn btn-primary" onclick="saveAndNext(5)">Continue &rarr;</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════ STEP 6: DONE ═══════════════════ -->
  <div class="step-panel" id="panel-6">
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

        <!-- MCP warning — shown only if MCPs failed -->
        <div class="warn-box" id="done-mcp-warn" style="display:none">
          <span class="icon">&#9888;&#xFE0F;</span>
          <div id="done-mcp-warn-text"></div>
        </div>

        <!-- Launch instructions -->
        <div style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border);">
          <p style="font-size:14px; font-weight:600; color:var(--text); margin:0 0 14px 0;">How to run the pipeline</p>

          <div style="background:#f0f7ff; border:1px solid #c5dcf5; border-radius:8px; padding:12px 14px; margin-bottom:14px; font-size:13px; color:#1a3a5c; line-height:1.6;">
            <strong>This pipeline runs through Claude Code</strong> &mdash; the same app you&rsquo;re using right now.
            No terminal or CLI commands needed.
          </div>

          <p style="font-size:12.5px; color:var(--muted); margin:0 0 8px 0;">1 &mdash; Open <strong>Claude.app</strong> &rarr; click <strong>Work in a project</strong> &rarr; select this folder:</p>
          <div style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:10px 16px; font-family:ui-monospace,monospace; font-size:13px; margin-bottom:6px;">
            __BASE_DIR__
          </div>
          <p style="font-size:12px; color:var(--muted); margin:0 0 14px 0;">
            If you see a &ldquo;workspace failed to start&rdquo; error, dismiss it &mdash; that&rsquo;s a separate VM feature the pipeline doesn&rsquo;t use.
          </p>

          <p style="font-size:12.5px; color:var(--muted); margin:0 0 8px 0;">2 &mdash; Type one of these prompts and press Enter:</p>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div class="prompt-chip">
              <span class="prompt-label">Full pipeline</span>
              <span class="prompt-text">&ldquo;Run the sales pipeline for <em>[Company Name]</em>&rdquo;</span>
            </div>
            <div class="prompt-chip">
              <span class="prompt-label">Research only</span>
              <span class="prompt-text">&ldquo;Research <em>[Company Name]</em> and build a prospect brief&rdquo;</span>
            </div>
            <div class="prompt-chip">
              <span class="prompt-label">Meeting prep</span>
              <span class="prompt-text">&ldquo;Prepare me for my meeting with <em>[Company]</em> tomorrow&rdquo;</span>
            </div>
            <div class="prompt-chip">
              <span class="prompt-label">Account context</span>
              <span class="prompt-text">&ldquo;Pull internal context on <em>[Company Name]</em> from Slack and Drive&rdquo;</span>
            </div>
            <div class="prompt-chip">
              <span class="prompt-label">Score accounts</span>
              <span class="prompt-text">&ldquo;Score my account list at <em>[file path]</em> against our ICP&rdquo;</span>
            </div>
          </div>
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
const TOTAL  = 5;

// Fields saved on each step
const STEP_FIELDS = {
  1: ['AE_NAME','AE_FIRST_NAME','AE_EMAIL','AE_TITLE'],
  2: ['APOLLO_BUILDER_PATH'],
  3: ['RCLONE_REMOTE','GDRIVE_FOLDER','GDRIVE_FOLDER_URL'],
  4: ['SALES_DECK_PATH','SALES_DECK_URL'],
};

// Map service key → API endpoint suffix
const SVC_ENDPOINT = {
  brew:           'brew',
  rclone_install: 'rclone-install',
  rclone_remote:  'rclone-remote',
  rclone:         'rclone',
  node:           'node',
  apollo_builder: 'apollo-builder',
  playwright:     'playwright',
  sales_deck:     'sales-deck',
  apollo_mcp:     'apollo-mcp',
  slack_mcp:      'slack-mcp',
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
                        'APOLLO_BUILDER_PATH','SALES_DECK_PATH','SALES_DECK_URL',
                        'RCLONE_REMOTE','GDRIVE_FOLDER','GDRIVE_FOLDER_URL'];
    ALL_FIELDS.forEach(k => {
      const el = document.getElementById(k);
      if (!el) return;
      // RCLONE_REMOTE defaults to 'gdrive' if not yet configured
      el.value = cfg[k] || (k === 'RCLONE_REMOTE' ? 'gdrive' : '');
    });
    // If identity loaded, mark first-name as manual so auto-fill doesn't clobber it
    if (cfg.AE_FIRST_NAME) {
      document.getElementById('AE_FIRST_NAME').dataset.manual = 'true';
    }
    // If drive folder was previously resolved, show the confirmation message
    if (cfg.GDRIVE_FOLDER) {
      const msgEl = document.getElementById('drive-resolve-msg');
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.color   = 'var(--green)';
        msgEl.textContent   = '✓ Resolved: ' + cfg.GDRIVE_FOLDER;
      }
    }
    // If deck was previously downloaded, restore the download confirmation message
    if (cfg.SALES_DECK_PATH) {
      const dlMsg = document.getElementById('deck-download-msg');
      const dlBtn = document.getElementById('btn-deck-download');
      if (dlMsg) {
        dlMsg.style.display = 'block';
        dlMsg.style.color   = 'var(--green)';
        dlMsg.textContent   = '\u2713 Previously downloaded: ' + cfg.SALES_DECK_PATH.split('/').pop();
      }
      if (dlBtn) { dlBtn.textContent = '\u2713 Downloaded'; }
    }
    // Re-run step 1 validation so Continue unlocks if fields are already filled
    checkStep1();
    syncPlaywrightPath();
    checkStep2Deps();
    checkStep3Deps();
  } catch (e) { console.error('Load failed', e); }
}

// Persist & restore wizard position using localStorage
function saveState() {
  const done = [];
  for (let i = 1; i <= 5; i++) {
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
  const step = Math.min(savedStep, 6);
  if (step > 1) goTo(step);
  if (step === 6) buildSummary();
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goTo(n) {
  document.getElementById('panel-' + current).classList.remove('active');
  current = n;
  document.getElementById('panel-' + current).classList.add('active');
  updateStepper();
  saveState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Auto-run Homebrew check the first time Step 2 is reached
  if (n === 2 && !testResults['brew']) {
    setTimeout(() => runTest('brew'), 400);
  }
  // If brew already passed (returning to step 2), ensure tools section is visible
  if (n === 2 && testResults['brew'] && testResults['brew'].ok) {
    const t = document.getElementById('step2-tools');
    if (t) t.style.display = 'block';
  }
  // Auto-run rclone CLI check the first time Step 3 is reached
  if (n === 3 && !testResults['rclone_install']) {
    setTimeout(() => runTest('rclone_install'), 400);
  }
  // Auto-run MCP checks the first time Step 5 is reached
  if (n === 5) {
    if (!testResults['apollo_mcp']) setTimeout(() => runTest('apollo_mcp'), 300);
    if (!testResults['slack_mcp'])  setTimeout(() => runTest('slack_mcp'),  600);
  }
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
    goTo(6);
  } else {
    goTo(step + 1);
  }
}

function updateStepper() {
  for (let i = 1; i <= 6; i++) {
    const item   = document.getElementById('st-' + i);
    const circle = document.getElementById('sc-' + i);
    if (!item) continue;
    item.classList.remove('active', 'done');
    if (i === current) {
      item.classList.add('active');
    } else if (circle && circle.dataset.done === 'true') {
      item.classList.add('done');
    }
    if (i < 6) {
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
  const stepForSvc = { brew: 2, rclone_install: 3, rclone_remote: 3, node: 2, apollo_builder: 2, playwright: 2, sales_deck: 4, apollo_mcp: 5, slack_mcp: 5 };
  const step = stepForSvc[svc];
  const data = {};
  if (step) {
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
    const res = await fetch('/api/test/' + SVC_ENDPOINT[svc], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const r   = await res.json();
    testResults[svc] = r;           // store first so checkStep2Deps sees it
    setResult(svc, r.ok, r.msg);
  } catch (e) {
    testResults[svc] = { ok: false, msg: 'Request failed' };
    setResult(svc, false, 'Request failed');
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
  // Special handling for rclone_remote: swap action button based on result
  if (svc === 'rclone_remote') updateRcloneRemoteBtn(ok);
  // When rclone installs successfully, auto-check the remote config
  if (svc === 'rclone_install' && ok && !testResults['rclone_remote']) {
    setTimeout(() => runTest('rclone_remote'), 300);
  }
  // Brew: reveal or hide the rest of Step 2 based on result
  if (svc === 'brew') {
    const t = document.getElementById('step2-tools');
    if (t) t.style.display = ok ? 'block' : 'none';
  }
  checkStep2Deps();
  checkStep3Deps();
}

function checkStep2Deps() {
  const required = ['brew', 'apollo_builder', 'node', 'playwright'];
  const allPass  = required.every(s => testResults[s] && testResults[s].ok);
  const btn      = document.getElementById('btn-continue-2');
  if (btn) btn.disabled = !allPass;
}

function checkStep3Deps() {
  const installOk = !!(testResults['rclone_install'] && testResults['rclone_install'].ok);
  const remoteOk  = !!(testResults['rclone_remote']  && testResults['rclone_remote'].ok);
  const folderSet = !!((document.getElementById('GDRIVE_FOLDER') || {}).value);
  // Gate B: remote name + check visible only after CLI passes
  const remoteSection = document.getElementById('rclone-remote-section');
  if (remoteSection) remoteSection.style.display = installOk ? 'block' : 'none';
  // Gate C: folder URL visible only after remote check passes
  const folderSection = document.getElementById('rclone-folder-section');
  if (folderSection) folderSection.style.display = (installOk && remoteOk) ? 'block' : 'none';
  const btn = document.getElementById('btn-continue-3');
  if (btn) btn.disabled = !(installOk && remoteOk && folderSet);
}

function updateRcloneRemoteBtn(ok) {
  const terminalBtn  = document.getElementById('btn-rclone-terminal');
  const recheckBtn   = document.getElementById('btn-rclone-recheck');
  const deleteBtn    = document.getElementById('btn-rclone-delete');
  const instructions = document.getElementById('rclone-instructions');
  if (!recheckBtn) return;
  if (ok) {
    // Remote found — hide terminal + instructions, show Test + Delete Config
    if (terminalBtn)  terminalBtn.style.display  = 'none';
    if (instructions) instructions.style.display = 'none';
    if (deleteBtn)    deleteBtn.style.display     = '';
    recheckBtn.textContent   = 'Test';
    recheckBtn.style.display = '';
  } else {
    // Not configured — show instructions + Open in Terminal + Check again, hide Delete
    if (terminalBtn)  terminalBtn.style.display  = '';
    if (instructions) instructions.style.display = '';
    if (deleteBtn)    deleteBtn.style.display     = 'none';
    recheckBtn.textContent   = 'Check again';
    recheckBtn.style.display = '';
  }
}

function deleteRcloneConfig() {
  openInTerminal(null, 'rclone config delete gdrive');
  // Reset the check state so the user re-verifies after deletion
  delete testResults['rclone_remote'];
  const dot = document.getElementById('dot-rclone_remote');
  const msg = document.getElementById('msg-rclone_remote');
  const deleteBtn = document.getElementById('btn-rclone-delete');
  const recheckBtn = document.getElementById('btn-rclone-recheck');
  if (dot) dot.className = 'test-dot';
  if (msg) { msg.textContent = 'Config deleted — re-check when ready'; msg.className = 'test-msg'; }
  if (deleteBtn)  deleteBtn.style.display  = 'none';
  if (recheckBtn) { recheckBtn.textContent = 'Check'; recheckBtn.style.display = ''; }
  checkStep3Deps();
}

function onRemoteNameInput() {
  // When the remote name changes, invalidate the remote check and collapse folder section
  delete testResults['rclone_remote'];
  delete testResults['rclone'];
  const dot = document.getElementById('dot-rclone_remote');
  const msg = document.getElementById('msg-rclone_remote');
  const terminalBtn = document.getElementById('btn-rclone-terminal');
  const recheckBtn  = document.getElementById('btn-rclone-recheck');
  if (dot) dot.className = 'test-dot';
  if (msg) { msg.textContent = 'Re-check required'; msg.className = 'test-msg'; }
  if (terminalBtn) terminalBtn.style.display = 'none';
  if (recheckBtn)  { recheckBtn.textContent = 'Check'; recheckBtn.style.display = ''; }
  clearDriveResolve();
  checkStep3Deps();
}

async function resolveDriveFolder() {
  const urlEl    = document.getElementById('GDRIVE_FOLDER_URL');
  const nameEl   = document.getElementById('GDRIVE_FOLDER');
  const msgEl    = document.getElementById('drive-resolve-msg');
  const remote   = (document.getElementById('RCLONE_REMOTE').value || 'gdrive').trim();
  const url      = urlEl.value.trim();
  if (!url) {
    msgEl.style.display = 'block'; msgEl.style.color = 'var(--red)';
    msgEl.textContent   = 'Paste a Google Drive folder URL first.';
    return;
  }
  msgEl.style.display = 'block'; msgEl.style.color = 'var(--gray-dark)';
  msgEl.textContent   = 'Resolving\u2026';
  try {
    const r = await fetch('/api/resolve-drive-folder', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({url, remote})
    });
    const d = await r.json();
    if (d.ok) {
      nameEl.value        = d.name;
      msgEl.style.color   = 'var(--green)';
      msgEl.textContent   = '\u2713 ' + d.msg;
    } else {
      nameEl.value        = '';
      msgEl.style.color   = 'var(--red)';
      msgEl.textContent   = d.msg;
    }
  } catch(e) {
    nameEl.value        = '';
    msgEl.style.color   = 'var(--red)';
    msgEl.textContent   = 'Request failed — is the setup server running?';
  }
  checkStep3Deps();
}

function clearDriveResolve() {
  document.getElementById('GDRIVE_FOLDER').value = '';
  const msgEl = document.getElementById('drive-resolve-msg');
  if (msgEl) msgEl.style.display = 'none';
  checkStep3Deps();
}

// ── Sales Deck Drive download ─────────────────────────────────────────────────
let deckResolvedPath = '';
let deckResolvedName = '';
let deckResolvedMime = '';

async function resolveDeckFile() {
  const urlEl  = document.getElementById('SALES_DECK_URL');
  const msgEl  = document.getElementById('deck-resolve-msg');
  const secEl  = document.getElementById('deck-download-section');
  const cfg    = await (await fetch('/api/config')).json().catch(() => ({}));
  const remote = cfg.RCLONE_REMOTE || 'gdrive';
  const url    = urlEl.value.trim();
  if (!url) {
    msgEl.style.display = 'block'; msgEl.style.color = 'var(--red)';
    msgEl.textContent   = 'Paste a Google Drive file URL first.'; return;
  }
  msgEl.style.display = 'block'; msgEl.style.color = 'var(--gray-dark)';
  msgEl.textContent   = 'Resolving\u2026';
  if (secEl) secEl.style.display = 'none';
  try {
    const r = await fetch('/api/resolve-drive-file', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({url, remote})
    });
    const d = await r.json();
    if (d.ok) {
      deckResolvedPath = d.path;
      deckResolvedName = d.name;
      deckResolvedMime = d.mime || '';
      msgEl.style.color = 'var(--green)';
      msgEl.textContent = '\u2713 Found: ' + d.name;
      if (secEl) secEl.style.display = 'block';
    } else {
      deckResolvedPath = deckResolvedName = deckResolvedMime = '';
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = d.msg;
      if (secEl) secEl.style.display = 'none';
    }
  } catch(e) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Request failed — is the setup server running?';
  }
}

async function downloadDeckFile() {
  const dlBtn  = document.getElementById('btn-deck-download');
  const dlMsg  = document.getElementById('deck-download-msg');
  const cfg    = await (await fetch('/api/config')).json().catch(() => ({}));
  const remote = cfg.RCLONE_REMOTE || 'gdrive';
  if (!deckResolvedPath) return;
  dlBtn.disabled = true; dlBtn.textContent = 'Downloading\u2026';
  dlMsg.style.display = 'none';
  try {
    const r = await fetch('/api/download-drive-file', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({remote, path: deckResolvedPath, name: deckResolvedName, mime: deckResolvedMime})
    });
    const d = await r.json();
    dlMsg.style.display = 'block';
    if (d.ok) {
      dlMsg.style.color = 'var(--green)';
      dlMsg.textContent = '\u2713 ' + d.msg;
      // Auto-fill hidden path field and save to config
      document.getElementById('SALES_DECK_PATH').value = d.local_path;
      await fetch('/api/config', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({SALES_DECK_PATH: d.local_path})
      });
      dlBtn.textContent = '\u2713 Downloaded';
      // Auto-run the check
      setTimeout(() => runTest('sales_deck'), 300);
    } else {
      dlMsg.style.color = 'var(--red)';
      dlMsg.textContent = d.msg;
      dlBtn.disabled = false;
      dlBtn.textContent = '\u2193 Download to downloads/';
    }
  } catch(e) {
    dlMsg.style.display = 'block'; dlMsg.style.color = 'var(--red)';
    dlMsg.textContent   = 'Request failed.';
    dlBtn.disabled = false; dlBtn.textContent = '\u2193 Download to downloads/';
  }
}

function clearDeckResolve() {
  deckResolvedPath = deckResolvedName = deckResolvedMime = '';
  const msgEl = document.getElementById('deck-resolve-msg');
  const secEl = document.getElementById('deck-download-section');
  const dlMsg = document.getElementById('deck-download-msg');
  const dlBtn = document.getElementById('btn-deck-download');
  if (msgEl) msgEl.style.display = 'none';
  if (secEl) secEl.style.display = 'none';
  if (dlMsg) dlMsg.style.display = 'none';
  if (dlBtn) { dlBtn.disabled = false; dlBtn.textContent = '\u2193 Download to downloads/'; }
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
    { label: 'Apollo',           val: null,                   svc: 'apollo_mcp' },
    { label: 'Slack',            val: null,                   svc: 'slack_mcp' },
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
    hero.querySelector('.done-icon').textContent = '\u2705';
    hero.querySelector('.done-title').textContent = "You're all set!";
    hero.querySelector('.done-sub').textContent   = 'All connections verified.';
  } else {
    hero.querySelector('.done-icon').textContent = '\U0001F4CB';
    hero.querySelector('.done-title').textContent = 'Config saved';
    hero.querySelector('.done-sub').textContent   =
      `${passed} of ${total} connections verified — fix the red items above then re-run setup.`;
  }

  // Show MCP warning only if checks actually failed
  const apolloOk = testResults['apollo_mcp'] && testResults['apollo_mcp'].ok;
  const slackOk  = testResults['slack_mcp']  && testResults['slack_mcp'].ok;
  const warnBox  = document.getElementById('done-mcp-warn');
  if (!apolloOk || !slackOk) {
    const missing = [!apolloOk && 'Apollo', !slackOk && 'Slack'].filter(Boolean).join(' and ');
    document.getElementById('done-mcp-warn-text').innerHTML =
      `<strong>${missing} tool permissions are missing.</strong> Make sure you cloned this repo
       with its <code class="inline">settings.json</code> intact — that file grants Claude
       access to ${missing} during pipeline runs.`;
    warnBox.style.display = 'flex';
  } else {
    warnBox.style.display = 'none';
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
  syncPlaywrightPath();
  closePicker();
}

function syncPlaywrightPath() {
  const p   = document.getElementById('APOLLO_BUILDER_PATH').value.trim();
  const el  = document.getElementById('fix-playwright-path');
  if (el) el.textContent = p ? 'cd ' + p : 'cd ...';
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
                     'APOLLO_BUILDER_PATH','SALES_DECK_PATH','SALES_DECK_URL',
                     'RCLONE_REMOTE','GDRIVE_FOLDER','GDRIVE_FOLDER_URL'];
  allFields.forEach(k => {
    const el = document.getElementById(k);
    if (el) { el.value = ''; el.className = el.className.replace(/\\b(warn|valid)\\b/g, '').trim(); }
  });

  // Clear warnings
  ['warn-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });
  // Hide drive resolve message
  const driveMsg = document.getElementById('drive-resolve-msg');
  if (driveMsg) { driveMsg.style.display = 'none'; driveMsg.textContent = ''; }
  // Reset deck download UI
  clearDeckResolve();
  const deckMsg = document.getElementById('deck-resolve-msg');
  if (deckMsg) { deckMsg.style.display = 'none'; deckMsg.textContent = ''; }

  // Reset all test dots + messages
  ['rclone_install','rclone_remote','node','apollo_builder','playwright','sales_deck','apollo_mcp','slack_mcp'].forEach(svc => {
    const dot = document.getElementById('dot-' + svc);
    const msg = document.getElementById('msg-' + svc);
    const fix = document.getElementById('fix-' + svc);
    if (dot) dot.className = 'test-dot';
    if (msg) { msg.textContent = 'Not tested'; msg.className = 'test-msg'; }
    if (fix) fix.classList.remove('show');
  });

  // Reset step badges back to numbers
  for (let i = 1; i <= 5; i++) {
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
            self.send_html(HTML.replace('__BASE_DIR__', str(BASE_DIR)))
        elif self.path == '/api/config':
            cfg = parse_config()
            cfg['_BASE_DIR'] = str(BASE_DIR)   # injected read-only — not written back
            self.send_json(cfg)
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

        elif self.path == '/api/resolve-drive-file':
            body   = self.read_body()
            cfg    = parse_config()
            remote = body.get('remote') or cfg.get('RCLONE_REMOTE', 'gdrive')
            url    = body.get('url', '')
            self.send_json(resolve_drive_file_url(remote, url))

        elif self.path == '/api/download-drive-file':
            body   = self.read_body()
            cfg    = parse_config()
            remote = body.get('remote') or cfg.get('RCLONE_REMOTE', 'gdrive')
            path   = body.get('path', '')
            name   = body.get('name', '')
            mime   = body.get('mime', '')
            self.send_json(download_drive_file(remote, path, name, mime))

        elif self.path == '/api/resolve-drive-folder':
            body   = self.read_body()
            cfg    = parse_config()
            remote = body.get('remote') or cfg.get('RCLONE_REMOTE', 'gdrive')
            url    = body.get('url', '')
            self.send_json(resolve_drive_folder_url(remote, url))

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
            cfg.update(self.read_body())   # live values from client override saved config
            dispatch = {
                'brew':           test_brew,
                'rclone-install': test_rclone_install,
                'rclone-remote':  lambda: test_rclone_remote(cfg.get('RCLONE_REMOTE', 'gdrive')),
                'rclone':         lambda: test_rclone(cfg.get('RCLONE_REMOTE', 'gdrive'), cfg.get('GDRIVE_FOLDER', '')),
                'node':           test_node,
                'apollo-builder': lambda: test_apollo_builder(cfg.get('APOLLO_BUILDER_PATH', '')),
                'playwright':     lambda: test_playwright(cfg.get('APOLLO_BUILDER_PATH', '')),
                'sales-deck':     lambda: test_sales_deck(cfg.get('SALES_DECK_PATH', '')),
                'apollo-mcp':     test_apollo_mcp,
                'slack-mcp':      test_slack_mcp,
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
