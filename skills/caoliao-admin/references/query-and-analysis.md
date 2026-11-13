# 查询与数据分析

培训测验成绩：先查 record_list，再用 record_get(include_quiz=true) 获取逐次总分、逐题得分和正确答案；缺失、受限结果不按零分处理。详见[答题计分](quiz.md)，旧环境先核对工具 schema。

按需查阅：[时间窗](#时间窗)、[工具速查](#工具速查)、[参数兼容与调用示例](#参数兼容与调用示例)、[结果读取规则](#结果读取规则)、[统计分析链路](#统计分析标准链路)、[常用分析流程](#常用分析流程)、[必须遵守](#必须遵守)。本页承接精简工具主说明中的详细规则，不要求一次读完。

project_id 是分区，workspace_id 是工作台，view_id 是工作台视图，node_id 是视图目录节点。节点包含的码和码本身不是同一对象。qrcode_id 是数值ID，coding 是短码；表单、模板和工作台可重名，按真实ID查询。字段ID通过 form_get 或创建返回的映射取得，不把字段名当ID。

## 巡检情况：记录、任务和异常分开回答

用户问“设备巡检情况”时，先找相关表单和实际填写记录，再按需关联周期计划。名称关键词是字面匹配，不能默认有同义词扩展；例如“灭火器”可能漏掉“灭火箱”，可缩短为“灭火”，再用表单结构核对相关性。保留真实表单 ID，不把相似名称的表单混成一张。

- 已检查：分别报告记录数与不同码数；两者差值不能直接推导重复检查的点位数。
- 应检/漏检：必须有对应点位范围、频次与时间窗。没有计划不等于没有检查，未取得分母也不等于业务上不存在分母。
- 异常：同时核对总评与检查子项。总评正常可能仍有单项异常；说明异常属于哪个部件，不扩大到其他正常检查项。
- 整改：记录的处理、审核功能关闭或照片为空，不证明未整改，也不能证明整个平台没有处理能力。未获取的部分明确为未知。

先按单个字段做 `query_metrics` 的 `field_value` 分组，再对异常组取证；无需一开始就做“字段值 × 全部码”的大结果。不同身份下聚合原值与详情复合值可能不同，不能保证所有 `drill_down` 字段值在成员详情中具有相同表示。

## 字段匹配与查询未完成

成员 `record_list` 在逐条鉴权后匹配可见值。单选可用当前 `option_text`；旧服务若未升级可能只支持 JSON 精确值。检查项等复合字段仍是整个值的精确匹配，不是“包含某个异常子项”；不要把聚合展示串（如“软管:×”）直接拼成详情过滤值。需要时先 `record_get` 核实实际值，或在已有权限内缩小码、表单和时间范围后读取核对。

`truncated=true` 时查看 `truncation_reason`（旧服务可能没有）：`result_limit` 是返回条数上限，`verification_limit` 是候选权限核验条数上限，`time_budget` 是核验耗时预算。空列表且截断只能说本次未找到，不能说全范围无匹配。缩小范围时保留原有筛选条件；record_list 暂不提供分页，不用样本推算统计。

`permission_denied` 是明确无权；`authorization_unavailable` 或 `PERMISSION_SERVICE_UNAVAILABLE` 是暂未能确认权限，应报告服务异常，可稍后重试。不能用更换身份或组织接口绕过。模板权限失败不能推断模板无子码。

## 当前组织与可用能力

确认连接身份或排查可用能力时，调用 auth_get_context，参数为 request={}；只查某项时用 request={"operations":["gallery_list"]}（最多20项）。未知工具返回 unknown_operation，不能当作有权限。无需每次查数前重复调用。organization 是当前凭证绑定组织；API key 的 user_id 为 null，不把它当自然人账号。

effective_scopes 反映现行授权规则；capabilities[].available 只检查当前凭证及已知配置，不保证资源/项目权限、套餐容量、数据库连接或服务健康。required_scope=null 的存量工具沿用原有校验，不代表匿名可用。权限不足按正常授权处理；完整工具参数始终以 tools/list 为准，不凭 scope 名猜测未实现的操作。

## 高级成员的表单与记录查询

高级成员 OAuth 按当前 user+org、授权 scope 和资源/分区权限校验；连接成功或持有 records.read 不等于可以读取整个组织。撤销分区权限后，后续查询按新权限执行。

1. 找表单用 `forms_list`：按当前可读表单分区过滤后搜索、分页和计数；`search_key` 匹配名称/备注/编号，`number` 精确匹配编号。列表及总数只代表当前可见范围，不能称为组织全部表单。
2. 读字段用 `form_get`：单个无权对象返回错误；批量请求逐项校验，检查每项 `error`，不能把整批成功当成每个表单都可读。
3. 查填写内容用 `record_list`，优先给出时间、`project_ids`、`qrcode_ids` 或 `form_ids`。服务端对候选记录逐条核验当前权限，返回脱敏内容；无权记录不会混入结果，权限服务失败不能解释为无记录。用 `record_get` 读取某条有权记录的详情。
4. 高级成员的 `record_list.total` 固定为 `null`（未知）；`truncated=true` 表示达到返回数量或权限核验上限。即使 `rows=[]`，也不能据此认定没有可见记录。缩小时间、码或表单范围；该工具没有翻页，不通过重复同一请求遍历全量，也不从样本推算总数。
5. `record_list.filters.field_equals` 按逐条鉴权后的可见展示值精确匹配；隐藏字段和脱敏前原文不能被筛选探测。字段聚合及 `result_values` / `result_value_texts` 筛选需要当前完整管理权限，或限定唯一表单和本次全部具有管理权限的 `qrcode_ids`。拒绝时不能删掉条件后声称已回答原问题。

码详情按当前资源权限返回，子码字段脱敏；关联记录的 `total=null` 表示未知，`truncated=true` 表示不完整。旧环境若仍返回 `forms[].records.available=false`，改用 `record_list` / `record_get`，不能解释为零条记录。统计被拒绝时不能从记录样本估算。高级成员扫码统计按NC当前授权码集过滤；超过500个码时限定 `scope.qrcode_ids`。报表成员视图按原时间窗和当前权限重算，检查 `run.view`，不能解释为组织冻结原值；不含共享分析正文或固定筛选原文，原文字段聚合另需实际管理权。选建码模板用 `templates_list_editable`（默认摘要）选定后再用 `templates_get_schema`；不得用组织凭证绕过当前权限拒绝。

## 时间窗

- `time.from` / `time.to` 用 **epoch 秒**（如 `1788883200`），或**带时区**的 ISO 8601（`"2026-09-09T00:00:00+08:00"`）。**不带时区的 ISO 字符串会被拒绝**，防止静默偏 8 小时。
- 用户说"本月""最近 30 天""上周"时，你按 **GMT+8** 自然日换算成秒；`to` 超过当前时间会自动截到现在。
- `query_metrics` 时间窗**必填**；`record_list` 可不填（但不填会撞上限）。

## 工具速查

### 身份与能力工具

| 工具 | 参数 | 返回与边界 |
|---|---|---|
| `auth_get_context` | `request={}`；或 `request={"operations":["gallery_list"]}` | 当前组织、认证类型、有效 scopes、各工具能力；不返回凭证、不切换组织 |
| `usage_get` | `request={}` | 当前组织 MCP/API 当日额度：建码、表单和模板、上传的 limit/used/reserved/remaining，读调用是否已降速及频率上限；网页操作不计入。额度不足先等 reserved 操作完成或到 reset_at，不换幂等键重提 |

### 语义分析与记录工具（分析主力）

| 工具 | 何时用 | 关键参数 | 返回要点 / 坑 |
|---|---|---|---|
| `list_metrics` | **统计分析第一步**。建码从模板 schema 开始。用户问"我们有哪些…" | `limit`（每类对象上限，默认 20，最多 100） | `data.catalog.{forms,plans,qrcodes,projects,states,workspaces}` 带名字（`states` 是状态集名，`workspaces` 是工作台；另有 `catalog.org` 组织自身）；`catalog.totals` 是各块总数（`null` = 没数出来，不是 0），`catalog.truncated` 列出**只返回了前 N 条**的块，`catalog.degraded` 列出**查失败**的块——三者都表示"目录里没有 ≠ 组织没有"。`plans[].time_slots[]` 是 `{time_uuid, label, execute_status_label}`，`label` 是排班人话（如「每周 周一 00:00 → 周日 23:59」），`time_uuid` 对应 `group_by:"time_slot"` 的 `group_key`。`detail=full` 时 `data.metrics[]` 每个含 `dimensions`（可分组维度）、`applicability`（`has_records` / `has_cycle_plans` / `has_todos`——组织没有周期计划或没启用待办，对应指标就不会列出）、`limitations`、`source`（`registry` = 平台口径，`org_metric` = 组织自定义）；`saved_definitions` 是组织自定义口径（可能为空）。用户点名的表单不在目录里时，先看 `truncated`，再用 `forms_list`（`search_key` 按名搜）找 |
| `get_metric` | 出数前看口径，比例类必看 | `metric` | 分母是什么、可用 `dimensions`、`limitations`（转述给用户） |
| `query_metrics` | 多少 / 占比 / 趋势 / 分布 | `metric`、`time`（必填）、`group_by`、`scope`、`limit`、`field_id`、`view_id`（`group_by:"view_node"` 专用） | 见下方「配方」。`limit` 默认 30；单维上限 200、双维上限 500，超限报 `invalid_argument`。比例类的数值点还带 `numerator`/`denominator`；计划类另带 `components{planned,completed,pending,overdue}`、待办类另带 `breakdown` 五桶——**这两个是回答"应做/已做/未做各多少"的正解**，见配方④⑥ |
| `record_activities_list` | 某条填表记录的后续跟进、评论、处理进度 | `request={"record_id":"真实记录ID","page":1,"page_size":20}`；也可用 record_url，二选一 | records.read；同时校验记录和动态可见范围。按 page.has_more 翻页；access=denied 不代表没有动态；只读、不标记已读 |
| `record_list` | "这个数字是哪几条"——**取证不是遍历** | `filters`（同 scope 结构）、`time`（可选）、`limit`（默认 20，最多 200） | `data.{rows, total, truncated, limit}`。`total` 非 null 时是当前查询口径的总数，null 表示未知（高级成员固定为 null），`rows` 只是本次返回的记录；**没有翻页**，不够就收窄时间窗或加过滤。每行带 `audit_status`（正常/待审核/审核通过/审核不通过）——「未删除」**包含待审核**，统计口径里都算数；要只看某种审核态用 `filters.audit_status:["待审核"]` |
| `record_get` | 一条记录的完整内容、审核链、附件 | `record_id` 或 `record_url`（二选一）；`format`=`json`(默认)/`markdown` | 读权威源，无同步延迟 |
| `form_get` | 读懂字段、拿 `field_id` | `form_id`，或 `form_ids`（批量，最多 20，返回 `{forms:[...]}`，单个失败只标该项 `error`） | `data.fields[]`：`field_id`、`field_name`、`field_type`（radio/checkbox/text/image/name/time…）、`options[].value` |
| `qrcode_get` | 单个码的概要，按需读取内容、表单或状态 | `qrcode`（coding 或码 URL），`scope` 默认 `summary` | |

`qrcode_get` 支持普通码、模板母码和子码的 coding。工具 schema 有 `scope` 时，先用默认 `summary` 看标识和表单目录，再按需选择 `content`、`forms`（含关联记录）或 `states`；只有确实需要原完整结果时才用 `full`，避免单码大响应挤占上下文。概要只展示前20张表单、名称最多300字符，检查 `form_count`、`forms_truncated` 与 `omitted_sections`；省略的内容不代表不存在。记录统计仍用 `record_list` / `query_metrics`，不要从概要或关联记录样本推断总量。旧环境没有 `scope` 参数时不传该参数。

`scope` / `filters` 可用字段（不填=不额外限定，仍受身份权限约束；高级成员限制见上节）：`form_ids`、`project_ids`、`qrcode_ids`、`member_ids`（提交人）、`process_status_text`（如「待处理」）/ `process_status`、`result_value_texts` / `result_values`（如「合格」）、`field_equals: [{field_id, value}]`（字段精确匹配）、`audit_stage_ids`、`auditor_user_ids`、`state_ids`（状态集 id，名字在 `list_metrics` 的 `catalog.states`）、`audit_status`（记录审核态：`正常` / `待审核` / `审核通过` / `审核不通过`，可多选；仅记录族与 `record_list`）、**`workspace_ids`**（码在这些工作台里）、**`view_node_ids`**（码挂在这些节点**或其子孙**下）。数组字段也接受 JSON 字符串形态。

**计划族（`plan_task_*`）与待办族（`todo_*`）的 `scope` 只认码自身的属性**：`qrcode_ids` / `form_ids` / `project_ids` / `workspace_ids` / `view_node_ids`；传提交人、处理进度、审核、状态、字段值会报 `invalid_argument`（不会被静默忽略）。

### 工作台三工具（结构浏览，不算数）

| 工具 | 参数 | 返回 |
|---|---|---|
| `workspaces_list` | `limit`(默认 30，最多 100) | `data.workspaces[]{workspace_id,name,note,project_id,is_preset_guide}`、`total`。空数组 = 这个组织没用工作台，照常按分区/表单/码分析 |
| `views_list` | `workspace_id`（可选）、`limit` | `data.views[]{view_id,workspace_id,name,root_node_id,uncategorized_node_id}`、`total`。`root_node_id` 放进 `scope.view_node_ids` = 视图已归类的码（同工作台口径）；`[root_node_id, uncategorized_node_id]` = 视图纳入的全部码 |
| `view_nodes` | `view_id`（必填） | `data.nodes[]{node_id,parent_id,ancestor_ids,name,kind(root/uncategorized/normal),qrcode_count}`，扁平、父在子前；`qrcode_count` 是**直接**挂载数，子树合计按 `ancestor_ids` 自己累加 |

**配方 · 「消防系统里 1 号楼这个月巡检了多少」**：`workspaces_list` → `views_list{workspace_id}` → `view_nodes{view_id}` 找到「1号楼」的 `node_id` → `query_metrics{metric:"record_submission_count", time, scope:{view_node_ids:[node_id]}}`（子孙楼层自动包含）。要按楼栋拆：`group_by:"view_node", view_id`（分组键是码**直接**挂的节点，不做子树汇总；不在该视图的记录落 `group_key:null`）。

### 平台派生量清单（`list_metrics` 会按组织适用性裁剪，实际以返回为准）

| 派生量 | 是什么 | 适用条件 |
|---|---|---|
| `record_submission_count` | 记录提交量 | `has_records` |
| `active_submitter_count` | 提交人数（去重） | `has_records` |
| `active_qrcode_count` | 有记录产生的码数（去重） | `has_records` |
| `active_form_count` | 有记录产生的表单数（去重） | `has_records` |
| `inactive_qrcode_count` | 静默码数（配方⑤） | `has_records` |
| `plan_task_completion_ratio` | 周期任务按期完成占比（配方④） | `has_cycle_plans` |
| `plan_task_gap_count` | 周期任务已逾期未完成数 | `has_cycle_plans` |
| `todo_open_count` | 待办未完成数（配方⑥） | `has_todos` |
| `todo_overdue_open_count` | 待办已逾期未完成数 | `has_todos` |
| `todo_on_time_completion_ratio` | 待办按期完成占比 | `has_todos` |
| `scan_count` | 扫码次数（配方⑦） | `has_scans` |
| `scan_visitor_count` | 扫码人数（去重，配方⑦） | `has_scans` |

记录类五个量共享同一套维度：`form` / `qrcode` / `project` / `process_status_text` / `result_value_text` / `day` / `month` / `field_value`。计划类与待办类的维度见各自配方。

### 对象浏览八工具（枚举，不算数、不分组）

| 工具 | 参数 | 返回 |
|---|---|---|
| `forms_list` | `page`(默认 1)、`page_size`(默认 10，最多 20)、`search_key`（模糊匹配标题/备注/编号）、`number`（编号精确，如 `D32`） | `data.list[]{id,name,type_text,number,project{id,name}}`，`data.page{current_page,last_page,per_page,total}` |
| `projects_list` | `page_size`(默认 100，最多 100) | `project_id,name,parent_id` |
| `qrcodes_list` | `page_size`(默认 20，最多 100)、`page_token`（上一页的 `next_page_token`）、`start_time`/`end_time`(ISO 8601)、`workspace_id`、`view_node_id`（该节点含子孙下的码） | `data.list[]{name,id,coding,tpl_id}`、`next_page_token`、`total` |
| `qrcodes_get_operation` | `qrcode`（coding 或 URL） | 该码关联的操作项：`operation_name`、`operation_description`、`element_type` + `element_type_title`（中文类型名，展示用这个）、`element_value` |
| `templates_list` | 同 `qrcodes_list` 的分页/时间 | `tpl_id,name,coding` 摘要；详情用 templates_get。普通成员 total=null，空页仍检查 next_page_token |
| `templates_get` | `template`（模板 coding 或 URL） | 模板 meta + 字段结构 |
| `templates_list_qrcodes` | `template`(必填) + 分页/时间 | 模板下子码 `name,id,coding` |
| `templates_get_qrcode` | `template`、**`subcode`**（均 coding 或 URL）——注意参数名仍是 `subcode`，不是 `qrcode` | 子码 meta + fields |

浏览工具翻页：`qrcodes_list`/`templates_*` 用 `page_token`，`forms_list` 用 `page`。这些能翻页；`record_list` 不能。

## 参数兼容与调用示例

以下为参数形态示例；ID、字段ID、时间范围和选项值须替换为本次查询获得的真实值，示例不授予任何访问权限。

- 时间窗两端为包含边界。epoch 秒可传整数或数字字符串，例如 `1786982400`、`"1786982400"`，均对应 `"2026-08-18T00:00:00+08:00"`；也接受 `"2026-08-18 00:00+08:00"`。不传无时区字符串，不把毫秒当秒。
- 优先传原生对象与数组。为兼容客户端序列化，`scope` / `filters` 也接受 JSON 字符串；其中数组字段支持原生数组、JSON数组字符串或单个裸值（归一成单元素数组）。例如 `{"form_ids":["123"]}`、`{"form_ids":"[\"123\"]"}`、`{"form_ids":"123"}`。兼容形态不改变字段、权限或业务过滤限制。
- `group_by` 可传单维字符串、两维数组 `["form","month"]` 或逗号串 `"form,month"`；最多两个不同维度，重复维度和三维及以上会被拒绝。维度必须由该指标声明支持。
- `field_value` 需 `field_id` 和唯一的 `scope.form_ids`，可放在任意一维，但不能重复；仅支持该维度的记录指标可用，计划类不支持。`field_id` 必须来自 `form_get`，不能拿字段名称代替。个人授权的字段筛选/聚合按上文实际权限判断，不能靠换参数形态绕过。
- `view_node` 分组必须提供 `view_id`（来自 `views_list`）。同一码可以在不同视图分别挂载，不指定视图无法确定按哪个节点分组；其他分组不需要这个参数。

字段精确匹配示例（仅当前身份支持时使用）：

```json
{"filters":{"form_ids":["123"],"field_equals":[{"field_id":"1001","value":"异常"}]},"time":{"from":"2026-08-01T00:00:00+08:00","to":"2026-08-31T23:59:59+08:00"},"limit":50}
```

这是 `record_list` 的参数，不加 `request` 包裹；填写记录的全部字段、审核链和附件用 `record_get` 查看。审核筛选如 `filters.audit_status=["待审核"]`；`query_metrics` 的记录族使用 `scope.audit_status`，取值相同。未删除记录包括待审核记录，不能默认当作全部已审核通过。

## 结果读取规则

- `list_metrics` 的目录还包含 `states`（`scope.state_ids` 的来源）、`workspaces`（工作台/业务系统）、`org`（组织信息）。指标分记录、周期计划、待办、扫码四族；平台派生量按适用性裁剪，组织自定义口径可能为空。目录空或被裁剪不等于组织未使用该能力，先检查权限、`truncated`、`degraded` 与 `notes`。
- `query_metrics` 的分组行从 `result.groups[].group_key` / `value` 取值；**`result.columns[].name` 是列的语义标识，不是行对象的动态取值键**。不能写成 `row[column.name]`。双维的 `group_key` / `group_label` 是按维度名索引的对象，例如 `{"form":"2693999","month":"2026-08"}`，不依赖对象键顺序。
- 平台注册指标（L0.5）中的比例数值点可含 `numerator` / `denominator`。组织自定义 `source=org_metric` 路径暂缺这两个字段，也不支持双维交叉；字段缺失不代表比例算错，不自行编造分子分母。不要将 `query_metrics` 分组行与 `run_report` 的数组行协议混用。
- 聚合的 `drill_down` 只在服务端能精确表达相应记录集时提供；不能把缺失/null 解释为统计值为零。双维的例外、截断和组合数上限见下方流程③。

## 空结果与权限

空目录或列表仅表示本次查询范围与当前身份下的结果，不能直接断言组织没有码、表单或计划。检查分页、truncated、total=null、notes、available=false及错误原因；未配置、无权限、资源核验不支持和服务异常分别说明，不用“先重新建码”作为查询失败的解决办法。扫码统计不以周期计划存在为前提。

## 统计分析标准链路

以下统计流程仅在当前身份具备相应能力时使用；高级成员查表单和记录可直接采用上方流程，不要求先成功调用统计目录。

按需使用 `list_metrics` → `get_metric` → `query_metrics`；只有需要明细证据时才下钻 `record_list` / `record_get` / `form_get`。已读过且未变化的定义无需重复加载。查整月趋势一次传整月窗口并按 day 分组，不按天循环；维度支持范围以 get_metric 为准。

## 常用分析流程

**① 出数 + 下钻**
`query_metrics{metric:"record_submission_count", time, group_by:"form"}` → 每组返回 `{group_key:"2693999", group_label:"动火作业检查", value:734, drill_down:{filters:{form_ids:["2693999"]}, time}}`。把某组的 `drill_down` **原样**作为 `record_list` 的 `filters` + `time` 传入，就得到构成这个数字的记录。不分组时 `result.value` 是总量，分组时 `result.value` 为 null、看 `groups`。

**② 按字段取值分布 / 合格率（服务端聚合，禁止抽样）**
1. `form_get{form_id}` 找到目标字段的 `field_id`（如「检查结果」）。
2. `query_metrics{metric:"record_submission_count", time, group_by:"field_value", field_id, scope:{form_ids:[仅一个]}}` → 组为 `{group_key:"正常", value:733}`、`{group_key:"异常", value:1}`；取值就是展示文本。先确认分母是有效填写次数、应检点位还是应做任务。只有单选结果、各组互斥完整且没有截断时，才可用合格组除以各有效组之和；否则查询匹配口径的精确分母。完整聚合已包含分子时，不再重复查一次精确匹配。重复填写、空结果和多选字段不能随意计作独立点位。
3. 要看异常明细：`record_list{filters:{form_ids:[…], field_equals:[{field_id, value:"异常"}]}, time}`。
约束：`field_value` 必须配 `field_id` 且 `scope.form_ids` **恰好一个表单**；只有记录统计类指标支持它，计划类（`plan_task_*`）不支持。

**③ 双维交叉（区域×班次、表单×月份）**
`group_by:["form","month"]`（或 `"form,month"`，最多两维，不能相同）→ `group_key` 与 `group_label` 变成**按维度名做键的对象**：`{form:"2693999", month:"2026-08"}`，用维度名取值，别假设键序。存在 `drill_down` 时，它已组合该组可表达的过滤条件和时间窗，原样传给 `record_list`。

- **下钻不是每组必有**：两维条件无法精确合并、分组键是 SQL NULL，或指标本身不支持记录下钻时，不提供该组的 `drill_down`，不能自行补一个宽泛查询冒充该组明细。当前 `field_value` 放在第二维可以正常聚合，但不能自动合并两维的下钻条件，`notes` 会解释；这不表示聚合数字无效。支持的记录指标可按需将 `field_value` 放在第一维重新查询，仍以实际返回为准。
- **上限限制交叉后的组合数，不是每维各取多少**：20 个表单 × 30 天可能有600组；双维 `limit=500` 仍可能截断。默认30组，单维或不分组上限200，双维上限500；超限参数会报错，不静默钳制。达到上限时检查 `notes`，不要把已返回组当作全部；收窄范围/时间窗，或按问题改为单维查询。
- 组数越多，响应越大，不必默认拉满500组。旧说明曾估算500组约100–170KB，这只是历史量级参考，不是固定大小、性能保证或请求上限；实际体量取决于标签、下钻条件等返回内容。

**④ 周期计划：应做 / 已做 / 未做 / 逾期（别只报 value）**
`query_metrics{metric:"plan_task_completion_ratio", time}` 的数值点除了 `value`，还带
`components:{planned, completed, pending, overdue}` 与 `breakdown:{planned, done, missed, pending, skipped}`。
**报"完成情况"时要用这四个分量，不要只报 value**：`value` 的分母含 `pending`（还没到期的任务），时间窗越靠近当下 pending 越多、value 被无端拉低。
返回的 `notes` 里会直接给出这次的换算结果（如「completed=45、pending=5、overdue=234：评估执行纪律建议看 completed/(completed+overdue)=16.1%，而不是直接用 value」）——**读它，按它报**。
- 可用维度：`plan_target_form` / `cycle_type` / `day` / `month` / `plan` / `qrcode` / `time_slot` / `project`。
- 每日趋势：`group_by:"day"`；按点位/班次拆：`group_by:["qrcode","time_slot"]`（即「区域 × 班次」矩阵）。
- **「哪些没做」的明细**：用 `plan_task_gap_count` + `group_by:"qrcode"`，得到的是**点位清单**（每组一个码，`group_label` 是码名）。计划类**不给记录级下钻**——未完成的任务本来就没有记录，`record_list` 查不到它们；`drill_down` 为 null 是正确行为，不是缺陷。
- 计划类**不支持** `field_value` 维度：未完成的任务没有记录、没有字段值。

**⑤ 静默点位：哪些码这段时间一条记录都没有**
`query_metrics{metric:"inactive_qrcode_count", time, group_by:"qrcode"}`。三个反直觉之处必须记住：
1. **分组后每组的 `value` 是"静默天数"，不是记录条数**——是距今多久没动（如 `152` 表示 152 天没有新记录）。
2. universe 是"历史上至少提交过一条记录、且当前未删除"的码；**建了从没用过的新码不计入**（它的"没记录"是还没启用，不是停了）。
3. **不分组时不给 `drill_down`**（静默是"没发生"，顶层没有可下钻的记录集）；分组后每组的 `drill_down` 时间窗是按该码最后一次提交单独算的，不是你传的观察窗——原样传给 `record_list` 就能看到它最后那条记录。

**⑥ 待办 / 整改派单**
待办是"记录满足规则条件后自动派单、或人工指派"的处理事项，三条量共用同一时间窗（按待办**创建时间**筛选），可直接互相印证：
- `todo_open_count` 未完成数 —— 含已逾期、未到期、以及**根本没设期限**的。
- `todo_overdue_open_count` 已逾期未完成数 —— **没设期限的待办永远不算逾期**，所以它只是未完成数的一个子集，不能当"未完成里有多少没办好"的全貌。
- `todo_on_time_completion_ratio` 按期完成占比 —— **分母只含"设了期限的已完成待办"**，没设期限的分子分母都不进。实际使用中相当比例的待办不设期限，所以这个比例回答的是"有期限要求的事项里按时办结的占多少"，不是"所有待办完成了多少"；分母很小时要结合 `todo_open_count` 的绝对量一起说。

维度：`form` / `project` / `qrcode` / `operator_source`（派单方式）/ `priority` / `trigger_type` / `month` / `day`。
`priority` 分组的组名是数值，含义：**100 紧急 / 50 普通 / 20 低 / 0 未设置**。
`operator_source` 取值：`rule_assigned` 规则自动派、`assigned` 人工指派、`claimed` 认领、`pending_dispatch` 待派单、空串未定。
组织没启用待办时，`list_metrics` 不会列出这三条量，`notes` 会说明"这个组织还没有待办数据"——这时如实告诉用户，不要拿别的量凑。

**⑦ 扫码量：码被扫了多少次、多少人扫、从哪扫的**
`query_metrics{metric:"scan_count", time}` 给扫码次数，`scan_visitor_count` 给去重人数。维度另有一套，共 12 个：
- 时间：`day` / `week` / `month` / `quarter` / `year`
- 地域：`province`（已归一到 34 省 + 海外 + 未知）/ `city`（`group_key` 是「省份/城市」复合键如 `黑龙江省/齐齐哈尔市`，`group_label` 是人话——城市重名跨省真实存在，只用市名会把两地并成一行）
- 终端与来源：`scan_source`（扫码渠道）/ `os` / `brand`
- 其他：`hour`（**一天中的哪个小时**，0-23 的分布，不是窗口内逐小时趋势）/ `qrcode`
**分区不能当分组维度**——底层看板不按分区拆扫码量。要比较分区就分别用 `scope:{project_ids:[…]}` 查几次。
可以在同一时间窗对照扫码次数和记录提交量，但二者不是一一对应的事件。比值只能作为趋势参考，不能把差值解释为“扫了没填的人数”，也不能直接当作精确转化率。

⚠️ **两族按码分组的 `group_key` 不是同一套**，对照时必须先对齐：扫码族给的是 **coding**（如 `q2P8dlH`），记录族给的是 **qrcode_id**（如 `400369812`）。
- **不要靠 `group_label`（码名）配对**——同名码多份是草料常态，靠名字会配错。
- 正确做法：用 `list_metrics` 返回的 `catalog.qrcodes[]`（每项同时有 `qrcode_id` 与 `coding`）或 `qrcodes_list`（返回 `{name,id,coding}`）建立映射，再按 id 对上。
- 码多时先各自取 TOP N，只对交集里的码比较扫码与提交量，并说明这是 TOP N 而非全量。
四个必须记住的差异：
1. **扫码 ≠ 提交**。同一个人反复扫算多次，扫了没填也算。回答「多少人做了检查」要用记录侧的量，不要拿扫码人数顶替。
2. **没有 `drill_down`**。一次扫码可能什么都没提交，没有对应的记录集可下钻——为 null 是正确行为。
3. **不支持双维交叉**，`scope` 支持 `project_ids`，个人授权可限定 `qrcode_ids`。高级成员按当前授权编码一次聚合，超过500个码要缩小范围，不能分批相加人数。传表单/字段/处理进度这些**记录的属性**会明确报错，不会被静默忽略。
4. **人数不可加**。各天/各省的扫码人数相加得不到总人数（同一个人会被重复计），总数要单独查一次不带 `group_by` 的。按 `hour` 分组时底层没有按小时的人数，`scan_visitor_count` 会全部返回 0——看小时分布用 `scan_count`。
其他口径：`scan_source` 是微信场景值收敛的八个业务桶（扫一扫 / 长按识别 / 相册识别 / 好友分享 / 群聊分享 / 微信收藏 / H5扫描 / 其他），其中「H5扫描」是浏览器直接打开、没有微信场景值的那部分，这部分没有 open_id，**计入次数但不计入人数**。`province` 已归一到 34 省 + 海外 + 未知。时间窗按**北京整日**对齐，半天的窗口会被撑成整天。
高级成员在服务已接入时会看到这两条查询能力，具体可见码集可以为零；不通过组织级探针判断其他人的扫码活动。其他身份仍使用既有适用性探针。未配置、无数据和探针失败含义不同，检查 `notes`，不能把失败解释为组织没扫过码。

组织自定义口径（`source=org_metric`）不支持双维交叉，且比例的分子/分母字段暂缺——这是平台已知分期，不是数据错。

## 必须遵守

1. **数据能拿到就不许估算。** 每个数字来自工具精确返回。`record_list` 的 `truncated=true` 时 `rows` 只是样本，**禁止**用样本比例外推整体（"200 条里 30% 异常，估计全量 900 条"这类一律不做）；要占比用 `query_metrics`；分组结果也可能截断，检查 notes 和返回限制，不能用不完整分组计算总体比例。
2. **用名字不用编号。** 表单名、字段名、选项值是用户写的，直接用它们和用户对话；查询时才换成 id。
3. **口径先说清。** 比例类回答带分子、分母、时间范围；`get_metric.limitations` 里的陷阱要转述（如"还没到期的任务计在分母里，时间窗越靠近当下比例越低"）。
4. **读 `notes`。** 截断、口径、名字解析失败（label 回落为 id，表单可能已删除）都在里面。
5. **拿不到精确统计就说不知道。** 某维度不支持时如实说"暂不支持精确分布"，不编数。


## 输出

先给结论和关键数字，再给分组表；注明时间范围、口径和查询时间。比例带分子和分母；默认不展示手机号与定位。分页列表与统计分别使用对应工具，不以抽样代替统计。按单个计划查周期窗口时转到 [表单与周期](forms-and-cycles.md)，调用错误看 [错误处理](errors.md)。

建码选已有模板请用 templates_list_editable（默认摘要，选定后再 templates_get_schema），不要把 project_id 传给 templates_list；参见 [完整入参示例](tool-arguments.md)。

## 摘要返回与连接分组

以下适用于 schema 已包含对应参数的服务；旧环境按实际工具定义调用。

- auth_get_context 默认返回组织、scopes 和 capability_groups 计数；诊断指定操作传 operations，完整能力清单传 request={"detail":"full"}。能力计数表示业务授权，不保证当前分组启用了这些工具。
- list_metrics 默认保留指标名称、描述、格式及来源；详细维度与限制通过 get_metric 或 detail="full" 查询。目录默认每类20条，仍需检查 truncated/degraded。
- record_list 默认20条，每条最多展示3个业务字段，长字段值和评语保留前80字符并标记省略；fields_total、fields_truncated、value_truncated 表达摘要情况。单条完整内容用 record_get，批量完整字段可传 detail="full"。total=null、truncated、truncation_reason 均保留，不能用摘要推断无数据。
- query_metrics 默认把分组共有条件放到 data.drill_down_base。下钻前分别合并 filters 和 time：先取 base 对应对象，再用该组 drill_down 同名键覆盖。即便组 drill_down={}，也要应用 base。没有 base 时沿用原样传递；detail="full" 返回旧完整下钻条件。下文“原样传递”均指恢复后的完整条件。统计值和时间口径不变。

默认 /mcp 保持全部原有工具。可在既有连接 URL 后添加 ?tools=query、?tools=create 或 ?tools=query,create；还支持 browse/gallery/edit/labels。只读连接使用 ?read_only=true，或与分组组合 ?tools=query&read_only=true。客户端需在每次 MCP 请求保留该查询串；修改连接不会授予额外 OAuth/API 权限。分组是客户端选用的工具发现与调用限制，不能替代服务端 scopes。业务权限仍由原授权和资源权限决定。

## 读取表单记录的后续动态

用户问“这条报修后来谁跟进、处理到哪一步”时，先用 record_list 定位具体填写记录，有歧义再让用户确认。工具针对一条记录，不接收表单 form_id 或二维码 ID。用 record_get 了解原始内容，按需调用 record_activities_list；无需重复查完整表单或组织。

```json
{"request":{"record_id":"12","page":1,"page_size":20}}
```

示例 ID 须替换为查询所得真实记录 ID。也可传 `record_url` 替代 `record_id`。page 默认1、最大1000；page_size 默认20、最大50。结果在 data 中，包含 record_id、access、items、page。动态按 ID 从早到晚排列；page.has_more=true 时继续下一页，未读完须明确说明。

- access=full 且 total=0 才表示当前可见范围没有动态；access=denied、total=null 表示不可查看。权限或上游错误不当成空列表。
- items 包含活动类型、时间（秒）、操作人展示名和文本/媒体；进度动态可有 progress.before/after，关联填表或回复仅返回引用。关联对象原文必须单独鉴权，不能从引用推断其内容。
- 本接口只返回正常且已通过审核或无需审核的动态；附件保留现有访问规则。提醒人、定位和内部操作参数不输出，不能声称返回网页所有字段。未知活动类型保留为 other，不自行猜测。
- 阅读不标记已读，不添加评论、不修改处理进度、不发送提醒。当前工具不支持全组织动态检索或实时订阅。
- 先检查当前连接是否提供此工具。旧环境未部署时如实说明暂不支持；不能把 record_get 当前状态冒充完整后续动态。

### 套餐与额度

`usage_get` 返回当前连接实际采用的套餐和额度；按组织主账号套餐计量，同一组织的 MCP、REST、OAuth 与 API key 共享，网页操作不计入。套餐查询暂时不可用时服务优先沿用缓存，再回退免费档；发现与用户套餐不符时说明需要排查套餐查询，不直接断言账号已降级。`enforced=false` 表示未强制执行，不能据此承诺无限额度。
