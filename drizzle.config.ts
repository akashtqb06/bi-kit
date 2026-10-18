import type { Config } from 'drizzle-kit';
import { APP_DB_PATH } from './src/lib/db/paths';

export default {
    schema: './src/lib/db/schema.ts',
    out: './src/lib/db/migrations',
    dialect: 'sqlite',
    dbCredentials: {
        url: APP_DB_PATH,
    },
} satisfies Config;
