# Scotty Desktop

把 [bead-me-up-scotty](https://github.com/brendan-appstart/bead-me-up-scotty) `v0.4.0`
包装成可安装、可自动更新的 Windows 桌面应用：双击图标即用，不再需要终端起服务、切浏览器。
界面与功能完全来自上游，本仓库只负责 Electron 壳、构建、打包与更新。

## 功能

- 双击启动，窗口内就是完整的 Scotty（看板、依赖图、epic、搜索等）
- 复用现有 `%USERPROFILE%\.config\bead-me-up-scotty\config.json` 项目列表，无需重新添加
- 使用本机 `bd` 读写 beads，UI 改动会落回项目数据
- 单实例：再次双击只聚焦已有窗口
- 外部链接交给系统浏览器，窗口始终停留在本地服务
- 通过 GitHub Releases 自动更新
- 视觉覆盖扩展点（`assets/skin.css`）与上游补丁扩展点（`patches/*.patch`，v1 为空）

## 环境要求

运行：

- Windows 11 x64
- `bd`（beads CLI）可选；不在 PATH 时应用仍可启动并进入 demo 模式

构建：

- Node.js ≥ 22、npm、git
- 能访问 GitHub 与 npm；本机需代理时，所有外网命令前显式带
  `HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897`

## 安装

1. 从 [Releases](https://github.com/steven123397/scotty-desktop/releases) 下载
   `scotty-desktop-Setup-<version>.exe`
2. 双击运行。安装包未签名，SmartScreen 可能提示，选择「更多信息 → 仍要运行」
3. 安装向导允许修改安装目录；默认按用户安装到
   `%LOCALAPPDATA%\Programs\Scotty Desktop`，**不需要管理员权限**
4. 卸载：Windows 设置 → 应用 → Scotty Desktop（或安装目录下的卸载程序），
   卸载会移除整个安装目录

## 使用

- 首次启动会读取现有的 Scotty 配置；没有配置时从应用内添加 beads 项目
- 日志：`%APPDATA%\Scotty Desktop\logs\server.log`（5 MB 轮转，保留一份归档）
- 服务端只监听 `127.0.0.1` 的随机端口，不暴露到局域网
- 自动更新：启动 10 秒后检查一次，之后每 6 小时一次；下载完成后提示
  「重启安装 / 退出时安装」。未签名更新的验证结论见
  [ADR 0001](docs/adr/0001-unsigned-auto-update.md)

## 开发

所有命令在仓库根目录执行：

| 用途 | 命令 |
|---|---|
| 安装依赖 | `npm ci` |
| 拉取并校验上游 | `npm run upstream:fetch` |
| 构建 standalone 服务端 | `npm run build:server` |
| 冒烟验证服务端 | `npm run verify:server` |
| 编译主进程 | `npm run build:main` |
| 开发运行（需先有 `build/server`） | `npm run dev` |
| 单元测试 | `npm test` |
| Electron E2E（fixture，不需上游构建） | `npm run test:e2e` |
| 真实服务端验收脚本 | `npm run e2e:real` |
| 生成 Windows 图标 | `npm run icon` |
| 打安装包（不发布） | `npm run dist` |
| 发布到 GitHub Releases | `npm run release`（需 `GH_TOKEN`） |
| 完整验证 | `npm run verify` |
| 查看任务 | `bd ready` / `bd show <id>` |

上游固定在 `upstream.json` 的 tag + commit；构建时浅克隆并校验 SHA，不一致直接失败。
本地补丁放在 `patches/`（按文件名顺序应用），视觉覆盖放在 `assets/skin.css`。

代理：本机无法直连 GitHub，需要外网时在命令前加
`HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897`；
Electron 二进制安装另外需要 `ELECTRON_GET_USE_PROXY=true`。

## 目录结构

```
src/main/        Electron 主进程（生命周期、服务端、窗口、更新、日志）
scripts/         上游拉取、服务端构建/冒烟、主进程打包、图标生成、真实验收
tests/unit/      Vitest
tests/e2e/       Playwright Electron
fixtures/        E2E 用的最小 HTTP 服务
build/server/    生成的 standalone 产物（gitignored）
release/         electron-builder 产物（gitignored）
docs/adr/        架构决策记录
upstream.json    上游 tag / commit / Eleventy 版本
```

## 已知限制

- **未签名**：首次手动运行安装包可能触发 SmartScreen；更新器驱动的静默安装不弹
- 仅支持 Windows x64；不提供 macOS/Linux、托盘、`scotty-desktop <path>` CLI
- 不捆绑 `bd`，也不做签名
- 安装包约 123 MB，安装后约 414 MB
- 首次冷启动可能较慢（杀软首次扫描），后续正常
- publish/showcase 随包可用；`deploy` 需要用户自行安装并登录 `vercel` CLI

## 许可

本项目 MIT，见 [LICENSE](LICENSE)。上游与图标来源记录在 [NOTICE](NOTICE)，
上游完整许可文本在 [licenses/](licenses/)。