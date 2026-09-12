import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { z } from 'zod';
import { domainResourceError, hasTauriRuntime } from './domainResource';

const ratingSchema = z.number().int().min(0).max(5).optional();
const tradeWatchObjectSchema = z.object({
  id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  name: z.string().trim().min(1).max(100),
  optimisticTarget: z.number().positive().finite(),
  target: z.number().positive().finite(),
  pessimisticTarget: z.number().positive().finite(),
  safety: z.literal(0),
  current: z.number().positive().finite(),
  tags: z.array(z.string().trim().min(1).max(20)).max(10),
  businessModelRating: ratingSchema,
  profitabilityRating: ratingSchema,
  financialStabilityRating: ratingSchema,
  cashFlowRating: ratingSchema,
  quoteAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  createdAt: z.string().datetime(),
}).strict();

const tradeWatchSchema = tradeWatchObjectSchema.refine((watch) => watch.optimisticTarget >= watch.target && watch.target >= watch.pessimisticTarget, '观察列表目标价关系无效');

const addTradeWatchInputSchema = tradeWatchObjectSchema.pick({
  code: true,
  name: true,
  optimisticTarget: true,
  target: true,
  pessimisticTarget: true,
  tags: true,
  businessModelRating: true,
  profitabilityRating: true,
  financialStabilityRating: true,
  cashFlowRating: true,
}).extend({ requestId: z.string().uuid() }).strict()
  .refine((watch) => watch.optimisticTarget >= watch.target && watch.target >= watch.pessimisticTarget, '观察列表目标价关系无效');

export type TradeWatchEntity = z.infer<typeof tradeWatchSchema>;
export type AddTradeWatchInput = z.infer<typeof addTradeWatchInputSchema>;

/** Side effects: invokes the dedicated Rust service, which reads one fixed-host quote and atomically appends one watch entity plus an idempotency receipt. */
export async function addTradeWatch(input: AddTradeWatchInput): Promise<TradeWatchEntity> {
  if (!hasTauriRuntime()) throw new Error('自动行情仅在 Life-OS 桌面版中可用');
  try {
    return tradeWatchSchema.parse(await invoke('add_trade_watch', { input: addTradeWatchInputSchema.parse(input) }));
  } catch (error) {
    throw new Error(domainResourceError(error));
  }
}

/** Side effects: subscribes to the application-local agent bridge event; payloads are schema-validated before delivery. */
export async function subscribeTradeWatchAdded(onAdded: (watch: TradeWatchEntity) => void): Promise<UnlistenFn> {
  if (!hasTauriRuntime()) return () => undefined;
  return listen<unknown>('trade-watch-added', (event) => {
    const watch = tradeWatchSchema.safeParse(event.payload);
    if (watch.success) onAdded(watch.data);
  });
}
