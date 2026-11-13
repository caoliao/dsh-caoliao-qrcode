# 错误与恢复

先区分只读查询、尚未提交的参数校验、已提交的写操作。下表中的“重试一次”只适用于只读查询，不用于结果未知的创建请求。

## 写入与权限

| 情形 | 处理 |
|---|---|
| 401 / 授权失效 | 在客户端重新连接草料，不索要或导出 OAuth token，不反复重试 |
| 403 / permission_denied / scope 或项目权限不足 | 说明缺少的权限与操作范围；不换身份绕过 |
| resource_authorization_unsupported | 当前查询尚不支持此成员身份；按场景采用已支持的独立工具，不回退组织级接口 |
| 记录 total=null / truncated=true | 总数未知或结果不完整，按时间、码、表单收窄；空的截断结果不等于无记录 |
| 批量表单详情部分 error | 逐项区分可读与失败对象，不把整批响应成功当成全部成功 |
| 工具缺失 / 环境未开放 | 核对实际 tools/list 和部署状态，不宣称操作已完成 |
| 参数或预校验失败 | 按字段路径修正；校验通过后再提交，不擅自改变用户的数据含义 |
| partial_success | 保存已创建 form_id/qrcode_id/template_id、原请求、幂等键和 errors；使用只读工具核对，不换键重建或自动补写已有对象 |
| 超时 / 结果未知 / IDEMPOTENCY_OUTCOME_UNKNOWN | 保留证据，查询原任务或已知资源；无法确认时报告未知，不把超时当作未执行 |
| 同幂等键内容冲突 | 找回原请求并核对意图；不能用换键规避未知结果 |
| content_pending | 按建议间隔有限查询逐项结果，超时报告待就绪 |
| unknown / unavailable | 不猜测 item_key 与资源映射，不自动重建 |
| 任务回执过期（410）/旧回执不可用（409） | 核对已保存资源与后台结果，不重新提交整批 |

工具级成功只表示得到业务响应；始终检查内部 status、errors、valid、items。没有 status 的既有模板创建响应按其 schema、映射和读回信息判断，不能强加统一外壳。

## 错误码

| `code` | 含义 | 怎么办 |
|---|---|---|
| `AI_EDIT_NOT_AI_CREATED` | 这份内容没有 AI 标记 | 不能修改。告诉用户到草料后台修改，或新建一份；不要换工具绕过 |
| `AI_ORIGIN_MARK_FAILED`（errors） | 内容已建好，但 AI 标记没写上 | 用原幂等键和原参数重试一次补打标记，不要换键重建；仍失败就告诉用户这份内容暂时不能通过 AI 修改 |
| `AI_EDIT_ORIGIN_UNAVAILABLE` | 暂时查不到 AI 标记 | 稍后重试一次，不要当作可以修改 |
| `QRCODE_VERSION_CONFLICT` / `FORM_VERSION_CONFLICT` | 读取后内容变了 | 重新读编辑状态，核对后再决定，不能覆盖 |
| `QRCODE_KIND_MISMATCH` | 码类型和工具不匹配 | 按编辑状态的 kind 选工具；母模板用 templates_edit |
| `DESTRUCTIVE_FIELD_CHANGE_UNSUPPORTED` | 删字段、删选项或改类型 | 保留原字段和选项，或新建表单 |
| `metric_not_found` | 指标名不对 | 回 `list_metrics` 看可用清单 |
| `invalid_argument` | 参数不合法（超 limit、缺时区、field_value 缺 form_ids 等） | 按 `message` 修正参数 |
| `query_timeout` / `query_busy` | 时间窗或分组太大 / 查询通道繁忙 | 收窄时间窗、减少维度或 scope 后重试一次，不要无限重试 |
| `upstream_rejected` | 上游拒绝，可能是资源权限不足 | 先读 message 与错误详情；明确权限拒绝不重试、不换凭证绕过，只有暂时性故障才稍后重试一次 |
| `rate_limited` | 当前组织 MCP/API 调用过快；读日额度用完后会降为每秒1次 | 按 `retry_after_ms` 等待后重试原请求，不并发猛刷；写入保留原幂等键 |
| `quota_exceeded` | 当日成功创建额度不足（`used`+`reserved` 已到 `limit`） | `reserved` 较多时先查已有任务结果；否则到 `reset_at` 后再试或联系管理员调额；不要换幂等键或拆批绕过 |
| `usage_idempotency_expired` | 原请求超出安全重放期限 | 按返回的资源或任务引用查询已有结果；不要自动换新键重做，确认仍需新建后再提交 |
| `upstream_unavailable` / `not_configured` | 上游不可用或通道未配置 | 暂时性故障稍后重试一次；配置缺失说明待恢复，不当成空数据 |
| `form_schema_unavailable` | 表单结构取不到（可能已删除） | 用 id 继续，向用户说明字段名无法还原 |
| `internal` | 服务端内部错误 | 重试一次；仍失败如实告诉用户，不要伪造数据 |
| `ORG_TEMPLATE_MANAGED` | 这份模板是开了内容同步的组织模板复制件，只能用它生码，不能改模板 | 告诉用户「这份模板开了内容同步，要修改请联系管理员」；不重试，不换别的工具去改 |

**注意两种失败外壳不一样**：上表这些是**工具级**失败，形如 `{code, message}`。而**参数 schema 级**校验失败（时间缺时区、类型不对等）由 MCP 框架直接返回校验文本，**没有 `code`/`message` 字段**，形如 `2 validation errors for call[query_metrics] time.from Value error, ISO 时间字符串缺时区…`——同样已写明怎么改，照着修参数重试即可。


## 向用户报告

说明已经完成的部分、保留的资源/任务 ID、未确认的部分和可采取的下一步。完整结果与截断结果分别标明；不把成功入队、上传字节已发送或工具未报错当作业务完成。

## 能力发现与空数据

`auth_get_context.operations` 可只检查目标工具。`scope_denied` 表示凭证缺权限，`unknown_operation` 表示工具未注册，`not_configured_or_disabled` 表示配置不可用；都不表示业务数据为零。`available=true` 后仍由实际操作核验当前资源/分区权限。查询失败不自动换凭证或创建替代数据。

## 空列表与资源错误

projects_list 空列表与 workspaces_list 空列表不是一回事：工作台不等于分区。建码时可调用 qrcodes_list_create_targets，request.kind="projects" 核实可用分区，不把查询通道差异解释成“组织没有分区”。views_list 的上游异常也不等于没有视图，保留错误并报告待恢复。

“不存在或无权访问”刻意不区分其他组织资源是否存在；不要尝试枚举归属。qrcodes_list 的 project_id 筛选和成员权限过滤在候选页内进行，total=null 表示未知，空页仍检查 next_page_token。
