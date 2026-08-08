export type ExpiryTone = 'crimson' | 'amber' | 'normal';

/** Side effects: none. Uses local calendar dates to avoid timezone boundary drift. */
export function foodExpiryStatus(expiry: string, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const end = new Date(`${expiry}T12:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const tone: ExpiryTone = days <= 3 ? 'crimson' : days <= 7 ? 'amber' : 'normal';
  const label = days < 0 ? `已过期 ${Math.abs(days)} 天` : days === 0 ? '今天到期' : `${days} 天后到期`;
  return { days, tone, label };
}
