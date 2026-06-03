// Open the diagnostics page in a full tab (not a popup) so it survives while we
// open/probe/close the site tabs during a run.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('diagnostics.html') });
});
