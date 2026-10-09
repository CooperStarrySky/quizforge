/* Run with: node --test tests/watch_page.test.mjs  (jsdom; synthetic fixture and test-only key) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto, createHash } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const PAGE = read('watch.html')
  .replace('<script src="watch_logic.js"></script>', () => '<script>' + read('watch_logic.js') + '</script>')
  .replace('<script src="watch.js"></script>', () => '<script>' + read('watch.js') + '</script>');
const PW = 'synthetic-test-only';
const SALT = Buffer.from('0123456789abcdef').toString('base64');
const LESSON = '0a1b2c3d-0000-4000-8000-00000000abcd';
const ID = 'demo-w01-fixture';
const key = await (async () => {
  const km = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(PW), 'PBKDF2', false, ['deriveKey']);
  return webcrypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(SALT, 'base64'), iterations: 200000 },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
})();
async function enc(bytes) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return Buffer.concat([Buffer.from('QFE1'), Buffer.from(iv), Buffer.from(ct)]);
}
const q = (qid, text, correct) => ({ qid, text, options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correct,
  explanation: 'Because.<br><strong>Key</strong>', citation: 'Slide 1' });
const quiz = { id: ID, revision: 1, questions: [
  q('q-one', 'First <script>window.__pwned = 1</script><img src="x" onerror="window.__pwned = 2">stem?', 1),
  q('q-two', 'Second stem?', 0), q('q-three', 'Third stem?', 2)] };
const quizBytes = Buffer.from(JSON.stringify(quiz));
const payload = (sha) => ({ schema: 1, quiz_id: ID, quiz_revision: 1, quiz_sha256: sha,
  echo360_lesson_id: LESSON, duration_s: 600, points: [
    { qid: 'q-one', pause_at_s: 100, topic_start_s: 0, topic_label: 'Slides 1-3' },
    { qid: 'q-two', pause_at_s: 200, topic_start_s: 100, topic_label: 'Slides 4-6' },
    { qid: 'q-three', pause_at_s: 600, topic_start_s: 200, topic_label: 'Slides 7-9' }] });
const json = o => Buffer.from(JSON.stringify(o));
const SHA = createHash('sha256').update(quizBytes).digest('hex');
async function site(sha = SHA) {
  return {
    'quizzes/manifest.json': json({ schema_version: 1, sections: [],
      protected: { manifest: 'quizzes/protected/manifest.enc', kdf: { salt: SALT, iterations: 200000 } } }),
    'quizzes/protected/manifest.enc': await enc(json({ sections: [{ id: 'week-01', name: 'Week 01', quizzes: [
      { id: ID, title: 'Fixture lecture', file: 'quizzes/protected/' + ID + '.r1.enc', revision: 1, question_count: 3 }] }] })),
    ['quizzes/protected/' + ID + '.r1.enc']: await enc(quizBytes),
    'quizzes/protected/watch/index.enc': await enc(json({ schema: 1, watch: [
      { quiz_id: ID, file: 'quizzes/protected/watch/' + ID + '.enc', quiz_revision: 1, point_count: 3 }] })),
    ['quizzes/protected/watch/' + ID + '.enc']: await enc(json(payload(sha))),
  };
}

async function open({ files, storage = {}, id = ID } = {}) {
  files = files || await site();
  const errors = [], clock = { ms: 0 };
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', e => { if (!e.message.includes('CSS stylesheet')) errors.push(e.message); });
  const dom = new JSDOM(PAGE, {
    url: 'http://localhost:4620/watch.html?id=' + id, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(win) {
      Object.defineProperty(win, 'crypto', { value: webcrypto, configurable: true });
      Object.defineProperty(win.performance, 'now', { value: () => clock.ms, configurable: true });
      win.TextDecoder = TextDecoder; win.TextEncoder = TextEncoder;
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.confirm = () => true;
      win.fetch = async url => {
        const path = String(url).replace(/^http:\/\/localhost:4620\//, '').replace(/\?.*$/, '');
        const body = files[path];
        if (!body) return { ok: false, status: 404 };
        return { ok: true, status: 200, json: async () => JSON.parse(body.toString()),
                 arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
      };
      Object.entries(storage).forEach(([k, v]) => win.localStorage.setItem(k, v));
    }
  });
  const doc = dom.window.document;
  for (let i = 0; i < 100 && doc.getElementById('app').hidden &&
       /Loading/.test(doc.getElementById('status').textContent); i++) await new Promise(r => setTimeout(r, 20));
  const $ = id => doc.getElementById(id);
  const press = (k, extra = {}) => doc.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
  const advance = s => { clock.ms += s * 1000; doc.dispatchEvent(new dom.window.Event('visibilitychange')); };
  return { dom, win: dom.window, doc, $, press, advance, errors };
}

test('locked without the passphrase: nothing decrypted, no Echo360 frame', async () => {
  const p = await open();
  assert.match(p.$('status').textContent, /locked/);
  assert.equal(p.$('app').hidden, true);
  assert.equal(p.$('echo').getAttribute('src'), null);
  assert.deepEqual(p.errors, []);
});

test('full flow: pause at a point, answer, continue, seek past points, rewind, resume', async () => {
  const p = await open({ storage: { qf_unlock_pw: PW } });
  const { $, press, advance, doc, win } = p;
  assert.equal($('app').hidden, false, $('status').textContent);
  assert.equal($('w-title').textContent, 'Fixture lecture');
  assert.equal($('echo').src, 'https://echo360.org/lesson/' + LESSON + '/classroom');
  assert.equal($('open-echo').href, $('echo').src);
  assert.equal($('open-echo').rel, 'noopener noreferrer');
  assert.equal($('strip').querySelectorAll('.tick').length, 3);
  assert.equal($('card').hidden, true);

  press(' ');                                     // start the clock
  assert.equal($('play').textContent, 'Pause clock');
  press(' ', { repeat: true });                   // held key ignored
  assert.equal($('play').textContent, 'Pause clock');
  advance(99.5);
  assert.equal($('card').hidden, true);
  advance(1);                                     // past 100 s
  assert.equal($('card').hidden, false);
  assert.equal(doc.title, 'Pause Echo360 · Watch-along');
  assert.match($('q-kicker').textContent, /Checkpoint · Slides 1-3 · 1:40/);
  assert.equal($('q-text').querySelector('script'), null);
  assert.equal($('q-text').querySelector('img').getAttribute('onerror'), null);
  assert.equal(win.__pwned, undefined);
  assert.equal($('play').disabled, true);
  advance(30);                                    // clock is stopped while the card is open
  assert.equal($('clock').textContent, '1:40');
  press(' ');                                     // space does not restart the clock
  assert.equal($('run-state').textContent, 'Paused');

  press('1'); press('Enter');                     // wrong answer (correct is B)
  assert.equal($('q-verdict').textContent, 'Not quite');
  assert.match($('q-exp').innerHTML, /<strong>Key<\/strong>/);
  assert.match($('q-exp').textContent, /Slide 1/);
  press('2');                                     // cannot change a submitted answer
  assert.equal($('q-opts').querySelector('.wrong').dataset.k, '0');
  press('Enter', { repeat: true });               // held Enter does not continue
  assert.equal($('card').hidden, false);
  press('Enter');
  assert.equal($('card').hidden, true);
  assert.equal($('run-state').textContent, 'Running 1×');
  const saved = JSON.parse(win.localStorage.getItem('qf_watch::' + ID));
  assert.deepEqual(saved.answers, { 'q-one': { choice: 0, correct: false } });
  assert.equal($('missed').hidden, false);
  assert.match($('missed-list').textContent, /1:40 · Slides 1-3 · First stem\?/);

  $('set-input').value = '12:00';                 // forward past both remaining points
  $('set-form').dispatchEvent(new win.Event('submit', { cancelable: true }));
  assert.equal($('clock').textContent, '10:00', 'clamped to the lecture length');
  assert.match($('q-kicker').textContent, /^Question 1 of 2 · Slides 4-6/);
  press('1'); press('Enter'); press('Enter');
  assert.match($('q-kicker').textContent, /^Question 2 of 2 · Slides 7-9/);
  press('3'); press('Enter');
  assert.equal($('q-continue').textContent, 'Done');
  press('Enter');
  assert.equal($('run-state').textContent, 'Finished');
  assert.equal($('score').textContent, '3 of 3 answered · 2 correct');
  assert.deepEqual([...$('strip').querySelectorAll('.tick')].map(t => t.className),
    ['tick missed', 'tick right', 'tick right']);

  $('missed-list').querySelector('button').click();   // review: back to the topic start, nothing re-asked
  assert.equal($('clock').textContent, '0:00');
  press(' '); advance(250);
  assert.equal($('card').hidden, true);
  press(' ');
  assert.equal($('clock').textContent, '4:10');
  $('back10').click();
  assert.equal($('clock').textContent, '4:00');
  assert.deepEqual(p.errors, []);

  const again = await open({ storage: { qf_unlock_pw: PW, ['qf_watch::' + ID]: win.localStorage.getItem('qf_watch::' + ID) } });
  assert.equal(again.$('clock').textContent, '4:00');
  assert.equal(again.$('run-state').textContent, 'Paused');
  assert.equal(again.$('score').textContent, '3 of 3 answered · 2 correct');
  assert.match(again.$('note').textContent, /Picked up where you left off, at 4:00/);
  assert.equal(again.$('card').hidden, true);
});

test('refuses a payload built for a different quiz version, or a lecture without one', async () => {
  const stale = await open({ files: await site('f'.repeat(64)), storage: { qf_unlock_pw: PW } });
  assert.match(stale.$('status').textContent, /out of date/);
  assert.equal(stale.$('echo').getAttribute('src'), null);
  const none = await open({ storage: { qf_unlock_pw: PW }, id: 'demo-w09-other' });
  assert.match(none.$('status').textContent, /no watch-along for this lecture/);
  const wrong = await open({ storage: { qf_unlock_pw: 'not-the-phrase' } });
  assert.match(wrong.$('status').textContent, /Could not load/);
  assert.equal(wrong.$('app').hidden, true);
});

test('locking in another tab clears the page', async () => {
  const p = await open({ storage: { qf_unlock_pw: PW } });
  p.win.dispatchEvent(new p.win.StorageEvent('storage', { key: 'qf_unlock_pw', oldValue: PW, newValue: null }));
  assert.equal(p.$('app').hidden, true);
  assert.match(p.$('status').textContent, /locked/);
  assert.equal(p.$('echo').getAttribute('src'), null);
});

test('works with storage that throws on write, and Start over clears answers', async () => {
  const p = await open({ storage: { qf_unlock_pw: PW } });
  p.win.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
  p.press(' '); p.advance(101);
  const opts = p.$('q-opts').querySelectorAll('.opt');
  opts[1].focus();
  opts[1].dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(opts[1].classList.contains('sel'), true, 'Enter on a focused choice picks it');
  p.press('Enter');
  assert.equal(p.$('q-verdict').textContent, 'Correct');
  assert.match(p.$('note').textContent, /not saving progress/);
  p.press('Enter');
  p.$('reset').click();
  assert.equal(p.$('score').textContent, '0 of 3 answered · 0 correct');
  assert.equal(p.$('clock').textContent, '0:00');
  assert.deepEqual(p.errors, []);
});

test('helpers copied from quiz.html stay identical', () => {
  const quizHtml = read('quiz.html'), watchJs = read('watch.js');
  const grab = (src, start, end) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf(end, i) + end.length); };
  for (const [start, end] of [
    ['function _escHtml(s){', '\n}\n'], ['function _composeExplanation(q){', '\n}\n'],
    ['function sanitizeHtml(rawHtml, context) {', '\n}\n'],
    ['async function _qfeDeriveKey(passphrase, saltB64, usage) {', '\n}\n'],
    ['async function _qfeDecrypt(buf, key) {', '\n}\n']])
    assert.equal(grab(watchJs, start, end), grab(quizHtml, start, end), start);
});

test('library shows Watch-along only on unlocked lectures listed in the watch index', async () => {
  const html = read('index.html');
  const entry = id => ({ id, title: id, file: `quizzes/protected/${id}.r1.enc`, question_count: 1 });
  const dom = new JSDOM(html, { url: 'http://localhost:4620/', runScripts: 'dangerously',
    beforeParse(win) {
      win.matchMedia = () => ({ matches: false, addEventListener() {} });
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.fetch = async () => ({ ok: true, json: async () => ({ schema_version: 1,
        sections: [{ id: 'demo', name: 'Demo', quizzes: [{ id: 'demo', title: 'Demo', file: 'quizzes/Demo/demo.r1.json', question_count: 1 }] }],
        protected: { manifest: 'quizzes/protected/manifest.enc', kdf: { salt: 'test-only' } } }) });
    } });
  const win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 30));
  assert.equal(doc.querySelectorAll('.take-watch').length, 0);
  win.localStorage.setItem('qf_unlock_pw', 'synthetic-test-only');
  win._fetchProtectedManifest = async () => ({ sections: [{ id: 'week-01', name: 'Week 01',
    quizzes: [entry('demo-w01-a'), entry('demo-w01-b')] }] });
  win._fetchWatchIds = async () => new Set(['demo-w01-b', 'demo']);
  win.loadManifest();
  await new Promise(r => setTimeout(r, 30));
  const links = [...doc.querySelectorAll('a.take-watch')];
  assert.deepEqual(links.map(a => a.closest('[data-shipped-id]').dataset.shippedId), ['demo-w01-b']);
  assert.equal(new URL(links[0].href).pathname + new URL(links[0].href).search, '/watch.html?id=demo-w01-b');
  win.lockSite();
  await new Promise(r => setTimeout(r, 30));
  assert.equal(doc.querySelectorAll('.take-watch').length, 0);
});
