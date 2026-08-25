import { useEffect, useRef } from "react";
import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { listen } from "@tauri-apps/api/event";
import Sidebar from "./components/layout/Sidebar";
import Toolbar from "./components/layout/Toolbar";
import DetailPanel from "./components/layout/DetailPanel";
import MonthView from "./components/month/MonthView";
import ScheduleView from "./components/schedule/ScheduleView";
import TodoList from "./components/todos/TodoList";
import SearchPanel from "./components/search/SearchPanel";
import SettingsPage from "./components/settings/SettingsPage";
import EventEditorModal from "./components/editor/EventEditorModal";
import TodoEditorModal from "./components/editor/TodoEditorModal";
import { useAppStore } from "./stores/appStore";
import { useDataStore } from "./stores/dataStore";
import { useEditorStore } from "./stores/editorStore";
import { useSettingsStore } from "./stores/settingsStore";
import { api } from "./lib/api";
import { dayjs, fmtDate } from "./lib/date";

const MODE_KEY_SHORTCUT: Record<string, "month" | "schedule" | "todos" | "search"> = {
  "1": "month",
  "2": "schedule",
  "3": "todos",
  "f": "search",
};

export default function App() {
  const mode = useAppStore((s) => s.mode);
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const setMode = useAppStore((s) => s.setMode);
  const fontSize = useSettingsStore((s) => s.settings.fontSize) || 14;
  const initRef = useRef(false);

  // 初始化：加载数据 + 恢复上次视图 + 事件监听
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const store = useDataStore.getState();
    const lastMode = useSettingsStore.getState().settings.lastMode;
    if (lastMode && lastMode !== "month") {
      useAppStore.getState().setMode(lastMode);
    }
    store.loadMeta();
    store.loadTodos();
    store.refreshUnread();
    store.loadEvents(fmtDate(dayjs().startOf("month").subtract(1, "month")), fmtDate(dayjs().endOf("month").add(1, "month")));

    // ---- 跨窗口事件 ----
    const unShortcut = listen<string>("global-shortcut", (ev) => {
      const a = ev.payload;
      if (a === "add_todo") {
        api.showMain();
        useEditorStore.getState().openTodoEditor({});
      } else if (a === "add_event") {
        api.showMain();
        useEditorStore.getState().openEventEditor({});
      } else if (a === "toggle_main") {
        useDataStore.getState().reloadAll();
      }
    });
    const unData = listen("data-changed", () => {
      useDataStore.getState().reloadAll();
    });
    const unReminder = listen("reminder-fired", () => {
      useDataStore.getState().refreshUnread();
    });
    // 系统托盘"设置"菜单 → 打开主窗并切到设置页
    const unOpenSettings = listen("open-settings", () => {
      useAppStore.getState().setMode("settings");
    });

    const onFocus = () => useDataStore.getState().reloadAll();
    window.addEventListener("focus", onFocus);

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.ctrlKey && !e.shiftKey && !editing) {
        const k = e.key.toLowerCase();
        if (k === "n") {
          e.preventDefault();
          useEditorStore.getState().openEventEditor({});
          return;
        }
        if (k in MODE_KEY_SHORTCUT) {
          e.preventDefault();
          setMode(MODE_KEY_SHORTCUT[k]);
        }
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      unShortcut.then((f) => f());
      unData.then((f) => f());
      unReminder.then((f) => f());
      unOpenSettings.then((f) => f());
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKey);
    };
  }, [setMode]);

  const isDark = resolvedTheme === "dark";

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
          fontSize,
        },
      }}
    >
      <AntApp>
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--sf-bg)] text-[var(--sf-text)]">
          <div className="flex flex-1 min-h-0">
            <Sidebar />
            <main className="flex flex-1 min-h-0 flex-col">
              {mode !== "settings" && <Toolbar />}
              <div className="flex flex-1 min-h-0">
                <div className="flex flex-1 min-h-0">
                  {mode === "month" && <MonthView />}
                  {mode === "schedule" && <ScheduleView />}
                  {mode === "todos" && <TodoList />}
                  {mode === "search" && <SearchPanel />}
                  {mode === "settings" && <SettingsPage />}
                </div>
                {mode === "month" && <DetailPanel />}
              </div>
            </main>
          </div>
          <EventEditorModal />
          <TodoEditorModal />
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
