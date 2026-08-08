# 开发进度

## 当前阶段

DEV

## 当前节点

SCHEDULE SINGLE SOURCE / COMPLETE

## 计划

- [x] ROADMAP：确认 MVP 与后续桌面边界
- [x] DESIGN：定义状态、数据流与安全边界
- [x] PLAN：建立验收标准
- [x] BUILD：实现可运行应用
- [x] VERIFY：规格对照、自动检查与交互验证（静态规格与 JS 语法通过；当前环境未提供浏览器控制接口）
- [x] PROTOTYPE FREEZE：冻结原型交互基线
- [x] DEVELOPMENT DOCS：补齐正式开发规格、架构、数据模型、服务、安全、测试和实施计划
- [x] HUMAN REVIEW：用户确认根据仓库文档正式开发（2026-08-01）
- [x] SCAFFOLD：创建 Tauri + React + TypeScript + SQLite 工程骨架
- [x] VISUAL BASELINE：迁移冻结原型的壳层、设计 token 与今日总览
- [x] MODULE MIGRATION：九模块冻结原型首轮 React 迁移（9/9）
- [x] DOMAIN SERVICES BRIDGE：九模块运行态接入 Zod typed IPC、Rust 服务、SQLite repository 与幂等收据
- [x] DOMAIN SERVICES：按 P1–P5 将模块状态键迁移到白名单领域资源命令与按实体规范化存储
- [x] P6-A SPEC：定义键盘跳转、可见焦点、模态焦点约束与恢复
- [x] P6-A BUILD：实现首批无平台权限依赖的可访问性基线
- [x] P6-B1 SPEC：定义原生菜单动作、事件白名单、副作用与降级边界
- [x] P6-B1 BUILD：实现原生菜单打开快捷录入、返回总览与退出
- [x] P6-B1 VERIFY：类型、组件、静态规格与 Rust 自动校验通过
- [x] P6-B2 SPEC：定义系统级快捷键、注册失败降级与副作用边界
- [x] P6-B2 BUILD：注册系统级 Alt+Space 并复用快捷录入事件
- [x] P6-B2 VERIFY：依赖锁定、类型检查、组件测试、静态规格与 Rust 测试通过
- [x] P6-B3 SPEC：定义通知白名单、双端校验、去重收据、失败重试与副作用
- [x] P6-B3 BUILD：实现 Rust 通知 adapter、typed IPC 与 SQLite 去重服务
- [x] P6-B3 VERIFY：通知依赖锁定，前端 25 项与 Rust 11 项测试、类型及静态规格校验通过
- [x] P6-B4 SPEC：定义应用内一致性快照、路径边界、恢复校验、回滚与副作用
- [x] P6-B4 PLAN：共享连接、Rust 服务、typed IPC、确认 UI 与自动校验顺序
- [x] P6-B4 BUILD：实现共享连接、SQLite online backup、应用内快照列表、校验恢复、回滚点、typed IPC 与数据保护界面
- [x] P6-B4 VERIFY：前端 28 项与 Rust 13 项测试、类型、静态规格及生产构建通过（真实浏览器截图接口当前不可用）
- [x] P6-C1 SPEC：定义生产资源预算、版本/CSP/capability/icon 审计、签名边界与副作用
- [x] P6-C1 PLAN：发布审计脚本、统一验证命令、本机 bundle 与真实发布环境门禁
- [x] P6-C1 BUILD：实现无网络发布审计、统一验证/桌面 bundle 命令与跨平台图标配置
- [x] P6-C1 VERIFY：完整门禁、生产预算、macOS Apple Silicon DMG 构建、完整性与 SHA-256 校验通过
- [x] ALERT MOTION SPEC：定义跨模块告警呼吸动画与 reduced-motion 降级
- [x] ALERT MOTION BUILD：恢复总览、财务、物品与投资告警的原型动画语义
- [x] ALERT MOTION VERIFY：类型、29 项组件/单元测试、静态规格与生产构建通过（真实浏览器动画帧检查接口当前不可用）
- [x] MACOS MENU BAR TODO SPEC：定义移除应用内伪系统栏、保留快捷键入口及 macOS 状态项副作用边界
- [x] MACOS MENU BAR TODO PLAN：调整 React 壳层、Tauri 状态项与双端自动测试
- [x] MACOS MENU BAR TODO BUILD：移除窗口内时间/快捷录入/待办，创建 macOS 菜单栏待办状态项
- [x] MACOS MENU BAR TODO VERIFY：类型、30 项前端测试、14 项 Rust 测试、静态规格与生产构建通过
- [x] MACOS MENU BAR TODO ACTION SPEC：短标题、完整菜单内容、白名单完成动作与持久化副作用边界
- [x] MACOS MENU BAR TODO ACTION PLAN：扩展桌面动作、提升总览完成状态并覆盖双端测试
- [x] MACOS MENU BAR TODO ACTION BUILD：菜单栏完整待办菜单与标记完成功能
- [x] MACOS MENU BAR TODO ACTION VERIFY：类型、31 项前端测试、14 项 Rust 测试、静态规格与生产构建通过
- [x] MACOS MENU BAR TODO ADVANCE SPEC：固定待办顺序、白名单索引动作与结束状态
- [x] MACOS MENU BAR TODO ADVANCE PLAN：扩展桌面事件、菜单推进逻辑和双端测试
- [x] MACOS MENU BAR TODO ADVANCE BUILD：完成后自动切换下一待办
- [x] MACOS MENU BAR TODO ADVANCE VERIFY：类型、31 项前端测试、14 项 Rust 测试、静态规格与生产构建通过
- [x] SCHEDULE SINGLE SOURCE DESIGN：日程任务作为总览与菜单栏唯一数据源，按稳定 ID 完成
- [x] SCHEDULE SINGLE SOURCE PLAN：共享 schema、壳层状态、typed IPC、菜单事件与测试闭环
- [x] SCHEDULE SINGLE SOURCE BUILD：移除硬编码待办和索引映射
- [x] SCHEDULE SINGLE SOURCE VERIFY：类型、31 项前端测试、14 项 Rust 测试、静态规格与生产构建通过
- [ ] P6-C2 RELEASE ENV：Developer ID 签名、公证、安装后权限冒烟、依赖漏洞审计与发布审批（需要真实凭据/联网环境）

## 当前校验

- [x] 原型静态规格校验
- [x] SQLite 首版迁移可执行，food 到期日约束生效
- [x] 前端类型检查、组件测试与生产构建
- [x] Rust 单元/SQLite 集成测试（离线依赖集）
- [x] 九模块业务运行态重启恢复、typed IPC 双端校验、SQLite 事务与幂等重试
- [x] P1–P5 十九项领域资源按实体/标量规范化、旧状态一次性前进导入与幂等领域命令
- [x] 人生地图 Being/Doing、演进日志视觉结构与原则草稿校验
- [x] 工作四象限、Q1 两项上限、Top 3 选择与 EOD 草稿校验
- [x] 日程日/周/月视图、来源任务池、排期/退回与 15 分钟吸附
- [x] 生活模板重复规则投影与日历只读边界
- [x] 财务整数金额、必要/非必要分流、预算进度预警与月末评估
- [x] 物品位置约束、食物完整清单与 3/7 天到期预警边界
- [x] 社交人物名片、互动/重要日期结构与“不做关系评分”边界
- [x] 投资观察列表、逐股价格预警、持仓来源限制与每日复盘结构
- [x] 学习领域列表、整页工作区、里程碑派生进度与领域任务结构
- [x] 快捷录入焦点约束/恢复、主内容跳转与全局键盘焦点可见
- [x] P6-B1 原生菜单 ID 白名单、快捷录入/总览事件与非 Tauri 降级边界
- [x] P6-B2 系统级 Alt+Space 白名单、Pressed 边界与注册失败降级
- [x] P6-B3 通知白名单、成功去重、失败重试与不同 occurrence 边界
- [x] P6-B4 应用内快照 ID/目录边界、一致性备份、完整性/外键/schema 校验与恢复
- [x] P6-C1 JS/CSS/gzip 预算、版本/CSP/capability/identifier/icon 审计与未签名 DMG 构建
- [ ] 1440×900、1024×768、窄屏截图回归（当前会话未暴露浏览器控制接口）
- [ ] Developer ID 签名、公证、安装后平台权限冒烟与联网依赖漏洞审计（需真实发布环境）
