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
