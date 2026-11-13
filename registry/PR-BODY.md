Add Caoliao QRCode OAuth connector and brand icon

草料二维码支持通过对话建码、管理表单记录和分析巡检数据。本次加入 OAuth 连接卡片和草料品牌图标，提供账号权限确认、设备建码方案、表单整理、巡检分析与扫码统计示例。

材料版本：2026.11.1。

## 来源与接入

- [草料官网](https://cli.im/)
- [厂商 MCP 接入文档](https://cli.im/open-api/agent/open-platform-mcp.html)
- [功能说明](https://cli.im/help/integration-and-connection/mcp-feature-intro)
- [额度与费用](https://cli.im/open-api/start/quota-and-pricing.html)
- 服务地址：`https://open.cli.im/mcp`
- OAuth issuer：`https://oauth.cli.im`；PKCE S256，公开客户端鉴权 none。
- 生产公开元数据提供动态客户端注册、授权、刷新与撤销端点。
- Logo 由草料项目方提供，随 PR 提交 `assets/caoliao-qrcode.png`，与配套插件使用同一原始 PNG。申请仓库托管，避免依赖本机路径或临时文件地址；品牌使用权和官网来源由维护者复核。

## 数据、权限与费用

连接时由用户登录草料并选择组织，仅访问已授权组织的数据。功能、额度与费用以草料套餐和实际权限为准。创建、编辑、上传和任务配置可能产生业务数据；示例先查询或准备方案，不默认执行写入或删除。

申请 scope：`mcp:tools records.read templates.read templates.write qrcodes.write assets.write`。
这些权限覆盖产品读写场景，用户需在授权页确认；并非所有示例都会使用写权限。

卡片仅配置 MCP，不自动安装 Skill。配套草料插件另外提供场景引导和连接页面；二者均使用服务名 `caoliao-qrcode`，用户选择一个连接入口，避免重复注册。此次不提交或发布配套插件。

## 提交文件

- `connectors/caoliao-qrcode.json`
- `assets/caoliao-qrcode.png`
- 维护者要求的同 ID 候选审核记录和脱敏验收报告（审核完成后补充）。

不提交生成的 catalog、统计文件、依赖目录、本机配置或日志。Registry Schema 不含产品版本字段，因此版本记在交付清单中，不添加不受支持的 version 字段，不更改稳定 ID。

## 检查与待补材料

- [x] OAuth 描述不包含 Token、Cookie、Client Secret 或带值的 Authorization。
- [x] 卡片分类为办公协作，featured 为 false，probeStatus 保留 unverified。
- [x] 示例不包含真实客户、个人信息或凭据，写入示例先准备方案。
- [x] 卡片、插件文案与 Logo 已同步为 2026.11.1 交付材料。
- [ ] 合并前检查拟托管 Logo 的 HTTPS 响应、图片类型和跨域可读性。
- [ ] 在第三方连接器中完成真实 OAuth 登录、刷新与只读工具调用，提供脱敏报告链接。
- [ ] 补充服务条款链接、提交主体和公开维护联系人。
- [ ] 维护者按 official-vendor 通道核验厂商公开 MCP 配置和端点归属。
- [ ] 维护者补充 `candidates/records/caoliao-qrcode.json`，记录人工审核结论，不预填批准状态。
- [ ] 提交前按上游最新版本运行 npm test、npm run validate、npm run assets:check，并由 Ubuntu CI 复核。

配套插件与第三方连接器分别执行运行验收。收录目的地是第三方 Registry，不宣称 DeepSeek 官方认证。
