import dayjs from "dayjs";
import { message } from "antd";
import { useAppStore } from "@/stores/appStore";
import type { ReminderInfo } from "./types";

// 跨入口共用的"跳转到提醒对应位置"逻辑（悬浮球气泡/面板与主窗待办页共用）：
// 日程 → 切月视图、定位到提醒当天并选中该日程；待办 → 轻提示（待办页无选中态）。
// 注意：本函数只负责导航，不负责标记已读——调用方按需先调用 markRemindersRead。
export function navigateToReminder(r: ReminderInfo) {
  if (r.entityType === "event") {
    const d = dayjs(r.occurrenceAt);
    const s = useAppStore.getState();
    // 先切模式/月份/日期（这些 setter 会清 selectedEventId），selectEvent 必须最后调
    s.setMode("month");
    s.setCurrentMonth(d);
    s.setSelectedDate(d);
    s.selectEvent(r.entityId, d.format("YYYY-MM-DD"));
  } else {
    message.success(`提醒：${r.title}`);
  }
}
