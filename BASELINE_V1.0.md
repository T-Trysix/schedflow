# 项目基线快照 V1.0 — 日程通（SchedFlow）

> 快照时间：2026-08-17 ｜ 状态：核心开发完成，NSIS 安装包已产出，待最终装机验收
> 本文件是持续维护的记录：缺陷列表随修复过程追加，其他章节仅在定稿时更新。
> 2026-08-21 需求调整 + 缺陷修复第一轮：取消日程模式窗口缩放 / 新增系统托盘 / 修创建日程白屏 / 修悬浮球阴影与右键菜单（见第 4 节 K11–K14）。
> 2026-08-21 第二轮：悬浮窗背景透明 / 托盘菜单文案 / 悬浮球拖动跟手 / 右键菜单不漂移 / 日程模式自适应窗口 / 侧边栏按钮黑线（见第 4 节 K15–K20）。
> 2026-08-24 第三轮：悬浮球四边停靠+悬停展开 / 面板完整显示（DPI 修正） / 月视图详情返回 / 取消右侧折叠与新日程按钮 / 新建日程默认时间残留 / PowerShell 通知核实 / 未读提醒红点列表（见第 4 节 K21–K27）。
> 2026-08-24 第四轮：悬浮球悬停展开偏移（透明区遮挡）/ 单击停靠条球位移消失且重启不回（见第 4 节 K28–K29）。
> 2026-08-24 第五轮：悬浮球自由态右下角被正方形窗口裁剪 / 日程模式小月历打开时当前周重复显示（见第 4 节 K30–K31）。
> 2026-08-25 第六轮：悬浮球拖动起步粘滞 / 月视图选中日期格不显示蓝色（一直落在今天）/ 日程模式日程操作改左键（见第 4 节 K32–K34）。

---

## 1. 项目总目标

开发一款**单机、离线、本地优先**的 Windows 桌面日程管理软件「日程通」，满足 PRD V2.1（ref-001）P0 全部 + P1 主要需求。核心场景：月视图管理日程、手机样式"日程模式"快速浏览当日、待办清单、悬浮球常驻快捷入口、系统提醒与开机自启。数据全部落本地 SQLite，无任何网络依赖。安装包目标 <20MB。

交付状态：✅ 开发与打包完成（0.1.0）｜⬜ 装机验收 / 性能抽查（未执行，见第 4 节 K10）

---

## 2. 最终交付产物

### 2.1 可分发产物

| 产物 | 路径 | 大小 |
|---|---|---|
| NSIS 安装包 | `src-tauri/target/release/bundle/nsis/SchedFlow_0.1.0_x64-setup.exe` | 2.32 MB（2026-08-21 第二轮 15:38 重新打包） |
| 免安装主程序 | `src-tauri/target/release/schedflow.exe` | 5.93 MB |

版本：应用 0.1.0 ｜ Tauri 2.11.5（bundler 2.9.4）｜ 目标平台 Windows x64（测试环境 Windows 11 Pro，WebView2 149）。修复轮未升版本号，安装包同名覆盖。

> ⚠️ **安装包为第二轮产物**：`SchedFlow_0.1.0_x64-setup.exe` 已含 K15–K20，但第三/四轮（K21–K29）改动**尚未重新打包**。装机验收通过后需按 5.2 配方重建（PowerShell + cwd=schedflow + 镜像变量）。

### 2.2 源码树（定稿）

```
schedflow/
├── index.html / package.json / vite.config.ts / tsconfig.json
├── src/
│   ├── main.tsx                    # 主窗口入口
│   ├── float/FloatApp.tsx          # 悬浮球窗口入口（独立入口）
│   ├── App.tsx                     # 主界面壳（模式切换）
│   ├── styles/global.css           # Tailwind v4 utilities + 主题变量
│   ├── lib/  types.ts · date.ts · recurrence.ts · api.ts · theme.ts
│   ├── stores/ appStore · dataStore · settingsStore · filterStore · editorStore
│   └── components/
│       ├── layout/  Sidebar · Toolbar · DetailPanel
│       ├── month/   MonthView
│       ├── editor/  EventEditorModal · TodoEditorModal
│       ├── todos/   TodoList
│       ├── schedule/ ScheduleView
│       ├── search/  SearchPanel
│       └── settings/ SettingsPage
└── src-tauri/
    ├── Cargo.toml · build.rs · tauri.conf.json · .cargo/config.toml
    ├── capabilities/  main.json · float.json
    ├── src/  main.rs · lib.rs · db.rs · models.rs · error.rs · recurrence.rs · reminders.rs
    │   └── commands/  mod.rs · app.rs · events.rs · todos.rs · categories.rs · tags.rs · settings.rs · backup.rs
    └── icons/（tauri icon 生成）
```

### 2.3 主要功能（已交付）

- **月视图**：7 列网格、今日高亮、周末着色、分类色圆点、每格 ≤5 条摘要 + "+N"、上/下月切换、年月选择器、回到今天、单击详情、双击新建、日程跨格拖拽改期、待办拖入格子转日程、周起始日可设（默认周一）。
- **日程模式**：自适应窗口宽度的手机样式（**窗口不再缩放、内容随窗口宽度拉伸**，`scheduleModeWidth` 设置项已移除）、顶部周条（切周/高亮今天）、下拉小月历、当日时间线、点空白/＋ 新建、日程拖到周条改期。
- **待办清单**：快速新增、提醒时间、优先级/标签/备注、排序、待办⇄日程互转（拖拽/移除日期）；未读提醒列表（提醒后侧边栏待办项出红点 → 点入待办页顶部显示未读提醒，逐条标记已读并跳转定位——日程→月视图当天、待办→轻提示，一键「全部已读」清红点）。
- **悬浮球**：四边停靠 + 悬停展开（`DOCK_THRESHOLD=48` 物理 px；左/右→竖条、上/下→横条，仅露 `SLIVER=8` 物理 px 细条；窗口恒 `winSize×winSize` 不 resize，球溢出窗口边界被 OS 裁剪成细条，悬停滑出完整圆球）、单击细条打开快捷面板（面板 header 锚点球点击收起、还原停靠条）、真实拖动才解除停靠、`floatDock/floatX/floatY` 持久化重启恢复；拖动按 DPI 缩放换算 + rAF 合并、跟手；位置记忆、红色角标、提醒气泡、右键菜单（打开主窗/快加待办/快加日程/退出）、大小可调、关闭主窗即缩小为悬浮球；窗口背景全透明（`background_color` alpha=0，圆球周围不显示白底）、阴影为圆形 drop-shadow（非方形 box-shadow）、hover 放大不溢出窗口、右键菜单在窗口内绘制（临时放大窗口并补偿圆球偏移，圆球的屏幕位置完全不动）；停靠窗口完全在屏内且大于球窗，根容器 `pointer-events:none`、仅交互子元素 `pointer-events:auto`，停靠条旁透明区不挡桌面点击。
- **系统托盘**：启动后在右下角通知区显示图标，左键单击打开主窗，右键菜单「打开主窗口 / 设置 / 退出」；「设置」联动主窗切到设置页。
- **提醒**：Rust 后台线程每 15s 轮询、重复日程展开计算、`notifications` 表防重、系统通知 + 悬浮球联动、免打扰时段、错过补发、待办一次性提醒。
- **重复日程**：每天/每周/每月/每年/自定义（每 N 天/周/月、工作日）；编辑/删除支持"整个系列"与"仅本次"（仅本次 = 复制非重复 + excluded_dates 排除）。
- **开机自启**：默认开启，注册 `--minimized` 参数 → 只出悬浮球不弹主窗；single-instance 防重复启动。
- **全局快捷键**：Ctrl+Shift+A 快加待办、Ctrl+Shift+D 快加日程、Ctrl+Shift+X 显隐主窗。
- **分类/标签**：分类 CRUD+颜色（5 个内置分类不可删）、标签自由增删、按分类/标签/优先级/完成态筛选。
- **搜索**：全局搜索（标题/备注/标签），结果跳转定位。
- **数据管理**：本地 SQLite（WAL）、备份/恢复（复制库文件）、导出 JSON/CSV、导入 JSON、清空数据。
- **主题外观**：浅色/深色/跟随系统（antd darkAlgorithm）、字号调节、Windows 11 亚克力毛玻璃（window-vibrancy，失败降级纯色）。
- **设置页**：常规/视图/提醒/快捷键/外观/悬浮球六分节。

### 2.4 数据模型（定稿 schema，见 `src-tauri/src/db.rs`）

`categories / tags / events / todos / event_tags / todo_tags / notifications / settings` 八表。索引：events(start_date)、events(deleted)、todos(deleted)。写入走 WAL + synchronous NORMAL + foreign_keys ON。内置分类：工作/会议/个人/学习/其他。所有变更通过 `init_schema` 的 `CREATE TABLE IF NOT EXISTS` 做幂等迁移。

---

## 3. 整体架构 / 关键设计决策（定稿）

1. **数据层用 rusqlite + 类型化 Rust 命令**，不用 tauri-plugin-sql。重复展开、提醒调度、复杂查询放 Rust 后端，前端仅通过 `invoke` 调用类型化命令。前端无任何 SQL。
2. **多窗口**：`main`（1180×780，min 1000×660）+ `float`（64×64，透明/无边框/置顶/跳任务栏/初始隐藏，`background_color` 全透明）。关闭主窗 → 隐藏并显示悬浮球；双击悬浮球 → 恢复主窗；悬浮球右键"退出"才真正退出。单一前端 bundle，按 `getCurrentWindow().label` 路由到 main / float 入口。**月视图与日程模式共用同一窗口尺寸、内容自适应窗口宽度**（不再缩放窗口，日程模式不再限宽居中）。
3. **悬浮窗几何：物理/逻辑像素换算纪律**（K17/K26/K28/K29 的共性根因）：`win.setSize` 用 `LogicalSize`（会按 scaleFactor 放大成物理尺寸），`win.outerPosition()/currentMonitor()` 返回**物理像素**。所有边界判断/钳制（贴屏、四边吸附、面板/菜单/气泡翻转、停靠与临时解除、初始恢复）必须先用 `monitorOf()/toPhys()/clampPhys()` 换到物理像素再做；尺寸一律传 `LogicalSize(逻辑值)`。违反此条会在高 DPI 下溢出屏幕 / 球偏移 / 球丢失。
4. **悬浮球停靠设计（K27–K29 定稿）**：停靠窗口恒 `winSize×winSize`（与自由球同尺寸，**永不 resize**），完全在屏内、贴屏幕边缘；球 div 用 CSS `left/top` 溢出窗口靠屏一侧，被窗口边界裁剪只露 `SLIVER=8` 物理 px 细条；悬停时球滑回 `{WIN_PAD, WIN_PAD}` 变完整圆球，`transition:left/top` 平滑、全程不 resize 窗口。`docked` 状态与 `FloatState` 正交，配 `dockedRef`（持久记忆）+ `dockGeoRef`（几何快照）：面板/菜单/气泡弹出时 `undockFromDock()` 临时还原自由球但**保留 dockedRef**，收起 `restoreBallOrDock()` 还原停靠条；**永久解除停靠只在 `onPointerUp` 判定真实拖动（指针位移>5px）后走自由球分支**，`onPointerDown` 绝不解除（K29 根因）。`floatDock/floatX/floatY` 持久化于 settings 表，启动按停靠边重算窗口位置并钳制。
5. **悬浮窗 pointer-events 穿透 + 停靠命中区**：根容器 `pointer-events:none`，交互子元素（命中区/球/菜单/面板/气泡/锚点）`pointer-events:auto`；停靠窗口完全在屏内且大于球窗，不穿透会挡桌面点击。停靠时命中区铺满停靠窗口（原点 0,0，`{0,0,winSize,winSize}`），使"细条↔展开球"之间移动不闪烁；球为命中区子元素、`left/top` 即窗口相对坐标——命中区若带偏移会把球顶到窗口左上角（K28 根因）。
6. **系统托盘（后端实现）**：tauri 启用 `tray-icon` feature，托盘由 Rust 侧 `TrayIconBuilder` 创建——`build` 时经 `resources_table` 托管（强引用常驻，无需持活变量）；菜单事件 → `emit_to("main", "open-settings")` 联动前端；左键单击 → 打开主窗。前端无需任何托盘 API。
7. **UI 栈**：antd v5 负责组件 + 图标，Tailwind v4 仅引入 utilities（**不引入 preflight**，避免重置 antd 样式），dayjs 日期，zustand 状态，原生 HTML5 DnD 拖拽。
8. **重复日程按月范围动态展开**（不预生成实例），"仅本次"通过复制非重复实例 + `excluded_dates` 实现。
9. **提醒**：独立 Rust 线程 15s 轮询，`notifications` 表 `UNIQUE(entity_type, entity_id, occurrence_at)` 防重；免打扰/错过补发逻辑在后端完成。
10. **release 配置**：`panic=abort` + `codegen-units=1` + `lto` + `opt-level=s` + `strip` → 体积优先，产物 <20MB。
11. **包标识**：`com.schedflow.app`（不可改，见第 5 节）。

---

## 4. 当前已知缺陷列表

> 修复时逐条追加状态：`[待修] → [已修 vX.Y]`。严重度：🔴高（功能错误）🟡中（体验/一致性问题）🟢低（告警/工程欠账）。

| # | 严重度 | 描述 | 状态 |
|---|---|---|---|
| K1 | 🟢 | tauri-bundler 每次构建告警：identifier `com.schedflow.app` 以 `.app` 结尾，与 macOS bundle 扩展名冲突。Windows 无功能影响；修改会迁移数据目录，需与数据迁移一并做 | 待修 |
| K2 | 🟡 | 前端单 JS chunk 1063 KB（gzip 333 KB），超过 vite 500KB 阈值告警，影响首屏加载 | 待修 |
| K3 | 🟢 | MSVC linker 每次输出 `正在创建库 ...dll.lib 和对象 ...dll.exp` 警告（`[warn(linker_messages)]`），纯提示，无影响 | 待修 |
| K4 | 🟡 | Rust 后端零日志调用：`env_logger` 已初始化（lib.rs L20）但代码无任何 `log::*!`，运行时后端不可观测，排查困难 | 待修 |
| K5 | 🟢 | lib.rs 死代码：`close_to_float_checked`（AtomicBool 写入后从未读取，靠 `let _ =` 消警告）、`_app_handle_guard`（`#[allow(dead_code)]`），占位残留 | 待修 |
| K6 | 🟡 | 亚克力毛玻璃 `apply_acrylic` 返回值被忽略（`let _ =`），目标机效果未验证；降级纯色路径未实测 | 待修 |
| K7 | 🟢 | 安装包文件名 `SchedFlow_0.1.0_x64-setup.exe`（ASCII）与窗口标题/产品名"日程通"不一致 | 待修 |
| K8 | 🟡 | `security.csp: null`，未配置 Content-Security-Policy，存在 XSS 面；单机本地应用风险低但建议收紧 | 待修 |
| K9 | 🟢 | 提醒线程与 UI 命令共享同一 `Arc<Mutex<Connection>>`，大库下轮询持锁可能短暂阻塞主线程（数据量大时才明显） | 待修 |
| K10 | 🟢 | 计划内"性能抽查（5000+5000 条数据验证月视图/搜索响应）"尚未执行 | 待修 |
| K11 | 🔴 | **点击「创建日程」整树白屏**：`EventEditorModal` 的 `useMemo(reminderOptions)` 在早退 `if (!editor?.open) return null` 之后调用，弹窗打开时 hook 数量变化 → React 抛错 → 无 ErrorBoundary 整树卸载 | ✅ 已修（2026-08-21） |
| K12 | 🟡 | **悬浮球阴影异常**：透明窗口下 `box-shadow` 被 WebView2 渲染成**方形**阴影；hover 放大超出 64px 窗口被裁剪 | ✅ 已修：改 `filter: drop-shadow()` 跟随圆形轮廓；窗口加 `WIN_PAD` 留白 |
| K13 | 🟡 | **悬浮球右键菜单不显示**：antd `Dropdown` 弹出层（portal）被 64px 小窗口裁剪 | ✅ 已修：改窗口内自绘 `Menu`，打开时临时放大窗口（圆球屏幕位置保持不动），靠右吸附时向左翻转 |
| K14 | 🟢 | **缺系统托盘**：关闭主窗后只能靠悬浮球退出，右下角无常驻入口 | ✅ 已修：新增托盘（打开/设置/退出），左键单击开主窗，`Cargo.toml` 启用 `tray-icon` |
| K15 | 🟡 | **悬浮窗背景不透明白底**：`float` 窗口 `transparent:true` 但未设背景色，WebView2 默认白底把窗口涂白，圆球周围一圈白色 | ✅ 已修（2026-08-21 第二轮）：`background_color:"#00000000"`（Win8+ webview 层仅 alpha=0 才透明）+ 页面 `background:transparent` |
| K16 | 🟢 | 托盘右键菜单文案「退出日程通」冗长，与界面「退出」不一致 | ✅ 已修：改为「退出」 |
| K17 | 🟡 | **悬浮球拖动不跟手**：`e.screenX/Y` 为 CSS 像素而 `setPosition` 用物理像素，高 DPI 缩放（如 150%）下窗口移动比鼠标慢 | ✅ 已修：移动量乘以 `scaleFactor` + `requestAnimationFrame` 合并高频 pointermove |
| K18 | 🟡 | **悬浮球右键菜单弹出时窗口位置漂移**：`openMenu` 放大/位移窗口，圆球固定在窗口内 → 球的屏幕坐标被带偏（右缘吸附时左跳约 188px） | ✅ 已修：新增 `ballOffset` 随窗口位移补偿，保证圆球屏幕位置完全不变 |
| K19 | 🟡 | **日程模式固定 420px 限宽列**：不随窗口大小变化，窗口加宽后两侧留白 | ✅ 已修：改为自适应窗口宽度，移除 `scheduleModeWidth` 设置项，主窗口最小尺寸提高至 1000×660 |
| K20 | 🟢 | **侧边栏/导航按钮一圈黑线**：Tailwind 未引入 preflight，原生 `<button>` 保留浏览器默认外凸边框与焦点环 | ✅ 已修：全局 `button` 重置边框/背景/outline，`focus-visible` 自定义主题色焦点环 |
| K21 | 🟡 | **月视图右侧详情视图无法返回列表**：点日程圆点/列表项进入详情后无返回控件，只能切日期/完成/删除退出 | ✅ 已修（2026-08-24 第三轮）：详情标题行前加返回按钮 `selectEvent(null)` |
| K22 | 🟡 | **月视图右侧面板折叠/新建日程按钮多余**（需求调整）：取消右栏折叠（隐藏/显示）与新日程按钮 | ✅ 已修：移除 collapsed 分支、折叠按钮与"新建日程"按钮，面板恒显示；Toolbar 顶部"新建"、MonthView 双击新建、日程模式"+"保持不变 |
| K23 | 🟡 | **新建日程带出上次默认时间**：`Form.useForm` 实例跨 Modal 关闭持久化，新建分支 initial 缺 `startTime/endTime/categoryId/tagIds` 等 key → 重开时残留上次时间 | ✅ 已修：新建 initial 显式补全 undefined 字段 + 打开时 `resetFields()` 后再 `setFieldsValue(initial)`；顺带修复编辑重复日程时 repeat 下拉显示为"不重复" |
| K24 | 🟡 | **提醒通知疑似依赖 PowerShell**：部分电脑无 PowerShell 权限可能弹不出通知 | ✅ 已核实（无需改代码）：源码零 PowerShell 依赖，通知走 `tauri-plugin-notification`（WinRT toast）；即便 toast 被拒，悬浮球气泡 + 红点应用内兜底始终可用 |
| K25 | 🟡 | **提醒后待办红点点击无反应**：红点由 `unreadCount` 驱动但前端从不调用 `list_unread_reminders`/`mark_reminders_read`，`read=0` 永不清 → 红点常驻 | ✅ 已修：待办页顶部显示未读提醒列表，点条目标记已读并跳转（日程→月视图定位，待办→提示），"全部已读"一键清除；`mark_*` 不发射 `data-changed`，标记后手动 `refreshUnread()` 清红点 |
| K26 | 🔴 | **悬浮球面板不能完整显示且球消失、位置漂移**：`openPanel` 用逻辑尺寸对比物理 monitor 尺寸，`setSize(LogicalSize)` 又按 scaleFactor 放大 → 高 DPI（125%/150%）下面板溢出屏幕；球只在 ball/menu 态渲染，面板态被移除；窗口被挪到面板位 | ✅ 已修：几何统一换算（`monitorOf/toPhys/clampPhys` 全物理像素钳制，尺寸仍 `LogicalSize`），面板随球屏幕位锚定、右侧/底部放不下自动翻转；面板 header 加 `sf-float-anchor` 迷你锚点球，点击即收起（球不再消失） |
| K27 | 🟡 | **悬浮球仅右缘吸附且吸附后遮挡桌面** | ✅ 已修：支持四边停靠（`DOCK_THRESHOLD=48`，左/右→竖条、上/下→横条），停靠时窗口恒 `winSize×winSize` 贴边、球溢出窗口边界被 OS 裁剪成 `SLIVER=8px` 长条，悬停滑出完整圆球（`transition` 不 resize 窗口）；根容器 `pointer-events:none`，停靠条旁透明区不挡桌面点击；`floatDock` 设置持久化，重启恢复停靠态 |
| K28 | 🟡 | **悬停展开的球被顶到窗口左上角、右侧/下方空出 12px 透明区（像被透明边框遮挡）**：命中区 div 定位在 `WIN_PAD-HOVER_MARGIN=-6`，球是其子元素，`left/top` 相对命中区而非窗口 → 展开球实际落在窗口 `[0,0]`（本应 `[6,6]`），左/上贴边阴影被裁、右/下空出 12px；细条也由 8px 变 12.4px | ✅ 已修（2026-08-24 第四轮）：停靠悬停命中区改为铺满停靠窗口（原点 0,0，`{0,0,winSize,winSize}`），球 `left/top` 即窗口相对坐标 → 展开球精确居中（四周各 6px 留白，与自由球一致），细条恢复精确 8 物理 px；命中区本身原已随窗口边界裁剪铺满全窗，覆盖范围不变 |
| K29 | 🔴 | **单击停靠长条后球位移消失、收起/重启后球或长条都不出现**：`onPointerDown` 对任何按下（含单击）都执行"永久解除停靠"（清 `floatDock`+`setDockedState(null)`）；`undockFromDock()` 对左/上/下停靠（`ballRest` 为负）把窗口挪到屏幕外（如 `m.x-80`）；随后 `openPanel`/收起按屏外位置归位 → 球不可见；重启按残留的屏外 `floatX/Y` 恢复也不见 | ✅ 已修：按下不再解除停靠，单击细条走 `openPanel`（临时解除、收起 `restoreBallOrDock` 还原停靠条）；仅 `onPointerUp` 判定为真实拖动（`d.moving`）时走自由球分支清停靠态；`undockFromDock()` 加 `clampPhys` 钳制保证窗口完整在屏内；初始位置恢复按停靠边重算窗口位置并钳制，历史屏外坐标不再导致球丢失 |
| K30 | 🟡 | **悬浮球自由态右下角被正方形窗口裁剪**：命中区容器定位在 `(WIN_PAD,WIN_PAD)`，球是其子元素且 `left/top` 又取 `(WIN_PAD,WIN_PAD)` → 球窗口相对坐标变成 `2×WIN_PAD`，右/下边缘正好顶到窗口边（`winSize=ballSize+2×WIN_PAD`）被裁一圈；且 `WIN_PAD=6` 小于 drop-shadow 模糊外延（`0 3px 8px`≈11px），阴影也被切成"方形"（K28 同类"命中区偏移"问题，自由球分支漏修） | ✅ 已修（2026-08-24 第五轮）：球 div `left/top` 改为相对命中区原点（`ballCss.x-hitCss.x`），球窗口坐标恒为 `ballCss`、四边各留 `WIN_PAD` 内边距；`WIN_PAD` 6→12 盖过阴影外延；停靠/面板/菜单/气泡锚点几何随 `WIN_PAD` 一致放大，无其他影响 |
| K31 | 🟡 | **日程模式小月历打开时当前周重复显示**：顶部周条渲染当前周 7 天，下拉小月历（`getMonthGrid` 42 格月网格）又含当前周一行 → 同一天期同时出现两处 | ✅ 已修（2026-08-24 第五轮）：小月历打开时用条件渲染**替换**顶部周条（二者互斥，不再叠加），关闭后周条恢复（切周/高亮今天/拖拽改期保留）；代价：小月历打开期间周条拖拽改期暂不可用 |
| K32 | 🟡 | **悬浮球拖动起步粘滞、不跟手**：`onPointerDown` 需等 `outerPosition()+currentMonitor()` 两次 IPC 完成才建立 `dragRef`，期间的 pointermove 全部被丢弃 → 起步先停顿、随后跳到当前位移；且 rAF 应用位置后不回写窗口位置，跨次拖动起点会错 | ✅ 已修（2026-08-25 第六轮）：新增 `winPosRef/scaleRef` 缓存，所有 `setPosition` 统一走 `placeWindow` 记录物理位置；`onPointerDown` 用缓存**同步**建立 dragRef（按下即跟手），异步 `Promise.all([outerPosition,currentMonitor])` 校正真实几何不阻塞拖动；rAF 回写最新位置并 `Math.round` 取整，`onPointerMove` 记录最新指针坐标供校正重算 |
| K33 | 🟡 | **月视图选中日期无蓝色反馈，蓝框一直落在"今天"**：网格仅按 `isToday` 应用 `.today`（整格蓝框 + 日期数字蓝实心圆），选中日期不渲染任何选中态 | ✅ 已修（2026-08-25 第六轮）：按 `d.isSame(selectedDate,"day")` 给格子加 `.selected`（蓝框 + 浅蓝底）——选中哪格哪格变蓝；今天改为日期数字外圈描边（`.today-num` 由实心改描边），不再整格常蓝 |
| K34 | 🟡 | **日程模式日程操作必须右键才出菜单**：日程卡片 `Dropdown trigger=["contextMenu"]`，编辑/完成/转待办/删除只有右键可见，与左键交互预期不符 | ✅ 已修（2026-08-25 第六轮）：改为 `trigger=["click"]` 左键直接弹出操作菜单；移除原单击选中逻辑与失效的 `selectedEventId/selectEvent` 引用（日程模式无详情面板，单击选中无意义） |

---

## 5. 约束与边界

### 5.1 技术栈（锁定，不可换）

- 前端：React 18.3 + TypeScript 5.7 + Vite 6.4 + antd 5.24 + zustand 5 + dayjs 1.11 + Tailwind 4.1（仅 utilities）
- 后端：Tauri 2.11（rust 1.77.2+，edition 2021）+ rusqlite 0.32（bundled）+ chrono 0.4 + env_logger
- 插件：notification / autostart / global-shortcut / single-instance / dialog（均 v2）
- 系统托盘：tauri `features = ["tray-icon"]`（内置，非插件）
- 打包：tauri-bundler 2.9.4，target `nsis`

### 5.2 外部依赖与网络环境

- **GitHub 直连被墙**：打包机必须设 `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR=https://gh.ddlc.top`（同一 PowerShell 命令内设好再 `npm run tauri build`）。换机器/重装必须重设。详见记忆 ref-004。
- crates 走 `.cargo/config.toml` sparse 镜像（rsproxy.cn，含 `[http] check-revoke=false`）；npm 走 registry.npmmirror.com。⚠️ 该配置只在 **PowerShell 且 cwd=schedflow** 时稳定生效——Git Bash 后台 shell 下 cargo 会读不到项目内配置而直连 crates.io 超时。规避：构建一律走 PowerShell（本文件 5.2 顶部配方），或用内联 `cargo --config 'source.crates-io.replace-with="rsproxy-sparse"'`。
- 运行时依赖系统 WebView2（Windows 10/11 自带，本机 149）。

### 5.3 不能改动的部分（改了有代价）

- **包标识 `com.schedflow.app`**：改动会更换 `%APPDATA%` 数据目录（现有数据不可见）并失效开机自启注册。
- **数据库 schema**：`db.rs` 的 8 表结构是 V1 基线，未来变更必须走幂等迁移，禁止直接改表/删列。
- **内置分类 5 个**（工作/会议/个人/学习/其他，`is_builtin=1`）：不可删，删除分类 → 归"未分类"。
- **能力清单** `capabilities/main.json`、`float.json`：权限最小集已按窗口隔离，新增前端权限需同步改对应清单。
- **关闭主窗 = 隐藏为悬浮球**的交互契约（PRD P0），改动需产品确认。

### 5.4 范围边界（V1.0 明确不做，P2 预留）

自动备份定时任务、通知"稍后提醒/标记完成"快捷操作、待办拖拽排序持久化、CSV 导入；移动端/Web/云同步/ICS 导出/自然语言解析（PRD 明示 V1.0 不含）。

---

## 6. 参考索引

外部数据库保存完整原始会话与旧输出，**不放入本文件**：

| ref | 内容 | 存放位置 |
|---|---|---|
| ref-001 | 需求规格说明书 V2.1（2026-08-17） | `C:\Users\cpic\Desktop\TODO\Windows 桌面日程管理软件需求规格说明书.docx` |
| ref-002 | 完整开发会话记录（决策全过程、报错与修复） | `C:\Users\cpic\.claude\projects\c--Users-cpic-Desktop-TODO\08ddf9a7-bd9a-4667-96d0-15e633182d66.jsonl` |
| ref-003 | 实施计划（阶段划分、验证方式） | `C:\Users\cpic\.claude\plans\whimsical-giggling-russell.md` |
| ref-004 | NSIS GitHub 镜像修复记忆 | `C:\Users\cpic\.claude\projects\c--Users-cpic-Desktop-TODO\memory\tauri-nsis-github-mirror.md` |
| ref-005 | tauri-bundler 2.9.4 镜像重写逻辑源码（`http_utils.rs`，经 gh.ddlc.top 拉取） | 外部（原始网络抓取，不在工程内） |
| ref-006 | 首次构建失败日志 + `tauri dev` 冒烟日志 | `%TEMP%\claude\...\tasks\btamqc45a.output`、`brx5w1jkc.output` |
| ref-007 | 2026-08-21 修复轮构建日志（含 `$env:` 被 bash 吞掉的报错、最终 makensis 成功） | `C:\Users\cpic\Desktop\TODO\build_log.txt` |
| ref-008 | 2026-08-21 第二轮（六项调整）构建日志 | `C:\Users\cpic\Desktop\TODO\build_log2.txt` |
| ref-009 | 第三轮修复计划（K21–K27；第四轮 K28–K29 按其几何纪律直接执行） | `C:\Users\cpic\.claude\plans\binary-honking-cloud.md` |
| ref-010 | 技术栈快速上手文档（零基础入门：架构/数据流/目录地图/操作手册/常见坑） | `C:\Users\cpic\Desktop\TODO\schedflow\快速上手.md` |
