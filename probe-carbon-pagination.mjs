// Probe Carbon API pagination structure
const prefix = process.env.CARBON_PASSWORD_PREFIX;
const suffix = process.env.CARBON_PASSWORD_SUFFIX;
const password = prefix + '$X' + suffix;
const username = process.env.CARBON_USERNAME;
const base = 'https://api.carbon.aussiebroadband.com.au';

// Login
const loginRes = await fetch(`${base}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password }),
});
if (!loginRes.ok) { console.error('Login failed'); process.exit(1); }

const cookies = loginRes.headers.get('set-cookie');
const cookieStr = (cookies || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
console.log('Logged in. Fetching page 1...');

const r = await fetch(`${base}/carbon/services?page=1`, {
  headers: { 'Accept': 'application/json', 'cookie': cookieStr },
});
const raw = await r.text();
const d = JSON.parse(raw);

console.log('Top-level keys:', Object.keys(d).join(', '));

// Check if it's a paginated response or a flat array
if (Array.isArray(d)) {
  console.log('Response is a flat array. Length:', d.length);
  if (d.length > 0) {
    console.log('First item keys:', Object.keys(d[0]).join(', '));
  }
} else {
  console.log('current_page:', d.current_page);
  console.log('last_page:', d.last_page);
  console.log('total:', d.total);
  console.log('per_page:', d.per_page);
  console.log('next_page_url:', d.next_page_url);
  console.log('data is array:', Array.isArray(d.data), 'length:', d.data?.length);
  
  // Check for nested pagination
  if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
    console.log('data sub-keys:', Object.keys(d.data).join(', '));
  }
  
  // Maybe it's directly in the response
  const firstItem = Array.isArray(d.data) ? d.data[0] : null;
  if (firstItem) {
    console.log('\nFirst service keys:', Object.keys(firstItem).join(', '));
    console.log('First service sample:', JSON.stringify({
      id: firstItem.id,
      alias: firstItem.alias,
      status: firstItem.status,
      monthly_cost_cents: firstItem.monthly_cost_cents,
    }));
  }
}

// Try fetching page 2 to understand pagination
console.log('\n--- Fetching page 2 ---');
const r2 = await fetch(`${base}/carbon/services?page=2`, {
  headers: { 'Accept': 'application/json', 'cookie': cookieStr },
});
const d2 = await r2.json();
console.log('Page 2 top-level keys:', Object.keys(d2).join(', '));
if (Array.isArray(d2)) {
  console.log('Page 2 is array, length:', d2.length);
} else {
  console.log('Page 2 current_page:', d2.current_page, 'data length:', d2.data?.length);
}

// Try with per_page parameter
console.log('\n--- Fetching with per_page=100 ---');
const r3 = await fetch(`${base}/carbon/services?page=1&per_page=100`, {
  headers: { 'Accept': 'application/json', 'cookie': cookieStr },
});
const d3 = await r3.json();
console.log('With per_page=100, top-level keys:', Object.keys(d3).join(', '));
if (Array.isArray(d3)) {
  console.log('Array length:', d3.length);
} else {
  console.log('per_page:', d3.per_page, 'total:', d3.total, 'data length:', d3.data?.length);
}
