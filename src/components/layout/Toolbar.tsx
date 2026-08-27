import { useState } from "react";
import { Button, DatePicker, Dropdown, Input } from "antd";
import {
  CalendarOutlined,
  CheckSquareOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import FilterBar from "@/components/layout/FilterBar";

export default function Toolbar() {
  const currentMonth = useAppStore((s) => s.currentMonth);
  const setCurrentMonth = useAppStore((s) => s.setCurrentMonth);
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const setMode = useAppStore((s) => s.setMode);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const openEventEditor = useEditorStore((s) => s.openEventEditor);
  const openTodoEditor = useEditorStore((s) => s.openTodoEditor);
  const [pickerOpen, setPickerOpen] = useState(false);

  const prev = () => setCurrentMonth(currentMonth.subtract(1, "month"));
  const next = () => setCurrentMonth(currentMonth.add(1, "month"));
  const goToday = () => {
    const t = dayjs();
    setCurrentMonth(t.startOf("month"));
    setSelectedDate(t);
  };

  const newMenu = {
    items: [
      { key: "event", label: "新建日程", icon: <CalendarOutlined /> },
      { key: "todo", label: "新建待办", icon: <CheckSquareOutlined /> },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "event") openEventEditor({ defaultDate: useAppStore.getState().selectedDate.format("YYYY-MM-DD") });
      else openTodoEditor({});
    },
  };

  return (
    <div className="h-14 shrink-0 flex items-center gap-2 px-4 border-b border-[var(--sf-border)] bg-[var(--sf-bg-panel)]">
      {/* 月份导航 */}
      <div className="flex items-center gap-1">
        <Button size="small" type="text" icon={<LeftOutlined />} onClick={prev} />
        <DatePicker
          picker="month"
          value={currentMonth}
          allowClear={false}
          suffixIcon={null}
          variant="borderless"
          open={pickerOpen}
          onOpenChange={(o) => setPickerOpen(o)}
          onChange={(d: Dayjs | null) => {
            if (d) setCurrentMonth(d.startOf("month"));
          }}
          format="YYYY年M月"
          className="!w-[110px]"
          style={{ fontSize: 15, fontWeight: 600, color: "var(--sf-text)" }}
          placeholder="选择月份"
        />
        <Button size="small" type="text" icon={<RightOutlined />} onClick={next} />
        <Button size="small" type="link" onClick={goToday}>
          今天
        </Button>
      </div>

      {/* 当前筛选（无筛选时返回 null） */}
      <FilterBar />

      <div className="flex-1" />

      {/* 搜索 */}
      <Input
        allowClear
        prefix={<SearchOutlined style={{ color: "var(--sf-text-secondary)" }} />}
        placeholder="搜索日程 / 待办…"
        value={searchQuery}
        style={{ width: 220, fontSize: 13 }}
        onChange={(e) => setSearchQuery(e.target.value)}
        onPressEnter={() => setMode("search")}
        onFocus={() => setMode("search")}
      />

      {/* 新建 */}
      <Dropdown menu={newMenu} placement="bottomRight">
        <Button type="primary" size="small" icon={<PlusOutlined />}>
          新建
        </Button>
      </Dropdown>
    </div>
  );
}
