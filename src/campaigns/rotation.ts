import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';

const RotationFileSchema = z.object({
  rotation: z
    .array(
      z.object({
        country: z.string().min(1),
        template_set: z.string().min(1),
      }),
    )
    .min(1),
});

export interface RotationEntry {
  country: string;
  template_set: string;
}

export function getTodayRotation(
  rotationPath = resolve(process.cwd(), 'config', 'rotations', 'default.yml'),
): RotationEntry {
  const file = RotationFileSchema.parse(YAML.parse(readFileSync(rotationPath, 'utf8')));
  const index = Math.floor(Date.now() / 86400000) % file.rotation.length;
  const entry = file.rotation[index];
  if (entry === undefined) {
    throw new Error('Rotation file did not provide a valid entry');
  }
  return entry;
}
