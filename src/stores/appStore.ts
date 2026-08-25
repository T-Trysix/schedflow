import { create } from "zustand";
import type { Dayjs } from "dayjs";
import type { Mode } from "@/lib/types";
import { dayjs } from "@/lib/date";
import type { ThemeMode } from "@/lib/theme";
import { useSettingsStore } from "./settingsStore";

interface AppState {
  mode: Mode;
  currentMonth: Dayjs; // 月视图当前月份
  selectedDate: Dayjs; // 日程模式选中日期 / 月视图右侧详情面板日期
  weekAnchor: Dayjs; // 日程模式周条锚点
  searchQuery: string;
  resolvedTheme: ThemeMode;
  selectedEventId: number | null;
  selectedOccurrenceDate: string | null;
  setMode: (m: Mode) => Promise<void>;
  setCurrentMonth: (d: Dayjs) => void;
  setSelectedDate: (d: Dayjs) => void;
  setWeekAnchor: (d: Dayjs) => void;
  setSearchQuery: (q: string) => void;
  setResolvedTheme: (t: ThemeMode) => void;
  selectEvent: (id: number | null, occurrenceDate?: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: "month",
  currentMonth: dayjs().startOf("month"),
  selectedDate: dayjs(),
  weekAnchor: dayjs(),
  searchQuery: "",
  resolvedTheme: "light",
  selectedEventId: null,
  selectedOccurrenceDate: null,

  setMode: async (m) => {
    // 需求变更：月视图与日程模式统一使用同一窗口尺寸，不再缩放窗口。
    // 日程模式的手机样式由 ScheduleView 内部以 max-width 居中实现。
    set({ mode: m, searchQuery: m === "search" ? get().searchQuery : "" });
    if (m === "month" || m === "schedule" || m === "todos") {
      useSettingsStore.getState().set("lastMode", m);
    }
  },

  setCurrentMonth: (d) => set({ currentMonth: d, selectedEventId: null }),
  setSelectedDate: (d) => set({ selectedDate: d, selectedEventId: null }),
  setWeekAnchor: (d) => set({ weekAnchor: d }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setResolvedTheme: (t) => set({ resolvedTheme: t }),
  selectEvent: (id, occurrenceDate) =>
    set({ selectedEventId: id, selectedOccurrenceDate: occurrenceDate ?? null }),
}));
