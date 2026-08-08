import { describe, expect, it } from 'vitest';
import { chinaMarketClock, isChinaMarketSession } from './marketQuote';

describe('China A-share market clock', () => {
  it('uses Asia/Shanghai trading windows independently of the device timezone', () => {
    expect(isChinaMarketSession(new Date('2026-08-07T01:30:00Z'))).toBe(true);
    expect(isChinaMarketSession(new Date('2026-08-07T03:31:00Z'))).toBe(false);
    expect(isChinaMarketSession(new Date('2026-08-07T05:00:00Z'))).toBe(true);
    expect(isChinaMarketSession(new Date('2026-08-08T02:00:00Z'))).toBe(false);
    expect(chinaMarketClock(new Date('2026-08-07T07:00:00Z')).date).toBe('2026-08-07');
  });
});
