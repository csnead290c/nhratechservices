// check-api.mjs — NHRA Parity API smoke tests
// All checks are READ-ONLY GET requests.
// Authenticates via login API if credentials are available, or uses NHRATS_JWT_TOKEN.

import { result, Status, missingEnvVars, redact, writeResults, printSummary } from './shared.mjs';

const BASE_URL = process.env.NHRATS_BASE_URL || 'https://nhratechservices.com';

/**
 * Authenticate via the login API and return a JWT token.
 */
async function authenticate() {
  const email = process.env.NHRATS_TEST_EMAIL;
  const password = process.env.NHRATS_TEST_PASSWORD;
  if (!email || !password) return null;

  try {
    const res = await fetch(`${BASE_URL}/api/auth.php?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.token) return data.token;
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Run a single API check
 */
async function checkEndpoint(token, path, label, validator) {
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${BASE_URL}${path}`, { headers });
    const status = res.status;
    let body;
    try { body = await res.json(); } catch { body = await res.text(); }

    if (status !== 200) {
      return result(label, Status.FAIL, `HTTP ${status}`);
    }
    const detail = validator(body);
    if (detail === true) return result(label, Status.PASS);
    return result(label, Status.FAIL, detail);
  } catch (e) {
    return result(label, Status.FAIL, `Network error: ${e.message}`);
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log(`\n=== NHRA API Smoke Tests ===`);
  console.log(`Base URL: ${BASE_URL}`);

  const results = [];

  // Check for auth credentials
  let token = process.env.NHRATS_JWT_TOKEN || null;
  if (!token) {
    const email = process.env.NHRATS_TEST_EMAIL;
    const password = process.env.NHRATS_TEST_PASSWORD;
    if (email && password) {
      console.log('Authenticating via login API...');
      token = await authenticate();
      if (token) {
        console.log('  ✅ Authenticated');
        results.push(result('API auth (login)', Status.PASS));
      } else {
        console.log('  ❌ Authentication failed');
        results.push(result('API auth (login)', Status.FAIL, 'Login API returned no token'));
        // Continue without token — endpoints will likely fail
      }
    } else {
      results.push(result('API auth', Status.BLOCKED, 'Set NHRATS_TEST_EMAIL + NHRATS_TEST_PASSWORD, or NHRATS_JWT_TOKEN', ['NHRATS_TEST_EMAIL', 'NHRATS_TEST_PASSWORD', 'NHRATS_JWT_TOKEN']));
    }
  } else {
    results.push(result('API auth (token)', Status.PASS, 'Using NHRATS_JWT_TOKEN from env'));
  }

  // If we have no token at all, mark all endpoints as blocked
  if (!token) {
    const endpoints = [
      '/api/parity.php?action=events',
      '/api/parity.php?action=tracks',
      '/api/parity.php?action=eventsWithStats',
      '/api/parity.php?action=listEngineCombos',
      '/api/parity.php?action=listDriverCombos',
      '/api/parity.php?action=paritySmokeTest',
      '/api/auth.php?action=me',
      '/api/capabilities-endpoint.php',
    ];
    for (const ep of endpoints) {
      results.push(result(`GET ${ep}`, Status.BLOCKED, 'No auth token available', ['NHRATS_TEST_EMAIL', 'NHRATS_TEST_PASSWORD', 'NHRATS_JWT_TOKEN']));
    }
  } else {
    // Run all endpoint checks
    results.push(await checkEndpoint(token, '/api/parity.php?action=events', 'GET events', (b) => {
      if (b.events && Array.isArray(b.events)) return b.events.length > 0 ? true : 'events array is empty';
      return `Unexpected response: ${JSON.stringify(b).substring(0, 200)}`;
    }));

    results.push(await checkEndpoint(token, '/api/parity.php?action=tracks', 'GET tracks', (b) => {
      if (b.tracks && Array.isArray(b.tracks)) return b.tracks.length > 0 ? true : 'tracks array is empty';
      return `Unexpected response: ${JSON.stringify(b).substring(0, 200)}`;
    }));

    results.push(await checkEndpoint(token, '/api/parity.php?action=eventsWithStats', 'GET eventsWithStats', (b) => {
      if (b.events && Array.isArray(b.events)) return b.events.length > 0 ? true : 'events array is empty';
      return `Unexpected response: ${JSON.stringify(b).substring(0, 200)}`;
    }));

    results.push(await checkEndpoint(token, '/api/parity.php?action=listEngineCombos', 'GET listEngineCombos', (b) => {
      if (b.combos && Array.isArray(b.combos)) return b.combos.length > 0 ? true : 'combos array is empty';
      return `Unexpected response: ${JSON.stringify(b).substring(0, 200)}`;
    }));

    results.push(await checkEndpoint(token, '/api/parity.php?action=listDriverCombos', 'GET listDriverCombos', (b) => {
      if (b.combos && Array.isArray(b.combos)) return b.combos.length > 0 ? true : 'combos array is empty';
      return `Unexpected response: ${JSON.stringify(b).substring(0, 200)}`;
    }));

    results.push(await checkEndpoint(token, '/api/parity.php?action=paritySmokeTest', 'GET paritySmokeTest', (b) => {
      if (b.ok === true || b.success === true || b.status === 'ok') return true;
      return `Expected ok/success: ${JSON.stringify(b).substring(0, 200)}`;
    }));

    results.push(await checkEndpoint(token, '/api/auth.php?action=me', 'GET auth/me', (b) => {
      if (b.user && b.user.email) return `user: ${b.user.email}, plan: ${b.user.plan || 'N/A'}`;
      return `No user object: ${JSON.stringify(b).substring(0, 200)}`;
    }));

    results.push(await checkEndpoint(token, '/api/capabilities-endpoint.php', 'GET capabilities', (b) => {
      const caps = b.capabilities || b;
      if (Array.isArray(caps)) {
        const hasParity = caps.includes('nhra.parity');
        return hasParity ? `nhra.parity present (${caps.length} total)` : 'nhra.parity NOT in capabilities';
      }
      return `Unexpected response: ${JSON.stringify(b).substring(0, 200)}`;
    }));
  }

  const counts = printSummary('API Smoke Tests', results);
  writeResults('api', results);

  // Exit code: fail if any FAIL
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error in check-api.mjs:', e.message);
  process.exit(2);
});
