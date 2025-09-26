import { readLeadsCsv, Lead } from '../utils/fileUtils.js';

function main(): void {
  const leads: Lead[] = readLeadsCsv('src/data/leads.csv');
  console.log(JSON.stringify(leads, null, 2));
  if (!leads.length) {
    console.warn('No leads found. Ensure src/data/leads.csv has headers: name,phone,businessName,promptVariant');
  } else {
    console.log(`Parsed ${leads.length} lead(s).`);
  }
}

main();


