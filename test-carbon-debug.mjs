import 'dotenv/config';

const username = process.env.CARBON_USERNAME;
const password = process.env.CARBON_PASSWORD;

console.log('Username:', JSON.stringify(username));
console.log('Password:', JSON.stringify(password));
console.log('Password length:', password?.length);
console.log('Password chars:', [...(password || '')].map((c, i) => `${i}:${c}(${c.charCodeAt(0)})`).join(' '));

const baseUrl = 'https://api.carbon.aussiebroadband.com.au';

// Try login with exact credentials
const body = JSON.stringify({ username, password });
console.log('\nRequest body:', body);

try {
  const res = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body,
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text);
} catch (err) {
  console.log('Error:', err.message);
}
