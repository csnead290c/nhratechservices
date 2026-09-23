// Browser QA: schedule authoring via UI, canonical create picker, legacy plan regression.
import { chromium } from 'playwright';
import fs from 'fs';

const SHOTS = '/tmp/nhrats-sched-qa';
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:5173';
const token = fs.readFileSync('/tmp/nhrats-token.txt', 'utf8').trim();
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));

// Seed auth via evaluate on the origin — addInitScript lands in Stripe's
// cross-origin iframes instead of the main frame on this app.
await page.goto(`${BASE}/login`);
await page.evaluate(([t, u]) => {
  localStorage.setItem('rsa_token', t);
  localStorage.setItem('rsa.auth.currentUser', JSON.stringify(u));
  localStorage.setItem('rsa.auth.apiProducts', '[]');
}, [token, { id: 'api_1', email: 'admin@rsa.local', displayName: 'Admin Local', roleId: 'owner', status: 'active', createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() }]);

const waitStable = async () => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(400); };

// ── Canonical create picker ───────────────────────────────────────────────
try {
  await page.goto(`${BASE}/event-ops`); await waitStable();
  await page.getByRole('button', { name: /New Plan/i }).click(); await waitStable();
  const sel = page.locator('[data-testid="parity-event-select"]');
  check('create modal: parity picker', await sel.isVisible());
  await sel.selectOption({ index: 1 });
  await waitStable();
  const summary = await page.locator('[data-testid="linked-event-summary"]').innerText().catch(() => '');
  check('create: identity inherited', summary.length > 5, summary.slice(0, 80));
  await page.screenshot({ path: `${SHOTS}/create-picker.png`, fullPage: true });
  await page.getByRole('button', { name: 'Cancel' }).click().catch(() => page.keyboard.press('Escape'));
} catch (e) { check('canonical create', false, String(e).slice(0, 160)); }

// ── Schedule authoring via UI (Vegas plan 7, empty schedule) ──────────────
try {
  await page.goto(`${BASE}/event-ops/7`); await waitStable();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click(); await waitStable();
  const addBtn = page.locator('[data-testid="add-schedule-item"]');
  check('schedule panel + add button', await addBtn.isVisible());

  const rows = [
    { date: '2026-10-30', day: 'Friday',   time: '07:30', title: 'Tech Team Meeting', type: 'meeting', comments: 'Trailer' },
    { date: '2026-10-30', day: 'Friday',   time: '09:00', title: 'Top Fuel', type: 'racing', cat: 'TF', round: 'Q1', cars: '16', scale: true, fuel: true },
    { date: '2026-10-30', day: 'Friday',   time: 'TBD',   title: 'Teardown', type: 'teardown', comments: '2 cars' },
    { date: '2026-10-31', day: 'Saturday', time: '08:00', title: 'Tech Team Meeting', type: 'meeting' },
  ];
  for (const r of rows) {
    await addBtn.click(); await waitStable();
    const m = page.locator('[data-testid="schedule-item-modal"]');
    await m.locator('input[type="date"]').fill(r.date);
    await m.locator('input[placeholder="e.g. Thursday"]').fill(r.day);
    await m.locator('input[placeholder="08:00 / TBD / Following TF"]').fill(r.time);
    await m.locator('input[placeholder="e.g. Tech Team Meeting, Top Fuel, Teardown"]').fill(r.title);
    await m.locator('select').first().selectOption(r.type);
    if (r.cat) await m.locator('input[placeholder="TF, FC, PS…"]').fill(r.cat);
    if (r.round) await m.locator('input[placeholder="R1, Q2, Final…"]').fill(r.round);
    if (r.cars) await m.locator('input[type="number"]').fill(r.cars);
    if (r.scale) await m.locator('text=Scale required').click();
    if (r.fuel) await m.locator('text=Fuel check required').click();
    if (r.comments) await m.locator('textarea').fill(r.comments);
    await m.locator('[data-testid="schedule-item-save"]').click();
    await waitStable();
  }
  const itemCount = await page.locator('[data-testid^="schedule-item-"]').count();
  check('schedule: 4 rows authored via UI', itemCount >= 4, `${itemCount} rows`);
  await page.screenshot({ path: `${SHOTS}/schedule-authored.png`, fullPage: true });

  const dupBtn = page.locator('button[title="Duplicate"]').first();
  if (await dupBtn.count()) { await dupBtn.click(); await waitStable(); }
  const afterDup = await page.locator('[data-testid^="schedule-item-"]').count();
  check('schedule: duplicate action', afterDup > itemCount, `${afterDup} rows`);

  // Sheet view renders the authored rows
  await page.goto(`${BASE}/event-ops/7/sheet`); await waitStable();
  const sheetText = await page.locator('body').innerText();
  check('sheet: authored rows render', sheetText.includes('Tech Team Meeting') && sheetText.includes('Top Fuel'));
  await page.screenshot({ path: `${SHOTS}/sheet.png`, fullPage: true });
} catch (e) {
  check('schedule authoring', false, String(e).slice(0, 200));
  await page.screenshot({ path: `${SHOTS}/schedule-fail.png`, fullPage: true });
}

// ── Legacy plan regression (plan 8: markdown sections, no structured data) ─
try {
  await page.goto(`${BASE}/event-ops/8`); await waitStable();
  check('legacy: plan detail loads', await page.locator('text=2025 Legacy Test Event').first().isVisible());
  await page.goto(`${BASE}/event-ops/8/pre-plan`); await waitStable();
  await page.getByRole('button', { name: 'Sections', exact: true }).click(); await waitStable();
  // Section bodies render as <pre> when not editing; verify content present
  const preTexts = await page.locator('pre').allInnerTexts().catch(() => []);
  check('legacy: markdown schedule section renders', preTexts.join('\n').includes('Tech Team Meeting'));
  await page.screenshot({ path: `${SHOTS}/legacy-preplan.png`, fullPage: true });
  await page.goto(`${BASE}/event-ops/8/sheet`); await waitStable();
  check('legacy: sheet renders without crash', pageErrors.length === 0, pageErrors[0] ?? '');
} catch (e) { check('legacy regression', false, String(e).slice(0, 160)); }

check('no page errors', pageErrors.length === 0, pageErrors[0] ?? '');
console.log(`\n${results.filter(r => r.ok).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
