import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Serve only public assets; never expose the checkout or depend on a running preview.
const assets = new Map([
  ['/', ['../index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['../index.html', 'text/html; charset=utf-8']],
  ['/photo.jpg', ['../photo.jpg', 'image/jpeg']],
  ['/Daniil_Maklakov_CV.pdf', ['../Daniil_Maklakov_CV.pdf', 'application/pdf']],
]);
let browser;
let server;
let baseURL;

before(async () => {
  server = createServer(async (request, response) => {
    const asset = assets.get(new URL(request.url, 'http://localhost').pathname);
    if (!asset) { response.writeHead(404).end(); return; }
    try {
      const body = await readFile(new URL(asset[0], import.meta.url));
      response.writeHead(200, { 'Content-Type': asset[1] }).end(body);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

test('language switch updates visible content, accessible controls and metadata, and survives reload', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(baseURL);
    assert.equal(await page.getAttribute('html', 'lang'), 'fr');
    assert.equal(await page.locator('[data-page="fr"]').isVisible(), true);
    assert.equal(await page.locator('[data-page="en"]').isHidden(), true);
    await page.locator('[data-language="en"]').click();
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    assert.equal(await page.locator('[data-page="fr"]').isHidden(), true);
    assert.equal(await page.locator('[data-page="en"]').isVisible(), true);
    assert.equal(await page.locator('[data-language="en"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-language="fr"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.header-contacts').getAttribute('aria-label'), 'Contact links');
    assert.equal(await page.locator('meta[property="og:locale"]').getAttribute('content'), 'en_GB');
    assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'), await page.title());
    await page.reload();
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    await page.locator('[data-language="fr"]').click();
    await page.reload();
    assert.equal(await page.getAttribute('html', 'lang'), 'fr');
  } finally { await page.close(); }
});

test('language switch works without script errors when storage is blocked', async () => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() { throw new DOMException('Storage is blocked', 'SecurityError'); },
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await page.locator('[data-language="en"]').click();
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    await page.locator('[data-language="fr"]').click();
    assert.equal(await page.getAttribute('html', 'lang'), 'fr');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('invalid saved language falls back to a readable French page', async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => localStorage.setItem('portfolio-language', 'invalid'));
    await page.goto(baseURL);
    assert.equal(await page.getAttribute('html', 'lang'), 'fr');
    assert.equal(await page.locator('[data-page="fr"]').isVisible(), true);
  } finally { await page.close(); }
});

test('core content and contact are usable without JavaScript', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(baseURL);
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await page.locator('[data-page="fr"]').isVisible(), true);
    assert.equal(await page.locator('[data-page="fr"] a[href^="mailto:"]').first().isVisible(), true);
    assert.equal(await page.locator('.language-switch').isVisible(), false, 'Do not display non-working language controls');
    assert.equal(await page.locator('[data-page="fr"] details').count() > 0, true);
    await page.locator('[data-page="fr"] summary').first().click();
    assert.equal(await page.locator('[data-page="fr"] details').first().getAttribute('open'), '');
  } finally { await context.close(); }
});

test('both languages fit narrow mobile, tablet and desktop screens, including expanded details', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(baseURL);
    for (const language of ['fr', 'en']) {
      await page.locator(`[data-language="${language}"]`).click();
      for (const width of [320, 375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const detail of await page.locator(`[data-page="${language}"] details`).all()) {
          if (await detail.getAttribute('open') === null) await detail.locator('summary').click();
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert.equal(overflow, false, `${language} overflows at ${width}px`);
      }
    }
  } finally { await page.close(); }
});

test('keyboard navigation exposes main content, switches language and opens project details', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(baseURL);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip-link').evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('main').evaluate(element => element === document.activeElement), true);
    await page.locator('[data-language="en"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    await page.locator('[data-page="en"] summary').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-page="en"] details').first().getAttribute('open'), '');
  } finally { await page.close(); }
});

test('local assets and in-page links resolve without runtime errors', async () => {
  const page = await browser.newPage();
  try {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    const invalidLinks = await page.locator('a[href^="#"]').evaluateAll(links =>
      links.filter(link => !document.getElementById(link.hash.slice(1))).map(link => link.hash));
    assert.deepEqual(invalidLinks, []);
    const localPaths = await page.locator('img[src], a[href]').evaluateAll(elements => [...new Set(elements
      .map(element => element.getAttribute('src') || element.getAttribute('href'))
      .filter(value => value && !/^(?:https?:|mailto:|#)/.test(value)))]);
    for (const path of localPaths) {
      assert.equal((await page.request.get(new URL(path, baseURL).href)).ok(), true, `Missing asset: ${path}`);
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('profile navigation is not trapped below the viewport by sticky positioning', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(baseURL);
    for (const height of [820, 900, 1080]) {
      await page.setViewportSize({ width: 1280, height });
      const fits = await page.locator('[data-page="fr"] .profile').evaluate(profile => {
        const style = getComputedStyle(profile);
        return style.position !== 'sticky' || profile.getBoundingClientRect().height + parseFloat(style.top) <= innerHeight;
      });
      assert.equal(fits, true, `Sticky profile exceeds ${height}px viewport`);
    }
  } finally { await page.close(); }
});

test('shared section links display the matching language and stay valid after switching', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseURL}/#projects-en`);
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    assert.equal(await page.locator('#projects-en').isVisible(), true);
    await page.locator('[data-language="fr"]').click();
    assert.equal(new URL(page.url()).hash, '#projects-fr');
    assert.equal(await page.locator('#projects-fr').isVisible(), true);
    await page.goto(`${baseURL}/#education-en`);
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    assert.equal(await page.locator('#education-en').isVisible(), true);
  } finally { await page.close(); }
});
