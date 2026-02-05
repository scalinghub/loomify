import { GoogleGenerativeAI } from '@google/generative-ai';

export function getGeminiClient(apiKey: string): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKey);
}
