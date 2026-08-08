# 安全与幂等

## 输入安全

- IPC 参数使用白名单 schema，拒绝额外字段。
- 文本限制长度，金额使用整数分或 Decimal，不使用浮点数结算。
- SQL 只允许参数绑定，禁止字符串拼接。
- 文件导入验证扩展名、MIME、大小和内容；路径由应用生成。
- Markdown 默认禁用原始 HTML，并过滤危险 URL scheme。
- 禁止把用户输入传给 shell；应用不提供任意命令执行能力。

## Tauri 权限

- capability 以窗口和命令最小授权。
- 默认禁用 shell、任意文件系统和远程导航。
- 行情网络域名使用 allowlist。
- 数据库和备份只访问应用数据目录或用户明确选择的文件。

## 幂等

- 所有创建/结算/联动命令携带 `requestId`。
- `command_receipt(request_id PRIMARY KEY, command, result_id, created_at)` 保存命令收据。
- EOD、投资日复盘以日期唯一并使用 upsert。
- 月末结算以 `(month, request_id)` 防止重复放行。
- 拖拽排期更新同一 task，不创建副本。
- 通知使用 `(entity_id, alert_type, occurrence_at)` 唯一键去重。

## 事务

必须原子执行：EOD 联动、月末结算、建仓及交易明细、学习任务与统一 task 映射、人物与重要日期批量保存。

## 恢复

- 启动时迁移失败则停止写入并提示恢复，不带病运行。
- 每次迁移前创建可校验备份。
- 备份导入先在临时数据库验证 schema 和外键，再替换正式数据库。
- 用户可恢复删除的记录保留 30 天；永久删除需二次确认。

