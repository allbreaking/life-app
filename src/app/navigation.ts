export const modules = [
  { id: 'dashboard', label: '今日总览', symbol: '⌂', subtitle: '高杠杆，低负荷 — 每日聚焦，信息过滤' },
  { id: 'compass', label: '人生地图', symbol: '⌾', subtitle: 'Being / Doing — 原则驱动，而非目标堆砌' },
  { id: 'work', label: '工作', symbol: '▣', subtitle: '聚焦真正重要的工作' },
  { id: 'schedule', label: '日程', symbol: '□', subtitle: '唯一的具体时间安排入口' },
  { id: 'finance', label: '财务', symbol: '▱', subtitle: '让资源流向真正重要的事' },
  { id: 'items', label: '物品', symbol: '◇', subtitle: '知道拥有什么，以及它在哪里' },
  { id: 'network', label: '社交', symbol: '◎', subtitle: '真诚记录，不量化关系' },
  { id: 'trade', label: '投资', symbol: '↗', subtitle: '纪律优先于预测' },
  { id: 'learning', label: '学习', symbol: '▤', subtitle: '围绕领域持续积累' },
] as const;

export type ModuleId = (typeof modules)[number]['id'];

/** Side effects: none. */
export function isModuleId(value: string | null): value is ModuleId {
  return modules.some((module) => module.id === value);
}
