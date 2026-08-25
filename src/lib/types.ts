// 与 Rust 后端 models.rs 对应的类型定义

export interface RecurrenceRule {
  type: "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval: number; // 每 N 天/周/月/年
  daysOfWeek: number[]; // ISO 1=周一 … 7=周日
  byWeekday: boolean; // 仅工作日
  endDate: string | null; // YYYY-MM-DD
}

export interface DayEvent {
  id: number;
  title: string;
  notes: string;
  categoryId: number | null;
  occurrenceDate: string; // YYYY-MM-DD
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  recurrenceRule: string | null;
  isRecurring: boolean;
  reminderEnabled: boolean;
  reminderOffsetMinutes: number;
  priority: number;
  completed: boolean;
  tags: number[];
  categoryColor: string | null;
  categoryName: string | null;
}

export interface Event {
  id: number;
  title: string;
  notes: string;
  categoryId: number | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  recurrenceRule: string | null;
  reminderEnabled: boolean;
  reminderOffsetMinutes: number;
  priority: number;
  completed: boolean;
  excludedDates: string | null;
  createdAt: string;
  updatedAt: string;
  tags: number[];
}

export interface EventInput {
  title: string;
  notes?: string | null;
  categoryId?: number | null;
  startDate: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isAllDay?: boolean;
  recurrenceRule?: string | null;
  reminderEnabled?: boolean;
  reminderOffsetMinutes?: number;
  priority?: number;
  completed?: boolean;
  tagIds?: number[] | null;
}

export interface Todo {
  id: number;
  title: string;
  notes: string;
  categoryId: number | null;
  priority: number;
  reminderAt: string | null;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  tags: number[];
  categoryColor: string | null;
  categoryName: string | null;
}

export interface TodoInput {
  title: string;
  notes?: string | null;
  categoryId?: number | null;
  priority?: number;
  reminderAt?: string | null;
  completed?: boolean;
  tagIds?: number[] | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  isBuiltin: boolean;
}

export interface Tag {
  id: number;
  name: string;
}

export interface ReminderInfo {
  id: number;
  entityType: "event" | "todo";
  entityId: number;
  title: string;
  notes: string;
  occurrenceAt: string;
}

export interface Settings {
  autostart: boolean;
  closeToFloat: boolean;
  weekStart: number; // 1=周一, 7=周日
  timeFormat: "12" | "24";
  weekendColor: boolean;
  scheduleModeWidth: number;
  defaultReminderOffset: number;
  notifySound: boolean;
  dndEnabled: boolean;
  dndStart: string;
  dndEnd: string;
  theme: "light" | "dark" | "system";
  fontSize: number;
  floatEnabled: boolean;
  floatSize: number;
  floatOpacity: number;
  floatShowBadge: boolean;
  floatX: number | null;
  floatY: number | null;
  lastMode: "month" | "schedule" | "todos";
  [key: string]: unknown;
}

export type Mode = "month" | "schedule" | "todos" | "search" | "settings";
