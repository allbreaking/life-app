# 健康模块规格

> 状态：已实现（依据用户 2026-09-19 指令与 `life_os_health_v1.html` 原型）
> 范围：`Health` 单模块

## 目标

- 按冻结原型迁移健康模块：今日快速记录、健康月历、按日期详情编辑与经期/身体事件记录。
- 数据按本地日期 `YYYY-MM-DD` 组织为 `health.records` 单资源，经 typed IPC 持久化到 SQLite。
- 复用全局 card/chip/tag/small/command-button 风格，不引入网络、通知或剪贴板副作用。

## 数据模型

- `health.records`：`Record<date, HealthRecord>`，值以 `domain_value` 对象标量存储。
- `HealthRecord`：`weather`、`temp`、`humidity`、`sleepStart`、`sleepEnd`、`exerciseType`、`exerciseMin`、`mood`、`moodNote`、`period`、`flow`、`periodSymptoms`、`events`。
- `HealthEvent`：`{ type: '皮肤' | '肠胃' | '牙齿', label, note }`。
- 情绪使用标准值 `happy / anxious / neutral / sad`；旧 emoji（`🙂` `😕` `😐` 等）读取时由 `normalizeMood` 兼容。

## 交互与校验

1. 今日卡片固定操作本地今天：天气（晴/多云/阴/小雨/雨/雪）、温度、湿度、睡觉/起床时间、运动类型与分钟、情绪四选一与一句话情绪记录；输入变更即保存。
2. 睡眠时长跨午夜计算，展示 `XhYYm`；天气、睡觉时间段与情绪三项都填写时顶部状态为“已记录”，否则“待补充”。
3. 经期面板：标记今天为经期、单选经血量（点滴/少/中/多）、多选症状；取消标记时清空经血量与症状。
4. 身体事件：皮肤/肠胃/牙齿各有一套预置标签，选标签后可填可选备注再保存；未选标签时提示不写入。
5. 健康月历以周一起始渲染 42 格，非当月日期置灰、今天高亮、有事件的日期按类型着色、经期日显示连续条带；点击日期在右侧详情面板编辑。
6. 详情面板可改环境与作息、情绪、经期（标记/取消、经血量、症状）与身体事件（增、改、删），修改即自动保存。
7. 生产环境 `health.records` 初始为空对象，不渲染演示数据。

## 副作用

- `Health`：读取并通过 `setRecords` 替换 `health.records`，由 `useDomainResource` 经 typed IPC 持久化到 SQLite；同时维护选中日期、月历游标、经期/事件面板开关等瞬时状态。
- 纯函数 `healthDateKey`、`sleepDuration`、`normalizeMood`、`moodLabel`、`isHealthRecorded`、`periodBarClass`、`monthGridDays` 等不访问存储、网络或剪贴板。
- 本模块不发起网络请求、不创建系统通知、不修改其他领域资源。

## 验收

- 健康入口出现在导航中，今日卡片、健康月历与详情面板结构符合冻结原型。
- 今日记录、经期、身体事件与详情编辑均写入 `health.records` 并重启恢复。
- 自动测试覆盖纯函数边界（跨午夜时长、情绪兼容、月历 42 格、经期条带）与组件交互（今日渲染、经期切换、事件预置保存、详情编辑）。
- CSS 通过发布审计的 CSS 预算（必要时通过清理未迁移模块死 CSS 释放空间）。
