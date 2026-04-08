const mysql = require('mysql2/promise');
const fs = require('fs');
const numbers = JSON.parse(fs.readFileSync('/home/ubuntu/channelhaus_numbers.json','utf8'));

function formatNumber(digits) {
  if (digits.startsWith('1800') && digits.length === 10) return '1800 '+digits.slice(4,7)+' '+digits.slice(7);
  if (digits.startsWith('1300') && digits.length === 10) return '1300 '+digits.slice(4,7)+' '+digits.slice(7);
  if (digits.startsWith('04') && digits.length === 10) return digits.slice(0,4)+' '+digits.slice(4,7)+' '+digits.slice(7);
  if (digits.length === 10) return digits.slice(0,2)+' '+digits.slice(2,6)+' '+digits.slice(6);
  return digits;
}
function classifyNumber(digits) {
  if (digits.startsWith('1800')) return 'tollfree';
  if (digits.startsWith('1300') || digits.startsWith('13')) return 'local';
  if (digits.startsWith('04')) return 'mobile';
  if (digits.startsWith('0')) return 'geographic';
  return 'other';
}

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  let inserted=0, updated=0, skipped=0;

  for (const n of numbers) {
    const raw = n.number || '';
    const digits = raw.replace(/\D/g,'');
    if (digits.length < 6) { skipped++; continue; }
    const display = formatNumber(digits);
    const type = n.type === 'vanity' ? 'tollfree' : classifyNumber(digits);
    let status = (n.status || 'active');
    status = status.replace('Active (Verify Address)','active').replace('Active','active').replace('Not Verified','unverified').toLowerCase();

    const [existing] = await conn.execute(
      'SELECT id FROM phone_numbers WHERE `number`=? AND provider=?',
      [digits, 'Channel Haus']
    );

    if (existing.length > 0) {
      await conn.execute(
        'UPDATE phone_numbers SET numberDisplay=?,numberType=?,status=?,providerServiceCode=?,notes=?,address=?,dataSource=?,lastSyncedAt=NOW() WHERE id=?',
        [display, type, status, n.serviceCode||'', n.friendlyName||'', n.address||'', 'channelhaus_portal', existing[0].id]
      );
      updated++;
    } else {
      await conn.execute(
        'INSERT INTO phone_numbers (`number`,numberDisplay,numberType,provider,status,providerServiceCode,customerName,customerExternalId,serviceExternalId,servicePlanName,monthlyCost,monthlyRevenue,notes,address,dataSource,lastSyncedAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())',
        [digits, display, type, 'Channel Haus', status, n.serviceCode||'', '', '', '', n.friendlyName||'', '0', '0', n.friendlyName||'', n.address||'', 'channelhaus_portal']
      );
      inserted++;
    }
  }

  // Auto-link to customers via services table
  const [link] = await conn.execute(`
    UPDATE phone_numbers pn
    JOIN services s ON (
      LOWER(s.planName) = LOWER(pn.providerServiceCode)
      OR LOWER(s.externalId) = LOWER(pn.serviceExternalId)
    )
    SET
      pn.customerName = COALESCE(NULLIF(s.customerName,''), pn.customerName),
      pn.customerExternalId = COALESCE(NULLIF(s.customerExternalId,''), pn.customerExternalId),
      pn.serviceExternalId = COALESCE(NULLIF(s.externalId,''), pn.serviceExternalId),
      pn.monthlyCost = COALESCE(NULLIF(s.monthlyCost,0), pn.monthlyCost),
      pn.monthlyRevenue = COALESCE(NULLIF(s.monthlyRevenue,0), pn.monthlyRevenue)
    WHERE pn.provider = 'Channel Haus'
  `);

  console.log('Channel Haus numbers seeded:');
  console.log('  Inserted:', inserted);
  console.log('  Updated:', updated);
  console.log('  Skipped:', skipped);
  console.log('  Auto-linked:', link.affectedRows);

  await conn.end();
})().catch(err => { console.error(err); process.exit(1); });
