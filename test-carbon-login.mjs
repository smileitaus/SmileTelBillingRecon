import 'dotenv/config';

const apiKey = process.env.Carbon_SmiletelAPI;
const username = 'support@smiletel.com.au';
const baseUrl = 'https://api.carbon.aussiebroadband.com.au';

console.log('Username:', username);
console.log('Password present:', !!apiKey, 'Length:', apiKey?.length);

// Try Carbon Auth login with username/password
const loginEndpoints = [
  '/carbon/auth',
  '/carbon/auth/login',
  '/auth/login',
  '/api/login',
  '/login',
];

// First try the standard Carbon auth endpoint with POST
for (const endpoint of loginEndpoints) {
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, password: apiKey }),
    });
    console.log(`\nPOST ${endpoint}: HTTP ${res.status}`);
    const cookies = res.headers.get('set-cookie');
    if (cookies) console.log('Set-Cookie:', cookies.substring(0, 200));
    const text = await res.text();
    console.log('Response:', text.substring(0, 500));
    
    if (res.status === 200 || res.status === 201) {
      console.log('\n=== SUCCESS! ===');
      // Try to use the session to list services
      const cookieStr = cookies || '';
      const sessionCookie = cookieStr.match(/carbon_session=[^;]+/)?.[0] || cookieStr.match(/([^=]+=[^;]+)/)?.[0] || '';
      console.log('Session cookie:', sessionCookie.substring(0, 50));
      
      const servicesRes = await fetch(`${baseUrl}/carbon/services?page=1`, {
        headers: { 
          'Accept': 'application/json',
          'cookie': sessionCookie,
        },
      });
      console.log('Services API Status:', servicesRes.status);
      const servicesText = await servicesRes.text();
      console.log('Services Response:', servicesText.substring(0, 1000));
      break;
    }
  } catch (err) {
    console.log(`POST ${endpoint}: ERROR - ${err.message}`);
  }
}

// Also try with email field instead of username
console.log('\n--- Trying with email field ---');
try {
  const res = await fetch(`${baseUrl}/carbon/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email: username, password: apiKey }),
  });
  console.log(`POST /carbon/auth (email): HTTP ${res.status}`);
  const text = await res.text();
  console.log('Response:', text.substring(0, 500));
  const cookies = res.headers.get('set-cookie');
  if (cookies) console.log('Set-Cookie:', cookies.substring(0, 200));
} catch (err) {
  console.log('Error:', err.message);
}
