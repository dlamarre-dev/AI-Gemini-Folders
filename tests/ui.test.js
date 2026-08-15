// showCustomModal is the project's custom replacement for window.confirm/prompt.
// It resolves a Promise from button clicks, Enter/Escape keys, or a backdrop
// click. The keyboard + backdrop support shipped as a feature but had no test.

require('../src/ui'); // defines window.showCustomModal (no DOMContentLoaded dispatched)

function mountModalDOM() {
  document.body.innerHTML = `
    <div id="customModal" style="display:none">
      <div id="modalDialog" class="modal-content">
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

// ---------------------------------------------------------------------------
// Accessibility: dialog semantics, focus handling, and the dropdown pattern
// ---------------------------------------------------------------------------

describe('showCustomModal — accessibility', () => {
  test('announces itself as a labelled modal dialog', () => {
    const p = window.showCustomModal({ title: 'Sure?', message: 'Details', type: 'confirm' });
    const dialog = $('modalDialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('modalTitle');
    expect(dialog.getAttribute('aria-describedby')).toBe('modalMessage');
    $('modalBtnConfirm').click();
    return p;
  });

  test('drops aria-describedby when there is no message', async () => {
    const p = window.showCustomModal({ title: 'Sure?', type: 'confirm' });
    expect($('modalDialog').hasAttribute('aria-describedby')).toBe(false);
    $('modalBtnConfirm').click();
    await p;
  });

  test('focuses inside the dialog so Tab cannot start behind it', async () => {
    jest.useFakeTimers();
    const p = window.showCustomModal({ title: 'Sure?', type: 'confirm' });
    jest.advanceTimersByTime(1);
    expect(document.activeElement).toBe($('modalBtnConfirm'));
    $('modalBtnConfirm').click();
    jest.useRealTimers();
    await p;
  });

  test('returns focus to the control that opened it', async () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="opener"></button>');
    const opener = $('opener');
    opener.focus();
    const p = window.showCustomModal({ title: 'Sure?', type: 'confirm' });
    $('modalBtnConfirm').click();
    await p;
    expect(document.activeElement).toBe(opener);
  });

  test('Tab wraps inside the dialog instead of escaping to the page behind', async () => {
    // The overlay only hides the popup visually, so without a trap Tab walks
    // the still-focusable controls underneath it.
    document.body.insertAdjacentHTML('beforeend', '<button id="behind"></button>');
    const p = window.showCustomModal({ title: 'Sure?', type: 'confirm' });
    $('modalBtnConfirm').focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe($('behind'));
    $('modalBtnConfirm').click();
    await p;
  });
});

describe('makeMenuAccessible', () => {
  function mountMenu() {
    document.body.innerHTML = `
      <button id="tog"></button>
      <div id="menu">
        <div class="dropdown-item" data-value="a"></div>
        <div class="dropdown-item" data-value="b"></div>
        <div class="dropdown-item" data-value="c"></div>
      </div>`;
    const tog = $('tog');
    const menu = $('menu');
    tog.addEventListener('click', () => menu.classList.toggle('show'));
    window.makeMenuAccessible(tog, menu, () => menu.querySelectorAll('.dropdown-item'));
    return { tog, menu, items: [...menu.querySelectorAll('.dropdown-item')] };
  }

  test('gives the toggle and the options their roles', () => {
    const { tog, menu, items } = mountMenu();
    expect(tog.getAttribute('aria-haspopup')).toBe('menu');
    expect(tog.getAttribute('aria-expanded')).toBe('false');
    expect(menu.getAttribute('role')).toBe('menu');
    for (const it of items) {
      expect(it.getAttribute('role')).toBe('menuitem');
      expect(it.getAttribute('tabindex')).toBe('-1');
    }
  });

  test('ArrowDown on the toggle opens the menu and lands on the first option', () => {
    jest.useFakeTimers();
    const { tog, menu, items } = mountMenu();
    tog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    jest.advanceTimersByTime(1);
    expect(menu.classList.contains('show')).toBe(true);
    expect(tog.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(items[0]);
    jest.useRealTimers();
  });

  test('arrows move between options and wrap around', () => {
    jest.useFakeTimers();
    const { tog, menu, items } = mountMenu();
    tog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    jest.advanceTimersByTime(1);
    const arrow = (key) => menu.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    arrow('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    arrow('ArrowUp');
    arrow('ArrowUp');
    expect(document.activeElement).toBe(items[2]);   // wrapped past the start
    arrow('End');
    expect(document.activeElement).toBe(items[2]);
    arrow('Home');
    expect(document.activeElement).toBe(items[0]);
    jest.useRealTimers();
  });

  test('Enter chooses the focused option and closes the menu', () => {
    jest.useFakeTimers();
    const { tog, menu, items } = mountMenu();
    const chosen = jest.fn();
    items[1].addEventListener('click', chosen);
    tog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    jest.advanceTimersByTime(1);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(chosen).toHaveBeenCalled();
    expect(menu.classList.contains('show')).toBe(false);
    expect(document.activeElement).toBe(tog);
    jest.useRealTimers();
  });

  test('Escape closes the menu and hands focus back to the toggle', () => {
    jest.useFakeTimers();
    const { tog, menu } = mountMenu();
    tog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    jest.advanceTimersByTime(1);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(menu.classList.contains('show')).toBe(false);
    expect(document.activeElement).toBe(tog);
    jest.useRealTimers();
  });
});
