# ADR 0001：未签名应用的自动更新

状态：已接受（2026-11-04）

## 背景

scotty-desktop 是个人自用应用，不做 Authenticode 代码签名。SPEC 要求通过
electron-updater + GitHub Releases 自更新，但未签名应用在 Windows 上是否还能
完成「检测 → 下载 → 静默安装 → 重启」，以及 SmartScreen / publisher 校验是否放行，
在实现前属于未知风险（原计划失败时回退为「检查更新 + 打开下载页」）。

## 决策

继续使用 electron-updater 6.8.11 + NSIS（assisted、按用户安装），不引入代码签名。
上述链路在本地 spike 中已端到端通过。

## Spike 方法

- 环境：Electron 43.3.0、electron-updater 6.8.11、Windows 11 x64、未签名构建
- 版本：0.1.0（已安装）→ 0.1.1（更新源）
- 更新源：本地 generic feed（`http://127.0.0.1:30123/`，支持 Range），避免向公开
  Releases 推送测试版本；GitHub feed 在正式发版（`scd-kjb`）时再验证
- 触发方式：打包版启动时设置 `SCOTTY_UPDATE_SPIKE=1` 与
  `SCOTTY_UPDATE_FEED=http://127.0.0.1:30123/`，由 `src/main/updater.ts` 的
  spike 入口执行一次检查；`autoDownload=true`，下载完成后 `quitAndInstall(true, true)`
- 验证方式：读取安装目录 `resources/app.asar` 内 `package.json` 的 `version`；
  卸载后检查安装目录是否移除

## 结果（证据）

应用日志（`%APPDATA%\Scotty Desktop\logs\server.log`，时间为 UTC）：

```
11:21:41.738 INFO updater: feed http://127.0.0.1:30123/
11:21:41.742 INFO updater: checking for update
11:21:41.883 INFO updater: available 0.1.1
11:21:42.973 INFO updater: downloading 83%
11:21:43.215 INFO updater: downloading 100%
11:21:43.227 INFO updater: downloaded 0.1.1; installing
11:21:46.760 INFO stopping server
11:24:16.006 INFO scotty-desktop starting (packaged=true, server=...\resources\server\server.js)
```

- 检测、下载、静默安装、重启全部成功；安装后 `app.asar` 内版本为 **0.1.1**
- 重启后窗口正常显示（标题 `Bead Me Up, Scotty`），服务端从安装目录启动
- 更新全程没有出现 SmartScreen 提示（更新器以静默方式运行安装器）
- 未配置 `win.publisherName`，electron-updater 未执行 publisher 签名校验，也未报错
- 注销/卸载：静默卸载后 `%LOCALAPPDATA%\Programs\Scotty Desktop` 被完全移除

## 观察到的失败点与风险

1. **静默安装耗时约 2.5 分钟且 CPU 很高**（0.1.1 安装器进程最后自行退出）。
   疑似杀软扫描 123 MB 安装包与解压。`scd-350` 不能把「安装器进程还在」当作失败，
   也不要在主进程同步等待安装完成。
2. **更新缓存残留**：`%LOCALAPPDATA%\scotty-desktop-updater` 在卸载后仍保留
   （约等于安装包大小），属 electron-updater 默认行为。
3. **首次手动安装仍可能触发 SmartScreen**：本次只验证了更新器驱动的静默安装；
   用户双击未签名安装包时仍可能看到 SmartScreen 警告。
4. **GitHub feed 未验证**：本地 generic feed 与 GitHub 的差异主要在传输与鉴权，
   安装流程相同；正式发版时需回读 `latest.yml` 并做一次真实升级。

## 回退方案

若后续在真实 GitHub feed 或其它机器上失败：改为「检查更新 + 打开 Releases 下载页」，
由用户手动安装；不引入签名。

## 后续

- `scd-350`：正式 updater（启动后 10 秒检查、每 6 小时一次、下载完成提示、
  失败只记日志），删除 spike 入口
- `scd-kjb`：发布 v0.1.0/v0.1.1 时验证 GitHub feed 与 `latest.yml`