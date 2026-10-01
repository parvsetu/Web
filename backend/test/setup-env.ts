import { config } from 'dotenv';
import { resolve } from 'path';

// Tests only ever use .env.test (local docker DB `parvsetu_test`), never .env.
config({ path: resolve(__dirname, '../.env.test'), override: true, quiet: true });
process.env.SCAN_RATE_LIMIT_PER_MIN ??= '100000';
process.env.RATE_LIMIT_PER_MIN ??= '100000';
