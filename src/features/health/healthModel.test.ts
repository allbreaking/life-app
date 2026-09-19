import { describe, expect, test } from 'vitest';
import {
  emptyHealthRecord, healthDateKey, healthEventClassName, healthRecordsSchema,
  isHealthRecorded, monthGridDays, moodLabel, normalizeMood, periodBarClass, sleepDuration,
} from './healthModel';

describe('healthDateKey', () => {
  test('formats local dates with zero padding', () => {
    expect(healthDateKey(new Date(2026, 8, 7))).toBe('2026-09-07');
    expect(healthDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('sleepDuration', () => {
  test('computes same-day and cross-midnight durations', () => {
    expect(sleepDuration('00:42', '08:16')).toBe('7h34m');
    expect(sleepDuration('23:30', '01:10')).toBe('1h40m');
    expect(sleepDuration('', '08:00')).toBe('');
    expect(sleepDuration('08:00', '')).toBe('');
    expect(sleepDuration('abc', '08:00')).toBe('');
  });
});

describe('mood helpers', () => {
  test('normalizes legacy emoji and canonical values', () => {
    expect(normalizeMood('🙂')).toBe('happy');
    expect(normalizeMood('😕')).toBe('sad');
    expect(normalizeMood('happy')).toBe('happy');
    expect(normalizeMood('bogus')).toBe('');
    expect(normalizeMood('')).toBe('');
  });
  test('maps moods to labels and falls back to unrecorded', () => {
    expect(moodLabel('happy')).toBe('开心');
    expect(moodLabel('anxious')).toBe('焦虑');
    expect(moodLabel('')).toBe('未记录');
  });
});

describe('health visual helpers', () => {
  test('maps body event types to classes', () => {
    expect(healthEventClassName('皮肤')).toBe('skin');
    expect(healthEventClassName('肠胃')).toBe('gut');
    expect(healthEventClassName('牙齿')).toBe('tooth');
    expect(healthEventClassName('其他')).toBe('');
  });
});

describe('isHealthRecorded', () => {
  test('requires weather, sleep pair and mood', () => {
    const record = emptyHealthRecord();
    expect(isHealthRecorded(record)).toBe(false);
    record.weather = '晴';
    record.sleepStart = '00:00';
    record.sleepEnd = '08:00';
    expect(isHealthRecorded(record)).toBe(false);
    record.mood = 'happy';
    expect(isHealthRecorded(record)).toBe(true);
  });
});

describe('periodBarClass', () => {
  test('marks isolated and edge days of a period run', () => {
    const record = { ...emptyHealthRecord(), period: true };
    expect(periodBarClass(record, false, false)).toBe('health-period-bar start end');
    expect(periodBarClass(record, true, false)).toBe('health-period-bar end');
    expect(periodBarClass(record, true, true)).toBe('health-period-bar');
    expect(periodBarClass({ ...record, period: false }, false, false)).toBe('');
  });
});

describe('monthGridDays', () => {
  test('yields 42 cells with only the cursor month marked current', () => {
    const cursor = new Date(2026, 8, 1); // September 2026
    const cells = monthGridDays(cursor);
    expect(cells).toHaveLength(42);
    expect(cells[0].key).toBe('2026-08-31'); // Monday before Sep 1
    expect(cells.filter((cell) => cell.current)).toHaveLength(30);
  });
});

describe('healthRecordsSchema', () => {
  test('accepts a normalized record keyed by date', () => {
    const record = { ...emptyHealthRecord(), weather: '晴', events: [{ type: '皮肤', label: '新痘', note: '' }] };
    expect(healthRecordsSchema.parse({ '2026-09-07': record })).toEqual({ '2026-09-07': record });
  });
  test('rejects non-date keys', () => {
    expect(() => healthRecordsSchema.parse({ 'bad-key': emptyHealthRecord() })).toThrow();
  });
});
