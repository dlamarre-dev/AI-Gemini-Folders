// popup.js — AI Folders
// parseSVG/autoResize and the whole prompt-library UI live in the shared
// src/prompts.js (loaded before this file); popup.js wires the rest.

document.addEventListener('DOMContentLoaded', async () => {
  const DELAY = {
    FOCUS:    100,
    SYNC:     500,
    AUTOSAVE: 600,
    ICON:    1500,
    STATUS:  2000,
    PROMO:   4000,
  };
  // Shared language/RTL/i18n wiring (src/popup-core.js).
  applyCommonI18n();

  const chatTitleInput = document.getElementById('chatTitle');

  // --- Shared popup wiring: mode toggle, sort, mobile sync, export/import… (src/popup-core.js) ---
  initPopupCommon({ exportFilename: 'ai_folders_backup.json' });

  // --- Per-site new-conversation buttons ---
  let localLlmUrl = '';

  chrome.storage.sync.get(['localLlmUrl'], (data) => {
    localLlmUrl = data.localLlmUrl || '';
    updateLocalBtn();
  });

  function updateLocalBtn() {
    const btn = document.getElementById('newConvLocal');
    if (btn) btn.classList.toggle('local-configured', !!localLlmUrl);
  }

  async function openLocalUrlModal() {
    const url = await window.showCustomModal({
      title: chrome.i18n.getMessage("setLocalUrl") || "Set local LLM URL:",
      type: 'prompt',
      defaultValue: localLlmUrl,
      placeholder: "http://localhost:3000"
    });
    if (url === null) return;

    const trimmed = url.trim();

    // User cleared the URL — revoke permission and clear storage
    if (!trimmed) {
      if (localLlmUrl) {
        try { chrome.permissions.remove({ origins: [new URL(localLlmUrl).origin + '/*'] }); } catch (_) {}
      }
      localLlmUrl = '';
      chrome.storage.sync.set({ localLlmUrl: '' });
      updateLocalBtn();
      return;
    }

    let origin;
    try { origin = new URL(trimmed).origin + '/*'; } catch (_) { return; }

    // Same origin as before — just update stored value, no permission change needed
    try {
      if (localLlmUrl && new URL(trimmed).origin === new URL(localLlmUrl).origin) {
        localLlmUrl = trimmed;
        chrome.storage.sync.set({ localLlmUrl: trimmed });
        updateLocalBtn();
        return;
      }
    } catch (_) {}

    // New or changed URL — request optional host permission.
    // Chrome closes the popup when the permission dialog appears, so we stash the
    // URL in local storage first; the service worker's onAdded listener will
    // activate it if the popup is destroyed before the callback fires.
    chrome.storage.local.set({ pendingLocalLlmUrl: trimmed, pendingLocalLlmPrev: localLlmUrl || '' });

    const granted = await new Promise(resolve => chrome.permissions.request({ origins: [origin] }, resolve));

    // If we reach here, the popup survived the permission dialog.
    chrome.storage.local.remove(['pendingLocalLlmUrl', 'pendingLocalLlmPrev']);
    if (!granted) return;

    // Revoke the previous origin's permission if it changed
    if (localLlmUrl) {
      try { chrome.permissions.remove({ origins: [new URL(localLlmUrl).origin + '/*'] }); } catch (_) {}
    }
    localLlmUrl = trimmed;
    chrome.storage.sync.set({ localLlmUrl: trimmed });
    updateLocalBtn();
  }

  // One button per SITES entry, alphabetical by key with 'local' pinned last.
  // Generated rather than hardcoded in popup.html so the registry stays the
  // single source of truth; the row wraps when the sites outgrow one line.
  const siteNewConvRow = document.getElementById('siteNewConvRow');
  Object.values(SITES)
    .sort((a, b) => (a.key === 'local') - (b.key === 'local') || a.key.localeCompare(b.key))
    .forEach(site => {
    const siteKey = site.key;
    const btn = document.createElement('button');
    btn.className = 'site-new-conv-btn' + (siteKey === 'local' ? ' site-new-conv-btn--local' : '');
    btn.setAttribute('data-site', siteKey);
    // Keep the historical id scheme (newConvLocal is looked up by updateLocalBtn)
    btn.id = 'newConv' + siteKey.charAt(0).toUpperCase() + siteKey.slice(1);
    siteNewConvRow.appendChild(btn);

    // Logos are pre-rasterized PNGs (tools/generate-site-icons.js); theme-
    // dependent ones ship a -light variant picked here. PNGs also render the
    // gradient marks that inline SVG injection couldn't display in the popup.
    const logoImg = document.createElement('img');
    logoImg.alt = '';
    logoImg.src = (site.logoLight && window.matchMedia('(prefers-color-scheme: light)').matches)
      ? site.logoLight : site.logo;
    btn.appendChild(logoImg);
    btn.title = chrome.i18n.getMessage(`newConv_${siteKey}`) || `New ${siteKey} conversation`;

    if (siteKey === 'local') {
      let pressTimer = null;
      btn.addEventListener('mousedown', () => {
        pressTimer = setTimeout(() => {
          pressTimer = null;
          openLocalUrlModal();
        }, DELAY.AUTOSAVE);
      });
      btn.addEventListener('mouseup', () => {
        if (pressTimer !== null) {
          clearTimeout(pressTimer);
          pressTimer = null;
          if (localLlmUrl) chrome.tabs.create({ url: localLlmUrl });
          else openLocalUrlModal();
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (pressTimer !== null) { clearTimeout(pressTimer); pressTimer = null; }
      });
      // Right-click is a second, more discoverable way to configure the URL
      // (the long-press is easy to miss).
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openLocalUrlModal();
      });
    } else {
      btn.addEventListener('click', () => {
        chrome.tabs.create({ url: site.newConvUrl });
      });
    }
  });

  // --- Prompt Mode UI (shared: src/prompts.js) ---
  initPromptsUI();

  // Site-specific insert: route a saved prompt into the active AI tab's editor.
  // Returns true on success; shows its own modal on failure. Used by the shared
  // prompt list's insert (▶) button via window.insertPromptIntoActiveTab.
  window.insertPromptIntoActiveTab = async function (promptText) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const siteKey = getSiteByUrl(tab?.url, localLlmUrl);
    const editorSelectors = siteKey ? SITES[siteKey]?.editorSelectors : null;
    if (!siteKey || !editorSelectors) {
      window.showCustomModal({
        title: chrome.i18n.getMessage("alertNotSupported") || "Please use this extension on a supported AI site.",
        type: 'alert'
      });
      return false;
    }
    // Reuse the same injector as the #-trigger (utils.js, loaded before this
    // file). Runs in the page MAIN world and shares the heuristic composer
    // fallback and the Perplexity chip-clearing path, so the ▶ button and the
    // # trigger behave identically across all sites.
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [promptText, editorSelectors, siteKey === 'perplexity'],
      func: injectPromptIntoEditor,
    });
    if (results?.[0]?.result) return true;
    window.showCustomModal({
      title: chrome.i18n.getMessage("alertEditorNotFound") || "Couldn't find the text input on this page. Try clicking into the editor first, then use the insert button.",
      type: 'alert'
    });
    return false;
  };


  // Smart title pre-filling based on active tab
  let [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentSiteKey = getSiteByUrl(currentTab?.url, localLlmUrl);

  if (currentTab && currentSiteKey) {
    if (currentSiteKey === 'local') {
      // No script injection for local LLM — use the browser tab title directly
      chatTitleInput.value = currentTab.title || chrome.i18n.getMessage("defaultTitle") || "New conversation";
      // Ensure prompt-trigger is active in the local LLM tab. Dynamic registerContentScripts
      // is unreliable in Firefox, so we inject on popup open as a guaranteed fallback.
      // window.__promptTriggerActive guards against double execution.
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['lz-string.min.js', 'prompt-trigger.js'],
      }).catch(() => {});
    } else {
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        args: [currentSiteKey, null],
        func: extractAITitleLogic
      }, (injectionResults) => {
        if (injectionResults?.[0]?.result) {
          chatTitleInput.value = injectionResults[0].result;
        } else {
          chatTitleInput.value = chrome.i18n.getMessage("defaultTitle") || "New conversation";
        }
      });
    }
  }


  // --- Save conversation (shared flow; AF maps the tab to one of its sites and
  //     tags each saved entry with its source site) ---
  initSaveConversation({
    getSiteKey: (tab) => getSiteByUrl(tab?.url, localLlmUrl),
    unsupportedMessageKey: 'alertNotSupported',
    tagSite: true,
  });

});
