import type { FinalMessageStatus, SupportedCountry } from '../config/constants';

export type SenderStatus = 'active' | 'paused' | 'quarantined' | 'disabled';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed';
export type LeadStatus =
  | 'queued'
  | 'sent'
  | 'failed'
  | 'replied'
  | 'interested'
  | 'unsubscribed'
  | 'invalid';
export type ReplyClassification = 'interested' | 'unsubscribed' | 'neutral';
export type AddressingMode = 'lid' | 'default';

export interface SenderRow {
  id: string;
  instance_name: string;
  phone_number: string | null;
  label: string | null;
  status: SenderStatus;
  daily_limit: number;
  delay_min_sec: number;
  delay_max_sec: number;
  sent_today: number;
  health_score: number;
  last_error: string | null;
  last_health_check_at: string | null;
  supports_lid: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  country: SupportedCountry;
  category: string | null;
  source_file: string | null;
  template_set: string;
  status: CampaignStatus;
  total_leads: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface LeadRow {
  id: string;
  campaign_id: string;
  phone: string;
  business_name: string | null;
  city: string | null;
  country: SupportedCountry;
  category: string | null;
  rating: number | null;
  review_count: number | null;
  website: string | null;
  source_file: string | null;
  raw_json: string | null;
  status: LeadStatus;
  resolved_jid: string | null;
  last_attempt_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateRow {
  id: string;
  set_name: string;
  name: string;
  body: string;
  country: SupportedCountry | null;
  category: string | null;
  ab_label: string | null;
  active: number;
  created_at: string;
}

export interface SendLogRow {
  id: string;
  lead_id: string;
  campaign_id: string;
  sender_instance: string;
  recipient_jid: string;
  message_id: string | null;
  template_id: string | null;
  attempt_count: number;
  evolution_status: string | null;
  final_status: FinalMessageStatus | null;
  raw_response: string | null;
  sent_at: string;
  resolved_at: string | null;
}

export interface MessageUpdateRow {
  id: string;
  message_id: string;
  sender_instance: string;
  status: Exclude<FinalMessageStatus, 'TIMEOUT'>;
  raw_payload: string | null;
  received_at: string;
}

export interface ReplyRow {
  id: string;
  lead_id: string | null;
  sender_instance: string;
  remote_jid: string;
  addressing_mode: AddressingMode | null;
  message_id: string | null;
  message_text: string | null;
  classification: ReplyClassification | null;
  raw_payload: string | null;
  received_at: string;
}

export interface JidMappingRow {
  id: string;
  phone: string;
  sender_instance: string;
  resolved_jid: string;
  addressing_mode: AddressingMode | null;
  source: 'inbound' | 'smoke_test' | null;
  expires_at: string | null;
  created_at: string;
}

export interface UnsubscribeRow {
  id: string;
  phone: string;
  remote_jid: string | null;
  source: 'reply' | 'manual' | 'import' | null;
  created_at: string;
}
