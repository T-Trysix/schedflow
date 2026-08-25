use std::collections::HashMap;

use rusqlite::{Connection, params};
use serde_json::Value;
use tauri::State;

use crate::DbState;

/// 默认设置。
pub fn default_settings() -> HashMap<String, Value> {
    let mut m = HashMap::new();
    for (k, v) in [
        ("autostart", Value::Bool(true)),
        ("closeToFloat", Value::Bool(true)),
        ("weekStart", Value::from(1)), // 1=周一
        ("timeFormat", Value::String("24".into())),
        ("weekendColor", Value::Bool(true)),
        ("scheduleModeWidth", Value::from(400)),
        ("defaultReminderOffset", Value::from(-10)),
        ("notifySound", Value::Bool(true)),
        ("dndEnabled", Value::Bool(false)),
        ("dndStart", Value::String("22:00".into())),
        ("dndEnd", Value::String("08:00".into())),
        ("theme", Value::String("system".into())),
        ("fontSize", Value::from(14)),
        ("floatEnabled", Value::Bool(true)),
        ("floatSize", Value::from(64)),
        ("floatOpacity", Value::from(1.0)),
        ("floatShowBadge", Value::Bool(true)),
        ("floatX", Value::Null),
        ("floatY", Value::Null),
        ("lastMode", Value::String("month".into())),
    ] {
        m.insert(k.to_string(), v);
    }
    m
}

/// 读取单个设置项（用于后端逻辑）。
pub fn get_setting_value(conn: &Connection, key: &str) -> Option<Value> {
    let s: String = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| {
            r.get(0)
        })
        .ok()?;
    serde_json::from_str(&s).ok()
}

/// 读取全部设置（默认值 + 已存储值合并）。
#[tauri::command]
pub fn get_settings(state: State<DbState>) -> Result<HashMap<String, Value>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut out = default_settings();
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        if let Ok(v) = serde_json::from_str::<Value>(&row.1) {
            out.insert(row.0, v);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn set_setting(state: State<DbState>, key: String, value: Value) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let v = value.to_string();
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, v],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_settings(state: State<DbState>, map: HashMap<String, Value>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .map_err(|e| e.to_string())?;
    for (k, v) in map {
        stmt.execute(params![k, v.to_string()])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
