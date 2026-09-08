import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../quiz.html', import.meta.url), 'utf8');
const pw = 'mixed-test-fixture-only';
const salt = Buffer.alloc(16, 42).toString('base64');
const publicManifest = {schema_version: 1, sections: [], protected: {manifest: 'quizzes/protected/manifest.enc', kdf: {salt}}};
const banks = [3, 10, 10].map((count, i) => ({
  id: 'cardio-w01-' + String.fromCharCode(97 + i), revision: 1, title: 'Lecture ' + String.fromCharCode(65 + i),
  questions: Array.from({length: count}, (_, q) => ({
    qid: 'Q' + q, text: 'Practice ' + String.fromCharCode(65 + i) + (q + 1) + ': choose Alpha.',
    options: ['Alpha', 'Beta', 'Gamma'], correct: 0,
    explanation: '<strong>Alpha</strong> is correct.<img src="quizzes/media/fixture.png" alt="Fixture image">', citation: 'Synthetic fixture'
  }))
}));
const catalog = {sections: [{id: 'week-01', name: 'Week 01', quizzes: banks.map(b => ({
  id: b.id, title: b.title, revision: b.revision, file: 'quizzes/protected/' + b.id + '.enc', question_count: b.questions.length
}))}]};
const recipe = {quizIds: banks.map(b => b.id), count: 20};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
const keyMaterial = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
const key = await webcrypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(salt, 'base64'), iterations: 200000}, keyMaterial, {name: 'AES-GCM', length: 256}, false, ['encrypt']);
async function encrypt(data) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
  const cipher = await webcrypto.subtle.encrypt({name: 'AES-GCM', iv}, key, bytes);
  return Buffer.concat([Buffer.from('QFE1'), iv, Buffer.from(cipher)]);
}
const files = new Map([
  ['quizzes/manifest.json', Buffer.from(JSON.stringify(publicManifest))],
  ['quizzes/protected/manifest.enc', await encrypt(catalog)],
  ['quizzes/protected/media/fixture.png.enc', await encrypt(png)]
]);
for(const b of banks) files.set('quizzes/protected/' + b.id + '.enc', await encrypt(b));

// Optional fixture export is only for a local browser preview; no real course data.
if(process.argv[2] === '--write-preview-fixtures') {
  assert.ok(process.argv[3], 'provide the local preview directory');
  for(const [path, bytes] of files) {
    const target = resolve(process.argv[3], path); mkdirSync(dirname(target), {recursive: true}); writeFileSync(target, bytes);
  }
  console.log('Wrote synthetic encrypted preview fixtures.');
  process.exit(0);
}

async function waitFor(fn) {
  const end = Date.now() + 3000;
  while(!fn()) { if(Date.now() > end) throw new Error('Page did not settle within 3 seconds'); await new Promise(r => setTimeout(r, 10)); }
}
function page(t, {search = '?mixed=1', password = pw, savedRecipe = recipe, override = new Map(), intercept} = {}) {
  const requests = [], errors = [], revoked = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if(!e.message.includes('CSS stylesheet')) errors.push(e.message); });
  const dom = new JSDOM(html, {url: 'http://localhost:4610/quiz.html' + search, runScripts: 'dangerously', virtualConsole: vc, beforeParse(win) {
    win.anime = null; win.matchMedia = () => ({matches: false, addEventListener() {}});
    win.TextEncoder = TextEncoder; win.TextDecoder = TextDecoder;
    Object.defineProperty(win, 'crypto', {value: webcrypto});
    win.URL.createObjectURL = () => 'blob:fixture'; win.URL.revokeObjectURL = url => revoked.push(url);
    if(password) win.localStorage.setItem('qf_unlock_pw', password);
    win.localStorage.setItem('qf_shipped_attempts', '[{"quizId":"existing","score":1}]');
    win.localStorage.setItem('qf_scores', '[{"quizId":"custom","score":1}]');
    if(savedRecipe !== null) win.sessionStorage.setItem('qf_mixed_recipe', typeof savedRecipe === 'string' ? savedRecipe : JSON.stringify(savedRecipe));
    win.fetch = async url => {
      const path = String(url).split('?')[0]; requests.push(path);
      if(intercept) await intercept(path, win);
      const bytes = override.has(path) ? override.get(path) : files.get(path);
      return {ok: !!bytes, status: bytes ? 200 : 404, json: async () => JSON.parse(bytes.toString()), arrayBuffer: async () => Uint8Array.from(bytes).buffer};
    };
  }});
  t.after(() => { dom.window.close(); assert.deepEqual(errors, [], 'no JavaScript errors'); });
  return {win: dom.window, doc: dom.window.document, requests, revoked};
}
function counts(items) { return Object.values(items.reduce((m, q) => { m[q.source.quizId] = (m[q.source.quizId] || 0) + 1; return m; }, {})).sort((a,b) => a-b); }

test('balanced sampler uses exact counts, redistributes shortages, and preserves sources', t => {
  const {win} = page(t, {search: '', password: ''});
  const before = JSON.stringify(banks);
  const equal = banks.map(b => ({...b, questions: banks[1].questions}));
  assert.deepEqual(counts(win.sampleMixedQuestions(equal, 20, () => 0.5)), [6, 7, 7]);
  assert.deepEqual(counts(win.sampleMixedQuestions(banks, 20, () => 0.5)), [3, 8, 9]);
  const few = win.sampleMixedQuestions(banks, 2, () => 0.5);
  assert.equal(few.length, 2); assert.deepEqual(counts(few), [1, 1]);
  const all = win.sampleMixedQuestions(banks, 23, () => 0.5);
  assert.equal(new Set(all.map(q => q.source.quizId + ':' + q.source.qid)).size, 23);
  assert.equal(JSON.stringify(banks), before);
  all[0].options.push('New'); assert.equal(JSON.stringify(banks), before);
  assert.throws(() => win.sampleMixedQuestions(banks, 24), /Only 23/);
  for(const n of [0, -1, 1.5, NaN]) assert.throws(() => win.sampleMixedQuestions(banks, n), /positive whole/);
});

test('sampler deduplicates source IDs and retains revision/index fallback', t => {
  const {win} = page(t, {search: '', password: ''});
  const legacy = {id: 'legacy', revision: 2, title: 'Legacy', questions: [{...banks[0].questions[0], qid: undefined}]};
  const duplicated = {...banks[0], questions: [...banks[0].questions, banks[0].questions[0]]};
  const result = win.sampleMixedQuestions([duplicated, duplicated, legacy], 4, () => 0.5);
  assert.equal(result.length, 4);
  const source = result.find(q => q.source.quizId === 'legacy').source;
  assert.equal(source.qid, null); assert.equal(source.index, 0); assert.equal(source.revision, 2);
  assert.throws(() => win.sampleMixedQuestions([duplicated, duplicated], 4), /Only 3/);
});

for(const [name, opts, text] of [
  ['locked', {password: ''}, /locked/],
  ['wrong passphrase', {password: 'incorrect-fixture-only'}, /Could not start/],
  ['missing recipe', {savedRecipe: null}, /Choose lectures/],
  ['malformed recipe', {savedRecipe: '{'}, /Choose lectures/],
  ['invalid count', {savedRecipe: {...recipe, count: 1.5}}, /Choose lectures/],
  ['unknown lecture', {savedRecipe: {quizIds: ['not-in-manifest'], count: 1}}, /unavailable/],
  ['too many questions', {savedRecipe: {...recipe, count: 24}}, /Only 23/]
]) test(name + ' cannot start a mixed test', async t => {
  const {doc, requests} = page(t, opts);
  await waitFor(() => doc.querySelector('.empty-state'));
  assert.match(doc.querySelector('.empty-state').textContent, text);
  assert.equal(doc.querySelectorAll('.choice-row').length, 0);
  if(name !== 'too many questions') assert.ok(!requests.some(p => /cardio.*\.enc$/.test(p)));
});

test('real encrypted mix renders media, scores/reviews, keeps provenance, and never saves attempts/plaintext', async t => {
  const {win, doc, requests} = page(t, {savedRecipe: {...recipe, quizIds: [...recipe.quizIds, recipe.quizIds[0]]}});
  await waitFor(() => doc.querySelectorAll('.choice-row').length === 3);
  assert.match(doc.getElementById('ef-count').textContent, /OF 20/);
  for(const b of banks) assert.equal(requests.filter(p => p === 'quizzes/protected/' + b.id + '.enc').length, 1);
  for(let i = 0; i < 20; i++) { win.chooseAnswer(0); if(i < 19) win.navigate(1); }
  win.submitExam();
  assert.match(doc.getElementById('score-banner').textContent, /20\s*\/\s*20/);
  assert.match(doc.getElementById('exp-text').textContent, /Lecture: Lecture [ABC]/);
  assert.match(doc.getElementById('exp-text').textContent, /Synthetic fixture/);
  await waitFor(() => doc.querySelector('#exp-text img')?.getAttribute('src') === 'blob:fixture');
  assert.equal(win.localStorage.getItem('qf_shipped_attempts'), '[{"quizId":"existing","score":1}]');
  assert.equal(win.localStorage.getItem('qf_scores'), '[{"quizId":"custom","score":1}]');
  assert.equal(doc.getElementById('qhub-toast').textContent, '');
  for(const storage of [win.localStorage, win.sessionStorage]) for(let i=0;i<storage.length;i++) assert.doesNotMatch(storage.getItem(storage.key(i)), /Practice|Alpha|explanation/);
});

test('failed source fetch produces an error without partial questions or retries', async t => {
  const path = 'quizzes/protected/' + banks[1].id + '.enc';
  const {doc, requests} = page(t, {override: new Map([[path, null]])});
  await waitFor(() => doc.querySelector('.empty-state'));
  assert.match(doc.querySelector('.empty-state').textContent, /HTTP 404/);
  assert.equal(doc.querySelectorAll('.choice-row').length, 0);
  assert.equal(requests.filter(p => p === path).length, 1);
});

test('manifest paths and payload identities are checked', async t => {
  const unsafe = structuredClone(catalog); unsafe.sections[0].quizzes[0].file = 'https://example.com/quiz.enc';
  const {doc, requests} = page(t, {override: new Map([['quizzes/protected/manifest.enc', await encrypt(unsafe)]])});
  await waitFor(() => doc.querySelector('.empty-state'));
  assert.match(doc.querySelector('.empty-state').textContent, /Invalid protected quiz path/);
  assert.ok(!requests.some(p => p.includes('example.com')));
  const mismatch = {...banks[0], id: 'wrong-id'};
  const second = page(t, {override: new Map([['quizzes/protected/' + banks[0].id + '.enc', await encrypt(mismatch)]])});
  await waitFor(() => second.doc.querySelector('.empty-state'));
  assert.match(second.doc.querySelector('.empty-state').textContent, /invalid question data/);
});

test('cross-tab lock clears a running mix, recipe, and media', async t => {
  const {win, doc, revoked} = page(t);
  await waitFor(() => doc.querySelectorAll('.choice-row').length === 3);
  win.submitExam();
  await waitFor(() => doc.querySelector('#exp-text img')?.getAttribute('src') === 'blob:fixture');
  win.localStorage.removeItem('qf_unlock_pw');
  win.dispatchEvent(new win.StorageEvent('storage', {key: 'qf_unlock_pw', oldValue: pw, newValue: null}));
  assert.match(doc.querySelector('.empty-state').textContent, /locked/);
  assert.doesNotMatch(doc.getElementById('body-layout').textContent, /Practice|Alpha/);
  assert.equal(win.sessionStorage.getItem('qf_mixed_recipe'), null);
  assert.ok(revoked.includes('blob:fixture'));
  assert.equal(win.eval('questions.length'), 0);
});

test('lock during loading cannot reveal a late decrypted mix', async t => {
  let locked = false;
  const {doc} = page(t, {intercept: async (path, win) => {
    if(!locked && path.endsWith(banks[0].id + '.enc')) {
      locked = true; win.localStorage.removeItem('qf_unlock_pw');
      win.dispatchEvent(new win.StorageEvent('storage', {key: 'qf_unlock_pw', oldValue: pw, newValue: null}));
    }
  }});
  await waitFor(() => locked);
  await new Promise(r => setTimeout(r, 80));
  assert.match(doc.querySelector('.empty-state').textContent, /locked/);
  assert.equal(doc.querySelectorAll('.choice-row').length, 0);
});
