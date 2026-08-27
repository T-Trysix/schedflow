//! 开机自启（Windows HKCU\Run 注册表实现）。
//!
//! 不用 tauri-plugin-autostart（auto-launch）的原因：插件写注册表时对 exe 路径
//! **不加引号**（含空格路径解析失败），且不区分 debug/release——debug 构建是控制台
//! 子系统，开机自启会弹出一个空白的黑色 cmd 窗口（K35 根因）。这里自定义实现：
//! 路径加引号 + debug 构建拒绝注册 + 启动时自愈校准。

use std::path::Path;

use rusqlite::params;
use tauri::{AppHandle, Manager};
use winreg::enums::{RegType, HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
use winreg::{RegKey, RegValue};

use crate::DbState;

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const STARTUP_APPROVED_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
/// 「任务管理器 → 启动」中标记为已启用的二进制值。
const STARTUP_ENABLED_BYTES: [u8; 12] = [
    0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

/// 组装开机自启命令行：exe 路径带引号（含空格安全），附带 `--minimized`。
fn run_command(exe: &Path) -> String {
    format!("\"{}\" --minimized", exe.display())
}

/// 当前二进制是否为 debug 构建。debug 版为控制台子系统（启动弹黑框），禁止注册自启。
fn is_debug_build() -> bool {
    cfg!(debug_assertions)
}

fn write_registry(name: &str, exe: &Path) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run = hkcu
        .open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE)
        .map_err(|e| format!("无法打开注册表 Run 键: {e}"))?;
    run.set_value(name, &run_command(exe))
        .map_err(|e| format!("写入开机自启注册表失败: {e}"))?;

    // StartupApproved：保持「任务管理器 → 启动」里该项显示为已启用
    if let Ok((approved, _)) = hkcu.create_subkey(STARTUP_APPROVED_KEY) {
        let _ = approved.set_raw_value(
            name,
            &RegValue {
                vtype: RegType::REG_BINARY,
                bytes: STARTUP_ENABLED_BYTES.to_vec(),
            },
        );
    }
    Ok(())
}

fn clear_registry(name: &str) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run) = hkcu.open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE) {
        match run.delete_value(name) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("删除开机自启注册表失败: {e}")),
        }
    }
    if let Ok(approved) = hkcu.open_subkey_with_flags(STARTUP_APPROVED_KEY, KEY_SET_VALUE) {
        let _ = approved.delete_value(name);
    }
    Ok(())
}

fn registry_value(name: &str) -> Result<Option<String>, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run = hkcu
        .open_subkey_with_flags(RUN_KEY, KEY_READ)
        .map_err(|e| format!("无法打开注册表 Run 键: {e}"))?;
    match run.get_value::<String, _>(name) {
        Ok(v) => Ok(Some(v)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("读取开机自启注册表失败: {e}")),
    }
}

/// 设置开机自启（同步本地设置项）。
#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let name = app.package_info().name.to_string();
    if enabled {
        if is_debug_build() {
            return Err(
                "当前为调试版本，不能设置开机自启（调试版启动会弹出黑色控制台窗口）。请使用 release 或安装版。"
                    .into(),
            );
        }
        let exe = std::env::current_exe().map_err(|e| format!("获取程序路径失败: {e}"))?;
        write_registry(&name, &exe)?;
    } else {
        clear_registry(&name)?;
    }

    // 同步写入本地设置
    let st = app.state::<DbState>();
    let conn = st.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('autostart', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![enabled.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(enabled)
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> Result<bool, String> {
    let name = app.package_info().name.to_string();
    Ok(registry_value(&name)?.is_some())
}

/// 启动时校准：让注册表状态与 DB 里的 `autostart` 设置保持一致，并顺带修复历史遗留的
/// 指向 debug 构建 / 旧路径 / 未加引号的注册表项。
pub fn sync_autostart(app: &AppHandle) -> Result<bool, String> {
    let st = app.state::<DbState>();
    let conn = st.0.lock().map_err(|e| e.to_string())?;
    // 首次运行（无 autostart 设置项）默认开启
    let want = super::settings::get_setting_value(&conn, "autostart")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    drop(conn);

    let name = app.package_info().name.to_string();
    if want && !is_debug_build() {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        // 已指向当前 exe 则不动注册表；否则重写（修复 debug/旧路径/引号问题）
        if registry_value(&name)? != Some(run_command(&exe)) {
            write_registry(&name, &exe)?;
        }
        Ok(true)
    } else {
        // 用户已关闭，或当前是调试构建 → 确保注册表无残留
        clear_registry(&name)?;
        Ok(false)
    }
}
