import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { domainResourceSchema, hasTauriRuntime } from './domainResource';

describe('typed domain resource IPC', () => {
  it('uses a safe no-runtime fallback in component tests', () => expect(hasTauriRuntime()).toBe(false));
  it('rejects resources outside the persistence contract', () => expect(() => domainResourceSchema.parse('shell.state')).toThrow());
  it('supports strict state schemas', () => expect(z.object({ count: z.number() }).strict().safeParse({ count: 1, extra: true }).success).toBe(false));
});
