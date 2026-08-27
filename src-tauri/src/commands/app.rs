use tauri::{AppHandle, Manager};

use crate::DbState;

/// 判断悬浮球模式是否启用。
pub fn float_enabled(app: &AppHandle) -> bool {
    let st = app.state::<DbState>();
    let conn = st.0.lock().unwrap();
    super::settings::get_setting_value(&conn, "floatEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// 若启用悬浮球，则显示悬浮球窗口。
pub fn ensure_float_visible(app: &AppHandle) {
    if float_enabled(app) {
        if let Some(f) = app.get_webview_window("float") {
            let _ = f.show();
        }
    }
}

#[tauri::command]
pub fn show_main(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.show().map_err(crate::error::to_err)?;
        w.unminimize().ok();
        w.set_focus().map_err(crate::error::to_err)?;
    }
    if let Some(w) = app.get_webview_window("float") {
        let _ = w.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn hide_main(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.hide().map_err(crate::error::to_err)?;
    }
    ensure_float_visible(&app);
    Ok(())
}

#[tauri::command]
pub fn toggle_main(app: AppHandle) -> Result<(), String> {
    let Some(w) = app.get_webview_window("main") else {
        return Ok(());
    };
    if w.is_visible().map_err(crate::error::to_err)? {
        hide_main(app)
    } else {
        show_main(app)
    }
}

#[tauri::command]
pub fn show_float(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("float") {
        w.show().map_err(crate::error::to_err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_float(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("float") {
        w.hide().map_err(crate::error::to_err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn is_float_visible(app: AppHandle) -> Result<bool, String> {
    let Some(w) = app.get_webview_window("float") else {
        return Ok(false);
    };
    w.is_visible().map_err(crate::error::to_err)
}
