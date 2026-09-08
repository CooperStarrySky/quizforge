import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const entry = id => ({ id, title: id, file: `quizzes/protected/${id}.r1.enc`, question_count: 1 });
const demo = { id: 'demo', name: 'Demo', quizzes: [entry('demo')] };
const weeks = [
  { id: 'week-05', name: 'Week 05', quizzes: [entry('cardio-w05-a')] },
  { id: 'week-01', name: 'Week 01', quizzes: [entry('cardio-w01-a'), entry('neuro-psych-w01-a')] },
  { id: 'legacy', name: 'Review', quizzes: [entry('legacy-quiz')] }
];
const quiz = { title: 'Import fixture', questions: [{ text: 'Choose A.', options: ['A', 'B'], correct: 0, explanation: 'A.', citation: 'Fixture' }] };

async function page(saved = {}, hash = '') {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!error.message.includes('CSS stylesheet')) errors.push(error.message);
  });
  const dom = new JSDOM(html, {
    url: `http://localhost:4610/${hash}`, runScripts: 'dangerously', virtualConsole,
    beforeParse(win) {
      win.matchMedia = () => ({ matches: false, addEventListener() {} });
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.fetch = async () => ({ ok: true, json: async () => ({
        schema_version: 1, sections: [demo],
        protected: { manifest: 'quizzes/protected/manifest.enc', kdf: { salt: 'test-only' } }
      }) });
      Object.entries(saved).forEach(([key, value]) => win.localStorage.setItem(key, value));
    }
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(errors, [], 'no JavaScript errors');
  return dom;
}

test('locked home shows only Demo; unlock groups existing weeks without changing entries', async () => {
  const dom = await page();
  try {
    const win = dom.window, doc = win.document;
    assert.deepEqual([...doc.querySelectorAll('#shipped-root > details')].map(el => el.dataset.sectionId), ['demo']);
    assert.equal(doc.querySelector('#lock-btn').style.display, 'none');
    const original = JSON.stringify(weeks);
    win.localStorage.setItem('qf_unlock_pw', 'synthetic-test-only');
    win._fetchProtectedManifest = async () => ({ sections: weeks });
    win.loadManifest();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual([...doc.querySelectorAll('#shipped-root > details')].map(el => el.dataset.sectionId), ['block-cardio', 'block-neuro-psych', 'block-other', 'demo']);
    const cardio = doc.querySelector('[data-section-id="block-cardio"]');
    assert.deepEqual([...cardio.querySelectorAll('details[data-section-id]')].map(el => el.dataset.sectionId), ['week-01', 'week-05']);
    assert.equal(cardio.querySelectorAll('[data-shipped-id]').length, 2);
    assert.equal(doc.querySelector('[data-section-id="block-neuro-psych"]').querySelectorAll('[data-shipped-id]').length, 1);
    assert.equal(doc.querySelectorAll('#shipped-root details[open]').length, 0);
    assert.equal(doc.querySelector('#custom-section').open, false);
    assert.equal(JSON.stringify(weeks), original, 'grouping must not mutate source metadata');
    const link = cardio.querySelector('a.take');
    assert.equal(new URL(link.href).searchParams.get('src'), weeks[1].quizzes[0].file);
    win.lockSite();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(doc.querySelectorAll('[data-section-id^="block-"]').length, 0);
  } finally { dom.window.close(); }
});

test('custom folders start collapsed even with a saved open preference, and toggle within this load', async () => {
  const saved = { qf_folders: JSON.stringify([{ id: 'f-test', name: 'My folder', collapsed: false }]) };
  const dom = await page(saved);
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
    const reloaded = await page(saved);
    try { assert.equal(reloaded.window.document.querySelector('.folder-chevron[aria-expanded]').getAttribute('aria-expanded'), 'false'); }
    finally { reloaded.window.close(); }
  } finally { dom.window.close(); }
});

test('creation view preserves the prompt, validation, imported fields, and return to library', async () => {
  const dom = await page({}, '#create');
  try {
    const win = dom.window, doc = win.document;
    assert.equal(doc.querySelector('main').parentElement, doc.body);
    assert.equal(doc.querySelector('#lib-col').hidden, true);
    assert.equal(doc.querySelector('#create-rail').hidden, false);
    const slider = doc.querySelector('#qcount-slider');
    slider.value = '20'; slider.dispatchEvent(new win.Event('input'));
    assert.match(doc.querySelector('#prompt-box').textContent, /Write 20 questions\./);
    win.togglePromptDisclosure();
    assert.equal(doc.querySelector('#show-prompt-btn').getAttribute('aria-expanded'), 'true');
    doc.querySelector('#paste-area').value = 'not a quiz'; win.loadQuiz();
    assert.equal(doc.querySelector('#load-status').classList.contains('err'), true);
    assert.equal(doc.querySelector('#create-rail').hidden, false);
    doc.querySelector('#paste-area').value = JSON.stringify(quiz); win.loadQuiz();
    const imported = win.getQuizzes().find(item => item.title === quiz.title);
    assert.deepEqual(JSON.parse(JSON.stringify(imported.questions)), quiz.questions);
    assert.equal(doc.querySelector('#create-rail').hidden, true);
    assert.equal(doc.querySelector('#lib-col').hidden, false);
    assert.equal(doc.querySelector('#custom-section').open, true);
    assert.equal(doc.querySelector('#paste-area').value, '');
    assert.equal(doc.querySelector('#nav-library').getAttribute('aria-current'), 'page');
  } finally { dom.window.close(); }
});


test('mixed builder is protected, validates counts, stores only a recipe, and clears on lock', async () => {
  const dom = await page();
  try {
    const win = dom.window, doc = win.document;
    assert.equal(doc.querySelector('.mixed-builder'), null);
    win.localStorage.setItem('qf_unlock_pw', 'synthetic-test-only');
    win._fetchProtectedManifest = async () => ({sections: weeks});
    win.loadManifest();
    await new Promise(resolve => setTimeout(resolve, 20));
    const form = doc.querySelector('[data-section-id="block-cardio"] .mixed-form');
    assert.ok(form);
    const start = form.querySelector('[type="submit"]'), count = form.querySelector('[type="number"]');
    assert.equal(start.disabled, true);
    form.querySelector('button').click();
    assert.equal(form.querySelectorAll('input[type="checkbox"]:checked').length, 2);
    count.value = '2'; count.dispatchEvent(new win.Event('input'));
    assert.equal(start.disabled, false);
    count.value = '3'; count.dispatchEvent(new win.Event('input'));
    assert.equal(start.disabled, true);
    count.value = '2'; count.dispatchEvent(new win.Event('input'));
    form.dispatchEvent(new win.Event('submit', {cancelable: true}));
    assert.deepEqual(JSON.parse(win.sessionStorage.getItem('qf_mixed_recipe')), {quizIds: ['cardio-w01-a', 'cardio-w05-a'], count: 2});
    win.lockSite();
    assert.equal(win.sessionStorage.getItem('qf_mixed_recipe'), null);
    assert.equal(doc.querySelector('.mixed-builder'), null);
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally { dom.window.close(); }
});
