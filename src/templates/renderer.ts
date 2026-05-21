export class TemplateRenderError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

export interface TemplateVariables {
  business_name?: string | null;
  city?: string | null;
  category?: string | null;
  country?: string | null;
}

const KNOWN_VARIABLES = new Set(['business_name', 'city', 'category', 'country']);

export function renderTemplate(body: string, variables: TemplateVariables): string {
  return body.replace(/{{\s*([a-zA-Z_]+)\s*}}/g, (_match, variableName: string) => {
    if (!KNOWN_VARIABLES.has(variableName)) {
      throw new TemplateRenderError(`Unknown template variable: ${variableName}`);
    }
    if (variableName === 'business_name') {
      const businessName = variables.business_name?.trim();
      return businessName !== undefined && businessName.length > 0 ? businessName : 'there';
    }
    const value = variables[variableName as keyof TemplateVariables];
    return value?.trim() ?? '';
  });
}
