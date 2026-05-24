import type { JsonObject } from '../evolution/types';

export interface WahaSessionInfo {
  name: string;
  status: string;
  me?: {
    id?: string;
    pushName?: string;
    lid?: string;
  } | null;
  raw?: JsonObject;
}

export interface WahaSendTextResponse {
  key?: {
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
  };
  status?: string;
  raw?: JsonObject;
}

export interface WahaWebhookPayload {
  event?: string;
  session?: string;
  me?: {
    id?: string;
    pushName?: string;
    lid?: string;
  };
  payload?: JsonObject;
  engine?: string;
  [key: string]: unknown;
}

export function extractWahaMessageId(response: WahaSendTextResponse): string | null {
  return response.key?.id ?? null;
}
