# 日程通（SchedFlow）

一款 **单机、离线、本地优先** 的 Windows 桌面日程管理软件。基于 **Tauri 2 + React 18 + TypeScript + Rust + SQLite** 构建，数据全部存放在本地，无任何网络依赖。

> 月视图管理日程 · 手机样式"日程模式"快速浏览 · 待办清单 · 悬浮球常驻快捷入口 · 系统提醒与开机自启

---

## ✨ 功能特性

- **月视图**：7 列网格、今日高亮、周末着色、分类色圆点、每格日程摘要（≤5 条 + "+N"）、上/下月切换、回到今天、单击查看详情、双击新建日程、日程跨格拖拽改期、待办拖入格子转日程、周起始日可设（默认周一）。
- **日程模式**：手机样式布局、顶部周条（切周 / 高亮今天）、下拉小月历、当日时间线、点空白处或 ＋ 新建、日程拖到周条改期。
- **待办清单**：快速新增、提醒时间、优先级 / 标签 / 备注、待办 ⇄ 日程互转（拖拽 / 移除日期）；未读提醒红点列表，支持逐条标记已读并跳转定位、一键"全部已读"。
- **悬浮球**：四边停靠 + 悬停展开、快捷面板、右键菜单（打开主窗 / 快加待办 / 快加日程 / 退出）、拖动跟手（DPI 换算 + rAF 合并）、提醒气泡、位置记忆、红色角标、窗口全透明圆形外观、大小可调。
- **系统托盘**：启动后常驻通知区，左键打开主窗，右键菜单「打开主窗口 / 设置 / 退出」。
- **系统提醒**：后台线程每 15 秒轮询，重复日程自动展开、系统通知 + 悬浮球联动、免打扰时段、错过补发、待办一次性提醒。
- **重复日程**：每天 / 每周 / 每月 / 每年 / 自定义间隔（每 N 天·周·月、工作日）；编辑、删除支持「整个系列」与「仅本次」。
- **全局快捷键**：`Ctrl+Shift+A` 快加待办、`Ctrl+Shift+D` 快加日程、`Ctrl+Shift+X` 显隐主窗。
- **分类 / 标签 / 搜索**：分类 CRUD + 颜色（内置分类不可删）、标签自由增删、按分类 / 标签 / 优先级 / 完成态筛选、全局搜索并跳转定位。
- **数据管理**：本地 SQLite（WAL 模式）、备份 / 恢复、导出 JSON / CSV、导入 JSON、清空数据。
- **主题外观**：浅色 / 深色 / 跟随系统、字号调节、Windows 11 亚克力毛玻璃效果（不可用时自动降级为纯色）。

---

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 · TypeScript · Vite 6 · antd 5 · zustand 5 · dayjs · Tailwind 4 |
| 后端 | Rust · Tauri 2 · rusqlite |
| 存储 | SQLite（单文件，运行时生成于用户数据目录） |

应用为双窗口架构：`main`（1180×780 主界面）+ `float`（64×64 全透明置顶悬浮球），两者运行同一份前端代码，通过窗口 `label` 分流渲染。

---

## 📁 项目结构

```
schedflow/
├── index.html · package.json · vite.config.ts · tsconfig.json
├── src/                          # 前端（React + TypeScript）
│   ├── main.tsx                  # 唯一入口：按窗口 label 分流 主界面 / 悬浮球
│   ├── App.tsx                   # 主界面壳（模式切换）
│   ├── float/FloatApp.tsx        # 悬浮球窗口全部交互
│   ├── components/               # 月视图 · 日程模式 · 待办 · 搜索 · 设置 · 编辑弹窗
│   ├── stores/                   # zustand 全局状态（app / data / settings / filter / editor）
│   └── lib/                      # api 封装 · 类型定义 · 日期与重复日程工具
└── src-tauri/                    # 后端（Rust + Tauri 2）
    ├── src/                      # 命令层（增删改查）· 数据库 · 提醒线程 · 重复日程
    ├── capabilities/             # 各窗口允许的 Tauri 权限
    ├── icons/                    # 应用图标
    └── tauri.conf.json           # 窗口定义 · 打包配置
```

---

## 🚀 快速开始

### 环境要求

- Windows 10 / 11（自带 WebView2）
- [Node.js](https://nodejs.org/) 18+（含 npm）
- [Rust 工具链](https://rustup.rs/)（首次 `tauri dev` 时会提示安装）

### 开发运行（改代码即时生效）

```bash
npm install
npm run tauri dev
```

前端改动秒级热更新；Rust 改动自动重新编译并重启应用。

### 打包安装包

```bash
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/nsis/SchedFlow_<版本>_x64-setup.exe`。

> **国内网络提示**：若 crates.io 拉取依赖或 Tauri 打包工具（NSIS）下载超时，可配置 Rust 镜像源（`.cargo/config.toml`）并设置镜像环境变量 `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR`。该配置属本机环境，已通过 `.gitignore` 排除，不随仓库上传。

---

## 🗄️ 数据存储

所有数据存放在本地 SQLite 文件：

```
%APPDATA%\com.schedflow.app\schedflow.db
```

采用 WAL 模式；卸载、迁移或重装前请先在「设置 → 数据管理」中备份。

---

## 📚 文档

| 文档 | 说明 |
|---|---|
| [快速上手.md](快速上手.md) | 面向零基础读者的技术栈入门：架构讲解、目录地图、数据流与常见坑 |
| [BASELINE_V1.0.md](BASELINE_V1.0.md) | 项目基线：功能清单、数据模型、已修复缺陷记录（K1–K34）与不可改动约束 |

---

## ⚠️ 维护约束（改动前必读）

- 数据库 schema 只增不改，变更须走幂等迁移（`CREATE TABLE IF NOT EXISTS`）。
- 后端任何增删改命令结尾必须广播 `data-changed` 事件，否则界面不刷新。
- 勿改动包标识 `com.schedflow.app`，否则会切换用户数据目录、已有数据"消失"。
- 悬浮窗几何操作勿混用物理 / 逻辑像素（`setSize` 用逻辑尺寸、`outerPosition()` 返回物理像素）。
- 新增前端能力若涉及新的 Tauri API，需同步检查 `capabilities/` 权限清单。

完整约束与已修复缺陷见 [BASELINE_V1.0.md](BASELINE_V1.0.md)。
