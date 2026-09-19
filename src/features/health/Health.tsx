import { useState, type ReactNode } from 'react';
import { useDomainResource } from '../../shared/ipc/useDomainResource';
import {
  emptyHealthRecord, healthDateKey, healthEventClassName, healthRecordsSchema,
  isHealthRecorded, monthGridDays, moodLabel, normalizeMood, periodBarClass, sleepDuration,
  HEALTH_EVENT_PRESETS, HEALTH_EVENT_TYPES, HEALTH_EXERCISE_TYPES, HEALTH_FLOWS, HEALTH_MOODS,
  HEALTH_PERIOD_SYMPTOMS, HEALTH_WEATHERS, type HealthEventType, type HealthRecord, type HealthRecords, type HealthMood,
} from './healthModel';

const DEMO_HEALTH_RECORDS: HealthRecords = {
  '2026-09-07': { weather: '晴', temp: '29', humidity: '61', sleepStart: '00:31', sleepEnd: '08:02', exerciseType: '步行', exerciseMin: '30', mood: 'happy', moodNote: '', period: false, flow: '', periodSymptoms: [], events: [] },
  '2026-09-08': { weather: '多云', temp: '28', humidity: '67', sleepStart: '00:48', sleepEnd: '08:20', exerciseType: '', exerciseMin: '', mood: 'neutral', moodNote: '', period: false, flow: '', periodSymptoms: [], events: [] },
  '2026-09-09': { weather: '小雨', temp: '25', humidity: '84', sleepStart: '01:12', sleepEnd: '08:45', exerciseType: '', exerciseMin: '', mood: 'sad', moodNote: '', period: false, flow: '', periodSymptoms: [], events: [{ type: '肠胃', label: '腹胀', note: '晚饭后' }] },
  '2026-09-10': { weather: '阴', temp: '27', humidity: '76', sleepStart: '00:22', sleepEnd: '08:01', exerciseType: '步行', exerciseMin: '40', mood: 'neutral', moodNote: '', period: false, flow: '', periodSymptoms: [], events: [{ type: '皮肤', label: '新痘', note: '下巴' }] },
  '2026-09-11': { weather: '晴', temp: '30', humidity: '63', sleepStart: '00:56', sleepEnd: '08:30', exerciseType: '', exerciseMin: '', mood: 'happy', moodNote: '', period: true, flow: '少', periodSymptoms: ['腹胀'], events: [] },
  '2026-09-12': { weather: '多云', temp: '28', humidity: '72', sleepStart: '00:42', sleepEnd: '08:16', exerciseType: '步行', exerciseMin: '35', mood: 'neutral', moodNote: '', period: true, flow: '中', periodSymptoms: ['痛经'], events: [{ type: '皮肤', label: '新痘', note: '下巴 · 轻度' }] },
  '2026-09-13': { weather: '晴', temp: '30', humidity: '59', sleepStart: '00:25', sleepEnd: '08:02', exerciseType: '', exerciseMin: '', mood: 'happy', moodNote: '', period: true, flow: '中', periodSymptoms: [], events: [] },
  '2026-09-14': { weather: '多云', temp: '27', humidity: '70', sleepStart: '00:50', sleepEnd: '08:10', exerciseType: '舞蹈', exerciseMin: '60', mood: 'happy', moodNote: '', period: true, flow: '少', periodSymptoms: [], events: [] },
};

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

/**
 * Spec: docs/specs/health-module/01-health-module.spec.md.
 * Side effects: persists health.records through typed IPC to SQLite and keeps transient selection/panel state in memory.
 */
export function Health() {
  const [records, setRecords] = useDomainResource('health.records', healthRecordsSchema, (import.meta.env.PROD ? {} : DEMO_HEALTH_RECORDS));
  const [selectedDate, setSelectedDate] = useState('');
  const [cursor, setCursor] = useState(() => new Date());
  const [periodOpen, setPeriodOpen] = useState(false);
  const [eventType, setEventType] = useState<HealthEventType | null>(null);
  const [eventLabel, setEventLabel] = useState('');
  const [eventNote, setEventNote] = useState('');
  const [message, setMessage] = useState('');

  const todayKey = healthDateKey(new Date());
  const record = (key: string): HealthRecord => records[key] ?? emptyHealthRecord();
  const today = record(todayKey);

  const updateRecord = (key: string, patch: (current: HealthRecord) => HealthRecord) => {
    setRecords((values) => {
      const current = values[key] ?? emptyHealthRecord();
      return { ...values, [key]: patch(current) };
    });
  };
  const patchToday = (patch: Partial<HealthRecord>) => updateRecord(todayKey, (current) => ({ ...current, ...patch }));

  const openEvent = (type: HealthEventType) => {
    setPeriodOpen(false);
    setEventType(type);
    setEventLabel('');
    setEventNote('');
  };
  const saveEvent = () => {
    if (!eventType || !eventLabel) {
      setMessage('先点一下要记录的情况');
      return;
    }
    updateRecord(todayKey, (current) => ({ ...current, events: [...current.events, { type: eventType, label: eventLabel, note: eventNote.trim() }] }));
    setEventType(null);
    setMessage(`${eventType}记录已保存`);
  };

  return (
    <div className="health-view">
      <section className="card health-today" aria-label="今日健康">
        <div className="health-today-head">
          <div>
            <div className="health-date-title">{todayLabel(todayKey)}</div>
            <div className="health-status-line">今天先记最少的信息，需要时再补充细节。</div>
          </div>
          <span className={`chip ${isHealthRecorded(today) ? 'emerald' : 'sky'}`}>{isHealthRecorded(today) ? '已记录' : '待补充'}</span>
        </div>

        <div className="health-quick-grid">
          <div className="health-quick">
            <div className="health-quick-label">天气</div>
            <div className="health-quick-inline">
              <HealthSelect ariaLabel="天气" value={today.weather} onChange={(value) => patchToday({ weather: value })}>
                {HEALTH_WEATHERS.map((weather) => <option key={weather}>{weather}</option>)}
              </HealthSelect>
              <input className="health-mini-input" aria-label="温度" inputMode="decimal" value={today.temp} style={{ width: 54 }} onChange={(event) => patchToday({ temp: event.target.value })} /><span className="small">°C</span>
            </div>
            <div className="health-quick-inline" style={{ marginTop: 6 }}>
              <input className="health-mini-input" aria-label="湿度" inputMode="numeric" value={today.humidity} style={{ width: 56 }} onChange={(event) => patchToday({ humidity: event.target.value })} /><span className="small">% 湿度</span>
            </div>
          </div>

          <div className="health-quick">
            <div className="health-quick-label">睡眠</div>
            <div className="health-time-pair">
              <input type="time" className="health-time" aria-label="睡觉时间" value={today.sleepStart} onChange={(event) => patchToday({ sleepStart: event.target.value })} />
              <span className="small">→</span>
              <input type="time" className="health-time" aria-label="起床时间" value={today.sleepEnd} onChange={(event) => patchToday({ sleepEnd: event.target.value })} />
            </div>
            <div className="small" style={{ marginTop: 8 }}>{sleepDuration(today.sleepStart, today.sleepEnd) || '未记录'}</div>
          </div>

          <div className="health-quick">
            <div className="health-quick-label">运动</div>
            <div className="health-quick-inline">
              <HealthSelect ariaLabel="运动类型" value={today.exerciseType} onChange={(value) => patchToday({ exerciseType: value })}>
                {HEALTH_EXERCISE_TYPES.map((type) => <option key={type}>{type}</option>)}
              </HealthSelect>
              <input className="health-mini-input" aria-label="运动时长" inputMode="numeric" value={today.exerciseMin} style={{ width: 58 }} onChange={(event) => patchToday({ exerciseMin: event.target.value })} /><span className="small">min</span>
            </div>
            <div className="small" style={{ marginTop: 8 }}>一天多次运动可在日期详情中补记</div>
          </div>

          <div className="health-quick">
            <div className="health-quick-label">情绪</div>
            <MoodPills prefix="情绪" value={today.mood} onSelect={(mood) => patchToday({ mood })} />
            <input className="health-mini-input" aria-label="情绪记录" placeholder="一句话记录今天的情绪" value={today.moodNote} style={{ width: '100%', marginTop: 8 }} onChange={(event) => patchToday({ moodNote: event.target.value })} />
            <div className="small" style={{ marginTop: 7 }}>{moodLabel(today.mood)}</div>
          </div>
        </div>

        <div className="health-actions">
          {HEALTH_EVENT_TYPES.map((type) => (
            <button key={type} className="health-action" onClick={() => openEvent(type)}>＋ {type}</button>
          ))}
          <button className={`health-action period${today.period ? ' active' : ''}`} onClick={() => setPeriodOpen((open) => !open)}>{today.period ? '经期 · 已记录' : '＋ 记录经期'}</button>
        </div>

        {periodOpen && (
          <div className="health-inline-panel">
            <div className="health-panel-title">今天是经期吗？</div>
            <div className="small" style={{ marginTop: 3 }}>像 Apple 健康一样，先点一下完成记录；经血量和症状都可以不填。</div>
            <div className="health-pill-row">
              <button className={`health-pill period${today.period ? ' selected' : ''}`} onClick={() => updateRecord(todayKey, (current) => current.period ? { ...current, period: false, flow: '', periodSymptoms: [] } : { ...current, period: true })}>{today.period ? '✓ 今天是经期' : '标记今天为经期'}</button>
            </div>
            <div className="small" style={{ marginTop: 10 }}>经血量（可选）</div>
            <div className="health-pill-row">
              {HEALTH_FLOWS.map((flow) => (
                <button key={flow} className={`health-pill period${today.flow === flow ? ' selected' : ''}`} aria-pressed={today.flow === flow} onClick={() => updateRecord(todayKey, (current) => ({ ...current, period: true, flow: current.flow === flow ? '' : flow }))}>{flow}</button>
              ))}
            </div>
            <div className="small" style={{ marginTop: 10 }}>症状（可多选）</div>
            <div className="health-pill-row">
              {HEALTH_PERIOD_SYMPTOMS.map((symptom) => (
                <button key={symptom} className={`health-pill${today.periodSymptoms.includes(symptom) ? ' selected' : ''}`} aria-pressed={today.periodSymptoms.includes(symptom)} onClick={() => updateRecord(todayKey, (current) => {
                  const symptoms = current.periodSymptoms.includes(symptom) ? current.periodSymptoms.filter((item) => item !== symptom) : [...current.periodSymptoms, symptom];
                  return { ...current, period: true, periodSymptoms: symptoms };
                })}>{symptom}</button>
              ))}
            </div>
          </div>
        )}

        {eventType && (
          <div className="health-inline-panel">
            <div className="health-panel-head">
              <span className="health-panel-title">记录{eventType}</span>
              <button className="text-action" onClick={() => setEventType(null)}>取消</button>
            </div>
            <div className="health-pill-row">
              {HEALTH_EVENT_PRESETS[eventType].map((label) => (
                <button key={label} className={`health-pill${eventLabel === label ? ' selected' : ''}`} onClick={() => setEventLabel(label)}>{label}</button>
              ))}
            </div>
            <input className="health-event-note" aria-label="事件备注" placeholder="可选备注；不写也可以直接保存" value={eventNote} onChange={(event) => setEventNote(event.target.value)} />
            <button className="command-button" style={{ border: 0, marginTop: 9 }} onClick={saveEvent}>保存</button>
          </div>
        )}

        {message && <p className="status-message" role="status">{message}</p>}
      </section>

      <div className="health-calendar-layout">
        <section className="card health-calendar-card">
          <div className="health-calendar-toolbar">
            <div><h3 style={{ margin: 0 }}>健康月历</h3><div className="small">每天固定看天气和作息；身体事件只在发生时出现。</div></div>
            <div className="health-calendar-nav">
              <button className="health-nav-btn" aria-label="上个月" onClick={() => setCursor((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}>‹</button>
              <b style={{ fontSize: 12 }}>{cursor.getFullYear()}年{cursor.getMonth() + 1}月</b>
              <button className="health-nav-btn" aria-label="下个月" onClick={() => setCursor((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}>›</button>
            </div>
          </div>
          <div className="health-month-grid">
            {WEEKDAYS.map((day) => <div className="health-weekday" key={day}>周{day}</div>)}
            {monthGridDays(cursor).map(({ key, date, current }) => {
              const cell = record(key);
              const previous = records[healthDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1))]?.period ?? false;
              const next = records[healthDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1))]?.period ?? false;
              const eventTypes = [...new Set(cell.events.map((event) => event.type))];
              const dominantClass = healthEventClassName(eventTypes[0] ?? '');
              const className = `health-day${current ? '' : ' muted'}${key === todayKey ? ' today' : ''}${key === selectedDate ? ' selected' : ''}${dominantClass ? ` has-${dominantClass}` : ''}`;
              return (
                <button className={className} key={key} onClick={() => setSelectedDate(key)} aria-pressed={key === selectedDate} aria-label={`${date.getMonth() + 1}月${date.getDate()}日`}>
                  <span className="health-day-num">{date.getDate()}</span>
                  {cell.weather || cell.temp
                    ? <span className="health-weather"><WeatherIcon weather={cell.weather} /> {cell.temp || ''}° {cell.weather}</span>
                    : <span className="health-weather small">天气未记</span>}
                  <span className="health-sleep">{cell.sleepStart || '--:--'} → {cell.sleepEnd || '--:--'}</span>
                  <span className="health-cell-meta">
                    {cell.exerciseMin ? <span className="health-cell-chip">动 {cell.exerciseMin}m</span> : null}
                    {normalizeMood(cell.mood) ? <MoodChip mood={cell.mood} /> : null}
                    {eventTypes.slice(0, 2).map((type) => <span key={type} className={`health-cell-chip ${healthEventClassName(type)}`}>{type}</span>)}
                  </span>
                  {cell.period ? <span className={periodBarClass(cell, previous, next)} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card health-detail" aria-label="健康详情">
          {selectedDate ? <HealthDetail date={selectedDate} record={record(selectedDate)} onUpdate={(patch) => updateRecord(selectedDate, (current) => ({ ...current, ...patch }))} onEvents={(events) => updateRecord(selectedDate, (current) => ({ ...current, events }))} /> : (
            <>
              <div className="health-detail-date">选择一天</div>
              <div className="small">点击月历中的日期查看并编辑</div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** Side effects: none. Local date title. */
function todayLabel(key: string): string {
  const now = new Date();
  return `今天 · ${now.getMonth() + 1}月${now.getDate()}日`;
}

/** Side effects: none. Native select restyled with a custom arrow, matching the app's flat inputs. */
function HealthSelect({ ariaLabel, value, onChange, children }: { ariaLabel: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <select className="health-mini-input" aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} style={{ appearance: 'none', WebkitAppearance: 'none', paddingRight: 22, cursor: 'pointer' }}>
        {children}
      </select>
      <span aria-hidden="true" style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-55%)', color: 'var(--accent-deep)', fontSize: 13, lineHeight: 1, pointerEvents: 'none' }}>⌄</span>
    </span>
  );
}

/** Side effects: none. Mood pill group with canonical mood value. */
function MoodPills({ prefix, value, onSelect }: { prefix: string; value: string; onSelect: (mood: HealthMood) => void }) {
  const normalized = normalizeMood(value);
  return (
    <div className="health-pill-row">
      {HEALTH_MOODS.map((mood) => (
        <button key={mood} className={`health-pill mood ${mood}${normalized === mood ? ' selected' : ''}`} aria-pressed={normalized === mood} aria-label={`${prefix}${moodLabel(mood)}`} onClick={() => onSelect(mood)}>
          <MoodFace mood={mood} />{moodLabel(mood)}
        </button>
      ))}
    </div>
  );
}

/** Side effects: none. Colored mood face glyph. */
function MoodFace({ mood }: { mood: HealthMood }) {
  return <span className={`mood-face ${mood}`} aria-hidden="true"><span className="mood-mouth" /></span>;
}

/** Side effects: none. Minimalist line weather icon (v2 prototype: flat monochrome stroke). */
function WeatherIcon({ weather }: { weather: string }) {
  return (
    <svg className="weather-ic" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {weather === '晴' && <><circle cx="8" cy="8" r="3" stroke="#F59E0B" strokeWidth="1.6" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round" /></>}
      {weather === '多云' && <><circle cx="5.2" cy="5.2" r="2.2" stroke="#F59E0B" strokeWidth="1.4" /><path d="M5.2 1.8v1M5.2 7.6v1M1.8 5.2h1M7.6 5.2h1M2.8 2.8l.7.7M6.9 6.9l.7.7M7.6 2.8l-.7.7M3.5 6.9l-.7.7" stroke="#F59E0B" strokeWidth="1.1" strokeLinecap="round" /><path d="M5.5 11.8h5.4a2.1 2.1 0 0 0 .3-4.2 2.9 2.9 0 0 0-5.4-.8 2 2 0 0 0-.3 4Z" stroke="#94A3B8" strokeWidth="1.5" strokeLinejoin="round" /></>}
      {weather === '阴' && <path d="M4 11.8h7.2a2.4 2.4 0 0 0 .4-4.8 3.5 3.5 0 0 0-6.5-1 2.6 2.6 0 0 0-1.1 5Z" stroke="#94A3B8" strokeWidth="1.6" strokeLinejoin="round" />}
      {weather === '小雨' && <><path d="M4 9.5h7.2a2.4 2.4 0 0 0 .4-4.8 3.5 3.5 0 0 0-6.5-1A2.6 2.6 0 0 0 4 9.5Z" stroke="#94A3B8" strokeWidth="1.5" strokeLinejoin="round" /><path d="M6.2 11.2l-.7 1.5M9.2 11.2l-.7 1.5" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" /></>}
      {weather === '雨' && <><path d="M4 9.2h7.2a2.4 2.4 0 0 0 .4-4.8 3.5 3.5 0 0 0-6.5-1A2.6 2.6 0 0 0 4 9.2Z" stroke="#94A3B8" strokeWidth="1.5" strokeLinejoin="round" /><path d="M5.6 10.9l-.8 2M8 10.9l-.8 2M10.4 10.9l-.8 2" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" /></>}
      {weather === '雪' && <><path d="M4 9.1h7.2a2.4 2.4 0 0 0 .4-4.8 3.5 3.5 0 0 0-6.5-1A2.6 2.6 0 0 0 4 9.1Z" stroke="#94A3B8" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 10.9v3M6.7 12.2h2.6M6.9 11.1l2.2 2.6M9.1 11.1l-2.2 2.6" stroke="#60A5FA" strokeWidth="1.3" strokeLinecap="round" /></>}
      {!['晴', '多云', '阴', '小雨', '雨', '雪'].includes(weather) && <circle cx="8" cy="8" r="1.2" fill="#CBD5E1" />}
    </svg>
  );
}

/** Side effects: none. Compact mood chip for calendar cells. */
function MoodChip({ mood }: { mood: string }) {
  const normalized = normalizeMood(mood);
  return <span className={`health-cell-chip mood ${normalized}`} title={moodLabel(mood)}><MoodFace mood={normalized as HealthMood} /><span>{moodLabel(mood)}</span></span>;
}

/** Side effects: none. Full per-day editor; edits delegate to Health via callbacks. */
function HealthDetail({ date, record: value, onUpdate, onEvents }: { date: string; record: HealthRecord; onUpdate: (patch: Partial<HealthRecord>) => void; onEvents: (events: HealthRecord['events']) => void }) {
  const parsed = new Date(`${date}T12:00:00`);
  const dayLabel = `${parsed.getMonth() + 1}月${parsed.getDate()}日 · ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parsed.getDay()]}`;
  return (
    <>
      <div className="health-detail-date">{dayLabel}</div>
      <div className="small">修改后自动保存到本地</div>

      <div className="health-detail-section">
        <div className="small">环境与作息</div>
        <div className="health-detail-row"><span>天气</span><span className="health-detail-controls">
          <input aria-label="详情天气" value={value.weather} style={{ width: 60 }} onChange={(event) => onUpdate({ weather: event.target.value })} />
          <input aria-label="详情温度" inputMode="decimal" value={value.temp} style={{ width: 45 }} onChange={(event) => onUpdate({ temp: event.target.value })} />°
          <input aria-label="详情湿度" inputMode="numeric" value={value.humidity} style={{ width: 45 }} onChange={(event) => onUpdate({ humidity: event.target.value })} />%
        </span></div>
        <div className="health-detail-row"><span>睡觉</span><input type="time" aria-label="详情睡觉时间" value={value.sleepStart} onChange={(event) => onUpdate({ sleepStart: event.target.value })} /></div>
        <div className="health-detail-row"><span>起床</span><input type="time" aria-label="详情起床时间" value={value.sleepEnd} onChange={(event) => onUpdate({ sleepEnd: event.target.value })} /></div>
        <div className="health-detail-row"><span>睡眠时长</span><b>{sleepDuration(value.sleepStart, value.sleepEnd) || '—'}</b></div>
        <div className="health-detail-row"><span>运动</span><span className="health-detail-controls">
          <input aria-label="详情运动类型" value={value.exerciseType} style={{ width: 70 }} onChange={(event) => onUpdate({ exerciseType: event.target.value })} />
          <input aria-label="详情运动时长" inputMode="numeric" value={value.exerciseMin} style={{ width: 48 }} onChange={(event) => onUpdate({ exerciseMin: event.target.value })} /> min
        </span></div>
        <div className="health-detail-row" style={{ alignItems: 'flex-start' }}><span>情绪</span><MoodPills prefix="详情情绪" value={value.mood} onSelect={(mood) => onUpdate({ mood })} /></div>
        <div className="health-detail-row" style={{ alignItems: 'flex-start' }}><span>情绪记录</span><input aria-label="详情情绪记录" placeholder="一句话记录具体情绪" value={value.moodNote} onChange={(event) => onUpdate({ moodNote: event.target.value })} /></div>
      </div>

      <div className="health-detail-section">
        <div className="small">经期</div>
        <div className="health-detail-row">
          <span>{value.period ? '已标记为经期' : '非经期 / 未记录'}</span>
          <button className="text-action" onClick={() => value.period ? onUpdate({ period: false, flow: '', periodSymptoms: [] }) : onUpdate({ period: true })}>{value.period ? '取消标记' : '标记经期'}</button>
        </div>
        {value.period && (
          <>
            <div className="health-detail-row"><span>经血量</span>
              <HealthSelect ariaLabel="详情经血量" value={value.flow} onChange={(flow) => onUpdate({ flow })}>
                <option value="">未记录</option>
                {HEALTH_FLOWS.map((flow) => <option key={flow}>{flow}</option>)}
              </HealthSelect>
            </div>
            <div className="health-detail-row" style={{ alignItems: 'flex-start' }}><span>症状</span>
              <div className="health-pill-row" style={{ marginTop: 0, justifyContent: 'flex-end' }}>
                {HEALTH_PERIOD_SYMPTOMS.map((symptom) => (
                  <button key={symptom} className={`health-pill${value.periodSymptoms.includes(symptom) ? ' selected' : ''}`} aria-pressed={value.periodSymptoms.includes(symptom)} onClick={() => onUpdate({ periodSymptoms: value.periodSymptoms.includes(symptom) ? value.periodSymptoms.filter((item) => item !== symptom) : [...value.periodSymptoms, symptom] })}>{symptom}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="health-detail-section">
        <div className="small">身体事件</div>
        <div className="health-pill-row" style={{ marginTop: 7 }}>
          {HEALTH_EVENT_TYPES.map((type) => (
            <button key={type} className="health-pill" onClick={() => onEvents([...value.events, { type, label: HEALTH_EVENT_PRESETS[type][0], note: '' }])}>{type}</button>
          ))}
        </div>
        {value.events.length ? value.events.map((event, index) => (
          <div className={`health-event ${healthEventClassName(event.type)}`} key={`${event.type}-${index}`}>
            <div className="health-event-head"><span>{event.type}</span><button className="health-delete" onClick={() => onEvents(value.events.filter((_, item) => item !== index))}>删除</button></div>
            <div className="health-event-edit">
              <input aria-label={`事件${index}名称`} value={event.label} style={{ width: 90 }} onChange={(event) => onEvents(value.events.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value.trim() } : item))} />
              <input aria-label={`事件${index}备注`} placeholder="备注" value={event.note} onChange={(event) => onEvents(value.events.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value.trim() } : item))} />
            </div>
          </div>
        )) : <div className="small" style={{ marginTop: 7 }}>这一天没有身体事件</div>}
      </div>
    </>
  );
}
