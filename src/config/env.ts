import { z } from 'zod';

const envSchema = z.object({
  GOOGLE_GEMINI_API_KEY: z.string().min(1, 'Google Gemini API Key is required'),
  GAMMA_API_KEY: z.string().min(1, 'Gamma API Key is required'),
  GAMMA_TEMPLATE_ID: z.string().optional(),
});

function validateEnv() {
  const parsed = envSchema.safeParse({
    GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
    GAMMA_API_KEY: process.env.GAMMA_API_KEY,
    GAMMA_TEMPLATE_ID: process.env.GAMMA_TEMPLATE_ID,
  });

  if (!parsed.success) {
    console.error('Environment validation failed:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  return parsed.data;
}

export const env = validateEnv();
