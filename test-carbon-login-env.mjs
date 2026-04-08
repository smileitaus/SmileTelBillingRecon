const username = process.env.CARBON_USERNAME;
const password = process.env.CARBON_PASSWORD;
const apiKey = process.env.CARBON_API;
const base = 'https://api.carbon.aussiebroadband.com.au';

console.log('CARBON_USERNAME:', username ? `"${username}"` : 'NOT SET');
console.log('CARBON_PASSWORD length:', password?.length ?? 'NOT SET');
console.log('CARBON_API length:', apiKey?.length ?? 'NOT SET');
console.log('CARBON_PASSWORD === CARBON_API:', password === apiKey);

// Try login with CARBON_PASSWORD
console.log('\n--- Login with CARBON_PASSWORD ---');
const res = await fetch(`${base}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password }),
});
console.log('Status:', res.status);
const body = await res.text();
if (res.ok) {
  const cookies = res.headers.get('set-cookie');
  const cookieStr = (cookies || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
  console.log('✓ Login successful! Cookie present:', !!cookieStr);

  // Try fetching page 1 of services
  const svcRes = await fetch(`${base}/carbon/services?page=1`, {
    headers: { 'Accept': 'application/json', 'cookie': cookieStr },
  });
  console.log('\nServices page 1 status:', svcRes.status);
  const svcBody = await svcRes.text();
  try {
    const data = JSON.parse(svcBody);
    console.log('Total services:', data.total ?? data.meta?.total ?? '?');
    console.log('Per page:', data.per_page ?? data.meta?.per_page ?? '?');
    if (data.data?.length > 0) {
      const s = data.data[0];
      console.log('Sample service fields:', Object.keys(s).join(', '));
      console.log('Sample service:', JSON.stringify({
        id: s.id,
        alias: s.alias,
        address: s.address,
        status: s.status,
        monthly_cost_cents: s.monthly_cost_cents,
        plan: s.plan?.name,
        service_identifier: s.service_identifier,
        circuit_id: s.circuit_id,
      }, null, 2));
    }
  } catch(e) {
    console.log('Raw body:', svcBody.substring(0, 400));
  }
} else {
  console.log('✗ Login failed:', body.substring(0, 300));
}
