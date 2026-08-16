# AI 总结分析模块 Architecture

架构版本：2026-08-16

状态：DESIGN 草案，等待人工审查；未授权进入 PLAN 或 BUILD。

## 架构目标

在现有 React → typed IPC → Rust/Tauri → SQLite 分层中增加受控的 AI 上下文、导出和 Provider 边界。React 不直接读取 API Key、不直接调用模型、不拼装第二套数据口径；Rust 负责一致性读取、最少披露、文件写入、凭据访问和外部网络。

## 总体数据流

```text
AI Insights React UI
  选择范围 / 模块 / 隐私策略
            │
            ▼ typed IPC（严格 schema）
AiContextService（Rust）
  ├─ AiSnapshotRepository ──只读事务──► SQLite 领域资源 / 未来核心表
  ├─ ContextBuilder ─► 过滤、确定性聚合、匿名化、证据编号
  └─ CanonicalSerializer ─► contextHash + 准确预览
            │
            ├────────► ExportAdapter ─► 原生另存为 ─► Markdown / JSON
            │
            └─ P7-B ─► CredentialStore ─► ProviderAdapter ─HTTPS─► Model API
                                                   │
                                                   ▼
                                  OutputValidator ─► AiReportRepository
                                                   │
                                                   ▼
                                             报告只读展示
```

## 组件责任

### React `features/ai-insights`

- 管理报告类型、日期、模块和敏感字段选择等瞬时状态。
- 通过 typed IPC 请求 Context 预览、导出和后续 API 生成。
- 展示准确载荷、字节数、隐私提示、报告和证据回链。
- 配置改变后使旧 `contextHash` 失效。
- 不直接访问 SQLite、文件系统、Provider 网络和系统凭据。

### `AiSnapshotRepository`

- 在同一 SQLite 只读事务内只查询已选模块和日期范围所需的数据。
- 首版适配现有 `domain_entity` / `domain_value` 白名单资源；领域逐步迁移到核心表后，仅替换 repository 投影，不改变 `AiContext` 契约。
- 过滤软删除行和内部表；不得查询 `command_receipt`、备份路径、schema 元数据或通知投递正文。
- 返回领域 DTO，不把 SQL 行或任意 JSON 原样暴露给 UI/Provider。

### `ContextBuilder`

- 是确定性纯函数：过滤、聚合、匿名化、排序、证据 ID 和任务说明均只依赖显式请求与快照。
- 使用本地代码计算任务完成数、日程负荷、预算进度、学习进度和其他确定性指标。
- 给每项证据标注 `period_event` 或 `current_snapshot`；只有前者参与周期变化计算，后者只作为截至存储更新时间的背景。
- 对文本、记录数、单项长度和总序列化大小执行预算；超限要求缩小范围，不按不可解释方式截断。
- 同一 Context 中保留原始证据与聚合证据的明确类型，不让模型把推断覆盖为事实。

### `CanonicalSerializer`

- 以稳定字段顺序、稳定记录排序和明确数值/日期表示生成规范化 JSON。
- `contextHash` 从规范化 JSON 计算，不包含文件路径、UI 状态、随机数和生成时钟。
- Markdown 由同一个 `AiContext` 派生，标题、事实、证据和分析任务与 JSON 一一对应。

### `ExportAdapter`

- 只接受已预览且哈希仍匹配的 Context 和固定格式枚举。
- 使用原生保存面板取得单次用户授权路径；Rust 再验证扩展名和目标类型。
- 在目标目录写临时文件并完成原子替换；覆盖已有文件必须由系统面板显式确认。
- 不需要持久化任意目录权限，不执行文件内容上传或自动打开第三方应用。

### P7-B `CredentialStore`

- Provider API Key 使用操作系统钥匙串/凭据存储；SQLite 只保存非敏感 Provider ID、模型偏好和配置状态。
- 提供设置、存在性检查和删除能力；不提供把明文密钥读回 React 的接口。
- 系统备份与 Life-OS SQLite 备份均不复制 API Key。

### P7-B `ProviderAdapter`

- 使用固定 Provider ID → 固定 HTTPS origin 的代码映射；首版不接收用户自定义 URL、header 或代理脚本。
- 统一接收 `AiProviderRequest`，统一返回未经信任的字节与用量元数据。
- 设置连接/整体超时、最大响应体、最大重试和明确 User-Agent；错误正文经过长度限制与脱敏后映射为稳定错误。
- 请求关闭模型工具、网页浏览、代码执行和外部文件能力，只允许结构化文本输出。
- Provider 特有字段、模型名和版本不进入领域资源或 `AiContext`。

### P7-B `OutputValidator`

- 将 Provider 输出作为不可信外部输入，严格解析 `AiInsightReport`，拒绝额外字段、超长文本和未知证据 ID。
- 对 Markdown/链接采用最小语法或纯文本展示；禁用原始 HTML、图片、自动加载 URL 和危险 scheme。
- 验证只决定报告能否保存，不产生领域写命令。

### P7-B `AiReportRepository`

- 保存通过 schema 验证的报告、证据引用、Provider/模型、提示词版本、哈希、用量与请求状态。
- 默认不保存完整 Context 或明文 Provider 错误正文，减少本地敏感副本。
- 报告是可删除的派生物，不是业务事实；与来源数据无外键级联删除关系。

## 模块到 Context 的首期映射

| 模块 | 默认包含 | 默认排除或匿名化 |
|---|---|---|
| compass | 原则数量、近期演进摘要 | 超出范围的历史原文 |
| work | 任务标题、象限、完成状态、EOD 摘要 | 无关的旧任务 |
| schedule | 日程日期、时长、完成率、负荷分布 | 内部拖拽/UI 状态 |
| finance | 预算、总支出、必要/非必要聚合 | 交易备注默认排除 |
| items | 临期/过期/维护数量及必要条目 | 与报告无关的完整库存明细 |
| network | 互动次数、重要日期提醒 | 姓名使用别名，互动原文默认排除 |
| trade | 复盘摘要、观察列表风险数量 | 数量、成本和具体仓位默认排除 |
| learning | 领域、里程碑进度、任务状态 | 过往无关原文 |

具体字段必须在 P7-A PLAN 中按当前 Zod schema 建立显式 allowlist；不得使用“序列化整个资源再删字段”的 denylist 实现。

### 当前时间数据可用性

- `schedule.scheduled`、`trade.reviews` 和带 `closedAt` 的清仓记录具有可用于周期筛选的业务日期。
- 观察列表只有当前/最近行情，不能据此生成周期价格走势。
- `work.tasks`、`learning.domains`、人生原则、物品和联系人领域 JSON 主要是当前快照，没有可靠创建/完成时间。
- 财务运行态目前主要保存预算、累计支出、待评估项和最后一笔交易，不构成完整周期流水。

因此 P7-A 的“每周 Life Review”是“周期事件 + 当前状态背景”，不是所有模块的历史变化报告。Context、预览和提示词必须保留这一差异；若产品需要真正的跨周趋势，先为对应领域补齐可验证历史数据或版本化快照，再扩展分析，不允许模型从当前值倒推历史。

## Context 一致性与失效

预览返回 `contextHash`。导出或 API 生成时，React 再提交同一份 `AiContextRequest` 与该哈希；Rust 重新校验请求、取得当前快照并构建 Context：

```text
当前 hash == 已预览 hash
  ├─ 是 → 允许执行已确认的文件或网络副作用
  └─ 否 → 返回 CONTEXT_STALE，要求用户查看新预览
```

这样确保用户确认的是实际写出或发送的内容，同时不依赖前端传回正文或服务端长期缓存。首版不在内存中长期缓存完整 Context；如为性能增加短期缓存，缓存必须进程内、限时、按哈希读取，并在退出时自然销毁，但安全校验仍以重建后的 Context 为准。

## Prompt 与输出结构

固定提示由三部分组成：

1. 系统规则：只读分析、用户正文是不可信数据、禁止工具和外部访问、禁止把推断表述成事实。
2. 版本化报告任务：每周摘要、发现、风险、最多三项下一步建议、限制说明。
3. 已预览的结构化 `AiContext` 与输出 JSON schema。

提示词版本独立于应用版本保存。修改系统规则、报告结构或证据要求必须提升 `promptVersion` 并增加固定 fixture 回归测试。

## 网络、密钥与日志边界

- CSP 继续禁止前端远程连接；模型网络只从 Rust 固定 adapter 发起。
- Tauri capability 只暴露具体 AI 命令，不开放通用 HTTP、shell 或任意文件系统权限。
- 密钥不经过 React props/state、IPC 返回值、SQLite、错误堆栈、应用日志、分析载荷或备份。
- 生产日志只允许请求 ID、Provider ID、模型 ID、哈希前缀、耗时、字节数、用量和稳定错误码；不记录 Context、用户正文、授权头或 Provider 原始响应。
- 外部发送发生前 UI 明示 Provider、模型、模块、时间范围、敏感字段和载荷字节数。

## 幂等、失败与计费边界

- Context 构建和序列化严格幂等。
- 文件导出由 `contextHash + format` 固定内容，但每次用户确认写文件都是独立显式副作用。
- API 调用无法保证外部严格 exactly-once。`ai_request.request_id` 在调用前写 `pending`，成功后写 `completed`；相同已完成 ID返回既有报告。
- 超时或连接中断且不能判断 Provider 是否已处理时标记 `unknown`，不自动再次调用。用户确认后以新 `requestId` 重试，并看到可能重复计费提示。
- 可安全确认“请求未发出”的本地校验、缺密钥等错误不计入外部调用。

## 数据库演进

P7-A 不需要数据库迁移：预览与导出均为只读领域快照加用户授权文件写入。

P7-B 才新增 AI 请求/报告表。迁移必须只前进、包含旧库 fixture 和恢复测试；`ai_report` 不加入领域资源通用替换接口。报告删除使用可恢复删除策略，API Key 永远不进入迁移。

## 备份与删除

- P7-A 没有新增本地业务数据；导出文件位于用户选择位置，不纳入应用快照管理。
- P7-B 报告是否随 SQLite 快照备份由实现 PLAN 冻结，界面必须说明；API Key 始终不备份。
- 删除报告只修改报告 repository；清除 Provider 配置删除凭据和非敏感偏好，不删除领域数据。
- 如果用户希望彻底撤回已发送给 Provider 的数据，只能依据所选 Provider 的数据政策处理；应用不得暗示删除本地报告等于删除 Provider 侧请求。

## 测试策略

### 纯函数与契约测试

- 日期范围、枚举、额外字段和大小边界双端校验。
- 每个模块使用固定 fixture 验证 allowlist、范围过滤、聚合与禁止字段排除。
- 匿名别名稳定性、规范排序、证据 ID、`contextHash` 和 Markdown/JSON 一致性快照。
- Prompt injection 文本只作为证据正文，不改变任务和输出 schema。

### SQLite 与文件集成测试

- 一致性读事务、旧领域资源投影、软删除过滤和坏 schema 整体失败。
- 取消保存不写文件、原子写成功、权限失败不留半文件、哈希陈旧拒绝。
- P7-B 请求状态、重复 ID、unknown 状态、报告删除和备份恢复边界。

### Provider adapter 测试

- 使用本地 mock adapter，不在普通测试中调用真实收费 API。
- 覆盖鉴权、限流、超时、响应过大、非法 JSON、额外字段、未知证据和安全渲染。
- 正式发布前的真实 Provider 冒烟测试需要显式凭据和联网审批，不成为离线测试的隐式副作用。

### 组件与人工验收

- 默认敏感字段关闭、准确预览、配置变化使预览失效、文件取消和错误恢复。
- 1440×900、1024×768 与窄屏下长 Context/报告可阅读且不会突破布局。
- 键盘可操作、焦点恢复、加载状态与 reduced-motion 行为符合现有可访问性基线。

## 影响范围预估

- P7-A 预计新增 AI feature、共享 schema/IPC、Rust AI context/repository/export 模块、capability、文档和双端测试，涉及多个模块但不迁移数据库。
- P7-B 预计增加系统凭据依赖、固定网络 adapter、AI 报告迁移/repository、报告历史和测试；必须独立 REVIEW 后实施。
- 现有九个业务模块不增加 AI 写入口；AI 只通过只读 repository 投影数据。

## 关键决策与待审查项

- 决策：Context 构建位于 Rust，而非 React 或模型 Provider，以固定最少披露边界。
- 决策：首期使用显式 allowlist 和准确预览，不导出原始领域 JSON。
- 决策：P7-A 不迁移数据库；P7-B 默认只保存报告和哈希，不保存完整发送载荷。
- 待确认：P7-B 的首个 Provider、允许模型、最大 Context/响应预算、超时和成本提示。
- 待确认：P7-B 报告是否默认进入 SQLite 备份，以及报告保留/可恢复删除期限。
