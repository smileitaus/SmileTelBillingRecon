import { config } from 'dotenv';
config();

const clientId = 'aed4409d4a244221b9fd904ae96c5119';
const clientSecret = '0f174e9c88e048fdad4306ad51957cfe';
const omadacId = '2e61e281178b7a20ffde35e2d10bc855';
const BASE = 'https://aps1-omada-northbound.tplinkcloud.com';

async function testSites(label) {
  const tokenRes = await fetch(`${BASE}/openapi/authorize/token?grant_type=client_credentials`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ omadacId, client_id: clientId, client_secret: clientSecret })
  });
  const tokenJson = await tokenRes.json();
  const tok = tokenJson.result?.accessToken;
  if (!tok) {
    console.log(`[${label}] Token FAIL: ec=${tokenJson.errorCode}`);
    return false;
  }
  const r = await fetch(`${BASE}/openapi/v1/${omadacId}/sites?pageSize=10&page=1`, {
    headers: { 'Authorization': 'AccessToken ' + tok }
  });
  const j = await r.json();
  if (j.errorCode === 0) {
    console.log(`[${label}] ✅ SUCCESS! Sites: ${j.result?.totalRows}`);
    j.result?.data?.forEach(s => console.log(`  - ${s.name} (${s.id})`));
    return true;
  } else {
    console.log(`[${label}] ❌ ec=${j.errorCode} ${j.msg?.substring(0,50)}`);
    return false;
  }
}

// Try immediately
await testSites('immediate');

// Wait 30s and retry
console.log('Waiting 30s...');
await new Promise(r => setTimeout(r, 30000));
await testSites('30s');

// Wait another 30s
console.log('Waiting another 30s...');
await new Promise(r => setTimeout(r, 30000));
await testSites('60s');
