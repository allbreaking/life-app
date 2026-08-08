export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type LifeTemplate = { frequency: Frequency; weekday?: number; monthDay?: number; anchorDate?: string };

/** Side effects: none. Rounds a minute offset to the nearest 15-minute boundary. */
export function snapToQuarterHour(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(24 * 60 - 15, Math.round(minutes / 15) * 15));
}

/** Side effects: none. */
export function minutesToTime(minutes: number): string {
  const safe = snapToQuarterHour(minutes);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** Side effects: none. Determines whether a recurring life template projects onto a local calendar date. */
export function lifeTemplateOccursOn(template: LifeTemplate, date: Date): boolean {
  if (template.frequency === 'daily') return true;
  if (template.frequency === 'weekly') return date.getDay() === template.weekday;
  if (template.frequency === 'monthly') return date.getDate() === template.monthDay;
  if (template.weekday !== date.getDay() || !template.anchorDate) return false;
  const anchor = new Date(`${template.anchorDate}T12:00:00`);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  return Math.round((target.getTime() - anchor.getTime()) / 86_400_000) % 14 === 0;
}
