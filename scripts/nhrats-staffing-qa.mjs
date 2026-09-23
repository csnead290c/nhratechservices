// Browser acceptance test: worker request flow + admin staffing on the
// Vegas Fall plan (id 7, parity_event_id 5) against the sqlite dev DB.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const OUT = '/tmp/nhrats-staffing-qa';
mkdirSync(OUT, { recursive: true });

const ADMIN_TOKEN = readFileSync('/tmp/nhrats-token.txt', 'utf8').trim();
const JOEY_TOKEN = readFileSync('/tmp/nhrats-worker-tokens.txt', 'utf8').split('\n')[0].trim();

const ADMIN_USER = { id: 'api_1', email: 'admin@rsa.local', displayName: 'Admin Local', roleId: 'owner', status: 'active', createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() };
const JOEY_USER = { id: 'api_2', email: 'joey@rsa.local', displayName: 'Joey Martin', roleId: 'user', status: 'active', createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() };

async function seed(context, token, user) {
  await context.addInitScript(([t, u]) => {
    localStorage.setItem('rsa_token', t);
    localStorage.setItem('rsa.auth.currentUser', JSON.stringify(u));
    localStorage.setItem('rsa.auth.apiProducts', '[]');
  }, [token, user]);
}

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844, isMobile: true, hasTouch: true };

const results = [];
function report(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
}

const browser = await chromium.launch();

// ── 1. Worker request flow (Joey, desktop) ─────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: DESKTOP });
  await seed(ctx, JOEY_TOKEN, JOEY_USER);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  try {
    await page.goto(BASE + '/event-ops/requests', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/worker-requests-desktop.png`, fullPage: true });

    // Upcoming event card should be visible
    const card = page.locator('[data-testid="event-card-5"]');
    report('worker: upcoming Vegas event card', await card.count() === 1);

    // Open request form
    await page.locator('[data-testid="request-btn-5"]').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/worker-request-form.png`, fullPage: true });

    // Full event (default), Drive, Hotel, specific roommate -> search Rick
    await page.locator('[data-testid="req-travel"]').selectOption('drive');
    await page.locator('[data-testid="req-lodging"]').selectOption('hotel');
    await page.waitForTimeout(300);
    await page.locator('[data-testid="req-roommate-pref"]').selectOption('specific_person');
    await page.fill('[data-testid="req-roommate-name"]', 'Rick');
    await page.waitForTimeout(600);
    const hit = page.locator('text=Rick Delgado').first();
    if (await hit.count()) await hit.click();
    await page.fill('input[placeholder*="Anything staffing"]', 'Can help with teardown');
    await page.screenshot({ path: `${OUT}/worker-request-filled.png`, fullPage: true });
    await page.locator('[data-testid="work-request-submit"]').click();
    await page.waitForTimeout(1200);

    // Status badge should now say "requested"
    const badge = await page.locator('[data-testid="event-card-5"] span:has-text("requested")').count();
    report('worker: request submitted + status badge', badge >= 1);
    await page.screenshot({ path: `${OUT}/worker-request-submitted.png`, fullPage: true });
    report('worker: no page errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    report('worker flow', false, String(e).slice(0, 200));
    await page.screenshot({ path: `${OUT}/worker-FAIL.png` }).catch(() => {});
  }
  await ctx.close();
}

// ── 2. Admin staffing on plan 7 (desktop) ───────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: DESKTOP });
  await seed(ctx, ADMIN_TOKEN, ADMIN_USER);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  try {
    await page.goto(BASE + '/event-ops/7', { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator('button:has-text("Staff")').first().click();
    await page.waitForTimeout(1200);

    const pending = page.locator('[data-testid="pending-requests"]');
    report('admin: requests section visible', await pending.count() === 1);
    await page.screenshot({ path: `${OUT}/admin-staff-pending.png`, fullPage: true });

    // Confirm Joey's request
    const confirmBtn = pending.locator('button:has-text("Confirm")').first();
    if (await confirmBtn.count()) {
      await confirmBtn.click();
      await page.waitForTimeout(1200);
    }
    report('admin: confirm request', await pending.locator('text=confirmed').count() >= 1);
    await page.screenshot({ path: `${OUT}/admin-staff-confirmed.png`, fullPage: true });

    // Open detail drawer on the confirmed staff row
    const detailBtn = page.locator('[data-testid^="staff-detail-"]').first();
    report('admin: staff detail button', await detailBtn.count() === 1);
    await detailBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/admin-staff-detail.png`, fullPage: true });

    // Add a class in the drawer
    const drawer = page.locator('[data-testid="staff-detail-drawer"]');
    if (await drawer.count()) {
      await drawer.locator('input[list="eo-class-list"]').fill('TF');
      await drawer.locator('button:has-text("Add Class")').click();
      await page.waitForTimeout(800);
      report('admin: class added', await drawer.locator('text=★ TF').count() >= 1 || await drawer.locator('text=TF').count() >= 1);
      // Add a drive travel leg
      await drawer.locator('select').nth(1).selectOption('drive');
      await drawer.locator('input[placeholder="Vehicle"]').fill('F-250');
      await drawer.locator('button:has-text("Add Travel Leg")').click();
      await page.waitForTimeout(800);
      report('admin: travel leg added', await drawer.locator('text=F-250').count() >= 1);
      await page.screenshot({ path: `${OUT}/admin-staff-detail-filled.png`, fullPage: true });
    } else {
      report('admin: drawer opened', false);
    }
    report('admin: no page errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    report('admin flow', false, String(e).slice(0, 200));
    await page.screenshot({ path: `${OUT}/admin-FAIL.png` }).catch(() => {});
  }
  await ctx.close();
}

// ── 3. Mobile worker page ──────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: MOBILE });
  await seed(ctx, JOEY_TOKEN, JOEY_USER);
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + '/event-ops/requests', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/worker-requests-mobile.png`, fullPage: true });
    report('mobile: worker page renders', await page.locator('[data-testid="work-requests-page"]').count() === 1);
  } catch (e) {
    report('mobile worker page', false, String(e).slice(0, 150));
  }
  await ctx.close();
}

await browser.close();
const fails = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
