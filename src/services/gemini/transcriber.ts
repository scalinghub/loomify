import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import { getGeminiClient } from './client';
import { TranscriptionResult, ProcessingError } from '../pipeline/types';
import { delay } from '@/lib/utils';
import path from 'path';

const TRANSCRIPTION_PROMPT = `Du bist ein professioneller Transkriptionist. Bitte erstelle eine vollständige und genaue Transkription des gesprochenen Inhalts in diesem Video.

Formatiere die Transkription wie folgt:
1. Verwende klare Absätze für Themenwechsel
2. Identifiziere Sprecher, wenn mehrere Personen sprechen
3. Notiere wichtige visuelle Elemente in [eckigen Klammern]
4. Entferne Füllwörter (ähm, äh) während du die Bedeutung beibehältst
5. Behalte die Originalsprache des Videos bei

Gib NUR die Transkription aus, keine zusätzlichen Kommentare oder Erklärungen.`;

const MAX_POLLING_ATTEMPTS = 60;
const POLLING_INTERVAL = 5000;

export async function transcribeVideo(filePath: string, geminiKey: string): Promise<TranscriptionResult> {
  const fileManager = new GoogleAIFileManager(geminiKey);
  const genAI = getGeminiClient(geminiKey);

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = getMimeType(ext);

  let uploadedFile;
  try {
    const fileName = path.basename(filePath);
    uploadedFile = await fileManager.uploadFile(filePath, {
      mimeType,
      displayName: fileName,
    });
  } catch (error) {
    throw new ProcessingError({
      stage: 'transcribe',
      code: 'UPLOAD_FAILED',
      message: 'Video-Upload zu Gemini fehlgeschlagen',
      retryable: true,
      details: error,
    });
  }

  try {
    let file = await fileManager.getFile(uploadedFile.file.name);
    let attempts = 0;

    while (file.state === FileState.PROCESSING && attempts < MAX_POLLING_ATTEMPTS) {
      await delay(POLLING_INTERVAL);
      file = await fileManager.getFile(uploadedFile.file.name);
      attempts++;
    }

    if (file.state === FileState.FAILED) {
      throw new ProcessingError({
        stage: 'transcribe',
        code: 'PROCESSING_FAILED',
        message: 'Gemini konnte das Video nicht verarbeiten',
        retryable: true,
      });
    }

    if (file.state === FileState.PROCESSING) {
      throw new ProcessingError({
        stage: 'transcribe',
        code: 'PROCESSING_TIMEOUT',
        message: 'Video-Verarbeitung hat das Zeitlimit überschritten',
        retryable: true,
      });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: file.mimeType,
          fileUri: file.uri,
        },
      },
      { text: TRANSCRIPTION_PROMPT },
    ]);

    const transcript = result.response.text();

    if (!transcript || transcript.trim().length === 0) {
      throw new ProcessingError({
        stage: 'transcribe',
        code: 'EMPTY_TRANSCRIPT',
        message: 'Transkription ist leer - möglicherweise enthält das Video keine Sprache',
        retryable: false,
      });
    }

    try {
      await fileManager.deleteFile(file.name);
    } catch {
      // Ignore cleanup errors
    }

    return {
      transcript: transcript.trim(),
      language: 'de',
    };
  } catch (error) {
    try {
      await fileManager.deleteFile(uploadedFile.file.name);
    } catch {
      // Ignore cleanup errors
    }

    if (error instanceof ProcessingError) throw error;

    throw new ProcessingError({
      stage: 'transcribe',
      code: 'TRANSCRIPTION_FAILED',
      message: 'Transkription fehlgeschlagen',
      retryable: true,
      details: error,
    });
  }
}

function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
  };
  return mimeTypes[extension] || 'video/mp4';
}
