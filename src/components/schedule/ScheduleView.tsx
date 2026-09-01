import { useMemo, useState } from "react";
import { Button, Dropdown, Empty, message } from "antd";
import {
  CalendarOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  FlagFilled,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  SwapOutlined,
  UpOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { api } from "@/lib/api";
import { fmtDate, getMonthGrid, getWeekDays, isToday, isoWeekday } from "@/lib/date";
import { useAppStore } from "@/stores/appStore";
import { useDataStore } from "@/stores/dataStore";
import { useEditorStore } from "@/stores/editorStore";
import { useFilterStore, matchesFilter } from "@/stores/filterStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { DayEvent } from "@/lib/types";

const WEEKDAY_CHARS = ["", "一", "二", "三", "四", "五", "六", "日"];
const PRIORITY_COLOR = ["", "#1677ff", "#fa8c16", "#ff4d4f"];

export default function ScheduleView() {
  const selectedDate = useAppStore((s) => s.selectedDate);
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const setCurrentMonth = useAppStore((s) => s.setCurrentMonth);
  const openEventEditor = useEditorStore((s) => s.openEventEditor);
  const events = useDataStore((s) => s.events);
  const loadEvents = useDataStore((s) => s.loadEvents);
  const reloadAll = useDataStore((s) => s.reloadAll);
  const filter = useFilterStore();
  const categories = useDataStore((s) => s.categories);
  const weekStart = Number(useSettingsStore((s) => s.settings.weekStart)) || 1;
  const timeFormat = useSettingsStore((s) => s.settings.timeFormat) || "24";
  const weekendColor = useSettingsStore((s) => s.settings.weekendColor) ?? true;
  const [miniOpen, setMiniOpen] = useState(false);

  const weekDays = useMemo(() => getWeekDays(selectedDate, weekStart), [selectedDate, weekStart]);
  const rangeStart = fmtDate(weekDays[0]);
  const rangeEnd = fmtDate(weekDays[6]);

  useMemo(() => loadEvents(rangeStart, rangeEnd), [loadEvents, rangeStart, rangeEnd]);

  const dayEvents = useMemo(() => {
    const key = fmtDate(selectedDate);
    return events
      .filter((e) => e.occurrenceDate === key && matchesFilter(e, filter))
      .sort((a, b) => (a.isAllDay === b.isAllDay ? (a.startTime ?? "").localeCompare(b.startTime ?? "") : a.isAllDay ? -1 : 1));
  }, [events, selectedDate, filter]);

  const moveWeek = (d: number) => {
    const next = selectedDate.add(d, "week");
    setSelectedDate(next);
    setCurrentMonth(next.startOf("month"));
  };

  const handleDrop = async (date: string, data: string) => {
    if (!data) return;
    if (data.startsWith("event:")) {
      const [, idStr, occ] = data.split(":");
      try {
        await api.moveEvent(Number(idStr), date, occ || undefined);
        await reloadAll();
      } catch (e) {
        message.error("移动日程失败");
      }
    } else if (data.startsWith("todo:")) {
      try {
        await api.todoToEvent(Number(data.split(":")[1]), date);
        message.success("已转为日程");
        await reloadAll();
      } catch (e) {
        message.error("转为日程失败");
      }
    }
  };

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
    <div className="flex-1 min-h-0 flex flex-col w-full">
      {/* 顶部周条 */}
      <div className="shrink-0 border-b border-[var(--sf-border)] bg-[var(--sf-bg-panel)] px-3 pt-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1">
            <Button size="small" type="text" icon={<LeftOutlined />} onClick={() => moveWeek(-1)} />
            <span className="text-[13px] font-medium text-[var(--sf-text)]">
              {weekDays[0].format("M月D日")} - {weekDays[6].format("M月D日")}
            </span>
            <Button size="small" type="text" icon={<RightOutlined />} onClick={() => moveWeek(1)} />
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="small"
              onClick={() => {
                const t = dayjs();
                setSelectedDate(t);
                setCurrentMonth(t.startOf("month"));
              }}
            >
              今天
            </Button>
            <Button size="small" type="text" icon={miniOpen ? <UpOutlined /> : <DownOutlined />} onClick={() => setMiniOpen(!miniOpen)} />
          </div>
        </div>

        {/* 小月历打开时替换顶部周条：小月历网格已含当前周，周条再显示会造成"当前周重复显示" */}
        {miniOpen ? (
          <MiniMonth selected={selectedDate} onSelect={(d) => setSelectedDate(d)} weekStart={weekStart} weekendColor={weekendColor} />
        ) : (
          <div className="grid grid-cols-7 gap-1 pb-2">
            {weekDays.map((d) => {
              const today = isToday(d);
              const weekend = isoWeekday(d) === 6 || isoWeekday(d) === 7;
              const sel = d.isSame(selectedDate, "day");
              const dots = events.filter((e) => e.occurrenceDate === fmtDate(d) && !e.completed && matchesFilter(e, filter)).length;
              return (
                <div
                  key={fmtDate(d)}
                  className="flex flex-col items-center cursor-pointer select-none"
                  onClick={() => setSelectedDate(d)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(fmtDate(d), e.dataTransfer.getData("text/plain"));
                  }}
                >
                  <span className={`text-[11px] mb-0.5 ${weekend && weekendColor ? "text-[color-mix(in_srgb,var(--sf-today-ring)_70%,transparent)]" : "text-[var(--sf-text-secondary)]"}`}>
                    周{WEEKDAY_CHARS[isoWeekday(d)]}
                  </span>
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] transition-colors ${
                      sel
                        ? "bg-[var(--sf-today-ring)] text-white font-semibold"
                        : today
                          ? "border border-[var(--sf-today-ring)] text-[var(--sf-today-ring)] font-semibold"
                          : "text-[var(--sf-text)]"
                    }`}
                  >
                    {d.date()}
                  </span>
                  <span className="h-1 mt-0.5 flex items-center gap-0.5">
                    {dots > 0 && <span className="w-1 h-1 rounded-full bg-[var(--sf-today-ring)]" />}
                    {dots > 1 && <span className="w-1 h-1 rounded-full bg-[var(--sf-today-ring)] opacity-60" />}
                    {dots > 2 && <span className="w-1 h-1 rounded-full bg-[var(--sf-today-ring)] opacity-40" />}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 当日日程 */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5">
          <div className="text-[14px] font-semibold text-[var(--sf-text)]">
            {selectedDate.format("M月D日")}
            <span className="ml-2 text-[12px] font-normal text-[var(--sf-text-secondary)]">
              周{WEEKDAY_CHARS[isoWeekday(selectedDate)]} · {dayEvents.length} 条
            </span>
          </div>
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => openEventEditor({ defaultDate: fmtDate(selectedDate) })}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {dayEvents.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                filter.categoryId !== null
                  ? `当前分类「${categories.find((c) => c.id === filter.categoryId)?.name ?? ""}」今天暂无日程`
                  : "今天暂无日程"
              }
              style={{ marginTop: 40 }}
            >
              {filter.categoryId !== null ? (
                <Button size="small" onClick={() => filter.set({ categoryId: null })}>
                  查看全部
                </Button>
              ) : (
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openEventEditor({ defaultDate: fmtDate(selectedDate) })}>
                  新建日程
                </Button>
              )}
            </Empty>
          ) : (
            <div className="relative pl-4">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-[var(--sf-border)]" />
              {dayEvents.map((e) => (
                <Dropdown key={e.id + e.occurrenceDate} trigger={["click"]} menu={eventMenu(e)}>
                  <div
                    className={`relative mb-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors border-[var(--sf-border)] hover:border-[var(--sf-today-ring)] bg-[var(--sf-bg-panel)]`}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData("text/plain", `event:${e.id}:${e.occurrenceDate}`);
                      ev.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <span className="absolute -left-4 top-4 w-2.5 h-2.5 rounded-full border-2 border-[var(--sf-bg)]" style={{ background: e.categoryColor ?? "#9ca3af" }} />
                    <div className="flex items-center gap-2">
                      <span className={`text-[13.5px] truncate flex-1 ${e.completed ? "line-through opacity-55" : ""}`}>{e.title}</span>
                      {e.priority > 0 && <FlagFilled style={{ color: PRIORITY_COLOR[e.priority], fontSize: 12 }} />}
                    </div>
                    <div className="text-[11.5px] text-[var(--sf-text-secondary)] mt-1">
                      {e.isAllDay
                        ? "全天"
                        : e.startTime
                          ? `${e.startTime}${e.endTime ? ` - ${e.endTime}` : ""}`
                          : "时间待定"}
                      {e.isRecurring ? " · 重复" : ""}
                    </div>
                  </div>
                </Dropdown>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniMonth({
  selected,
  onSelect,
  weekStart,
  weekendColor,
}: {
  selected: Dayjs;
  onSelect: (d: Dayjs) => void;
  weekStart: number;
  weekendColor: boolean;
}) {
  const grid = getMonthGrid(selected.startOf("month"), weekStart);
  return (
    <div className="pb-3 animate-[sfFadeIn_.2s]">
      <div className="grid grid-cols-7 gap-y-0.5 mb-0.5">
        {Array.from({ length: 7 }, (_, i) => {
          const iso = ((weekStart - 1 + i) % 7) + 1;
          return (
            <div
              key={i}
              className={`text-center text-[10.5px] py-0.5 ${iso === 6 || iso === 7 ? "text-[color-mix(in_srgb,var(--sf-today-ring)_70%,transparent)]" : "text-[var(--sf-text-secondary)]"}`}
            >
              周{WEEKDAY_CHARS[iso]}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map((d) => {
          const inMonth = d.month() === selected.month();
          const today = isToday(d);
          const sel = d.isSame(selected, "day");
          return (
            <div key={fmtDate(d)} className="flex justify-center py-px">
              <span
                className={`w-7 h-7 flex items-center justify-center rounded-full text-[12px] cursor-pointer ${
                  sel
                    ? "bg-[var(--sf-today-ring)] text-white font-semibold"
                    : today
                      ? "border border-[var(--sf-today-ring)] text-[var(--sf-today-ring)] font-semibold"
                      : inMonth
                        ? "text-[var(--sf-text)] hover:bg-[var(--sf-hover)]"
                        : "text-[var(--sf-text-secondary)] opacity-40 hover:bg-[var(--sf-hover)]"
                }`}
                onClick={() => onSelect(d)}
              >
                {d.date()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
