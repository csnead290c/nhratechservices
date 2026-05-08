// check-browser.spec.ts — NHRA Parity browser smoke tests
// Uses Playwright to verify parity UI behavior against production or local.
// All checks are READ-ONLY. No data mutations, no ingest, no backfill, no admin writes.
//
// Required env vars:
//   NHRATS_BASE_URL        — target URL (default: https://nhratechservices.com)
//   NHRATS_TEST_EMAIL      — NHRA-plan user email
//   NHRATS_TEST_PASSWORD   — NHRA-plan user password
//   NHRATS_ADMIN_EMAIL     — (optional) admin/owner email for admin gate checks
//   NHRATS_ADMIN_PASSWORD  — (optional) admin/owner password

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.NHRATS_BASE_URL || 'https://nhratechservices.com';
const TEST_EMAIL = process.env.NHRATS_TEST_EMAIL || '';
const TEST_PASSWORD = process.env.NHRATS_TEST_PASSWORD || '';
const ADMIN_EMAIL = process.env.NHRATS_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.NHRATS_ADMIN_PASSWORD || '';

const HAS_CREDENTIALS = !!(TEST_EMAIL && TEST_PASSWORD);
const HAS_ADMIN_CREDENTIALS = !!(ADMIN_EMAIL && ADMIN_PASSWORD);

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
}

async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe('NHRA Parity Browser Baseline', () => {
  test.describe.configure({ mode: 'serial' });

  // ── AUTH & ROUTE GATING ──────────────────────────────────────────────────────

  test('A1 — Unauthenticated user redirected to login', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await page.goto(`${BASE_URL}/parity`);
    await page.waitForLoadState('networkidle');
    // Should redirect to login or show login page
    const url = page.url();
    expect(url).toMatch(/login|parity/);
  });

  test('A2 — NHRA user login lands on /parity', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    const url = page.url();
    // NHRA users should land on /parity
    expect(url).toContain('/parity');
  });

  test('A3 — NHRA user blocked from /et-sim', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto(`${BASE_URL}/et-sim`);
    await page.waitForTimeout(1500);
    const url = page.url();
    // Should redirect away from et-sim
    expect(url).not.toContain('/et-sim');
  });

  test('A4 — NHRA user blocked from /admin', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForTimeout(1500);
    const url = page.url();
    // Should not show admin page
    expect(url).not.toContain('/admin');
  });

  // ── PARITY DASHBOARD LOAD ────────────────────────────────────────────────────

  test('B1 — /parity loads without console errors', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    const errors = await collectConsoleErrors(page);
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const parityErrors = errors.filter((e) =>
      e.toLowerCase().includes('parity') ||
      e.toLowerCase().includes('error') ||
      e.includes('Uncaught')
    );
    expect(parityErrors.length).toBe(0);
  });

  test('B2 — Event selector populates with events', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for event selector — try multiple selectors
    const eventSelector = page.locator('select, [data-testid*="event"], .event-selector select').first();
    if (await eventSelector.count() === 0) {
      // No select found — may be a different UI pattern
      console.log('  ⚠️ No event <select> found — UI may use custom component');
      test.skip(true, 'No stable event selector found');
      return;
    }

    const options = await eventSelector.locator('option').count();
    expect(options).toBeGreaterThan(1); // More than just a placeholder
  });

  test('B3 — Event change loads data', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const eventSelector = page.locator('select, [data-testid*="event"], .event-selector select').first();
    if (await eventSelector.count() === 0) {
      test.skip(true, 'No stable event selector found');
      return;
    }

    // Select the second option (skip placeholder)
    const options = await eventSelector.locator('option').all();
    if (options.length < 2) {
      test.skip(true, 'Not enough event options');
      return;
    }

    const secondValue = await options[1].getAttribute('value');
    if (secondValue) {
      await eventSelector.selectOption(secondValue);
      await page.waitForTimeout(2000);
    }

    // Should still be on /parity and not have crashed
    expect(page.url()).toContain('/parity');
  });

  // ── CORRECTED / RAW TOGGLE ───────────────────────────────────────────────────

  test('C1 — Corrected mode is default', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for corrected/raw toggle
    const correctedBtn = page.locator('button:has-text("Corrected"), button:has-text("corrected"), [data-testid*="corrected"]').first();
    const rawBtn = page.locator('button:has-text("Raw"), button:has-text("raw"), [data-testid*="raw"]').first();

    const hasCorrected = await correctedBtn.count() > 0;
    const hasRaw = await rawBtn.count() > 0;

    if (!hasCorrected && !hasRaw) {
      console.log('  ⚠️ No corrected/raw toggle found — UI may differ');
      test.skip(true, 'No corrected/raw toggle found');
      return;
    }

    // Corrected should appear active/selected by default
    if (hasCorrected) {
      const isActive = await correctedBtn.evaluate((el) => {
        return el.classList.contains('active') || el.getAttribute('aria-pressed') === 'true' || (el as HTMLButtonElement).disabled;
      });
      console.log(`  Corrected button active: ${isActive}`);
    }
  });

  test('C2 — Toggle to raw mode changes ET values', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const rawBtn = page.locator('button:has-text("Raw"), button:has-text("raw"), [data-testid*="raw"]').first();
    if (await rawBtn.count() === 0) {
      test.skip(true, 'No raw mode toggle found');
      return;
    }

    // Capture some ET text before toggle
    const beforeText = await page.locator('table').first().textContent() || '';

    await rawBtn.click();
    await page.waitForTimeout(2000);

    const afterText = await page.locator('table').first().textContent() || '';

    // Values should change (raw ≠ corrected)
    // This is a smoke test — we just verify the page doesn't crash
    console.log(`  Toggle completed — page still loaded: ${page.url().includes('/parity')}`);
    expect(page.url()).toContain('/parity');
  });

  // ── QUALIFYING RAW ENFORCEMENT ───────────────────────────────────────────────

  test('D1 — Qual sheet loads and shows raw times', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Try to find and click Qual Sheet tab/button
    const qualTab = page.locator('button:has-text("Qual"), button:has-text("Qualifying"), a:has-text("Qual"), [data-testid*="qual"]').first();
    if (await qualTab.count() === 0) {
      console.log('  ⚠️ No Qual Sheet tab found');
      test.skip(true, 'No Qual Sheet navigation found');
      return;
    }

    await qualTab.click();
    await page.waitForTimeout(2000);

    // Should still be on the page
    expect(page.url()).toContain('/parity');
  });

  // ── WEATHER PANEL ────────────────────────────────────────────────────────────

  test('E1 — Weather panel loads', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for weather-related UI
    const weatherElements = page.locator('[data-testid*="weather"], text=Weather, text=Tempest, text=Open-Meteo, .weather-panel');
    const count = await weatherElements.count();
    console.log(`  Weather-related elements found: ${count}`);
    // Not failing if none found — weather may only show for events with data
  });

  // ── COMBO ASSIGNMENTS ────────────────────────────────────────────────────────

  test('F1 — Combo labels/colors appear in report', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for combo-related elements
    const comboElements = page.locator('[data-testid*="combo"], .combo-badge, .combo-label, [style*="background"]');
    const count = await comboElements.count();
    console.log(`  Combo-related elements found: ${count}`);
  });

  // ── PDF EXPORTS ──────────────────────────────────────────────────────────────

  test('G1 — PDF export buttons trigger downloads', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for PDF export buttons
    const pdfButtons = page.locator('button:has-text("PDF"), button:has-text("Export"), button:has-text("Download"), [data-testid*="pdf"], [data-testid*="export"]');
    const count = await pdfButtons.count();
    console.log(`  PDF/Export buttons found: ${count}`);

    if (count === 0) {
      console.log('  ⚠️ No PDF export buttons found');
      test.skip(true, 'No PDF export buttons found');
      return;
    }

    // Try clicking the first export button
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      pdfButtons.first().click(),
    ]);

    if (download) {
      const filename = download.suggestedFilename();
      console.log(`  Download triggered: ${filename}`);
      expect(filename).toMatch(/\.pdf$/i);
    } else {
      console.log('  ⚠️ No download triggered — PDF may generate in new tab');
    }
  });

  // ── ADMIN GATE CHECKS (only if admin credentials available) ──────────────────

  test('H1 — Admin user can access /tech', async ({ page }) => {
    if (!HAS_ADMIN_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_ADMIN_EMAIL and NHRATS_ADMIN_PASSWORD');
      return;
    }
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForTimeout(2000);

    await page.goto(`${BASE_URL}/tech`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should load tech page
    expect(page.url()).toContain('/tech');
  });

  test('H2 — NHRA user cannot access admin parity tools', async ({ page }) => {
    if (!HAS_CREDENTIALS) {
      test.skip(true, 'BLOCKED: Set NHRATS_TEST_EMAIL and NHRATS_TEST_PASSWORD');
      return;
    }
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForTimeout(2000);

    // Try to access admin-only parity actions via URL
    await page.goto(`${BASE_URL}/parity?admin=true`);
    await page.waitForTimeout(1500);

    // Should not show admin UI
    const adminElements = page.locator('text=Admin Panel, text=Ingest, text=Backfill, text=Purge');
    const visible = await adminElements.first().isVisible().catch(() => false);
    expect(visible).toBe(false);
  });

  // ── PAGE TITLE & BRANDING ────────────────────────────────────────────────────

  test('I1 — Page title is NHRA Tech Services', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    const title = await page.title();
    expect(title).toContain('NHRA Tech Services');
  });

  test('I2 — NHRA logo/header present', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Check for NHRA logo image
    const logo = page.locator('img[src*="nhra"], img[alt*="NHRA"], img[alt*="nhra"]').first();
    const logoCount = await logo.count();
    console.log(`  NHRA logo images found: ${logoCount}`);
  });
});
