# 答题计分与成绩查询

用于培训自测、知识检查等单选/判断测验。先确认当前连接的 forms_create 字段支持 scoring，record_get 支持 include_quiz；旧环境不支持时说明需要服务升级，不反复重试，也不换成外部答题页。

## 新建测验

1. 整理题目、选项、正确选项及每题分值。缺少标准答案时向用户确认，不能把 AI 推测直接设为评分标准。判断题用“正确”“错误”两个选项。
2. 调用 forms_create。仅 radio 支持 scoring，correct_option 精确匹配 options 的选项文本，points 为 1～100 整数。建议必答题 required=true；手机、姓名等身份项按用户需要另加普通字段，不默认收集。
3. 结果 succeeded 后保留 form_id、field_mapping。用 qrcodes_create 的 forms 绑定填写入口；培训材料可与此表单一起放入新展示码。新模板也可绑定该 form_id，子码沿用模板表单。
4. 原生页面自动判分，提交成功页展示本次得分，通过“查看答案和得分”按钮查看本次作答对错与正确选项。不要承诺自定义逐题解析文本、主观题、多选评分或考试防作弊。

```json
{"request":{"idempotency_key":"training-quiz-1","name":"消防培训测验","fields":[{"field_id":"q1","name":"发现火灾应先报警，对吗？","type":"radio","required":true,"options":["正确","错误"],"scoring":{"correct_option":"正确","points":10}}]}}
```

示例幂等键换成本次稳定键。partial_success / QUIZ_SAVE_UNCONFIRMED 表示表单已创建但计分/成功页配置未确认，保留已有 ID 和原幂等键，核对已建表单，不换键重建。本流程仅新建，不修改已有表单。

## 查询每次作答结果

先用 record_list 按真实表单 ID、码及用户指定时间范围查询记录，筛选语法遵循当前工具 schema；再对目标记录调用：

```json
{"record_id":"实际记录ID","include_quiz":true}
```

这是 record_get 的顶层参数，没有 request 包裹；默认 JSON，不能同时使用 markdown。既有记录详情 data 中增加 quiz：

- status=available：score 为本次原生总分；questions 返回 field_id、title、answer、correct_answer、points、score、is_correct。
- 0 是有效成绩；null 表示缺失或不可查看，不能说成零分。未答题 is_correct=null。
- status=incomplete：部分题目受限或成绩信息缺失。隐藏、脱敏及不可导出的题目不回显，总分为 null；不要自行补全答案或重算总分。
- status=not_quiz：当前详情没有可识别的原生计分题，不代表已完成或满分。

只展示当前凭证可读的结果，权限不足时按错误说明处理，不切换组织凭证绕过权限。新建需要 templates.write 和项目管理权限；查询沿用 records.read 与当前资源权限。

同一个人多次提交有多条记录。仅在完整读取明确范围、身份字段可读且匹配可靠时，才可在本地汇总次数和最高分，并注明范围；分页/截断/权限受限时不能称全员排行。没有新的按手机号分组求最高分服务端指标。
