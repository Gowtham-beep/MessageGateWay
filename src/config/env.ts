import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  PROVIDER_PORT: z.coerce.number().default(4000),
  NEXUS_TOKEN: z.string().default('mock_nexus'),
  ORBIT_API_KEY: z.string().default('mock_orbit'),
  NEXUS_WEBHOOK_SECRET: z.string().default('mock_secret'),
  DB_PATH: z.string().default('./data.sqlite'),
  GATEWAY_URL: z.string().default('http://localhost:3000'),
  MOCK_TIMEOUT_MS: z.coerce.number().default(5000),
});

export const env = envSchema.parse(process.env);
