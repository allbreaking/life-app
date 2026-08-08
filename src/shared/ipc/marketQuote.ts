import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import { domainResourceError, hasTauriRuntime } from './domainResource';

const stockCodeSchema = z.string().regex(/^\d{6}$/);
const marketQuoteSchema = z.object({
  code: stockCodeSchema,
  price: z.number().positive().finite(),
  quoteAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
}).strict();
const marketQuotesSchema = z.array(marketQuoteSchema).max(50);
export type MarketQuote = z.infer<typeof marketQuoteSchema>;

/** Side effects: invokes the Rust adapter, which sends one read-only request to hq.sinajs.cn. */
export async function fetchMarketQuotes(codes: string[]): Promise<MarketQuote[]> {
  const input = z.array(stockCodeSchema).min(1).max(50).refine((items) => new Set(items).size === items.length).parse(codes);
  if (!hasTauriRuntime()) throw new Error('自动行情仅在 Life-OS 桌面版中可用');
  try {
    return marketQuotesSchema.parse(await invoke('fetch_market_quotes', { codes: input }));
  } catch (error) {
    throw new Error(domainResourceError(error));
  }
}

/** Side effects: reads only the supplied timestamp. Uses Asia/Shanghai regardless of device timezone. */
export function chinaMarketClock(now: Date): { date: string; weekday: string; minutes: number } {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, weekday: values.weekday, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

/** Side effects: none. Returns the mainland continuous-auction windows on weekdays. */
export function isChinaMarketSession(now: Date): boolean {
  const { weekday, minutes } = chinaMarketClock(now);
  return !['Sat', 'Sun'].includes(weekday) && ((minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes <= 900));
}
