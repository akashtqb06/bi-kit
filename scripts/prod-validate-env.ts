import { assertValidEnv } from '../src/lib/env';

try {
  assertValidEnv();
  console.log('✅ Environment configuration validated successfully.');
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

