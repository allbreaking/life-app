# P6 桌面能力与发布规格

## 范围与顺序

P6 分批交付，先完成不依赖平台权限的可访问性基线，再接入菜单栏、系统级快捷键、通知、备份恢复、签名与发布。平台能力在引入前必须分别补充权限、失败反馈和可替换 adapter 契约。

## P6-A 可访问性基线

- 页面提供键盘可见的“跳到主内容”入口。
- 所有可交互元素在键盘聚焦时显示清晰轮廓。
- 快捷录入弹窗打开时把焦点移入弹窗，`Tab`/`Shift+Tab` 不得离开弹窗；关闭后恢复到打开弹窗前的元素。
- `Escape` 关闭快捷录入；背景点击关闭规则保持不变。
- 导航保留 `aria-current="page"`，弹窗保留名称与模态语义。
- `prefers-reduced-motion: reduce` 下禁用动画和过渡。

## 副作用

- `App` 的快捷键 effect：订阅/取消订阅窗口键盘事件；只更新瞬时弹窗状态。
- `QuickCapture` 的焦点 effect：读取当前活动元素，移动并恢复 DOM 焦点；不写 SQLite、localStorage 或文件系统，不发网络请求。
- 跳转主内容与焦点样式：仅改变浏览器焦点和视觉呈现，无持久化副作用。

## 验收

1. 键盘可从跳转入口直接到达主内容。
2. 从任意打开按钮进入快捷录入后，焦点位于关闭按钮；正向和反向 Tab 均被约束在弹窗内。
3. 通过关闭按钮或 Escape 关闭后，焦点回到原打开按钮。
4. 自动化组件测试覆盖打开、焦点约束和恢复；完整检查保持通过。

## 后续 P6-B（实现前继续细化规格）

- 原生菜单栏第一批提供“打开快捷录入”“回到今日总览”和平台原生“退出”。前两项统一发送 `desktop-action` 事件，payload 只允许 `open-quick-capture` 或 `show-dashboard`；窗口被隐藏或失焦时，执行动作前先显示并聚焦主窗口。
- 菜单事件只改变窗口可见性、焦点和前端瞬时导航/弹窗状态；不写 SQLite、localStorage 或文件系统，不发网络请求。“回到今日总览”沿用既有导航持久化，因此前端导航 hook 会写入 active-module localStorage。
- 浏览器预览环境不注册 Tauri 事件监听，保留应用内按钮和 `Option+Space` 行为。
- 系统级快捷键在后续切片实现；注册失败必须可恢复且不得阻止应用启动。
- 通知投递 adapter 与去重收据。
- SQLite 一致性备份、校验后恢复及失败回滚。
- 性能预算、产物签名和发布验收。

### P6-B1 原生菜单验收

1. Rust 菜单 ID 到领域动作的映射由单元测试覆盖，未知 ID 不产生动作。
2. 原生“打开快捷录入”事件打开既有模态框；“回到今日总览”关闭模态框并切换总览。
3. React effect 卸载时取消 Tauri 事件监听；非 Tauri 环境不产生监听副作用。

## P6-B2 系统级快捷键

- 桌面壳启动时尝试注册 `Alt+Space`（macOS 显示为 `⌥ Space`），只在按下阶段触发，动作复用 P6-B1 的 `open-quick-capture` 白名单事件。
- 触发后先显示并聚焦主窗口，再向前端发送 `desktop-action`；不直接写业务数据，也不新增第二套快捷录入逻辑。
- 注册失败（包括快捷键被系统或其他应用占用）只记录诊断信息，不阻止应用、数据库或原生菜单启动；应用内 `Option+Space` 与按钮继续可用。
- 快捷键由进程生命周期持有，应用退出时由插件释放；不写 SQLite、localStorage 或文件系统，不发网络请求。
- 浏览器预览不加载插件、不申请全局快捷键权限。

### P6-B2 验收

1. 只有 `Alt+Space` 的 Pressed 事件映射为 `open-quick-capture`，Released 或其他组合不产生动作。
2. 快捷键动作沿用窗口显示、聚焦和 `desktop-action` 事件路径。
3. 注册失败为可恢复降级，Rust 启动流程仍返回成功。

## P6-B3 系统通知与去重收据

- 第一批系统通知只接受白名单类型：`food-expiry`、`budget-limit`、`subscription-due`、`watch-target`、`watch-safety`、`important-date`、`next-event`。
- 前端提交 `entityId`、`alertType`、`occurrenceAt`、`title`、`body`；TypeScript 与 Rust 双端校验。标识符最长 100 字符，标题最长 100 字符，正文最长 500 字符，拒绝空文本、控制字符和非法时间格式。
- `NotificationService` 先以 `(entity_id, alert_type, occurrence_at)` 查询/创建 `notification_delivery`；已存在 `delivered_at` 的通知直接返回 `duplicate`，不会再次调用系统 adapter。
- 首次或上次失败的通知调用可替换 `NotificationAdapter`。成功后写入 `delivered_at`；权限拒绝或平台投递失败返回 `EXTERNAL_SERVICE_ERROR`，保留未完成收据以允许重试，不阻止应用启动或其他业务写入。
- 系统通知是显式外部副作用；服务还会读写 SQLite 投递收据。它不修改领域实体、不发网络请求、不执行 shell、不读取任意文件。
- 通知插件仅由 Rust 侧使用，前端 capability 不开放通用通知命令；浏览器预览不加载插件且不得产生系统通知。
- 进程在系统已展示通知、但尚未写回 `delivered_at` 的极小崩溃窗口内采用“允许重试”语义；该边界可能产生一次重复展示，优先避免永久漏报。

### P6-B3 验收

1. 非白名单类型、非法标识符、非法时间及超长/控制字符文本均在调用 adapter 前被拒绝。
2. 同一唯一键成功投递后再次调用返回 `duplicate`，adapter 只执行一次。
3. adapter 失败返回稳定外部服务错误；同一唯一键可以重试并在成功后写入 `delivered_at`。
4. SQLite 约束与服务测试覆盖去重、失败重试和不同 occurrence 可分别投递。

## P6-B4 SQLite 本地备份与恢复

- 第一批备份采用应用管理的本地快照，不接受前端传入文件路径。快照只写入应用数据目录下的 `backups/`，文件名由 Rust 生成，格式为 `life-os-<UTC timestamp>.sqlite3`。
- `BackupService` 与领域资源、通知服务共享同一个互斥 SQLite 连接。创建快照、恢复与业务读写串行执行，使用 SQLite online backup API 生成一致性数据库副本，不直接复制可能处于 WAL 状态的主文件。
- 列表接口只返回快照 ID、创建时间和字节数；快照 ID 必须匹配服务生成的白名单格式，禁止 `..`、路径分隔符、绝对路径与符号链接逃逸。
- 恢复前以只读方式打开候选快照，要求 `PRAGMA integrity_check` 为 `ok`、`PRAGMA foreign_key_check` 无结果、`schema_migration` 的最大版本等于当前正式 schema，且文件大小不超过 512 MiB。
- 恢复属于破坏性动作。前端必须展示二次确认；Rust 在覆盖当前连接前创建内部回滚快照。若恢复写入或恢复后复检失败，立即用回滚快照恢复原数据库，并返回稳定错误。
- 成功恢复后前端重新加载页面，使所有模块从 SQLite 重新读取；浏览器预览不调用 IPC，并显示桌面版能力提示。
- 本切片不提供任意目录导出/导入、不新增通用文件系统 capability、不读取应用备份目录之外的文件、不发网络请求、不执行 shell。

### 副作用

- `create_backup`：读取当前 SQLite，通过 online backup API 在应用备份目录创建一个新数据库文件；失败时清理未完成的临时文件。
- `list_backups`：读取应用备份目录元数据并对候选数据库做基本名称过滤；不修改数据库或文件。
- `restore_backup`：读取指定的应用内快照，创建临时回滚快照，覆盖当前 SQLite 并复检；成功后删除回滚临时文件，失败时尝试回滚。它不修改备份源文件。
- `DataProtection` UI：调用上述 typed IPC、显示状态；成功恢复后调用 `window.location.reload()`。确认取消没有持久化副作用。

### P6-B4 验收

1. 活跃数据库在 WAL/持续连接场景下创建的快照可通过完整性、外键与 schema 校验，并包含创建前已提交的数据。
2. 非法快照 ID、超大文件、损坏数据库、外键损坏和 schema 版本不匹配均在覆盖当前数据库前被拒绝。
3. 成功恢复后当前连接读到快照数据；模拟恢复失败时原数据库保持可读且数据不变。
4. 前端 typed IPC 校验列表响应；恢复必须二次确认，成功后触发页面重载；非 Tauri 环境不产生文件副作用。

## P6-C1 性能预算与可重复发布门禁

- Web 生产产物必须先由 `npm run build` 全量重建，再执行发布审计；审计不得依赖旧 `dist/` 或开发服务器。
- 首屏静态资源预算：入口 JavaScript 单文件不超过 350 KiB、CSS 单文件不超过 25 KiB、`dist/` 中 HTML/CSS/JavaScript 的 gzip 总量不超过 110 KiB。图片与桌面图标不计入首屏脚本预算。
- npm、Cargo 与 Tauri 配置中的应用版本必须完全一致；产品名、bundle identifier 必须为非空稳定值，identifier 固定为 `app.life-os.desktop`。
- Tauri CSP 禁止 `unsafe-inline`、`unsafe-eval`、通配远程源以及 `http:`/`https:` 网络源；Tauri 内部 `http://ipc.localhost` 是唯一例外。capability 继续只允许主窗口的 `core:default`，不得静默开放 shell、通用文件系统、网络或任意窗口权限。
- bundle 必须显式引用仓库内存在的 `.icns`、`.ico` 与 PNG 图标。生成配置与正式源文件参与审计，`target/`、`dist/` 等派生产物不作为配置来源。
- `npm run release:verify` 顺序执行生产构建、规格/单元/数据库测试和发布审计。审计失败必须以非零状态退出并指出具体预算或配置项。
- `npm run desktop:bundle` 生成当前平台的未签名本机安装产物，用于安装冒烟验证；不上传、不发布、不修改证书或钥匙串。

### 签名与外部副作用边界

- macOS 正式发布必须由受控 CI 或开发者机器提供 Apple Developer ID、签名密码及 notarization 凭据；凭据只通过密钥管理/环境注入，禁止写入仓库、日志、配置样例或测试快照。
- 签名、公证和上传会访问外部 Apple 服务并产生外部发布状态，必须由用户显式授权后执行。本切片只验证“签名前产物可重复生成”和“未配置凭据时不得声称已签名”。
- 构建会写入 `dist/`、`src-tauri/target/` 与平台 bundle 目录；发布审计只读取这些产物和源配置，不发网络请求、不写业务 SQLite。

### P6-C1 验收

1. 篡改任一版本、CSP、capability、bundle identifier、图标路径或产物预算时，发布审计稳定失败。
2. 当前生产产物满足 JavaScript、CSS 和总 gzip 预算，审计输出实际数值。
3. 完整开发门禁与发布审计可由一个命令重复执行；本机 Tauri bundle 可在无签名凭据时构建，但被明确标记为非正式发布产物。
4. 正式签名、公证、三档视觉回归和安装后平台权限冒烟在真实发布环境完成前保持未勾选。
