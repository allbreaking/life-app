import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

export const domainResourceSchema = z.enum([
  'compass.principles', 'dashboard.completedTodoIndexes',
  'work.tasks', 'work.focusIds', 'work.eodSubmitted',
  'schedule.pool', 'schedule.scheduled', 'schedule.lifeSchedules',
  'finance.budgetCents', 'finance.spentCents', 'finance.pending', 'finance.lastTransaction',
  'items.foods', 'items.items', 'network.people',
  'trade.watchlist', 'trade.positions', 'trade.reviews', 'learning.domains',
]);
export type DomainResource = z.infer<typeof domainResourceSchema>;
const errorSchema = z.object({ code: z.string(), message: z.string() });

/** Side effects: reads the current browser runtime marker only. */
export function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Side effects: invokes Tauri IPC and reads normalized SQLite domain rows; the backend may perform a one-time legacy import. */
export async function loadDomainResource<T>(resource: DomainResource, schema: z.ZodType<T>): Promise<T | null> {
  domainResourceSchema.parse(resource);
  const value = await invoke<unknown | null>('load_domain_resource', { resource });
  return value === null ? null : schema.parse(value);
}

/** Side effects: invokes Tauri IPC; Rust transactionally replaces normalized domain rows and writes an idempotency receipt. */
export async function replaceDomainResource<T>(resource: DomainResource, value: T, schema: z.ZodType<T>, requestId = crypto.randomUUID()): Promise<void> {
  domainResourceSchema.parse(resource);
  await invoke('replace_domain_resource', { resource, value: schema.parse(value), requestId });
}

/** Side effects: none. Normalizes unknown Tauri errors for user-facing status messages. */
export function domainResourceError(error: unknown): string {
  const parsed = errorSchema.safeParse(error);
  return parsed.success ? parsed.data.message : error instanceof Error ? error.message : '本地存储暂时不可用';
}
