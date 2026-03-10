const username = 'smiletel.api';
const password = 'HK#v3X44dUE\x24X%(Xj}';

console.log('Username:', JSON.stringify(username));
console.log('Password:', JSON.stringify(password));
console.log('Password length:', password.length);

const baseUrl = 'https://api.carbon.aussiebroadband.com.au';

try {
  const res = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text.substring(0, 1000));
  
  const cookies = res.headers.get('set-cookie');
  if (cookies) console.log('Set-Cookie:', cookies.substring(0, 300));
  
  if (res.status === 200) {
    console.log('\n=== LOGIN SUCCESS! ===');
    // Try fetching services with the session
    const sessionMatch = cookies?.match(/carbon_session=([^;]+)/);
    const allCookies = (cookies || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
    console.log('Using cookies:', allCookies.substring(0, 200));
    
    const servRes = await fetch(`${baseUrl}/carbon/services?page=1`, {
      headers: { 'Accept': 'application/json', 'cookie': allCookies },
    });
    console.log('\nServices Status:', servRes.status);
    const servText = await servRes.text();
    console.log('Services Response:', servText.substring(0, 2000));
  }
} catch (err) {
  console.log('Error:', err.message);
}
