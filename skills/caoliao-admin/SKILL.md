---
name: caoliao-admin
description: 搜索或按系统分类选择官方模板并准备、执行批量建码；通过草料 MCP 查询二维码、表单记录及后续动态、扫描量与组织指标；创建静态码、跳转码、图片/文件码、图文展示码、基础信息模板和批量子码，上传图片附件，创建填写表单及周期；查询周期计划、完成与未完成的具体码，确认当前组织和可用能力。支持现有标签样式的预览与单张
  A4 PDF 导出。适用于产品展示、通讯录、设备台账、巡检及草料数据分析；按用户场景读取对应说明。
metadata:
  display_name: 草料管理助手
  display_name_en: Caoliao Admin
  description_zh: 选择官方模板直接建码，查询草料数据与扫描量，创建图文展示码、模板和表单；查询周期计划及未完成设备，确认组织与可用能力。
  description_en: Select official templates and prepare and execute QR code creation;
    query Caoliao data and scan metrics; create product pages with text, images and
    links, templates and forms, upload assets, inspect recurring plans and unfinished
    checks, and discover the current organization and capabilities.
  version: 2026.11.1
  author: 草料二维码
  source_skill_version: 1.16.4
---

# 草料 MCP

## DeepSeek Harness 使用约定

- 本节是构建时添加的平台说明，业务说明仍以随包正文和当前 MCP schema 为准。
- 先确认草料 MCP 已连接。默认服务名为 caoliao-qrcode，Harness 的模型工具名形如
  `mcp__caoliao-qrcode__auth_get_context`。正文中的 auth_get_context 等是原始工具名；
  应选择当前宿主实际提供的工具，不把模型可见前缀作为 tools/call 的 name 发送。
- 配套插件通过侧栏“草料二维码”中的“连接草料账号”完成 OAuth 登录并自动添加 MCP。
  组织由 OAuth 连接决定，不能在入参中切换。不要求用户提供 API Key 或 OAuth token。
- Skill 加载结果提供资源目录。references、examples、scripts 都相对此目录解析；
  执行脚本时使用完整路径，输入/输出路径使用用户工作区的完整路径，正确引用含空格路径。
  不在安装目录保存上传 ticket 或用户文件。
- 优先使用已有 Node 18+ 执行 cjs helper；prepare_batch.py 需要 Python 3.10+，
  若缺少 Python，先说明依赖，不在全局自动安装。上传只传 MCP 签发的字节凭证，
  不额外索取 API Key，也不把签名地址写进用户回复。
- MCP 返回 data/structuredContent 时保留业务错误、notes 和截断提示；文本 JSON 同样检查。
  图片或资源链接在宿主中的展示依赖其能力，不能把“收到 URL”当作“文件已下载”。

帮助用户把表格、照片和文件整理成草料二维码，搭建填写表单、培训测验与巡检任务，并查询记录、答题成绩、后续动态、完成情况和扫码数据。用户用自然语言描述需求，你负责选择工具、匹配资料和整理结果，无需让用户学习接口参数。

使用用户已连接的草料 MCP，按当前工具 schema 和授权范围执行。首次使用或组织不明确时确认当前组织；已明确的任务和目标不重复询问。

## 按场景读取

只加载当前任务需要的说明；组合任务可读取多份。

| 用户想做什么 | 说明 |
|---|---|
| 查码、表单记录及后续动态、扫描量、趋势、分布、工作台数据 | [查询与分析](references/query-and-analysis.md) |
| 确认当前连接的组织和可用功能 | [查询与分析](references/query-and-analysis.md) |
| 关键词搜索或按系统场景/行业分类查官方模板库；新建普通码、模板，导入通讯录或设备台账、批量建子码 | [建码](references/create-qrcodes.md) |
| 静态文本/网址码、网址跳转或多链接聚合、独立图片/文件码 | [码类型选择](references/create-qrcodes.md#跳转码静态码图片码与文件码) |
| 产品介绍、宣传展示、图文说明，混排富文本、图片/图集、文件和外链按钮 | [新建展示码](references/create-qrcodes.md#新建图文展示码) |
| 资料包含本地图片、附件 | [文件上传](references/files.md) |
| 按编号匹配照片、整理表格、统一命名 | [本地数据准备](references/local-preparation.md) |
| 不确定 request 包裹或模板查询入口 | [完整入参示例](references/tool-arguments.md) |
| 新建检查表、配置周期、查计划、列出某周期完成/未完成的具体码 | [表单与周期](references/forms-and-cycles.md) |
| 新建培训测验、单选/判断计分表单，查询每次作答成绩与正确答案 | [答题计分](references/quiz.md) |
| 给已建好的码预览标签、下载图片包或 A4 PDF | [标签预览与下载](references/labels.md) |
| 权限不足、部分成功、超时、结果不完整 | [错误与恢复](references/errors.md) |

完整操作示例：[员工通讯录](examples/employee-directory.md)、[设备巡检](examples/equipment-inspection.md)。示例中的 ID 和幂等键占位符须换成本轮真实值，不直接照抄执行。

一物一码优先复用用户已有模板，负责资料、字段和照片匹配；没有合适模板时再选择官方模板或创建基础模板。产品展示优先组织图文叙事，用新建展示码的组件表达主图、卖点和行动入口，不默认把全部内容塞进基础字段。先确认当前 qrcodes_create 的 schema 已包含 components；旧环境缺少该参数时说明限制，不承诺自动替换模板中的非基础组件。

## 减少等待与重复调用

- 支持摘要参数的服务优先使用默认摘要，需要完整定义或字段时再传 detail=full；批量预校验返回 plan_id 后用方案编号提交，详见建码说明。旧环境以实际 schema 为准。
- 一次发现当前场景需要的工具，复用本轮已加载的 schema；不预加载全部工具或所有参考文档。
- 先用列表摘要筛选，再读确实需要的详情。相互独立的只读查询可同时发出，建议每批 3–5 个；依赖上一步 ID 的调用、写入和轮询按业务顺序执行。
- 组织与目标已明确时，不重复查完整权限清单；需要诊断某项能力时，auth_get_context 传 operations。工具存在不等于当前凭证或分区有权限。
- 批量结果已逐项读回字段和永久媒体地址时，不再默认逐码查询完整详情；只对异常项或用户指定的核验对象补查。视觉检查另行抽样，不能声称全部页面已打开。
- 用户只需码图时直接下载成功回执中的 qrcode_image_url，不先查询标签样式或临时安装二维码库。需要简单打印时使用随包 A4 HTML；已有样式的标签走原生导出。
- 整理资料和必要确认后再生成建码方案，避免在30分钟有效期内长时间等待；过期按建码说明重新校验，结果未知先查原任务。

## 交付给用户

- 建码：给出名称和可打开的链接，按来源条目对应结果；缺失资料、失败和待完成项分别列明，不将提交成功当作全部完成。
- 表单与周期：说明新建的表单、关联的码、执行频次和时段；批量子码继承模板周期，不承诺为某一批子码单独配置周期。
- 查询与分析：先回答问题，再给关键数字或列表，标明组织、时间范围和数据口径。面向用户使用业务名称，只有定位对象或排错时才展示 ID、工具名和错误码。
- 资料不全时先整理已有内容与缺项；只有必填、匹配歧义或目标不明确等会影响结果的问题才需要用户补充。

## 共同约定

- MCP/API 额度按当前组织主账号的套餐计算，同组织的 OAuth、API key 和 MCP 共用额度。需要查看额度或遇到限额时调用 usage_get，以返回的套餐、limit、used、reserved、remaining 和 reset_at 为准；不按客户端名称猜套餐，也不把套餐查询失败时的免费档兜底当作用户实际套餐。

- 组织由 OAuth 连接决定，不靠请求中的 org_id 切换；使用客户端正常授权入口，不索要网页登录 Cookie 或要求用户导出 OAuth token。权限不足按返回说明处理，不通过其他凭证绕过。
- 客户端使用设备码授权时，引导用户打开客户端提供的验证页面、输入 user_code，并核对应用、组织和权限后自行同意或拒绝；是否采用设备码由客户端决定，不手工拼授权请求或索取 device_code/token。
- 按用户已授权的任务执行。新建场景只创建新资源；修改是单独操作，仅在用户明确要求时使用，只能改带 AI 标记（AI 通过 MCP 生成）的内容，流程见 create-qrcodes，不为完成新建任务改动已有内容。
- 名称用于沟通，ID 用于调用。同名对象先确认；所有资源 ID 来自查询或创建响应。普通码 qrcode_id、短码 coding、模板母码 template_id、填写表单 form_id 不能混用。
- MCP 新建码、上传及周期工具使用 `{"request": {...}}`，成功响应为 `{"data": {...}}`；旧浏览工具可能返回 `{code:0,data:...}`，语义分析工具返回 `{data,notes?,next_actions?}`。以实际 schema 和响应为准，不把整个响应当下一步参数。
- 创建返回 ID、HTTP 成功或任务 succeeded 都不等于所有业务步骤完成。检查 status、errors、逐项结果和截断信息；未知结果保留原 ID、原请求和幂等键，按错误说明恢复。
- 本地上传以 file_key 串联申请、查询和建码；优先用已有 Node 18+ 的 scripts/upload_file.cjs 或 Python 3.10+ 的 scripts/upload_file.py 原样读取上传凭证并 PUT 文件字节，避免签名 URL 经过 shell 拼接。仅 temporary_available 可引用；无需为了上传安装另一套运行时；两者都没有时使用等价 HTTP 能力，具体步骤见文件上传说明。
- 精确数据来自工具，不用记录样本外推总体。读取 notes、范围限制及分页；没有数据与查询失败分别说明。输出仅保留用户任务所需信息，不输出凭证、签名上传信息或无关个人资料。

## 权限速查

| 操作 | 所需 scope |
|---|---|
| 模板库分类/列表/详情、建码目标、可用模板及模板 schema 查询 | templates.read（也接受 templates.write） |
| 新建表单、新建模板、明确授权的模板和表单修改 | templates.write |
| 官方模板准备建码及执行方案 | templates.write + qrcodes.write（两项都需满足） |
| 普通码、静态码、跳转/聚合码、批量预校验与提交、任务及逐项结果、修改 AI 创建的码和子码 | qrcodes.write |
| 上传申请与状态 | assets.write |
| 表单列表、表单详情、记录列表与详情；周期查询 | records.read |
| 当前组织与能力发现 | 只需有效凭证，不要求业务 scope |

高级成员可以通过 OAuth 授权；表单与记录查询同时受授权 scope 和当前成员的资源/分区权限限制，不代表可访问整个组织。查询流程与不完整结果的处理见[查询与分析](references/query-and-analysis.md#高级成员的表单与记录查询)。

工具标记为只读不表示无需相应 scope。组织及项目的实际可用范围由服务端检查，查询到对象不代表已获得写权限。
