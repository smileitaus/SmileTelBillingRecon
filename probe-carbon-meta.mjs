const prefix = process.env.CARBON_PASSWORD_PREFIX;
const suffix = process.env.CARBON_PASSWORD_SUFFIX;
const password = prefix + '$X' + suffix;
const username = process.env.CARBON_USERNAME;
const base = 'https://api.carbon.aussiebroadband.com.au';

const loginRes = await fetch(`${base}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const cookies = loginRes.headers.get('set-cookie');
const cookieStr = (cookies || '').split(',').map(c => c.trim().split(';')[0]).join('; ');

const r = await fetch(`${base}/carbon/services?page=1&per_page=100`, {
  headers: { 'Accept': 'application/json', 'cookie': cookieStr },
});
const d = await r.json();

console.log('meta:', JSON.stringify(d.meta, null, 2));
console.log('links:', JSON.stringify(d.links, null, 2));
console.log('data.length:', d.data?.length);

// Fetch page 2 and 3 to understand total
const r2 = await fetch(`${base}/carbon/services?page=2&per_page=100`, {
  headers: { 'Accept': 'application/json', 'cookie': cookieStr },
});
const d2 = await r2.json();
console.log('\nPage 2 meta:', JSON.stringify(d2.meta, null, 2));
console.log('Page 2 data.length:', d2.data?.length);
console.log('Page 2 links:', JSON.stringify(d2.links, null, 2));

const r3 = await fetch(`${base}/carbon/services?page=3&per_page=100`, {
  headers: { 'Accept': 'application/json', 'cookie': cookieStr },
});
const d3 = await r3.json();
console.log('\nPage 3 data.length:', d3.data?.length);

const r4 = await fetch(`${base}/carbon/services?page=4&per_page=100`, {
  headers: { 'Accept': 'application/json', 'cookie': cookieStr },
});
const d4 = await r4.json();
console.log('Page 4 data.length:', d4.data?.length);

console.log('\nTotal across pages 1-4:', (d.data?.length||0) + (d2.data?.length||0) + (d3.data?.length||0) + (d4.data?.length||0));
