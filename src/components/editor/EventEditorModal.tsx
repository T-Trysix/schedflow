import { useEffect, useMemo, useState } from "react";
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Switch,
  TimePicker,
  message,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import { isoWeekday } from "@/lib/date";
import { api } from "@/lib/api";
import { useDataStore } from "@/stores/dataStore";
import { useEditorStore } from "@/stores/editorStore";
import { buildRule, serializeRule } from "@/lib/recurrence";
import type { Event, RecurrenceRule } from "@/lib/types";
import { WEEKDAY_NAMES } from "@/lib/recurrence";

const REMINDER_OPTIONS = [
  { label: "准时", value: 0 },
  { label: "提前 5 分钟", value: -5 },
  { label: "提前 10 分钟", value: -10 },
  { label: "提前 15 分钟", value: -15 },
  { label: "提前 30 分钟", value: -30 },
  { label: "提前 1 小时", value: -60 },
  { label: "提前 2 小时", value: -120 },
  { label: "提前 1 天", value: -1440 },
  { label: "自定义…", value: "custom" },
];

interface FormValues {
  title: string;
  notes?: string;
  date: Dayjs;
  endDate?: Dayjs;
  allDay?: boolean;
  startTime?: Dayjs;
  endTime?: Dayjs;
  categoryId?: number;
  tagIds?: (number | string)[];
  priority: number;
  reminderEnabled?: boolean;
  reminderOffset: number | "custom";
  customReminderOffset?: number;
  repeat: "none" | RecurrenceRule["type"];
  repeatInterval: number;
  repeatWeekdays?: number[];
  repeatWorkday?: boolean;
  repeatEndDate?: Dayjs | null;
  editScope?: "series" | "occurrence";
}

export default function EventEditorModal() {
  const editor = useEditorStore((s) => s.eventEditor);
  const close = useEditorStore((s) => s.closeEventEditor);
  const categories = useDataStore((s) => s.categories);
  const tags = useDataStore((s) => s.tags);
  const reloadAll = useDataStore((s) => s.reloadAll);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const ev: Event | null | undefined = editor?.event;
  const occDate = editor?.occurrenceDate;

  const isEditingOccurrence = !!occDate && !!ev?.recurrenceRule;

  const initial = useMemo(() => {
    if (ev) {
      return {
        title: ev.title,
        notes: ev.notes || undefined,
        date: dayjs(ev.startDate),
        endDate: ev.endDate && ev.endDate !== ev.startDate ? dayjs(ev.endDate) : dayjs(ev.startDate),
        allDay: ev.isAllDay,
        startTime: ev.startTime ? dayjs(`2000-01-01 ${ev.startTime}`) : undefined,
        endTime: ev.endTime ? dayjs(`2000-01-01 ${ev.endTime}`) : undefined,
        categoryId: ev.categoryId ?? undefined,
        tagIds: ev.tags,
        priority: ev.priority,
        reminderEnabled: ev.reminderEnabled,
        reminderOffset: REMINDER_OPTIONS.some((o) => o.value === ev.reminderOffsetMinutes)
          ? ev.reminderOffsetMinutes
          : "custom",
        customReminderOffset: ev.reminderOffsetMinutes,
        repeat: "none",
        repeatInterval: 1,
        editScope: isEditingOccurrence ? "occurrence" : "series",
      } as FormValues;
    }
    const defaultDate = editor?.defaultDate ? dayjs(editor.defaultDate) : dayjs();
    return {
      title: "",
      notes: undefined,
      date: defaultDate,
      endDate: defaultDate,
      allDay: false,
      // 显式补全以下字段为 undefined：Form.useForm 实例跨 Modal 关闭持久化，
      // 若此处缺 key，上次编辑残留的时间/分类/标签会留在 form store 中（Bug：新建日程带出上次的默认时间）
      startTime: undefined,
      endTime: undefined,
      categoryId: undefined,
      tagIds: undefined,
      priority: 0,
      reminderEnabled: false,
      reminderOffset: -10,
      repeat: "none",
      repeatInterval: 1,
    } as FormValues;
  }, [ev, editor?.defaultDate, isEditingOccurrence]);

  // 打开弹窗时统一初始化 form：
  // 1) resetFields 清掉上次编辑残留字段（Form.useForm 实例跨 Modal 关闭持久化，Bug：新建日程带出上次的默认时间）
  // 2) 应用当前 initial
  // 3) 解析重复规则——必须在 reset 之后重新应用，否则 repeat 字段会被重置回"不重复"
  useEffect(() => {
    if (!editor?.open) return;
    form.resetFields();
    form.setFieldsValue(initial);
    if (ev?.recurrenceRule) {
      try {
        const r = JSON.parse(ev.recurrenceRule) as RecurrenceRule;
        form.setFieldsValue({
          repeat: r.type,
          repeatInterval: r.interval || 1,
          repeatWeekdays: r.daysOfWeek?.length ? r.daysOfWeek : undefined,
          repeatWorkday: r.byWeekday,
          repeatEndDate: r.endDate ? dayjs(r.endDate) : undefined,
        });
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.open]);

  const allDay = Form.useWatch("allDay", form) ?? initial.allDay;
  const repeatType = Form.useWatch("repeat", form) ?? "none";
  const reminderOffset = Form.useWatch("reminderOffset", form) ?? -10;
  const reminderEnabled = Form.useWatch("reminderEnabled", form) ?? initial.reminderEnabled;

  // 注意：所有 Hook 必须在早退 return 之前调用，否则打开弹窗时 hook 数量变化会导致整树崩溃（白屏）
  const reminderOptions = useMemo(
    () =>
      REMINDER_OPTIONS.map((o) => (
        <Select.Option key={String(o.value)} value={o.value}>
          {o.label}
        </Select.Option>
      )),
    [],
  );

  if (!editor?.open) return null;

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);

      // 解析标签：数字=已有 id；字符串=新建
      const tagIds: number[] = [];
      for (const t of v.tagIds ?? []) {
        if (typeof t === "number") tagIds.push(t);
        else {
          const id = await api.createTag(String(t).trim());
          tagIds.push(id);
        }
      }

      const isAllDay = !!v.allDay;
      const startDate = v.date.format("YYYY-MM-DD");
      const endDate = v.endDate ? v.endDate.format("YYYY-MM-DD") : startDate;

      let rule: RecurrenceRule | null = null;
      if (v.repeat !== "none") {
        const isWeekly = v.repeat === "weekly" || v.repeat === "custom";
        const days =
          isWeekly && v.repeatWeekdays?.length
            ? v.repeatWeekdays
            : isWeekly && v.repeat !== "custom"
              ? [isoWeekday(v.date)]
              : [];
        rule = buildRule(
          v.repeat,
          v.repeatInterval || 1,
          days,
          v.repeat === "custom" ? !!v.repeatWorkday : false,
          v.repeatEndDate ? v.repeatEndDate.format("YYYY-MM-DD") : null,
        );
      }

      const offset = v.reminderOffset === "custom" ? v.customReminderOffset ?? 0 : (v.reminderOffset as number);

      const input = {
        title: v.title.trim(),
        notes: v.notes ?? "",
        categoryId: v.categoryId ?? null,
        startDate,
        endDate,
        startTime: isAllDay ? null : v.startTime ? v.startTime.format("HH:mm") : null,
        endTime: isAllDay ? null : v.endTime ? v.endTime.format("HH:mm") : null,
        isAllDay,
        recurrenceRule: serializeRule(rule),
        reminderEnabled: !!v.reminderEnabled,
        reminderOffsetMinutes: offset,
        priority: v.priority,
        completed: ev?.completed ?? false,
        tagIds,
      };

      if (ev) {
        const mode = isEditingOccurrence && v.editScope === "occurrence" ? "occurrence" : "series";
        await api.updateEvent(
          ev.id,
          input,
          mode,
          mode === "occurrence" ? occDate ?? undefined : undefined,
        );
      } else {
        await api.createEvent(input);
      }
      await reloadAll();
      message.success(ev ? "已保存" : "已创建");
      close();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error("保存失败：" + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={ev ? "编辑日程" : "新建日程"}
      okText={ev ? "保存" : "创建"}
      cancelText="取消"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={close}
      width={560}
      destroyOnClose
      maskClosable={false}
    >
      <Form form={form} layout="vertical" initialValues={initial} style={{ marginTop: 8 }}>
        <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
          <Input placeholder="日程标题" maxLength={100} autoFocus />
        </Form.Item>

        {isEditingOccurrence && (
          <Form.Item name="editScope" label="修改范围">
            <Radio.Group>
              <Radio.Button value="occurrence">仅本次</Radio.Button>
              <Radio.Button value="series">整个系列</Radio.Button>
            </Radio.Group>
          </Form.Item>
        )}

        <div className="grid grid-cols-2 gap-x-3">
          <Form.Item name="date" label="日期" rules={[{ required: true, message: "请选择日期" }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="endDate" label="结束日期">
            <DatePicker style={{ width: "100%" }} placeholder="同开始日期" />
          </Form.Item>
        </div>

        <Form.Item name="allDay" label="全天" valuePropName="checked">
          <Switch />
        </Form.Item>

        {!allDay && (
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item name="startTime" label="开始时间">
              <TimePicker style={{ width: "100%" }} format="HH:mm" placeholder="可选" />
            </Form.Item>
            <Form.Item name="endTime" label="结束时间">
              <TimePicker style={{ width: "100%" }} format="HH:mm" placeholder="可选" />
            </Form.Item>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-3">
          <Form.Item name="categoryId" label="分类">
            <Select allowClear placeholder="未分类">
              {categories.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: c.color }} />
                  {c.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="priority" label="优先级">
            <Select>
              <Select.Option value={0}>无</Select.Option>
              <Select.Option value={1}>低</Select.Option>
              <Select.Option value={2}>中</Select.Option>
              <Select.Option value={3}>高</Select.Option>
            </Select>
          </Form.Item>
        </div>

        <Form.Item name="tagIds" label="标签">
          <Select
            mode="tags"
            placeholder="输入后回车创建"
            options={tags.map((t) => ({ value: t.id, label: t.name }))}
            tokenSeparators={[","]}
          />
        </Form.Item>

        {/* 重复 */}
        <Form.Item label="重复">
          <Form.Item name="repeat" noStyle>
            <Select style={{ width: 150 }}>
              <Select.Option value="none">不重复</Select.Option>
              <Select.Option value="daily">每天</Select.Option>
              <Select.Option value="weekly">每周</Select.Option>
              <Select.Option value="monthly">每月</Select.Option>
              <Select.Option value="yearly">每年</Select.Option>
              <Select.Option value="custom">自定义</Select.Option>
            </Select>
          </Form.Item>
          {repeatType !== "none" && (
            <span className="inline-flex items-center gap-1 ml-2 align-middle">
              每
              <Form.Item name="repeatInterval" noStyle>
                <InputNumber min={1} max={999} style={{ width: 64 }} />
              </Form.Item>
              {repeatType === "daily" && "天"}
              {repeatType === "weekly" && "周"}
              {repeatType === "monthly" && "个月"}
              {repeatType === "yearly" && "年"}
              {repeatType === "custom" && "天"}
            </span>
          )}
        </Form.Item>
        {repeatType === "weekly" && (
          <Form.Item name="repeatWeekdays" label="每周哪几天">
            <Select mode="multiple" style={{ width: "100%" }} placeholder="默认开始日期所在星期">
              {WEEKDAY_NAMES.map((n, i) => (
                <Select.Option key={i + 1} value={i + 1}>
                  周{n}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}
        {repeatType === "custom" && (
          <Form.Item name="repeatWorkday" label="仅工作日" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
        {repeatType !== "none" && (
          <Form.Item name="repeatEndDate" label="重复截止">
            <DatePicker style={{ width: "100%" }} placeholder="不设置 = 永不结束" />
          </Form.Item>
        )}

        {/* 提醒 */}
        <Form.Item label="提醒" style={{ marginBottom: 0 }}>
          <div className="flex items-center gap-3">
            <Form.Item name="reminderEnabled" noStyle valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="reminderOffset" noStyle>
              <Select style={{ width: 160 }} disabled={!reminderEnabled}>
                {reminderOptions}
              </Select>
            </Form.Item>
            {reminderOffset === "custom" && (
              <Form.Item name="customReminderOffset" noStyle>
                <InputNumber min={-10080} max={10080} placeholder="分钟" style={{ width: 110 }} disabled={!reminderEnabled} />
              </Form.Item>
            )}
          </div>
        </Form.Item>

        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} placeholder="备注信息" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
