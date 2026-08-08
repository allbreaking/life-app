# Life-OS 发布候选清单

## 可重复命令

- `npm run release:verify`：重建 Web 产物，执行 TypeScript、组件、静态规格、Rust/SQLite 测试及发布配置/预算审计。
- `npm run desktop:bundle`：在通过完整门禁后构建当前 macOS 平台的 `.app` 与 `.dmg`。DMG 生成需要系统磁盘映像权限。
- `hdiutil verify <dmg>`：只读校验磁盘映像完整性。
- `shasum -a 256 <dmg>`：生成候选产物校验和。

## 2026-08-08 本机候选证据

- 前端自动测试：28 项通过；Rust/SQLite：13 项通过。
- 资源预算：JavaScript 318,630 B；CSS 20,110 B；HTML/CSS/JS gzip 总量 102,438 B。
- 配置审计：npm/Cargo/Tauri 版本一致；CSP、主窗口最小 capability、identifier 与跨平台图标通过。
- macOS Apple Silicon DMG：`src-tauri/target/release/bundle/dmg/Life-OS_0.1.0_aarch64.dmg`，3.8 MiB。
- `hdiutil verify`：有效。
- SHA-256：`9f7d66cd3fe57c6fe0c35c5e3e0f6194d90dcbb96669052dd7c0572186ae495a`。
- 此候选仅供本地安装冒烟，不是正式发布产物；未执行 Developer ID 签名、公证或上传。

## 正式发布前必须完成

- [ ] 在受控环境注入 Apple Developer ID 与 notarization 凭据，不写入仓库或日志。
- [ ] 对 `.app`/`.dmg` 完成签名、公证与 stapling，并使用 `codesign --verify --deep --strict`、`spctl --assess` 验证。
- [ ] 从 DMG 安装后验证首次启动、SQLite 初始化、菜单、`⌥ Space`、通知权限拒绝/允许和备份恢复。
- [ ] 完成 1440×900、1024×768、窄屏三档截图回归及键盘流程。
- [ ] 在联网的受控 CI 执行生产依赖漏洞审计，评估并关闭高危项。
- [ ] 固定候选版本与最终 SHA-256，保存构建日志和发布审批记录后再上传。

## 副作用

- 构建写入 `dist/` 和 `src-tauri/target/`；DMG 构建会临时挂载并卸载磁盘映像。
- 签名会修改 bundle 签名内容；公证与上传访问 Apple 服务并创建外部状态，必须获得显式发布授权。
- 完整性、签名和校验和检查为只读操作，不修改业务数据库。
