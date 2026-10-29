import type { Config } from 'drizzle-kit';

export default {
    schema: ['./src/lib/db/schema.ts', './src/lib/db/schema/finance.ts', './src/lib/db/schema/data-store.ts'],
    out: './src/lib/db/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL || 'postgres://postgres:bi_password_123!@localhost:5432/bikit_dev',
    },
} satisfies Config;
