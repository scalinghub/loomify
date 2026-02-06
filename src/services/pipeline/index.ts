import { downloadLoomVideo } from '../loom';
import { transcribeVideo } from '../gemini';
import { createPresentation } from '../gamma';
import { ProcessingResult, ProcessingStatus, ProcessingError, ApiKeys } from './types';

export type StatusCallback = (status: ProcessingStatus) => void;

export async function processLoomVideo(
  loomUrl: string,
  keys: ApiKeys,
  onStatus?: StatusCallback
): Promise<ProcessingResult> {
  const updateStatus = (status: ProcessingStatus) => {
    if (onStatus) {
      onStatus(status);
    }
  };

  let downloadResult;

  try {
    // Stage 1: Download
    updateStatus({
      stage: 'download',
      progress: 0,
      message: 'Starte Video-Download von Loom...',
    });

    downloadResult = await downloadLoomVideo(loomUrl);

    updateStatus({
      stage: 'download',
      progress: 100,
      message: 'Video erfolgreich heruntergeladen',
    });

    // Stage 2: Transcribe
    updateStatus({
      stage: 'transcribe',
      progress: 0,
      message: 'Lade Video zu Gemini hoch...',
    });

    updateStatus({
      stage: 'transcribe',
      progress: 30,
      message: 'Video wird von Gemini verarbeitet...',
    });

    const transcriptionResult = await transcribeVideo(downloadResult.filePath, keys.geminiKey);

    updateStatus({
      stage: 'transcribe',
      progress: 100,
      message: 'Transkription abgeschlossen',
    });

    // Clean up video file after transcription
    await downloadResult.cleanup();

    // Stage 3: Generate Presentation
    updateStatus({
      stage: 'generate',
      progress: 0,
      message: 'Erstelle Präsentation mit Gamma...',
    });

    updateStatus({
      stage: 'generate',
      progress: 30,
      message: 'Gamma generiert Präsentation...',
    });

    const presentationResult = await createPresentation(transcriptionResult.transcript, keys.gammaKey, keys.gammaTemplateId, keys.numCards);

    updateStatus({
      stage: 'generate',
      progress: 100,
      message: 'Präsentation erfolgreich erstellt!',
    });

    return {
      success: true,
      transcript: transcriptionResult.transcript,
      presentationUrl: presentationResult.gammaUrl,
    };
  } catch (error) {
    // Clean up on error
    if (downloadResult) {
      try {
        await downloadResult.cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }

    if (error instanceof ProcessingError) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten',
    };
  }
}

// Download + Transcribe only (no Gamma) - used for merge mode
export async function downloadAndTranscribe(
  loomUrl: string,
  keys: ApiKeys,
  onStatus?: StatusCallback
): Promise<{ success: boolean; transcript?: string; error?: string }> {
  const updateStatus = (status: ProcessingStatus) => {
    if (onStatus) onStatus(status);
  };

  let downloadResult;

  try {
    updateStatus({ stage: 'download', progress: 0, message: 'Starte Video-Download von Loom...' });
    downloadResult = await downloadLoomVideo(loomUrl);
    updateStatus({ stage: 'download', progress: 100, message: 'Video erfolgreich heruntergeladen' });

    updateStatus({ stage: 'transcribe', progress: 0, message: 'Lade Video zu Gemini hoch...' });
    updateStatus({ stage: 'transcribe', progress: 30, message: 'Video wird von Gemini verarbeitet...' });
    const transcriptionResult = await transcribeVideo(downloadResult.filePath, keys.geminiKey);
    updateStatus({ stage: 'transcribe', progress: 100, message: 'Transkription abgeschlossen' });

    await downloadResult.cleanup();

    return { success: true, transcript: transcriptionResult.transcript };
  } catch (error) {
    if (downloadResult) {
      try { await downloadResult.cleanup(); } catch { /* ignore */ }
    }

    return {
      success: false,
      error: error instanceof ProcessingError ? error.message : (error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten'),
    };
  }
}

export { ProcessingError, type ProcessingResult, type ProcessingStatus } from './types';
