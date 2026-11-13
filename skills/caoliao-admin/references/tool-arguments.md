# 工具选择与完整入参

先看当前连接的 inputSchema。速查表通常只列业务字段，不表示可以省略 request。本次保留已有契约，没有统一改成裸参，也没有新增工具。

## 找可用于建码的模板

调用 `templates_list_editable` 获取名称、母码 ID、分区/目录、coding、web_url 摘要，不会修改模板，也不会加载每个模板的表单与组件。摘要不保证模板可创建子码。

```json
{"request":{"project_id":0,"page":1,"page_size":20}}
```

选定模板后调用 `templates_get_schema` 获取字段、版本和能力，确认 `capabilities.create_children` 后再建码。不要为每个列表项自动读取详情；仅明确需要逐项严格筛选时使用 `only_creatable=true`，此模式较慢。

```json
{"request":{"template_id":"ACTUAL_TEMPLATE_ID"}}
```

`templates_list` 是旧的模板浏览入口，使用其 schema 中的时间、分页字段，不接受 project_id；不要因名字更短就用于上述建码流程。旧查询参数仍按该工具 schema，不照搬建码工具的 request 包裹。

`templates_list` 也只返回摘要，详情用 `templates_get`。普通成员 `total=null` 表示未计算总数；空页仍检查 `next_page_token`，有游标就可继续翻页。`templates_list_editable` 则使用 `has_more` 和 `page` 分页。

## 跳转码、聚合码与静态码

```json
{"request":{"idempotency_key":"RUN-jump-website","name":"官网","url":"https://www.example.com/","project_id":0,"category_id":0}}
```

```json
{"request":{"idempotency_key":"RUN-multi-links","name":"常用链接","links":[{"title":"官网","url":"https://www.example.com/"},{"title":"帮助中心","url":"https://help.example.com/"}]}}
```

```json
{"request":{"idempotency_key":"RUN-static-wifi-note","type":"text","content":"访客 Wi-Fi：Guest，密码见前台"}}
```

`qrcodes_create_url_jump`、`qrcodes_create_multi_url` 的项目与目录先按 qrcodes_list_create_targets 查询；`static_qrcodes_create` 没有项目/目录参数，type 只能是 text 或 url。示例中的名称、网址、内容和幂等键都要替换为本轮真实值。

## 上传申请与查询

调用 `assets_request_upload`，size 替换为本地实际字节数，幂等键按本轮文件固定：

```json
{"request":{"file_name":"IT-001.jpg","mime_type":"image/jpeg","size":12345,"idempotency_key":"RUN-photo-IT-001"}}
```

调用 `assets_get_upload`：

```json
{"request":{"file_key":"free/ACTUAL_FILE_KEY.jpg"}}
```

## 官方模板准备与执行

先通过 gallery_get 获取实际字段 ID。以下 `ACTUAL_*` 必须替换成真实响应值，不能直接执行。

调用 `gallery_prepare_creation`：

```json
{"request":{"gallery_template_id":"ACTUAL_GALLERY_ID","project_id":0,"category_id":0,"items":[{"item_key":"device-001","name":"一号设备","values":{"ACTUAL_FIELD_ID":"IT-001"}}]}}
```

仅当返回 `data.valid=true` 且有 `data.plan_id`，再调用 `gallery_create_from_plan`：

```json
{"request":{"plan_id":"ACTUAL_PLAN_ID","idempotency_key":"RUN-gallery-devices-001"}}
```

准备阶段不创建业务资源；执行会自动安装模板并提交子码任务。返回 task_id 后继续查询任务及逐项结果。执行失败保留原 plan_id 和幂等键，结果未知不换方案重装。

收到参数校验失败时，按错误路径与工具 schema 修正结构；不要试探不同包裹层、添加 org_id 或换用另一套业务接口。创建工具的完整示例见 [员工通讯录](../examples/employee-directory.md) 和 [设备巡检](../examples/equipment-inspection.md)。

## 修改 AI 创建的内容

先读状态，用返回的 version 提交；省略的字段保持原值。

qrcodes_edit，保留一个已有组件并新增一段文字：

```json
{"request":{"qrcode_id":"ACTUAL_ID","version":"ACTUAL_VERSION","idempotency_key":"RUN-edit-001","name":"新名称","components":[{"type":"rich_text","blocks":[{"type":"paragraph","text":"新说明"}]},{"type":"keep","ref":"c_123"}]}}
```

qrcode_children_edit，只改一个字段：

```json
{"request":{"qrcode_id":"ACTUAL_CHILD_ID","version":"ACTUAL_VERSION","idempotency_key":"RUN-edit-002","values":{"ACTUAL_FIELD_ID":"新值"}}}
```

forms_edit，已有字段用 forms_get_edit_state 返回的 field_id，新字段用新的 key：

```json
{"request":{"form_id":"ACTUAL_FORM_ID","version":"ACTUAL_VERSION","idempotency_key":"RUN-edit-003","fields":[{"field_id":"ACTUAL_FIELD_ID","name":"备注","type":"text","required":true},{"field_id":"new_note","name":"补充说明","type":"textarea"}]}}
```

## 已有模板批量方案提交

qrcodes_prevalidate 成功返回 plan_id 后，调用 qrcodes_create_batch：

```json
{"request":{"plan_id":"batch_plan_ACTUAL_32_HEX_ID","idempotency_key":"RUN-batch-001"}}
```

替换为实际方案编号和本批固定幂等键；不要附带 items、template_id、template_version 或 category_id 覆盖方案。MCP 默认保存方案，可显式 save_plan=false 使用旧完整数据流程。方案过期且结果未知时先查原任务，不自动另建。

## 后续动态（只读）

`record_activities_list`：`{"request":{"record_id":"12","page":1,"page_size":20}}`。ID 换为真实填写记录 ID；也可用 record_url，二选一。返回及权限见[查询与分析](query-and-analysis.md#读取表单记录的后续动态)。
