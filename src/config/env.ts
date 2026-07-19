import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  PROVIDER_PORT: z.coerce.number().default(4000),
  NEXUS_TOKEN: z.string().default(''),
  ORBIT_API_KEY: z.string().default(''),
  NEXUS_WEBHOOK_SECRET: z.string().default(''),
  DB_PATH: z.string().default('./data.sqlite'),
});

export const env = envSchema.parse(process.env);
