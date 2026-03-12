import 'dotenv/config';

const ABBREV_MAP: Record<string, string> = {
  'mc': 'medical centre',
  'med': 'medical',
  'pk': 'park',
  'mt': 'mount',
  'nth': 'north',
  'sth': 'south',
  'hb': 'hervey bay',
  'hbay': 'hervey bay',
  'br': 'broadbeach',
  'sc': 'specialist centre',
  'fc': 'family clinic',
  'cl': 'clinic',
  'hosp': 'hospital',
  'doc': 'doctor',
  'docs': 'doctors',
  'pharm': 'pharmacy',
  'chem': 'chemist',
  'ctr': 'centre',
  'out': '',
  'in': '',
  'outbound': '',
  'inbound': '',
  'admin': 'admin',
};

function splitCamelCase(s: string): string[] {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 0);
}

function expandTokens(tokens: string[]): string[] {
  const expanded: string[] = [];
  for (const t of tokens) {
    const exp = ABBREV_MAP[t];
    if (exp === '') continue;
    if (exp !== undefined) {
      expanded.push(...exp.split(' ').filter(Boolean));
    } else {
      expanded.push(t);
    }
  }
  return expanded;
}

function scorePrefixMatch(abbrev: string, fullName: string): number {
  const abbrevTokens = expandTokens(splitCamelCase(abbrev));
  const fullTokens = splitCamelCase(fullName);
  if (abbrevTokens.length === 0) return 0;
  let matchedCount = 0;
  for (const at of abbrevTokens) {
    if (at.length < 2) continue;
    const matched = fullTokens.some(ft =>
      ft.startsWith(at) || at.startsWith(ft.slice(0, Math.min(ft.length, at.length + 2)))
    );
    if (matched) matchedCount++;
  }
  const significant = abbrevTokens.filter(t => t.length >= 2).length;
  return significant > 0 ? Math.round((matchedCount / significant) * 100) : 0;
}

// Test cases
const testCases = [
  { abbrev: 'WarwkMCIn', customers: ['Warwick Medical Centre', 'Banyo Village Medical Centre', 'Warwick Entertainment Centre'] },
  { abbrev: 'WarwkMCOut', customers: ['Warwick Medical Centre', 'Banyo Village Medical Centre'] },
  { abbrev: 'BeenleighMC', customers: ['Banyo Village Medical Centre', 'Beenleigh Road Medical Practice', 'Beenleigh Medical Centre'] },
  { abbrev: 'MtCottnMCIN', customers: ['A M Emerick & T J Morrice', 'Mt Cotton Medical Centre', 'Mount Cotton Medical Centre'] },
  { abbrev: 'RodeMedATA', customers: ['Rode Medical Clinic', 'A M Emerick & T J Morrice'] },
  { abbrev: 'ComplCDocATA', customers: ['Complete Care Doctors', 'Doctors At Kawana Shopping World'] },
];

for (const tc of testCases) {
  console.log(`\n=== ${tc.abbrev} ===`);
  const tokens = expandTokens(splitCamelCase(tc.abbrev));
  console.log('Expanded tokens:', tokens);
  for (const cust of tc.customers) {
    const score = scorePrefixMatch(tc.abbrev, cust);
    const custTokens = splitCamelCase(cust);
    console.log(`  ${cust}: ${score}% (cust tokens: ${custTokens.join(', ')})`);
  }
}
