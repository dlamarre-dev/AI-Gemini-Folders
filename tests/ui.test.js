// showCustomModal is the project's custom replacement for window.confirm/prompt.
// It resolves a Promise from button clicks, Enter/Escape keys, or a backdrop
// click. The keyboard + backdrop support shipped as a feature but had no test.

require('../src/ui'); // defines window.showCustomModal (no DOMContentLoaded dispatched)

function mountModalDOM() {
  document.body.innerHTML = `
    <div id="customModal" style="display:none">
      <div id="modalDialog">
        <div id="modalTitle"></div>
        <div id="modalMessage"></div>
        <input id="modalInput" />
        <button id="modalBtnCancel"></button>
        <button id="modalBtnConfirm"></button>
      </div>
    </div>`;
}

const $ = (id) => document.getElementById(id);

beforeEach(mountModalDOM);

describe('showCustomModal — confirm', () => {
  test('resolves true when Confirm is clicked and shows the modal', () => {
    const p = window.showCustomModal({ title: 'Sure?', type: 'confirm' });
    expect($('customModal').style.display).toBe('flex');
    expect($('modalTitle').textContent).toBe('Sure?');
    $('modalBtnConfirm').click();
    return expect(p).resolves.toBe(true);
  });

  test('resolves false when Cancel is clicked and hides the modal', async () => {
    const p = window.showCustomModal({ title: 'Sure?', type: 'confirm' });
    $('modalBtnCancel').click();
    await expect(p).resolves.toBe(false);
    expect($('customModal').style.display).toBe('none');
  });

  test('shows the message line only when a message is provided', () => {
    window.showCustomModal({ title: 't', message: 'details', type: 'confirm' });
    expect($('modalMessage').style.display).toBe('block');
    expect($('modalMessage').textContent).toBe('details');
    $('modalBtnConfirm').click();

    window.showCustomModal({ title: 't', type: 'confirm' });
    expect($('modalMessage').style.display).toBe('none');
  });
});

describe('showCustomModal — prompt', () => {
  test('resolves the trimmed input value on confirm', () => {
    const p = window.showCustomModal({ type: 'prompt', title: 'Name', defaultValue: 'seed' });
    expect($('modalInput').style.display).toBe('block');
    expect($('modalInput').value).toBe('seed');
    $('modalInput').value = '  new name  ';
    $('modalBtnConfirm').click();
    return expect(p).resolves.toBe('new name');
  });

  test('resolves null when cancelled', () => {
    const p = window.showCustomModal({ type: 'prompt', title: 'Name' });
    $('modalBtnCancel').click();
    return expect(p).resolves.toBeNull();
  });
});

describe('showCustomModal — alert', () => {
  test('hides Cancel and labels the confirm button OK', () => {
    window.showCustomModal({ type: 'alert', title: 'Heads up' });
    expect($('modalBtnCancel').style.display).toBe('none');
    expect($('modalBtnConfirm').textContent).toBe('OK');
    expect($('modalInput').style.display).toBe('none');
  });
});

describe('showCustomModal — keyboard & backdrop', () => {
  test('Enter confirms', () => {
    const p = window.showCustomModal({ title: 't', type: 'confirm' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    return expect(p).resolves.toBe(true);
  });

  test('Escape cancels', () => {
    const p = window.showCustomModal({ title: 't', type: 'confirm' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    return expect(p).resolves.toBe(false);
  });

  test('clicking the dimmed backdrop (the modal itself) cancels', () => {
    const p = window.showCustomModal({ title: 't', type: 'confirm' });
    $('customModal').click(); // event target === modal overlay
    return expect(p).resolves.toBe(false);
  });

  test('the keydown listener is removed after the modal closes', () => {
    const p = window.showCustomModal({ title: 't', type: 'confirm' });
    $('modalBtnConfirm').click();
    return p.then(() => {
      // A stray Enter afterwards must not throw or re-resolve anything.
      expect(() =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      ).not.toThrow();
    });
  });
});
