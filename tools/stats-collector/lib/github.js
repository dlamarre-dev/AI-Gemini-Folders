// Commits docs/data/cws.json to GitHub via the Contents API.
// Loaded as a background script alongside background.js.

const GITHUB_API = 'https://api.github.com';

async function _ghGet(token, owner, repo, branch, path) {
  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}&_t=${Date.now()}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
  );
  if (resp.status === 404) return { sha: null, content: null };
  if (!resp.ok) throw new Error(`GitHub GET ${path}: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return {
    sha: data.sha,
    content: JSON.parse(atob(data.content.replace(/\n/g, ''))),
  };
}

async function _ghPut(token, owner, repo, branch, path, sha, obj, message) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2)))),
    branch,
  };
  if (sha) body.sha = sha;
  const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`GitHub PUT ${path}: ${resp.status} ${await resp.text()}`);
}

/**
 * Merge a new monthly entry (and optional daily rows) into cws.json and commit.
 * Idempotent: re-running with identical data makes no commit.
 *
 * @param {string}   token      GitHub PAT
 * @param {object}   github     { owner, repo, branch, cws_data_path }
 * @param {string}   itemId     Extension item ID
 * @param {object}   entry      Monthly snapshot (full schema object)
 * @param {object[]} dailyRows  [{date, installs?, uninstalls?, weekly_users?, impressions?}]
 * @returns {{ committed: boolean, reason?: string, dailyAdded?: number }}
 */
async function commitCwsEntry(token, github, itemId, entry, dailyRows = []) {
  const { owner, repo, branch, cws_data_path } = github;
  const { sha, content: existing } = await _ghGet(token, owner, repo, branch, cws_data_path);

  const db = existing ?? { schema: 1, items: {} };
  if (!db.items[itemId]) db.items[itemId] = { history: [] };

  const item    = db.items[itemId];
  const history = item.history;
  let changed   = false;

  // ── monthly history entry ─────────────────────────────────────────────────
  const idx = history.findIndex(e =>
    entry.period_start
      ? e.period_start === entry.period_start
      : e.collected_at === entry.collected_at
  );

  if (idx >= 0) {
    if (JSON.stringify(history[idx]) !== JSON.stringify(entry)) {
      history[idx] = entry;
      changed = true;
    }
  } else {
    history.push(entry);
    history.sort((a, b) => (a.period_start ?? a.collected_at) < (b.period_start ?? b.collected_at) ? -1 : 1);
    changed = true;
  }

  // ── daily rows (CSV-sourced) ──────────────────────────────────────────────
  let dailyAdded = 0;
  if (dailyRows.length > 0) {
    const existingDaily = item.daily ?? [];
    const knownDates    = new Set(existingDaily.map(r => r.date));
    const toAdd         = dailyRows.filter(r => r.date && !knownDates.has(r.date));
    if (toAdd.length > 0) {
      item.daily = [...existingDaily, ...toAdd]
        .sort((a, b) => a.date < b.date ? -1 : 1);
      dailyAdded = toAdd.length;
      changed    = true;
    }
  }

  if (!changed) return { committed: false, reason: 'identical entry already exists' };

  const msg = `stats: CWS monthly snapshot ${entry.collected_at} (${itemId.slice(0, 8)}…)`;
  await _ghPut(token, owner, repo, branch, cws_data_path, sha, db, msg);
  return { committed: true, dailyAdded };
}
