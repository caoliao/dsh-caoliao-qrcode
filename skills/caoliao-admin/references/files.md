# 图片与文件上传

## 工具速查

### 场景工具

| 工具 | 关键参数 | 返回与注意事项 |
|---|---|---|
| `assets_request_upload` | `file_name,mime_type,size,idempotency_key` | `file_key`、状态、有效期、PUT 地址与请求头、`next_action`；申请不代表已上传 |
| `assets_get_upload` | `file_key` | `uploading/temporary_available/failed/expired`；仅 temporary_available 可引用，返回 `value_for_media_field` |

## MCP 上传流程

上传工具的 description、input/output schema 与 next_action 已包含操作要求。客户端需具备本地文件读取与 HTTP/命令执行能力；远程 MCP 本身不能读取用户电脑上的路径。完整的 request 包裹见 [入参示例](tool-arguments.md)。

1. 本地读取文件名、实际字节数、MIME，调用 assets_request_upload；每个文件保留固定 idempotency_key 和返回 file_key。
2. state=uploading 时，按 upload.method=PUT 向 upload.url 发送本地文件的原始字节，原样使用全部 upload.headers。Content-Length 必须是文件字节数，Content-Type 与申请一致。不要 multipart、base64 或拼 policy/signature/callback；不要给存储请求加 OAuth/API token。URL 已包含临时凭证，不拆分、解码或重签名。
3. 优先使用下述随包脚本，程序读取原始 JSON 后直接传递 URL。优先复用已有 Node 或 Python；均不可用时使用客户端 HTTP 能力；不要把带签名 URL 内联进 shell 命令，不手抄、不重新编码或整理查询参数。不得自动跟随重定向。
4. 无论发送成功、失败还是断线未知，都按 next_action.after_upload 用原 file_key 调 assets_get_upload。HTTP 200 或 bytes_sent_pending_verification 不能代替服务端可用状态。
5. 仅 temporary_available 时，把 value_for_media_field（如 [{"file_key":"free/实际路径.jpg"}]）放进真实模板图片/文件 field_id。新建独立图片或文件码时，使用 qrcodes_create 的 image/gallery/file 组件（以当前 schema 为准），直接引用 file_key。模板批量建码先预校验再建码；保存时复用原链路转永久，最终永久 key/地址以建码读回为准。

申请上传时保留原文件名，包括扩展名；建码引用无需额外填写 name 或 file_name。读回附件时核对文件名与原文件是否一致；用户反馈编辑器或扫码页显示空白/未命名时，保留码链接和文件引用用于排查，不据此自动重传或重复建码。

## 状态、归属与重试

- 申请已返回 temporary_available 时，直接引用，不再次传字节。
- uploading：已发送则按 poll_after_seconds 查询；结果未知先查，不盲目重传或换幂等键。
- failed：按 error_code 处理；expired：需要新的上传批次。上传凭证期限与临时资源期限不同，查询与预校验均不续期。
- 同组织、同操作者才可查询和使用；file_key 不是授权凭证，不可引用任意历史 key 或自行拼接 rsrc 永久路径。
- 客户端没有本地发送能力时如实说明该环节不可执行，保留已完成准备；不能让用户导出 OAuth token 补齐。

## 随包上传脚本

使用 [scripts/upload_file.py](../scripts/upload_file.py)，Python 3.10+，仅标准库，无额外依赖。支持 UTF-8/BOM JSON，输入必须是 assets_request_upload 的原始 ticket 或 data 包裹，包含 file_key、state、upload_expires_at 和 upload。它只传文件，不调用 API、不读取 OAuth token、不重试，不转永久。

通过客户端文件工具把工具结果原样保存为当前任务私有临时文件 `upload-ticket.json`，再从 skill 目录执行：

```text
python scripts/upload_file.py --file "本地照片路径.jpg" --descriptor "upload-ticket.json"
```

也可由客户端进程 API 直接将 JSON 字节送入 `--descriptor-stdin`。不要用 shell 的 echo 或字符串插值内联凭证；如果客户端支持保存原始工具结果，优先使用，避免模型重新抄写 URL。脚本无法恢复输入前已经被改坏的签名。

脚本核对实际文件大小、签名请求头和到期时间，通过 HTTP 库原样发送 PUT。输出只含 file_key、状态和错误码，不回显签名 URL。`bytes_sent_pending_verification` 仅代表传输成功；`upload_outcome_unknown` 也需先用原 file_key 调 assets_get_upload，不立即申请新凭证或重传。若输入已是 temporary_available，跳过发送。

临时 JSON 含短期凭证，不放进仓库、共享文件夹或反馈材料；本次发送结束后删除该临时文件。查询状态所需的 file_key 单独保留。脚本不会删除输入文件，也不会因为失败而重新申请上传。

多文件的关联与有限并发见 [本地数据准备](local-preparation.md)。

对用户输出来源 item_key、file_key、状态和业务错误即可。更多失败情形见 [错误处理](errors.md)。

## Node 上传与多文件清单

已有 Node 18+ 时，优先使用 [upload_file.cjs](../scripts/upload_file.cjs)，无需安装依赖或另写上传脚本。与 transfer.cjs 保持同目录。输入 ticket、签名保护及状态查询要求与 Python 版一致。

```text
node scripts/upload_file.cjs --file "照片.jpg" --descriptor "upload-ticket.json"
node scripts/upload_file.cjs --manifest "uploads.json"
```

uploads.json 是数组，路径相对于清单文件所在目录：

```json
[{"item_key":"IT-001","file":"资料/IT-001.jpg","descriptor":"私有临时目录/IT-001-ticket.json"}]
```

先逐文件申请并保存原始凭证，再执行清单（最多100项、同时最多4次 PUT）。输出 items 按输入顺序保留 item_key、file_key、传输状态及 elapsed_ms，不包含凭证。逐项用原 file_key 查询可用状态，再映射到业务行；部分失败不能重跑整个清单，不给成功项换键重传。脚本不自动重试、不跟随跳转，不绕过 TLS 校验。
