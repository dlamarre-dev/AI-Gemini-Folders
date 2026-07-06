// diagnostics.js — opens each supported AI site, probes whether the production
// editor selectors still match, and reports per site. Runs in a normal extension
// page (full chrome API access), not a popup, so it survives multi-tab probing.

const SETTLE_MS = 4500; // extra wait after 'complete' for SPA hydration
// Some SPAs (e.g. You.com) never mount their composer in a hidden tab
// (rAF-throttled rendering) — retry with the tab briefly focused.
const VISIBLE_SETTLE_MS = 2500;

// Sites with a real domain + landing URL (excludes the user-configured local LLM).
const SITES_TO_TEST = Object.values(SITES).filter(s => s.domain && s.newConvUrl);

// --- Injected into each site tab (read-only). Mirrors production's findComposer. ---
function probe(editorSelectors, domain) {
  let matchedSelector = null;
  for (const sel of editorSelectors) {
    try { if (document.querySelector(sel)) { matchedSelector = sel; break; } } catch (_) {}
  }

  // Same heuristic as injectPromptIntoEditor in src/utils.js: lowest sizeable
  // visible textarea/contenteditable.
  const findComposer = () => {
    const els = Array.from(document.querySelectorAll('textarea, [contenteditable=""], [contenteditable="true"]'))
      .filter(el => {
        if (el.getAttribute('contenteditable') === 'false') return false;
        const r = el.getBoundingClientRect();
        return r.width > 120 && r.height > 12;
      });
    if (!els.length) return null;
    return els.reduce((lo, el) => el.getBoundingClientRect().bottom > lo.getBoundingClientRect().bottom ? el : lo);
  };
  const composer = findComposer();
  let heuristicDesc = null;
  if (composer) {
    const cls = (typeof composer.className === 'string' && composer.className.trim())
      ? '.' + composer.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    heuristicDesc = composer.tagName.toLowerCase() + (composer.id ? '#' + composer.id : '') + cls;
  }

  return {
    matchedSelector,
    heuristicFound: !!composer,
    heuristicDesc,
    hostname: location.hostname,
    href: location.href,
    onExpectedDomain: location.hostname === domain || location.hostname.endsWith('.' + domain),
  };
}

function waitForComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') finish(); };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (t) => { if (!chrome.runtime.lastError && t && t.status === 'complete') finish(); });
    setTimeout(finish, timeoutMs);
  });
}

// A login redirect (auth subdomain or login path) anywhere in the final URL.
const LOGIN_URL_RE = /login|signin|sign-in|\bauth\b|accounts\.google|microsoftonline|login\.live/i;

async function runSite(site) {
  let tab;
  // Final tab URL after any redirect. Readable via the "tabs" permission alone,
  // so we still get it when executeScript is blocked on a cross-domain login page.
  const tabUrl = async () => {
    try { const t = await chrome.tabs.get(tab.id); return t.url || ''; } catch (_) { return ''; }
  };
  const probeTab = async () => {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [site.editorSelectors, site.domain],
      func: probe,
    });
    return results?.[0]?.result;
  };
  try {
    tab = await chrome.tabs.create({ url: site.newConvUrl, active: false });
    await waitForComplete(tab.id);
    await new Promise(r => setTimeout(r, SETTLE_MS));
    let result = await probeTab();

    // Nothing found on the expected domain: the SPA may only hydrate in a
    // focused tab — flash it to the foreground and probe again.
    if (result && !result.error && !result.matchedSelector && !result.heuristicFound
        && result.onExpectedDomain !== false) {
      const diagTab = await chrome.tabs.getCurrent();
      await chrome.tabs.update(tab.id, { active: true });
      await new Promise(r => setTimeout(r, VISIBLE_SETTLE_MS));
      const retry = await probeTab();
      if (diagTab) { try { await chrome.tabs.update(diagTab.id, { active: true }); } catch (_) {} }
      if (retry) { retry.neededFocus = true; result = retry; }
    }
    return result ?? { error: 'No result (tab not scriptable).', href: await tabUrl() };
  } catch (err) {
    // executeScript throws when the tab navigated to a domain we lack host access
    // for — typically a login page (e.g. Gemini → accounts.google.com). Surface the
    // URL so classify() can report "not logged in" instead of a bare error.
    return { error: String(err && err.message || err), href: await tabUrl() };
  } finally {
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch (_) {} }
  }
}

function looksLikeLogin(r) {
  return r.onExpectedDomain === false || (r.href && LOGIN_URL_RE.test(r.href));
}

function classify(r) {
  if (!r) return { cls: 'error', icon: '❌', label: 'ERROR', detail: 'No result (tab not scriptable).' };
  if (r.error) {
    if (looksLikeLogin(r)) return { cls: 'login', icon: '🔒', label: 'NOT LOGGED IN?', detail: 'redirected to ' + r.href + ' — log in and re-run' };
    return { cls: 'error', icon: '❌', label: 'ERROR', detail: r.error };
  }
  const focusNote = r.neededFocus ? ' (page only hydrates in a focused tab)' : '';
  if (r.matchedSelector) return { cls: 'ok', icon: '🟢', label: 'OK', detail: 'matched: ' + r.matchedSelector + focusNote };
  if (r.heuristicFound) return {
    cls: 'fallback', icon: '🟡', label: 'FALLBACK — selectors stale',
    detail: 'No site selector matched; heuristic found ' + (r.heuristicDesc || 'a composer') + focusNote + '. → update editorSelectors in site-config.js',
  };
  if (looksLikeLogin(r)) return {
    cls: 'login', icon: '🔒', label: 'NOT LOGGED IN?', detail: 'on ' + r.hostname + ' — log in and re-run',
  };
  return { cls: 'fail', icon: '🔴', label: 'NO COMPOSER', detail: 'neither selectors nor heuristic found an input (logged out or major redesign)' };
}

// --- UI ---
const tbody = document.querySelector('#results tbody');
const runBtn = document.getElementById('run');
const statusEl = document.getElementById('status');

function renderRows() {
  tbody.innerHTML = '';
  const map = {};
  for (const site of SITES_TO_TEST) {
    const tr = document.createElement('tr');
    tr.className = 'pending';
    tr.innerHTML = `<td class="site">${site.key}</td><td class="st">…</td><td class="detail">queued</td>`;
    tbody.appendChild(tr);
    map[site.key] = tr;
  }
  return map;
}

async function run() {
  runBtn.disabled = true;
  const rows = renderRows();
  let i = 0;
  for (const site of SITES_TO_TEST) {
    i++;
    statusEl.textContent = `Testing ${site.key}… (${i}/${SITES_TO_TEST.length})`;
    const tr = rows[site.key];
    tr.className = 'pending';
    tr.children[1].textContent = '⏳';
    tr.children[2].textContent = 'opening ' + site.newConvUrl;

    const result = await runSite(site);
    const c = classify(result);
    tr.className = c.cls;
    tr.children[1].textContent = `${c.icon} ${c.label}`;
    tr.children[2].textContent = c.detail;
  }
  statusEl.textContent = 'Done.';
  runBtn.disabled = false;
}

runBtn.addEventListener('click', run);
