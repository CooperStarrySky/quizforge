/* Run with: node --test tests/watch_logic.test.mjs  (DOM-free) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../watch_logic.js';

const W = globalThis.WatchLogic;
const P = [
  { qid: 'c', pause_at_s: 300, topic_start_s: 200, topic_label: 'C' },
  { qid: 'a', pause_at_s: 100, topic_start_s: 0, topic_label: 'A' },
  { qid: 'b', pause_at_s: 200, topic_start_s: 100, topic_label: 'B' },
  { qid: 'end', pause_at_s: 600, topic_start_s: 300, topic_label: 'End' },
];
const SHA = 'a'.repeat(64);

test('due points: unanswered and at or before the clock, in time order', () => {
  assert.deepEqual(W.duePoints(P, new Set(), 99.9).map(p => p.qid), []);
  assert.deepEqual(W.duePoints(P, new Set(), 100).map(p => p.qid), ['a']);
  assert.deepEqual(W.duePoints(P, new Set(['a']), 250).map(p => p.qid), ['b']);
  assert.deepEqual(W.duePoints(P, new Set(), 350).map(p => p.qid), ['a', 'b', 'c']);
});

test('rewinding never re-asks answered points', () => {
  const answered = new Set(['a', 'b']);
  assert.deepEqual(W.duePoints(P, answered, 50), []);
  assert.deepEqual(W.duePoints(P, answered, 250), []);
});

test('last point at or after the duration fires at the end', () => {
  assert.deepEqual(W.duePointsAt(P, new Set(['a', 'b', 'c']), 599.6, 600).map(p => p.qid), ['end']);
  const late = [{ qid: 'z', pause_at_s: 610, topic_start_s: 0 }];
  assert.deepEqual(W.duePointsAt(late, new Set(), 599, 600), []);
  assert.deepEqual(W.duePointsAt(late, new Set(), 600, 600).map(p => p.qid), ['z']);
});

test('next unanswered and tick delays', () => {
  assert.equal(W.nextUnanswered(P, new Set(), 100).qid, 'b');
  assert.equal(W.nextUnanswered(P, new Set(['b', 'c', 'end']), 100), null);
  assert.equal(W.msUntil(110, 100, 2), 5000);
  assert.equal(W.nextDelay(P, new Set(), 0, 1, 600), W.TICK_MS);
  assert.equal(W.nextDelay(P, new Set(), 99.9, 1, 600), 100);
  assert.equal(W.nextDelay(P, new Set(), 99.95, 2, 600), 25);
  assert.equal(W.nextDelay(P, new Set(), 100, 1, 600), W.TICK_MS);
  assert.equal(W.nextDelay([], new Set(), 599.99, 1, 600), 20);
});

test('clock runs at its rate, pauses, jumps and changes rate without drift', () => {
  let ms = 1000;
  const c = W.createClock(() => ms);
  assert.equal(c.time(), 0);
  c.start(); ms += 10000;
  assert.equal(c.time(), 10);
  c.setRate(2); ms += 5000;
  assert.equal(c.time(), 20);
  c.pause(); ms += 60000;
  assert.equal(c.time(), 20);
  assert.equal(c.running(), false);
  c.set(90); c.start(); c.start(); ms += 1000;
  assert.equal(c.time(), 92);
  c.setRate(3);                       // not an offered speed: ignored
  assert.equal(c.rate(), 2);
  c.set(5); ms += 500;
  assert.equal(c.time(), 6);
});

test('parseTime accepts s, m:ss and h:mm:ss only', () => {
  assert.equal(W.parseTime('75'), 75);
  assert.equal(W.parseTime(' 1:15 '), 75);
  assert.equal(W.parseTime('01:15'), 75);
  assert.equal(W.parseTime('1:02:05'), 3725);
  assert.equal(W.parseTime('62:30'), 3750);
  for (const bad of ['', '1:75', '1:2:3:4', '-5', '1.5', 'abc', '1:', ':30', '1:02:60', null])
    assert.equal(W.parseTime(bad), null, String(bad));
});

test('fmtTime, clampTime and resumePosition', () => {
  assert.equal(W.fmtTime(754.2), '12:34');
  assert.equal(W.fmtTime(3725), '1:02:05');
  assert.equal(W.fmtTime(-3), '0:00');
  assert.equal(W.clampTime(700, 600), 600);
  assert.equal(W.clampTime(-1, 600), 0);
  assert.equal(W.clampTime(NaN, 600), 0);
  assert.equal(W.resumePosition('123.4', 600), 123.4);
  assert.equal(W.resumePosition(9999, 600), 600);
  assert.equal(W.resumePosition('junk', 600), 0);
});

test('echoUrl only accepts lesson-id shaped values', () => {
  assert.equal(W.echoUrl('0a1b2c3d-0000-4000-8000-00000000abcd'),
    'https://echo360.org/lesson/0a1b2c3d-0000-4000-8000-00000000abcd/classroom');
  for (const bad of ['../x', 'abc', 'a/b-c-d-e-f-g', '"><script>', 123, null]) assert.equal(W.echoUrl(bad), null);
});

const payload = () => ({
  schema: 1, quiz_id: 'demo-w03-fixture', quiz_revision: 1, quiz_sha256: SHA,
  echo360_lesson_id: '0a1b2c3d-0000-4000-8000-00000000abcd', duration_s: 600, points: P,
});

test('payloadError accepts a good payload and names what is wrong otherwise', () => {
  assert.equal(W.payloadError(payload(), 'demo-w03-fixture'), null);
  assert.match(W.payloadError(payload(), 'other'), /different quiz/);
  const cases = [
    [p => { p.schema = 2; }, /format/],
    [p => { p.echo360_lesson_id = 'x'; }, /Echo360/],
    [p => { p.duration_s = 0; }, /length/],
    [p => { p.quiz_sha256 = 'abc'; }, /fingerprint/],
    [p => { p.points = []; }, /no checkpoints/],
    [p => { p.points = [P[0], P[0]]; }, /checkpoint id/],
    [p => { p.points = [{ qid: 'a', pause_at_s: -1, topic_start_s: 0 }]; }, /checkpoint time/],
  ];
  for (const [mutate, re] of cases) { const p = payload(); mutate(p); assert.match(W.payloadError(p, 'demo-w03-fixture'), re); }
  assert.equal(W.payloadError(null, 'x'), 'unknown watch-along format');
});

test('resolvePoints maps qids to question indexes and rejects drift', () => {
  const q = (qid, correct = 0) => ({ qid, text: 't', options: ['x', 'y'], correct });
  const qs = [q('b'), q('a'), q('c'), q('end'), q('extra')];
  assert.deepEqual([...W.resolvePoints(P, qs)], [['c', 2], ['a', 1], ['b', 0], ['end', 3]]);
  assert.equal(W.resolvePoints(P, qs.slice(0, 3)), null, 'missing qid');
  assert.equal(W.resolvePoints(P, [...qs, q('a')]), null, 'duplicate qid');
  assert.equal(W.resolvePoints(P, [q('a', 5), q('b'), q('c'), q('end')]), null, 'bad correct index');
});

test('progress: round trip, wrong version and junk give a fresh start', () => {
  const answers = { a: { choice: 1, correct: true }, ghost: { choice: 0, correct: false } };
  const raw = W.serializeProgress(SHA, 123.456, 1.5, answers);
  assert.deepEqual(W.parseProgress(raw, SHA, P),
    { t: 123.5, rate: 1.5, answers: { a: { choice: 1, correct: true } } });
  const fresh = { t: 0, rate: 1, answers: {} };
  assert.deepEqual(W.parseProgress(raw, 'b'.repeat(64), P), fresh);
  assert.deepEqual(W.parseProgress('{not json', SHA, P), fresh);
  assert.deepEqual(W.parseProgress(null, SHA, P), fresh);
  assert.deepEqual(W.parseProgress(JSON.stringify({ v: 1, sha: SHA, t: -4, rate: 9,
    answers: { a: { choice: '1', correct: true }, b: { choice: 0, correct: 'yes' } } }), SHA, P), fresh);
});

test('first answer is kept', () => {
  let a = W.recordAnswer({}, 'a', 2, false);
  const again = W.recordAnswer(a, 'a', 0, true);
  assert.equal(again, a);
  assert.deepEqual(again.a, { choice: 2, correct: false });
  a = W.recordAnswer(a, 'b', 0, true);
  assert.deepEqual([...W.answeredSet(a)].sort(), ['a', 'b']);
  const odd = W.recordAnswer({}, '__proto__', 1, true);
  assert.equal(Object.getPrototypeOf(odd), Object.prototype, 'a qid never changes the prototype');
  assert.deepEqual(W.own(odd, '__proto__'), { choice: 1, correct: true });
  assert.equal(W.pointState({ qid: 'constructor' }, {}), 'unanswered');
  const parsed = W.parseProgress('{"v":1,"sha":"' + SHA + '","t":1,"rate":1,"answers":{"__proto__":{"choice":0,"correct":true}}}',
    SHA, [{ qid: '__proto__', pause_at_s: 1, topic_start_s: 0 }]);
  assert.equal(Object.getPrototypeOf(parsed.answers), Object.prototype);
  assert.equal(W.scoreOf([{ qid: '__proto__' }], parsed.answers).correct, 1);
});

test('score, tick states and the missed list', () => {
  const answers = { a: { choice: 0, correct: true }, c: { choice: 1, correct: false }, b: { choice: 1, correct: false } };
  assert.deepEqual(W.scoreOf(P, answers), { answered: 3, total: 4, correct: 1 });
  assert.equal(W.pointState(P[1], answers), 'right');
  assert.equal(W.pointState(P[0], answers), 'missed');
  assert.equal(W.pointState(P[3], answers), 'unanswered');
  assert.deepEqual(W.missedPoints(P, answers).map(p => p.qid), ['b', 'c']);
});

test('card keys: 1-5 choose, Enter submits then continues, repeats and space blocked', () => {
  assert.deepEqual(W.cardKeyAction('2', false, false, 4), { type: 'choose', index: 1 });
  assert.deepEqual(W.cardKeyAction('5', false, false, 4), { type: 'block' });
  assert.deepEqual(W.cardKeyAction('1', false, true, 4), { type: 'block' });
  assert.deepEqual(W.cardKeyAction('Enter', false, false, 4), { type: 'submit' });
  assert.deepEqual(W.cardKeyAction('Enter', false, true, 4), { type: 'continue' });
  assert.deepEqual(W.cardKeyAction('Enter', true, true, 4), { type: 'block' });
  assert.deepEqual(W.cardKeyAction(' ', false, false, 4), { type: 'block' });
  assert.equal(W.cardKeyAction('x', false, false, 4), null);
});
