import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  // Discord
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_APPLICATION_ID: z.string().min(1),

  // Continuum API
  CONTINUUM_API_BASE_URL: z.string().url(),
  CONTINUUM_OAUTH_ISSUER_URL: z.string().url(),
  CONTINUUM_OAUTH_CLIENT_ID: z.string().optional(),
  CONTINUUM_OAUTH_CLIENT_NAME: z.string().default('Continuum Discord Bot'),
  CONTINUUM_OAUTH_REDIRECT_URI: z.string().url(),

  // Bot service
  BOT_PUBLIC_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)'),
  BOT_STATE_SIGNING_KEY: z
    .string()
    .min(32, 'BOT_STATE_SIGNING_KEY must be at least 32 chars'),
  DATABASE_URL: z.string().url(),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4.1'),

  // Optional
  ALLOWED_GUILD_IDS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
