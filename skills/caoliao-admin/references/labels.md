# 标签预览与下载

用于把已经创建的普通活码或同一母模板的子码制作成可打印标签。先确认当前 MCP 已提供下列工具；代码中的工具说明不代表连接环境已经部署。

## 直接下载官方码图或简单打印

用户只要二维码图片时，优先取普通码、跳转/聚合码的成功创建响应或批量逐项成功结果中的 qrcode_image_url；静态码已有同名字段。该字段可为空、地址可能过期，不能据此判断建码失败。旧环境或旧回执缺少地址时，仅对需要下载的活码用 qrcode_get 获取 qrcode_url；仍不可用就保留成功码链接说明限制，不重复建码。静态码保留原 content 供后续恢复，不把静态码 ID 传给活码查询。

把图片地址保存到本地私有清单，不内联到 shell、不附加 OAuth token。使用已有 Node 18+：

```json
[{"item_key":"IT-001","name":"IT-001 笔记本","qrcode_image_url":"实际响应中的 HTTPS 图片地址"}]
```

```text
node scripts/download_qrcodes.cjs --manifest images.json --output downloaded-codes
node scripts/download_qrcodes.cjs --manifest images.json --output print-codes --print a4
```

[下载脚本](../scripts/download_qrcodes.cjs)最多4路并发，输出目录必须不存在；按输入顺序保存编号 PNG 和 results.json 对照清单，保留失败项，不重新编码二维码。最多1000张；无重试或跳转。缺图时不生成打印文件。打印图片总量超过32MiB时仍保留下载结果，报告 print_images_too_large，可按已下载结果另行分批排版，不重新建码。

只有用户需要简单打印才加 --print a4：生成嵌入图片的 labels-a4.html（每页10张，104张为11页），用浏览器打开检查名称、二维码和分页，再由用户打印或另存 PDF。这是本地固定排版 HTML，不是草料原生标签或已生成的 PDF；长名称会截断，需打开核对。下载完成不等于扫码内容和打印效果已验收。无需关联或保存模板标签样式。

需要已有业务标签样式、字段布局或原生 A4 PDF 时继续下面的流程。

## 工具速查

### 标签工具

| 工具 | 输入 | 用途 |
|---|---|---|
| `labels_get_config` | request.qrcode_id | 读取当前标签样式、尺寸、字段和支持格式、数量限制 |
| `labels_preview` | request.qrcode_ids | 用少量真实码生成标签预览，最多3个且遵守目标类型限制 |
| `label_exports_create` | request.qrcode_ids、format、idempotency_key | 按明确目标创建标签下载任务；格式为 png_zip、a4_pdf 或 a4_pdf_single，以配置返回的支持范围为准 |
| `label_exports_get` | request.task_id | 查询导出结果，取得文件链接或失败原因 |

MCP 参数使用 `{"request": {...}}`，成功数据在 `data` 中。配置与预览需要 templates.read（或 templates.write）；导出创建和查询需要 qrcodes.write。API key 沿用组织凭证规则，资源权限仍由服务端检查。标签按当前码读取权限及实际绑定字段判断，不因高级成员身份统一拒绝。只读成员可预览或导出不含受限字段的标签；原生标签会输出字段原文，绑定了当前不可看原文的字段时返回 LABEL_FIELD_PERMISSION_DENIED。导出回执会复查提交时字段映射和当前权限；拒绝后不能换组织凭证绕过。

三种格式均沿用原生 ZIP 打包下载：png_zip 包内是标签图片；a4_pdf 是多标签 A4 排版；a4_pdf_single 是 A4 每页一个标签，多个码按页输出。不要把 ZIP 链接误当成直接 PDF，也不要把“单张”理解为只允许导出一个码。

用户要求“单张 A4 PDF”时，先确认 supported_formats 包含 a4_pdf_single；缺少则说明当前样式或环境未支持，不自动改成多标签排版。该格式的 format_options.size 是纸张毫米尺寸，不是标签图案的占纸尺寸；labels_preview 预览标签内容，不代表最终 A4 分页效果。

```json
{"request":{"qrcode_ids":["实际成功码ID"],"format":"a4_pdf_single","idempotency_key":"label-single-a4-001"}}
```

取得 task_id 后用 label_exports_get 查询；更换格式属于新导出，使用新幂等键，超时重试则保持原键和原参数。

## 建码后下载标签

1. 从建码逐项结果中取得内容已就绪的真实码 ID，保留输入条目与码的对应关系；存在未完成项时明确本次选中的成功集合。
2. 用 labels_get_config 读取当前样式和限制，按 format_options 区分图片像素尺寸与 PDF 毫米尺寸，不把像素当成打印毫米数。普通活码每次一个；子码同一次请求必须属于同一母模板，最多100个。缺少关联样式按服务端提示处理，不隐式保存默认样式。
3. 用 labels_preview 预览少量真实目标，展示编号、名称及二维码，检查是否符合用户要求。预览会生成文件，但不修改码或母模板样式。
4. 使用唯一、非空的 qrcode_ids 创建下载任务，不传空集合表示全部，不把母模板 ID 当成待下载子码 ID。用户已要求下载且格式、范围明确时直接执行；有歧义时再确认。
5. 保存 task_id、原请求及幂等键，调用 label_exports_get 查询。无真实百分比时不估算进度；任务未知时不换键重提。不要无限轮询。
6. 向用户提供成功文件链接、格式、数量及服务端可确认的有效期。未知、过期、失败和部分内容分别说明；只有可证明全部目标成功时才能说全部完成。下载文件的可打印效果仍需实际打开检查。

只沿用当前样式，不支持自由设计、覆盖字段映射、修改共享样式、打印机直连或印刷下单。新文件不会替换已有二维码内容。已下载的文件和已发出的有效链接不能因后来撤权而自动收回。

## 样式缺失与地址失效

LABEL_STYLE_NOT_CONFIGURED 表示模板未配置可用标签样式。请用户在草料后台为模板配置并保存样式，再重新读取配置；不隐式修改共享样式，不反复请求生成。

下载得到的 qrcode_image_url 是临时签名地址，应及时保存本地文件；长期展示保留 web_url。地址失效不表示码失效：批量任务回执仍有效时重新查 qrcode_tasks_get_results；活码也可按上面的 qrcode_get 路径获取码图。不要通过换幂等键重新建码来刷新地址，不承诺具体过期秒数。
