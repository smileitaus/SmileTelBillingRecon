const username = process.env.CARBON_USERNAME;
const password = process.env.CARBON_PASSWORD;
const apiKey = process.env.CARBON_API;

console.log('=== Carbon API Probe ===');
console.log('CARBON_USERNAME:', username ? `"${username}" (${username.length} chars)` : 'NOT SET');
console.log('CARBON_PASSWORD:', password ? `[${password.length} chars]` : 'NOT SET');
console.log('CARBON_API:', apiKey ? `[${apiKey.length} chars]` : 'NOT SET');

const base = 'https://api.carbon.aussiebroadband.com.au';

async function tryRequest(label, url, options = {}) {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
    const body = await res.text();
    console.log(`\n[${label}] ${options.method || 'GET'} ${url}`);
    console.log(`  Status: ${res.status}`);
    console.log(`  Body: ${body.substring(0, 200)}`);
    return { status: res.status, body };
  } catch (err) {
    console.log(`\n[${label}] ERROR: ${err.message}`);
    return null;
  }
}

// 1. Try login with username/password
await tryRequest('Login username/password', `${base}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password }),
});

// 2. Try login with email field
await tryRequest('Login email/password', `${base}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ email: username, password }),
});

// 3. Try /v2/login
await tryRequest('v2 login', `${base}/v2/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password }),
});

// 4. Try API key as X-API-Key header
await tryRequest('API Key header on /services', `${base}/services`, {
  headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
});

// 5. Try API key on /service (singular)
await tryRequest('API Key header on /service', `${base}/service`, {
  headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
});

// 6. Try /oauth/token
await tryRequest('OAuth token', `${base}/oauth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ grant_type: 'password', username, password, client_id: 'carbon' }),
});

// 7. Try /api/login
await tryRequest('API login', `${base}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password }),
});

// 8. Try the root to see what's available
await tryRequest('Root endpoint', `${base}/`, {
  headers: { 'Accept': 'application/json' },
});
