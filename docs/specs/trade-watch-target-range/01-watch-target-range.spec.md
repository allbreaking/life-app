# 投资观察列表三档目标价函数级规格

规格版本：2026-08-09

## 入口自检

- 涉及文件数：预计 8 个。
- 涉及模块数：1 个业务模块（投资）；沿用现有共享持久化与行情接口。
- 预计工作量：少于 2 小时。
- 建议入口：已完成 DESIGN 并通过人工确认，本段继续 PLAN。

---
## 函数：normalizeWatch(input)
**所在文件**：`src/features/trade/tradeModel.ts`
**输入**：
  - `input`：包含合法 `target`，以及可选 `optimisticTarget`、`pessimisticTarget` 的观察标的值 - 从持久化资源或 fixture 读出的单条记录。
**输出**：`WatchTargetPrices` - 补齐三档目标价的观察标的值；缺失的乐观价或悲观价分别回退为 `target`。
**副作用（完整列表，没有写“无”）**：
  - 无。
**不应该做的事**：
  - 不得修改传入对象。
  - 不得写入 SQLite、localStorage 或领域资源。
  - 不得请求行情、执行 shell 或访问文件系统。
  - 不得根据现价或安全价猜测旧记录的目标价区间。
**异常处理**：
  - 输入的基础字段合法性由 Zod schema 负责；本函数只执行确定性字段补齐，不吞掉或改写 schema 错误。
**依赖的外部资源**：
  - 无。
**幂等性**：是 - 对相同输入总是返回相同结果，重复规范化不继续改变值。
---

---
## 函数：isValidTargetRange(optimisticTarget, target, pessimisticTarget, safety)
**所在文件**：`src/features/trade/tradeModel.ts`
**输入**：
  - `optimisticTarget`：`number` - 乐观目标价。
  - `target`：`number` - 中枢目标价。
  - `pessimisticTarget`：`number` - 悲观目标价。
  - `safety`：`number` - 安全价。
**输出**：`boolean` - 仅当所有值有限、三档目标价均为正数、`optimisticTarget >= target >= pessimisticTarget` 且 `0 <= safety < target` 时返回 `true`。
**副作用（完整列表，没有写“无”）**：
  - 无。
**不应该做的事**：
  - 不得自动排序或修正用户价格。
  - 不得强制安全价低于悲观目标价。
  - 不得产生 UI 消息、存储或网络副作用。
**异常处理**：
  - `NaN`、正负无穷、零或负目标价及不符合顺序的输入均返回 `false`，不抛异常。
**依赖的外部资源**：
  - 无。
**幂等性**：是 - 纯函数。
---

---
## 函数：Trade()
**所在文件**：`src/features/trade/Trade.tsx`
**输入**：
  - 无显式参数；读取 `trade.watchlist`、`trade.positions`、`trade.reviews`、`trade.sop` 领域资源和表单事件。
**输出**：`JSX.Element` - 投资模块界面。
**副作用（完整列表，没有写“无”）**：
  - 通过 `useDomainResource` 读取四个投资领域资源。
  - 新增观察标的校验通过后向既有固定新浪行情 adapter 请求该六位代码的最近行情。
  - 行情成功后向 `trade.watchlist` 追加包含 `target`、`optimisticTarget`、`pessimisticTarget` 的完整记录，并通过 typed IPC 幂等替换写入 SQLite。
  - 交易窗口轮询成功后替换观察列表的 `current` 与 `quoteAt`，保留三档目标价，并通过同一资源写入 SQLite。
  - 更新组件内加载状态和页面内反馈消息；提交成功后重置新增表单。
  - 其余既有持仓、SOP、复盘副作用保持不变。
**不应该做的事**：
  - 价格关系校验失败时不得请求新浪行情、创建记录或写入 SQLite。
  - 行情失败或陈旧时不得覆盖现价或三档目标价。
  - 不得更改 `trade.watchlist` 资源键、行情 IPC 合约或真实交易状态。
  - 不得把用户输入拼接进 SQL、shell 命令或任意 URL 主机。
  - 不得把乐观价或悲观价作为新增预警阈值。
**异常处理**：
  - 非六位代码、空名称、非有限价格或非法价格关系显示页面内中文错误并停止。
  - 重复代码显示既有重复提示并停止。
  - 行情无结果或请求异常显示可理解错误，保留已有数据，并在 `finally` 中恢复按钮加载状态。
  - 持久化异常继续由 `useDomainResource` 既有错误路径处理，不新增静默吞错。
**依赖的外部资源**：
  - `trade.watchlist`、`trade.positions`、`trade.reviews`、`trade.sop` 领域资源。
  - 固定主机新浪行情 adapter 与既有 typed IPC。
**幂等性**：部分是 - 资源替换和同一轮行情映射可安全重试；新增动作生成新 ID，但重复代码校验阻止同一代码被重复创建。
---

---
## 函数：PositionRow({ item, position, onSavePrice, onClose })
**所在文件**：`src/features/trade/Trade.tsx`
**输入**：
  - `item`：`Watch` - 已规范化观察标的，其中 `target` 为中枢目标价。
  - `position`：`Position` - 当前持仓。
  - `onSavePrice`：回调 - 保存建仓价。
  - `onClose`：回调 - 保存清仓。
**输出**：`JSX.Element` - 当前持仓行，其中“距中枢目标价”继续使用 `item.target` 派生。
**副作用（完整列表，没有写“无”）**：
  - 既有编辑/清仓交互只更新行内瞬时状态并委托父组件回调；本次仅改变列标题语义，不新增副作用。
**不应该做的事**：
  - 不得使用乐观目标价或悲观目标价替换中枢目标价计算。
  - 不得持久化派生百分比。
  - 不得发起行情或交易请求。
**异常处理**：
  - 继续沿用既有有限正数校验；非法建仓价或清仓价不调用父组件回调。
**依赖的外部资源**：
  - 无直接外部资源；持久化由父组件回调负责。
**幂等性**：是 - 相同属性渲染结果一致；瞬时交互不创建业务记录。
---

---
## 函数：WatchRow({ item })
**所在文件**：`src/features/trade/Trade.tsx`
**输入**：
  - `item`：`Watch` - 含乐观、中枢、悲观目标价、安全价、现价和可选行情时间的观察标的。
**输出**：`JSX.Element` - 依次展示标的、乐观目标价、中枢目标价、悲观目标价、安全价、现价和状态。
**副作用（完整列表，没有写“无”）**：
  - 无。
**不应该做的事**：
  - 不得修改观察标的或写入持久化资源。
  - 不得请求行情。
  - 不得改变告警阈值；告警仍以 `item.target` 和 `item.safety` 判断。
  - 不得把任何一档价格描述为投资建议。
**异常处理**：
  - 组件只接收已通过 schema 并规范化的数据；不在渲染阶段吞掉非法输入。
**依赖的外部资源**：
  - 无。
**幂等性**：是 - 纯展示函数。
---

## 本次改动影响范围

- 新增文件：`docs/specs/trade-watch-target-range/design.md`、`docs/specs/trade-watch-target-range/01-watch-target-range.spec.md`。
- 修改文件：`docs/development/01-functional-spec.md`、`docs/development/02-architecture.md`、`docs/development/06-test-plan.md`、`src/features/trade/Trade.tsx`、`src/features/trade/tradeModel.ts`、`src/features/trade/tradeModel.test.ts`、`src/shared/styles/global.css`、`src/app/App.test.tsx`、`progress.md`。
- 数据库变更：无；`trade.watchlist` 仍存为既有领域 JSON 资源。
- 接口变更（是否向后兼容）：观察标的运行态类型增加两个字段；持久化 schema 接受旧记录并规范化，向后兼容。行情 IPC、领域资源键和持仓外键不变。

## 验收测试要求

- 纯函数测试：缺少新增字段的旧记录被稳定补齐；完整记录不被改写；输入对象不被修改。
- 纯函数测试：合法顺序、相等边界及各种非法有限性/顺序输入。
- 组件测试：观察列表显示三档目标价且旧“目标价”文案改为“中枢目标价”。
- 组件测试：持仓列显示“距中枢目标价”，既有计算数值不变。
- 组件测试：非法三档顺序不调用行情 IPC且不新增记录；合法表单向持久化状态写入完整字段。
- 回归测试：目标/安全价告警、行情刷新字段保留、持仓建仓/清仓、旧数据加载继续通过。
