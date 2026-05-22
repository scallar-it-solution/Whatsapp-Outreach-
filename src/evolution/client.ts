import { config } from '../config/env';
import type {
  ConnectionStateResponse,
  InstanceInfo,
  JsonObject,
  MessageListResponse,
  SendMessageResponse,
} from './types';

export class EvolutionApiError extends Error {
  public readonly statusCode: number;
  public readonly body: string;

  public constructor(statusCode: number, message: string, body: string) {
    super(message);
    this.name = 'EvolutionApiError';
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

function toSendMessageKey(value: unknown): SendMessageResponse['key'] {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    remoteJid: typeof value.remoteJid === 'string' ? value.remoteJid : undefined,
    fromMe: typeof value.fromMe === 'boolean' ? value.fromMe : undefined,
  };
}

export class EvolutionClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  public constructor(baseUrl = config.EVOLUTION_BASE_URL, apiKey = config.EVOLUTION_API_KEY) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  public async getConnectionState(instance: string): Promise<ConnectionStateResponse> {
    try {
      const response = await this.request<JsonObject>(`/instance/connectionState/${encodeURIComponent(instance)}`, {
        method: 'GET',
      });
      const instanceObject = isRecord(response.instance) ? toJsonObject(response.instance) : undefined;
      const nestedState = instanceObject?.state;
      const state =
        typeof response.state === 'string'
          ? response.state
          : typeof nestedState === 'string'
            ? nestedState
            : '';
      return { state, instance: instanceObject, raw: response };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown Evolution connection error';
      throw new Error(`Failed to get Evolution connection state: ${message}`);
    }
  }

  public async sendTextMessage(instance: string, to: string, text: string): Promise<SendMessageResponse> {
    try {
      return await this.request<SendMessageResponse>(`/message/sendText/${encodeURIComponent(instance)}`, {
        method: 'POST',
        body: JSON.stringify({
          number: to,
          text,
        }),
      });
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown Evolution send error';
      throw new Error(`Failed to send Evolution text message: ${message}`);
    }
  }

  public async fetchMessages(instance: string, jid: string, count: number): Promise<MessageListResponse> {
    try {
      const response = await this.request<JsonObject>(`/chat/findMessages/${encodeURIComponent(instance)}`, {
        method: 'POST',
        body: JSON.stringify({
          where: {
            key: {
              remoteJid: jid,
            },
          },
          limit: count,
        }),
      });
      const rawMessages: unknown[] = Array.isArray(response.messages) ? response.messages : [];
      const messages = rawMessages
        .filter(isRecord)
        .map((item) => ({
          key: toSendMessageKey(item.key),
          message: isRecord(item.message) ? toJsonObject(item.message) : undefined,
          messageTimestamp:
            typeof item.messageTimestamp === 'number' ? item.messageTimestamp : undefined,
          status: typeof item.status === 'string' ? item.status : undefined,
        }));
      return { messages, raw: response };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown Evolution fetch error';
      throw new Error(`Failed to fetch Evolution messages: ${message}`);
    }
  }

  public async getInstances(): Promise<InstanceInfo[]> {
    try {
      const response = await this.request<unknown>('/instance/fetchInstances', { method: 'GET' });
      const rawItems = Array.isArray(response) ? response : isRecord(response) && Array.isArray(response.instances) ? response.instances : [];
      return rawItems.filter(isRecord).map((item) => {
        const instance = isRecord(item.instance) ? item.instance : item;
        const name =
          typeof instance.instanceName === 'string'
            ? instance.instanceName
            : typeof instance.name === 'string'
              ? instance.name
              : '';
        const status =
          typeof instance.status === 'string'
            ? instance.status
            : typeof instance.connectionStatus === 'string'
              ? instance.connectionStatus
              : typeof instance.state === 'string'
                ? instance.state
                : undefined;
        return {
          instanceName: name,
          owner: typeof instance.owner === 'string' ? instance.owner : undefined,
          profileName: typeof instance.profileName === 'string' ? instance.profileName : undefined,
          profilePictureUrl:
            typeof instance.profilePictureUrl === 'string' ? instance.profilePictureUrl : undefined,
          status,
          raw: toJsonObject(item),
        };
      }).filter((item) => item.instanceName.length > 0);
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown Evolution instances error';
      throw new Error(`Failed to fetch Evolution instances: ${message}`);
    }
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          apikey: this.apiKey,
          ...init.headers,
        },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new EvolutionApiError(response.status, `Evolution API returned ${response.status}`, text);
      }
      if (text.trim().length === 0) {
        return {} as T;
      }
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown Evolution request error';
      throw new Error(`Evolution request failed: ${message}`);
    }
  }
}
