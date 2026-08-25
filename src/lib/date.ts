import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");

export { dayjs };

/** ISO 星期：1=周一 … 7=周日 */
export const isoWeekday = (d: Dayjs): number => ((d.day() + 6) % 7) + 1;

export const fmtDate = (d: Dayjs): string => d.format("YYYY-MM-DD");

/** 获取以 weekStart（ISO 1..7）为周起始的一周（7 天） */
export function getWeekDays(anchor: Dayjs, weekStart: number): Dayjs[] {
  const wd = isoWeekday(anchor);
  const start = anchor.subtract((wd - weekStart + 7) % 7, "day");
  return Array.from({ length: 7 }, (_, i) => start.add(i, "day"));
}

/** 获取某月视图的 42 格网格（含前后月补齐），weekStart：ISO 1..7 */
export function getMonthGrid(month: Dayjs, weekStart: number): Dayjs[] {
  const first = month.startOf("month");
  const firstWd = isoWeekday(first);
  const offset = (firstWd - weekStart + 7) % 7;
  const gridStart = first.subtract(offset, "day");
  return Array.from({ length: 42 }, (_, i) => gridStart.add(i, "day"));
}

export const isSameDay = (a: Dayjs, b: Dayjs): boolean => a.isSame(b, "day");
export const isToday = (d: Dayjs): boolean => d.isSame(dayjs(), "day");
export const isWeekend = (d: Dayjs): boolean => d.day() === 0 || d.day() === 6;

/** 时间字符串 HH:MM 格式化显示（12/24 小时制） */
export function formatTime(t: string | null, mode: "12" | "24"): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (mode === "12") {
    const ampm = h >= 12 ? "下午" : "上午";
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${ampm} ${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 提醒偏移分钟 → 人类可读 */
export function offsetText(minutes: number): string {
  if (minutes === 0) return "准时";
  if (minutes < 0) {
    const abs = -minutes;
    if (abs % 1440 === 0) return `提前${abs / 1440}天`;
    if (abs % 60 === 0) return `提前${abs / 60}小时`;
    return `提前${abs}分钟`;
  }
  return `延后${minutes}分钟`;
}
