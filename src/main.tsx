import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import FloatApp from "./float/FloatApp";
import { useSettingsStore } from "./stores/settingsStore";
import "./styles/global.css";

// 错误边界：渲染出错时展示错误信息而非整屏白屏
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("界面渲染出错", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "Segoe UI, system-ui, sans-serif", height: "100vh", overflow: "auto", background: "#f5f6fa" }}>
          <h3 style={{ margin: 0, color: "#d4380d" }}>界面出错了，请截图并反馈</h3>
          <pre style={{ whiteSpace: "pre-wrap", color: "#1f2329", fontSize: 12, marginTop: 12 }}>
            {this.state.error.stack || String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// 按窗口 label 路由：float 窗口渲染悬浮球，其余渲染主界面
async function bootstrap() {
  try {
    await useSettingsStore.getState().load();
  } catch {
    /* 设置加载失败不影响启动 */
  }
  const isFloat = getCurrentWindow().label === "float";
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>{isFloat ? <FloatApp /> : <App />}</ErrorBoundary>
    </React.StrictMode>,
  );
}

bootstrap();
