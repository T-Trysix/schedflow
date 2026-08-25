import { invoke } from "@tauri-apps/api/core";
import type {
  Category,
  DayEvent,
  Event,
  EventInput,
  ReminderInfo,
  Tag,
  Todo,
  TodoInput,
} from "./types";

export const api = {
  // ---- 窗口/应用 ----
  showMain: () => invoke("show_main"),
  hideMain: () => invoke("hide_main"),
  toggleMain: () => invoke("toggle_main"),
  showFloat: () => invoke("show_float"),
  hideFloat: () => invoke("hide_float"),
  exitApp: () => invoke("exit_app"),
  setAutostart: (enabled: boolean) => invoke<boolean>("set_autostart", { enabled }),
  getAutostart: () => invoke<boolean>("get_autostart"),
  isFloatVisible: () => invoke<boolean>("is_float_visible"),

  // ---- 日程 ----
  listEventsByRange: (start: string, end: string) =>
    invoke<DayEvent[]>("list_events_by_range", { start, end }),
  getEvent: (id: number) => invoke<Event>("get_event", { id }),
  createEvent: (input: EventInput) => invoke<number>("create_event", { input }),
  updateEvent: (id: number, input: EventInput, mode?: string, occurrenceDate?: string) =>
    invoke("update_event", { id, input, mode, occurrenceDate }),
  deleteEvent: (id: number, mode?: string, occurrenceDate?: string) =>
    invoke("delete_event", { id, mode, occurrenceDate }),
  setEventCompleted: (id: number, completed: boolean) =>
    invoke("set_event_completed", { id, completed }),
  moveEvent: (id: number, newDate: string, occurrenceDate?: string) =>
    invoke("move_event", { id, newDate, occurrenceDate }),
  eventToTodo: (id: number, occurrenceDate?: string) =>
    invoke<number>("event_to_todo", { id, occurrenceDate }),
  searchEvents: (q: string) => invoke<Event[]>("search_events", { q }),

  // ---- 待办 ----
  listTodos: () => invoke<Todo[]>("list_todos"),
  getTodo: (id: number) => invoke<Todo>("get_todo", { id }),
  createTodo: (input: TodoInput) => invoke<number>("create_todo", { input }),
  updateTodo: (id: number, input: TodoInput) => invoke("update_todo", { id, input }),
  deleteTodo: (id: number) => invoke("delete_todo", { id }),
  setTodoCompleted: (id: number, completed: boolean) =>
    invoke("set_todo_completed", { id, completed }),
  reorderTodos: (ids: number[]) => invoke("reorder_todos", { ids }),
  todoToEvent: (id: number, date: string, startTime?: string) =>
    invoke<number>("todo_to_event", { id, date, startTime }),
  searchTodos: (q: string) => invoke<Todo[]>("search_todos", { q }),

  // ---- 分类/标签 ----
  listCategories: () => invoke<Category[]>("list_categories"),
  createCategory: (name: string, color: string) =>
    invoke<number>("create_category", { name, color }),
  updateCategory: (id: number, name: string, color: string) =>
    invoke("update_category", { id, name, color }),
  deleteCategory: (id: number) => invoke("delete_category", { id }),
  listTags: () => invoke<Tag[]>("list_tags"),
  createTag: (name: string) => invoke<number>("create_tag", { name }),
  deleteTag: (id: number) => invoke("delete_tag", { id }),

  // ---- 设置 ----
  getSettings: () => invoke<Record<string, unknown>>("get_settings"),
  setSetting: (key: string, value: unknown) => invoke("set_setting", { key, value }),
  setSettings: (map: Record<string, unknown>) => invoke("set_settings", { map }),

  // ---- 数据 ----
  backupDb: (path?: string) => invoke<string>("backup_db", { path }),
  restoreDb: (path?: string) => invoke("restore_db", { path }),
  exportJson: (path?: string) => invoke<string>("export_json", { path }),
  exportCsv: (dir?: string) => invoke<string>("export_csv", { dir }),
  importJson: (path?: string) => invoke<number>("import_json", { path }),
  clearAllData: () => invoke("clear_all_data"),

  // ---- 提醒 ----
  unreadCount: () => invoke<number>("unread_reminder_count"),
  listUnreadReminders: () => invoke<ReminderInfo[]>("list_unread_reminders"),
  markRemindersRead: (ids: number[]) => invoke("mark_reminders_read", { ids }),
  markAllRemindersRead: () => invoke("mark_all_reminders_read"),
};
