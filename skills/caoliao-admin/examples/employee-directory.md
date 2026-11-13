# 员工通讯录 → 批量档案码

适用：用户给出已授权的通讯录和照片目录，希望每人一个档案码。先读 [建码](../references/create-qrcodes.md)；有照片附件再读 [上传](../references/files.md)。

1. 从表格提取工号、姓名、部门和对应文件，以非敏感 item_key 关联来源行。工号用文本；按 [本地数据准备](../references/local-preparation.md) 记录照片匹配依据，只确认歧义项，不凭同部门/同名自动配照片。
2. qrcodes_list_create_targets 选分区/目录；查询可复用模板及 schema。如果需要新模板，以下为 templates_create 的 MCP 入参形状（替换本轮标记及目标）：

```json
{"request":{"idempotency_key":"RUN-directory-template","name":"员工档案","project_id":0,"groups":[{"group_id":"employee","name":"基本信息","fields":[{"field_id":"number","name":"工号","type":"text","required":true,"variable":true},{"field_id":"name","name":"姓名","type":"text","required":true,"variable":true},{"field_id":"photo","name":"照片","type":"image","variable":true}]}]}}
```

3. 保存返回 template_id、template_version、field_mapping。用 MCP 申请照片上传，本地发送字节，再查到 temporary_available。
4. 使用随包 prepare_batch.py 将 number/name/photo 经 field_mapping 批量换成真实字段 ID，并可按前缀生成 name；不要逐条重抄 values。下面展示转换后 qrcodes_prevalidate 的形状（占位符必须替换）：

```json
{"request":{"template_id":"ACTUAL_TEMPLATE_ID","template_version":"ACTUAL_VERSION","items":[{"item_key":"row-001","name":"员工-0001","values":{"NUMBER_FIELD_ID":"0001","NAME_FIELD_ID":"测试甲","PHOTO_FIELD_ID":[{"file_key":"free/ACTUAL_FILE_KEY.jpg"}]}}]}}
```

5. valid:true 且返回 plan_id 后，仅以 plan_id 和本批 idempotency_key 调 qrcodes_create_batch（旧环境无 plan_id 时沿用完整数据）；大于100行拆批，各批保存请求和任务。
6. 查询整体任务，再分页查询逐项结果。最终按来源行输出姓名/工号（任务需要时）、扫码链接和成功/待就绪/未确认状态。不能因为整体任务成功就把所有照片写成已保存。
