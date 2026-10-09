/* Library page (index.html) in jsdom. Synthetic fixtures only; no real course data. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const entry = (id, title = id, n = 10) => ({ id, title, file: `quizzes/protected/${id}.r1.enc`, question_count: n });
const DEMO = { id: 'demo', name: 'Demo', quizzes: [{ id: 'qf-demo', title: 'Sample Quiz', file: 'quizzes/Demo/qf-demo.r1.json', question_count: 10 }] };
/* Publish order: odd ids first, then cardio, then pulm (so pulm is "latest"). */
const SECTIONS = [
  { id: 'legacy', name: 'Review', quizzes: [entry('legacy-quiz'), entry('neuro-psych-w01-a', 'Odd id')] },
  { id: 'week-01', name: 'Week 01', quizzes: [entry('cardio-w01-lec01', 'Lec 1 — Sample Topic'), entry('cardio-w01-labembryo', 'Sample Lab A')] },
  { id: 'week-02', name: 'Week 02', quizzes: [entry('cardio-w02-lec07')] },
  { id: 'pulm-01', name: 'Week 01', quizzes: [entry('pulm-w03-labhisto', 'Sample Lab B'), entry('pulm-w03-lec16', 'Lec 16 — Sample Topic', 15), entry('pulm-w01-lec02')] }
];
const quiz = { title: 'Import fixture', questions: [{ text: 'Choose A.', options: ['A', 'B'], correct: 0, explanation: 'A.', citation: 'Fixture' }] };
const wait = (ms = 20) => new Promise(r => setTimeout(r, ms));

/* opts: saved (localStorage), hash, manifest (public manifest response), fetchLog (array) */
async function page(opts = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!error.message.includes('CSS stylesheet')) errors.push(error.message); });
  const manifest = opts.manifest || { schema_version: 1, sections: [DEMO],
    protected: { manifest: 'quizzes/protected/manifest.enc', kdf: { salt: 'test-only' } } };
  const dom = new JSDOM(html, {
    url: `http://localhost:4610/${opts.hash || ''}`, runScripts: 'dangerously', virtualConsole,
    beforeParse(win) {
      win.matchMedia = () => ({ matches: false, addEventListener() {} });
      win.HTMLElement.prototype.scrollIntoView = function () {};
      /* The page's 8 s load timeout runs in 15 ms here. */
      const realTimeout = win.setTimeout.bind(win);
      win.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms >= 8000 ? 15 : ms, ...a);
      win.fetch = opts.fetch || (async url => { (opts.fetchLog || []).push(String(url)); return { ok: true, json: async () => manifest }; });
      Object.entries(opts.saved || {}).forEach(([key, value]) => win.localStorage.setItem(key, value));
    }
  });
  await wait();
  dom.errors = errors;
  return dom;
}
async function unlock(dom, sections = SECTIONS) {
  const win = dom.window;
  win.localStorage.setItem('qf_unlock_pw', 'synthetic-test-only');
  win._fetchProtectedManifest = async () => ({ sections });
  win.loadManifest();
  await wait();
}
const $ = (doc, sel) => doc.querySelector(sel);
const $$ = (doc, sel) => [...doc.querySelectorAll(sel)];
/* Text a visitor can see: skips hidden subtrees, closed dialogs, scripts and display:none. */
function visibleText(node) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeType !== 1) return '';
  const tag = node.tagName;
  if (node.hidden || tag === 'SCRIPT' || tag === 'STYLE' || (tag === 'DIALOG' && !node.open) || node.style.display === 'none') return '';
  return [...node.childNodes].map(visibleText).join(' ');
}

test('locked view shows Continue/Demo/My quizzes only and no course information', async () => {
  const fetchLog = [];
  const dom = await page({ fetchLog, saved: { 'qf_progress::src::quizzes/protected/pulm-w03-lec16.r1.enc':
    JSON.stringify({ v: 1, n: 15, answered: 4, ts: 5 }) } });
  try {
    const doc = dom.window.document;
    assert.deepEqual(dom.errors, []);
    assert.equal($(doc, '#lib-tabs').hidden, true, 'no tab strip while locked');
    assert.equal($(doc, '#panel-mine').hidden, false);
    assert.equal($(doc, '#panel-current').hidden, true);
    assert.equal($(doc, '#panel-current').textContent + $(doc, '#panel-archive').textContent, '');
    assert.equal($(doc, '#lock-btn').style.display, 'none');
    assert.deepEqual($$(doc, '#shipped-root [data-shipped-id]').map(r => r.dataset.shippedId), ['qf-demo']);
    assert.equal($(doc, '#resume-root').textContent, '', 'progress on a protected quiz is not shown while locked');
    const shown = visibleText(doc.body);
    assert.doesNotMatch(shown, /pulm|cardio|week|course|archive|current/i, 'no hint that course content exists');
    assert.deepEqual(fetchLog.map(u => u.split('?')[0]), ['quizzes/manifest.json'], 'nothing but the public manifest is fetched');
  } finally { dom.window.close(); }
});

test('unlock: Current = block first seen last in manifest order, Archive = the rest newest first', async () => {
  const dom = await page();
  try {
    const win = dom.window, doc = win.document;
    const original = JSON.stringify(SECTIONS);
    await unlock(dom);
    assert.deepEqual(dom.errors, []);
    assert.equal($(doc, '#lib-tabs').hidden, false);
    assert.equal($(doc, '#tab-current').getAttribute('aria-selected'), 'true');
    assert.equal($(doc, '#lock-btn').style.display, '');
    const cur = $(doc, '#panel-current');
    assert.equal($(cur, 'h2').textContent, 'PULM · latest quizzes');
    assert.deepEqual($$(cur, 'details.qf-week').map(d => d.dataset.week), ['1', '3']);
    const wk3 = $(cur, 'details.qf-week[data-week="3"]');
    assert.deepEqual($$(wk3, '.qf-lec').map(r => r.dataset.key), ['pulm-w03-lec16', 'pulm-w03-labhisto'], 'labs after lectures');
    assert.deepEqual($$(wk3, '.qf-lec__num').map(n => n.textContent), ['16', 'LAB']);
    assert.equal($(wk3, '.qf-lec__title').textContent, 'Sample Topic', 'Lec prefix stripped');
    assert.match($(wk3, '.qf-lec__meta').textContent, /Week 3 · Lecture · 15 questions/);
    assert.equal(wk3.open, true, 'newest week starts open');
    const primary = $(wk3, '[data-act="primary"]');
    assert.equal(primary.textContent, 'Start quiz');
    assert.equal(new URL(primary.href).searchParams.get('src'), 'quizzes/protected/pulm-w03-lec16.r1.enc');
    assert.deepEqual($$(doc, '#panel-archive details.qf-block').map(b => b.dataset.block), ['cardio', 'neuro-psych', 'other']);
    const odd = $(doc, '#panel-archive details.qf-block[data-block="neuro-psych"]');
    assert.deepEqual($$(odd, 'details.qf-week').map(d => d.dataset.week), ['other'], 'unparsed ids land in an Other week');
    assert.equal(JSON.stringify(SECTIONS), original, 'grouping must not mutate source metadata');
    win.lockSite();
    await wait();
    assert.equal($(doc, '#lib-tabs').hidden, true);
    assert.equal($$(doc, '.qf-lec[data-key]').length, 0);
    assert.equal(win.localStorage.getItem('qf_unlock_pw'), null);
  } finally { dom.window.close(); }
});

test('current block: device pin wins, unknown pins are ignored, fallback rules hold', async () => {
  const dom = await page({ saved: { qf_current_block: 'cardio' } });
  try {
    const win = dom.window, doc = win.document;
    await unlock(dom);
    assert.equal($(doc, '#panel-current h2').textContent, 'CARDIO', 'a pinned block is not called "latest"');
    assert.deepEqual($$(doc, '#panel-archive details.qf-block').map(b => b.dataset.block), ['pulm', 'neuro-psych', 'other']);
    [...$$(doc, '#panel-current button')].find(b => /newest block/.test(b.textContent)).click();
    assert.equal(win.localStorage.getItem('qf_current_block'), null);
    assert.equal($(doc, '#panel-current h2').textContent, 'PULM · latest quizzes');
    $(doc, '#panel-archive details.qf-block[data-block="cardio"] .block-actions button:last-child').click();
    assert.equal(win.localStorage.getItem('qf_current_block'), 'cardio');
    assert.equal($(doc, '#tab-current').getAttribute('aria-selected'), 'true');
    win.localStorage.setItem('qf_current_block', 'gi');
    const blocks = win.buildCourseModel(SECTIONS, []);
    assert.equal(win.pickCurrentBlock(blocks).slug, 'pulm', 'a pin naming a missing block is ignored');
    assert.equal(win.pickCurrentBlock(win.buildCourseModel([{ quizzes: [entry('x1'), entry('x2')] }], [])).slug, 'other');
    assert.equal(win.pickCurrentBlock([]), null);
    assert.deepEqual(JSON.parse(JSON.stringify(win.parseQuizId('cardio-w01-labembryo'))), { block: 'cardio', week: 1, kind: 'lab', num: null });
    assert.deepEqual(JSON.parse(JSON.stringify(win.parseQuizId('pulm-w03-lec16'))), { block: 'pulm', week: 3, kind: 'lec', num: '16' });
  } finally { dom.window.close(); }
});

test('empty, error, timeout and retry states', async () => {
  let mode = 'fail';
  const manifest = { schema_version: 1, sections: [DEMO], protected: { manifest: 'm.enc', kdf: { salt: 's' } } };
  const dom = await page({ fetch: async () => mode === 'fail' ? { ok: false, status: 500 }
    : mode === 'hang' ? new Promise(() => {}) : { ok: true, json: async () => manifest } });
  try {
    const win = dom.window, doc = win.document;
    let err = $(doc, '#shipped-root .qf-error');
    assert.ok(err, 'public manifest failure shows an error panel');
    assert.equal(err.getAttribute('role'), 'alert');
    assert.match(err.textContent, /HTTP 500/);
    mode = 'hang';
    $(err, '[data-act="retry"]').click();
    assert.equal($(doc, '#shipped-root [aria-busy="true"]') !== null, true, 'loading skeleton while waiting');
    await wait(40);
    assert.match($(doc, '#shipped-root .qf-error').textContent, /taking longer than it should/);
    mode = 'ok';
    $(doc, '#shipped-root [data-act="retry"]').click();
    await wait();
    assert.equal($$(doc, '#shipped-root [data-shipped-id]').length, 1, 'retry recovers');
    win.localStorage.setItem('qf_unlock_pw', 'synthetic-test-only');
    win._fetchProtectedManifest = async () => { throw new Error('HTTP 404'); };
    win.loadManifest();
    await wait();
    assert.match($(doc, '#panel-current .qf-error').textContent, /HTTP 404/);
    assert.equal($(doc, '#lock-btn').style.display, '', 'Lock stays reachable after a failed course load');
    win._fetchProtectedManifest = async () => ({ sections: [] });
    $(doc, '#panel-current [data-act="retry"]').click();
    await wait();
    assert.match($(doc, '#panel-current .qf-empty').textContent, /No course quizzes yet/);
    $(doc, '#panel-current .qf-empty button').click();
    assert.equal($(doc, '#tab-mine').getAttribute('aria-selected'), 'true');
    assert.match($(doc, '#panel-archive .qf-empty').textContent, /No older blocks yet/);
    win._fetchProtectedManifest = () => new Promise(() => {});
    win.loadManifest();
    await wait(5);
    assert.ok($(doc, '#panel-current [aria-busy="true"]'), 'course skeleton while decrypting');
    await wait(40);
    assert.match($(doc, '#panel-current .qf-error').textContent, /taking longer/);
  } finally { dom.window.close(); }
});

test('Continue card: newest unfinished quiz, dismiss hides it until the next activity', async () => {
  const key = 'qf_progress::src::quizzes/Demo/qf-demo.r1.json';
  const dom = await page({ saved: { [key]: JSON.stringify({ v: 1, n: 10, answered: 4, ts: 100 }) } });
  try {
    const win = dom.window, doc = win.document;
    const card = $(doc, '#resume-root .qf-resume');
    assert.ok(card);
    assert.match(card.textContent, /Sample Quiz/);
    assert.match(card.textContent, /Quiz · 4 of 10 answered/);
    assert.equal(new URL($(card, '[data-act="resume"]').href).searchParams.get('src'), 'quizzes/Demo/qf-demo.r1.json');
    assert.equal($(doc, '#shipped-root [data-act="primary"]').textContent, 'Resume quiz');
    $(card, '.qf-resume__close').click();
    assert.equal($(doc, '#resume-root').textContent, '');
    win.localStorage.setItem(key, JSON.stringify({ v: 1, n: 10, answered: 5, ts: 200 }));
    win.renderLibrary();
    assert.match($(doc, '#resume-root').textContent, /5 of 10/);
    await unlock(dom);
    win.localStorage.setItem('qf_progress::src::quizzes/protected/pulm-w03-lec16.r1.enc', JSON.stringify({ v: 1, n: 15, answered: 2, ts: 300 }));
    win.renderAll();
    assert.match($(doc, '#resume-root').textContent, /PULM · Lec 16 Sample Topic/);
    const row = $(doc, '#panel-current .qf-lec[data-key="pulm-w03-lec16"]');
    assert.equal(row.dataset.state, 'progress');
    assert.match(row.textContent, /2\/15 answered/);
  } finally { dom.window.close(); }
});

test('archive filter matches title or number, opens matches, and reports no match', async () => {
  const dom = await page();
  try {
    const win = dom.window, doc = win.document;
    await unlock(dom);
    $(doc, '#tab-archive').click();
    assert.equal($(doc, '#panel-archive').hidden, false);
    const f = $(doc, '#archive-filter');
    assert.ok(f);
    f.value = 'lab a'; f.dispatchEvent(new win.Event('input'));
    const shownRows = $$(doc, '#panel-archive .qf-lec').filter(r => !r.hidden && !r.closest('[hidden]'));
    assert.deepEqual(shownRows.map(r => r.dataset.key), ['cardio-w01-labembryo']);
    assert.equal($(doc, '#panel-archive details.qf-block[data-block="cardio"]').open, true);
    assert.equal($(doc, '#panel-archive details.qf-block[data-block="other"]').hidden, true);
    f.value = '7'; f.dispatchEvent(new win.Event('input'));
    assert.deepEqual($$(doc, '#panel-archive .qf-lec').filter(r => !r.closest('[hidden]')).map(r => r.dataset.key), ['cardio-w02-lec07']);
    f.value = 'zzz'; f.dispatchEvent(new win.Event('input'));
    assert.equal($(doc, '#archive-nomatch').hidden, false);
    assert.equal($(doc, '#archive-nomatch').textContent, 'No lectures match "zzz".');
    $(doc, '#tab-current').click(); $(doc, '#tab-current').focus();
    assert.equal($(doc, '#panel-archive').hidden, true);
    doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: '/', bubbles: true }));
    assert.equal($(doc, '#tab-archive').getAttribute('aria-selected'), 'true');
    assert.equal(doc.activeElement, $(doc, '#archive-filter'), '/ focuses the filter');
  } finally { dom.window.close(); }
});

test('custom folders start collapsed even with a saved open preference, and toggle within this load', async () => {
  const saved = { qf_folders: JSON.stringify([{ id: 'f-test', name: 'My folder', collapsed: false }]) };
  const dom = await page({ saved });
  try {
    const win = dom.window, doc = win.document;
    const button = () => doc.querySelector('[data-folder-id="f-test"] .folder-chevron');
    assert.equal(button().getAttribute('aria-expanded'), 'false');
    assert.equal(win.localStorage.getItem('qf_folders'), saved.qf_folders);
    button().click();
    assert.equal(button().getAttribute('aria-expanded'), 'true');
    assert.equal(doc.activeElement, button());
    win.renderLibrary();
    assert.equal(button().getAttribute('aria-expanded'), 'true');
    /* Move to folder from the row menu (keyboard alternative to drag-and-drop). */
    const row = $(doc, '.unfiled-section .qf-lec');
    const move = [...row.querySelectorAll('.qf-menu__item')].find(b => b.textContent === 'Move to My folder');
    move.click();
    assert.equal(win.getQuizzes()[0].folderId, 'f-test');
    assert.equal($$(doc, '[data-folder-id="f-test"]')[0].closest('.folder-section').querySelectorAll('.qf-lec').length, 1);
    const reloaded = await page({ saved });
    try { assert.equal(reloaded.window.document.querySelector('.folder-chevron[aria-expanded]').getAttribute('aria-expanded'), 'false'); }
    finally { reloaded.window.close(); }
  } finally { dom.window.close(); }
});

test('creation view keeps the prompt, validation and import, then offers Start it now', async () => {
  const dom = await page({ hash: '#create' });
  try {
    const win = dom.window, doc = win.document;
    assert.equal(doc.querySelector('main').parentElement, doc.body);
    assert.equal($(doc, '#lib-col').hidden, true);
    assert.equal($(doc, '#create-rail').hidden, false);
    assert.equal($(doc, '#nav-create').getAttribute('aria-current'), 'page');
    const slider = $(doc, '#qcount-slider');
    slider.value = '20'; slider.dispatchEvent(new win.Event('input'));
    assert.match($(doc, '#prompt-box').textContent, /Write 20 questions\./);
    win.togglePromptDisclosure();
    assert.equal($(doc, '#show-prompt-btn').getAttribute('aria-expanded'), 'true');
    $(doc, '#paste-area').value = 'not a quiz'; win.loadQuiz();
    assert.equal($(doc, '#load-status').classList.contains('err'), true);
    assert.equal($(doc, '#paste-area').getAttribute('aria-invalid'), 'true');
    assert.equal($(doc, '#create-success').hidden, true);
    $(doc, '#paste-area').value = JSON.stringify(quiz); win.loadQuiz();
    const imported = win.getQuizzes().find(item => item.title === quiz.title);
    assert.deepEqual(JSON.parse(JSON.stringify(imported.questions)), quiz.questions);
    assert.equal($(doc, '#create-success').hidden, false);
    assert.equal(new URL($(doc, '#create-start').href).searchParams.get('id'), imported.id);
    assert.equal($(doc, '#paste-area').value, '');
    assert.ok($(doc, `#library-root .qf-lec[data-id="${imported.id}"]`), 'the new quiz is already in My quizzes');
  } finally { dom.window.close(); }
});

test('Build test opens in a sheet, validates counts, stores only a recipe, and clears on lock', async () => {
  const dom = await page();
  try {
    const win = dom.window, doc = win.document;
    assert.equal(doc.querySelector('[data-act="build-test"]'), null);
    await unlock(dom);
    $(doc, '#panel-current [data-act="build-test"]').click();
    assert.equal($(doc, '#mixed-sheet').open, true);
    const form = $(doc, '#mixed-sheet .mixed-form');
    const start = form.querySelector('[type="submit"]'), count = form.querySelector('[type="number"]');
    assert.equal(start.disabled, true);
    form.querySelector('button').click();
    assert.equal(form.querySelectorAll('input[type="checkbox"]:checked').length, 3);
    count.value = '30'; count.dispatchEvent(new win.Event('input'));
    assert.equal(start.disabled, false);
    count.value = '36'; count.dispatchEvent(new win.Event('input'));
    assert.equal(start.disabled, true);
    count.value = '2'; count.dispatchEvent(new win.Event('input'));
    form.dispatchEvent(new win.Event('submit', { cancelable: true }));
    assert.deepEqual(JSON.parse(win.sessionStorage.getItem('qf_mixed_recipe')),
      { quizIds: ['pulm-w01-lec02', 'pulm-w03-lec16', 'pulm-w03-labhisto'], count: 2 });
    win.lockSite();
    assert.equal(win.sessionStorage.getItem('qf_mixed_recipe'), null);
    assert.equal(doc.querySelector('.mixed-form'), null);
    assert.equal($(doc, '#mixed-sheet').open, false);
  } finally { dom.window.close(); }
});
