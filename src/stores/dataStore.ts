import { create } from "zustand";
import { api } from "@/lib/api";
import type { Category, DayEvent, Tag, Todo } from "@/lib/types";

interface DataState {
  events: DayEvent[];
  todos: Todo[];
  categories: Category[];
  tags: Tag[];
  unreadCount: number;
  loadingEvents: boolean;
  loadedRange: [string, string] | null;
  setEvents: (e: DayEvent[], start: string, end: string) => void;
  loadEvents: (start: string, end: string) => Promise<void>;
  loadTodos: () => Promise<void>;
  loadMeta: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  reloadAll: () => Promise<void>;
}

export const useDataStore = create<DataState>((set, get) => ({
  events: [],
  todos: [],
  categories: [],
  tags: [],
  unreadCount: 0,
  loadingEvents: false,
  loadedRange: null,

  setEvents: (e, start, end) => set({ events: e, loadedRange: [start, end] }),

  loadEvents: async (start, end) => {
    const cur = get().loadedRange;
    if (cur && cur[0] === start && cur[1] === end) return;
    set({ loadingEvents: true });
    try {
      const events = await api.listEventsByRange(start, end);
      set({ events, loadedRange: [start, end] });
    } finally {
      set({ loadingEvents: false });
    }
  },

  loadTodos: async () => {
    try {
      const todos = await api.listTodos();
      set({ todos });
    } catch (e) {
      console.error("加载待办失败", e);
    }
  },

  loadMeta: async () => {
    try {
      const [categories, tags] = await Promise.all([api.listCategories(), api.listTags()]);
      set({ categories, tags });
    } catch (e) {
      console.error("加载分类/标签失败", e);
    }
  },

  refreshUnread: async () => {
    try {
      const unreadCount = await api.unreadCount();
      set({ unreadCount });
    } catch {
      /* ignore */
    }
  },

  reloadAll: async () => {
    const cur = get().loadedRange;
    const [todos, categories, tags] = await Promise.all([
      api.listTodos(),
      api.listCategories(),
      api.listTags(),
    ]);
    set({ todos, categories, tags });
    if (cur) {
      try {
        const events = await api.listEventsByRange(cur[0], cur[1]);
        set({ events });
      } catch (e) {
        console.error("刷新日程失败", e);
      }
    }
    await get().refreshUnread();
  },
}));
