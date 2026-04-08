// Probe the Carbon API with the confirmed credentials:
// CARBON_USERNAME = smiletel.api
// CARBON_API = the API key (also stored as CARBON_PASSWORD)
// Correct login endpoint: /carbon/auth/login

const username = process.env.CARBON_USERNAME; // smiletel.api
const apiKey = process.env.CARBON_API;         // the API key
const base = 'https://api.carbon.aussiebroadband.com.au';

console.log('=== Carbon API Auth Probe ===');
console.log('CARBON_USERNAME:', username ? `"${username}"` : 'NOT SET');
console.log('CARBON_API present:', !!apiKey, '| Length:', apiKey?.length);

if (!username || !apiKey) {
  console.error('ERROR: Required env vars not set');
  process.exit(1);
}

// --- Attempt 1: /carbon/auth/login with username + apiKey as password ---
console.log('\n--- Attempt 1: POST /carbon/auth/login (username + apiKey as password) ---');
const res1 = await fetch(`${base}/carbon/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password: apiKey }),
});
console.log('Status:', res1.status);
const cookies1 = res1.headers.get('set-cookie');
console.log('Set-Cookie:', cookies1 ? cookies1.substring(0, 200) : 'none');
const body1 = await res1.text();
console.log('Body:', body1.substring(0, 500));

if (res1.ok) {
  console.log('\n✓ SUCCESS with /carbon/auth/login + username/password');
  const sessionCookie = cookies1?.match(/carbon_session=[^;]+/)?.[0] || '';
  await probeServices(sessionCookie, null);
  process.exit(0);
}

// --- Attempt 2: /login with username + apiKey ---
console.log('\n--- Attempt 2: POST /login (username + apiKey as password) ---');
const res2 = await fetch(`${base}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password: apiKey }),
});
console.log('Status:', res2.status);
const cookies2 = res2.headers.get('set-cookie');
const body2 = await res2.text();
console.log('Body:', body2.substring(0, 300));

if (res2.ok) {
  console.log('\n✓ SUCCESS with /login');
  const sessionCookie = cookies2?.match(/carbon_session=[^;]+/)?.[0] || '';
  await probeServices(sessionCookie, null);
  process.exit(0);
}

// --- Attempt 3: Bearer token directly ---
console.log('\n--- Attempt 3: GET /carbon/services with Bearer token ---');
const res3 = await fetch(`${base}/carbon/services?page=1`, {
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
});
console.log('Status:', res3.status);
const body3 = await res3.text();
console.log('Body:', body3.substring(0, 400));

if (res3.ok) {
  console.log('\n✓ SUCCESS with Bearer token directly');
  process.exit(0);
}

// --- Attempt 4: /carbon/auth/login with api_key field ---
console.log('\n--- Attempt 4: POST /carbon/auth/login with api_key field ---');
const res4 = await fetch(`${base}/carbon/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ api_key: apiKey }),
});
console.log('Status:', res4.status);
const body4 = await res4.text();
console.log('Body:', body4.substring(0, 300));

// --- Attempt 5: /carbon/auth/login with token field ---
console.log('\n--- Attempt 5: POST /carbon/auth/login with token field ---');
const res5 = await fetch(`${base}/carbon/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ token: apiKey }),
});
console.log('Status:', res5.status);
const body5 = await res5.text();
console.log('Body:', body5.substring(0, 300));

console.log('\n✗ All auth attempts failed. The credentials may need to be reset in the ABB Carbon portal.');

async function probeServices(sessionCookie, bearerToken) {
  console.log('\n--- Probing /carbon/services?page=1 ---');
  const headers = { 'Accept': 'application/json' };
  if (sessionCookie) headers['cookie'] = sessionCookie;
  if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
  
  const res = await fetch(`${base}/carbon/services?page=1`, { headers });
  console.log('Services status:', res.status);
  const body = await res.text();
  console.log('Services body (first 600):', body.substring(0, 600));
  
  try {
    const data = JSON.parse(body);
    if (data.data) {
      console.log('\nTotal services in API:', data.total || data.meta?.total || '?');
      console.log('Per page:', data.per_page || data.meta?.per_page || '?');
      console.log('Sample service keys:', Object.keys(data.data[0] || {}).join(', '));
    }
  } catch(e) {}
}
