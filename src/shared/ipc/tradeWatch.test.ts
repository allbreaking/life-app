import { beforeEach, expect, test, vi } from 'vitest';
import { addTradeWatch } from './tradeWatch';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

beforeEach(() => {
  invoke.mockReset();
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
});

test('validates the dedicated add-watch response', async () => {
  invoke.mockResolvedValue({
    id: '018fb47d-4dc7-7e9a-8a6f-5df4f34c6910', code: '600519', name: '贵州茅台',
    optimisticTarget: 1800, target: 1680, pessimisticTarget: 1550, safety: 0, current: 1309.22,
    tags: ['消费'], businessModelRating: 5, quoteAt: '2026-08-30T15:00:00', createdAt: '2026-08-30T15:01:00.000Z',
  });
  const watch = await addTradeWatch({
    requestId: '018fb47d-4dc7-7e9a-8a6f-5df4f34c6911', code: '600519', name: '贵州茅台',
    optimisticTarget: 1800, target: 1680, pessimisticTarget: 1550, tags: ['消费'], businessModelRating: 5,
  });
  expect(watch.current).toBe(1309.22);
  expect(invoke).toHaveBeenCalledWith('add_trade_watch', { input: expect.objectContaining({ code: '600519' }) });
});

test('rejects unknown or unsafe response fields', async () => {
  invoke.mockResolvedValue({ id: 'w1', code: '600519', name: '贵州茅台', url: 'https://example.com' });
  await expect(addTradeWatch({
    requestId: '018fb47d-4dc7-7e9a-8a6f-5df4f34c6911', code: '600519', name: '贵州茅台',
    optimisticTarget: 1800, target: 1680, pessimisticTarget: 1550, tags: [],
  })).rejects.toThrow();
});
