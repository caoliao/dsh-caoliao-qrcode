# 开发说明

## 目录

- plugin/：Host、浏览器界面、OAuth 和插件包配置。
- skills/：完整的 caoliao-admin Skill 快照；来源哈希见 skill-manifest.json。
- scripts/build.py：仅依赖 Python 标准库的构建器。
- tests/：OAuth、回调、连接状态、界面加载与生命周期回归测试。
- registry/：第三方 Registry 描述符、图标来源、Schema 与提交说明。

## 构建与测试

执行 `python scripts/build.py` 生成 dist/ 下的完整插件目录、tgz、Registry 材料 ZIP 和哈希清单。
执行 `npm ci --ignore-scripts --legacy-peer-deps` 安装测试依赖，再执行 `npm test`。
测试会监听本机回环端口；授权服务器和 MCP manager 使用模拟实现，不调用真实业务数据。
宿主兼容范围及依赖约束以 plugin/package.json 为准。

构建会检查同名输出目录中的外来文件，不删除用户文件。跨 Python/zlib 运行时的 gzip 字节可能不同，文件内容以清单哈希核对。
更新 Skill 快照时保留 source_skill_version 和来源哈希，避免遗漏资源文件。

## 许可证与发布

草料自有代码、脚本、Skill 和文档采用 MIT；品牌资产适用 BRANDING.md。
Registry Schema 的上游 MIT 声明保留在 registry/LICENSE.upstream。
package.json 的 private:true 仅防止意外 npm 发布，不限制 MIT 授权。

本地构建和测试不执行发布或上传。
Registry 接入流程见 [提交说明](../registry/SUBMISSION.md)。

## GitHub Actions 与安装链接

推送 `v` 开头的 tag 时触发 Build plugin。工作流先确认 tag 指向的提交属于远端 main 历史，且 tag 与包版本一致（`v` + package.json 的 version）；检查失败则停止，不构建或创建 Release。支持轻量 tag 和附注 tag。普通 main 推送不触发发行构建。

发行流程：

1. 确认包配置、Skill 清单和 Registry 材料版本一致，将代码推送到 main。
2. 在 main 的目标提交上创建对应版本的 tag，并单独推送该 tag。
3. 工作流自动安装依赖、运行测试、构建插件与 Registry 材料，然后创建 Release 草稿。草稿附带固定文件名的安装包、Registry ZIP、构建清单及 SHA256SUMS。同名 Release 已存在时会失败，不覆盖既有发布。
4. 检查草稿与安装包后，在 GitHub 手动发布该 Release；对外下载还需要仓库公开。

构建成功后也可在 Actions 运行页面下载 caoliao-plugin-and-registry artifact；下载需要 GitHub 登录及仓库访问权限，保留时间为 30 天。

固定下载地址为 https://github.com/caoliao/dsh-caoliao-qrcode/releases/latest/download/dsh-caoliao-qrcode.tgz 。只有正式 Release 发布后此地址才会生效，草稿和 Actions artifact 不提供匿名安装链接。

Registry ZIP 与插件来自同一次构建。Registry 收录仍需单独提交上游 PR 和完成审核；发布插件不会自动上架 Registry。

## Git 仓库直接安装

根目录 package.json 声明真实插件身份和 dsh.bundle，运行文件随 Git 提交。plugin/ 保留开发源文件；根目录 client.js 是已嵌入样式与 Logo 的产物。没有 prepare/install 构建钩子，安装端不依赖 Python 或开发工具。

修改 plugin/ 后运行 `npm run build`，提交根目录的同步产物。`npm test` 检查根目录与构建产物、包元数据一致，避免直接 Git 安装拿到旧代码。修改插件包元数据时同步修改根目录 package.json，并更新锁文件。

## npm 发布准备

`npm run npm:prepare` 将完整插件生成到 dist/npm，移除该发布副本的 private 和脚本；根目录与 plugin/package.json 继续禁止直接 npm 发布。
运行 `npm pack ./dist/npm --dry-run` 检查文件列表，不上传任何内容。

npm.yml 在正式 Release 发布时执行预检，也可以手动执行预检。真正发布还需要仓库变量 NPM_PUBLISH_ENABLED 严格等于 true，以及 npm-publish 环境授权；当前未开启。手动运行工作流永远只预检。

首次发布前须确认 npm 包名 dsh-caoliao-qrcode 的所有权（GitHub 组织权限不等于 npm 权限），完成首次包注册与 npm Trusted Publisher 配置，关联 caoliao/dsh-caoliao-qrcode、npm.yml 与 npm-publish 环境。建议为该环境设置必需审核人。首次注册需要单独授权和 npm 登录，不由当前流程执行。

后续发布使用 GitHub OIDC，不保存长期 npm token。版本必须匹配 Release tag，已发布的 npm 版本不可覆盖。旧 tag 不包含新脚本，需在含本次改动的新版本 Release 上使用此流程；不要移动已公开的旧 tag。
