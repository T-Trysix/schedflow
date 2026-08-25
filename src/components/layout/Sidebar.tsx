import { Button, Tooltip } from "antd";
import {
  CalendarOutlined,
  CheckSquareOutlined,
  MobileOutlined,
  SearchOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useAppStore } from "@/stores/appStore";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import type { Mode } from "@/lib/types";

const NAV: { key: Mode; label: string; icon: React.ReactNode }[] = [
  { key: "month", label: "月视图", icon: <CalendarOutlined /> },
  { key: "schedule", label: "日程模式", icon: <MobileOutlined /> },
  { key: "todos", label: "待办清单", icon: <CheckSquareOutlined /> },
  { key: "search", label: "搜索", icon: <SearchOutlined /> },
];

export default function Sidebar() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const categories = useDataStore((s) => s.categories);
  const filter = useFilterStore();
  const unread = useDataStore((s) => s.unreadCount);

  return (
    <aside className="w-48 shrink-0 flex flex-col border-r border-[var(--sf-border)] bg-[var(--sf-bg-panel)]">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2 px-4 shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold"
          style={{ background: "linear-gradient(135deg,#1677ff,#6366f1)" }}
        >
          日
        </div>
        <span className="text-[15px] font-semibold text-[var(--sf-text)]">日程通</span>
      </div>

      {/* 导航 */}
      <nav className="px-2 space-y-0.5">
        {NAV.map((item) => (
          <button
            key={item.key}
            onClick={() => setMode(item.key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors cursor-pointer ${
              mode === item.key
                ? "bg-[color-mix(in_srgb,var(--sf-today-ring)_12%,transparent)] text-[var(--sf-today-ring)] font-medium"
                : "text-[var(--sf-text-secondary)] hover:bg-[var(--sf-hover)] hover:text-[var(--sf-text)]"
            }`}
          >
            <span className="text-[15px]">{item.icon}</span>
            {item.label}
            {item.key === "todos" && unread > 0 && (
              <span className="ml-auto text-[11px] bg-[#ff4d4f] text-white rounded-full px-1.5 min-w-[18px] text-center">
                {unread}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* 分类筛选 */}
      <div className="flex-1 overflow-y-auto mt-3 px-2 pb-2">
        <div className="px-3 py-1 text-[11px] text-[var(--sf-text-secondary)]">分类</div>
        <button
          onClick={() => filter.set({ categoryId: null })}
          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12.5px] cursor-pointer ${
            filter.categoryId === null
              ? "bg-[var(--sf-hover)] text-[var(--sf-text)] font-medium"
              : "text-[var(--sf-text-secondary)] hover:bg-[var(--sf-hover)]"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full border border-[var(--sf-text-secondary)]" />
          全部
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => filter.set({ categoryId: filter.categoryId === c.id ? null : c.id })}
            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12.5px] cursor-pointer ${
              filter.categoryId === c.id
                ? "bg-[var(--sf-hover)] text-[var(--sf-text)] font-medium"
                : "text-[var(--sf-text-secondary)] hover:bg-[var(--sf-hover)]"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>

      {/* 底部：设置 */}
      <div className="p-2 border-t border-[var(--sf-border)]">
        <Tooltip title="设置" placement="right">
          <Button
            type="text"
            icon={<SettingOutlined />}
            className="w-full"
            onClick={() => setMode("settings")}
          >
            设置
          </Button>
        </Tooltip>
      </div>
    </aside>
  );
}
