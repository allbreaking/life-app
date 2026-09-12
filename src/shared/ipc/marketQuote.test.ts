import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chinaMarketClock, fetchMarketQuotes, isChinaMarketSession } from './marketQuote';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

beforeEach(() => {
  invoke.mockReset();
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
});

describe('China A-share market clock', () => {
  it('uses Asia/Shanghai trading windows independently of the device timezone', () => {
    expect(isChinaMarketSession(new Date('2026-08-07T01:30:00Z'))).toBe(true);
    expect(isChinaMarketSession(new Date('2026-08-07T03:31:00Z'))).toBe(false);
    expect(isChinaMarketSession(new Date('2026-08-07T05:00:00Z'))).toBe(true);
    expect(isChinaMarketSession(new Date('2026-08-08T02:00:00Z'))).toBe(false);
    expect(chinaMarketClock(new Date('2026-08-07T07:00:00Z')).date).toBe('2026-08-07');
  });
});

describe('fetchMarketQuotes batching', () => {
  it('splits more than 50 codes into multiple invokes and merges the results', async () => {
    const codes = Array.from({ length: 120 }, (_, index) => String(100000 + index));
    invoke.mockImplementation(async (_command: string, payload: { codes: string[] }) => {
      return payload.codes.map((code) => ({ code, price: 10.5, quoteAt: '2026-09-11T16:09:00' }));
    });
    const quotes = await fetchMarketQuotes(codes);
    expect(quotes).toHaveLength(120);
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('rejects empty or duplicate codes with a friendly message', async () => {
    await expect(fetchMarketQuotes([])).rejects.toThrow('行情代码格式无效或存在重复');
    await expect(fetchMarketQuotes(['600519', '600519'])).rejects.toThrow('行情代码格式无效或存在重复');
  });
});
