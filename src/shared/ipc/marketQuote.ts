import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import { domainResourceError, hasTauriRuntime } from './domainResource';

const stockCodeSchema = z.string().regex(/^\d{5,6}$/);
const marketQuoteSchema = z.object({
  code: stockCodeSchema,
  price: z.number().positive().finite(),
  quoteAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
}).strict();
const marketQuotesSchema = z.array(marketQuoteSchema).max(50);
export type MarketQuote = z.infer<typeof marketQuoteSchema>;

const MAX_BATCH = 50;

/** Side effects: invokes the Rust adapter in batches of at most 50, each sending one read-only request to hq.sinajs.cn. Codes are five-digit Hong Kong or six-digit A-share. */
export async function fetchMarketQuotes(codes: string[]): Promise<MarketQuote[]> {
  const parsed = z.array(stockCodeSchema).min(1).refine((items) => new Set(items).size === items.length).safeParse(codes);
  if (!parsed.success) throw new Error('行情代码格式无效或存在重复');
  if (!hasTauriRuntime()) throw new Error('自动行情仅在 Life-OS 桌面版中可用');
  const quotes: MarketQuote[] = [];
  for (let start = 0; start < parsed.data.length; start += MAX_BATCH) {
    try {
      const batch = parsed.data.slice(start, start + MAX_BATCH);
      quotes.push(...marketQuotesSchema.parse(await invoke('fetch_market_quotes', { codes: batch })));
    } catch (error) {
      throw new Error(domainResourceError(error));
    }
  }
  return quotes;
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
