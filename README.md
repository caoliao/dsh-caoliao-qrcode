# 草料二维码 · DeepSeek Harness 插件

用对话轻松建码、管理表单、分析巡检记录，让日常工作更简单。

**草料二维码官网：[cli.im](https://cli.im/)**

## 安装插件

### 使用 GitHub 链接安装（推荐）

打开 Harness 的 **插件 → 添加插件**，粘贴以下地址，安装并启用后重启：

```text
https://github.com/caoliao/dsh-caoliao-qrcode
```

插件已包含运行文件和配套 Skill，无需手动构建。随后打开 **草料二维码**，点击 **连接草料账号** 完成授权。

### 使用安装包链接

复制 [最新安装包下载链接](https://github.com/caoliao/dsh-caoliao-qrcode/releases/latest/download/dsh-caoliao-qrcode.tgz)，直接粘贴到 Harness 的 **插件 → 添加插件** 输入框中即可安装，无需先下载到本地：

```text
https://github.com/caoliao/dsh-caoliao-qrcode/releases/latest/download/dsh-caoliao-qrcode.tgz
```

安装并启用后重启，打开 **草料二维码**，点击 **连接草料账号** 完成授权。
也可以下载 `.tgz` 文件后从本地安装。以上方式均无需手动构建。

### 从源码构建

准备好 DeepSeek Harness、Git 和 Python，确保终端可以执行 `python`。
安装包可以直接从源码构建，不需要先安装 Node.js 或 npm 依赖。

#### 1. 获取源码并构建

```sh
git clone https://github.com/caoliao/dsh-caoliao-qrcode.git
cd dsh-caoliao-qrcode
python scripts/build.py
```

构建完成后，`dist/dsh-caoliao-qrcode` 是完整的可安装插件目录，包含账号连接功能和配套 Skill。
仓库根目录也可直接安装；`plugin` 是开发源文件目录，请勿单独安装。

#### 2. 添加到 Harness

1. 打开 Harness 左侧的 **插件** 页面，点击 **添加插件**。
2. 在安装来源中粘贴 `dist/dsh-caoliao-qrcode` 的**绝对路径**，然后安装并启用。
3. 重启 Harness，左侧会出现 **草料二维码** 入口。

在仓库目录中运行以下命令，可以获取需要粘贴的路径：

**Windows PowerShell：**

```powershell
(Resolve-Path .\dist\dsh-caoliao-qrcode).Path
```

**macOS / Linux：**

```sh
python -c "from pathlib import Path; print(Path('dist/dsh-caoliao-qrcode').resolve())"
```

如果使用安装包，也可以在添加插件时选择 `dist` 中生成的 `.tgz` 文件。

### 连接草料账号

1. 打开 **草料二维码**，点击 **连接草料账号**。
2. 在自动打开的浏览器页面登录草料，选择组织并确认授权。
3. 回到 Harness，等待状态变为绿色 **已连接**。
4. 新建会话，告诉 DeepSeek 你想完成什么。

无需填写 API Key，也无需另外添加 MCP 或安装 Skill。
授权浏览器与 Harness 应运行在同一台电脑上。如果已经配置过草料连接，请先移除重复连接。

## 试着这样说

- 🟩 **快速建码**：帮我设计一个设备档案二维码，先给我看看方案。
- 📋 **表单与记录**：帮我查看最近的表单记录，整理出需要关注的信息。
- 🔍 **巡检与分析**：帮我分析本月巡检记录，总结异常情况和待跟进事项。

具体可用功能由所选组织的权限和套餐决定。你可以随时在插件页面断开连接。

## 更新插件

在 Harness 中移除旧插件，再使用上述 GitHub 链接或最新安装包重新安装并重启。
如果使用源码构建，先运行 `git pull`，再执行 `python scripts/build.py` 重新生成安装包。

## 开发与贡献

安装 Node.js 后，在仓库根目录运行：

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm test
```

源码结构、测试范围和 Registry 材料说明见 [开发说明](docs/DEVELOPMENT.md)。

## 许可证

代码、脚本、Skill 与文档采用 [MIT License](LICENSE)。
草料 Logo 与商标使用见 [品牌说明](BRANDING.md)，第三方版权见 [NOTICE](NOTICE.md)。

[草料二维码](https://cli.im/) · [MCP 接入说明](https://cli.im/open-api/agent/open-platform-mcp.html)
