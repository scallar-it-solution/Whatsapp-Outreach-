import { getDb } from '../db/client';
import type { TemplateRow } from '../db/schema';

function stableHash(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export async function selectTemplateForLead(
  templateSet: string,
  leadId: string,
): Promise<TemplateRow> {
  try {
    const templates = await getDb()<TemplateRow>('templates')
      .where({ set_name: templateSet, active: 1 })
      .orderBy('ab_label', 'asc')
      .orderBy('name', 'asc');
    if (templates.length === 0) {
      throw new Error(`No active templates found for set ${templateSet}`);
    }
    const index = stableHash(leadId) % templates.length;
    const template = templates[index];
    if (template === undefined) {
      throw new Error(`Template rotation failed for set ${templateSet}`);
    }
    return template;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown template rotation error';
    throw new Error(`Failed to select template: ${message}`);
  }
}
