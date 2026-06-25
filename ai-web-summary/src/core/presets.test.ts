import { describe, it, expect } from 'vitest';
import { MODEL_PRESETS } from './presets';
import { providerConfigSchema } from './providers/types';

describe('MODEL_PRESETS', () => {
  it('非空', () => {
    expect(MODEL_PRESETS.length).toBeGreaterThan(0);
  });

  it('每个预设补上 id/label/key 后通过 schema 校验', () => {
    for (const p of MODEL_PRESETS) {
      const cfg = {
        id: 'x', label: p.label, kind: p.kind, model: p.model,
        apiKey: 'k', baseURL: p.baseURL || undefined,
      };
      expect(providerConfigSchema.safeParse(cfg).success).toBe(true);
    }
  });

  it('预设 id 唯一', () => {
    const ids = MODEL_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
