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
 * Merge monthly entries for multiple extensions into cws.json in a single commit.
 * Idempotent: only commits if at least one item changed.
 *
 * @param {string}   token   GitHub PAT
 * @param {object}   github  { owner, repo, branch, cws_data_path }
 * @param {Array<{itemId: string, entry: object, dailyRows: object[]}>} items
 * @returns {Array<{ itemId, committed, reason?, dailyAdded? }>}
 */
async function commitAllCwsEntries(token, github, items) {
  const { owner, repo, branch, cws_data_path } = github;
  const { sha, content: existing } = await _ghGet(token, owner, repo, branch, cws_data_path);

  const db      = existing ?? { schema: 1, items: {} };
  const results = [];
  let   anyChanged = false;
  const dates = new Set();

  for (const { itemId, entry, dailyRows = [] } of items) {
    if (!db.items[itemId]) db.items[itemId] = { history: [] };
    const item = db.items[itemId];
    let changed = false;

    // ── monthly snapshot ────────────────────────────────────────────────────
    if (JSON.stringify(item.history[0]) !== JSON.stringify(entry)) {
      item.history = [entry];
      changed = true;
    }

    // ── daily rows ──────────────────────────────────────────────────────────
    let dailyAdded = 0;
    if (dailyRows.length > 0) {
      const existingDaily = item.daily ?? [];
      const knownDates    = new Set(existingDaily.map(r => r.date));
      const toAdd         = dailyRows.filter(r => r.date && !knownDates.has(r.date));
      if (toAdd.length > 0) {
        item.daily = [...existingDaily, ...toAdd].sort((a, b) => a.date < b.date ? -1 : 1);
        dailyAdded = toAdd.length;
        changed    = true;
      }
    }

    if (changed) {
      anyChanged = true;
      if (entry.collected_at) dates.add(entry.collected_at);
    }
    results.push(changed
      ? { itemId, committed: true, dailyAdded }
      : { itemId, committed: false, reason: 'identical entry already exists' });
  }

  if (anyChanged) {
    const date = dates.size === 1 ? [...dates][0] : new Date().toISOString().slice(0, 10);
    const ids  = items.map(i => `${i.itemId.slice(0, 8)}…`).join(' ');
    const msg  = `stats: CWS monthly snapshot ${date} (${ids})`;
    await _ghPut(token, owner, repo, branch, cws_data_path, sha, db, msg);
  }

  return results;
}
