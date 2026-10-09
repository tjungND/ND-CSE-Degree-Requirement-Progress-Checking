// Which public-transcript fixtures pass right now, and which still fail on
// what. Since 2026-10-09 an alias of the replay (scripts/dev/replay.mts):
//   node --experimental-strip-types scripts/dev/public-status.mts [name]
// is `npm run replay -- --corpus public [--only name]` — kept under this name
// because the docs cite it. The headline agrees with tests/public-transcripts
// .test.ts: "exact 122/127 … known-failing 5 (5 still failing …) test: passes".
import { runReplay } from './replay.mts';

const name = process.argv[2];
process.exitCode = await runReplay(['--corpus', 'public', ...(name !== undefined ? ['--only', name] : [])]);
