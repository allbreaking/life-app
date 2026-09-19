import { z } from 'zod';

export const HEALTH_EVENT_TYPES = ['皮肤', '肠胃', '牙齿'] as const;
export type HealthEventType = (typeof HEALTH_EVENT_TYPES)[number];

export const HEALTH_MOODS = ['happy', 'anxious', 'neutral', 'sad'] as const;
export type HealthMood = (typeof HEALTH_MOODS)[number];

export const HEALTH_WEATHERS = ['晴', '多云', '阴', '小雨', '雨', '雪'] as const;
export const HEALTH_EXERCISE_TYPES = ['步行', '跑步', '力量', '舞蹈', '骑行', '其他'] as const;
export const HEALTH_FLOWS = ['点滴', '少', '中', '多'] as const;
export const HEALTH_PERIOD_SYMPTOMS = ['痛经', '腹胀', '头痛', '情绪变化', '痘痘'] as const;

export const HEALTH_EVENT_PRESETS: Record<HealthEventType, string[]> = {
  皮肤: ['新痘', '痘印', '泛红', '凹陷', '干燥'],
  肠胃: ['腹胀', '腹痛', '腹泻', '便秘', '反酸'],
  牙齿: ['疼痛', '咀嚼不适', '敏感', '治疗', '复诊'],
};

export type HealthEvent = { type: HealthEventType; label: string; note: string };
export type HealthRecord = {
  weather: string;
  temp: string;
  humidity: string;
  sleepStart: string;
  sleepEnd: string;
  exerciseType: string;
  exerciseMin: string;
  mood: string;
  moodNote: string;
  period: boolean;
  flow: string;
  periodSymptoms: string[];
  events: HealthEvent[];
};
export type HealthRecords = Record<string, HealthRecord>;

const healthEventSchema = z.object({
  type: z.enum(HEALTH_EVENT_TYPES),
  label: z.string().max(100),
  note: z.string().max(500),
}).strict();

export const healthRecordSchema = z.object({
  weather: z.string().max(50),
  temp: z.string().max(20),
  humidity: z.string().max(20),
  sleepStart: z.string().max(10),
  sleepEnd: z.string().max(10),
  exerciseType: z.string().max(50),
  exerciseMin: z.string().max(20),
  mood: z.string().max(20),
  moodNote: z.string().max(500),
  period: z.boolean(),
  flow: z.string().max(20),
  periodSymptoms: z.array(z.string().max(50)),
  events: z.array(healthEventSchema),
}).strict();

export const healthRecordsSchema = z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), healthRecordSchema);

/** Side effects: none. */
export function emptyHealthRecord(): HealthRecord {
  return { weather: '', temp: '', humidity: '', sleepStart: '', sleepEnd: '', exerciseType: '', exerciseMin: '', mood: '', moodNote: '', period: false, flow: '', periodSymptoms: [], events: [] };
}

/** Side effects: none. Local date key `YYYY-MM-DD`. */
export function healthDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Side effects: none. Cross-midnight sleep duration `7h34m` or empty when incomplete. */
export function sleepDuration(start: string, end: string): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((value) => Number.isNaN(value))) return '';
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 1440;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}

const MOOD_ALIASES: Record<string, HealthMood> = { '😊': 'happy', '🙂': 'happy', '😣': 'anxious', '😕': 'sad', '😐': 'neutral' };

/** Side effects: none. Maps legacy emoji or canonical mood value to a canonical mood, else empty. */
export function normalizeMood(mood: string): HealthMood | '' {
  if (!mood) return '';
  const alias = MOOD_ALIASES[mood];
  if (alias) return alias;
  return (HEALTH_MOODS as readonly string[]).includes(mood) ? (mood as HealthMood) : '';
}

const MOOD_LABELS: Record<HealthMood, string> = { happy: '开心', anxious: '焦虑', neutral: '平淡', sad: '难过' };

/** Side effects: none. */
export function moodLabel(mood: string): string {
  const normalized = normalizeMood(mood);
  return normalized ? MOOD_LABELS[normalized] : '未记录';
}

/** Side effects: none. Body-event visual class for 皮肤/肠胃/牙齿. */
export function healthEventClassName(type: string): 'skin' | 'gut' | 'tooth' | '' {
  return type === '皮肤' ? 'skin' : type === '肠胃' ? 'gut' : type === '牙齿' ? 'tooth' : '';
}

/** Side effects: none. A record counts as filled when weather, sleep pair and mood are all present. */
export function isHealthRecorded(record: HealthRecord): boolean {
  const done = [Boolean(record.weather), Boolean(record.sleepStart && record.sleepEnd), Boolean(record.mood)].filter(Boolean).length;
  return done >= 3;
}

/** Side effects: none. Period bar segments respect consecutive-day continuity. */
export function periodBarClass(record: HealthRecord, previousPeriod: boolean, nextPeriod: boolean): string {
  if (!record.period) return '';
  const parts = ['health-period-bar'];
  if (!previousPeriod) parts.push('start');
  if (!nextPeriod) parts.push('end');
  return parts.join(' ');
}

export type MonthCell = { key: string; date: Date; current: boolean };

/** Side effects: none. Fixed 42-cell month grid starting from the Monday on/before the 1st. */
export function monthGridDays(cursor: Date): MonthCell[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const cells: MonthCell[] = [];
  for (let index = 0; index < 42; index++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    cells.push({ key: healthDateKey(date), date, current: date.getMonth() === month });
  }
  return cells;
}
