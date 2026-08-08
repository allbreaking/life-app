import { expect, test } from 'vitest';
import { notificationInputSchema } from './notification';

test('accepts only whitelisted, bounded notification input', () => {
  const valid = {
    entityId: 'food-1',
    alertType: 'food-expiry',
    occurrenceAt: '2026-08-08T08:00:00.000Z',
    title: '食物即将到期',
    body: '冰箱中的牛奶将在 3 天内到期',
  };
  expect(notificationInputSchema.parse(valid)).toEqual(valid);
  expect(notificationInputSchema.safeParse({ ...valid, alertType: 'arbitrary' }).success).toBe(false);
  expect(notificationInputSchema.safeParse({ ...valid, body: 'bad\ntext' }).success).toBe(false);
  expect(notificationInputSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
});
