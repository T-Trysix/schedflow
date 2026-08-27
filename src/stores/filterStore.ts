import { create } from "zustand";

export type StatusFilter = "all" | "active" | "done";

interface FilterState {
  categoryId: number | null;
  tagIds: number[];
  status: StatusFilter;
  priority: number | null;
  set: (partial: Partial<Omit<FilterState, "set">>) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  categoryId: null,
  tagIds: [],
  status: "all",
  priority: null,
  set: (partial) => set(partial),
  reset: () => set({ categoryId: null, tagIds: [], status: "all", priority: null }),
}));

// 各视图（月视图/日程模式/详情面板/待办/搜索）统一的筛选谓词。
// DayEvent / Event / Todo 均满足该形状；status/priority 目前无 UI 入口恒为默认值。
export function matchesFilter(
  e: { categoryId: number | null; priority: number; completed: boolean },
  f: FilterState,
): boolean {
  if (f.categoryId !== null && e.categoryId !== f.categoryId) return false;
  if (f.status === "done" && !e.completed) return false;
  if (f.status === "active" && e.completed) return false;
  if (f.priority !== null && e.priority !== f.priority) return false;
  return true;
}
