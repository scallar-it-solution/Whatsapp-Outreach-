import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { SUPPORTED_COUNTRIES } from '../config/constants';
import { getDb } from '../db/client';
import type { TemplateRow } from '../db/schema';

const TemplateItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  ab_label: z.string().optional(),
  body: z.string().min(1),
});

const TemplateFileSchema = z.object({
  set: z.string().min(1),
  country: z.enum(SUPPORTED_COUNTRIES).optional(),
  category: z.string().optional(),
  templates: z.array(TemplateItemSchema).min(1),
});

export async function loadTemplatesFromConfig(
  templatesDir = resolve(process.cwd(), 'config', 'templates'),
): Promise<number> {
  try {
    const files = (await readdir(templatesDir)).filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));
    let loaded = 0;
    for (const file of files) {
      loaded += await loadTemplateFile(resolve(templatesDir, file));
    }
    return loaded;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown template load error';
    throw new Error(`Failed to load templates from config: ${message}`);
  }
}

export async function loadTemplateFile(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, 'utf8');
    const parsed = TemplateFileSchema.parse(YAML.parse(content));
    const now = new Date().toISOString();
    for (const template of parsed.templates) {
      await getDb()<TemplateRow>('templates')
        .insert({
          id: template.id,
          set_name: parsed.set,
          name: template.name,
          body: template.body,
          country: parsed.country ?? null,
          category: parsed.category ?? null,
          ab_label: template.ab_label ?? null,
          active: 1,
          created_at: now,
        })
        .onConflict('id')
        .merge({
          set_name: parsed.set,
          name: template.name,
          body: template.body,
          country: parsed.country ?? null,
          category: parsed.category ?? null,
          ab_label: template.ab_label ?? null,
          active: 1,
        });
    }
    return parsed.templates.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown template file error';
    throw new Error(`Failed to load template file ${filePath}: ${message}`);
  }
}
