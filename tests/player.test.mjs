/* Quiz player redesign (quiz.html): focus mode, overflow tools, dialogs, figures + viewer,
   citation line, explanation keys, results row, load timeout. Synthetic fixtures only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../quiz.html', import.meta.url), 'utf8');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const quiz = { id: 'pl', title: 'Lec 16 — Player fixture', subtitle: 'Fixture', questions: [0, 1, 2].map(i => ({
  text: 'Stem ' + i + '?', options: ['A', 'B', 'C', 'D'], correct: 1, citation: 'Slide ' + (i + 3),
  explanation: '<strong>B.</strong> Because.<br><img src="' + PNG + '" alt="slide 13"><br><img src="' + PNG + '" alt="slide 21">'
})) };
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));

async function page({ search = '?id=pl', wide = false, saved = {}, fetch } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/stylesheet|Could not load/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, {
    url: 'http://localhost:4610/quiz.html' + search, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = q => ({ matches: wide && /min-width:1100px/.test(q), addEventListener() {} });
      win.HTMLElement.prototype.scrollIntoView = function () {};
      const realTimeout = win.setTimeout.bind(win);
      win.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms >= 8000 ? 15 : ms, ...a);
      if (fetch) win.fetch = fetch;
      win.localStorage.setItem('qf_quizzes', JSON.stringify([quiz]));
      Object.entries(saved).forEach(([k, v]) => win.localStorage.setItem(k, v));
    }
  });
  await wait();
  dom.errors = errors;
  return dom;
}
const key = (win, k, opts = {}) => win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));

test('thin bar: full title with plain dashes, position reads 1 / 3, one h1', async () => {
  const dom = await page();
  try {
    const doc = dom.window.document;
    assert.deepEqual(dom.errors, []);
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(doc.getElementById('topbar-title').textContent, 'Lec 16 - Player fixture');
    assert.equal(doc.getElementById('q-pos').textContent, '1 / 3');
    assert.equal(doc.querySelector('header.qf-bar').classList.contains('topbar'), true, 'labvalues.js anchors to .topbar');
    assert.equal(doc.querySelector('script[src="anime.min.js"]'), null, 'no animation library');
  } finally { dom.window.close(); }
});

test('focus mode: default on below 1100 px, off at 1100+, Z flips it and remembers', async () => {
  const narrow = await page();
  try {
    const win = narrow.window, doc = win.document, quizEl = doc.getElementById('body-layout');
    assert.equal(quizEl.classList.contains('is-pinned'), false, 'rail hidden by default on narrow screens');
    assert.equal(doc.body.dataset.rail, 'off');
    key(win, 'z');
    assert.equal(quizEl.classList.contains('is-pinned'), true);
    assert.equal(win.localStorage.getItem('qf_focus'), 'off');
    assert.equal(doc.body.dataset.rail, 'on');
  } finally { narrow.window.close(); }
  const wide = await page({ wide: true });
  try {
    const win = wide.window, quizEl = win.document.getElementById('body-layout');
    assert.equal(quizEl.classList.contains('is-focus'), false, 'rail shown by default on wide screens');
    key(win, 'Z');
    assert.equal(quizEl.classList.contains('is-focus'), true);
    assert.equal(win.localStorage.getItem('qf_focus'), 'on');
  } finally { wide.window.close(); }
});

test('overflow tools: filters are radio items, highlight is a checkbox item, dialogs close on Esc', async () => {
  const dom = await page();
  try {
    const win = dom.window, doc = win.document;
    win.toggleDropdown('exam-controls-dd');
    assert.equal(doc.getElementById('exam-controls-dd-menu').classList.contains('is-open'), true);
    assert.equal(doc.activeElement, doc.getElementById('filter-all'), 'focus moves into the menu');
    doc.getElementById('filter-flag').click();
    assert.equal(doc.getElementById('filter-flag').getAttribute('aria-checked'), 'true');
    assert.equal(doc.getElementById('filter-all').getAttribute('aria-checked'), 'false');
    assert.equal(doc.getElementById('exam-controls-dd-menu').classList.contains('is-open'), false);
    win.setFilter('all');
    doc.getElementById('highlight-btn').click();
    assert.equal(doc.getElementById('highlight-btn').getAttribute('aria-checked'), 'true');
    win.openStatusModal();
    assert.equal(doc.getElementById('status-overlay').open, true);
    key(win, 'Escape');
    assert.equal(doc.querySelector('dialog[open]'), null);
    win.openQsSheet();
    assert.equal(doc.querySelectorAll('#qs-grid .qf-qchip').length, 3);
    doc.querySelectorAll('#qs-grid .qf-qchip')[2].click();
    assert.equal(doc.getElementById('qs-sheet').open, false);
    assert.equal(doc.getElementById('q-pos').textContent, '3 / 3');
  } finally { dom.window.close(); }
});

test('reveal: text verdict tags, Source line, 2-up figures, image viewer, E and Enter keys', async () => {
  const dom = await page({ saved: { quizTutorMode: 'on' } });
  try {
    const win = dom.window, doc = win.document;
    key(win, 'a');                                   /* wrong pick, tutor mode reveals */
    const rows = [...doc.querySelectorAll('#choices .qf-choice')];
    assert.equal(rows[1].querySelector('.qf-choice__tag').textContent, 'Correct');
    assert.equal(rows[0].querySelector('.qf-choice__tag').textContent, 'Your answer');
    assert.equal(rows[0].classList.contains('is-wrong'), true);
    assert.equal(doc.getElementById('review-layout').classList.contains('is-revealed'), true);
    const exp = doc.getElementById('exp-text');
    assert.equal(exp.querySelector('.qf-cite').textContent, 'Source: Slide 3');
    assert.equal(exp.querySelector('em'), null, 'citation no longer duplicated as italics');
    const figs = exp.querySelectorAll('.qf-figures > button.qf-figure');
    assert.equal(exp.querySelectorAll('.qf-figures').length, 1, 'neighbouring images share one grid');
    assert.equal(figs.length, 2);
    figs[1].click();
    const viewer = doc.getElementById('img-viewer');
    assert.equal(viewer.open, true);
    assert.match(doc.getElementById('viewer-cap').textContent, /slide 21 · Image 2 of 2/);
    assert.equal(doc.getElementById('viewer-next').disabled, true);
    win.viewerStep(-1);
    assert.equal(doc.getElementById('viewer-prev').disabled, true);
    key(win, 'Escape');
    assert.equal(viewer.open, false);
    assert.equal(doc.activeElement, figs[0], 'focus returns to the thumbnail on screen');
    doc.body.focus();
    key(win, 'e');
    assert.equal(doc.activeElement, doc.getElementById('explanation-box'), 'E jumps to the explanation');
    key(win, 'Enter');
    assert.equal(doc.getElementById('q-pos').textContent, '2 / 3', 'Enter moves on after the reveal');
    key(win, 'e');                                    /* not revealed: E picks option E (none here) */
    assert.equal(doc.getElementById('q-pos').textContent, '2 / 3');
    assert.deepEqual(dom.errors, []);
  } finally { dom.window.close(); }
});

test('results row: score, chips like the rail, Review missed filters to incorrect', async () => {
  const dom = await page();
  try {
    const win = dom.window, doc = win.document;
    key(win, 'b'); win.navigate(1); key(win, 'a');
    win.submitExam();
    const banner = doc.getElementById('score-banner');
    assert.equal(banner.classList.contains('visible'), true);
    assert.equal(doc.getElementById('score-tally').textContent, '1 / 3 · 33%');
    assert.match(doc.getElementById('score-pct-label').textContent, /Review the 2 you missed\?/);
    const chips = [...doc.querySelectorAll('#results-chips .qf-qchip')];
    assert.equal(chips.length, 3);
    assert.equal(chips[0].classList.contains('is-correct'), true);
    assert.equal(chips[1].classList.contains('is-wrong'), true);
    win.reviewMissed();
    assert.equal(doc.getElementById('filter-wrong').getAttribute('aria-checked'), 'true');
    assert.equal(doc.getElementById('q-pos').textContent, '2 / 3');
    chips[0].click();
    assert.equal(doc.getElementById('q-pos').textContent, '1 / 3');
  } finally { dom.window.close(); }
});

test('a shipped quiz that never loads turns into an error after the timeout', async () => {
  const dom = await page({ search: '?src=' + encodeURIComponent('quizzes/Demo/x.r1.json'), fetch: () => new Promise(() => {}) });
  try {
    const doc = dom.window.document;
    await wait(40);
    const err = doc.querySelector('.empty-state');
    assert.ok(err);
    assert.equal(err.getAttribute('role'), 'alert');
    assert.match(err.textContent, /taking longer than it should/);
    assert.equal(doc.getElementById('qbar-tools').style.display, 'none');
  } finally { dom.window.close(); }
});
