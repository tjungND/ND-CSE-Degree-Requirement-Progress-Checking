// Print the Grad Admin request for the example Ph.D. record on a given day
// (dev aid, 2026-09-28): node --experimental-strip-types scripts/dev/ga-sample.mts [YYYY-MM-DD]
import { rulesFromSnapshot } from '../../src/data/load.ts';
import { audit } from '../../src/engine/audit.ts';
import { exampleFor } from '../../src/ui/example.ts';
import { gradAdminRequest } from '../../src/ui/grad-admin-request.ts';
const today = process.argv[2] ?? '2026-09-28';
const rules = rulesFromSnapshot();
const s = exampleFor('phd', today);
const r = audit(s, rules, today);
const g = gradAdminRequest(r, s, rules, { todayIso: today, entryTerm: 'Fall 2025', priorStudy: 'No prior graduate study', gpa: s.gpa });
console.log(g.text);
console.log('=====HTML');
console.log(g.html);
// …and the advisor summary, in the same style (2026-09-28).
import { advisorSummary } from '../../src/ui/advisor-summary.ts';
const a = advisorSummary(r, { todayIso: today, entryTerm: 'Fall 2025', priorStudy: 'No prior graduate study', gpa: s.gpa, advisors: ['Prof. Example'] });
console.log('=====ADVISOR TEXT');
console.log(a.text);
console.log('=====ADVISOR HTML');
console.log(a.html);
