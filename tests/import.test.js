// import.js is the standalone import page (Firefox can't open a file picker from
// a popup). It reads the chosen file, parses JSON, delegates to mergeImportData,
// and reports success/failure. We stub FileReader + mergeImportData to drive it.

const flush = () => new Promise((r) => setTimeout(r, 0));

let originalFileReader;
beforeAll(() => {
  originalFileReader = global.FileReader;
  // Minimal synchronous FileReader: hands the file's text straight to onload.
  global.FileReader = class {
    readAsText(file) {
      this.onload({ target: { result: file._content } });
    }
  };
});
afterAll(() => { global.FileReader = originalFileReader; });

function mountAndWire() {
  document.body.innerHTML = `
    <h1 id="app-title"></h1>
    <button id="import-action-btn"></button>
    <input id="file-input" type="file" />
    <p id="status-msg"></p>`;
  jest.isolateModules(() => require('../src/import.js'));
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

function chooseFile(content) {
  const input = document.getElementById('file-input');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [{ _content: content }],
  });
  input.dispatchEvent(new Event('change'));
}

beforeEach(() => {
  global.mergeImportData = jest.fn().mockResolvedValue();
  jest.spyOn(console, 'error').mockImplementation(() => {}); // error paths log on purpose
  mountAndWire();
});
afterEach(() => console.error.mockRestore());

test('a valid backup is merged and reported as success', async () => {
  chooseFile(JSON.stringify({ folders: { Work: [] } }));
  await flush();

  expect(global.mergeImportData).toHaveBeenCalledWith({ folders: { Work: [] } });
  const status = document.getElementById('status-msg');
  expect(status.textContent).toContain('alertImportSuccess'); // i18n mock returns the key
  expect(status.style.color).toBe('green');
  expect(document.getElementById('file-input').value).toBe('');
});

test('invalid JSON is caught and reported as an error', async () => {
  chooseFile('{ this is not json');
  await flush();

  expect(global.mergeImportData).not.toHaveBeenCalled();
  const status = document.getElementById('status-msg');
  expect(status.textContent).toContain('alertImportError');
  expect(status.style.color).toBe('red');
});

test('a rejected merge is reported as an error', async () => {
  global.mergeImportData.mockRejectedValue(new Error('Invalid Format'));
  chooseFile(JSON.stringify({ folders: {} }));
  await flush();

  expect(document.getElementById('status-msg').textContent).toContain('alertImportError');
});
