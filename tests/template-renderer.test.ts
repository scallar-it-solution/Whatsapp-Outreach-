import { describe, expect, it } from 'vitest';
import { renderTemplate, TemplateRenderError } from '../src/templates/renderer';

describe('renderTemplate', () => {
  it('substitutes all supported variables', () => {
    const body = 'Hi {{business_name}} in {{city}}, {{category}} / {{country}}';
    expect(
      renderTemplate(body, {
        business_name: 'Acme',
        city: 'Dubai',
        category: 'real estate',
        country: 'UAE',
      }),
    ).toBe('Hi Acme in Dubai, real estate / UAE');
  });

  it('falls back to there for missing business_name', () => {
    expect(renderTemplate('Hi {{business_name}}', { business_name: '' })).toBe('Hi there');
  });

  it('throws on unknown variables', () => {
    expect(() => renderTemplate('Hi {{unknown}}', {})).toThrow(TemplateRenderError);
  });

  it('preserves multiline bodies', () => {
    const rendered = renderTemplate('Hello {{business_name}}\n\nSecond line', {
      business_name: 'Team',
    });
    expect(rendered).toBe('Hello Team\n\nSecond line');
  });
});
