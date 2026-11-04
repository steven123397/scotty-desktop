# Implementation Plan: Scotty Desktop v0.1.0

把 `bead-me-up-scotty` v0.4.0 原样包装成 Windows 桌面应用：Electron 壳启动 Next standalone
服务端，复用用户现有配置，提供 NSIS 安装包与未签名自动更新。规格见 [SPEC.md](../SPEC.md)。

**任务追踪：beads（本项目 `.beads`，前缀 `scd`）。** 本文件是任务索引与决策记录，
不重复 acceptance criteria；逐条验收标准用 `bd show <id>` 查看。
任务图来源：[plan-graph.json](plan-graph.json)。

## Architecture Decisions

- **Electron 43.3.0 自带 Node 24.18.1**，用 `ELECTRON_RUN_AS_NODE=1` 直接跑 Next
  standalone `server.js`；不额外捆绑 `node.exe`。
- **上游固定在 `v0.4.0` / `cf6dda1`**，构建时浅克隆并校验 commit；v1 不应用任何 patch。
- **不设 `XDG_CONFIG_HOME`**，直接复用 `%USERPROFILE%\.config\bead-me-up-scotty\config.json`。
- **`bd` 不随包**：启动时 `BD_BIN` → `where.exe bd`，找不到只告警。
- **服务端只绑 `127.0.0.1`** 的随机空闲端口；窗口只加载该 origin，外链交给系统浏览器。
- **打包**：electron-builder NSIS，按用户安装，`appId=com.steven123397.scotty-desktop`。
- **更新**：electron-updater + GitHub Releases；不签名，先 spike 验证，失败回退为下载页。
- **本地改动扩展点**：`patches/`（构建时 apply）与 `assets/skin.css`（运行时注入），v1 为空。

## Task List

### Phase 1 — Foundation

| ID | Task | Size | Depends on |
|---|---|---|---|
| `scd-c21` | 搭建 Node/TypeScript 工程骨架 | S | — |
| `scd-wci` | 补齐许可与上游版本锁定 | S | scd-c21 |
| `scd-9of` | 实现上游拉取与 SHA 校验脚本 | S | scd-wci |
| `scd-wo1` | 构建并组装 Next standalone 服务端 | M | scd-9of |

**Checkpoint A** `scd-ozc`：`build/server` 能启动、`GET /` 200、Eleventy 存在。

### Phase 2 — Electron Shell

| ID | Task | Size | Depends on |
|---|---|---|---|
| `scd-gti` | 壳的纯逻辑：端口、bd 解析、环境构造 | S | scd-ozc |
| `scd-gxb` | 服务端 spawn、就绪探测、退出清理与日志 | M | scd-gti |
| `scd-1us` | 窗口、单实例、导航守卫与 skin 注入 | M | scd-gxb |
| `scd-vxo` | 接入真实 Scotty standalone 与 bd | M | scd-hkk |

**Checkpoint B** `scd-hkk`：fixture 壳跑通，退出无残留。
**Checkpoint C** `scd-dz6`：真实项目列表、读写、事件刷新可用。

### Phase 3 — Packaging

| ID | Task | Size | Depends on |
|---|---|---|---|
| `scd-fwr` | 加固生命周期：崩溃重启、进程树清理、日志轮转 | M | scd-dz6 |
| `scd-azj` | 生成 Windows 应用图标 | S | scd-dz6 |
| `scd-10s` | 配置 electron-builder 并产出 NSIS 安装包 | M | scd-fwr, scd-azj |

**Checkpoint D** `scd-nxu`：安装、启动、读项目、卸载全部通过。

### Phase 4 — Auto-update

| ID | Task | Size | Depends on |
|---|---|---|---|
| `scd-3o0` | Spike：未签名 electron-updater 端到端 | M | scd-nxu |
| `scd-350` | 接入 electron-updater 与更新提示 | M | scd-3o0 |

**Checkpoint E** `scd-o57`：0.1.0 → 0.1.1 完整更新闭环。

### Phase 5 — Feature Verification & Release

| ID | Task | Size | Depends on |
|---|---|---|---|
| `scd-1xm` | 验证打包环境下的 publish/showcase | S | scd-dz6 |
| `scd-kjb` | 补齐文档并发布 v0.1.0 | M | scd-o57, scd-1xm |

**Checkpoint F** `scd-yun`：SPEC 的 12 条 Success Criteria 全部通过。

## 并行机会

- Phase 1 严格顺序：租约/校验 → 构建 → 冒烟。
- Checkpoint C 之后，`scd-fwr`（加固）、`scd-azj`（图标）、`scd-1xm`（publish）互不依赖，
  可并行；`scd-10s` 等加固与图标完成后开始。
- Phase 4 必须等 Checkpoint D：未签名更新只能在真实安装包上验证。

## Risks and Mitigations

| 风险 | 影响 | 应对 |
|---|---|---|
| 未签名应用无法自动更新（SmartScreen / 签名校验） | 高 | `scd-3o0` 先做 spike；失败回退为“检查更新 + 打开下载页”，SPEC 已记录 |
| Electron 的 Node 24 与 Next 16 standalone 不完全兼容 | 中 | 首次 `scd-wo1` 就做真实启动冒烟；不通过则评估 Node 降级或改用外部 Node |
| GUI 启动继承不到 shell PATH，找不到 `bd`/`git` | 中 | 显式解析 `BD_BIN`；启动日志记录 PATH 与解析结果；缺失时进入 demo 模式 |
| SSE 长连接导致退出卡住 | 中 | `scd-gxb` 先 kill，3 秒后 `taskkill /T /F`；`scd-fwr` 用 E2E 验证无残留 |
| `@11ty/eleventy` 在打包环境路径解析失败 | 中 | 按 Dockerfile 配方合并完整依赖树；`scd-1xm` 直接触发 publish 验证 |
| 安装包体积约 250–350 MB | 低 | 个人自用接受；不为此引入 Tauri/SEA 复杂度 |
| Windows SmartScreen 首次运行提示 | 低 | README 说明；不宣称已签名 |

## 完成定义（每个任务都适用）

- 该任务的 acceptance criteria 全部满足。
- `npm run typecheck && npm run lint` 通过；涉及运行时的任务另跑对应测试。
- 变更没有弱化 SPEC 的 Boundaries（尤其安全与进程清理）。
- 相关文档/SPEC 若与实现不一致，先改文档再继续。

## Open Questions

无阻塞问题。两项实现期风险（未签名更新、Eleventy 路径）已各自绑定任务与回退方案，见上表。