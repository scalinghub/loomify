import { getGammaClient } from './client';
import { PresentationResult, ProcessingError } from '../pipeline/types';
import { delay } from '@/lib/utils';

const MAX_POLLING_ATTEMPTS = 60;
const POLLING_INTERVAL = 5000;

interface GammaGenerationRequest {
  inputText: string;
  textMode: 'generate' | 'condense' | 'preserve';
  format?: 'presentation' | 'document' | 'webpage' | 'social';
  numCards?: number;
  textOptions?: {
    amount?: 'brief' | 'medium' | 'detailed' | 'extensive';
    tone?: string;
    audience?: string;
    language?: string;
  };
  imageOptions?: {
    source?: 'aiGenerated' | 'stock' | 'pexels' | 'noImages' | 'placeholder';
  };
}

export async function createPresentation(transcript: string, gammaKey: string, gammaTemplateId?: string, numCards?: number): Promise<PresentationResult> {
  return generatePresentation(transcript, gammaKey, gammaTemplateId, numCards);
}

async function generatePresentation(transcript: string, gammaKey: string, gammaTemplateId?: string, numCards?: number): Promise<PresentationResult> {
  const client = getGammaClient(gammaKey);

  const requestBody: GammaGenerationRequest = {
    inputText: transcript,
    textMode: 'generate',
    format: 'presentation',
    numCards: numCards || 10,
    textOptions: {
      amount: 'medium',
      tone: 'professional',
      language: 'de',
    },
    imageOptions: {
      source: 'aiGenerated',
    },
  };

  try {
    console.log('[Gamma] Sending generation request...');
    const response = await client.post('/generations', requestBody);
    console.log('[Gamma] Response:', JSON.stringify(response.data));

    // API returns { generationId: "..." }
    const generationId = response.data.generationId || response.data.id;

    if (!generationId) {
      console.error('[Gamma] No generationId in response:', response.data);
      throw new ProcessingError({
        stage: 'generate',
        code: 'NO_GENERATION_ID',
        message: 'Gamma hat keine Generation-ID zurückgegeben',
        retryable: false,
      });
    }

    console.log('[Gamma] Generation started:', generationId);
    return await pollForCompletion(generationId, gammaKey);
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    console.error('[Gamma] Error:', error);
    handleGammaError(error);
    throw error;
  }
}

async function pollForCompletion(generationId: string, gammaKey: string): Promise<PresentationResult> {
  const client = getGammaClient(gammaKey);
  let attempts = 0;

  while (attempts < MAX_POLLING_ATTEMPTS) {
    try {
      const response = await client.get(`/generations/${generationId}`);
      const data = response.data;
      console.log(`[Gamma] Poll #${attempts + 1}:`, JSON.stringify(data));

      const status = data.status;
      const gammaUrl = data.url || data.gammaUrl;

      if (status === 'completed' && gammaUrl) {
        return { generationId, gammaUrl };
      }

      if (status === 'failed') {
        throw new ProcessingError({
          stage: 'generate',
          code: 'GENERATION_FAILED',
          message: data.error || 'Gamma Präsentationserstellung fehlgeschlagen',
          retryable: true,
        });
      }

      await delay(POLLING_INTERVAL);
      attempts++;
    } catch (error) {
      if (error instanceof ProcessingError) throw error;
      handleGammaError(error);
    }
  }

  throw new ProcessingError({
    stage: 'generate',
    code: 'GENERATION_TIMEOUT',
    message: 'Präsentationserstellung hat das Zeitlimit überschritten',
    retryable: true,
  });
}

function handleGammaError(error: unknown): never {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { status?: number; data?: unknown } };
    const status = axiosError.response?.status;
    const data = axiosError.response?.data as Record<string, unknown> | undefined;
    const message = typeof data?.message === 'string' ? data.message : undefined;

    console.error(`[Gamma] API Error ${status}:`, JSON.stringify(data));

    if (status === 401) {
      throw new ProcessingError({
        stage: 'generate',
        code: 'AUTH_FAILED',
        message: 'Gamma API-Authentifizierung fehlgeschlagen. Bitte überprüfe den API-Key.',
        retryable: false,
      });
    }

    if (status === 402) {
      throw new ProcessingError({
        stage: 'generate',
        code: 'INSUFFICIENT_CREDITS',
        message: 'Nicht genügend Gamma-Credits.',
        retryable: false,
      });
    }

    if (status === 429) {
      throw new ProcessingError({
        stage: 'generate',
        code: 'RATE_LIMITED',
        message: 'Gamma API Rate-Limit erreicht. Bitte warte einen Moment.',
        retryable: true,
      });
    }

    throw new ProcessingError({
      stage: 'generate',
      code: 'API_ERROR',
      message: message || `Gamma API-Fehler (Status ${status})`,
      retryable: status ? status >= 500 : true,
      details: data,
    });
  }

  console.error('[Gamma] Unknown error:', error);
  throw new ProcessingError({
    stage: 'generate',
    code: 'UNKNOWN_ERROR',
    message: `Gamma-Fehler: ${error instanceof Error ? error.message : String(error)}`,
    retryable: true,
    details: error,
  });
}
