# Sidecar Monitor

多场地 Sidecar 监控桌面工具（Electron + Vue 3）。

## 概述

`Sidecar Monitor` 在一个桌面窗口内同时显示多个 OpenTCS Sidecar 场地页面，支持会话隔离、配置持久化、聚焦模式和跨平台打包。

## 开发

**前置要求：** Node.js 20.19+（推荐 22.12+），npm 10+

```bash
npm install

# 开发模式（含热重载）
npm run dev

# 类型检查
npm run typecheck

# 单元测试
npm run test

# 生产构建
npm run build
```

## 场地配置

配置文件存储于：

| 平台    | 路径                                        |
|---------|---------------------------------------------|
| macOS   | `~/Library/Application Support/sidecar-monitor/config.json` |
| Windows | `%APPDATA%\sidecar-monitor\config.json`     |
| Linux   | `~/.config/sidecar-monitor/config.json`     |

配置采用原子写入（先写 `.config.json.tmp` 再重命名），防止意外截断。

导出配置的默认文件名：`sidecar-monitor-config.json`。


### Cookie 加密说明

macOS 和 Windows 使用操作系统密钥链对 Chromium Cookie 加密，加密时绑定 **当前用户 + appId**。  
更改 appId 后，即使 Cookie 文件已复制，浏览器也可能无法解密。  
场地配置（URL、缩放等）不受影响；Cookie 无法迁移时请在对应场地重新登录。

## 会话隔离

每个场地使用独立的持久 Chromium Session（`persist:site-<id>`），存储路径：

```
<userData>/Partitions/site-<id>/
```

通过"设置 → 清除登录状态"可清除指定场地的所有本地数据（Cookie、localStorage、IndexedDB）。

## 布局

- **自动列数**：在不同数量的场地下最大化单个视图面积，对相同面积优先选择接近容器长宽比的布局。
- **手动列数**：工具栏下拉框可选 1-20 列。
- **聚焦模式**：单击场地标题栏中的 ⊡，单个场地全屏展示；点 ✕ 或工具栏"退出聚焦"恢复。
- **排序**：设置面板中的 ↑↓ 按钮调整场地显示顺序。

## 跨平台构建

本地打包应在对应操作系统上执行：

```bash
npm run dist:mac      # macOS DMG + ZIP（x64 + arm64）
npm run dist:win      # Windows NSIS 安装包（x64）
npm run dist:linux    # Linux AppImage + deb + rpm（当前主机架构）
```

在 macOS 或 Linux 上也可显式指定 Linux 架构：

```bash
npm run build
npx electron-builder --linux AppImage deb rpm --x64
npx electron-builder --linux AppImage deb rpm --arm64
```

macOS 交叉构建 rpm 前需安装 `rpmbuild`：

```bash
brew install rpm
```

不建议在一台机器上交叉构建全部平台。仓库中的
`.github/workflows/build-release.yml` 会使用 macOS、Windows、Linux x64 和
Linux arm64 原生 Runner 并行生成完整产物：

1. 在 GitHub 仓库的 **Actions → Build and release → Run workflow** 手动触发。
2. 构建完成后，在该工作流运行页面的 **Artifacts** 区域下载三平台产物。
3. 发布版本时，先将 `package.json` 中的版本更新为目标版本，再推送同版本标签：

```bash
git tag v0.1.1
git push origin v0.1.1
```

`v*` 标签会触发构建并自动创建 GitHub Release。标签必须与 `package.json`
版本一致，否则发布任务会失败；手动触发只上传 Actions Artifacts，不创建 Release。

产物命名（由 `electron-builder.yml` 中的 `artifactName` 控制）：

| 平台/格式       | 架构        | 文件名示例                                      |
|-----------------|-------------|-------------------------------------------------|
| macOS ZIP       | x64         | `sidecar-monitor-0.1.1-x64.zip`                 |
| Windows NSIS    | x64         | `sidecar-monitor-0.1.1-x64.exe`                 |
| Linux AppImage  | x64/arm64   | `sidecar-monitor-0.1.1-x86_64.AppImage`         |
| Linux deb       | x64/arm64   | `sidecar-monitor-0.1.1-amd64.deb`               |
| Linux rpm       | x64/arm64   | `sidecar-monitor-0.1.1-x86_64.rpm`              |

Linux 的 x64 与 arm64 均提供 AppImage、deb、rpm，共六个安装包。GitHub
Actions 中分别保存为 `sidecar-monitor-linux-x64` 和
`sidecar-monitor-linux-arm64` Artifact。

### Linux 安装

Ubuntu/Debian 推荐下载与 CPU 架构匹配的 `.deb` 文件，双击后通过 App Center
或系统软件安装器确认安装。安装完成后可从应用菜单启动。也可使用命令行：

```bash
sudo apt install ./sidecar-monitor-0.1.1-amd64.deb
```

Fedora/RHEL 系发行版使用 rpm：

```bash
sudo dnf install ./sidecar-monitor-0.1.1-x86_64.rpm
```

AppImage 无需安装：

```bash
chmod +x sidecar-monitor-0.1.1-x86_64.AppImage
./sidecar-monitor-0.1.1-x86_64.AppImage
```

> 构建目标、架构、脚本或工作流发生变化时，必须在同一变更中同步更新本节。

> 当前 CI 产物未签名。macOS 正式发布需 Developer ID 签名与公证，Windows
> 正式发布建议使用代码签名证书；未签名安装包可能触发系统安全提示。

## 安全设计

- `nodeIntegration: false`，`contextIsolation: true`，`sandbox: true`（每个 WebContentsView）
- 主窗口渲染器与场地视图通过 contextBridge 隔离（`window.monitorAPI`）
- 场地视图仅允许同源导航；跨源 http(s) 跳转通过 `shell.openExternal` 处理
- Session 级别权限全部拒绝（摄像头、麦克风、通知等）
- 禁止下载、不允许 window.open()
- 默认使用 Chromium TLS 校验，不旁路证书验证

## 图标素材

应用图标使用深蓝、青蓝的多窗口监控图形，源文件和平台产物位于 `resources/`：

| 文件         | 规格              | 平台    |
|--------------|-------------------|---------|
| `icon.svg`   | 可编辑矢量源文件  | 源素材  |
| `icon.icns`  | macOS 标准格式    | macOS   |
| `icon.ico`   | 256×256 px        | Windows |
| `icon.png`   | 1024×1024 px       | Linux/运行时 |

## 内部 API

Preload 通过 `contextBridge.exposeInMainWorld('monitorAPI', ...)` 暴露 `window.monitorAPI`（类型：`MonitorAPI`）。
