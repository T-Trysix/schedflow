mod commands;
mod db;
mod error;
mod models;
mod recurrence;
mod reminders;

use std::sync::{Arc, Mutex};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

/// 全局共享的数据库连接。
pub struct DbState(pub Arc<Mutex<rusqlite::Connection>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 第二个实例启动：唤起主窗口
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            } else if let Some(w) = app.get_webview_window("float") {
                let _ = w.show();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let s = shortcut.to_string();
                        let action = match s.as_str() {
                            "control+shift+a" | "ctrl+shift+a" => "add_todo",
                            "control+shift+d" | "ctrl+shift+d" => "add_event",
                            "control+shift+x" | "ctrl+shift+x" => "toggle_main",
                            _ => "",
                        };
                        if !action.is_empty() {
                            let _ = app.emit("global-shortcut", action);
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            // ---- 初始化数据库 ----
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("获取数据目录失败: {e}"))?;
            let db_path = dir.join("schedflow.db");
            let conn = db::init_db(&db_path)?;
            let shared = Arc::new(Mutex::new(conn));
            app.manage(DbState(shared.clone()));

            // ---- 通知权限 ----
            let _ = app.notification().request_permission();

            // ---- 首次运行默认开启开机自启 ----
            {
                let st = app.state::<DbState>();
                let guard = st.0.lock().map_err(|e| e.to_string())?;
                let has = guard
                    .query_row(
                        "SELECT COUNT(*) FROM settings WHERE key='autostart'",
                        [],
                        |r| r.get::<_, i64>(0),
                    )
                    .unwrap_or(0)
                    > 0;
                drop(guard);
                if !has {
                    let _ = app.autolaunch().enable();
                }
            }

            // ---- 主窗口关闭 → 缩小为悬浮球 ----
            let handle = app.handle().clone();
            let close_to_float_checked = Arc::new(std::sync::atomic::AtomicBool::new(false));
            if let Some(main) = app.get_webview_window("main") {
                let h = handle.clone();
                let checked = close_to_float_checked.clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let st = h.state::<DbState>();
                        let close_to_float = match st.0.lock() {
                            Ok(guard) => {
                                commands::settings::get_setting_value(&guard, "closeToFloat")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(true)
                            }
                            Err(_) => true,
                        };
                        checked.store(true, std::sync::atomic::Ordering::SeqCst);
                        if close_to_float {
                            api.prevent_close();
                            let _ = h.get_webview_window("main").map(|w| w.hide());
                            commands::app::ensure_float_visible(&h);
                        } else {
                            h.exit(0);
                        }
                    }
                });
            }

            // ---- 开机自启（--minimized）→ 只显示悬浮球 ----
            let minimized = std::env::args().any(|a| a == "--minimized");
            if minimized {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
                if let Some(f) = app.get_webview_window("float") {
                    let _ = f.show();
                }
            }

            // ---- 悬浮球窗口不随主窗口关闭而退出，且支持全局快捷键 ----
            // 注册全局快捷键
            for key in ["ctrl+shift+a", "ctrl+shift+d", "ctrl+shift+x"] {
                let _ = app.global_shortcut().register(key);
            }

            // ---- 亚克力毛玻璃（失败不致命） ----
            #[cfg(target_os = "windows")]
            {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = window_vibrancy::apply_acrylic(&w, Some((18, 18, 18, 120)));
                }
            }

            // ---- 系统托盘（右下角任务栏）：打开主窗 / 设置 / 退出 ----
            {
                let show_i = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
                let settings_i = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
                let tray_menu = Menu::with_items(app, &[&show_i, &settings_i, &quit_i])?;
                let _tray = TrayIconBuilder::with_id("main-tray")
                    .icon(app.default_window_icon().cloned().ok_or("缺少应用图标")?)
                    .tooltip("日程通")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            let _ = commands::app::show_main(app.clone());
                        }
                        "settings" => {
                            let _ = commands::app::show_main(app.clone());
                            let _ = app.emit_to("main", "open-settings", ());
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        // 左键单击 → 打开主窗口
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let _ = commands::app::show_main(tray.app_handle().clone());
                        }
                    })
                    .build(app)?;
            }

            // ---- 启动提醒线程 ----
            reminders::start(app.handle().clone(), shared.clone());

            let _ = (db_path, close_to_float_checked);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 窗口/应用
            commands::app::show_main,
            commands::app::hide_main,
            commands::app::toggle_main,
            commands::app::show_float,
            commands::app::hide_float,
            commands::app::exit_app,
            commands::app::set_autostart,
            commands::app::get_autostart,
            commands::app::is_float_visible,
            // 日程
            commands::events::list_events_by_range,
            commands::events::get_event,
            commands::events::create_event,
            commands::events::update_event,
            commands::events::delete_event,
            commands::events::set_event_completed,
            commands::events::move_event,
            commands::events::event_to_todo,
            commands::events::search_events,
            // 待办
            commands::todos::list_todos,
            commands::todos::get_todo,
            commands::todos::create_todo,
            commands::todos::update_todo,
            commands::todos::delete_todo,
            commands::todos::set_todo_completed,
            commands::todos::reorder_todos,
            commands::todos::todo_to_event,
            commands::todos::search_todos,
            // 分类/标签
            commands::categories::list_categories,
            commands::categories::create_category,
            commands::categories::update_category,
            commands::categories::delete_category,
            commands::tags::list_tags,
            commands::tags::create_tag,
            commands::tags::delete_tag,
            // 设置
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::settings::set_settings,
            // 数据
            commands::backup::backup_db,
            commands::backup::restore_db,
            commands::backup::export_json,
            commands::backup::export_csv,
            commands::backup::import_json,
            commands::backup::clear_all_data,
            // 提醒
            reminders::unread_reminder_count,
            reminders::list_unread_reminders,
            reminders::mark_reminders_read,
            reminders::mark_all_reminders_read,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 供 frontend 判断当前运行窗口。未使用，保留以保持 trait 引用。
#[allow(dead_code)]
fn _app_handle_guard(_: AppHandle) {}
