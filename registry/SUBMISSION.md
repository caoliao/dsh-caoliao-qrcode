# 草料二维码 · Registry 上架材料

材料版本：**2026.11.1**。

## 文件与用途

| 文件 | 用途 |
|---|---|
| registry/connectors/caoliao-qrcode.json | 待提交到上游 connectors/ 的卡片 |
| registry/assets/caoliao-qrcode.png | 待提交到上游 assets/ 的原始品牌图标 |
| PR-BODY.md | PR 正文草稿 |
| build-manifest.json | 构建版本与文件哈希，不提交 Registry |
| dsh-caoliao-qrcode-2026.11.1.tgz | 配套插件本地安装包，不提交 Registry |

## 图标

构建直接复用 plugin/logo.png，不维护第二份品牌源文件。
描述符中的 raw.githubusercontent.com 地址是图片随 PR 合并后的目标地址，当前未上传，
不能把该地址视为已上线。提交分支检查时可临时使用实际分支/commit 的 raw URL，
或请维护者在合并前安排图片托管和 assets:check；最终地址与合并位置保持一致。
本地包中已附带图片。不要为通过线上图片检查伪造成功结果。

## 版本约定

插件 package.json、Harness 随包 Skill 的版本、Registry 材料清单和输出目录统一为 2026.11.1。
Registry Schema 没有 version 字段且禁止额外字段，因此卡片不添加该字段。
共享业务 Skill 原始版本保存在 source_skill_version 用于追溯；不改变其他客户端发布版本。
schemaVersion 与 Harness 依赖版本属于协议和运行时约束，不改为产品版本。

## 提交前检查

1. 第三方 dsh-mcp-connector 的真实 OAuth 登录、刷新和只读查询报告（仅保留结果、时间、版本与脱敏摘要）。
2. 公开提交主体、维护联系人、服务条款链接与品牌来源确认。
3. 维护者填写 official-vendor 候选审核记录，明确人工批准与证据链接。
4. 图片上传后的可达性、MIME 与跨域检查；上游最新 Ubuntu CI。

probeStatus 仅依据独立运行验收结果更新。
卡片 published:true 表示未来被收录后的展示意图，本地文件不会触发上架。

## 上游依据

[第三方 Registry 上架指南](https://github.com/duhu2000/dsh-mcp-connector-registry/blob/main/docs/ONBOARDING.md)。
完成上游检查和审核后，再提交描述符与图片。

## 配套插件源码

源码仓库：https://github.com/caoliao/dsh-caoliao-qrcode 。安装步骤见仓库 README。
最新插件包含一键打开授权页、简洁回调说明与颜色状态指示。
