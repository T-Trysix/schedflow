import { useState } from "react";
import { DatePicker, Form, Input, Modal, Select, TimePicker, message } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { api } from "@/lib/api";
import { useDataStore } from "@/stores/dataStore";
import { useEditorStore } from "@/stores/editorStore";
import type { Todo } from "@/lib/types";

interface FormValues {
  title: string;
  notes?: string;
  categoryId?: number;
  priority: number;
  tagIds?: (number | string)[];
  reminderDate?: Dayjs;
  reminderTime?: Dayjs;
}

export default function TodoEditorModal() {
  const editor = useEditorStore((s) => s.todoEditor);
  const close = useEditorStore((s) => s.closeTodoEditor);
  const categories = useDataStore((s) => s.categories);
  const tags = useDataStore((s) => s.tags);
  const reloadAll = useDataStore((s) => s.reloadAll);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const todo: Todo | null | undefined = editor?.todo;

  if (!editor?.open) return null;

  const initial: FormValues = todo
    ? {
        title: todo.title,
        notes: todo.notes || undefined,
        categoryId: todo.categoryId ?? undefined,
        priority: todo.priority,
        tagIds: todo.tags,
        reminderDate: todo.reminderAt ? dayjs(todo.reminderAt) : undefined,
        reminderTime: todo.reminderAt ? dayjs(todo.reminderAt) : undefined,
      }
    : { title: "", notes: undefined, priority: 0 };

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);

      const tagIds: number[] = [];
      for (const t of v.tagIds ?? []) {
        if (typeof t === "number") tagIds.push(t);
        else {
          const id = await api.createTag(String(t).trim());
          tagIds.push(id);
        }
      }

      let reminderAt: string | null = null;
      if (v.reminderDate) {
        reminderAt = v.reminderDate.format("YYYY-MM-DD") + (v.reminderTime ? `T${v.reminderTime.format("HH:mm")}:00` : "T09:00:00");
      }

      const input = {
        title: v.title.trim(),
        notes: v.notes ?? "",
        categoryId: v.categoryId ?? null,
        priority: v.priority,
        reminderAt,
        tagIds,
      };

      if (todo) await api.updateTodo(todo.id, input);
      else await api.createTodo(input);
      await reloadAll();
      message.success(todo ? "已保存" : "已创建");
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
      title={todo ? "编辑待办" : "新建待办"}
      okText={todo ? "保存" : "创建"}
      cancelText="取消"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={close}
      width={480}
      destroyOnClose
      maskClosable={false}
    >
      <Form form={form} layout="vertical" initialValues={initial} style={{ marginTop: 8 }}>
        <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
          <Input placeholder="待办内容" maxLength={100} autoFocus />
        </Form.Item>

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

        <Form.Item label="提醒时间">
          <div className="flex gap-2">
            <Form.Item name="reminderDate" noStyle>
              <DatePicker style={{ width: "100%" }} placeholder="提醒日期" />
            </Form.Item>
            <Form.Item name="reminderTime" noStyle>
              <TimePicker style={{ width: 120 }} format="HH:mm" placeholder="时间" />
            </Form.Item>
          </div>
        </Form.Item>

        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} placeholder="备注信息" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
