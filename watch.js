/* ════════════════════════════════════════════════════════════════════════
   QuizForge Watch-along page (watch.html?id=<quiz id>).
   Needs the unlocked passphrase (qf_unlock_pw), like protected quizzes.
   Loads the encrypted watch index, the lecture's encrypted watch payload
   (timing only) and the encrypted quiz, checks that the payload was built
   for exactly this quiz version, then runs a sync clock beside the Echo360
   frame. Gate rules live in watch_logic.js; this file is DOM and storage.
   ════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ── Helpers copied verbatim from quiz.html (tests/watch_page.test.mjs checks) ── */
function _escHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function _composeExplanation(q){
  let e = (typeof q.explanation === 'string') ? q.explanation : '';
  if(q.citation && String(q.citation).trim()){
    e += '<br><em>' + _escHtml(String(q.citation).trim()) + '</em>';
  }
  return e;
}
function sanitizeHtml(rawHtml, context) {
  var ALLOWED = {strong:1,em:1,br:1,table:1,thead:1,tbody:1,tr:1,th:1,td:1,img:1};
  var REMOVE  = {script:1,iframe:1,object:1,embed:1,svg:1};
  function allowedSrc(src) {
    if (/^quizzes\/media\/[A-Za-z0-9._-]+$/.test(src)) return true;
    if (context !== 'pasted') return false;
    var m = src.match(/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+=*)$/);
    if (!m) return false;
    return Math.floor(m[2].length * 3 / 4) <= 2097152; /* 2 MB */
  }
  function walk(node) {
    var i = 0, child, tag, attrs, n, a;
    while (i < node.childNodes.length) {
      child = node.childNodes[i];
      if (child.nodeType === 3) { i++; continue; }
      if (child.nodeType !== 1) { node.removeChild(child); continue; }
      tag = child.tagName.toLowerCase();
      if (REMOVE[tag]) { node.removeChild(child); continue; }
      if (!ALLOWED[tag]) {
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        node.removeChild(child);
        continue;
      }
      attrs = Array.prototype.slice.call(child.attributes);
      for (n = 0; n < attrs.length; n++) {
        a = attrs[n];
        var aName = a.name.toLowerCase();
        if (tag === 'img' && aName === 'alt') continue;
        if (tag === 'img' && aName === 'src' && allowedSrc(a.value)) continue;
        child.removeAttribute(a.name);
      }
      walk(child);
      i++;
    }
  }
  var tpl = document.createElement('template');
  tpl.innerHTML = rawHtml || '';
  walk(tpl.content);
  var div = document.createElement('div');
  div.appendChild(tpl.content.cloneNode(true));
  return div.innerHTML;
}
async function _qfeDeriveKey(passphrase, saltB64, usage) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200000 },
    km, { name: 'AES-GCM', length: 256 }, false, usage || ['decrypt']
  );
}
async function _qfeDecrypt(buf, key) {
  const d = new Uint8Array(buf instanceof ArrayBuffer ? buf : (buf.buffer ? buf.buffer : buf));
  if (d[0] !== 0x51 || d[1] !== 0x46 || d[2] !== 0x45 || d[3] !== 0x31)
    throw new Error('invalid QFE1 magic');
  const iv = d.slice(4, 16), ct = d.slice(16);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
}

(function () {
  const W = window.WatchLogic;
  const $ = id => document.getElementById(id);
  const UNLOCK_PW_KEY = 'qf_unlock_pw';
  const WATCH_INDEX = 'quizzes/protected/watch/index.enc';
  const WATCH_FILE = /^quizzes\/protected\/watch\/[A-Za-z0-9._-]+\.enc$/;
  const PROTECTED_FILE = /^quizzes\/protected\/[A-Za-z0-9._-]+\.enc$/;
  const SAFE_ID = /^[A-Za-z0-9._-]+$/;
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const SAVE_EVERY_MS = 5000;
  const quizId = new URLSearchParams(location.search).get('id') || '';
  const progressKey = 'qf_watch::' + quizId;
  const pageTitle = document.title;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage off */ } }
  };

  const S = {
    ready: false, key: null, sha: '', duration: 0, points: [], questions: [], qIndex: null,
    answers: {}, answered: new Set(), clock: W.createClock(() => performance.now()),
    open: null, timer: null, lastSave: 0, saveWarned: false, media: new Map(), pw: ''
  };

  /* ── Status / lock ──────────────────────────────────────────────────────── */
  function showStatus(text, withLink) {
    const el = $('status');
    el.textContent = text;
    if (withLink) {
      el.appendChild(document.createTextNode(' '));
      const a = document.createElement('a');
      a.href = 'index.html'; a.textContent = 'Back to the library';
      el.appendChild(a);
    }
    el.hidden = false;
    $('app').hidden = true;
  }

  function lock() {
    S.ready = false; S.key = null; S.open = null; S.questions = []; S.qIndex = null;
    clearTimeout(S.timer); S.timer = null;
    S.clock.pause();
    S.media.forEach(url => { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } });
    S.media.clear();
    ['q-text', 'q-opts', 'q-exp', 'missed-list'].forEach(id => { $(id).innerHTML = ''; });
    $('echo').removeAttribute('src');
    document.title = pageTitle;
    showStatus('This page is locked.', true);
  }

  /* ── Loading ────────────────────────────────────────────────────────────── */
  async function fetchDecrypted(path, key) {
    const r = await fetch(path + '?v=' + Date.now());
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return new Uint8Array(await _qfeDecrypt(await r.arrayBuffer(), key));
  }
  const parseJson = bytes => JSON.parse(new TextDecoder().decode(bytes));
  async function sha256Hex(bytes) {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(d, b => b.toString(16).padStart(2, '0')).join('');
  }

  async function load() {
    if (!SAFE_ID.test(quizId)) return showStatus('No lecture was chosen.', true);
    const pw = store.get(UNLOCK_PW_KEY) || '';
    if (!pw) return showStatus('This page is locked. Unlock the library first.', true);
    let index, catalog, payload, quiz, quizBytes;
    try {
      const r = await fetch('quizzes/manifest.json?v=' + Date.now());
      if (!r.ok) throw new Error('manifest HTTP ' + r.status);
      const manifest = await r.json();
      const prot = manifest && manifest.protected;
      if (!prot || !prot.kdf || !prot.kdf.salt || !PROTECTED_FILE.test(prot.manifest || ''))
        throw new Error('protected library is unavailable');
      const key = await _qfeDeriveKey(pw, prot.kdf.salt, ['decrypt']);
      try { index = parseJson(await fetchDecrypted(WATCH_INDEX, key)); }
      catch (e) { if (e.status === 404) index = { watch: [] }; else throw e; }
      const entry = (Array.isArray(index.watch) ? index.watch : []).find(x => x && x.quiz_id === quizId);
      if (!entry || !WATCH_FILE.test(entry.file || ''))
        return showStatus('There is no watch-along for this lecture yet.', true);
      catalog = parseJson(await fetchDecrypted(prot.manifest, key));
      const qEntry = (catalog.sections || []).flatMap(s => (s && s.quizzes) || []).find(q => q && q.id === quizId);
      if (!qEntry || !PROTECTED_FILE.test(qEntry.file || ''))
        return showStatus('This lecture is no longer in the library.', true);
      const [pBytes, qBytes] = await Promise.all([fetchDecrypted(entry.file, key), fetchDecrypted(qEntry.file, key)]);
      payload = parseJson(pBytes); quizBytes = qBytes; quiz = parseJson(qBytes);
      const problem = W.payloadError(payload, quizId);
      if (problem) return showStatus('This watch-along cannot be used (' + problem + ').', true);
      const sha = await sha256Hex(quizBytes);
      const qIndex = sha === payload.quiz_sha256 && quiz && Array.isArray(quiz.questions)
        ? W.resolvePoints(payload.points, quiz.questions) : null;
      if (!qIndex) return showStatus('This watch-along is out of date for the current version of the quiz.', true);
      if (store.get(UNLOCK_PW_KEY) !== pw) return lock();
      Object.assign(S, { key, pw, sha, qIndex, questions: quiz.questions, duration: payload.duration_s,
                         points: W.sortPoints(payload.points) });
      setup(qEntry, payload);
    } catch (e) {
      showStatus('Could not load the watch-along. ' + (e && e.message ? e.message : 'Decrypt failed.'), true);
    }
  }

  /* ── Setup ──────────────────────────────────────────────────────────────── */
  function setup(qEntry, payload) {
    const url = W.echoUrl(payload.echo360_lesson_id);
    $('w-title').textContent = String(qEntry.title || quizId);
    $('w-sub').textContent = S.points.length + ' checkpoints · ' + W.fmtTime(S.duration) + ' lecture';
    $('echo').src = url;
    $('open-echo').href = url;
    $('dur').textContent = ' / ' + W.fmtTime(S.duration);
    const rate = $('rate');
    rate.innerHTML = '';
    W.RATES.forEach(r => {
      const o = document.createElement('option');
      o.value = String(r); o.textContent = r + '×';
      rate.appendChild(o);
    });
    const saved = W.parseProgress(store.get(progressKey), S.sha, S.points);
    S.answers = saved.answers;
    S.answered = W.answeredSet(S.answers);
    S.clock.setRate(saved.rate);
    S.clock.set(W.resumePosition(saved.t, S.duration));
    rate.value = String(S.clock.rate());
    $('status').hidden = true;
    $('app').hidden = false;
    S.ready = true;
    if (saved.t > 0) {
      const at = W.fmtTime(now());
      note('Picked up where you left off, at ' + at + '. Start the clock when Echo360 reaches ' + at + '.');
    }
    renderTicks(); renderScore(); renderMissed();
    tick();
  }

  /* ── Clock ──────────────────────────────────────────────────────────────── */
  const now = () => W.clampTime(S.clock.time(), S.duration);

  function note(text) { $('note').textContent = text || ''; }

  function save() {
    if (!S.ready) return;
    S.lastSave = Date.now();
    const ok = store.set(progressKey, W.serializeProgress(S.sha, now(), S.clock.rate(), S.answers));
    if (!ok && !S.saveWarned) {
      S.saveWarned = true;
      note('This browser is not saving progress (storage is off). Answers last until you leave the page.');
    }
  }

  function updateClock() {
    const t = now(), running = S.clock.running();
    $('clock').textContent = W.fmtTime(t);
    $('strip-fill').style.width = (100 * Math.min(t / S.duration, 1)) + '%';
    const state = $('run-state');
    state.textContent = running ? 'Running ' + S.clock.rate() + '×' : t >= S.duration ? 'Finished' : 'Paused';
    state.classList.toggle('on', running);
    $('play').textContent = running ? 'Pause clock' : 'Start clock';
  }

  /* One timer loop (setTimeout, not requestAnimationFrame, which stops in
     hidden tabs). The time itself comes from performance.now, so a late or
     throttled callback never makes the clock drift; it only delays the check. */
  function tick() {
    clearTimeout(S.timer); S.timer = null;
    if (!S.ready) return;
    if (S.clock.running() && S.clock.time() >= S.duration) {
      S.clock.pause(); S.clock.set(S.duration);
      note('End of the lecture.');
      save();
    }
    updateClock();
    if (gate()) return;
    if (!S.clock.running()) return;
    if (Date.now() - S.lastSave >= SAVE_EVERY_MS) save();
    S.timer = setTimeout(tick, W.nextDelay(S.points, S.answered, now(), S.clock.rate(), S.duration));
  }

  /** Open the card when points are due. Returns true while a card is open. */
  function gate() {
    if (S.open) return true;
    if (!S.ready) return false;
    const due = W.duePointsAt(S.points, S.answered, now(), S.duration);
    if (!due.length) return false;
    const resume = S.clock.running();
    S.clock.pause();
    clearTimeout(S.timer); S.timer = null;
    updateClock();
    save();
    openCard(due, resume);
    return true;
  }

  function seekTo(t) {
    if (!S.ready || S.open) return;
    const target = W.clampTime(t, S.duration);
    S.clock.set(target);
    $('set-err').textContent = '';
    note('Clock set to ' + W.fmtTime(target) + '. Move Echo360 to ' + W.fmtTime(target) + ' too.');
    save();
    tick();
  }

  function togglePlay() {
    if (!S.ready || S.open) return;
    if (S.clock.running()) {
      S.clock.pause();
      note('Clock paused.');
    } else if (now() >= S.duration) {
      note('The lecture is over. Set an earlier time to keep going.');
    } else {
      S.clock.start();
      note('');
    }
    save();
    tick();
  }

  /* ── Question card ──────────────────────────────────────────────────────── */
  const CONTROLS = ['play', 'back10', 'fwd10', 'rate', 'set-input', 'reset'];
  function setControlsDisabled(off) {
    CONTROLS.forEach(id => { $(id).disabled = off; });
    $('set-form').querySelector('button').disabled = off;
    $('strip').querySelectorAll('.tick').forEach(b => { b.disabled = off; });
    $('missed-list').querySelectorAll('button').forEach(b => { b.disabled = off; });
  }

  function currentQuestion() {
    const p = S.open.queue[S.open.i];
    return { p, q: S.questions[S.qIndex.get(p.qid)] };
  }

  function openCard(queue, resume) {
    S.open = { queue, i: 0, choice: null, submitted: false, resume };
    setControlsDisabled(true);
    $('card').hidden = false;
    document.title = 'Pause Echo360 · Watch-along';
    renderQuestion();
    const card = $('card');
    if (card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
    $('q-text').focus({ preventScroll: true });
  }

  function renderQuestion() {
    const { p, q } = currentQuestion();
    const n = S.open.queue.length;
    $('q-kicker').textContent = (n > 1 ? 'Question ' + (S.open.i + 1) + ' of ' + n : 'Checkpoint') +
      ' · ' + (p.topic_label || 'Topic') + ' · ' + W.fmtTime(p.pause_at_s);
    $('q-text').innerHTML = sanitizeHtml(q.text, 'shipped');
    decryptMedia($('q-text'));
    const opts = $('q-opts');
    opts.innerHTML = '';
    q.options.forEach((text, k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt'; b.dataset.k = String(k);
      const key = document.createElement('span'); key.className = 'k'; key.textContent = LETTERS[k] || String(k + 1);
      const label = document.createElement('span'); label.className = 't'; label.textContent = String(text);
      b.append(key, label);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => choose(k));
      opts.appendChild(b);
    });
    $('q-result').hidden = true;
    $('q-exp').innerHTML = '';
    $('q-submit').hidden = false; $('q-submit').disabled = true;
    $('q-continue').hidden = true;
  }

  function choose(k) {
    const o = S.open;
    if (!o || o.submitted) return;
    const { q } = currentQuestion();
    if (!(k >= 0 && k < q.options.length)) return;
    o.choice = k;
    $('q-opts').querySelectorAll('.opt').forEach(b => {
      const on = Number(b.dataset.k) === k;
      b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on));
    });
    $('q-submit').disabled = false;
  }

  function submitAnswer() {
    const o = S.open;
    if (!o || o.submitted || o.choice === null) return;
    o.submitted = true;
    const { p, q } = currentQuestion();
    const correct = o.choice === q.correct;
    S.answers = W.recordAnswer(S.answers, p.qid, o.choice, correct);
    S.answered = W.answeredSet(S.answers);
    save();
    $('q-opts').querySelectorAll('.opt').forEach(b => {
      const k = Number(b.dataset.k);
      b.disabled = true;
      b.classList.remove('sel');
      b.classList.toggle('right', k === q.correct);
      b.classList.toggle('wrong', k === o.choice && !correct);
    });
    $('q-verdict').textContent = correct ? 'Correct' : 'Not quite';
    $('q-verdict').className = 'verdict ' + (correct ? 'right' : 'wrong');
    $('q-exp').innerHTML = sanitizeHtml(_composeExplanation(q), 'shipped');
    decryptMedia($('q-exp'));
    $('q-result').hidden = false;
    $('q-submit').hidden = true;
    const last = o.i + 1 >= o.queue.length;
    $('q-continue').textContent = last && o.resume ? 'Continue (restarts the clock)' : last ? 'Done' : 'Next question';
    $('q-continue').hidden = false;
    $('q-continue').focus({ preventScroll: true });
    renderTicks(); renderScore(); renderMissed();
  }

  function continueOn() {
    const o = S.open;
    if (!o || !o.submitted) return;
    if (++o.i < o.queue.length) {
      o.choice = null; o.submitted = false;
      renderQuestion();
      $('q-text').focus({ preventScroll: true });
      return;
    }
    S.open = null;
    $('card').hidden = true;
    document.title = pageTitle;
    setControlsDisabled(false);
    if (o.resume && now() < S.duration) {
      S.clock.start();
      note('Clock running. Press play in Echo360 now.');
    }
    save();
    tick();
    $('play').focus({ preventScroll: true });
  }

  /* Protected media: quizzes/media/<name> -> decrypt quizzes/protected/media/<name>.enc
     into a blob URL (same paths and approach as quiz.html). */
  async function decryptMedia(container) {
    const key = S.key;
    if (!key) return;
    for (const img of container.querySelectorAll('img[src^="quizzes/media/"]')) {
      const name = img.getAttribute('src').slice('quizzes/media/'.length);
      try {
        let url = S.media.get(name);
        if (!url) {
          const plain = await fetchDecrypted('quizzes/protected/media/' + encodeURIComponent(name) + '.enc', key);
          if (S.key !== key) return;
          url = URL.createObjectURL(new Blob([plain]));
          S.media.set(name, url);
        }
        img.src = url;
      } catch (e) { /* a broken image is acceptable; the question still works */ }
    }
  }

  /* ── Strip, score, missed list ──────────────────────────────────────────── */
  const STATE_WORD = { unanswered: 'to come', right: 'correct', missed: 'missed' };

  function renderTicks() {
    const strip = $('strip');
    strip.querySelectorAll('.tick').forEach(t => t.remove());
    S.points.forEach(p => {
      const state = W.pointState(p, S.answers);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tick' + (state === 'unanswered' ? '' : ' ' + state);
      b.style.left = (100 * Math.min(p.pause_at_s / S.duration, 1)) + '%';
      b.title = (p.topic_label || 'Topic') + ' · ' + W.fmtTime(p.pause_at_s) + ' · ' + STATE_WORD[state] +
        '. Click to replay this topic from ' + W.fmtTime(p.topic_start_s) + '.';
      b.setAttribute('aria-label', b.title);
      b.disabled = !!S.open;
      b.addEventListener('click', e => { e.stopPropagation(); seekTo(p.topic_start_s); });
      strip.appendChild(b);
    });
  }

  function renderScore() {
    const s = W.scoreOf(S.points, S.answers);
    $('score').textContent = s.answered + ' of ' + s.total + ' answered · ' + s.correct + ' correct';
  }

  function plainText(html) {
    const t = document.createElement('template');
    t.innerHTML = sanitizeHtml(html, 'shipped');
    return (t.content.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function renderMissed() {
    const list = $('missed-list');
    list.innerHTML = '';
    const missed = W.missedPoints(S.points, S.answers);
    $('missed').hidden = !missed.length;
    missed.forEach(p => {
      const text = plainText(S.questions[S.qIndex.get(p.qid)].text);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'linklike';
      b.textContent = W.fmtTime(p.pause_at_s) + ' · ' + (p.topic_label || 'Topic') + ' · ' +
        (text.length > 90 ? text.slice(0, 90) + '…' : text);
      b.title = 'Replay this topic from ' + W.fmtTime(p.topic_start_s);
      b.disabled = !!S.open;
      b.addEventListener('click', () => {
        seekTo(p.topic_start_s);
        $('ctl').scrollIntoView({ block: 'nearest' });
      });
      const li = document.createElement('li');
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  /* ── Events ─────────────────────────────────────────────────────────────── */
  $('play').addEventListener('click', togglePlay);
  $('back10').addEventListener('click', () => seekTo(now() - 10));
  $('fwd10').addEventListener('click', () => seekTo(now() + 10));
  $('rate').addEventListener('change', e => {
    if (!S.ready) return;
    S.clock.setRate(Number(e.target.value));
    e.target.value = String(S.clock.rate());
    save(); tick();
  });
  $('set-form').addEventListener('submit', e => {
    e.preventDefault();
    const t = W.parseTime($('set-input').value);
    if (t === null) { $('set-err').textContent = 'Use mm:ss or h:mm:ss, for example 12:30.'; return; }
    $('set-input').value = '';
    seekTo(t);
  });
  $('strip').addEventListener('click', e => {
    if (!S.ready || S.open || e.target.classList.contains('tick')) return;
    const r = $('strip').getBoundingClientRect();
    if (r.width > 0) seekTo(((e.clientX - r.left) / r.width) * S.duration);
  });
  $('reset').addEventListener('click', () => {
    if (!S.ready || S.open) return;
    if (!window.confirm('Clear your answers and clock position for this lecture?')) return;
    store.del(progressKey);
    S.answers = {}; S.answered = new Set();
    S.clock.pause(); S.clock.set(0);
    renderTicks(); renderScore(); renderMissed();
    note('Cleared. Start from 0:00.');
    save(); tick();
  });
  $('q-submit').addEventListener('click', submitAnswer);
  $('q-continue').addEventListener('click', continueOn);

  const TYPING = /^(INPUT|SELECT|TEXTAREA)$/;
  document.addEventListener('keydown', e => {
    if (!S.ready || e.metaKey || e.ctrlKey || e.altKey) return;
    if (S.open) {
      const { q } = currentQuestion();
      const a = W.cardKeyAction(e.key, e.repeat, S.open.submitted, q.options.length);
      if (!a) return;
      e.preventDefault();
      const opt = e.target.closest ? e.target.closest('.opt') : null;
      if (a.type === 'submit' && opt && !e.repeat && S.open.choice !== Number(opt.dataset.k)) {
        choose(Number(opt.dataset.k));       // Enter on a focused choice picks it first
        return;
      }
      if (a.type === 'choose') choose(a.index);
      else if (a.type === 'submit') submitAnswer();
      else if (a.type === 'continue') continueOn();
      return;
    }
    if (e.key !== ' ' || TYPING.test(e.target.tagName || '') || e.target.isContentEditable) return;
    e.preventDefault();                      // also stops a focused button's own Space click
    if (!e.repeat) togglePlay();
  });
  document.addEventListener('keyup', e => {
    if (e.key === ' ' && S.ready && !TYPING.test(e.target.tagName || '')) e.preventDefault();
  });

  window.addEventListener('storage', e => {
    if (S.ready && (e.key === null || (e.key === UNLOCK_PW_KEY && e.newValue !== S.pw))) lock();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
    else tick();                              // catch up on a checkpoint missed while hidden
  });
  window.addEventListener('pagehide', () => {
    save();
    S.media.forEach(url => { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } });
    S.media.clear();                          // a page restored from cache decrypts again
  });

  load();
})();
