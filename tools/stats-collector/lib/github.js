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
    // btoa with encodeURIComponent handles non-ASCII characters (country names, etc.)
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
 * Merge a new monthly entry into cws.json and commit it.
 * Idempotent: re-running with the same data on the same date makes no commit.
 *
 * @param {string} token    GitHub PAT
 * @param {object} github   { owner, repo, branch, cws_data_path }
 * @param {string} itemId   Extension item ID
 * @param {object} entry    Monthly snapshot (full schema object)
 * @returns {{ committed: boolean, reason?: string }}
 */
async function commitCwsEntry(token, github, itemId, entry) {
  const { owner, repo, branch, cws_data_path } = github;
  const { sha, content: existing } = await _ghGet(token, owner, repo, branch, cws_data_path);

  const db = existing ?? { schema: 1, items: {} };
  if (!db.items[itemId]) db.items[itemId] = { history: [] };

  const history = db.items[itemId].history;
  const idx = history.findIndex(e => e.collected_at === entry.collected_at);

  if (idx >= 0) {
    if (JSON.stringify(history[idx]) === JSON.stringify(entry)) {
      return { committed: false, reason: 'identical entry already exists' };
    }
    history[idx] = entry;
  } else {
    history.push(entry);
    history.sort((a, b) => (a.collected_at < b.collected_at ? -1 : 1));
  }

  const msg = `stats: CWS monthly snapshot ${entry.collected_at} (${itemId.slice(0, 8)}…)`;
  await _ghPut(token, owner, repo, branch, cws_data_path, sha, db, msg);
  return { committed: true };
}
