import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../quiz.html', import.meta.url), 'utf8');
const quiz = { id: 'ux', title: 'UX', questions: [0, 1, 2, 3].map(i => ({
  text: 'Question ' + i + ' stem.', options: ['A', 'B', 'C', 'D'], correct: 1, explanation: 'Because.'
})) };

// Shared in-memory storage so a second page load sees what the first one saved.
function memoryStorage(seed) {
  const store = { ...seed };
  return {
    getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; },
    key: i => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; }
  };
}

async function page(storage) {
  const dom = new JSDOM(html, {
    url: 'http://localhost:4610/quiz.html?id=ux', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(win) {
      win.anime = null;
      win.matchMedia = () => ({ matches: false, addEventListener() {} });
      Object.defineProperty(win, 'localStorage', { value: storage });
    }
  });
  await new Promise(resolve => setTimeout(resolve, 30));
  return dom;
}
const key = (win, k, opts = {}) =>
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));

test('shortcuts ignore modifier keys and stay quiet while a dialog is open', async () => {
  const dom = await page(memoryStorage({ qf_quizzes: JSON.stringify([quiz]) }));
  try {
    const win = dom.window, doc = win.document;
    key(win, 'c', { metaKey: true });
    key(win, 'f', { ctrlKey: true });
    assert.match(doc.getElementById('currently-selected').textContent, /No answer selected/);
    assert.equal(doc.getElementById('flag-btn').getAttribute('aria-pressed'), 'false');
    win.openEndModal();
    key(win, 'ArrowRight');
    assert.match(doc.getElementById('ef-count').textContent, /^1 OF 4/);
    key(win, 'Escape');
    assert.equal(doc.querySelector('.overlay.open'), null);
    key(win, 'b');
    assert.match(doc.getElementById('currently-selected').textContent, /· B/);
  } finally { dom.window.close(); }
});

test('Previous/Next follow the active filter; View flagged with none flagged keeps the full rail', async () => {
  const dom = await page(memoryStorage({ qf_quizzes: JSON.stringify([quiz]) }));
  try {
    const win = dom.window, doc = win.document;
    win.viewFlagged();
    assert.equal(doc.getElementById('qhub-toast').textContent, 'No flagged questions');
    assert.equal(doc.getElementById('filter-all').classList.contains('selected'), true);
    win.navigate(1); win.navigate(1); key(win, 'f');           // flag question 3
    win.navigate(-1); win.navigate(-1);                          // back to question 1
    win.setFilter('flagged');
    win.navigate(1);
    assert.match(doc.getElementById('ef-count').textContent, /^3 OF 4/);
    assert.equal(doc.querySelectorAll('#q-circles button.q-circle').length, 4, 'rail tiles are buttons');
  } finally { dom.window.close(); }
});

test('progress survives a reload and is cleared on submit', async () => {
  const storage = memoryStorage({ qf_quizzes: JSON.stringify([quiz]) });
  const first = await page(storage);
  key(first.window, 'c'); key(first.window, 'f');
  first.window.close();
  assert.ok(storage.getItem('qf_progress::id::ux'), 'progress saved');
  const second = await page(storage);
  try {
    const doc = second.window.document;
    assert.match(doc.getElementById('currently-selected').textContent, /· C/);
    assert.equal(doc.getElementById('flag-btn').getAttribute('aria-pressed'), 'true');
    assert.match(doc.getElementById('qhub-toast').textContent, /Resumed · 1\/4 answered/);
    second.window.submitExam();
    assert.equal(storage.getItem('qf_progress::id::ux'), null);
    assert.equal(doc.getElementById('filter-wrong').hidden, false);
  } finally { second.window.close(); }
});
