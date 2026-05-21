export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export interface ConnectionStateResponse {
  state: string;
  instance?: JsonObject;
  raw?: JsonObject;
}

export interface SendMessageKey {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
}

export interface SendMessageResponse {
  key?: SendMessageKey;
  messageId?: string;
  id?: string;
  status?: string;
  raw?: JsonObject;
}

export interface MessageListItem {
  key?: SendMessageKey;
  message?: JsonObject;
  messageTimestamp?: number;
  status?: string;
}

export interface MessageListResponse {
  messages: MessageListItem[];
  raw?: JsonObject;
}

export interface InstanceInfo {
  instanceName: string;
  owner?: string;
  profileName?: string;
  profilePictureUrl?: string;
  status?: string;
  raw?: JsonObject;
}

export interface EvolutionWebhookKey {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
  participant?: string;
}

export interface EvolutionWebhookData {
  key?: EvolutionWebhookKey;
  message?: JsonObject;
  messageType?: string;
  pushName?: string;
  status?: string | number;
  messageId?: string;
  id?: string;
  state?: string;
  instance?: string;
  remoteJid?: string;
  body?: string;
  text?: string;
  addressingMode?: string;
  [key: string]: unknown;
}

export interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: EvolutionWebhookData;
  sender?: string;
  serverUrl?: string;
  [key: string]: unknown;
}

export function extractMessageIdFromSendResponse(response: SendMessageResponse): string | null {
  return response.key?.id ?? response.messageId ?? response.id ?? null;
}

export function isSuccessAckStatus(status: string | null | undefined): boolean {
  return status === 'SERVER_ACK' || status === 'DELIVERY_ACK' || status === 'READ';
}
