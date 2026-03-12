import 'dotenv/config';
import { previewAddressAutoMatch } from './server/db';

async function main() {
  console.log('Running previewAddressAutoMatch...');
  const result = await previewAddressAutoMatch(40); // lower threshold to see more
  
  console.log('\n=== Stats ===');
  console.log(result.stats);
  
  console.log('\n=== Top 30 candidates ===');
  result.candidates.slice(0, 30).forEach(c => {
    console.log(JSON.stringify({
      svcId: c.serviceExternalId,
      type: c.serviceType,
      plan: c.planName.slice(0, 50),
      source: c.matchSource,
      matched: c.matchedText.slice(0, 50),
      customer: c.suggestedCustomerName.slice(0, 40),
      conf: c.confidence,
      tier: c.tier,
    }));
  });
  
  console.log('\n=== Voice/Unknown provider matches ===');
  const voiceMatches = result.candidates.filter(c => c.serviceType === 'Voice' || c.provider === 'Unknown');
  console.log('Voice/Unknown matches found:', voiceMatches.length);
  voiceMatches.slice(0, 20).forEach(c => {
    console.log(JSON.stringify({
      plan: c.planName.slice(0, 50),
      customer: c.suggestedCustomerName.slice(0, 40),
      conf: c.confidence,
      tier: c.tier,
    }));
  });
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
