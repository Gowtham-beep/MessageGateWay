import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  PROVIDER_PORT: z.coerce.number().default(4000),
  NEXUS_TOKEN: z.string().default('mock_nexus'),
  ORBIT_API_KEY: z.string().default('mock_orbit'),
  NEXUS_WEBHOOK_SECRET: z.string().default('mock_secret'),
  DB_PATH: z.string().default('./data.sqlite'),
  GATEWAY_URL: z.string().default('http://localhost:3000'),
  PROVIDER_BASE_URL: z.string().default('http://localhost:4000'),
  MOCK_TIMEOUT_MS: z.coerce.number().default(5000),
  NEXUS_TIMEOUT_MS: z.coerce.number().default(2000),
  WEBHOOK_TOLERANCE_SEC: z.coerce.number().default(300),
  POLL_INTERVAL_MS: z.coerce.number().default(0),
});

export const env = envSchema.parse(process.env);
