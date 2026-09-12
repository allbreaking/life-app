# 投资观察列表标签 Architecture

## 最后更新：2026-08-23

## 数据流

```text
标签文本
  → parseWatchTags 纯校验/规范化
  → Watch.tags
  → trade.watchlist 领域资源幂等替换
  → SQLite

trade.watchlist
  → Zod 边界校验
  → normalizeWatch（旧数据补 tags: []）
  → 状态筛选 AND 标签筛选
  → paginateWatchlist
  → 观察列表视图
```

## 数据模型

```ts
type Watch = {
  // 既有字段略
  tags: string[]; // 0–10 个；每项 1–20 字
};
```

- 标签内嵌在观察实体中，与价格字段一次替换，避免独立标签资源与观察列表不同步。
- 旧 JSON 缺少 `tags` 时运行态补空数组；不新增 SQLite schema 或 IPC resource key。
- 标签筛选值是瞬时字符串，只能来自当前观察列表汇总出的标签集合。

## 组件责任

- `normalizeWatch`：兼容旧目标价与旧标签结构，返回新对象。
- `parseWatchTags`：解析、trim、去空、去重并限制数量/长度。
- `filterWatchlist`：按价格状态和标签取交集，保持稳定顺序。
- `Trade`：管理完整观察列表、筛选/分页瞬时状态及新增持久化边界。
- `WatchRow`：管理标签编辑草稿并把保存请求委托给 `Trade`。

## 副作用、幂等与安全

- 所有标签纯函数无副作用且相同输入得到相同输出。
- 标签保存复用 `trade.watchlist` 的 request ID、command receipt 和 SQLite 事务；不新增网络或平台权限。
- 筛选与分页不持久化，不改变行情轮询的完整代码集合，也不改变持仓外键语义。
- 标签按 React 文本节点输出；长度和数量在网络/持久化前校验，不拼接 SQL、命令或 HTML。

## 验证结论

- 规格一致性：新增/编辑、展示、旧数据兼容及状态与标签组合筛选均已覆盖。
- 副作用一致性：标签保存只复用既有单资源替换；筛选、分页和兼容规范化不持久化。
- 自动校验：TypeScript、53 项前端测试、静态规格、生产构建和发布预算审计通过（CSS 25,594 B）。
- 交互验证：桌面与 600px 窄屏下完成组合筛选和标签原行编辑；控制台无错误。
