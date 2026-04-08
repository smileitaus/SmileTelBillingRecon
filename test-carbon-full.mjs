const prefix = process.env.CARBON_PASSWORD_PREFIX;
const suffix = process.env.CARBON_PASSWORD_SUFFIX;
const password = prefix + '$X' + suffix;
const username = process.env.CARBON_USERNAME;
const base = 'https://api.carbon.aussiebroadband.com.au';

console.log('Assembled password length:', password.length);
console.log('Has $:', password.includes('$'));

const res = await fetch(base + '/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password }),
});

console.log('Login status:', res.status);
const body = await res.text();

if (!res.ok) {
  console.log('Login FAILED:', body.substring(0, 200));
  process.exit(1);
}

const cookies = res.headers.get('set-cookie');
const cookieStr = (cookies || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
console.log('Login SUCCESS. Cookie present:', !!cookieStr);

const svcRes = await fetch(base + '/carbon/services?page=1', {
  headers: { 'Accept': 'application/json', 'cookie': cookieStr },
});
console.log('Services status:', svcRes.status);
const svcBody = await svcRes.text();
const data = JSON.parse(svcBody);
console.log('Total services:', data.total);
console.log('Per page:', data.per_page);
console.log('Last page:', data.last_page);

if (data.data && data.data.length > 0) {
  const s = data.data[0];
  console.log('Sample service fields:', Object.keys(s).join(', '));
  console.log('Sample service:', JSON.stringify({
    id: s.id,
    alias: s.alias,
    status: s.status,
    monthly_cost_cents: s.monthly_cost_cents,
    plan: s.plan?.name,
    service_identifier: s.service_identifier,
    circuit_id: s.circuit_id,
    address: s.address,
  }, null, 2));
}
