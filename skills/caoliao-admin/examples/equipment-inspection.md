# 设备检查表 → 模板子码 → 周期完成情况

先读 [表单与周期](../references/forms-and-cycles.md) 和 [建码](../references/create-qrcodes.md)。用户授权范围包含新建检查表、设备模板和本次设备码。

1. 选择项目，说明计划为每天08:00–18:00。调用 forms_create，替换 RUN 与 project_id：

```json
{"request":{"idempotency_key":"RUN-inspection-form","project_id":0,"name":"设备日检","fields":[{"field_id":"result","name":"检查结果","type":"radio","required":true,"options":["正常","异常"]},{"field_id":"note","name":"说明","type":"textarea"}],"cycle":{"frequency":"day","windows":[{"start":{"time":"08:00"},"end":{"time":"18:00"}}]}}}
```

2. 检查 status=succeeded，保存真实 form_id、field_mapping 和 cycle.plan_id。部分成功时停止后续创建并保留资源，先核对错误。
3. 创建含设备编号可变字段的新模板，forms 引用上一步表单（替换占位符）：

```json
{"request":{"idempotency_key":"RUN-equipment-template","name":"设备巡检","project_id":0,"groups":[{"group_id":"equipment","name":"设备信息","fields":[{"field_id":"number","name":"设备编号","type":"text","required":true,"variable":true}]}],"forms":[{"form_id":"ACTUAL_FORM_ID","title":"填写日检表"}]}}
```

4. 模板创建确认后，按照真实 field_mapping 准备设备数据，预校验并批量建子码。子码直接继承模板周期，无需再次创建表单或提交周期配置。
5. 若用户只需一个独立点位，可改用 qrcodes_create，输入名称、目标项目、forms；需要固定基础信息时用 public_value。普通码不会生成隐藏母码。
6. 保存任务及逐项结果；正常扫码填写后，以真实 plan_id、project_id 和用户指定时间范围调用 cycle_tasks_get_completion。等待原有异步实例就绪，报告实际应完成、已完成、未完成与跳过状态。不要从填写记录条数推算周期完成。

查询时段示例：start_time 为当天00:00:00，end_time 为当天23:59:59，均使用 YYYY-MM-DD HH:mm:ss；保留业务时区及范围截断说明。跨计划统计按 [查询与分析](../references/query-and-analysis.md) 选择实际指标。
