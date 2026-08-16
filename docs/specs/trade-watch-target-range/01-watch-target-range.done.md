# 01-watch-target-range 完成记录

## 完成时间：2026-08-09

## Commit：未提交（由用户统一提交）

## 实际完成内容

- 观察列表新增乐观、中枢、悲观三档目标价录入与展示。
- 原 `target` 字段保留为中枢目标价；旧记录确定性补齐两档新增价格。
- 统一有限性、目标价顺序和安全价关系校验。
- 目标告警和持仓目标距离文案明确为中枢目标价，计算口径不变。
- 更新功能规格、架构、测试计划、样式和自动回归测试。

## 与规格的偏差

- 未增加合法新增后的组件级行情/持久化测试；既有行情 IPC 与领域资源测试已覆盖成功请求和幂等写入，本次新增字段结构由类型、schema、纯函数与渲染测试覆盖。

## 对外暴露的接口/数据结构

- `Watch` 新增 `optimisticTarget: number`、`pessimisticTarget: number`；`target: number` 保留并定义为中枢目标价。
- `normalizeWatch(input)`：补齐旧观察记录目标价字段的纯函数。
- `isValidTargetRange(optimisticTarget, target, pessimisticTarget, safety)`：四价关系纯校验函数。
- 行情 IPC、`trade.watchlist` 资源键和持仓外键不变。

## 遗留问题

- 观察列表尚未提供既有标的的目标价原地编辑；不属于本次新增字段需求。
- 当前会话未提供真实浏览器控制接口，未执行多分辨率截图回归。
