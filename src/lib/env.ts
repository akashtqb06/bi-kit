import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CONNECTOR_SECRET_KEY: z.string().min(32, 'CONNECTOR_SECRET_KEY must be at least 32 characters'),
  APP_URL: z.string().url('APP_URL must be a valid URL').optional(),
  APP_EXTRA_ORIGINS: z.string().optional(),
  ALLOW_REGISTRATION: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8).optional(),
  BOOTSTRAP_ADMIN_NAME: z.string().optional(),
  BACKUP_EXCLUDE_SCHEMAS: z.string().optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Validates production environment variables.
 * Prints ONLY the names of missing or invalid variables, NEVER their values.
 */
export function validateEnv(env: Record<string, string | undefined> = process.env): {
  valid: boolean;
  errors: string[];
} {
  const result = envSchema.safeParse(env);
  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errorNames: string[] = [];
  for (const issue of result.error.issues) {
    const varName = issue.path.join('.');
    errorNames.push(`${varName}: ${issue.message}`);
  }

  return { valid: false, errors: errorNames };
}

export function assertValidEnv(env: Record<string, string | undefined> = process.env): void {
  const { valid, errors } = validateEnv(env);
  if (!valid) {
    console.error('❌ Environment validation failed for the following variables:');
    for (const err of errors) {
      console.error(`   - ${err}`);
    }
    throw new Error(`Invalid environment configuration: ${errors.map(e => e.split(':')[0]).join(', ')}`);
  }
}

