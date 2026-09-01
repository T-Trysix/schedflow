use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::{Local, NaiveDate, NaiveDateTime, NaiveTime};
use rusqlite::{Connection, params};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

use crate::DbState;
use crate::models::ReminderInfo;
use crate::recurrence;

fn fmt_dt(dt: NaiveDateTime) -> String {
    dt.format("%Y-%m-%d %H:%M").to_string()
}

/// 免打扰是否生效。
fn dnd_active(conn: &Connection) -> bool {
    let enabled = super::commands::settings::get_setting_value(conn, "dndEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        return false;
    }
    let start = super::commands::settings::get_setting_value(conn, "dndStart")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "22:00".to_string());
    let end = super::commands::settings::get_setting_value(conn, "dndEnd")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "08:00".to_string());
    let now = Local::now().format("%H:%M").to_string();
    if start < end {
        now >= start && now < end
    } else {
        now >= start || now < end
    }
}

fn fire_notification(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

/// 启动提醒线程：每 15 秒扫描一次到期提醒。
pub fn start(app: AppHandle, db: Arc<Mutex<Connection>>) {
    std::thread::spawn(move || loop {
        run_once(&app, &db);
        std::thread::sleep(Duration::from_secs(15));
    });
}

fn run_once(app: &AppHandle, db: &Arc<Mutex<Connection>>) {
    let conn = db.lock().map(|g| g).map_err(|e| e.to_string());
    let conn = match conn {
        Ok(g) => g,
        Err(_) => return,
    };
    if dnd_active(&conn) {
        return;
    }
    let now = Local::now().naive_local();
    let window_start = now - chrono::Duration::hours(24); // 含补发错过的提醒
    let window_end = now + chrono::Duration::seconds(20);

    let mut due: Vec<(String, i64, String, String, String)> = Vec::new();

    // ---- 日程提醒 ----
    {
        let mut stmt = match conn.prepare(
            "SELECT id,title,notes,start_date,end_date,start_time,is_all_day,recurrence_rule,excluded_dates,reminder_offset_minutes
             FROM events WHERE deleted=0 AND reminder_enabled=1",
        ) {
            Ok(s) => s,
            Err(_) => return,
        };
        let rows: Vec<(i64, String, String, String, String, Option<String>, bool, Option<String>, Option<String>, i64)> =
            match stmt.query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, i64>(6)? != 0,
                    r.get::<_, Option<String>>(7)?,
                    r.get::<_, Option<String>>(8)?,
                    r.get::<_, i64>(9)?,
                ))
            }) {
                Ok(rs) => rs.flatten().collect(),
                Err(_) => return,
            };
        drop(stmt);
        let range_start = (now - chrono::Duration::days(1)).date();
        let range_end = (now + chrono::Duration::days(1)).date();
        for row in rows {
                let (id, title, notes, sd, ed, st, all_day, rule_json, excl, offset) = row;
                let Some(st_date) = NaiveDate::parse_from_str(&sd, "%Y-%m-%d").ok() else {
                    continue;
                };
                let rule = recurrence::parse_rule(&rule_json);
                let excluded = recurrence::parse_excluded(&excl);
                let occs = if let Some(r) = &rule {
                    recurrence::occurrences(r, st_date, &excluded, range_start, range_end)
                } else {
                    let mut v = vec![st_date];
                    if let Ok(en) = NaiveDate::parse_from_str(&ed, "%Y-%m-%d") {
                        let Some(mut d) = st_date.succ_opt() else {
                            continue;
                        };
                        while d <= en && v.len() < 32 {
                            v.push(d);
                            match d.succ_opt() {
                                Some(n) => d = n,
                                None => break,
                            }
                        }
                    }
                    v
                };
                for d in occs {
                    let occ_dt = if all_day {
                        d.and_time(NaiveTime::from_hms_opt(9, 0, 0).unwrap())
                    } else {
                        let t = st
                            .as_deref()
                            .and_then(|s| NaiveTime::parse_from_str(s, "%H:%M").ok())
                            .unwrap_or(NaiveTime::from_hms_opt(9, 0, 0).unwrap());
                        d.and_time(t)
                    };
                    let remind = occ_dt + chrono::Duration::minutes(offset);
                    if remind >= window_start && remind <= window_end {
                        due.push((
                            "event".to_string(),
                            id,
                            fmt_dt(remind),
                            title.clone(),
                            notes.clone(),
                        ));
                    }
                }
            }
    }

    // ---- 待办一次性提醒 ----
    {
        let mut stmt = match conn.prepare(
            "SELECT id,title,notes,reminder_at FROM todos WHERE deleted=0 AND reminder_at IS NOT NULL",
        ) {
            Ok(s) => s,
            Err(_) => return,
        };
        let rows: Vec<(i64, String, String, String)> = match stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        }) {
            Ok(rs) => rs.flatten().collect(),
            Err(_) => return,
        };
        drop(stmt);
        for row in rows {
            let (id, title, notes, ra) = row;
            if let Ok(ra_dt) = NaiveDateTime::parse_from_str(&ra, "%Y-%m-%d %H:%M") {
                if ra_dt >= window_start && ra_dt <= window_end {
                    due.push(("todo".to_string(), id, ra, title, notes));
                }
            }
        }
    }

    let fired = Local::now().naive_local();
    let fired_str = fired.format("%Y-%m-%d %H:%M:%S").to_string();
    for (ety, eid, occ, title, notes) in due {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notifications WHERE entity_type=?1 AND entity_id=?2 AND occurrence_at=?3",
                params![ety, eid, occ],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists > 0 {
            continue;
        }
        let inserted = conn
            .execute(
                "INSERT OR IGNORE INTO notifications (entity_type,entity_id,occurrence_at,title,notes,read,fired_at) VALUES (?1,?2,?3,?4,?5,0,?6)",
                params![ety, eid, occ, title, notes, fired_str],
            )
            .map(|n| n > 0)
            .unwrap_or(false);
        if inserted {
            let body = if notes.trim().is_empty() {
                format!("{} 到提醒时间了", occ)
            } else {
                format!("{}  {}", occ, notes)
            };
            fire_notification(app, &title, &body);
            let payload = serde_json::json!({
                "entityType": ety,
                "entityId": eid,
                "occurrenceAt": occ,
                "title": title,
                "notes": notes,
            });
            let _ = app.emit("reminder-fired", payload);
        }
    }
}

#[tauri::command]
pub fn unread_reminder_count(state: tauri::State<DbState>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row("SELECT COUNT(*) FROM notifications WHERE read=0", [], |r| {
        r.get(0)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_unread_reminders(state: tauri::State<DbState>) -> Result<Vec<ReminderInfo>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id,entity_type,entity_id,occurrence_at,title,notes FROM notifications WHERE read=0 ORDER BY occurrence_at DESC LIMIT 50")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ReminderInfo {
                id: r.get(0)?,
                entity_type: r.get(1)?,
                entity_id: r.get(2)?,
                occurrence_at: r.get(3)?,
                title: r.get(4)?,
                notes: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_reminders_read(
    app: tauri::AppHandle,
    state: tauri::State<DbState>,
    ids: Vec<i64>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if ids.is_empty() {
        return Ok(());
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("UPDATE notifications SET read=1 WHERE id IN ({placeholders})");
    conn.execute(&sql, rusqlite::params_from_iter(ids.iter()))
        .map_err(|e| e.to_string())?;
    drop(conn);
    // 标记已读会改变"未读角标/未读列表"，广播数据变更让主窗与悬浮球同步刷新
    let _ = app.emit("data-changed", ());
    Ok(())
}

#[tauri::command]
pub fn mark_all_reminders_read(
    app: tauri::AppHandle,
    state: tauri::State<DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE notifications SET read=1 WHERE read=0", [])
        .map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}
