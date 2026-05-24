import { config } from '../config/env';
import type { JsonObject } from '../evolution/types';
import type { WahaSendTextResponse, WahaSessionInfo } from './types';

export class WahaApiError extends Error {
  public readonly statusCode: number;
  public readonly body: string;

  public constructor(statusCode: number, message: string, body: string) {
    super(message);
    this.name = 'WahaApiError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonObject(value: unknown): JsonObject {
  if (!isRecord(value)) {
    return {};
  }
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      item === null ||
      Array.isArray(item) ||
      isRecord(item)
    ) {
      result[key] = item as JsonObject[string];
    }
  }
  return result;
}

function normalizeBaseUrl(baseUrl: string | null | undefined): string {
  const value = baseUrl ?? config.WAHA_BASE_URL;
  if (value === undefined) {
    throw new Error('WAHA_BASE_URL is required for WAHA sender');
  }
  return value.replace(/\/$/, '');
}

function apiKey(): string {
  if (config.WAHA_API_KEY === undefined) {
    throw new Error('WAHA_API_KEY is required for WAHA sender');
  }
  return config.WAHA_API_KEY;
}

export class WahaClient {
  private readonly baseUrl: string;
  private readonly key: string;

  public constructor(baseUrl?: string | null, key = apiKey()) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.key = key;
  }

  public async getSession(session: string): Promise<WahaSessionInfo> {
    try {
      const response = await this.request<unknown>(`/api/sessions/${encodeURIComponent(session)}`, {
        method: 'GET',
      });
      if (!isRecord(response)) {
        throw new Error('WAHA session response was not an object');
      }
      const me = isRecord(response.me)
        ? {
            id: typeof response.me.id === 'string' ? response.me.id : undefined,
            pushName: typeof response.me.pushName === 'string' ? response.me.pushName : undefined,
            lid: typeof response.me.lid === 'string' ? response.me.lid : undefined,
          }
        : null;
      return {
        name: typeof response.name === 'string' ? response.name : session,
        status: typeof response.status === 'string' ? response.status : '',
        me,
        raw: toJsonObject(response),
      };
    } catch (error) {
      if (error instanceof WahaApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown WAHA session error';
      throw new Error(`Failed to get WAHA session: ${message}`);
    }
  }

  public async sendTextMessage(session: string, chatId: string, text: string): Promise<WahaSendTextResponse> {
    try {
      const response = await this.request<unknown>('/api/sendText', {
        method: 'POST',
        body: JSON.stringify({
          session,
          chatId,
          text,
        }),
      });
      if (!isRecord(response)) {
        return { raw: {} };
      }
      const key = isRecord(response.key)
        ? {
            remoteJid: typeof response.key.remoteJid === 'string' ? response.key.remoteJid : undefined,
            fromMe: typeof response.key.fromMe === 'boolean' ? response.key.fromMe : undefined,
            id: typeof response.key.id === 'string' ? response.key.id : undefined,
          }
        : undefined;
      return {
        key,
        status: typeof response.status === 'string' ? response.status : undefined,
        raw: toJsonObject(response),
      };
    } catch (error) {
      if (error instanceof WahaApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown WAHA send error';
      throw new Error(`Failed to send WAHA text message: ${message}`);
    }
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'X-Api-Key': this.key,
          ...init.headers,
        },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new WahaApiError(response.status, `WAHA API returned ${response.status}`, text);
      }
      if (text.trim().length === 0) {
        return {} as T;
      }
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof WahaApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown WAHA request error';
      throw new Error(`WAHA request failed: ${message}`);
    }
  }
}
