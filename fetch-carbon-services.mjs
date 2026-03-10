import fs from 'fs';

const username = 'smiletel.api';
const password = 'HK#v3X44dUE\x24X%(Xj}';
const baseUrl = 'https://api.carbon.aussiebroadband.com.au';

// Login
console.log('Logging in...');
const loginRes = await fetch(`${baseUrl}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ username, password }),
});

if (loginRes.status !== 200) {
  console.error('Login failed:', loginRes.status);
  process.exit(1);
}

const loginData = await loginRes.json();
const cookies = loginRes.headers.get('set-cookie');
const cookieStr = (cookies || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
console.log('Login successful!');

// Fetch all services with pagination
let allServices = [];
let page = 1;
let hasMore = true;

while (hasMore) {
  const res = await fetch(`${baseUrl}/carbon/services?page=${page}`, {
    headers: { 'Accept': 'application/json', 'cookie': cookieStr },
  });
  
  if (res.status !== 200) {
    console.error(`Page ${page} failed:`, res.status);
    break;
  }
  
  const data = await res.json();
  const services = data.data || [];
  allServices.push(...services);
  console.log(`Page ${page}: ${services.length} services (total: ${allServices.length})`);
  
  if (data.next_page_url) {
    page++;
  } else {
    hasMore = false;
  }
}

console.log(`\n=== Total services: ${allServices.length} ===`);

// Analyze the data
const types = {};
const statuses = {};
const plans = {};
const networkTypes = {};
const fields = new Set();

for (const svc of allServices) {
  types[svc.type] = (types[svc.type] || 0) + 1;
  statuses[svc.status] = (statuses[svc.status] || 0) + 1;
  if (svc.plan?.name) plans[svc.plan.name] = (plans[svc.plan.name] || 0) + 1;
  if (svc.network_type) networkTypes[svc.network_type] = (networkTypes[svc.network_type] || 0) + 1;
  Object.keys(svc).forEach(k => fields.add(k));
}

console.log('\nService types:', JSON.stringify(types, null, 2));
console.log('\nStatuses:', JSON.stringify(statuses, null, 2));
console.log('\nNetwork types:', JSON.stringify(networkTypes, null, 2));
console.log('\nPlan names:', JSON.stringify(plans, null, 2));
console.log('\nAll fields:', [...fields].sort().join(', '));

// Extract key matching fields
console.log('\n=== Matching Data ===');
const matchData = allServices.map(svc => ({
  id: svc.id,
  type: svc.type,
  address: svc.address,
  alias: svc.alias,
  status: svc.status,
  monthlyCost: svc.monthly_cost_cents / 100,
  plan: svc.plan?.name,
  serviceIdentifier: svc.service_identifier,
  locationId: svc.location_id,
  ips: svc.network?.ips?.map(ip => ip.ip) || [],
  tags: svc.tags?.map(t => t.name || t) || [],
  cpes: svc.cpes || [],
  contract: svc.contract,
  poiName: svc.poi_name,
  networkType: svc.network_type,
  sla: svc.nbn_sla,
  supportPack: svc.support_pack,
  openDate: svc.open_date,
  circuitId: svc.circuit_id,
  downloadSpeed: svc.download_speed,
  uploadSpeed: svc.upload_speed,
  interfaceType: svc.interface_type,
}));

// Save full data to file for analysis
fs.writeFileSync('/home/ubuntu/carbon_services.json', JSON.stringify(allServices, null, 2));
fs.writeFileSync('/home/ubuntu/carbon_services_summary.json', JSON.stringify(matchData, null, 2));
console.log('\nSaved full data to /home/ubuntu/carbon_services.json');
console.log('Saved summary to /home/ubuntu/carbon_services_summary.json');

// Show sample services with addresses for matching
console.log('\n=== Sample services with addresses ===');
for (const svc of matchData.slice(0, 20)) {
  console.log(`  [${svc.type}] ${svc.alias || svc.address} | ${svc.serviceIdentifier || svc.circuitId || 'no-id'} | $${svc.monthlyCost}/mo | ${svc.status}`);
}
