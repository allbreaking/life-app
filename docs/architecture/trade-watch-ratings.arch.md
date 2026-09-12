# 投资观察列表四维评分与默认排序 Architecture

最后更新：2026-08-30

## 数据模型

`trade.watchlist` 的单个实体保存四个可选整数和可选加入时间：

```text
businessModelRating?: 0..5
profitabilityRating?: 0..5
financialStabilityRating?: 0..5
cashFlowRating?: 0..5
createdAt?: ISO 8601 datetime
```

评分缺省代表未评分，数值 `0` 代表有效的零星评分。旧 `cashFlowDividendRating` 读取时映射为 `cashFlowRating`，旧 `valuationRating` 丢弃。字段随实体 JSON 保存到既有 `domain_entity`，无需 SQLite schema migration。

## 数据流

```text
trade.watchlist 完整列表
  → 代码/名称搜索
  → 价格状态 + 标签交集筛选
  → 默认 createdAt 倒序 / 指定评分维度稳定排序
  → 每页 10 条
  → 四维星级摘要
```

行情轮询、持仓候选、观察标的引用保护继续读取完整观察列表，不读取排序后的分页视图。

## 写入边界

- 新增：解析四项可选评分 → 价格/标签/评分统一校验 → 固定主机取价 → 写入当前 `createdAt` 并追加实体 → `trade.watchlist` 全量幂等替换。
- 编辑：解析行内草稿 → 统一校验 → 仅代码改变时取价 → 按稳定 ID 替换实体 → `trade.watchlist` 全量幂等替换。
- 排序：只生成新数组并更新组件瞬时条件，不触发资源写入。

## 兼容与安全

- Zod schema 允许四项评分与 `createdAt` 缺省，评分存在时要求整数 0–5；只额外接收两个明确的旧评分字段用于前向兼容，其他未知字段仍拒绝。
- `normalizeWatch` 不把缺省评分变成 0，保持业务语义可区分。
- 安全价仍是持久化必填价格，仅从观察列表列展示中移除；原告警、筛选和持仓公式不变。
- 所有表单输入均经数值白名单解析，不参与 HTML、SQL、命令、路径或远程主机拼接。
