import type { RecurrenceRule } from "./types";

export const WEEKDAY_NAMES = ["一", "二", "三", "四", "五", "六", "日"];

export function parseRule(json: string | null): RecurrenceRule | null {
  if (!json) return null;
  try {
    const r = JSON.parse(json) as RecurrenceRule;
    return r.type !== "none" ? r : null;
  } catch {
    return null;
  }
}

export function buildRule(
  type: RecurrenceRule["type"],
  interval = 1,
  daysOfWeek: number[] = [],
  byWeekday = false,
  endDate: string | null = null,
): RecurrenceRule {
  return { type, interval, daysOfWeek, byWeekday, endDate };
}

export function serializeRule(r: RecurrenceRule | null): string | null {
  if (!r || r.type === "none") return null;
  return JSON.stringify(r);
}

/** 重复规则 → 中文描述 */
export function ruleToText(json: string | null): string {
  const r = parseRule(json);
  if (!r) return "";
  const n = r.interval > 1 ? `每 ${r.interval} ` : "";
  let base = "";
  switch (r.type) {
    case "daily":
      base = `${n}天`;
      break;
    case "weekly":
      if (r.byWeekday) base = `${n}周的工作日`;
      else if (r.daysOfWeek.length)
        base = `${n}周 · 周${r.daysOfWeek.map((d) => WEEKDAY_NAMES[d - 1]).join("、")}`;
      else base = `${n}周`;
      break;
    case "monthly":
      base = `${n}个月`;
      break;
    case "yearly":
      base = `${n}年`;
      break;
    case "custom":
      if (r.byWeekday) base = `${n}天 · 工作日`;
      else if (r.daysOfWeek.length)
        base = `${n}天 · 周${r.daysOfWeek.map((d) => WEEKDAY_NAMES[d - 1]).join("、")}`;
      else base = `${n}天`;
      break;
    default:
      return "";
  }
  if (r.endDate) base += `（至 ${r.endDate}）`;
  return base;
}
