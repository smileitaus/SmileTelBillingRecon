import 'dotenv/config';

const apiKey = process.env.Carbon_SmiletelAPI;
const baseUrl = 'https://api.carbon.aussiebroadband.com.au';
console.log('API Key:', apiKey?.substring(0, 5) + '...');

// Try different auth methods
const methods = [
  { name: 'Bearer token', headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } },
  { name: 'X-API-Key header', headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' } },
  { name: 'Cookie header', headers: { 'cookie': `carbon_session=${apiKey}`, 'Accept': 'application/json' } },
  { name: 'Cookie raw', headers: { 'cookie': apiKey, 'Accept': 'application/json' } },
  { name: 'Api-Token header', headers: { 'Api-Token': apiKey, 'Accept': 'application/json' } },
];

for (const method of methods) {
  try {
    const res = await fetch(`${baseUrl}/carbon/services?page=1`, { headers: method.headers });
    const text = await res.text();
    console.log(`\n${method.name}: HTTP ${res.status}`);
    if (res.status === 200) {
      console.log('SUCCESS! Response:', text.substring(0, 500));
    } else {
      console.log('Response:', text.substring(0, 200));
    }
  } catch (err) {
    console.log(`${method.name}: ERROR - ${err.message}`);
  }
}

// Also try the Carbon Auth login endpoint
console.log('\n--- Trying Carbon Auth Login ---');
try {
  const loginRes = await fetch(`${baseUrl}/carbon/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ api_key: apiKey })
  });
  console.log('Login Status:', loginRes.status);
  const loginText = await loginRes.text();
  console.log('Login Response:', loginText.substring(0, 500));
  
  // Check set-cookie headers
  const cookies = loginRes.headers.get('set-cookie');
  console.log('Set-Cookie:', cookies);
} catch (err) {
  console.log('Login Error:', err.message);
}

// Try with api_token in body
console.log('\n--- Trying Carbon Auth with api_token ---');
try {
  const loginRes = await fetch(`${baseUrl}/carbon/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ token: apiKey })
  });
  console.log('Login Status:', loginRes.status);
  const loginText = await loginRes.text();
  console.log('Login Response:', loginText.substring(0, 500));
} catch (err) {
  console.log('Login Error:', err.message);
}
