import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { App } from './App';

let desktopAction: ((event: { payload: string }) => void) | undefined;
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_name: string, handler: (event: { payload: string }) => void) => {
    desktopAction = handler;
    return Promise.resolve(vi.fn());
  }),
}));

beforeEach(() => window.localStorage.clear());

test('handles native menu actions for quick capture and dashboard navigation', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: { invoke: vi.fn().mockResolvedValue(null) },
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '学习' }));
  await act(async () => desktopAction?.({ payload: 'open-quick-capture' }));
  expect(screen.getByRole('dialog', { name: '快捷录入' })).toBeInTheDocument();
  await act(async () => desktopAction?.({ payload: 'show-dashboard' }));
  expect(screen.queryByRole('dialog', { name: '快捷录入' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: '今日总览' })).toBeInTheDocument();
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

test('renders all nine module navigation entries', () => {
  render(<App />);
  expect(screen.getAllByRole('button', { current: false })).toBeTruthy();
  for (const name of ['今日总览', '人生地图', '工作', '日程', '财务', '物品', '社交', '投资', '学习']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  }
});

test('restores module selection and opens quick capture via Option+Space', () => {
  window.localStorage.setItem('life-os.active-module', 'learning');
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: '学习' })).toBeInTheDocument();
  fireEvent.keyDown(window, { altKey: true, code: 'Space' });
  expect(screen.getByRole('dialog', { name: '快捷录入' })).toBeInTheDocument();
});

test('keeps quick capture focus inside the modal and restores its opener', () => {
  render(<App />);
  const opener = screen.getByRole('button', { name: /快捷录入 ⌥Space/ });
  opener.focus();
  fireEvent.click(opener);
  const close = screen.getByRole('button', { name: '关闭快捷录入' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Tab' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(close).toHaveFocus();
  fireEvent.click(close);
  expect(opener).toHaveFocus();
});

test('provides a keyboard skip link to the main content', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: '跳到主内容' })).toHaveAttribute('href', '#main-content');
  expect(document.querySelector('#main-content')).toHaveAttribute('tabindex', '-1');
});

test('opens data protection with a safe browser-preview fallback', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '数据保护' }));
  expect(screen.getByRole('dialog', { name: '数据保护' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('仅在 Life-OS 桌面版中可用');
  expect(screen.queryByRole('button', { name: '创建备份' })).not.toBeInTheDocument();
});

test('matches the frozen dashboard information structure', () => {
  render(<App />);
  expect(screen.getByText('本月北极星')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /今日待办/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /预警聚合/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '本周投入统计' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '即将到来的重要日期' })).toBeInTheDocument();
});

test('renders compass principles and accepts a validated local principle draft', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '人生地图' }));
  expect(screen.getByRole('heading', { name: /^Being/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '新增 Being 原则' }));
  fireEvent.change(screen.getByPlaceholderText('领域，如 学习/工作'), { target: { value: '学习' } });
  fireEvent.change(screen.getByPlaceholderText('原则内容'), { target: { value: '先输出再收集' } });
  fireEvent.click(screen.getByRole('button', { name: '添加' }));
  expect(screen.getByText('学习：先输出再收集')).toBeInTheDocument();
});

test('enforces the Q1 active task limit', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '工作' }));
  fireEvent.click(screen.getByRole('button', { name: '新增 Q1 任务' }));
  fireEvent.change(screen.getByPlaceholderText('任务名 @优先级 #项目'), { target: { value: '第三个紧急任务' } });
  fireEvent.click(screen.getByRole('button', { name: '添加任务' }));
  expect(screen.getByRole('status')).toHaveTextContent('Q1 同时进行不能超过 2 项');
});

test('schedules one source task without duplicating it and can return it to the pool', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '日程' }));
  expect(screen.getByRole('tab', { name: '日视图', selected: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '排期 客户环境部署修复' }));
  expect(screen.queryByRole('button', { name: '排期 客户环境部署修复' })).not.toBeInTheDocument();
  expect(screen.getByText(/09:00 客户环境部署修复/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '增加 客户环境部署修复 时长 15 分钟' }));
  expect(screen.getByRole('status')).toHaveTextContent('任务时长已按 15 分钟增加');
  fireEvent.click(screen.getByRole('button', { name: '撤销排期 客户环境部署修复' }));
  expect(screen.getByRole('button', { name: '排期 客户环境部署修复' })).toBeInTheDocument();
});

test('marks projected life schedules as read-only', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '日程' }));
  expect(screen.getAllByText(/生活模板 · 只读/).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: /撤销排期 晨间拉伸/ })).not.toBeInTheDocument();
});

test('routes non-essential expenses into the month-end queue', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '财务' }));
  fireEvent.click(screen.getByRole('button', { name: '非必要支出' }));
  fireEvent.change(screen.getByPlaceholderText('金额，如 -35 或 +200'), { target: { value: '-88' } });
  fireEvent.change(screen.getByPlaceholderText('备注，如 买猫粮'), { target: { value: '新键盘' } });
  fireEvent.click(screen.getByRole('button', { name: '记一笔' }));
  expect(screen.getByRole('status')).toHaveTextContent('已进入月末评估队列');
  expect(screen.getByText(/新键盘/)).toBeInTheDocument();
});

test('requires a location and expiry date for food items', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '物品' }));
  fireEvent.click(screen.getByRole('button', { name: '食物' }));
  fireEvent.change(screen.getByPlaceholderText('物品名称'), { target: { value: '酸奶' } });
  const form = screen.getByRole('button', { name: '保存' }).closest('form')!;
  fireEvent.submit(form);
  expect(screen.getByRole('status')).toHaveTextContent('物品名称和存放位置必填');
  fireEvent.change(screen.getByPlaceholderText(/存放位置/), { target: { value: '冰箱' } });
  fireEvent.submit(form);
  expect(screen.getByRole('status')).toHaveTextContent('食物必须填写到期日');
});

test('keeps social records factual without relationship scoring', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '社交' }));
  expect(screen.getByText(/不对关系做量化打分/)).toBeInTheDocument();
  expect(screen.queryByText(/关系评分/)).not.toBeInTheDocument();
  expect(screen.queryByText(/断联倒计时：/)).not.toBeInTheDocument();
});

test('only offers watchlist instruments when creating a position', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '投资' }));
  const select = screen.getByRole('combobox', { name: '观察列表标的' });
  expect(select).toHaveTextContent('600519 贵州茅台');
  expect(select).toHaveTextContent('002230 科大讯飞');
  expect(select.querySelectorAll('option')).toHaveLength(2);
});

test('opens a full learning domain workspace and derives milestone progress', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '学习' }));
  expect(screen.queryByText('阶段性任务')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /#Java\/Kafka 深化/ }));
  expect(screen.getByRole('button', { name: '← 返回领域列表' })).toBeInTheDocument();
  expect(screen.getByText('里程碑进度 2/4（自动派生）')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: /梳理故障恢复机制/ }));
  expect(screen.getByText('里程碑进度 3/4（自动派生）')).toBeInTheDocument();
});
