import { useState } from "react";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Slider,
  Switch,
  Tabs,
  Tag,
  message,
} from "antd";
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/api";
import { useDataStore } from "@/stores/dataStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAppStore } from "@/stores/appStore";
import type { Category } from "@/lib/types";

const COLORS = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#6b7280"];

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const setMany = useSettingsStore((s) => s.setMany);
  const categories = useDataStore((s) => s.categories);
  const tags = useDataStore((s) => s.tags);
  const reloadAll = useDataStore((s) => s.reloadAll);
  const setMode = useAppStore((s) => s.setMode);

  const [catModal, setCatModal] = useState<{ open: boolean; category?: Category }>({ open: false });
  const [catForm] = Form.useForm<{ name: string; color: string }>();
  const [tagName, setTagName] = useState("");
  const [autostartBusy, setAutostartBusy] = useState(false);

  const upd = (patch: Partial<typeof settings>) => {
    setMany(patch);
  };

  const saveCategory = async () => {
    try {
      const v = await catForm.validateFields();
      const input = { name: v.name.trim(), color: v.color };
      if (catModal.category) await api.updateCategory(catModal.category.id, input.name, input.color);
      else await api.createCategory(input.name, input.color);
      await reloadAll();
      message.success("已保存");
      setCatModal({ open: false });
    } catch (e) {
      message.error("保存失败");
    }
  };

  const addTag = async () => {
    const name = tagName.trim();
    if (!name) return;
    await api.createTag(name);
    setTagName("");
    await reloadAll();
  };

  const onData = (fn: () => Promise<unknown>, ok: string) => {
    fn()
      .then(() => {
        message.success(ok);
        reloadAll();
      })
      .catch((e) => message.error("操作失败：" + (e?.message ?? "")));
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-5">
        <div className="text-[16px] font-semibold text-[var(--sf-text)] mb-4">设置</div>

        <Tabs
          tabPosition="left"
          items={[
            {
              key: "general",
              label: "常规",
              children: (
                <div className="space-y-5 pt-1">
                  <SettingRow label="外观主题" desc="浅色 / 深色 / 跟随系统">
                    <Segmented
                      value={settings.theme}
                      onChange={(v) => upd({ theme: v as typeof settings.theme })}
                      options={[
                        { label: "浅色", value: "light" },
                        { label: "深色", value: "dark" },
                        { label: "跟随系统", value: "system" },
                      ]}
                    />
                  </SettingRow>
                  <SettingRow label="界面字号" desc={`${settings.fontSize}px`}>
                    <Slider
                      style={{ width: 220 }}
                      min={12}
                      max={18}
                      value={settings.fontSize}
                      onChange={(v) => upd({ fontSize: v })}
                    />
                  </SettingRow>
                  <SettingRow label="开机自启" desc="登录 Windows 后自动以悬浮球方式启动">
                    <Switch
                      checked={settings.autostart}
                      loading={autostartBusy}
                      onChange={async (v) => {
                        setAutostartBusy(true);
                        try {
                          // 直接操作注册表（调试版会被后端拒绝），成功后同步本地设置
                          const ok = await api.setAutostart(v);
                          setMany({ autostart: ok });
                        } catch (e) {
                          message.error(
                            "设置开机自启失败：" + (e instanceof Error ? e.message : String(e)),
                          );
                          // 回滚为注册表真实状态
                          try {
                            setMany({ autostart: await api.getAutostart() });
                          } catch {
                            /* ignore */
                          }
                        } finally {
                          setAutostartBusy(false);
                        }
                      }}
                    />
                  </SettingRow>
                  <SettingRow label="关闭窗口到悬浮球" desc="关闭主窗口时隐藏到悬浮球而非退出">
                    <Switch checked={settings.closeToFloat} onChange={(v) => upd({ closeToFloat: v })} />
                  </SettingRow>
                  <SettingRow label="提醒铃声" desc="系统通知是否播放提示音">
                    <Switch checked={settings.notifySound} onChange={(v) => upd({ notifySound: v })} />
                  </SettingRow>
                </div>
              ),
            },
            {
              key: "view",
              label: "视图",
              children: (
                <div className="space-y-5 pt-1">
                  <SettingRow label="每周起始日" desc="影响月视图与日程模式周条">
                    <Segmented
                      value={settings.weekStart}
                      onChange={(v) => upd({ weekStart: v })}
                      options={[
                        { label: "周一", value: 1 },
                        { label: "周日", value: 7 },
                      ]}
                    />
                  </SettingRow>
                  <SettingRow label="时间格式" desc="24 小时制或 12 小时制">
                    <Segmented
                      value={settings.timeFormat}
                      onChange={(v) => upd({ timeFormat: v as typeof settings.timeFormat })}
                      options={[
                        { label: "24 小时", value: "24" },
                        { label: "12 小时", value: "12" },
                      ]}
                    />
                  </SettingRow>
                  <SettingRow label="周末着色" desc="月视图与周条中高亮周末">
                    <Switch checked={settings.weekendColor} onChange={(v) => upd({ weekendColor: v })} />
                  </SettingRow>
                </div>
              ),
            },
            {
              key: "reminder",
              label: "提醒",
              children: (
                <div className="space-y-5 pt-1">
                  <SettingRow label="默认提醒时间" desc="新建日程时的默认提前量">
                    <Select
                      style={{ width: 200 }}
                      value={settings.defaultReminderOffset}
                      onChange={(v) => upd({ defaultReminderOffset: v })}
                      options={[
                        { label: "准时", value: 0 },
                        { label: "提前 5 分钟", value: -5 },
                        { label: "提前 10 分钟", value: -10 },
                        { label: "提前 15 分钟", value: -15 },
                        { label: "提前 30 分钟", value: -30 },
                        { label: "提前 1 小时", value: -60 },
                        { label: "提前 2 小时", value: -120 },
                        { label: "提前 1 天", value: -1440 },
                      ]}
                    />
                  </SettingRow>
                  <SettingRow label="免打扰" desc="此时间段内不弹系统提醒">
                    <div className="flex items-center gap-2">
                      <Switch checked={settings.dndEnabled} onChange={(v) => upd({ dndEnabled: v })} />
                      {settings.dndEnabled && (
                        <>
                          <Input
                            style={{ width: 90 }}
                            defaultValue={settings.dndStart ?? "22:00"}
                            onBlur={(e) => upd({ dndStart: e.target.value || "22:00" })}
                            placeholder="开始 如22:00"
                          />
                          <span className="text-[var(--sf-text-secondary)]">至</span>
                          <Input
                            style={{ width: 90 }}
                            defaultValue={settings.dndEnd ?? "08:00"}
                            onBlur={(e) => upd({ dndEnd: e.target.value || "08:00" })}
                            placeholder="结束 如08:00"
                          />
                        </>
                      )}
                    </div>
                  </SettingRow>
                </div>
              ),
            },
            {
              key: "float",
              label: "悬浮球",
              children: (
                <div className="space-y-5 pt-1">
                  <SettingRow label="启用悬浮球" desc="关闭后隐藏悬浮球，退出只能从主窗口进行">
                    <Switch checked={settings.floatEnabled} onChange={(v) => upd({ floatEnabled: v })} />
                  </SettingRow>
                  <SettingRow label="显示提醒角标" desc="有待提醒事项时在悬浮球显示红点">
                    <Switch checked={settings.floatShowBadge} onChange={(v) => upd({ floatShowBadge: v })} />
                  </SettingRow>
                  <SettingRow label="悬浮球大小" desc={`${settings.floatSize}px`}>
                    <Slider
                      style={{ width: 220 }}
                      min={48}
                      max={88}
                      value={settings.floatSize}
                      onChange={(v) => upd({ floatSize: v })}
                    />
                  </SettingRow>
                  <SettingRow label="悬浮球透明度" desc={`${Math.round((settings.floatOpacity ?? 1) * 100)}%`}>
                    <Slider
                      style={{ width: 220 }}
                      min={50}
                      max={100}
                      value={Math.round((settings.floatOpacity ?? 1) * 100)}
                      onChange={(v) => upd({ floatOpacity: v / 100 })}
                    />
                  </SettingRow>
                </div>
              ),
            },
            {
              key: "cats",
              label: "分类与标签",
              children: (
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[13px] font-medium text-[var(--sf-text)]">分类</div>
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<PlusOutlined />}
                      onClick={() => {
                        catForm.resetFields();
                        catForm.setFieldsValue({ color: COLORS[categories.length % COLORS.length] });
                        setCatModal({ open: true });
                      }}
                    >
                      新建分类
                    </Button>
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {categories.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--sf-border)] bg-[var(--sf-bg-panel)]">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                        <span className="text-[13px] flex-1">{c.name}</span>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => {
                            catForm.setFieldsValue({ name: c.name, color: c.color });
                            setCatModal({ open: true, category: c });
                          }}
                        />
                        <Popconfirm
                          title="删除分类后，该分类下日程将归为未分类，确定？"
                          onConfirm={async () => {
                            await api.deleteCategory(c.id);
                            await reloadAll();
                          }}
                        >
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={c.isBuiltin} />
                        </Popconfirm>
                      </div>
                    ))}
                  </div>

                  <div className="text-[13px] font-medium text-[var(--sf-text)] mb-2">标签</div>
                  <div className="flex items-center gap-2 mb-3">
                    <Input
                      style={{ width: 220 }}
                      placeholder="输入标签名回车创建"
                      value={tagName}
                      onChange={(e) => setTagName(e.target.value)}
                      onPressEnter={addTag}
                    />
                    <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={addTag}>
                      添加
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t) => (
                      <Tag key={t.id} closable onClose={async () => {
                        await api.deleteTag(t.id);
                        await reloadAll();
                      }}>
                        {t.name}
                      </Tag>
                    ))}
                  </div>
                </div>
              ),
            },
            {
              key: "data",
              label: "数据管理",
              children: (
                <div className="pt-1">
                  <div className="text-[13px] text-[var(--sf-text-secondary)] mb-3">
                    所有数据保存在本地数据库。备份为库文件副本；导出为 JSON 或 CSV；恢复/导入会合并或覆盖数据。
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Button icon={<CloudDownloadOutlined />} onClick={() => onData(api.backupDb, "备份成功")}>
                      备份数据库
                    </Button>
                    <Button icon={<CloudUploadOutlined />} onClick={() => onData(api.restoreDb, "恢复成功，数据已重载")}>
                      恢复备份
                    </Button>
                    <Button onClick={() => onData(api.exportJson, "已导出 JSON")}>导出 JSON</Button>
                    <Button onClick={() => onData(api.exportCsv, "已导出 CSV")}>导出 CSV</Button>
                    <Button onClick={() => onData(api.importJson, "导入完成")}>导入 JSON</Button>
                    <Popconfirm
                      title="清空全部数据"
                      description="将删除所有日程、待办、分类与标签，此操作不可撤销。"
                      okText="清空"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => onData(api.clearAllData, "已清空全部数据")}
                    >
                      <Button danger>清空全部数据</Button>
                    </Popconfirm>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>

      <Modal
        open={catModal.open}
        title={catModal.category ? "编辑分类" : "新建分类"}
        okText="保存"
        cancelText="取消"
        onOk={saveCategory}
        onCancel={() => setCatModal({ open: false })}
        width={380}
        destroyOnClose
      >
        <Form form={catForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="分类名称" maxLength={20} />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <div className="flex flex-wrap gap-2 pt-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`w-7 h-7 rounded-full cursor-pointer transition-transform hover:scale-110 ${
                    catForm.getFieldValue?.("color") === c ? "ring-2 ring-offset-2 ring-[var(--sf-today-ring)]" : ""
                  }`}
                  style={{ background: c }}
                  onClick={() => catForm.setFieldValue("color", c)}
                />
              ))}
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function SettingRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <div className="text-[13.5px] text-[var(--sf-text)]">{label}</div>
        {desc && <div className="text-[11.5px] text-[var(--sf-text-secondary)] mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
