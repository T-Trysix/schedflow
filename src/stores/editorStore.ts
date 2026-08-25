import { create } from "zustand";
import type { Event, Todo } from "@/lib/types";

interface EditorState {
  eventEditor: {
    open: boolean;
    event?: Event | null;
    occurrenceDate?: string | null;
    defaultDate?: string | null;
  } | null;
  todoEditor: { open: boolean; todo?: Todo | null } | null;
  openEventEditor: (opts?: {
    event?: Event | null;
    occurrenceDate?: string | null;
    defaultDate?: string | null;
  }) => void;
  closeEventEditor: () => void;
  openTodoEditor: (opts?: { todo?: Todo | null }) => void;
  closeTodoEditor: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  eventEditor: null,
  todoEditor: null,

  openEventEditor: (opts) =>
    set({
      eventEditor: {
        open: true,
        event: opts?.event ?? null,
        occurrenceDate: opts?.occurrenceDate ?? null,
        defaultDate: opts?.defaultDate ?? null,
      },
    }),
  closeEventEditor: () => set({ eventEditor: null }),

  openTodoEditor: (opts) =>
    set({ todoEditor: { open: true, todo: opts?.todo ?? null } }),
  closeTodoEditor: () => set({ todoEditor: null }),
}));
