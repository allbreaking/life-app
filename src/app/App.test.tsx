import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { App } from './App';

let desktopAction: ((event: { payload: string }) => void) | undefined;
let menuTodoComplete: ((event: { payload: string }) => void) | undefined;
let tradeWatchAdded: ((event: { payload: unknown }) => void) | undefined;
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((name: string, handler: (event: { payload: never }) => void) => {
    if (name === 'desktop-action') desktopAction = handler as typeof desktopAction;
    if (name === 'menu-todo-complete') menuTodoComplete = handler as typeof menuTodoComplete;
    if (name === 'trade-watch-added') tradeWatchAdded = handler as typeof tradeWatchAdded;
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

test('marks the scheduled task complete through the menu bar task id', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: { invoke: vi.fn().mockResolvedValue(null) },
  });
  render(<App />);
  await act(async () => menuTodoComplete?.({ payload: 'today-architecture' }));
  expect(screen.getByText('#LifeOS 架构梳理').closest('button')).toHaveClass('done');
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

test('renders all nine module navigation entries', () => {
  render(<App />);
  expect(screen.getAllByRole('button', { current: false })).toBeTruthy();
  for (const name of ['今日总览', '人生地图', '工作', '日程', '财务', '物品', '社交', '投资', '学习']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  }
});

test('keeps window chrome out of the app and exposes no quick capture button', () => {
  render(<App />);
  expect(document.querySelector('.system-bar')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /快捷录入/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '数据保护' })).toBeInTheDocument();
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
  const opener = screen.getByRole('button', { name: '今日总览' });
  opener.focus();
  fireEvent.keyDown(window, { altKey: true, code: 'Space' });
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

test('maps module alert states to the shared pulse animation classes', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 16, 12));
  try {
    render(<App />);
    expect(screen.getByRole('heading', { name: /预警聚合/ }).closest('section')).toHaveClass('alert-crimson');

    fireEvent.click(screen.getByRole('button', { name: '财务' }));
    expect(screen.getByRole('heading', { name: '月度预算' }).closest('section')).toHaveClass('alert-amber');

    fireEvent.click(screen.getByRole('button', { name: '物品' }));
    expect(screen.getAllByText(/已过期/)[0].closest('.food-row')).toHaveClass('alert-crimson');

    fireEvent.click(screen.getByRole('button', { name: '投资' }));
    expect(screen.getByText('已跌破安全价', { selector: '.chip' }).closest('.watch-row')).toHaveClass('alert-sky');
    expect(screen.getByText('已达中枢目标价', { selector: '.chip' }).closest('.watch-row')).toHaveClass('alert-crimson');
  } finally {
    vi.useRealTimers();
  }
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

test('shows the 500 yuan goal and manually increases validated units', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '财务' }));
  expect(screen.getByRole('progressbar', { name: '500 元积累目标进度' })).toHaveAttribute('aria-valuenow', '1500');
  expect(screen.getByText(/750,000 \/ ¥1,500,000/)).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText('本次变动份数'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: '增加进度' }));
  expect(screen.getByRole('progressbar', { name: '500 元积累目标进度' })).toHaveAttribute('aria-valuenow', '1510');
  expect(screen.getByRole('status')).toHaveTextContent('已增加 10 份（¥5,000）');

  fireEvent.change(screen.getByPlaceholderText('本次变动份数'), { target: { value: '1491' } });
  fireEvent.click(screen.getByRole('button', { name: '增加进度' }));
  expect(screen.getByRole('status')).toHaveTextContent('最多还可增加 1490 份');
  expect(screen.getByRole('progressbar', { name: '500 元积累目标进度' })).toHaveAttribute('aria-valuenow', '1510');

  fireEvent.change(screen.getByPlaceholderText('本次变动份数'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: '减少进度' }));
  expect(screen.getByRole('progressbar', { name: '500 元积累目标进度' })).toHaveAttribute('aria-valuenow', '1500');
  expect(screen.getByRole('status')).toHaveTextContent('已减少 10 份（¥5,000）');

  fireEvent.change(screen.getByPlaceholderText('本次变动份数'), { target: { value: '1501' } });
  fireEvent.click(screen.getByRole('button', { name: '减少进度' }));
  expect(screen.getByRole('status')).toHaveTextContent('最多可减少 1500 份');
  expect(screen.getByRole('progressbar', { name: '500 元积累目标进度' })).toHaveAttribute('aria-valuenow', '1500');
});

test('edits and cancels the monthly budget in place', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '财务' }));
  const budgetCard = screen.getByRole('heading', { name: '月度预算' }).closest('section') as HTMLElement;

  fireEvent.click(within(budgetCard).getByRole('button', { name: '修改月度预算' }));
  const editor = within(budgetCard).getByRole('textbox', { name: '月度预算金额' });
  expect(editor).toHaveValue('3000.00');
  fireEvent.change(editor, { target: { value: '4000' } });
  fireEvent.click(within(budgetCard).getByRole('button', { name: '取消' }));
  expect(within(budgetCard).getByRole('button', { name: '修改月度预算' })).toHaveTextContent('¥3,000.00');

  fireEvent.click(within(budgetCard).getByRole('button', { name: '修改月度预算' }));
  fireEvent.keyDown(within(budgetCard).getByRole('textbox', { name: '月度预算金额' }), { key: 'Escape' });
  expect(within(budgetCard).queryByRole('textbox', { name: '月度预算金额' })).not.toBeInTheDocument();

  fireEvent.click(within(budgetCard).getByRole('button', { name: '修改月度预算' }));
  fireEvent.change(within(budgetCard).getByRole('textbox', { name: '月度预算金额' }), { target: { value: '-1' } });
  fireEvent.click(within(budgetCard).getByRole('button', { name: '保存' }));
  expect(screen.getByRole('status')).toHaveTextContent('请输入大于 0、最多两位小数的月度预算');
  expect(within(budgetCard).getByRole('textbox', { name: '月度预算金额' })).toBeInTheDocument();

  fireEvent.change(within(budgetCard).getByRole('textbox', { name: '月度预算金额' }), { target: { value: '4000' } });
  fireEvent.click(within(budgetCard).getByRole('button', { name: '保存' }));
  expect(within(budgetCard).getByRole('button', { name: '修改月度预算' })).toHaveTextContent('¥4,000.00');
  expect(budgetCard).toHaveTextContent('已用 62%');
  expect(screen.getByRole('status')).toHaveTextContent('月度预算已更新为 ¥4,000.00');
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

test('shows inventory as lists and supports inline item edit, cancel, and delete', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '物品' }));
  expect(screen.getByRole('heading', { name: /物品清单/ })).toBeInTheDocument();
  expect(screen.getByText('净水器滤芯').closest('.item-list-row')).toHaveTextContent('厨房水槽下');

  fireEvent.click(screen.getByRole('button', { name: '编辑 净水器滤芯 物品' }));
  fireEvent.change(screen.getByLabelText('编辑 净水器滤芯 名称'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: '保存 净水器滤芯 物品' }));
  expect(screen.getByRole('alert')).toHaveTextContent('物品名称和存放位置必填');
  fireEvent.click(screen.getByRole('button', { name: '取消编辑 净水器滤芯 物品' }));

  fireEvent.click(screen.getByRole('button', { name: '编辑 净水器滤芯 物品' }));
  fireEvent.change(screen.getByLabelText('编辑 净水器滤芯 位置'), { target: { value: '储物间' } });
  fireEvent.click(screen.getByRole('button', { name: '取消编辑 净水器滤芯 物品' }));
  expect(screen.getByText('净水器滤芯').closest('.item-list-row')).toHaveTextContent('厨房水槽下');

  fireEvent.click(screen.getByRole('button', { name: '编辑 净水器滤芯 物品' }));
  fireEvent.change(screen.getByLabelText('编辑 净水器滤芯 名称'), { target: { value: '净水滤芯' } });
  fireEvent.change(screen.getByLabelText('编辑 净水器滤芯 位置'), { target: { value: '储物间' } });
  fireEvent.click(screen.getByRole('button', { name: '保存 净水器滤芯 物品' }));
  expect(screen.getByRole('status')).toHaveTextContent('物品已保存');
  expect(screen.getByText('净水滤芯').closest('.item-list-row')).toHaveTextContent('储物间');

  fireEvent.click(screen.getByRole('button', { name: '删除 净水滤芯 物品' }));
  expect(screen.queryByText('净水滤芯')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('物品已删除');
});

test('supports inline food edit with expiry recalculation and delete', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '物品' }));
  fireEvent.click(screen.getByRole('button', { name: '编辑 鲜牛奶 食物' }));
  fireEvent.change(screen.getByLabelText('编辑 鲜牛奶 到期日'), { target: { value: '2099-12-31' } });
  fireEvent.click(screen.getByRole('button', { name: '保存 鲜牛奶 食物' }));
  expect(screen.getByRole('status')).toHaveTextContent('食物已保存，到期预警已更新');
  expect(screen.getByText('鲜牛奶').closest('.food-row')).not.toHaveClass('alert-crimson');

  fireEvent.click(screen.getByRole('button', { name: '删除 鲜牛奶 食物' }));
  expect(screen.queryByText('鲜牛奶')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('食物已删除');
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
  expect(screen.getByText(/新浪行情 · 手动刷新/)).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('现价')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('止损价')).not.toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: '乐观目标价' })).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: '中枢目标价' })).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: '悲观目标价' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '商业模式评分' })).not.toBeRequired();
  expect(within(screen.getByRole('button', { name: '加入观察列表' }).closest('form')!).queryByRole('spinbutton', { name: '安全价' })).not.toBeInTheDocument();
  expect(screen.getByText('距中枢目标价')).toBeInTheDocument();
  expect(screen.queryByText('安全价', { selector: '.watch-head span' })).not.toBeInTheDocument();
  const maotaiWatchRow = screen.getByText('已跌破安全价', { selector: '.chip' }).closest('.watch-row');
  expect(maotaiWatchRow).toHaveTextContent('¥1800');
  expect(maotaiWatchRow).toHaveTextContent('¥1680');
  expect(maotaiWatchRow).toHaveTextContent('¥1550');
  expect(maotaiWatchRow).toHaveTextContent('距乐观 +24.83%');
  expect(maotaiWatchRow).toHaveTextContent('距中枢 +16.50%');
  expect(maotaiWatchRow).toHaveTextContent('距悲观 +7.49%');
  const maotaiRatings = within(maotaiWatchRow as HTMLElement).getByLabelText('贵州茅台 四维评分');
  expect(within(maotaiRatings).getByLabelText('商业模式 5 星')).toHaveTextContent('★★★★★');
  expect(within(maotaiRatings).getByLabelText('现金流 5 星')).toHaveTextContent('★★★★★');
  expect(within(maotaiRatings).queryByText('当前估值')).not.toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: '观察列表标的' });
  expect(trigger.parentElement).toHaveClass('trade-select');
  expect(trigger).toHaveTextContent('600519 贵州茅台');
  fireEvent.click(trigger);
  const positionSearch = screen.getByRole('searchbox', { name: '按股票代码搜索持仓标的' });
  fireEvent.change(positionSearch, { target: { value: '002' } });
  const filteredPositionOptions = within(screen.getByRole('listbox', { name: '观察列表标的选项' }));
  expect(filteredPositionOptions.getAllByRole('option')).toHaveLength(1);
  expect(filteredPositionOptions.getByRole('option')).toHaveTextContent('002230科大讯飞');
  fireEvent.change(positionSearch, { target: { value: '999' } });
  expect(screen.getByText('无匹配股票代码')).toBeInTheDocument();
  expect(filteredPositionOptions.queryByRole('option')).not.toBeInTheDocument();
  fireEvent.change(positionSearch, { target: { value: '' } });
  const options = within(screen.getByRole('listbox', { name: '观察列表标的选项' })).getAllByRole('option');
  expect(options).toHaveLength(2);
  expect(options[0]).toHaveTextContent('600519贵州茅台');
  expect(options[0]).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(trigger).toHaveTextContent('002230 科大讯飞');
  expect(trigger.closest('form')?.querySelector('input[name="watchlistId"]')).toHaveValue('w2');
  const positionRow = screen.getByText('¥42.40').closest('.position-row');
  expect(positionRow).toHaveTextContent('+7.85%');
  expect(positionRow).not.toHaveTextContent('¥41.20');
  expect(positionRow).toHaveTextContent('+4.71%');
  expect(positionRow).toHaveTextContent('+12.35%');

  fireEvent.click(screen.getByRole('button', { name: '编辑 科大讯飞 建仓价' }));
  const priceEditor = screen.getByRole('spinbutton', { name: '编辑 科大讯飞 建仓价' });
  fireEvent.change(priceEditor, { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(positionRow).toHaveTextContent('¥40.00');
  expect(positionRow).toHaveTextContent('+3.00%');
  expect(positionRow).toHaveTextContent('+0.00%');
  expect(positionRow).toHaveTextContent('+17.65%');
  expect(positionRow).toHaveTextContent('¥46.00');
  expect(screen.getByRole('status')).toHaveTextContent('建仓价已更新');

  fireEvent.click(screen.getByRole('button', { name: '编辑 科大讯飞 建仓价' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: '编辑 科大讯飞 建仓价' }), { target: { value: '50' } });
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(positionRow).toHaveTextContent('¥40.00');

  fireEvent.click(screen.getByRole('button', { name: '清仓 科大讯飞' }));
  const closePriceEditor = screen.getByRole('spinbutton', { name: '输入 科大讯飞 清仓价' });
  fireEvent.change(closePriceEditor, { target: { value: '46' } });
  fireEvent.click(screen.getByRole('button', { name: '确认' }));
  expect(screen.getByRole('status')).toHaveTextContent('清仓记录已保存');
  expect(screen.queryByRole('button', { name: '清仓 科大讯飞' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: '已清仓' }));
  const closedRow = screen.getByText('+15.00%').closest('.closed-position-row');
  expect(closedRow).toHaveTextContent('002230 科大讯飞');
  expect(closedRow).toHaveTextContent('¥40.00');
  expect(closedRow).toHaveTextContent('¥46.00');
  fireEvent.click(screen.getByRole('button', { name: '删除 科大讯飞 清仓记录' }));
  expect(screen.queryByText('+15.00%')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('清仓记录已删除');
});

test('merges an agent-added watch event by stable id without restarting', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: { invoke: vi.fn().mockResolvedValue(null) },
  });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '投资' }));
  await act(async () => undefined);
  const watch = {
    id: '018fb47d-4dc7-7e9a-8a6f-5df4f34c6910', code: '000001', name: '平安银行',
    optimisticTarget: 15, target: 13, pessimisticTarget: 11, safety: 0, current: 12.5, tags: ['银行'],
    businessModelRating: 4, quoteAt: '2026-08-30T15:00:00', createdAt: '2026-08-30T15:01:00.000Z',
  };
  await act(async () => tradeWatchAdded?.({ payload: watch }));
  await act(async () => tradeWatchAdded?.({ payload: watch }));
  expect(screen.getAllByRole('button', { name: '编辑 平安银行 观察标的' })).toHaveLength(1);
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

test('filters the investment watchlist by derived price status', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '投资' }));
  expect(screen.getByText('2 个标的')).toBeInTheDocument();
  expect(screen.getByText('第 1 / 1 页')).toBeInTheDocument();

  const editOrder = () => screen.getAllByRole('button', { name: /编辑 .* 观察标的/ }).map((button) => button.getAttribute('aria-label'));
  expect(editOrder()).toEqual(['编辑 科大讯飞 观察标的', '编辑 贵州茅台 观察标的']);
  fireEvent.change(screen.getByRole('combobox', { name: '按评分维度排序' }), { target: { value: 'profitabilityRating' } });
  expect(editOrder()).toEqual(['编辑 贵州茅台 观察标的', '编辑 科大讯飞 观察标的']);
  fireEvent.click(screen.getByRole('button', { name: '切换评分排序方向' }));
  expect(editOrder()).toEqual(['编辑 科大讯飞 观察标的', '编辑 贵州茅台 观察标的']);

  const codeSearch = screen.getByRole('searchbox', { name: '按股票代码或名称搜索观察列表' });
  fireEvent.change(codeSearch, { target: { value: ' 600 ' } });
  expect(screen.getByText('1 个标的')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '编辑 贵州茅台 观察标的' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '编辑 科大讯飞 观察标的' })).not.toBeInTheDocument();
  fireEvent.change(codeSearch, { target: { value: '讯飞' } });
  expect(screen.getByText('1 个标的')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '编辑 科大讯飞 观察标的' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '编辑 贵州茅台 观察标的' })).not.toBeInTheDocument();
  fireEvent.change(codeSearch, { target: { value: '' } });

  fireEvent.click(screen.getByRole('button', { name: '已达中枢目标价' }));
  expect(screen.getByText('1 个标的')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '编辑 科大讯飞 观察标的' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '编辑 贵州茅台 观察标的' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '观察中' }));
  expect(screen.getByText('0 个标的')).toBeInTheDocument();
  expect(screen.getByText('暂无符合条件的观察标的')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '已跌破安全价' }));
  expect(screen.getByText('1 个标的')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '编辑 贵州茅台 观察标的' })).toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: '按标签筛选' }), { target: { value: 'AI' } });
  expect(screen.getByText('0 个标的')).toBeInTheDocument();
  expect(screen.getByText('暂无符合条件的观察标的')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '全部' }));
  expect(screen.getByText('1 个标的')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '编辑 科大讯飞 观察标的' })).toBeInTheDocument();
});

test('rejects an invalid watch target range before requesting a quote', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '投资' }));
  fireEvent.change(screen.getByRole('textbox', { name: '股票代码' }), { target: { value: '000001' } });
  fireEvent.change(screen.getByRole('textbox', { name: '股票名称' }), { target: { value: '平安银行' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: '乐观目标价' }), { target: { value: '10' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: '中枢目标价' }), { target: { value: '12' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: '悲观目标价' }), { target: { value: '8' } });
  fireEvent.submit(screen.getByRole('button', { name: '加入观察列表' }).closest('form')!);
  expect(screen.getByRole('status')).toHaveTextContent('乐观目标价 ≥ 中枢目标价 ≥ 悲观目标价');
  expect(screen.getByRole('button', { name: '加入观察列表' })).not.toBeDisabled();
  expect(screen.queryByText(/正在读取新浪行情/)).not.toBeInTheDocument();
});

test('edits, cancels, and deletes an unreferenced watch item in place', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '投资' }));
  fireEvent.click(screen.getByRole('button', { name: '编辑 贵州茅台 观察标的' }));
  const nameEditor = screen.getByRole('textbox', { name: '编辑 贵州茅台 名称' });
  expect(nameEditor.closest('.watch-row')).toHaveClass('watch-row-editor');
  expect(screen.queryByRole('spinbutton', { name: /编辑 贵州茅台 现价/ })).not.toBeInTheDocument();
  fireEvent.change(nameEditor, { target: { value: '茅台核心' } });
  fireEvent.change(screen.getByRole('textbox', { name: '编辑 贵州茅台 标签' }), { target: { value: '消费，价值，消费' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: '编辑 贵州茅台 乐观目标价' }), { target: { value: '1820' } });
  fireEvent.change(screen.getByRole('combobox', { name: '编辑 贵州茅台 现金流评分' }), { target: { value: '0' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存 贵州茅台 观察标的' })));
  const updatedRow = screen.getByRole('button', { name: '编辑 茅台核心 观察标的' }).closest('.watch-row');
  expect(updatedRow).toHaveTextContent('¥1820');
  expect(updatedRow).toHaveTextContent('消费');
  expect(updatedRow).toHaveTextContent('价值');
  expect(within(updatedRow as HTMLElement).getByLabelText('现金流 0 星')).toHaveTextContent('☆☆☆☆☆');

  fireEvent.click(screen.getByRole('button', { name: '编辑 茅台核心 观察标的' }));
  fireEvent.change(screen.getByRole('textbox', { name: '编辑 茅台核心 名称' }), { target: { value: '不应保存' } });
  fireEvent.click(screen.getByRole('button', { name: '取消编辑 茅台核心 观察标的' }));
  expect(screen.getByRole('button', { name: '编辑 茅台核心 观察标的' })).toBeInTheDocument();
  expect(screen.queryByDisplayValue('不应保存')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '删除 茅台核心 观察标的' }));
  expect(screen.queryByRole('button', { name: '编辑 茅台核心 观察标的' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('观察标的已删除');
  const trigger = screen.getByRole('button', { name: '观察列表标的' });
  fireEvent.click(trigger);
  const positionOptions = within(screen.getByRole('listbox', { name: '观察列表标的选项' }));
  expect(positionOptions.getAllByRole('option')).toHaveLength(1);
  expect(positionOptions.getByRole('option')).toHaveTextContent('002230科大讯飞');
});

test('keeps invalid watch edits in place and blocks deleting referenced items', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '投资' }));
  fireEvent.click(screen.getByRole('button', { name: '编辑 贵州茅台 观察标的' }));
  fireEvent.change(screen.getByRole('textbox', { name: '编辑 贵州茅台 标签' }), { target: { value: '123456789012345678901' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存 贵州茅台 观察标的' })));
  expect(screen.getByRole('alert')).toHaveTextContent('标签最多 10 个，每个最多 20 个字符');
  fireEvent.change(screen.getByRole('textbox', { name: '编辑 贵州茅台 标签' }), { target: { value: '消费，核心资产' } });
  fireEvent.change(screen.getByRole('textbox', { name: '编辑 贵州茅台 代码' }), { target: { value: '123' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存 贵州茅台 观察标的' })));
  expect(screen.getByRole('alert')).toHaveTextContent('六位 A 股或五位港股代码');
  expect(screen.getByRole('alert').closest('.watch-row')).toHaveClass('watch-row-editor');

  fireEvent.change(screen.getByRole('textbox', { name: '编辑 贵州茅台 代码' }), { target: { value: '600519' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: '编辑 贵州茅台 乐观目标价' }), { target: { value: '1600' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存 贵州茅台 观察标的' })));
  expect(screen.getByRole('status')).toHaveTextContent('乐观目标价 ≥ 中枢目标价 ≥ 悲观目标价');
  expect(screen.getByRole('alert')).toHaveTextContent('乐观目标价 ≥ 中枢目标价 ≥ 悲观目标价');
  expect(screen.getByRole('textbox', { name: '编辑 贵州茅台 名称' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '取消编辑 贵州茅台 观察标的' }));

  fireEvent.click(screen.getByRole('button', { name: '删除 科大讯飞 观察标的' }));
  expect(screen.getByRole('button', { name: '编辑 科大讯飞 观察标的' }).closest('.watch-row')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('仍有关联持仓或清仓记录，不能删除');
});

test('edits the investment SOP in place and supports save and cancel', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '投资' }));
  fireEvent.click(screen.getByRole('button', { name: '编辑投资 SOP' }));
  const editor = screen.getByRole('textbox', { name: '在当前位置修改投资纪律' });
  expect(editor.closest('.trade-sop')).toBeInTheDocument();
  fireEvent.change(editor, { target: { value: '  先看风险\n再做决策  ' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  const displayedSop = screen.getByText((_, element) => element?.textContent === '先看风险\n再做决策');
  expect(displayedSop).toHaveClass('trade-sop-content');
  expect(displayedSop).toHaveTextContent('先看风险 再做决策');
  expect(screen.getByRole('status')).toHaveTextContent('投资 SOP 已保存');

  fireEvent.click(screen.getByRole('button', { name: '编辑投资 SOP' }));
  fireEvent.change(screen.getByRole('textbox', { name: '在当前位置修改投资纪律' }), { target: { value: '不应保存' } });
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByText((_, element) => element?.textContent === '先看风险\n再做决策')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('不应保存')).not.toBeInTheDocument();
});

test('edits and deletes daily investment reviews in place', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '投资' }));
  fireEvent.click(screen.getByRole('button', { name: '编辑 2026-07-25 每日复盘' }));
  const editor = screen.getByRole('textbox', { name: '编辑 2026-07-25 每日复盘' });
  expect(editor.closest('.trade-review-item')).toBeInTheDocument();
  fireEvent.change(editor, { target: { value: '  复盘后继续观察量能  ' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(screen.getByText('复盘后继续观察量能')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('复盘已更新');

  fireEvent.click(screen.getByRole('button', { name: '编辑 2026-07-25 每日复盘' }));
  fireEvent.change(screen.getByRole('textbox', { name: '编辑 2026-07-25 每日复盘' }), { target: { value: '不应保存' } });
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByText('复盘后继续观察量能')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '删除 2026-07-25 每日复盘' }));
  expect(screen.queryByText('复盘后继续观察量能')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('复盘已删除');
});

test('deletes an active position without creating a closed-position record', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '投资' }));
  fireEvent.click(screen.getByRole('button', { name: '删除 科大讯飞 持仓' }));
  expect(screen.queryByRole('button', { name: '删除 科大讯飞 持仓' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('持仓已删除');
  fireEvent.click(screen.getByRole('tab', { name: '已清仓' }));
  expect(screen.queryByText('+7.85%')).not.toBeInTheDocument();
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
