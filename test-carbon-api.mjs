import 'dotenv/config';

const apiKey = process.env.Carbon_SmiletelAPI;
console.log('API Key present:', !!apiKey, 'Length:', apiKey?.length);

try {
  const res = await fetch('https://api.carbon.aussiebroadband.com.au/carbon/services?page=1', {
    headers: {
      'Accept': 'application/json',
      'cookie': apiKey
    }
  });
  console.log('HTTP Status:', res.status);
  const text = await res.text();
  console.log('Response (first 2000 chars):', text.substring(0, 2000));
} catch (err) {
  console.error('Error:', err.message);
}
