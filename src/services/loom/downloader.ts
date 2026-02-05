import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { DownloadResult, ProcessingError } from '../pipeline/types';
import { extractVideoId } from './url-parser';

const DOWNLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export async function downloadLoomVideo(loomUrl: string): Promise<DownloadResult> {
  const videoId = extractVideoId(loomUrl);
  const fileName = `loomify-${videoId}-${randomUUID().slice(0, 8)}.mp4`;
  const filePath = path.join(os.tmpdir(), fileName);

  // Check if yt-dlp is installed
  await checkYtDlpInstalled();

  return new Promise((resolve, reject) => {
    const args = [
      '--no-warnings',
      '--no-progress',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '-o', filePath,
      loomUrl,
    ];

    const process = spawn('yt-dlp', args);

    let stderr = '';
    let stdout = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      process.kill();
      reject(
        new ProcessingError({
          stage: 'download',
          code: 'DOWNLOAD_TIMEOUT',
          message: 'Video-Download hat das Zeitlimit überschritten',
          retryable: true,
        })
      );
    }, DOWNLOAD_TIMEOUT);

    process.on('close', async (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        // Verify the file exists
        try {
          await fs.access(filePath);
          const stats = await fs.stat(filePath);

          if (stats.size === 0) {
            reject(
              new ProcessingError({
                stage: 'download',
                code: 'EMPTY_FILE',
                message: 'Heruntergeladene Datei ist leer',
                retryable: true,
              })
            );
            return;
          }

          resolve({
            filePath,
            fileName,
            cleanup: async () => {
              try {
                await fs.unlink(filePath);
              } catch {
                // Ignore cleanup errors
              }
            },
          });
        } catch {
          reject(
            new ProcessingError({
              stage: 'download',
              code: 'FILE_NOT_FOUND',
              message: 'Heruntergeladene Datei wurde nicht gefunden',
              retryable: true,
              details: { stdout, stderr },
            })
          );
        }
      } else {
        // Determine error type based on stderr content
        let errorMessage = 'Video-Download fehlgeschlagen';
        let errorCode = 'DOWNLOAD_FAILED';

        if (stderr.includes('Private video') || stderr.includes('Sign in')) {
          errorMessage = 'Das Video ist privat. Bitte stelle sicher, dass das Video öffentlich geteilt ist.';
          errorCode = 'PRIVATE_VIDEO';
        } else if (stderr.includes('Video unavailable') || stderr.includes('not available')) {
          errorMessage = 'Das Video ist nicht verfügbar oder wurde gelöscht.';
          errorCode = 'VIDEO_UNAVAILABLE';
        } else if (stderr.includes('Unable to extract')) {
          errorMessage = 'Video konnte nicht extrahiert werden. Bitte überprüfe die URL.';
          errorCode = 'EXTRACTION_FAILED';
        }

        reject(
          new ProcessingError({
            stage: 'download',
            code: errorCode,
            message: errorMessage,
            retryable: errorCode === 'DOWNLOAD_FAILED',
            details: { stderr, stdout, exitCode: code },
          })
        );
      }
    });

    process.on('error', (error) => {
      clearTimeout(timeout);
      reject(
        new ProcessingError({
          stage: 'download',
          code: 'PROCESS_ERROR',
          message: 'Fehler beim Starten des Download-Prozesses',
          retryable: false,
          details: error,
        })
      );
    });
  });
}

async function checkYtDlpInstalled(): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn('yt-dlp', ['--version']);

    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new ProcessingError({
            stage: 'download',
            code: 'YTDLP_NOT_INSTALLED',
            message: 'yt-dlp ist nicht installiert. Bitte installiere es mit: brew install yt-dlp',
            retryable: false,
          })
        );
      }
    });

    process.on('error', () => {
      reject(
        new ProcessingError({
          stage: 'download',
          code: 'YTDLP_NOT_INSTALLED',
          message: 'yt-dlp ist nicht installiert. Bitte installiere es mit: brew install yt-dlp',
          retryable: false,
        })
      );
    });
  });
}
