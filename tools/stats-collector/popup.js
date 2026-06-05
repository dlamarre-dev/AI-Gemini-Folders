const patInput     = document.getElementById('pat');
const runBtn       = document.getElementById('run');
const backfillBtn  = document.getElementById('backfill');
const monthsInput  = document.getElementById('months');
const logEl        = document.getElementById('log');

function appendLog(text, cls) {
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
  backfillBtn.disabled = busy;
}

chrome.storage.local.get('github_pat', ({ github_pat }) => {
  if (github_pat) patInput.value = github_pat;
});

function startRun(msgType, extra = {}) {
  const token = patInput.value.trim();
  if (!token) { appendLog('Enter a GitHub PAT first.', 'err'); return; }

  chrome.storage.local.set({ github_pat: token });

  logEl.textContent = '';
  logEl.style.display = 'block';
  setRunning(true);

  loadConfig()
    .then(config => {
      const onMsg = msg => { if (msg.type === 'PROGRESS') appendLog(msg.status); };
      chrome.runtime.onMessage.addListener(onMsg);

      chrome.runtime.sendMessage({ type: msgType, config, token, ...extra }, resp => {
        chrome.runtime.onMessage.removeListener(onMsg);
        setRunning(false);
        if (!resp) { appendLog('No response from background.', 'err'); return; }
        appendLog(resp.ok ? 'Done.' : 'Error: ' + resp.error, resp.ok ? 'ok' : 'err');
      });
    })
    .catch(e => {
      appendLog(e.message, 'err');
      setRunning(false);
    });
}

runBtn.addEventListener('click', () => {
  appendLog('Starting…');
  startRun('START_COLLECTION');
});

backfillBtn.addEventListener('click', () => {
  const months = Math.max(1, Math.min(24, parseInt(monthsInput.value, 10) || 12));
  appendLog(`Starting back-fill (${months} months) — this will take several minutes…`);
  startRun('START_BACKFILL', { months });
});
