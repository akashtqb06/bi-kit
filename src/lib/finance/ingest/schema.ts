import { z } from 'zod';

// ============================================================================
// Ingest payload schemas
// ============================================================================

export const INGEST_SOURCES = ['email', 'sms', 'api', 'n8n'] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];

export const INGEST_DIRECTIONS = ['debit', 'credit'] as const;
export type IngestDirection = (typeof INGEST_DIRECTIONS)[number];

const accountHintSchema = z.object({
  last4: z.string().regex(/^\d{4}$/, 'last4 must be exactly 4 digits').optional(),
  name: z.string().max(100).optional(),
});

export const ingestItemSchema = z.object({
  idempotencyKey: z
    .string()
    .min(1, 'idempotencyKey is required')
    .max(128, 'idempotencyKey too long'),
  source: z.enum(INGEST_SOURCES),
  receivedAt: z.string().datetime({ message: 'receivedAt must be an ISO 8601 datetime' }),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  amount: z
    .number()
    .int('amount must be an integer in paise')
    .positive('amount must be positive'),
  direction: z.enum(INGEST_DIRECTIONS),
  currency: z.string().length(3).default('INR'),
  merchant: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  accountHint: accountHintSchema.optional(),
  reference: z.string().max(128).optional(),
  raw: z
    .string()
    .optional()
    .transform((v) => (v ? v.slice(0, 2048) : v)),
});

export type IngestItemInput = z.input<typeof ingestItemSchema>;
export type IngestItem = z.output<typeof ingestItemSchema>;

export const ingestBatchSchema = z.object({
  items: z
    .array(ingestItemSchema)
    .min(1, 'At least one item required')
    .max(50, 'Maximum 50 items per request'),
});

export type IngestBatch = z.infer<typeof ingestBatchSchema>;

// ============================================================================
// Inbox query / action schemas
// ============================================================================

export const inboxFiltersSchema = z.object({
  status: z
    .enum(['pending', 'approved', 'rejected', 'duplicate'])
    .optional()
    .default('pending'),
  cursor: z.string().optional(),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null) return 50;
      const parsed = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(parsed) ? 50 : Math.min(Math.max(parsed, 1), 200);
    }),
});

export type InboxFilters = z.input<typeof inboxFiltersSchema>;

export const approveItemSchema = z.object({
  id: z.string(),
  accountId: z.string().min(1, 'Account is required for approval'),
  categoryId: z.string().optional().nullable(),
  payee: z.string().max(200).optional().nullable(),
  amount: z.number().int().positive().optional(),
  note: z.string().max(500).optional().nullable(),
});

export type ApproveItemInput = z.infer<typeof approveItemSchema>;

export const bulkApproveSchema = z.object({
  items: z.array(approveItemSchema).min(1).max(50),
});

export const bulkRejectSchema = z.object({
  ids: z.array(z.string()).min(1).max(50),
});

export const learnRuleSchema = z.object({
  categoryId: z.string().min(1),
});

// ============================================================================
// API Token schemas
// ============================================================================

export const TOKEN_SCOPES = ['finance:ingest', 'finance:read'] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const createApiTokenSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z
    .array(z.enum(TOKEN_SCOPES))
    .min(1, 'At least one scope required'),
  expiresAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(v) : null)),
});

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

// ============================================================================
// Webhook schemas
// ============================================================================

export const WEBHOOK_EVENTS = [
  'transaction.created',
  'budget.threshold',
  'card.due_soon',
  'valuation.updated',
  'inbox.pending',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const createWebhookEndpointSchema = z.object({
  url: z
    .string()
    .url('Must be a valid URL')
    .max(2048)
    .refine(
      (url) => url.startsWith('https://') || url.startsWith('http://'),
      'URL must use http or https'
    ),
  secret: z.string().min(16, 'Secret must be at least 16 characters').max(256),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, 'At least one event required'),
  enabled: z.boolean().default(true),
});

export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;

export const updateWebhookEndpointSchema = z.object({
  url: z.string().url().max(2048).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  enabled: z.boolean().optional(),
});
