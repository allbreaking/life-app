import { expect, test } from 'vitest';
import { lifeTemplateOccursOn, minutesToTime, snapToQuarterHour } from './scheduleModel';

test('snaps calendar minutes to 15-minute boundaries', () => {
  expect(snapToQuarterHour(548)).toBe(555);
  expect(minutesToTime(548)).toBe('09:15');
  expect(snapToQuarterHour(-20)).toBe(0);
});

test('projects weekly, monthly and biweekly life templates without creating tasks', () => {
  const monday = new Date('2026-08-03T12:00:00');
  expect(lifeTemplateOccursOn({ frequency: 'weekly', weekday: 1 }, monday)).toBe(true);
  expect(lifeTemplateOccursOn({ frequency: 'monthly', monthDay: 3 }, monday)).toBe(true);
  expect(lifeTemplateOccursOn({ frequency: 'biweekly', weekday: 1, anchorDate: '2026-07-20' }, monday)).toBe(true);
  expect(lifeTemplateOccursOn({ frequency: 'biweekly', weekday: 1, anchorDate: '2026-07-27' }, monday)).toBe(false);
});
