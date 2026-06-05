const patInput = document.getElementById('pat');
const runBtn   = document.getElementById('run');
const logEl    = document.getElementById('log');

function appendLog(text, cls) {
  logEl.style.display = 'block';
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

chrome.storage.local.get('github_pat', ({ github_pat }) => {
  if (github_pat) patInput.value = github_pat;
});

runBtn.addEventListener('click', async () => {
  const token = patInput.value.trim();
  if (!token) { appendLog('Enter a GitHub PAT first.', 'err'); return; }

  chrome.storage.local.set({ github_pat: token });

  let config;
  try {
    const resp = await fetch(chrome.runtime.getURL('config.json'));
    if (!resp.ok) throw new Error(`config.json not found (${resp.status}) — copy config.example.json → config.json`);
    config = await resp.json();
  } catch (e) {
    appendLog(e.message, 'err');
    return;
  }

  runBtn.disabled = true;
  logEl.textContent = '';
  logEl.style.display = 'block';
  appendLog('Starting…');

  const onMsg = msg => { if (msg.type === 'PROGRESS') appendLog(msg.status); };
  chrome.runtime.onMessage.addListener(onMsg);

  chrome.runtime.sendMessage({ type: 'START_COLLECTION', config, token }, resp => {
    chrome.runtime.onMessage.removeListener(onMsg);
    runBtn.disabled = false;
    if (!resp) { appendLog('No response from background.', 'err'); return; }
    appendLog(resp.ok ? 'Done.' : 'Error: ' + resp.error, resp.ok ? 'ok' : 'err');
  });
});
