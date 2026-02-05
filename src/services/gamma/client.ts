import axios, { AxiosInstance } from 'axios';

const GAMMA_BASE_URL = 'https://public-api.gamma.app/v1.0';

export function getGammaClient(apiKey: string): AxiosInstance {
  return axios.create({
    baseURL: GAMMA_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    timeout: 60000, // 60 seconds
  });
}
