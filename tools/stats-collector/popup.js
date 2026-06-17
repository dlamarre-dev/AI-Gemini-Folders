const patInput = document.getElementById('pat');
const runBtn   = document.getElementById('run');
const logEl    = document.getElementById('log');

// Rebuild the log view from the persisted buffer. The background owns the log
// (see background.js): rendering purely from storage means focus loss — which
// destroys this popup — never loses output, and reopening restores it.
function renderLog(log) {
  logEl.textContent = '';
  if (!log || !log.length) { logEl.style.display = 'none'; return; }
  logEl.style.display = 'block';
  for (const { text, cls } of log) {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = text;
    logEl.appendChild(line);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

// Local-only notice (e.g. input validation) that never reaches the background.
function appendLocal(text, cls) {
  logEl.style.display = 'block';
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

async function loadConfig() {
  const resp = await fetch(chrome.runtime.getURL('config.json'));
  if (!resp.ok) throw new Error(`config.json not found (${resp.status}) — copy config.example.json → config.json`);
  return resp.json();
}

function setRunning(busy) {
  runBtn.disabled = busy;
}

// Hydrate from storage: restore the PAT and any log from a previous (possibly
// still-running) run, and reflect whether a run is currently in progress.
chrome.storage.local.get(['github_pat', 'run_log', 'run_state'], ({ github_pat, run_log, run_state }) => {
  if (github_pat) patInput.value = github_pat;
  renderLog(run_log);
  setRunning(run_state === 'running');
});

// Live updates from the background, broadcast even while the popup was closed.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.run_log)   renderLog(changes.run_log.newValue);
  if (changes.run_state) setRunning(changes.run_state.newValue === 'running');
});

runBtn.addEventListener('click', () => {
  const token = patInput.value.trim();
  if (!token) { appendLocal('Enter a GitHub PAT first.', 'err'); return; }

  chrome.storage.local.set({ github_pat: token });
  setRunning(true);

  loadConfig()
    .then(config => {
      // Progress and the final result are reflected via storage.local, so the
      // sendMessage callback is not needed (it would be dropped if the popup
      // closed before the run finished).
      chrome.runtime.sendMessage({ type: 'START_COLLECTION', config, token }, () => {});
    })
    .catch(e => {
      appendLocal(e.message, 'err');
      setRunning(false);
    });
});
