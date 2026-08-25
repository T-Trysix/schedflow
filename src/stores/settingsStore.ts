import { create } from "zustand";
import { api } from "@/lib/api";
import type { Settings } from "@/lib/types";
import { applyThemeToDom, resolveTheme } from "@/lib/theme";
import { useAppStore } from "./appStore";

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  set: (key: string, value: unknown) => Promise<void>;
  setMany: (map: Partial<Settings>) => Promise<void>;
}

const DEFAULTS: Settings = {
  autostart: true,
  closeToFloat: true,
  weekStart: 1,
  timeFormat: "24",
  weekendColor: true,
  scheduleModeWidth: 400,
  defaultReminderOffset: -10,
  notifySound: true,
  dndEnabled: false,
  dndStart: "22:00",
  dndEnd: "08:00",
  theme: "system",
  fontSize: 14,
  floatEnabled: true,
  floatSize: 64,
  floatOpacity: 1,
  floatShowBadge: true,
  floatX: null,
  floatY: null,
  lastMode: "month",
};

function applyThemeFromSettings(s: Settings) {
  const mode = resolveTheme(s.theme);
  applyThemeToDom(mode);
  useAppStore.getState().setResolvedTheme(mode);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const raw = await api.getSettings();
      const merged = { ...DEFAULTS, ...(raw as Partial<Settings>) };
      set({ settings: merged, loaded: true });
      applyThemeFromSettings(merged);
      // 监听系统主题变化
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => {
          const s = get().settings;
          if (s.theme === "system") applyThemeFromSettings(s);
        });
    } catch (e) {
      console.error("加载设置失败", e);
    }
  },

  set: async (key, value) => {
    const next = { ...get().settings, [key]: value };
    set({ settings: next });
    if (key === "theme") applyThemeFromSettings(next);
    try {
      await api.setSetting(key, value);
    } catch (e) {
      console.error("保存设置失败", e);
    }
  },

  setMany: async (map) => {
    const next = { ...get().settings, ...map };
    set({ settings: next });
    if (map.theme !== undefined) applyThemeFromSettings(next);
    try {
      await api.setSettings(map);
    } catch (e) {
      console.error("保存设置失败", e);
    }
  },
}));
