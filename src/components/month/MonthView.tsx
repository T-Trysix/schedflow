import { useCallback, useEffect, useMemo, useState } from "react";
import { Dropdown, Empty, message } from "antd";
import { CalendarOutlined, DeleteOutlined, EditOutlined, FlagFilled, RightOutlined, SwapOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import { api } from "@/lib/api";
import { fmtDate, getMonthGrid, isToday, isWeekend, isoWeekday } from "@/lib/date";
import { useAppStore } from "@/stores/appStore";
import { useDataStore } from "@/stores/dataStore";
import { useEditorStore } from "@/stores/editorStore";
import { matchesFilter, useFilterStore } from "@/stores/filterStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { DayEvent } from "@/lib/types";

const WEEKDAY_CHARS = ["", "一", "二", "三", "四", "五", "六", "日"];
const MAX_CHIPS = 5;
const PRIORITY_COLOR = ["", "#1677ff", "#fa8c16", "#ff4d4f"];

function useFilteredEvents() {
  const events = useDataStore((s) => s.events);
  const filters = useFilterStore();
  return useMemo(() => {
    return events.filter((e) => matchesFilter(e, filters));
  }, [events, filters.categoryId, filters.status, filters.priority]);
}

export default function MonthView() {
  const currentMonth = useAppStore((s) => s.currentMonth);
  const selectedDate = useAppStore((s) => s.selectedDate);
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const selectEvent = useAppStore((s) => s.selectEvent);
  const selectedEventId = useAppStore((s) => s.selectedEventId);
  const openEventEditor = useEditorStore((s) => s.openEventEditor);
  const reloadAll = useDataStore((s) => s.reloadAll);
  const loadEvents = useDataStore((s) => s.loadEvents);
  const weekStart = Number(useSettingsStore((s) => s.settings.weekStart)) || 1;
  const timeFormat = useSettingsStore((s) => s.settings.timeFormat) || "24";
  const weekendColor = useSettingsStore((s) => s.settings.weekendColor) ?? true;
  const filtered = useFilteredEvents();
  const [dragOver, setDragOver] = useState<string | null>(null);

  const grid = useMemo(() => getMonthGrid(currentMonth, weekStart), [currentMonth, weekStart]);

  useEffect(() => {
    loadEvents(fmtDate(grid[0]), fmtDate(grid[41]));
  }, [grid, loadEvents]);

  const byDate = useMemo(() => {
    const m = new Map<string, DayEvent[]>();
    for (const e of filtered) {
      const arr = m.get(e.occurrenceDate) ?? [];
      arr.push(e);
      m.set(e.occurrenceDate, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.isAllDay === b.isAllDay ? (a.startTime ?? "").localeCompare(b.startTime ?? "") : a.isAllDay ? -1 : 1));
    return m;
  }, [filtered]);

  const dotsOf = (d: Dayjs) => {
    const list = byDate.get(fmtDate(d)) ?? [];
    const colors = list.filter((e) => !e.completed).map((e) => e.categoryColor ?? "#9ca3af");
    return colors;
  };

  const handleDrop = useCallback(
    async (date: string, data: string) => {
      setDragOver(null);
      if (!data) return;
      if (data.startsWith("event:")) {
        const [, idStr, occ] = data.split(":");
        try {
          await api.moveEvent(Number(idStr), date, occ || undefined);
          await reloadAll();
        } catch (e) {
          message.error("移动日程失败");
          console.error(e);
        }
      } else if (data.startsWith("todo:")) {
        const id = Number(data.split(":")[1]);
        try {
          await api.todoToEvent(id, date);
          message.success("已转为日程");
          await reloadAll();
        } catch (e) {
          message.error("转为日程失败");
          console.error(e);
        }
      }
    },
    [reloadAll],
  );

  const eventMenu = (e: DayEvent) => ({
    items: [
      { key: "edit", label: "编辑", icon: <EditOutlined /> },
      { key: "complete", label: e.completed ? "取消完成" : "标记完成", icon: <FlagFilled /> },
      { key: "tounpin", label: "移除日期 → 待办", icon: <SwapOutlined /> },
      { type: "divider" as const },
      { key: "delete", label: "删除", icon: <DeleteOutlined />, danger: true },
    ],
    onClick: async ({ key }: { key: string }) => {
      if (key === "edit") {
        try {
          const full = await api.getEvent(e.id);
          openEventEditor({ event: full, occurrenceDate: e.isRecurring ? e.occurrenceDate : null });
        } catch {
          message.error("加载日程失败");
        }
      } else if (key === "complete") {
        await api.setEventCompleted(e.id, !e.completed);
        await reloadAll();
      } else if (key === "tounpin") {
        await api.eventToTodo(e.id, e.isRecurring ? e.occurrenceDate : undefined);
        message.success("已转为待办");
        await reloadAll();
      } else if (key === "delete") {
        if (e.isRecurring) {
          message.info("重复日程请到详情中删除整个系列或仅本次");
          return;
        }
        await api.deleteEvent(e.id);
        await reloadAll();
      }
    },
  });

  return (
    <div className="flex-1 min-h-0 p-3 flex flex-col">
      {/* 周表头 */}
      <div className="grid grid-cols-7 gap-px mb-1 px-1">
        {Array.from({ length: 7 }, (_, i) => {
          const iso = ((weekStart - 1 + i) % 7) + 1;
          const weekend = iso === 6 || iso === 7;
          return (
            <div
              key={i}
              className={`text-center text-[12px] py-1 font-medium ${weekend && weekendColor ? "text-[color-mix(in_srgb,var(--sf-today-ring)_70%,transparent)]" : "text-[var(--sf-text-secondary)]"}`}
            >
              {WEEKDAY_CHARS[iso]}
            </div>
          );
        })}
      </div>

      {/* 网格 */}
      <div className="sf-cal-grid flex-1">
        {grid.map((d, i) => {
          const key = fmtDate(d);
          const inMonth = d.month() === currentMonth.month();
          const list = byDate.get(key) ?? [];
          const visible = list.slice(0, MAX_CHIPS);
          const more = list.length - visible.length;
          const weekend = isWeekend(d);
          const cls = [
            "sf-cal-cell",
            !inMonth ? "outside" : "",
            weekend && weekendColor ? "weekend" : "",
            d.isSame(selectedDate, "day") ? "selected" : "",
            dragOver === key ? "drag-over" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={key}
              className={cls}
              onClick={() => {
                setSelectedDate(d);
                selectEvent(null);
              }}
              onDoubleClick={() => {
                setSelectedDate(d);
                openEventEditor({ defaultDate: key });
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(key);
              }}
              onDragLeave={() => setDragOver((cur) => (cur === key ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(key, e.dataTransfer.getData("text/plain"));
              }}
            >
              <span className={`sf-cal-daynum ${isToday(d) ? "today-num" : ""}`}>{d.date()}</span>
              {/* 分类圆点 */}
              {inMonth && dotsOf(d).slice(0, 3).length > 0 && (
                <div className="flex gap-0.5 px-1.5 pb-0.5">
                  {dotsOf(d)
                    .slice(0, 3)
                    .map((c, ci) => (
                      <span key={ci} className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                    ))}
                </div>
              )}
              {/* 日程条目 */}
              {visible.map((e) => (
                <Dropdown key={e.id + e.occurrenceDate} trigger={["contextMenu"]} menu={eventMenu(e)}>
                  <div
                    className={`sf-ev ${e.completed ? "completed" : ""}`}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData("text/plain", `event:${e.id}:${e.occurrenceDate}`);
                      ev.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setSelectedDate(d);
                      selectEvent(e.id, e.isRecurring ? e.occurrenceDate : null);
                    }}
                    style={{ background: (e.categoryColor ?? "#888") + "22" }}
                  >
                    <span className="sf-ev-bar" style={{ background: e.categoryColor ?? "#9ca3af" }} />
                    {!e.isAllDay && e.startTime && (
                      <span className="text-[11px] opacity-70 shrink-0">{e.startTime}</span>
                    )}
                    <span className="sf-ev-title truncate flex-1">{e.title}</span>
                    {e.priority > 0 && (
                      <FlagFilled style={{ color: PRIORITY_COLOR[e.priority], fontSize: 10 }} />
                    )}
                  </div>
                </Dropdown>
              ))}
              {more > 0 && (
                <div
                  className="px-2 text-[11px] text-[var(--sf-today-ring)] cursor-pointer"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setSelectedDate(d);
                  }}
                >
                  +{more}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
