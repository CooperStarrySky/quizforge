/* Shared design system guards. Run with QF_DESIGN_MASTER=/path/to/master/qf-design.css to also
   check the committed copy is byte-identical to the master (the master lives outside this repo). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const PAGES = ['index.html', 'quiz.html'];
const inlineCss = html => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');

test('qf-design.css copy matches the master byte for byte', { skip: !process.env.QF_DESIGN_MASTER && 'QF_DESIGN_MASTER not set' }, () => {
  const master = process.env.QF_DESIGN_MASTER;
  assert.ok(existsSync(master), 'master file exists: ' + master);
  assert.ok(readFileSync(new URL('../qf-design.css', import.meta.url)).equals(readFileSync(master)), 'copy differs from master');
});

for (const page of PAGES) {
  test(`${page} links the shared sheet before its own styles and keeps no token blocks of its own`, () => {
    const html = read(page);
    const link = html.indexOf('<link rel="stylesheet" href="qf-design.css">');
    assert.ok(link > 0, 'links qf-design.css');
    assert.ok(link < html.indexOf('<style>'), 'shared sheet comes before the page <style>');
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1.0">/);
    const css = inlineCss(html);
    assert.doesNotMatch(css, /:root\s*[{[]/, 'no :root token blocks in page CSS');
    const foreign = [...css.matchAll(/var\(--([a-z0-9-]+)/g)].map(m => m[1]).filter(v => !v.startsWith('qf-') && v !== 'cscale');
    assert.deepEqual([...new Set(foreign)], [], 'page CSS uses only --qf-* tokens');
    assert.doesNotMatch(html, /anime\.min\.js/, 'no animation library on the page');
  });

  /* jsdom has no layout, so 375 px overflow can't be measured here. This static guard catches
     the usual cause: fixed widths wider than a phone. The real check is in a browser. */
  test(`${page} sets no fixed width or min-width wider than a 375 px phone`, () => {
    const css = inlineCss(read(page)) + '\n' + read('qf-design.css');
    const wide = [...css.matchAll(/(?<![-\w(])(min-width|width)\s*:\s*(\d+)px/g)].filter(m => Number(m[2]) > 343).map(m => m[0]);
    assert.deepEqual(wide, []);
  });
}
