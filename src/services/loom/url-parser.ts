import { z } from 'zod';

// Matches various Loom URL formats:
// - https://www.loom.com/share/abc123
// - https://loom.com/share/abc123
// - https://www.loom.com/embed/abc123
// - https://loom.com/embed/abc123
const LOOM_URL_REGEX = /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)(?:\?.*)?$/;

export const loomUrlSchema = z.string().url().refine(
  (url) => LOOM_URL_REGEX.test(url),
  { message: 'Ungültige Loom URL. Bitte verwende eine URL im Format: https://www.loom.com/share/VIDEO_ID' }
);

export function extractVideoId(url: string): string {
  const match = url.match(LOOM_URL_REGEX);
  if (!match || !match[1]) {
    throw new Error('Ungültige Loom URL - Video ID konnte nicht extrahiert werden');
  }
  return match[1];
}

export function validateLoomUrl(url: string): { valid: boolean; error?: string; videoId?: string } {
  const result = loomUrlSchema.safeParse(url);

  if (!result.success) {
    return {
      valid: false,
      error: result.error.issues[0]?.message || 'Ungültige URL',
    };
  }

  try {
    const videoId = extractVideoId(url);
    return { valid: true, videoId };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
    };
  }
}
