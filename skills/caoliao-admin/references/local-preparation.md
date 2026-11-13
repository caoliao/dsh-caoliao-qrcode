# 批量数据与照片匹配

这些是客户端本地操作，不调用业务接口。Python 脚本使用标准库，要求 Python 3.10+；有 uv 时可用已有本地虚拟环境，不需安装依赖。没有 Python 时由客户端用等价本地数据处理能力完成。

## 照片对应关系

先建立本地清单：`item_key、资产编号/工号、文件相对路径、匹配依据、状态`，再申请上传。

- 表格明确给出的照片文件名或备注中的明确指定，优先使用；编号应采用完整编号精确匹配（IT-001 不匹配 IT-0010），避免模糊子串匹配。
- 编号与明确指定名指向不同文件，或同一编号对应多个候选时，标记冲突，只询问相关条目。不要按优先级静默覆盖矛盾证据。
- 型号、姓名可以帮助找候选，但不能仅凭同部门、同保管人认定照片属于该资产。候选依据不足就保留待确认，不猜测。
- 同一照片被多条记录引用时列出复用项；用户明确要共用时允许，否则先确认。找不到照片时区分“可选字段缺失”和“必填字段缺失”，不要自动换一张。
- 只处理已确定的文件；若有未解决条目，不静默把全批改为部分导入，按用户授权范围执行并报告未处理项。

例如 IT-002 笔记本与 XZ-006 椅子同部门同保管人，保管人不能用于两张照片的唯一匹配。确认后以 item_key 关联 file_key，避免异步上传完成顺序改变对应关系。

## 字段映射与名称一次性生成

模板创建前即可用客户端字段 key 准备所有 rows。创建后保存原始响应，使用随包 [prepare_batch.py](../scripts/prepare_batch.py) 一次性转换为真实 ID，无需逐条重写 values。脚本不猜字段、不申请上传、不提交建码。

`rows.json` 为 UTF-8 JSON 数组，编号保持文本；媒体值来自已查询到 temporary_available 的 value_for_media_field：

```json
[{"item_key":"row-001","values":{"asset_no":"IT-001","photo":[{"file_key":"free/ACTUAL_FILE_KEY.jpg"}]}}]
```

`template.json` 保存 templates_create 返回的 data（也接受外层 data 包裹），包含 template_id、template_version、field_mapping。仅在创建完全成功后继续。已有模板需从 templates_get_schema 建立明确的“本地列 key → 真实 field_id”映射，放进本地快照的 field_mapping，不能靠同名猜测。

从 skill 目录执行（路径按实际位置替换）：

```text
python scripts/prepare_batch.py --template template.json --rows rows.json --name-field asset_no --name-prefix "WB资产体验-" --output prevalidate.json
```

输出已经是 qrcodes_prevalidate 的完整 `{"request":{...}}` 参数。一次最多100条，更多数据先在本地拆批；输出文件必须未存在，避免覆盖已校验请求。显式目标目录可加 `--category-id`。脚本检查缺失映射、重复 item_key、重复目标字段、名称长度和请求大小；字段类型、必填与权限仍以 MCP 预校验为准。

名称有三种用法：

- 本批统一前缀：用上述 `--name-field` 与 `--name-prefix`，自动生成每条 item.name。
- 逐项已有名称：rows 内提供 name，不传上述选项；脚本不会覆盖名称。
- 使用模板命名规则：不提供 name 和命名选项，输出空 name，让现有模板规则生效。新建模板原本就支持 `name_rule:[{"type":"text","value":"WB资产体验-"},{"type":"cmpId","value":"asset_no"}]`，其中 asset_no 是本次创建的可变文本字段 key；NC 保存时转换 ID。只在用户希望此模板后续子码也使用该规则时配置；一次导入的前缀使用本批名称即可，不为此修改已有模板。

脚本保留字段值的类型及内容，不从本地文件路径自动构造媒体值。预校验 valid:true 后，使用同一 request 加本批固定 idempotency_key 提交，不能重新让模型抄写整批数据。

## 多文件执行

每个文件单独申请上传是当前工具契约。申请与查询按客户端能力执行，不假造批量接口；每个文件保留自己的 item_key、幂等键、凭证及状态。凭证准备后可用 upload_file.cjs 清单模式最多4路并发发送字节，见文件上传说明。发送后仍逐个用 MCP 查状态，不能按结束顺序将照片回填到行。

本轮组织、目标和模板版本未变化时，复用已获得的目标及 schema；权限拒绝或版本变化才刷新。轮询遵守 poll_after_seconds。排查耗时时分别记录资料整理、上传、建码等待、核验、下载的实际起止时间及调用次数，不把客户端推理耗时归因于接口，也不预估提速比例。
