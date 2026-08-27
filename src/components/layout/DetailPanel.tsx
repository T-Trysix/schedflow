import { useEffect, useMemo, useState } from "react";
import { Button, Divider, Empty, Modal, Popconfirm, Tag, message } from "antd";
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagFilled,
  FlagOutlined,
  SwapOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { dayjs } from "@/lib/date";
import { formatTime, offsetText } from "@/lib/date";
import { ruleToText } from "@/lib/recurrence";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/appStore";
import { useDataStore } from "@/stores/dataStore";
import { useEditorStore } from "@/stores/editorStore";
import { useFilterStore, matchesFilter } from "@/stores/filterStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { DayEvent, Event } from "@/lib/types";

const PRIORITY_TEXT = ["", "低", "中", "高"];

export default function DetailPanel() {
  const selectedDate = useAppStore((s) => s.selectedDate);
  const selectedEventId = useAppStore((s) => s.selectedEventId);
  const selectedOccurrenceDate = useAppStore((s) => s.selectedOccurrenceDate);
  const selectEvent = useAppStore((s) => s.selectEvent);
  const events = useDataStore((s) => s.events);
  const reloadAll = useDataStore((s) => s.reloadAll);
  const openEventEditor = useEditorStore((s) => s.openEventEditor);
  const filter = useFilterStore();
  const categories = useDataStore((s) => s.categories);
  const tags = useDataStore((s) => s.tags);
  const timeFormat = useSettingsStore((s) => s.settings.timeFormat) || "24";
  const [full, setFull] = useState<Event | null>(null);

  const dayEvents = useMemo(() => {
    const key = selectedDate.format("YYYY-MM-DD");
    return events
      .filter((e) => e.occurrenceDate === key && matchesFilter(e, filter))
      .sort((a, b) => (a.isAllDay === b.isAllDay ? (a.startTime ?? "").localeCompare(b.startTime ?? "") : a.isAllDay ? -1 : 1));
  }, [events, selectedDate, filter]);

  useEffect(() => {
    setFull(null);
    if (selectedEventId == null) return;
    api
      .getEvent(selectedEventId)
      .then(setFull)
      .catch(() => setFull(null));
  }, [selectedEventId, dayEvents]);

  const tagNames = (ids: number[]) => ids.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean);

  const doDelete = (mode: "series" | "occurrence") => {
    api
      .deleteEvent(selectedEventId!, mode, mode === "occurrence" ? selectedOccurrenceDate ?? undefined : undefined)
      .then(() => {
        message.success("已删除");
        selectEvent(null);
        reloadAll();
      })
      .catch((e) => message.error("删除失败"));
  };

  const handleDelete = () => {
    if (!selectedEventId) return;
    if (full?.recurrenceRule) {
      Modal.confirm({
        title: "删除重复日程",
        content: "请选择删除范围：",
        okText: "删除整个系列",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: () => doDelete("series"),
        footer: (_, { OkBtn, CancelBtn }) => (
          <>
            <Button danger size="small" onClick={() => doDelete("occurrence")}>
              仅删除本次
            </Button>
            <CancelBtn />
            <OkBtn />
          </>
        ),
      });
    } else {
      Modal.confirm({
        title: "删除日程",
        content: "确定删除该日程吗？",
        okText: "删除",
        okButtonProps: { danger: true },
        onOk: () => doDelete("series"),
      });
    }
  };

  return (
    <aside className="w-72 shrink-0 flex flex-col border-l border-[var(--sf-border)] bg-[var(--sf-bg-panel)]">
      <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-[var(--sf-border)]">
        <div>
          <div className="text-[15px] font-semibold text-[var(--sf-text)]">
            {selectedDate.format("M月D日")}
            <span className="ml-2 text-[12px] font-normal text-[var(--sf-text-secondary)]">
              周{"日一二三四五六".charAt(selectedDate.day())}
            </span>
          </div>
          <div className="text-[11px] text-[var(--sf-text-secondary)]">
            {dayjs().isSame(selectedDate, "day") ? "今天 · " : ""}
            {dayEvents.length} 条日程
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {selectedEventId && full ? (
          <div className="sf-slide-up">
            <div className="flex items-start gap-1.5">
              <Button
                type="text"
                size="small"
                icon={<ArrowLeftOutlined />}
                title="返回列表"
                onClick={() => selectEvent(null)}
              />
              <span
                className="w-3 h-3 rounded-full mt-1 shrink-0"
                style={{ background: full.categoryId ? dayEvents.find((e) => e.id === full.id)?.categoryColor ?? "#9ca3af" : "#9ca3af" }}
              />
              <div className="min-w-0 flex-1">
                <div className={`text-[15px] font-medium ${full.completed ? "line-through opacity-55" : ""}`}>
                  {full.title}
                </div>
                {ruleToText(full.recurrenceRule) && (
                  <Tag color="blue" style={{ marginTop: 4 }}>
                    重复 · {ruleToText(full.recurrenceRule)}
                  </Tag>
                )}
              </div>
            </div>

            <Divider style={{ margin: "12px 0" }} />

            <div className="space-y-2 text-[13px] text-[var(--sf-text)]">
              <div className="flex items-center gap-2">
                <ClockCircleOutlined style={{ color: "var(--sf-text-secondary)" }} />
                {full.isAllDay ? (
                  <span>全天 · {full.startDate}{full.endDate !== full.startDate ? ` 至 ${full.endDate}` : ""}</span>
                ) : (
                  <span>
                    {full.startDate} {formatTime(full.startTime, timeFormat)}
                    {full.endTime ? ` - ${formatTime(full.endTime, timeFormat)}` : ""}
                  </span>
                )}
              </div>
              {full.reminderEnabled && (
                <div className="flex items-center gap-2">
                  <FlagOutlined style={{ color: "var(--sf-text-secondary)" }} />
                  <span>提醒：{offsetText(full.reminderOffsetMinutes)}</span>
                </div>
              )}
              {full.priority > 0 && (
                <div className="flex items-center gap-2">
                  <FlagFilled style={{ color: "#fa8c16" }} />
                  <span>优先级：{PRIORITY_TEXT[full.priority]}</span>
                </div>
              )}
              {tagNames(full.tags).length > 0 && (
                <div className="flex items-center gap-2">
                  <TagsOutlined style={{ color: "var(--sf-text-secondary)" }} />
                  <div className="flex flex-wrap gap-1">
                    {tagNames(full.tags).map((t) => (
                      <Tag key={t} style={{ marginInlineEnd: 0 }}>
                        {t}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
              {full.notes && (
                <div className="whitespace-pre-wrap rounded-lg bg-[var(--sf-hover)] p-2.5 text-[13px] leading-relaxed">
                  {full.notes}
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                size="small"
                icon={full.completed ? <FlagOutlined /> : <FlagFilled />}
                onClick={async () => {
                  await api.setEventCompleted(full.id, !full.completed);
                  selectEvent(null);
                  reloadAll();
                }}
              >
                {full.completed ? "取消完成" : "完成"}
              </Button>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEventEditor({ event: full, occurrenceDate: full.recurrenceRule ? selectedOccurrenceDate : null })}
              >
                编辑
              </Button>
              <Button size="small" icon={<SwapOutlined />} onClick={async () => {
                await api.eventToTodo(full.id, full.recurrenceRule ? selectedOccurrenceDate ?? undefined : undefined);
                message.success("已转为待办");
                selectEvent(null);
                reloadAll();
              }}>
                转待办
              </Button>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={handleDelete}>
                删除
              </Button>
            </div>
          </div>
        ) : (
          <>
            {dayEvents.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  filter.categoryId !== null
                    ? `当前分类「${categories.find((c) => c.id === filter.categoryId)?.name ?? ""}」这一天没有日程`
                    : "这一天没有日程"
                }
                style={{ marginTop: 40 }}
              />
            ) : (
              <div className="space-y-1.5">
                {dayEvents.map((e) => (
                  <div
                    key={e.id + e.occurrenceDate}
                    className={`rounded-xl border px-3 py-2 cursor-pointer transition-colors ${
                      selectedEventId === e.id
                        ? "border-[var(--sf-today-ring)] bg-[color-mix(in_srgb,var(--sf-today-ring)_8%,transparent)]"
                        : "border-[var(--sf-border)] hover:border-[var(--sf-today-ring)]"
                    }`}
                    onClick={() => selectEvent(e.id, e.isRecurring ? e.occurrenceDate : null)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.categoryColor ?? "#9ca3af" }} />
                      <span className={`text-[13px] truncate ${e.completed ? "line-through opacity-55" : ""}`}>{e.title}</span>
                    </div>
                    <div className="text-[11px] text-[var(--sf-text-secondary)] mt-0.5 pl-4">
                      {e.isAllDay
                        ? "全天"
                        : e.startTime
                          ? `${formatTime(e.startTime, timeFormat)}${e.endTime ? ` - ${formatTime(e.endTime, timeFormat)}` : ""}`
                          : ""}
                      {e.isRecurring ? " · 重复" : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
