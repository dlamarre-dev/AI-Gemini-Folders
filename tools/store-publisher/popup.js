const itemSel    = document.getElementById('item');
const optTexts   = document.getElementById('optTexts');
const optImages  = document.getElementById('optImages');
const optGlobal  = document.getElementById('optGlobalImages');
const optDryRun  = document.getElementById('optDryRun');
const filterIn   = document.getElementById('filter');
const runBtn     = document.getElementById('run');
const probeBtn   = document.getElementById('probe');
const logEl      = document.getElementById('log');

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
  logEl.textContent = '';
  setRunning(true);
  appendLog(probeOnly ? 'Probing…' : 'Starting…');

  loadConfig()
    .then(config => {
      const opts = currentOpts(probeOnly);
      chrome.storage.local.set({ publisher_opts: opts });

      const onMsg = msg => { if (msg.type === 'PROGRESS') appendLog(msg.status); };
      chrome.runtime.onMessage.addListener(onMsg);

      chrome.runtime.sendMessage({ type: 'START_PUBLISH', config, opts }, resp => {
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

runBtn.addEventListener('click', () => start(false));
probeBtn.addEventListener('click', () => start(true));

// Populate the item dropdown from config and restore the last-used options.
loadConfig()
  .then(config => {
    for (const item of config.items) {
      const opt = document.createElement('option');
      opt.value = item.slug;
      opt.textContent = item.name;
      itemSel.appendChild(opt);
    }
    chrome.storage.local.get('publisher_opts', ({ publisher_opts: saved }) => {
      if (!saved) return;
      if (config.items.some(i => i.slug === saved.itemSlug)) itemSel.value = saved.itemSlug;
      optTexts.checked  = saved.updateTexts !== false;
      optImages.checked = !!saved.updateImages;
      optGlobal.checked = !!saved.updateGlobalImages;
      optDryRun.checked = !!saved.dryRun;
      filterIn.value    = saved.localeFilter || '';
    });
  })
  .catch(e => appendLog(e.message, 'err'));
