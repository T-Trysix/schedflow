import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Divider, Empty, Menu, Tooltip } from "antd";
import {
  BellOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { getCurrentWindow, currentMonitor, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { emitTo, listen } from "@tauri-apps/api/event";
import { api } from "@/lib/api";
import { fmtDate, getWeekDays } from "@/lib/date";
import { useDataStore } from "@/stores/dataStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { DayEvent, ReminderInfo } from "@/lib/types";

const win = getCurrentWindow();
const BALL_BASE = 64;
// 球与窗口边缘的留白：需盖过 drop-shadow 的模糊外延（0 3px 8px ≈ 11px），否则阴影被窗口裁成"正方形"
const WIN_PAD = 12;
const PANEL_W = 380;
const PANEL_H = 600;
const BUBBLE_W = 280;
const BUBBLE_H = 230;
const MENU_W = 180;
const MENU_H = 200;
const GAP = 8;
// 停靠：可见细条宽度（物理像素）
const SLIVER = 8;
// 停靠：距屏幕边缘多少物理像素内吸附
const DOCK_THRESHOLD = 60;
// 屏幕边缘工作区安全边距（物理像素，近似避开任务栏/不贴边）
const EDGE_INSET = 8;
// 停靠态悬停触发（CSS px）：命中区是整窗，但**展开**只应发生在鼠标贴近可见细条时——
// 否则鼠标在整窗任意处（离屏幕边缘最远 ~88px）就会把球弹出来。
// 这里按鼠标到细条的距离判定，带迟滞避免来回抖动：
// 距细条 ≤ HOVER_TRIGGER 才展开；展开后距细条 > HOVER_KEEP 才收起（须覆盖展开球全部范围，稳定保持）。
const HOVER_TRIGGER = 16;
const HOVER_KEEP = 72;

type FloatState = "ball" | "bubble" | "panel" | "menu";
type DockEdge = "left" | "right" | "top" | "bottom";

interface MonitorInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}

// ---- 统一几何：window.setSize 用 LogicalSize（会按 scaleFactor 放大成物理尺寸），
//      而 outerPosition()/currentMonitor() 返回物理像素。
//      所有钳制必须用"逻辑值 × scaleFactor"换算后的物理尺寸，否则高 DPI 屏会溢出。 ----
async function monitorOf(): Promise<MonitorInfo> {
  const m = await currentMonitor();
  return {
    x: m?.position.x ?? 0,
    y: m?.position.y ?? 0,
    w: m?.size.width ?? 1920,
    h: m?.size.height ?? 1080,
    scale: m?.scaleFactor ?? 1,
  };
}
const toPhys = (logical: number, scale: number) => Math.round(logical * scale);
function clampPhys(x: number, y: number, wPhys: number, hPhys: number, m: MonitorInfo) {
  return {
    x: Math.max(m.x, Math.min(x, m.x + m.w - wPhys)),
    y: Math.max(m.y, Math.min(y, m.y + m.h - hPhys)),
  };
}

const MENU_ITEMS = [
  { key: "open", label: "打开主窗口", icon: <CalendarOutlined /> },
  { type: "divider" as const },
  { key: "todo", label: "快速加待办", icon: <CheckSquareOutlined /> },
  { key: "event", label: "快速加日程", icon: <CalendarOutlined /> },
  { type: "divider" as const },
  { key: "exit", label: "退出应用", icon: <CloseOutlined />, danger: true },
];

export default function FloatApp() {
  const settings = useSettingsStore((s) => s.settings);
  const events = useDataStore((s) => s.events);
  const todos = useDataStore((s) => s.todos);
  const unread = useDataStore((s) => s.unreadCount);
  const loadEvents = useDataStore((s) => s.loadEvents);
  const reloadAll = useDataStore((s) => s.reloadAll);
  const refreshUnread = useDataStore((s) => s.refreshUnread);

  const [state, setState] = useState<FloatState>("ball");
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null);
  const [bubble, setBubble] = useState<ReminderInfo | null>(null);
  const [menuLeft, setMenuLeft] = useState(WIN_PAD);
  const [todayEvents, setTodayEvents] = useState<DayEvent[]>([]);
  // 未读提醒列表：悬浮球面板内点击可标记已读，与主窗待办页保持同步
  const [unreadList, setUnreadList] = useState<ReminderInfo[]>([]);
  // 圆球在窗口内的偏移：打开右键菜单时窗口会被放大/位移，此偏移随窗口补偿，保证圆球的屏幕位置不变
  const [ballOffset, setBallOffset] = useState({ x: WIN_PAD, y: WIN_PAD });
  // 停靠状态（正交于 FloatState：面板/菜单/气泡弹出时球临时解除停靠，但 dockedRef 记住以在收起时还原）
  const [docked, setDocked] = useState<DockEdge | null>(null);
  const [hovered, setHovered] = useState(false);

  const dragRef = useRef<{
    sx: number;
    sy: number;
    wx: number;
    wy: number;
    scale: number;
    moving: boolean;
    pointerId: number;
    raf: number | null;
    tx: number;
    ty: number;
    // 最近一次指针位置：异步校正起始几何时据此重算 tx/ty
    cx: number;
    cy: number;
  } | null>(null);
  // 窗口物理位置 / 缩放缓存：拖动开始时同步取用，不再等两次 IPC 才能跟手
  const winPosRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const didDrag = useRef(false);
  const singleClickTimer = useRef<number | null>(null);
  // 停靠边持久记忆（面板/菜单/气泡期间不清除，收起时据此还原停靠条）
  const dockedRef = useRef<DockEdge | null>(null);
  // 停靠几何快照：{ edge, winPos(物理), ballRest(CSS) }，悬停/收起时复用
  const dockGeoRef = useRef<{ edge: DockEdge; winPos: { x: number; y: number }; ballRest: { x: number; y: number } } | null>(null);

  const setDockedState = (d: DockEdge | null) => {
    dockedRef.current = d;
    setDocked(d);
  };

  const ballSize = settings.floatSize ?? BALL_BASE;
  const winSize = ballSize + WIN_PAD * 2;

  // 停靠后可见细条在窗口内的矩形（CSS px），用于悬停近场判定。
  // 细条 = 球被窗口边缘裁剪后露出的那一段：右/下停靠靠窗口右/下缘，左/上停靠靠左/上缘。
  const dockedSliverRect = (): { x: number; y: number; w: number; h: number } | null => {
    if (!docked || !dockGeoRef.current) return null;
    const s = SLIVER / (scaleRef.current || 1);
    const b = ballSize;
    switch (docked) {
      case "right": return { x: winSize - s, y: WIN_PAD, w: s, h: b };
      case "left": return { x: 0, y: WIN_PAD, w: s, h: b };
      case "top": return { x: WIN_PAD, y: 0, w: b, h: s };
      case "bottom": return { x: WIN_PAD, y: winSize - s, w: b, h: s };
    }
  };

  const computeDockGeo = (edge: DockEdge, winPos: { x: number; y: number }, m: MonitorInfo) => {
    // 停靠态球的 CSS 偏移：让球大部分溢出窗口被裁剪，只露 SLIVER 物理像素细条
    const ballRest: { x: number; y: number } =
      edge === "right"
        ? { x: winSize - SLIVER / m.scale, y: WIN_PAD }
        : edge === "left"
          ? { x: SLIVER / m.scale - ballSize, y: WIN_PAD }
          : edge === "top"
            ? { x: WIN_PAD, y: SLIVER / m.scale - ballSize }
            : { x: WIN_PAD, y: winSize - SLIVER / m.scale };
    return { edge, winPos, ballRest };
  };

  // 初始位置：恢复上次记忆（含停靠态）。
  // 修复：历史版本可能在 floatX/Y 里留下屏幕外的坐标（单击停靠条误清停靠 + 窗口被挪出屏外），
  // 这里一律按监视器钳制；停靠分支按停靠边重算窗口位置（垂直/水平轴取记忆的中心位置），保证重启后停靠条可见。
  useEffect(() => {
    (async () => {
      try {
        const m = await monitorOf();
        scaleRef.current = m.scale;
        const s = useSettingsStore.getState().settings;
        const dockSetting = s.floatDock as DockEdge | null | undefined;
        const winPhys = toPhys(winSize, m.scale);
        const cx = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
        await win.setSize(new LogicalSize(winSize, winSize));
        if (dockSetting) {
          let winPos: { x: number; y: number };
          if (dockSetting === "left" || dockSetting === "right") {
            const cy = (s.floatY != null ? s.floatY : m.y + m.h - winPhys) + winPhys / 2;
            winPos = {
              x: dockSetting === "right" ? m.x + m.w - winPhys : m.x,
              y: cx(cy - winPhys / 2, m.y, m.y + m.h - winPhys),
            };
          } else {
            const cx2 = (s.floatX != null ? s.floatX : m.x + m.w - winPhys) + winPhys / 2;
            winPos = {
              x: cx(cx2 - winPhys / 2, m.x, m.x + m.w - winPhys),
              y: dockSetting === "top" ? m.y : m.y + m.h - winPhys,
            };
          }
          winPosRef.current = { x: winPos.x, y: winPos.y };
          await win.setPosition(new PhysicalPosition(winPos.x, winPos.y));
          setBallPos({ x: winPos.x, y: winPos.y });
          dockGeoRef.current = computeDockGeo(dockSetting, winPos, m);
          setDockedState(dockSetting);
          setHovered(false);
        } else {
          const x = s.floatX != null ? s.floatX : m.x + m.w - toPhys(winSize, m.scale) - 16;
          const y = s.floatY != null ? s.floatY : m.y + m.h - toPhys(winSize, m.scale) - 120;
          const c = clampPhys(x, y, winPhys, winPhys, m);
          setBallPos({ x: c.x, y: c.y });
          winPosRef.current = { x: c.x, y: c.y };
          await win.setPosition(new PhysicalPosition(c.x, c.y));
        }
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 统一窗口位移入口：先记录物理位置（拖动起点缓存）再移动，保证拖动开始时拿到的位置是准的
  const placeWindow = useCallback(async (x: number, y: number) => {
    winPosRef.current = { x, y };
    try {
      await win.setPosition(new PhysicalPosition(x, y));
    } catch {
      /* ignore */
    }
  }, []);

  const setBallWindow = useCallback(async () => {
    try {
      await win.setSize(new LogicalSize(winSize, winSize));
      if (ballPos) await placeWindow(ballPos.x, ballPos.y);
    } catch {
      /* ignore */
    }
  }, [winSize, ballPos, placeWindow]);

  // 收起后回到"球"：停靠过则还原停靠条，否则回自由球
  const restoreBallOrDock = useCallback(async () => {
    const geo = dockGeoRef.current;
    if (dockedRef.current && geo) {
      setHovered(false);
      try {
        await win.setSize(new LogicalSize(winSize, winSize));
        await placeWindow(geo.winPos.x, geo.winPos.y);
      } catch {
        /* ignore */
      }
    } else {
      await setBallWindow();
    }
  }, [setBallWindow, placeWindow, winSize]);

  const refreshToday = useCallback(async () => {
    try {
      const week = getWeekDays(dayjs(), Number(useSettingsStore.getState().settings.weekStart) || 1);
      await loadEvents(fmtDate(week[0]), fmtDate(week[6]));
      const key = fmtDate(dayjs());
      const list = useDataStore
        .getState()
        .events.filter((e) => e.occurrenceDate === key && !e.completed)
        .sort((a, b) => (a.isAllDay === b.isAllDay ? (a.startTime ?? "").localeCompare(b.startTime ?? "") : a.isAllDay ? -1 : 1));
      setTodayEvents(list.slice(0, 5));
    } catch {
      /* ignore */
    }
  }, [loadEvents]);

  const loadUnread = useCallback(async () => {
    try {
      setUnreadList(await api.listUnreadReminders());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshToday();
  }, [refreshToday]);

  // 未读计数变化（本窗标记已读 / 其他窗口标记后 data-changed 同步）→ 重拉未读列表
  useEffect(() => {
    loadUnread();
  }, [unread, loadUnread]);

  // 提醒角标 / 气泡 / 数据联动
  useEffect(() => {
    refreshUnread();
    const enterBubble = async (r: ReminderInfo) => {
      setBubble(r);
      setState("bubble");
      try {
        // 停靠状态下先还原自由球，气泡才锚定在屏内的球旁
        if (dockedRef.current) await undockFromDock();
        const m = await monitorOf();
        const p = await win.outerPosition();
        const bw = toPhys(BUBBLE_W, m.scale);
        const bh = toPhys(BUBBLE_H, m.scale);
        const bl = p.x + toPhys(WIN_PAD, m.scale);
        const bt = p.y + toPhys(WIN_PAD, m.scale);
        // 气泡默认锚在球左侧（贴近球左缘）；左侧放不下（贴屏幕左缘）则翻到右侧
        let x = bl - bw - toPhys(GAP, m.scale);
        if (x < m.x) x = bl + toPhys(ballSize, m.scale) + toPhys(GAP, m.scale);
        const c = clampPhys(x, bt, bw, bh, m);
        await placeWindow(c.x, c.y);
        await win.setSize(new LogicalSize(BUBBLE_W, BUBBLE_H));
      } catch {
        /* ignore */
      }
      // 提醒气泡持久显示：不自动消失，直到用户点"知道了"/"查看"
    };

    const unReminder = listen<ReminderInfo>("reminder-fired", (ev) => {
      enterBubble(ev.payload);
      refreshUnread();
    });
    const unData = listen("data-changed", () => {
      // 顺序必须确定：reloadAll 会重拉本周日程并 set 到 store，若与其并发执行，
      // refreshToday 可能先读到旧 events 快照（今日列表不更新）；而 loadEvents 对
      // 同范围又有缓存跳过，无法自救。因此先等数据重载完成，再刷新今日列表。
      void (async () => {
        try {
          await reloadAll();
          await refreshToday();
        } finally {
          loadUnread();
        }
      })();
    });
    return () => {
      unReminder.then((f) => f());
      unData.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 停靠 ----
  const applyDock = useCallback(
    async (edge: DockEdge) => {
      try {
        const m = await monitorOf();
        const winPhys = toPhys(winSize, m.scale);
        const p = await win.outerPosition();
        const c = { x: p.x + winPhys / 2, y: p.y + winPhys / 2 };
        const cx = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
        let winPos: { x: number; y: number };
        if (edge === "left" || edge === "right") {
          // 沿垂直方向保持球的中心位置（夹持在屏内）
          winPos = {
            x: edge === "right" ? m.x + m.w - winPhys : m.x,
            y: cx(c.y - winPhys / 2, m.y, m.y + m.h - winPhys),
          };
        } else {
          winPos = {
            x: cx(c.x - winPhys / 2, m.x, m.x + m.w - winPhys),
            y: edge === "top" ? m.y : m.y + m.h - winPhys,
          };
        }
        dockGeoRef.current = computeDockGeo(edge, winPos, m);
        setDockedState(edge);
        setHovered(false);
        scaleRef.current = m.scale;
        await win.setSize(new LogicalSize(winSize, winSize));
        await placeWindow(winPos.x, winPos.y);
        await api.setSetting("floatDock", edge);
      } catch {
        /* ignore */
      }
    },
    [placeWindow, winSize],
  );

  // 临时解除停靠（面板/菜单/气泡用）：按球当前屏幕位置还原为自由球，dockedRef 保留以便收起时还原
  const undockFromDock = useCallback(async () => {
    try {
      const m = await monitorOf();
      const p = await win.outerPosition();
      const rest = dockGeoRef.current?.ballRest ?? { x: WIN_PAD, y: WIN_PAD };
      const ballScreenX = p.x + toPhys(rest.x, m.scale);
      const ballScreenY = p.y + toPhys(rest.y, m.scale);
      // 左/上停靠时 rest 偏移为负，直接相减会把窗口挪出屏幕 → 钳制保证窗口完整落在监视器内
      const winPhys = toPhys(winSize, m.scale);
      const c = clampPhys(
        ballScreenX - toPhys(WIN_PAD, m.scale),
        ballScreenY - toPhys(WIN_PAD, m.scale),
        winPhys,
        winPhys,
        m,
      );
      scaleRef.current = m.scale;
      await win.setSize(new LogicalSize(winSize, winSize));
      await placeWindow(c.x, c.y);
    } catch {
      /* ignore */
    }
  }, [placeWindow, winSize]);

  // ---- 拖拽（手动 setPosition，带阈值区分点击）----
  // 不跟手的原因：e.screenX/Y 是 CSS 像素，而 setPosition 用物理像素；
  // 高 DPI 缩放下（如 150%）必须乘以 scaleFactor，否则窗口移动比鼠标慢。
  // 同时用 requestAnimationFrame 合并高频 pointermove，避免 IPC 调用堆积导致抖动。
  const onPointerDown = (e: React.PointerEvent) => {
    // 菜单打开时：点击球关闭菜单，不触发拖拽/展开
    if (stateRef.current === "menu") {
      didDrag.current = true;
      closeMenu();
      return;
    }
    if (e.button !== 0 || state !== "ball") return;
    e.preventDefault();
    didDrag.current = false;
    // 按下时不解除停靠：单击细条应走 openPanel（临时解除，收起还原停靠条）。
    // 永久解除停靠只在 onPointerUp 判定为真正拖动（d.moving）后走自由球分支清停靠态。
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    // 用缓存的位置/缩放同步建立 dragRef：按下即跟手，不再等 outerPosition+currentMonitor 两次 IPC（起步不粘滞）
    const p = winPosRef.current;
    const d = {
      sx: e.screenX,
      sy: e.screenY,
      wx: p.x,
      wy: p.y,
      scale: scaleRef.current,
      moving: false,
      pointerId: e.pointerId,
      raf: null,
      tx: p.x,
      ty: p.y,
      cx: e.screenX,
      cy: e.screenY,
    };
    dragRef.current = d;
    // 异步校正真实窗口位置/缩放（不阻塞拖动；拖到不同 DPI 的显示器时仍准确）
    Promise.all([win.outerPosition(), currentMonitor()])
      .then(([rp, mon]) => {
        if (dragRef.current !== d) return;
        d.wx = rp.x;
        d.wy = rp.y;
        if (mon?.scaleFactor) d.scale = mon.scaleFactor;
        d.tx = d.wx + (d.cx - d.sx) * d.scale;
        d.ty = d.wy + (d.cy - d.sy) * d.scale;
      })
      .catch(() => {});
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.cx = e.screenX;
    d.cy = e.screenY;
    const dx = e.screenX - d.sx;
    const dy = e.screenY - d.sy;
    if (!d.moving && Math.hypot(dx, dy) > 5) d.moving = true;
    if (d.moving) {
      d.tx = d.wx + dx * d.scale;
      d.ty = d.wy + dy * d.scale;
      if (d.raf == null) {
        d.raf = window.requestAnimationFrame(() => {
          d.raf = null;
          if (dragRef.current === d) {
            const rx = Math.round(d.tx);
            const ry = Math.round(d.ty);
            // 记录最新位置：下一次拖动直接同步取用
            winPosRef.current = { x: rx, y: ry };
            win.setPosition(new PhysicalPosition(rx, ry)).catch(() => {});
          }
        });
      }
    }
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.raf != null) window.cancelAnimationFrame(d.raf);
    dragRef.current = null;
    if (!d.moving) return;
    didDrag.current = true;
    // 记录位置 + 四边吸附
    try {
      const m = await monitorOf();
      const p = await win.outerPosition();
      const winPhys = toPhys(winSize, m.scale);
      const c = { x: p.x + winPhys / 2, y: p.y + winPhys / 2 };
      const dists = [
        { edge: "right" as DockEdge, d: m.x + m.w - c.x },
        { edge: "left" as DockEdge, d: c.x - m.x },
        { edge: "top" as DockEdge, d: c.y - m.y },
        { edge: "bottom" as DockEdge, d: m.y + m.h - c.y },
      ]
        .filter((o) => o.d >= 0)
        .sort((a, b) => a.d - b.d);
      const best = dists[0];
      if (best && best.d <= DOCK_THRESHOLD) {
        await applyDock(best.edge);
      } else {
        // 拖离停靠条到空白处松手 = 永久解除停靠（单击不走到这里，只有真实拖动 d.moving=true）
        await placeWindow(p.x, p.y);
        setDockedState(null);
        dockGeoRef.current = null;
        await api.setSetting("floatDock", null);
      }
      const np = await win.outerPosition();
      setBallPos({ x: np.x, y: np.y });
      await api.setSetting("floatX", np.x);
      await api.setSetting("floatY", np.y);
    } catch {
      /* ignore */
    }
  };

  // ---- 单击 / 双击（用定时器区分）----
  const collapse = useCallback(async () => {
    setBubble(null);
    // 先收起窗口（此刻圆球还在补偿偏移位，屏幕位置不变），窗口归位后再复位偏移
    setState("ball");
    setBallOffset({ x: WIN_PAD, y: WIN_PAD });
    await restoreBallOrDock();
  }, [restoreBallOrDock]);

  const openPanel = useCallback(async () => {
    try {
      if (dockedRef.current) await undockFromDock();
      const m = await monitorOf();
      const p = await win.outerPosition();
      const pw = toPhys(PANEL_W, m.scale);
      const ph = toPhys(PANEL_H, m.scale);
      // 球屏幕 rect（球 CSS 在 WIN_PAD）
      const bl = p.x + toPhys(WIN_PAD, m.scale);
      const bt = p.y + toPhys(WIN_PAD, m.scale);
      const br = bl + toPhys(ballSize, m.scale);
      const bb = bt + toPhys(ballSize, m.scale);
      let px = br + toPhys(GAP, m.scale);
      if (px + pw > m.x + m.w - EDGE_INSET) px = bl - toPhys(GAP, m.scale) - pw;
      let py = bt;
      if (py + ph > m.y + m.h - EDGE_INSET) py = bb - ph;
      const c = clampPhys(px, py, pw, ph, m);
      setBallPos({ x: p.x, y: p.y });
      await placeWindow(c.x, c.y);
      await win.setSize(new LogicalSize(PANEL_W, PANEL_H));
      setState("panel");
      await refreshToday();
    } catch {
      setState("panel");
    }
  }, [ballSize, placeWindow, refreshToday]);

  const handleBallClick = useCallback(() => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    if (singleClickTimer.current) window.clearTimeout(singleClickTimer.current);
    singleClickTimer.current = window.setTimeout(() => {
      singleClickTimer.current = null;
      if (stateRef.current === "ball") openPanel();
      else collapse();
    }, 260);
  }, [collapse, openPanel]);

  const handleBallDoubleClick = useCallback(() => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    if (singleClickTimer.current) {
      window.clearTimeout(singleClickTimer.current);
      singleClickTimer.current = null;
    }
    api.showMain();
    collapse();
  }, [collapse]);

  // ---- 右键菜单（悬浮球窗口很小，菜单直接画在窗口内，必要时临时放大窗口）----
  const openMenu = useCallback(async () => {
    try {
      if (dockedRef.current) await undockFromDock();
      const m = await monitorOf();
      const p = await win.outerPosition();
      const bl = p.x + toPhys(WIN_PAD, m.scale);
      const bt = p.y + toPhys(WIN_PAD, m.scale);
      const br = bl + toPhys(ballSize, m.scale);
      const winW = MENU_W + GAP + ballSize + WIN_PAD * 2;
      const winPhysW = toPhys(winW, m.scale);
      const needH = Math.max(winSize, WIN_PAD + MENU_H);
      const winPhysH = toPhys(needH, m.scale);
      // 菜单放球右侧；右侧放不下则翻到左侧（窗口向左侧延伸）
      const rightFit = br + toPhys(GAP, m.scale) + toPhys(MENU_W, m.scale) <= m.x + m.w - EDGE_INSET;
      let winX = p.x;
      let menuLeft = WIN_PAD + ballSize + GAP;
      if (!rightFit) {
        winX = p.x - toPhys(MENU_W + GAP, m.scale);
        menuLeft = WIN_PAD;
      }
      let winY = p.y;
      if (winY + winPhysH > m.y + m.h - EDGE_INSET) winY = Math.max(m.y + EDGE_INSET, m.y + m.h - winPhysH - EDGE_INSET);
      setMenuLeft(menuLeft);
      // 窗口被放大/位移时，圆球在窗口内的偏移随之补偿，保证圆球屏幕坐标完全不变
      setBallOffset({ x: WIN_PAD - (winX - p.x) / m.scale, y: WIN_PAD - (winY - p.y) / m.scale });
      await win.setSize(new LogicalSize(winW, needH));
      await placeWindow(winX, winY);
      setState("menu");
    } catch {
      setState("menu");
    }
  }, [placeWindow, winSize, ballSize]);

  const closeMenu = useCallback(async () => {
    await collapse();
  }, [collapse]);

  // 菜单打开时：Esc 或窗口失焦 → 关闭菜单
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stateRef.current === "menu") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    const unFocus = win.onFocusChanged(({ payload: focused }) => {
      if (!focused && stateRef.current === "menu") closeMenu();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      unFocus.then((f) => f());
    };
  }, [closeMenu]);

  const stateRef = useRef<FloatState>("ball");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const quickAdd = async (type: "todo" | "event") => {
    await api.showMain();
    await emitTo("main", "global-shortcut", type === "todo" ? "add_todo" : "add_event");
  };

  const handleContextAction = async (key: string) => {
    await closeMenu();
    if (key === "open") {
      await api.showMain();
    } else if (key === "todo" || key === "event") {
      await quickAdd(key as "todo" | "event");
    } else if (key === "exit") {
      await api.exitApp();
    }
  };

  // 气泡"知道了"：标记当前提醒已读（同步主窗/角标）后收起
  const dismissBubble = async () => {
    if (bubble) {
      try {
        await api.markRemindersRead([bubble.id]);
        refreshUnread();
      } catch {
        /* ignore */
      }
    }
    await collapse();
  };

  // 气泡"查看"：标记已读 → 打开主窗并跳转到对应位置 → 收起
  const viewBubble = async () => {
    if (!bubble) return;
    try {
      await api.markRemindersRead([bubble.id]);
      refreshUnread();
    } catch {
      /* ignore */
    }
    await api.showMain();
    emitTo("main", "open-reminder", bubble);
    await collapse();
  };

  // 悬浮球面板内点击未读提醒：标记已读 → 打开主窗并跳转 → 收起面板
  const openReminderFromPanel = async (r: ReminderInfo) => {
    try {
      await api.markRemindersRead([r.id]);
      setUnreadList((prev) => prev.filter((x) => x.id !== r.id));
      refreshUnread();
      await api.showMain();
      emitTo("main", "open-reminder", r);
      await collapse();
    } catch {
      /* ignore */
    }
  };

  const markAllReadInPanel = async () => {
    try {
      await api.markAllRemindersRead();
      setUnreadList([]);
      refreshUnread();
    } catch {
      /* ignore */
    }
  };

  // 球的 CSS 位置：菜单态用补偿偏移；停靠且未悬停用"细条"偏移，悬停用自然位
  const ballCss =
    state === "menu"
      ? ballOffset
      : state === "ball" && docked
        ? hovered
          ? { x: WIN_PAD, y: WIN_PAD }
          : dockGeoRef.current?.ballRest ?? { x: WIN_PAD, y: WIN_PAD }
        : { x: WIN_PAD, y: WIN_PAD };
  // 停靠悬停命中区 = 整个停靠窗口：细条（贴边 ~8px）与展开球（窗口中部）相距约一个窗口宽，
  // 命中区必须同时覆盖两者才能稳定保持悬停；窗口仅 ~88px，透明区参与悬停的代价可忽略。
  // 命中区原点取 (0,0) → 球 div 的 left/top（窗口相对坐标）不再被命中区偏移错误平移。
  const hitCss =
    state === "ball" && docked
      ? { x: 0, y: 0, w: winSize, h: winSize }
      : { x: ballCss.x, y: ballCss.y, w: ballSize, h: ballSize };

  const badgeVisible = settings.floatShowBadge && unread > 0;
  // 停靠且未展开（细条态）：角标脱离球、相对窗口（此时窗口贴屏幕边缘）定位在屏幕内侧一角
  const dockedSliver = state === "ball" && !!docked && !hovered;

  // 球上角标的 CSS：默认在球右上角；球贴近屏幕右缘时翻到球左缘，贴上缘时翻到球下缘，
  // 保证角标完整落在屏幕内侧而不被边缘裁切
  const ballBadgeStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = { top: -2, right: -2, left: "auto", bottom: "auto" };
    const winLeft = window.screenX ?? 0;
    const winTop = window.screenY ?? 0;
    const ballRight = winLeft + ballCss.x + ballSize;
    const ballTop = winTop + ballCss.y;
    const availW = window.screen.availWidth || 0;
    const availH = window.screen.availHeight || 0;
    const NEAR = 40;
    if (availW && availW - ballRight < NEAR) {
      style.right = "auto";
      style.left = -2;
    }
    if (availH && ballTop < NEAR) {
      style.top = "auto";
      style.bottom = -2;
    }
    return style;
  };

  // 细条态角标的 CSS：按停靠边贴向窗口（屏幕）内侧一角 —— 右停靠贴右缘、底停靠贴下缘，其余贴左缘/上缘
  const sliverBadgeStyle = (): React.CSSProperties => {
    const s: React.CSSProperties = { left: 6, top: 6, right: "auto", bottom: "auto" };
    if (docked === "right") {
      s.left = "auto";
      s.right = 6;
    } else if (docked === "bottom") {
      s.top = "auto";
      s.bottom = 6;
    }
    return s;
  };

  return (
    // 根容器不捕获指针：停靠窗口完全在屏内且比球窗大，透明区必须穿透给桌面
    <div className="w-screen h-screen select-none relative" style={{ background: "transparent", pointerEvents: "none" }}>
      {/* 悬浮球本体 */}
      {(state === "ball" || state === "menu") && (
        <div
          className="absolute"
          style={{ left: hitCss.x, top: hitCss.y, width: hitCss.w, height: hitCss.h, pointerEvents: "auto" }}
          onMouseMove={(e) => {
            if (stateRef.current !== "ball" || !docked || dragRef.current) return;
            const r = dockedSliverRect();
            if (!r) return;
            const dx = Math.max(r.x - e.clientX, 0, e.clientX - (r.x + r.w));
            const dy = Math.max(r.y - e.clientY, 0, e.clientY - (r.y + r.h));
            const d = Math.hypot(dx, dy);
            // 迟滞：距细条 ≤16px 展开；展开后距细条 >72px 才收起（覆盖展开球全部范围）
            if (hovered) {
              if (d > HOVER_KEEP) setHovered(false);
            } else if (d <= HOVER_TRIGGER) {
              setHovered(true);
            }
          }}
          onPointerLeave={() => {
            if (docked && !dragRef.current) setHovered(false);
          }}
        >
          <div
            className={`sf-float-ball${docked ? " sf-docked" : ""}`}
            style={{
              position: "absolute",
              // 球的 left/top 相对命中区原点：命中区带偏移（自由球）时不叠加成双倍偏移，
              // 保证球的窗口相对坐标恒为 ballCss，右下角不再被正方形窗口边沿裁剪
              left: ballCss.x - hitCss.x,
              top: ballCss.y - hitCss.y,
              width: ballSize,
              height: ballSize,
              opacity: settings.floatOpacity ?? 1,
              zIndex: 50,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={handleBallClick}
            onDoubleClick={handleBallDoubleClick}
            onContextMenu={(e) => {
              e.preventDefault();
              if (stateRef.current !== "menu") openMenu();
            }}
            title="单击展开 · 右键菜单 · 双击打开主窗"
          >
            <svg viewBox="0 0 24 24" width={ballSize * 0.46} height={ballSize * 0.46} fill="white" aria-hidden>
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm3 6h2v2H8v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z" />
            </svg>
            {badgeVisible && (
              <span className="sf-float-badge" style={ballBadgeStyle()}>
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 停靠细条态：角标锚在窗口（屏幕）内侧一角，独立于球渲染，避免被窗口边缘裁切 */}
      {dockedSliver && badgeVisible && (
        <span className="sf-float-badge" style={sliverBadgeStyle()}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}

      {/* 右键菜单（窗口内绘制，临时放大窗口容纳） */}
      {state === "menu" && (
        <>
          {/* 点击菜单外任意处关闭 */}
          <div className="absolute inset-0 z-40" style={{ pointerEvents: "auto" }} onPointerDown={() => closeMenu()} />
          <div
            className="sf-float-menu sf-fade"
            style={{ left: menuLeft, top: WIN_PAD, width: MENU_W, zIndex: 60, pointerEvents: "auto" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Menu theme="dark" selectable={false} items={MENU_ITEMS} onClick={({ key }) => handleContextAction(key)} />
          </div>
        </>
      )}

      {/* 提醒气泡 */}
      {state === "bubble" && bubble && (
        <div className="sf-bubble sf-fade" style={{ pointerEvents: "auto" }}>
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg,#fa541c,#f5222d)" }}>
              <BellOutlined />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-[var(--sf-text)] truncate">{bubble.title}</div>
              <div className="text-[11.5px] text-[var(--sf-text-secondary)] mt-0.5">{bubble.occurrenceAt}</div>
              <div className="mt-2 flex gap-2">
                <Button size="small" type="primary" onClick={viewBubble}>
                  查看
                </Button>
                <Button size="small" onClick={dismissBubble}>
                  知道了
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 快捷面板 */}
      {state === "panel" && (
        <div className="sf-float-panel sf-fade" style={{ pointerEvents: "auto" }}>
          <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--sf-border)] shrink-0">
            <div className="flex items-center gap-2">
              {/* 悬浮球锚点：球以迷你球形态保留在面板内，点击收起（球不再消失） */}
              <div
                className="sf-float-anchor"
                style={{ width: 28, height: 28 }}
                title="收起"
                onClick={collapse}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <svg viewBox="0 0 24 24" width={13} height={13} fill="white" aria-hidden>
                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm3 6h2v2H8v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z" />
                </svg>
              </div>
              <span className="text-[14px] font-semibold text-[var(--sf-text)]">日程通</span>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip title="快速加待办">
                <Button type="text" size="small" icon={<CheckSquareOutlined />} onClick={() => quickAdd("todo")} />
              </Tooltip>
              <Tooltip title="快速加日程">
                <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => quickAdd("event")} />
              </Tooltip>
              <Button type="text" size="small" icon={<CloseOutlined />} onClick={collapse} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {unreadList.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[12px] font-semibold text-[var(--sf-text)]">
                    <BellOutlined className="mr-1 text-[#ff4d4f]" />
                    未读提醒
                    <span className="ml-1 font-normal text-[var(--sf-text-secondary)]">{unreadList.length} 条</span>
                  </div>
                  <Button size="small" type="link" style={{ fontSize: 11 }} onClick={markAllReadInPanel}>
                    全部已读
                  </Button>
                </div>
                <div className="space-y-1 mb-1">
                  {unreadList.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--sf-hover)] cursor-pointer transition-colors"
                      onClick={() => openReminderFromPanel(r)}
                      title={r.notes || undefined}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff4d4f] shrink-0" />
                      <span className="text-[12px] text-[var(--sf-text)] truncate flex-1">{r.title}</span>
                      <span className="text-[10.5px] text-[var(--sf-text-secondary)] shrink-0">
                        {dayjs(r.occurrenceAt).format("M/D HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
                <Divider style={{ margin: "8px 0" }} />
              </>
            )}

            <div className="text-[12px] text-[var(--sf-text-secondary)] mb-1.5">
              {dayjs().format("M月D日 dddd")} · 今日日程
            </div>
            {todayEvents.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今日无日程" style={{ margin: "12px 0" }} />
            ) : (
              <div className="space-y-1">
                {todayEvents.map((e) => (
                  <div key={e.id + e.occurrenceDate} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--sf-hover)]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.categoryColor ?? "#9ca3af" }} />
                    <span className="text-[12.5px] truncate flex-1">{e.title}</span>
                    <span className="text-[11px] text-[var(--sf-text-secondary)] shrink-0">
                      {e.isAllDay ? "全天" : e.startTime ?? ""}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Divider style={{ margin: "10px 0" }} />

            <div className="text-[12px] text-[var(--sf-text-secondary)] mb-1.5">
              待办 · {todos.filter((t) => !t.completed).length} 项
            </div>
            {todos.filter((t) => !t.completed).length === 0 ? (
              <div className="text-[12px] text-[var(--sf-text-secondary)] px-2 py-1">暂无进行中的待办</div>
            ) : (
              <div className="space-y-1">
                {todos
                  .filter((t) => !t.completed)
                  .slice(0, 5)
                  .map((t) => (
                    <div key={t.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--sf-hover)]">
                      <span className="text-[12px] text-[var(--sf-text-secondary)]">☐</span>
                      <span className="text-[12.5px] truncate">{t.title}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="shrink-0 px-4 py-2 border-t border-[var(--sf-border)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--sf-text-secondary)]">
              {badgeVisible ? `${unread} 条未读提醒` : "无未读提醒"}
            </span>
            <Button size="small" type="link" onClick={handleBallDoubleClick}>
              打开主窗口
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
