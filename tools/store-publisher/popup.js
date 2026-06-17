const itemSel    = document.getElementById('item');
const optTexts   = document.getElementById('optTexts');
const optImages  = document.getElementById('optImages');
const optGlobal  = document.getElementById('optGlobalImages');
const optDryRun  = document.getElementById('optDryRun');
const filterIn   = document.getElementById('filter');
const runBtn     = document.getElementById('run');
const probeBtn   = document.getElementById('probe');
const logEl      = document.getElementById('log');

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

// Local-only notice (e.g. config-load failure) that never reaches the background.
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
  probeBtn.disabled = busy;
}

function currentOpts(probeOnly) {
  return {
    store: 'cws',
    itemSlug: itemSel.value,
    updateTexts: optTexts.checked,
    updateImages: optImages.checked,
    updateGlobalImages: optGlobal.checked,
    dryRun: optDryRun.checked,
    localeFilter: filterIn.value.trim(),
    probeOnly: !!probeOnly,
  };
}

function start(probeOnly) {
  setRunning(true);

  loadConfig()
    .then(config => {
      const opts = currentOpts(probeOnly);
      chrome.storage.local.set({ publisher_opts: opts });

      // Progress and the final result are reflected via storage.local, so the
      // sendMessage callback is not needed (it would be dropped if the popup
      // closed before the run finished).
      chrome.runtime.sendMessage({ type: 'START_PUBLISH', config, opts }, () => {});
    })
    .catch(e => {
      appendLocal(e.message, 'err');
      setRunning(false);
    });
}

runBtn.addEventListener('click', () => start(false));
probeBtn.addEventListener('click', () => start(true));

// Live updates from the background, broadcast even while the popup was closed.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.run_log)   renderLog(changes.run_log.newValue);
  if (changes.run_state) setRunning(changes.run_state.newValue === 'running');
});

// Populate the item dropdown from config, restore the last-used options, and
// restore any log from a previous (possibly still-running) run.
loadConfig()
  .then(config => {
    for (const item of config.items) {
      const opt = document.createElement('option');
      opt.value = item.slug;
      opt.textContent = item.name;
      itemSel.appendChild(opt);
    }
    chrome.storage.local.get(['publisher_opts', 'run_log', 'run_state'], ({ publisher_opts: saved, run_log, run_state }) => {
      if (saved) {
        if (config.items.some(i => i.slug === saved.itemSlug)) itemSel.value = saved.itemSlug;
        optTexts.checked  = saved.updateTexts !== false;
        optImages.checked = !!saved.updateImages;
        optGlobal.checked = !!saved.updateGlobalImages;
        optDryRun.checked = !!saved.dryRun;
        filterIn.value    = saved.localeFilter || '';
      }
      renderLog(run_log);
      setRunning(run_state === 'running');
    });
  })
  .catch(e => appendLocal(e.message, 'err'));
