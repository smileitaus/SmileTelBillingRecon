const username = process.env.CARBON_USERNAME;
const password = process.env.CARBON_PASSWORD;

console.log('CARBON_USERNAME present:', !!username, '| Length:', username?.length);
console.log('CARBON_PASSWORD present:', !!password, '| Length:', password?.length);

if (!username || !password) {
  console.error('ERROR: Credentials not set in environment');
  process.exit(1);
}

const baseUrl = 'https://api.carbon.aussiebroadband.com.au';

try {
  const res = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  console.log('Login status:', res.status);
  const body = await res.text();
  console.log('Response body:', body.substring(0, 800));

  if (res.ok) {
    console.log('\n✓ Carbon API login SUCCESSFUL');
    const cookies = res.headers.get('set-cookie');
    console.log('Set-Cookie header present:', !!cookies);
    
    // Try to parse and use the session
    let data;
    try { data = JSON.parse(body); } catch(e) { data = null; }
    if (data) {
      console.log('Response keys:', Object.keys(data));
    }
  } else {
    console.log('\n✗ Carbon API login FAILED with status', res.status);
    
    // Try alternate field names
    console.log('\nTrying with "email" field instead of "username"...');
    const res2 = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email: username, password }),
    });
    console.log('Email-field login status:', res2.status);
    const body2 = await res2.text();
    console.log('Response body:', body2.substring(0, 400));
  }
} catch (err) {
  console.error('Network error:', err.message);
}
