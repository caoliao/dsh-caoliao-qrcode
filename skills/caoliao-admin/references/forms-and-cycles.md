# 表单与周期任务

## 工具速查

### 场景工具

| 工具 | 关键参数 | 返回与注意事项 |
|---|---|---|
| `forms_create` | `idempotency_key,name,fields,project_id?,cycle?` | 新填写表单 ID、field_mapping、周期 plan_id；partial_success 保留原 ID，不重复创建 |
| `cycle_plans_list` | `project_id?,frequency=day,plan_scope=running,keyword?,form_id?,page=1,page_size=20` | 分页计划目录；page_size ≤50，day 含工作日计划 |
| `cycle_plans_get` | `plan_id,project_id?,plan_scope=running` | 计划名称、表单、周期配置、执行状态及本期/上期概况 |
| `cycle_tasks_get_completion` | `plan_id,start_time,end_time,project_id?,plan_scope?,period_limit=60` | 原生周期完成/未完成数量与状态；保留 range_limit 截断信息 |
| `cycle_tasks_list_qrcodes` | `plan_id,period_key,project_id?,plan_scope=running,status=all,page=1,page_size=20` | 具体码的执行情况及逐时段事实；page_size ≤100 |

## 查询已有表单与记录

先用 `forms_list` 搜索并分页定位表单，再用 `form_get` 读取字段；填写结果使用 `record_list` / `record_get`。高级成员只看到当前授权范围内的数据，批量表单逐项处理错误；记录总数未知，截断时需收窄条件。具体范围和筛选限制见[查询与分析](query-and-analysis.md#高级成员的表单与记录查询)。

## 新建填写表单

forms_create 使用 idempotency_key、name、project_id 和 fields。支持 text、textarea、number、date、radio、checkbox、image、file；required 为布尔值。radio/checkbox 必须提供不重复的非空 options 字符串列表。

培训测验使用 radio.scoring 配置正确选项与分值，提交后查看得分和答案；具体流程与成绩查询见[答题计分](quiz.md)。先核对当前字段 schema 是否支持 scoring，旧环境不伪造参数。

创建时 field_id 为客户端稳定 key；保存 form_id 和 field_mapping，后续读取、查询字段用真实 ID。调用完成后先检查 status 和 errors；只有 succeeded 才按本步成功继续。partial_success 保留原表单和幂等键，按 [错误处理](errors.md) 核对，不新建第二份。

## 配置周期

在 forms_create 提供 cycle:{frequency,windows}，windows 每项含 start/end。周期配置按原生运行状态保存，绑定目标后由原有异步流程维护实例。创建前向用户说明本次对象及周期时段。

| frequency | start/end 字段 | 示例含义 |
|---|---|---|
| day | time（HH:mm） | 每日08:00至18:00，结束晚于开始 |
| week | weekday（1周一至7周日）、time | 每周指定起止日与时间 |
| month | day（1–31）、time | 每月指定日与时间 |
| year | month、day、time | 每年指定月日与时间 |

使用业务时区的时段，实例落点以原服务生成结果为准；允许的数量和组合以实际 schema 为准。保存成功后取得 cycle.plan_id。只需普通表单时省略 cycle。

## 新码与模板绑定

以 qrcodes_create 或 templates_create 的 forms:[{form_id,title}] 引用刚创建或用户选定的现有表单。普通码可只有名称和填写按钮；模板同时需要至少一个可变基础信息字段。绑定返回也要检查 status。

服务端复用表单关联与填写按钮保存，保留表单自身规则。使用模板批量新建子码时，自动继承模板表单和周期；批量请求只提交普通建码字段，不传 forms/cycle。参见 [建码](create-qrcodes.md) 与 [设备巡检示例](../examples/equipment-inspection.md)。

## 查询完成情况

先复用用户提供、forms_create 或已有 list_metrics 目录取得的真实 plan_id。需要按名称、表单、频次查找或翻页列出计划时使用 cycle_plans_list，不为同一计划重复发现。先确定所属 project_id（省略为默认分区 0，不代表所有分区）。频次未知时先在 plan_scope=running 下遍历 day/week/month/year；day 包含工作日。每组按 pagination.has_more 翻页，按 plan_id 去重。同名计划结合表单和分区核对。

### 计划状态与任务完成状态

`request.plan_scope` 筛选计划生命周期，不是设备在本周期的检查结果：

| plan_scope | 含义 |
|---|---|
| running（默认） | 已启用且未结束；包含 active 和 not_started |
| active | 已开始且正在生效 |
| not_started | 已启用但尚未到开始时间 |
| closed | 已暂停，底层对应 pause；不是已删除 |
| finished | 计划已结束；不代表本周期检查已完成 |

用户未指定历史范围时先查 running。明确要求暂停、结束或全部计划时再扩展 closed、finished；全部生命周期使用 running/closed/finished 即可，不必重复扫描其子集 active/not_started。不要传未支持的 plan_scope=all。

`cycle_tasks_list_qrcodes.request.status` 才筛选指定周期内设备任务的完成情况：查已完成设备用 status=finished，plan_scope 仍沿用发现计划时的值，不能随之改成 finished。

### 名称搜索与空结果

keyword 是计划有效名称的字面包含匹配，计划名为空才回退表单名；不是设备名、填写内容全文搜索。keyword、form_id、frequency、plan_scope、project_id 同时传入时取交集，表单存在不代表已经配置周期计划。

例如要找“灭火器”计划，频次未知时在 running 下分别查四种频次；如果已有列表返回“灭火器检查表”，保留其真实 plan_id，直接读取详情核对。不能因为用户使用了更长的名称就否定这个候选，也不能用 closed/finished 的空结果排除 running 计划。缩短关键词后仍须覆盖目标频次和状态。

```json
{"request":{"project_id":0,"frequency":"month","plan_scope":"running","keyword":"灭火器","page":1,"page_size":50}}
```

上述例子仅查询默认分区的月度运行计划。只有实际完成相应分区、频次、状态及分页，才能声称查完该范围；请求失败或未执行的组合不能记为零条。表单反查为空时也应注明实际筛选范围，不能直接断言没有任何关联计划。

用 cycle_plans_get 查看 name、form_name、form_id、frequency、cycle_task_config 及 current_period/previous_period。后续查询沿用相同 project_id、plan_id、plan_scope；表单字段仍用 form_get。

已知 plan_id 时，用 cycle_tasks_get_completion 读取 plan、periods、range_limit。输入真实计划 ID、所属 project_id、明确 start_time/end_time（YYYY-MM-DD HH:mm:ss，业务时区），跨度最多366天；period_limit 默认60、最多120。

按原生周期返回的完成/未完成数量、应完成次数、周期状态及跳过原因回答；空 periods 不代表全完成，按钮可见也不代表周期实例已生成。range_limit.truncated=true 时，用 next_end_time 查更早范围并按 period_key 去重；游标缺失或不前进时停止并说明结果不完整。

跨计划比较、趋势或按码分组，可用 [查询与分析](query-and-analysis.md) 中的 list_metrics → get_metric → query_metrics。单计划周期概览与统计指标各自保留口径，不能把填写记录总数替代任务完成数。

## 场景：本周期哪些设备未完成巡检

1. 选择真实计划，明确用户说的“今天/本周”及业务时区，用 cycle_tasks_get_completion 查询该时间范围。
2. 从 periods 选出对应周期，复制原样 period_key；不能用日期猜测或拼接该键。跨多个周期要逐周期查询。
3. 调用 cycle_tasks_list_qrcodes，request 包含原 project_id、plan_id、plan_scope、period_key 和 status="unfinished"。按 pagination.has_more 增加 page，直到完整取回；只展示部分页时标明覆盖范围。
4. 按 code_status_detail 区分 not_started、in_progress、expired_unfinished。unfinished 包括三者，不能统一称为逾期。查已完成用 finished，查无需执行用 no_need；no_need 不能视为提交过记录，汇报时不混入已完成。
5. 保留 finished_times/required_times 及 times 中的时段、record_id、auto_rule_id、auto_reason。人工标记或规则判定完成不等于实际填写；只在有真实 record_id 时用 record_get 查对应记录。批量读填写内容继续用 record_list；不要用提交记录反推从未提交的设备集合。

需要码内容或链接时复用现有码查询工具：先用 qrcodes_list 等取得 coding，再用 qrcode_get；不能把 code_id 当 coding。默认采用原看板当前周期有效码集、历史周期历史码集的规则，不自行按当前码列表重算历史。空页、缺失周期、查询失败和异步实例延迟分别说明，不据此宣称全部完成。新工具只读，不启停或修改计划。

## 查结构与填写入口

表单摘要用 forms_list，字段详情用 form_get（单数，不是 forms_get）。当前 forms_list 不提供调用方指定的 project_id 筛选，也不包含完整字段；不传未声明参数，不把权限内摘要当字段结构。

forms_create 创建的是表单结构，独立表单没有可直接承诺的扫码填写链接。将它绑定到新建码后，向用户提供该码的 web_url 作为扫码入口；不要拼接未经验证的表单预览或填写地址。
