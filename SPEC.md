# Spec: scotty-desktop

状态：v0.1.0 草案 · 目标平台：Windows 11 x64 · 上游：bead-me-up-scotty `v0.4.0`

本 spec 只描述一个能力：**把 Scotty 原样包装成可安装、可自动更新的 Windows 桌面应用**。
构建管线、Electron 壳、进程生命周期、更新与发布都是这个能力的组成部分，不拆模块。

## Objective

把 `bead-me-up-scotty` 从「终端起服务 + 浏览器打开」变成「双击图标即用」的 Windows 桌面应用，
同时保留 Scotty 的全部功能与用户现有配置。

- **用户**：本项目作者本人（单用户、Windows 11 x64）。用于日常查看和管理 beads 任务，
  以及在开发 beadazzled 时作为功能参照。
- **为什么做**：Scotty 是目前最成熟、最好用的 beads 前端；作者每天在用，但每次都要在终端
  起服务、再切浏览器。目标不是重写 UI，而是消除启动摩擦。
- **成功**：双击安装后的图标，窗口出现 Scotty 界面；现有项目列表原样可见；`bd` 读写在
  打包环境里照常工作；关闭窗口后没有残留进程；应用能通过 GitHub Releases 自更新。
- **不做**：重写 Scotty、修改上游源码（v1）、macOS/Linux、托盘、捆绑 `bd`、自定义品牌 UI、
  CLI 打开项目（`scotty-desktop <path>`）。

## Tech Stack

| 层 | 选择 | 说明 |
|---|---|---|
| 桌面壳 | Electron 43.3.0 | 自带 Node 24.18.1，打包后无需系统 Node；满足 Next 16 要求 |
| 壳内运行时 | Electron 自带 Node（`ELECTRON_RUN_AS_NODE=1`） | 直接跑 Next standalone `server.js`，不额外带 `node.exe` |
| 上游应用 | bead-me-up-scotty `v0.4.0`（Next.js 16.4.1） | 构建时从 GitHub 拉固定 tag，见 `upstream.json` |
| 打包 | electron-builder 26.x + NSIS | 按用户安装，免管理员 |
| 更新 | electron-updater 6.x + GitHub Releases | 产物为 `latest.yml`（不是 Tauri 的 `latest.json`） |
| 语言 | TypeScript 5.9（strict） | 主进程源码；esbuild 打包为 CJS |
| 测试 | Vitest + Playwright（Electron） | 单测纯逻辑，E2E 启动真实 Electron |
| 任务 | beads（本项目 `.beads`） | 单一来源，plan 走 `bd create --graph` |

**不捆绑 `bd`**：与 Scotty 上游一致，`bd` 由用户自备；打包体积和许可都更干净。
**不设置 `XDG_CONFIG_HOME`**：Scotty 用 `os.homedir()/.config/bead-me-up-scotty/config.json`
存项目列表；改这个变量会让现有项目「消失」。

## Commands

所有命令在 `D:\codex_project\scotty-desktop` 下执行。

| 用途 | 命令 |
|---|---|
| 安装依赖 | `npm ci` |
| 拉取并校验上游 | `npm run upstream:fetch` |
| 构建 standalone 服务端 | `npm run build:server` |
| 编译 Electron 主进程 | `npm run build:main` |
| 开发运行（需先有 `build/server`） | `npm run dev` |
| 附加到手工启动的 Scotty dev server | `npm run dev:attach` |
| 打安装包（不发布） | `npm run dist` |
| 发布（GitHub Releases） | `npm run release`（需 `GH_TOKEN`） |
| 单元测试 | `npm test` |
| E2E | `npm run test:e2e` |
| 类型检查 | `npm run typecheck` |
| Lint | `npm run lint` |
| 完整验证 | `npm run verify` |
| 查看任务 | `bd ready` / `bd show <id>` / `bd update <id> --claim` |

代理：构建机需要访问 GitHub 与 npm 时，在命令前显式带
`HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897`，
不改全局配置。

### 构建与发布链路

1. `upstream:fetch`：按 `upstream.json` 的 `tag` 浅克隆上游到 `.cache/upstream/<tag>`，
   校验 `git rev-parse HEAD` 等于 `commit`；不一致直接失败。
2. 应用 `patches/*.patch`（默认空；按文件名排序，`git apply --check` 后 apply）。
3. 在上游目录执行 `npm ci` 和 `NEXT_STANDALONE=1 npm run build`。
4. 组装 `build/server/`：
   - 复制 `.next/standalone`；
   - 删除 `node_modules/@11ty`（tracing 带进来的不完整副本）；
   - 复制 `.next/static` 到 `.next/static`；
   - 复制 `public/`；
   - 在临时目录执行 `npm install --no-save @11ty/eleventy@3.1.6`，把其完整
     `node_modules` 合并进 `build/server/node_modules`（先删掉 tracing 带进来的
     不完整 `@11ty`）。`eleventyBin()` 从 cwd 向上查找，而 `build/server` 就是 cwd，
     因此 publish/showcase 随包可用，不需要 `NODE_PATH`。
5. `build:main`：esbuild 把 `src/main/index.ts` 打成 `dist-electron/main.cjs`。
6. `dist`：electron-builder 读取 `build/server` 作为 `extraResources`，产出 NSIS 安装包与
   `latest.yml`。
7. `release`：`electron-builder --publish always` 上传安装包、`.blockmap` 与 `latest.yml`
   到 `steven123397/scotty-desktop` 的 Releases。

## Project Structure

```
src/main/                 Electron 主进程（TypeScript）
  index.ts                应用生命周期、单实例、退出编排
  server.ts               端口选择、spawn、就绪探测、进程树清理
  window.ts               BrowserWindow、导航守卫、外链处理、skin 注入
  updater.ts              electron-updater 接入与提示
  paths.ts                资源路径、bd 解析、日志路径
  log.ts                  文件日志与简单轮转
src/shared/               主进程与脚本共享的常量/类型
scripts/
  fetch-upstream.mjs      拉 tag、校验 commit、应用 patches
  build-server.mjs        npm ci + standalone build + 组装
  verify-server.mjs       直接启动 server 并断言 HTTP 200
  generate-icon.mjs       从上游 icon 生成 Windows .ico
tests/unit/               Vitest
tests/e2e/                Playwright Electron
fixtures/fake-server.mjs  E2E 用的最小 HTTP 服务，避免每次构建上游
build-assets/             icon.ico 等打包资源
patches/                  本地补丁扩展点（v1 为空）
assets/skin.css           视觉覆盖扩展点（v1 为空）
build/server/             生成的 standalone 产物（gitignored）
dist-electron/            生成的主进程产物（gitignored）
release/                  electron-builder 产物（gitignored）
.cache/upstream/          上游源码缓存（gitignored）
upstream.json             固定 tag、commit、eleventy 版本
SPEC.md · CLAUDE.md
docs/ideas/ · docs/adr/   按项目约定，首次产出时创建
```

## 运行时设计

### 启动顺序

1. 获取单实例锁；已有实例则聚焦它的窗口并退出。
2. 选择 `127.0.0.1` 上的空闲端口（绑定 `0` 后关闭；失败重试 3 次）。
3. 解析 `bd`：优先 `BD_BIN`，否则 `where.exe bd` 取第一条；找不到只告警，不阻止启动。
4. spawn `server.js`：
   ```ts
   spawn(process.execPath, [serverJs], {
     cwd: serverDir,
     env: {
       ...process.env,
       ELECTRON_RUN_AS_NODE: "1",
       PORT: String(port),
       HOSTNAME: "127.0.0.1",
       POSTHOG_KEY: "",          // 关闭遥测
       ...(bdPath ? { BD_BIN: bdPath } : {}),
     },
     stdio: ["ignore", "pipe", "pipe"],
     windowsHide: true,
   });
   ```
5. stdout/stderr 写入 `%APPDATA%\Scotty Desktop\logs\server.log`（5 MB × 2 轮转）。
6. 轮询 `http://127.0.0.1:<port>/`，200 才建窗口；30 秒超时则弹错误对话框并退出，
   对话框里给出日志路径。
7. 窗口：1280×800，最小 960×600，`autoHideMenuBar`，标题 `Bead Me Up, Scotty`。
   `webPreferences`: `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
8. `dom-ready` 时若 `resources/skin.css` 非空，`webContents.insertCSS()` 注入。

### 导航与安全

- 只允许窗口停留在 `http://127.0.0.1:<port>`；其他 `http/https` 交给 `shell.openExternal`，
  `will-navigate` 与 `setWindowOpenHandler` 都拦截。
- 拒绝所有权限请求（通知、摄像头、麦克风、地理位置等）。
- 服务端只监听回环地址，不加额外鉴权；威胁模型与现在本机跑 `next start` 一致。
  这要求不把端口暴露到局域网，也不允许 `HOSTNAME=0.0.0.0`。

### 退出与崩溃

- 关闭最后一个窗口 → `app.quit()`。
- `before-quit`：先 `child.kill()`；3 秒后仍存活则 `taskkill /PID <pid> /T /F`。
  退出前确认没有残留 `server.js` 进程。
- 服务端在应用运行期间意外退出：弹窗提供「重启服务 / 退出应用」；自动重启最多 3 次，
  避免崩溃循环。
- 单实例第二次启动：聚焦已有窗口，不新起服务。

### 更新

- 仅在 `app.isPackaged` 时启用；启动后延迟 10 秒检查，之后每 6 小时一次。
- `autoDownload: true`、`autoInstallOnAppQuit: true`、`allowPrerelease: false`。
- 下载完成后提示一次：「重启安装」/「退出时安装」；不强制重启。
- feed：`https://github.com/steven123397/scotty-desktop/releases/latest/download/latest.yml`。
- 更新的是整个应用（Electron 壳 + 随包的 Next 服务端）；Scotty 上游升级也走这条链路。

### 本地改动扩展点（v1 为空）

- `patches/*.patch`：构建时按序应用；用于必须动上游源码的结构性改动。
- `assets/skin.css`：运行时注入；用于纯视觉改动，不产生上游冲突。
- v1 不引入 fork，也不启用任何 patch。第一次需要改 Scotty 时再决定用 skin 还是 fork；
  若改动变大，优先 fork + 定期 merge 上游 tag，而不是继续堆 patch。

## Code Style

- TypeScript strict；禁止 `any`、无说明的非空断言、静默 `catch {}`。
- 源码用 ESM 写，esbuild 输出 CJS；主进程不引入运行时依赖，能用 Node 标准库就用标准库。
- 函数保持小而纯；进程/窗口副作用集中在 `index.ts`，便于单测。
- 错误必须带上下文（端口、路径、退出码）；面向用户的错误同时写日志。
- 命名：文件 kebab-case，类型 PascalCase，函数/变量 camelCase，常量 UPPER_SNAKE。
- 示例：

  ```ts
  export function serverEnv(
    base: NodeJS.ProcessEnv,
    opts: { port: number; bdPath: string | null },
  ): NodeJS.ProcessEnv {
    return {
      ...base,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(opts.port),
      HOSTNAME: "127.0.0.1",
      POSTHOG_KEY: "",
      ...(opts.bdPath ? { BD_BIN: opts.bdPath } : {}),
    };
  }
  ```

## Testing Strategy

| 层级 | 工具 | 覆盖内容 |
|---|---|---|
| 单元 | Vitest | 端口选择、`bd` 解析、`serverEnv` 构造、就绪轮询、日志轮转、更新事件映射 |
| 集成（Electron） | Playwright `_electron` | 启动真实 Electron + `fixtures/fake-server.mjs`，断言窗口加载、标题、单实例聚焦、退出后子进程消失 |
| 构建冒烟 | `scripts/verify-server.mjs` | `build/server/server.js` 能启动、`GET /` 返回 200、`BD_BIN` 传入生效 |
| 手工验收 | 真实 `bd` + 真实项目 | 项目列表、读写、事件刷新、更新安装 |
| 发布验证 | GitHub Release 回读 | `latest.yml`、安装包、blockmap 可下载且版本号正确 |

- 覆盖率目标：`src/main` 中可单测的纯逻辑行覆盖 ≥ 80%（`index.ts` 的窗口/进程编排由 E2E 覆盖）。
- E2E 默认不构建上游（用 fake server），保证 `npm run test:e2e` 在 1 分钟内可跑；
  真实 standalone 由 `npm run verify` 覆盖。

## Boundaries

**Always**
- 构建前校验上游 tag 对应的 commit SHA；不一致就失败。
- 服务端只绑 `127.0.0.1`；窗口只加载该 origin。
- 退出时清理整个进程树，不留 `server.js`。
- 提交前跑 `npm run verify`；发布前在干净工作树上跑 `npm run release`。
- 在安装包和 `resources` 中保留上游 MIT LICENSE 与本项目 NOTICE。

**Ask first**
- 升级上游 tag、修改 `upstream.json`、启用 `patches/`。
- 增加运行时依赖、改变 appId / productName / 更新 feed。
- 打开任何默认关闭的网络行为（遥测、崩溃上报）。
- 改变安装模式（按用户 → 按机器）或引入代码签名。

**Never**
- 捆绑 `bd`、凭据或任何 secret；`GH_TOKEN` 只从环境变量读。
- 设置 `nodeIntegration: true`、关闭 `contextIsolation`、加载回环以外的页面。
- 提交 `.cache/`、`build/server/`、`dist-electron/`、`release/`。
- 未经用户确认自动重启安装更新。
- 为了通过检查而弱化测试或安全设置。

## Success Criteria

1. 安装后双击图标，无终端窗口，Scotty 界面在冷启动 10 秒内出现。
2. 现有 `%USERPROFILE%\.config\bead-me-up-scotty\config.json` 中的项目全部可见，无需重新添加。
3. 在 UI 改一个 ticket 状态后，终端 `bd show` 能看到同样结果。
4. 关闭窗口后 `tasklist` 中无残留 `server.js` / Electron 子进程。
5. 再次双击图标只聚焦已有窗口，不启动第二个服务。
6. 点击外部链接在默认浏览器打开，应用窗口不跳走。
7. 安装包按用户安装、不需要管理员权限；卸载后无残留安装目录。
8. 发布 `0.1.1` 后，已安装的 `0.1.0` 能检测、下载并在重启后完成更新。
9. 从干净 clone 执行 `npm ci && npm run upstream:fetch && npm run dist` 能产出可安装包，
   且上游 commit 与 `upstream.json` 一致。
10. `bd` 不在 PATH 时应用仍能启动（Scotty 进入 demo 模式），并给出可诊断的日志。
11. `npm run verify` 全绿。
12. 打包环境里 Scotty 的 publish/showcase 可用（`@11ty/eleventy` 依赖树完整）。

## Decisions（2026-11-04 收口）

| 问题 | 决定 | 依据 |
|---|---|---|
| 自动更新是否签名 | **不签名**，直接上 electron-updater；先用一个 spike 验证未签名应用的检测/下载/安装路径 | 个人自用，不做 Authenticode；若 spike 失败，回退为“检查更新 + 打开下载页” |
| 更新仓库 | `https://github.com/steven123397/scotty-desktop`（已创建，public） | electron-updater 免 token 读取 Releases |
| 应用图标 | 复用上游 `app/icon.svg` / `app/favicon.ico`，转换为 256×256 `.ico` | 上游 MIT；`NOTICE` 记录来源与版权；无商业分发 |
| publish/showcase | **随包**；把完整 `@11ty/eleventy@3.1.6` 依赖树合并进 `build/server/node_modules` | 不留下一个明知会报错的入口；Dockerfile 已有可复用配方 |
| Electron / Next 兼容 | Electron 43.3.0 自带 Node 24.18.1，满足 Next 16.4.1；首次构建再做一次真实启动验证 | Electron 官方 releases 元数据 |
| CLI 打开项目 | 不做 | 与“消除启动摩擦”目标无关，v1 保持最小 |
| 更新检查频率 | 启动后检查一次，运行中每 6 小时一次 | 个人使用成本可忽略；不做强制重启 |

## Open Questions

目前没有阻塞规格的未决问题。剩余两项是**实现期风险**，在 plan 里各自对应一个 spike/验证任务，
失败时按上表回退：

1. **未签名自动更新**：Windows SmartScreen 与 electron-updater 的签名校验是否放行；
   失败回退为“检查更新 + 打开下载页”。
2. **publish/showcase**：Eleventy 依赖树在打包后的路径解析是否如预期；
   失败则改为不随包，并在 UI 记录已知限制。