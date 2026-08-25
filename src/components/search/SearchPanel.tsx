import { useCallback, useEffect, useRef, useState } from "react";
import { Empty, Input, Select, Tag } from "antd";
import { CalendarOutlined, CheckSquareOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/appStore";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Event, Todo } from "@/lib/types";

export default function SearchPanel() {
  const query = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setMode = useAppStore((s) => s.setMode);
  const setCurrentMonth = useAppStore((s) => s.setCurrentMonth);
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const selectEvent = useAppStore((s) => s.selectEvent);
  const categories = useDataStore((s) => s.categories);
  const tags = useDataStore((s) => s.tags);
  const filter = useFilterStore();
  const timeFormat = useSettingsStore((s) => s.settings.timeFormat) || "24";
  const [results, setResults] = useState<{ events: Event[]; todos: Todo[] }>({ events: [], todos: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<any>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults({ events: [], todos: [] });
      return;
    }
    setLoading(true);
    try {
      const [events, todos] = await Promise.all([api.searchEvents(q), api.searchTodos(q)]);
      setResults({ events, todos });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const catOf = (id: number | null) => categories.find((c) => c.id === id);
  const tagNames = (ids: number[]) => ids.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean);

  const total = results.events.length + results.todos.length;

  const jumpToEvent = (e: Event) => {
    const d = dayjs(e.startDate);
    setCurrentMonth(d.startOf("month"));
    setSelectedDate(d);
    selectEvent(e.id, e.recurrenceRule ? e.startDate : null);
    setMode("month");
  };

  const activeCat = categories.find((c) => c.id === filter.categoryId)?.name;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 h-14 flex items-center gap-2 px-4 border-b border-[var(--sf-border)]">
        <Input
          ref={inputRef}
          size="middle"
          allowClear
          prefix={<SearchOutlined style={{ color: "var(--sf-text-secondary)" }} />}
          placeholder="搜索日程标题、备注、标签…"
          value={query}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: 320, fontSize: 13 }}
        />
        <Select
          allowClear
          placeholder="按分类筛选"
          style={{ width: 140, fontSize: 13 }}
          value={filter.categoryId ?? undefined}
          onChange={(v) => filter.set({ categoryId: v ?? null })}
        >
          {categories.map((c) => (
            <Select.Option key={c.id} value={c.id}>
              {c.name}
            </Select.Option>
          ))}
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3">
        {!query.trim() ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="输入关键词搜索日程和待办"
            style={{ marginTop: 60 }}
          />
        ) : (
          <>
            <div className="text-[12px] text-[var(--sf-text-secondary)] mb-2">
              {loading ? "搜索中…" : `找到 ${total} 条结果`}
              {activeCat ? ` · 分类：${activeCat}` : ""}
            </div>

            {results.events.length > 0 && (
              <>
                <div className="text-[13px] font-semibold text-[var(--sf-text)] mb-1.5 flex items-center gap-1.5">
                  <CalendarOutlined style={{ color: "var(--sf-today-ring)" }} /> 日程
                </div>
                <div className="space-y-1 mb-4">
                  {results.events.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--sf-border)] hover:border-[var(--sf-today-ring)] bg-[var(--sf-bg-panel)] cursor-pointer transition-colors"
                      onClick={() => jumpToEvent(e)}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: catOf(e.categoryId)?.color ?? "#9ca3af" }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] truncate">{e.title}</div>
                        <div className="text-[11px] text-[var(--sf-text-secondary)]">
                          {e.startDate} {e.isAllDay ? "· 全天" : e.startTime ? `· ${e.startTime}` : ""}
                          {e.recurrenceRule ? " · 重复" : ""}
                        </div>
                      </div>
                      {catOf(e.categoryId)?.name && (
                        <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>{catOf(e.categoryId)?.name}</Tag>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {results.todos.length > 0 && (
              <>
                <div className="text-[13px] font-semibold text-[var(--sf-text)] mb-1.5 flex items-center gap-1.5">
                  <CheckSquareOutlined style={{ color: "var(--sf-today-ring)" }} /> 待办
                </div>
                <div className="space-y-1">
                  {results.todos.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--sf-border)] hover:border-[var(--sf-today-ring)] bg-[var(--sf-bg-panel)] cursor-pointer transition-colors"
                      onClick={() => setMode("todos")}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.categoryColor ?? "#9ca3af" }} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-[13px] truncate ${t.completed ? "line-through opacity-55" : ""}`}>{t.title}</div>
                        <div className="text-[11px] text-[var(--sf-text-secondary)]">
                          {t.completed ? "已完成" : "进行中"}
                          {t.reminderAt ? ` · 提醒 ${dayjs(t.reminderAt).format(timeFormat === "24" ? "M/D HH:mm" : "M/D h:mm A")}` : ""}
                          {tagNames(t.tags).length > 0 ? ` · ${tagNames(t.tags).join("、")}` : ""}
                        </div>
                      </div>
                      {t.categoryName && <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>{t.categoryName}</Tag>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {total === 0 && !loading && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`没有找到与 “${query}” 相关的内容`} style={{ marginTop: 40 }} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
