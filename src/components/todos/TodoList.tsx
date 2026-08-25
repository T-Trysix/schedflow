import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Dropdown, Empty, Segmented, Tag, Tooltip, message } from "antd";
import { listen } from "@tauri-apps/api/event";
import {
  BellOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagFilled,
  PlusOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "@/lib/api";
import { useDataStore } from "@/stores/dataStore";
import { useEditorStore } from "@/stores/editorStore";
import { useFilterStore } from "@/stores/filterStore";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ReminderInfo, Todo } from "@/lib/types";

const PRIORITY_COLOR = ["", "#1677ff", "#fa8c16", "#ff4d4f"];

export default function TodoList() {
  const todos = useDataStore((s) => s.todos);
  const reloadAll = useDataStore((s) => s.reloadAll);
  const unreadCount = useDataStore((s) => s.unreadCount);
  const refreshUnread = useDataStore((s) => s.refreshUnread);
  const openTodoEditor = useEditorStore((s) => s.openTodoEditor);
  const filter = useFilterStore();
  const categories = useDataStore((s) => s.categories);
  const tags = useDataStore((s) => s.tags);
  const timeFormat = useSettingsStore((s) => s.settings.timeFormat) || "24";
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const setMode = useAppStore((s) => s.setMode);
  const setCurrentMonth = useAppStore((s) => s.setCurrentMonth);
  const selectEvent = useAppStore((s) => s.selectEvent);
  const [statusTab, setStatusTab] = useState<"active" | "done" | "all">("active");
  const [unreadList, setUnreadList] = useState<ReminderInfo[]>([]);

  // ---- 未读提醒列表（Fix 7）----
  const loadUnread = useCallback(async () => {
    try {
      setUnreadList(await api.listUnreadReminders());
    } catch {
      /* ignore */
    }
  }, []);

  // 挂载时 + 红点计数变化时刷新；新提醒到达时立即刷新
  useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  useEffect(() => {
    if (unreadCount > 0) loadUnread();
  }, [unreadCount, loadUnread]);

  useEffect(() => {
    let un: (() => void) | undefined;
    listen<ReminderInfo>("reminder-fired", () => loadUnread()).then((f) => (un = f));
    return () => un?.();
  }, [loadUnread]);

  const openReminder = async (r: ReminderInfo) => {
    try {
      await api.markRemindersRead([r.id]);
      setUnreadList((prev) => prev.filter((x) => x.id !== r.id));
      // mark_reminders_read 不发射 data-changed，需手动刷新红点计数
      refreshUnread();
      if (r.entityType === "event") {
        // 跳月视图：先切模式/月份/日期（这些 setter 会清 selectedEventId），selectEvent 必须最后调
        const d = dayjs(r.occurrenceAt);
        setMode("month");
        setCurrentMonth(d);
        setSelectedDate(d);
        selectEvent(r.entityId, d.format("YYYY-MM-DD"));
      } else {
        message.success(`提醒：${r.title}`);
      }
    } catch {
      message.error("操作失败");
    }
  };

  const markAllRead = async () => {
    try {
      await api.markAllRemindersRead();
      setUnreadList([]);
      refreshUnread();
    } catch {
      message.error("操作失败");
    }
  };

  const filtered = useMemo(() => {
    return todos
      .filter((t) => {
        if (statusTab === "active" && t.completed) return false;
        if (statusTab === "done" && !t.completed) return false;
        if (filter.categoryId !== null && t.categoryId !== filter.categoryId) return false;
        if (filter.priority !== null && t.priority !== filter.priority) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
  }, [todos, statusTab, filter.categoryId, filter.priority]);

  const catName = (id: number | null) => categories.find((c) => c.id === id)?.name;
  const catColor = (id: number | null) => categories.find((c) => c.id === id)?.color ?? "#9ca3af";
  const tagNames = (ids: number[]) => ids.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean);

  const toggle = async (t: Todo) => {
    await api.setTodoCompleted(t.id, !t.completed);
    await reloadAll();
  };

  const menu = (t: Todo) => ({
    items: [
      { key: "edit", label: "编辑", icon: <EditOutlined /> },
      { key: "toevent", label: "转为日程", icon: <CalendarOutlined /> },
      { type: "divider" as const },
      { key: "delete", label: "删除", icon: <DeleteOutlined />, danger: true },
    ],
    onClick: async ({ key }: { key: string }) => {
      if (key === "edit") openTodoEditor({ todo: t });
      else if (key === "toevent") {
        try {
          await api.todoToEvent(t.id, dayjs().format("YYYY-MM-DD"));
          message.success("已转为日程");
          await reloadAll();
        } catch (e) {
          message.error("转换失败");
        }
      } else if (key === "delete") {
        await api.deleteTodo(t.id);
        await reloadAll();
      }
    },
  });

  const activeCount = todos.filter((t) => !t.completed).length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-[var(--sf-border)]">
        <div className="text-[15px] font-semibold text-[var(--sf-text)]">
          待办清单
          <span className="ml-2 text-[12px] font-normal text-[var(--sf-text-secondary)]">
            {activeCount} 项进行中
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            size="small"
            value={statusTab}
            onChange={(v) => setStatusTab(v as "active" | "done" | "all")}
            options={[
              { label: "进行中", value: "active" },
              { label: "已完成", value: "done" },
              { label: "全部", value: "all" },
            ]}
          />
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openTodoEditor({})}>
            新建待办
          </Button>
        </div>
      </div>

      {/* 未读提醒（Fix 7）：红点不再悬空——点进待办页顶部直接看到未读列表 */}
      {unreadList.length > 0 && (
        <div className="shrink-0 mx-3 mt-2 rounded-xl border border-[color-mix(in_srgb,var(--sf-today-ring)_35%,transparent)] bg-[color-mix(in_srgb,var(--sf-today-ring)_7%,var(--sf-bg-panel))]">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="text-[13px] font-semibold text-[var(--sf-text)]">
              <BellOutlined className="mr-1.5 text-[#ff4d4f]" />
              未读提醒
              <span className="ml-1 text-[12px] font-normal text-[var(--sf-text-secondary)]">{unreadList.length} 条</span>
            </div>
            <Button size="small" type="link" style={{ fontSize: 12 }} onClick={markAllRead}>
              全部已读
            </Button>
          </div>
          <div className="px-2 pb-2 max-h-[180px] overflow-y-auto space-y-1">
            {unreadList.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--sf-hover)] transition-colors"
                onClick={() => openReminder(r)}
                title={r.notes || undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff4d4f] shrink-0" />
                <span className="text-[12.5px] text-[var(--sf-text)] truncate flex-1">{r.title}</span>
                <span className="text-[11px] text-[var(--sf-text-secondary)] shrink-0">
                  {r.entityType === "event" ? (
                    <CalendarOutlined className="mr-0.5" />
                  ) : (
                    <CheckSquareOutlined className="mr-0.5" />
                  )}
                  {dayjs(r.occurrenceAt).format(timeFormat === "24" ? "M/D HH:mm" : "M/D h:mm A")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={todos.length === 0 ? "暂无待办，点击右上角新建" : "没有符合条件的待办"}
            style={{ marginTop: 60 }}
          />
        ) : (
          <div className="space-y-1">
            {filtered.map((t) => {
              const overdue =
                !t.completed && t.reminderAt && dayjs(t.reminderAt).isBefore(dayjs(), "minute");
              return (
                <Dropdown key={t.id} trigger={["contextMenu"]} menu={menu(t)}>
                  <div
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--sf-border)] hover:border-[var(--sf-today-ring)] bg-[var(--sf-bg-panel)] cursor-pointer transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", `todo:${t.id}`);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDoubleClick={() => openTodoEditor({ todo: t })}
                  >
                    <Checkbox checked={t.completed} onChange={() => toggle(t)} />
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: catColor(t.categoryId) }} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-[13.5px] truncate ${t.completed ? "line-through opacity-55" : ""}`}>
                        {t.title}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--sf-text-secondary)] mt-0.5">
                        {t.priority > 0 && <FlagFilled style={{ color: PRIORITY_COLOR[t.priority] }} />}
                        {catName(t.categoryId) && <span>{catName(t.categoryId)}</span>}
                        {t.reminderAt && (
                          <span className={overdue ? "text-[#ff4d4f]" : ""}>
                            <BellOutlined className="mr-0.5" />
                            {dayjs(t.reminderAt).format(timeFormat === "24" ? "M/D HH:mm" : "M/D h:mm A")}
                          </span>
                        )}
                        {tagNames(t.tags).map((n) => (
                          <Tag key={n} style={{ marginInlineEnd: 0, fontSize: 10 }}>
                            {n}
                          </Tag>
                        ))}
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
                      <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openTodoEditor({ todo: t })} />
                      </Tooltip>
                      <Tooltip title="转为日程">
                        <Button
                          type="text"
                          size="small"
                          icon={<SwapOutlined />}
                          onClick={async () => {
                            await api.todoToEvent(t.id, dayjs().format("YYYY-MM-DD"));
                            message.success("已转为日程");
                            await reloadAll();
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="删除">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={async () => {
                            await api.deleteTodo(t.id);
                            await reloadAll();
                          }}
                        />
                      </Tooltip>
                    </div>
                  </div>
                </Dropdown>
              );
            })}
          </div>
        )}
      </div>

      {/* <div className="shrink-0 px-5 py-2 border-t border-[var(--sf-border)] text-[11px] text-[var(--sf-text-secondary)]">
        提示：把待办拖到月视图的日期格子上即可转为当天的日程；双击待办可编辑。
      </div> */}
    </div>
  );
}
