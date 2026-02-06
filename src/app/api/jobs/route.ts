import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateLoomUrl } from '@/services/loom';
import { jobStore } from '@/services/pipeline/job-store';
import { ApiKeys } from '@/services/pipeline/types';

const batchSchema = z.object({
  urls: z.array(z.string().url()).min(1, 'Mindestens eine URL erforderlich').max(10, 'Maximal 10 URLs gleichzeitig'),
  merge: z.boolean().optional().default(false),
  numCards: z.number().min(3).max(30).optional().default(10),
});

function extractKeys(request: NextRequest): ApiKeys | null {
  const geminiKey = request.headers.get('x-gemini-key');
  const gammaKey = request.headers.get('x-gamma-key');
  const gammaTemplateId = request.headers.get('x-gamma-template') || undefined;

  if (!geminiKey || !gammaKey) return null;
  return { geminiKey, gammaKey, gammaTemplateId };
}

// POST: Submit batch of URLs
export async function POST(request: NextRequest) {
  try {
    const keys = extractKeys(request);
    if (!keys) {
      return NextResponse.json(
        { error: 'API-Keys fehlen. Bitte Gemini- und Gamma-Keys in den Einstellungen eingeben.' },
        { status: 401 }
      );
    }

    const body = await request.json();

    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ungültige Anfrage', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Validate all URLs
    const errors: { url: string; error: string }[] = [];
    const validUrls: string[] = [];

    for (const url of parsed.data.urls) {
      const validation = validateLoomUrl(url);
      if (validation.valid) {
        validUrls.push(url);
      } else {
        errors.push({ url, error: validation.error || 'Ungültige URL' });
      }
    }

    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: 'Keine gültigen Loom-URLs gefunden', details: errors },
        { status: 400 }
      );
    }

    // Submit valid URLs to job store
    const keysWithOptions = { ...keys, numCards: parsed.data.numCards };
    const jobs = parsed.data.merge
      ? jobStore.submitMerge(validUrls, keysWithOptions)
      : jobStore.submit(validUrls, keysWithOptions);

    return NextResponse.json({
      jobs: jobs.map((j) => ({ id: j.id, url: j.url, status: j.status, mode: j.mode })),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Jobs API Error:', error);
    return NextResponse.json(
      { error: 'Interner Server-Fehler' },
      { status: 500 }
    );
  }
}

// GET: Get all jobs
export async function GET() {
  const jobs = jobStore.getAllJobs();
  return NextResponse.json({ jobs });
}
