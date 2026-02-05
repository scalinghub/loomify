import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateLoomUrl } from '@/services/loom';
import { processLoomVideo } from '@/services/pipeline';
import { ApiKeys } from '@/services/pipeline/types';

const requestSchema = z.object({
  url: z.string().url('Ungültige URL'),
});

function extractKeys(request: NextRequest): ApiKeys | null {
  const geminiKey = request.headers.get('x-gemini-key');
  const gammaKey = request.headers.get('x-gamma-key');
  const gammaTemplateId = request.headers.get('x-gamma-template') || undefined;

  if (!geminiKey || !gammaKey) return null;
  return { geminiKey, gammaKey, gammaTemplateId };
}

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

    // Validate request body
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ungültige Anfrage', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { url } = parsed.data;

    // Validate Loom URL
    const validation = validateLoomUrl(url);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Process the video
    const result = await processLoomVideo(url, keys);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      transcript: result.transcript,
      presentationUrl: result.presentationUrl,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Interner Server-Fehler' },
      { status: 500 }
    );
  }
}
