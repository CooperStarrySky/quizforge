/* ════════════════════════════════════════════════════════════════════════
   QuizForge Watch-along — pure logic (no DOM, no storage, no network).
   Shared by watch.js and tests/watch_logic.test.mjs.

   The page cannot read or control the Echo360 player, so it runs its own
   clock that the student keeps in step with the video. One rule drives the
   questions: a point is DUE when it is unanswered and its pause time is at or
   before the clock. That covers normal running, forward jumps and resuming.
   Answered points are never due, so rewinding never re-asks. At the end of
   the lecture every unanswered point is due (some pause times equal the
   duration). Points are keyed by the quiz question's stable qid.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const LESSON_ID = /^[A-Za-z0-9-]{8,64}$/;
  const RATES = [1, 1.25, 1.5, 1.75, 2];
  const END_SLACK_S = 0.5;
  const TICK_MS = 250;

  function sortPoints(points) {
    return (points || []).slice().sort((a, b) => a.pause_at_s - b.pause_at_s);
  }

  /** Unanswered points with pause_at_s <= t, in time order. `answered` has has(qid). */
  function duePoints(points, answered, t) {
    return sortPoints(points).filter(p => !answered.has(p.qid) && p.pause_at_s <= t);
  }

  function atEnd(t, duration) {
    return Number.isFinite(duration) && duration > 0 && t >= duration - END_SLACK_S;
  }

  /** duePoints, except that at the end of the lecture every unanswered point is due. */
  function duePointsAt(points, answered, t, duration) {
    if (!atEnd(t, duration)) return duePoints(points, answered, t);
    return sortPoints(points).filter(p => !answered.has(p.qid));
  }

  /** First unanswered point strictly after t, or null. */
  function nextUnanswered(points, answered, t) {
    return sortPoints(points).find(p => !answered.has(p.qid) && p.pause_at_s > t) || null;
  }

  /** Milliseconds of wall time until lecture time `target` at playback `rate`. */
  function msUntil(target, t, rate) {
    const r = rate > 0 ? rate : 1;
    return Math.max(0, ((target - t) / r) * 1000);
  }

  /** Delay before the next clock tick: at most TICK_MS, sooner if a point or
      the end of the lecture comes first. */
  function nextDelay(points, answered, t, rate, duration) {
    let ms = TICK_MS;
    const next = nextUnanswered(points, answered, t);
    if (next) ms = Math.min(ms, msUntil(next.pause_at_s, t, rate));
    if (Number.isFinite(duration) && duration > 0) ms = Math.min(ms, msUntil(duration, t, rate));
    return Math.max(20, Math.ceil(ms));
  }

  /**
   * A pausable clock in lecture seconds. `now` returns milliseconds
   * (performance.now in the page). Elapsed time is computed from `now`, never
   * counted by timer callbacks, so throttled timers cannot make it drift.
   */
  function createClock(now) {
    let base = 0, anchor = null, rate = 1;
    const time = () => anchor === null ? base : base + ((now() - anchor) / 1000) * rate;
    return {
      time,
      running: () => anchor !== null,
      rate: () => rate,
      start() { if (anchor === null) anchor = now(); },
      pause() { if (anchor !== null) { base = time(); anchor = null; } },
      set(t) { base = Number(t) || 0; if (anchor !== null) anchor = now(); },
      setRate(r) {
        if (!RATES.includes(r)) return;
        base = time(); if (anchor !== null) anchor = now();
        rate = r;
      }
    };
  }

  function clampTime(t, duration) {
    const v = Number.isFinite(t) ? t : 0;
    const hi = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
    return Math.min(Math.max(0, v), hi);
  }

  /** "75" / "1:15" / "01:15" / "1:02:05" -> seconds; null when malformed. */
  function parseTime(text) {
    const s = String(text == null ? '' : text).trim();
    if (!/^\d{1,5}(:\d{1,2}){0,2}$/.test(s)) return null;
    const parts = s.split(':').map(Number);
    if (parts.length > 1 && parts.slice(1).some(n => n > 59)) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }

  /** 754.2 -> "12:34"; 3725 -> "1:02:05". */
  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
  }

  /** Where to put the clock on resume: the saved time, kept inside the lecture. */
  function resumePosition(saved, duration) {
    const s = Number(saved);
    if (!Number.isFinite(s) || s <= 0) return 0;
    return clampTime(s, duration);
  }

  /** Echo360 classroom URL for a lesson id, or null when the id looks wrong. */
  function echoUrl(lessonId) {
    return typeof lessonId === 'string' && LESSON_ID.test(lessonId)
      ? 'https://echo360.org/lesson/' + lessonId + '/classroom' : null;
  }

  const isTime = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

  /* Answers are plain objects keyed by qid (they go to JSON). Own-property
     reads and defineProperty writes keep a qid such as "__proto__" inert. */
  const own = (obj, k) => obj && Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : undefined;
  function put(obj, k, v) {
    Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
    return obj;
  }

  /** Check a decrypted payload for quiz `quizId`. Returns an error string or null. */
  function payloadError(p, quizId) {
    if (!p || p.schema !== 1) return 'unknown watch-along format';
    if (p.quiz_id !== quizId) return 'watch-along belongs to a different quiz';
    if (!echoUrl(p.echo360_lesson_id)) return 'missing Echo360 lesson';
    if (!isTime(p.duration_s) || p.duration_s <= 0) return 'missing lecture length';
    if (typeof p.quiz_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(p.quiz_sha256)) return 'missing quiz fingerprint';
    if (!Array.isArray(p.points) || !p.points.length) return 'no checkpoints';
    const seen = new Set();
    for (const x of p.points) {
      if (!x || typeof x.qid !== 'string' || !x.qid || seen.has(x.qid)) return 'bad checkpoint id';
      if (!isTime(x.pause_at_s) || !isTime(x.topic_start_s)) return 'bad checkpoint time';
      seen.add(x.qid);
    }
    return null;
  }

  /** Map each point's qid to its question index. null when any point has no
      usable question (the quiz changed since the watch-along was built). */
  function resolvePoints(points, questions) {
    const byQid = new Map();
    (questions || []).forEach((q, i) => {
      if (q && typeof q.qid === 'string') byQid.set(q.qid, byQid.has(q.qid) ? -1 : i);
    });
    const out = new Map();
    for (const p of points || []) {
      const i = byQid.get(p.qid);
      const q = i === undefined || i < 0 ? null : questions[i];
      if (!q || !Array.isArray(q.options) || !q.options.length ||
          !Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) return null;
      out.set(p.qid, i);
    }
    return out;
  }

  /**
   * Saved progress from its stored JSON. Anything malformed, or saved for a
   * different quiz version (sha), gives a fresh start. Answers for unknown
   * qids are dropped.
   */
  function parseProgress(raw, sha, points) {
    const fresh = { t: 0, rate: 1, answers: {} };
    let d;
    try { d = JSON.parse(raw); } catch (e) { return fresh; }
    if (!d || d.v !== 1 || d.sha !== sha) return fresh;
    const known = new Set((points || []).map(p => p.qid));
    const answers = {};
    if (d.answers && typeof d.answers === 'object') {
      Object.keys(d.answers).forEach(qid => {
        const a = own(d.answers, qid);
        if (known.has(qid) && a && Number.isInteger(a.choice) && typeof a.correct === 'boolean')
          put(answers, qid, { choice: a.choice, correct: a.correct });
      });
    }
    return {
      t: isTime(d.t) ? d.t : 0,
      rate: RATES.includes(d.rate) ? d.rate : 1,
      answers
    };
  }

  function serializeProgress(sha, t, rate, answers) {
    return JSON.stringify({ v: 1, sha, t: Math.round(t * 10) / 10, rate, answers });
  }

  /** Answers with qid recorded. The first answer is kept; later ones are ignored. */
  function recordAnswer(answers, qid, choice, correct) {
    if (own(answers, qid)) return answers;
    const out = {};
    Object.keys(answers || {}).forEach(k => put(out, k, own(answers, k)));
    return put(out, qid, { choice, correct: !!correct });
  }

  function answeredSet(answers) { return new Set(Object.keys(answers || {})); }

  function scoreOf(points, answers) {
    let answered = 0, correct = 0;
    (points || []).forEach(p => {
      const a = own(answers, p.qid);
      if (a) { answered++; if (a.correct) correct++; }
    });
    return { answered, total: (points || []).length, correct };
  }

  /** 'unanswered' | 'right' | 'missed' for a tick. */
  function pointState(p, answers) {
    const a = own(answers, p.qid);
    return !a ? 'unanswered' : a.correct ? 'right' : 'missed';
  }

  function missedPoints(points, answers) {
    return sortPoints(points).filter(p => pointState(p, answers) === 'missed');
  }

  /** What a key does while a question card is open (null = not ours). Held
      keys are swallowed so a held Enter cannot submit and then continue. */
  function cardKeyAction(key, repeat, submitted, nOptions) {
    const isOption = /^[1-5]$/.test(key);
    if (!isOption && key !== 'Enter' && key !== ' ') return null;
    if (repeat || key === ' ') return { type: 'block' };
    if (key === 'Enter') return { type: submitted ? 'continue' : 'submit' };
    if (submitted) return { type: 'block' };
    const index = Number(key) - 1;
    return index < nOptions ? { type: 'choose', index } : { type: 'block' };
  }

  const api = {
    own, RATES, TICK_MS, sortPoints, duePoints, duePointsAt, atEnd, nextUnanswered, msUntil,
    nextDelay, createClock, clampTime, parseTime, fmtTime, resumePosition, echoUrl,
    payloadError, resolvePoints, parseProgress, serializeProgress, recordAnswer,
    answeredSet, scoreOf, pointState, missedPoints, cardKeyAction
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WatchLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
