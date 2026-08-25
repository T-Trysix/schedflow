use std::collections::HashMap;

use chrono::NaiveDate;
use rusqlite::{Connection, Row, Transaction, params};
use tauri::{Emitter, State};

use crate::DbState;
use crate::models::{DayEvent, Event, EventInput};
use crate::recurrence::{self, parse_date};

const EVENT_COLS: &str = "id,title,notes,category_id,start_date,end_date,start_time,end_time,is_all_day,recurrence_rule,reminder_enabled,reminder_offset_minutes,priority,completed,excluded_dates,created_at,updated_at";

pub(crate) fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn row_to_event(row: &Row) -> rusqlite::Result<Event> {
    Ok(Event {
        id: row.get(0)?,
        title: row.get(1)?,
        notes: row.get(2)?,
        category_id: row.get(3)?,
        start_date: row.get(4)?,
        end_date: row.get(5)?,
        start_time: row.get(6)?,
        end_time: row.get(7)?,
        is_all_day: row.get::<_, i64>(8)? != 0,
        recurrence_rule: row.get(9)?,
        reminder_enabled: row.get::<_, i64>(10)? != 0,
        reminder_offset_minutes: row.get(11)?,
        priority: row.get(12)?,
        completed: row.get::<_, i64>(13)? != 0,
        excluded_dates: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
        tags: Vec::new(),
    })
}

/// 批量读取标签映射。
pub(crate) fn fetch_tags(
    conn: &Connection,
    table: &str,
    id_col: &str,
    ids: &[i64],
) -> HashMap<i64, Vec<i64>> {
    let mut map: HashMap<i64, Vec<i64>> = HashMap::new();
    if ids.is_empty() {
        return map;
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT {id_col}, tag_id FROM {table} WHERE {id_col} IN ({placeholders})"
    );
    if let Ok(mut stmt) = conn.prepare(&sql) {
        if let Ok(rows) = stmt.query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
        }) {
            for row in rows.flatten() {
                map.entry(row.0).or_default().push(row.1);
            }
        }
    }
    map
}

pub(crate) fn category_map(conn: &Connection) -> HashMap<i64, (String, String)> {
    let mut map = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, name, color FROM categories") {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                (r.get::<_, String>(1)?, r.get::<_, String>(2)?),
            ))
        }) {
            for row in rows.flatten() {
                map.insert(row.0, row.1);
            }
        }
    }
    map
}

/// 在日期列表上展开单个日程（含重复），返回 DayEvent。
fn expand_event(
    e: &Event,
    tags: &HashMap<i64, Vec<i64>>,
    cats: &HashMap<i64, (String, String)>,
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> Vec<DayEvent> {
    let Some(st) = parse_date(&e.start_date) else {
        return Vec::new();
    };
    let en = parse_date(&e.end_date).unwrap_or(st);
    let excluded = recurrence::parse_excluded(&e.excluded_dates);
    let rule = recurrence::parse_rule(&e.recurrence_rule);

    let occs: Vec<NaiveDate> = if let Some(r) = &rule {
        recurrence::occurrences(r, st, &excluded, range_start, range_end)
    } else {
        let mut v = Vec::new();
        let mut d = st;
        while d <= en {
            if d >= range_start && d <= range_end && !excluded.contains(&d) {
                v.push(d);
            }
            d += chrono::Duration::days(1);
            if v.len() > 400 {
                break;
            }
        }
        v
    };

    let etags = tags.get(&e.id).cloned().unwrap_or_default();
    let (ccolor, cname) = match e.category_id {
        Some(cid) => cats
            .get(&cid)
            .map(|(n, c)| (Some(c.clone()), Some(n.clone())))
            .unwrap_or((None, None)),
        None => (None, None),
    };

    occs.into_iter()
        .map(|d| DayEvent {
            id: e.id,
            title: e.title.clone(),
            notes: e.notes.clone(),
            category_id: e.category_id,
            occurrence_date: d.format("%Y-%m-%d").to_string(),
            start_time: e.start_time.clone(),
            end_time: e.end_time.clone(),
            is_all_day: e.is_all_day,
            recurrence_rule: e.recurrence_rule.clone(),
            is_recurring: e.recurrence_rule.is_some(),
            reminder_enabled: e.reminder_enabled,
            reminder_offset_minutes: e.reminder_offset_minutes,
            priority: e.priority,
            completed: e.completed,
            tags: etags.clone(),
            category_color: ccolor.clone(),
            category_name: cname.clone(),
        })
        .collect()
}

#[tauri::command]
pub fn list_events_by_range(
    state: State<DbState>,
    start: String,
    end: String,
) -> Result<Vec<DayEvent>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let range_start = parse_date(&start).ok_or("无效开始日期")?;
    let range_end = parse_date(&end).ok_or("无效结束日期")?;

    let sql = format!("SELECT {EVENT_COLS} FROM events WHERE deleted=0 AND start_date <= ?1");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![end], row_to_event)
        .map_err(|e| e.to_string())?;
    let events: Vec<Event> = rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?;

    let ids: Vec<i64> = events.iter().map(|e| e.id).collect();
    let tags = fetch_tags(&conn, "event_tags", "event_id", &ids);
    let cats = category_map(&conn);

    let mut out = Vec::new();
    for e in &events {
        out.extend(expand_event(e, &tags, &cats, range_start, range_end));
    }
    out.sort_by(|a, b| {
        a.occurrence_date
            .cmp(&b.occurrence_date)
            .then_with(|| match (a.is_all_day, b.is_all_day) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.start_time.cmp(&b.start_time),
            })
    });
    Ok(out)
}

#[tauri::command]
pub fn get_event(state: State<DbState>, id: i64) -> Result<Event, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {EVENT_COLS} FROM events WHERE id = ?1");
    let mut ev: Event = conn
        .query_row(&sql, params![id], row_to_event)
        .map_err(|e| e.to_string())?;
    ev.tags = fetch_tags(&conn, "event_tags", "event_id", &[id])
        .remove(&id)
        .unwrap_or_default();
    Ok(ev)
}

/// 生成最终入库参数。
#[allow(clippy::too_many_arguments)]
fn insert_event(
    conn: &Connection,
    title: &str,
    notes: &str,
    category_id: Option<i64>,
    start_date: &str,
    end_date: &str,
    start_time: Option<&str>,
    end_time: Option<&str>,
    is_all_day: bool,
    recurrence_rule: Option<&str>,
    reminder_enabled: bool,
    reminder_offset: i64,
    priority: i64,
    completed: bool,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO events (title,notes,category_id,start_date,end_date,start_time,end_time,is_all_day,recurrence_rule,reminder_enabled,reminder_offset_minutes,priority,completed,excluded_dates)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,NULL)",
        params![
            title,
            notes,
            category_id,
            start_date,
            end_date,
            start_time,
            end_time,
            is_all_day as i64,
            recurrence_rule,
            reminder_enabled as i64,
            reminder_offset,
            priority,
            completed as i64
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn replace_tags(conn: &Connection, entity: &str, id: i64, ids: &[i64]) -> Result<(), String> {
    let (table, col) = if entity == "event" {
        ("event_tags", "event_id")
    } else {
        ("todo_tags", "todo_id")
    };
    let del = format!("DELETE FROM {table} WHERE {col} = ?1");
    conn.execute(&del, params![id]).map_err(|e| e.to_string())?;
    let ins = format!("INSERT OR IGNORE INTO {table} ({col}, tag_id) VALUES (?1, ?2)");
    for t in ids {
        conn.execute(&ins, params![id, t]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn create_event(app: tauri::AppHandle, state: State<DbState>, input: EventInput) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let end_date = input.end_date.clone().unwrap_or_else(|| input.start_date.clone());
    let id = insert_event(
        &conn,
        &input.title,
        input.notes.as_deref().unwrap_or(""),
        input.category_id,
        &input.start_date,
        &end_date,
        input.start_time.as_deref(),
        input.end_time.as_deref(),
        input.is_all_day.unwrap_or(false),
        input.recurrence_rule.as_deref(),
        input.reminder_enabled.unwrap_or(false),
        input.reminder_offset_minutes.unwrap_or(0),
        input.priority.unwrap_or(0),
        input.completed.unwrap_or(false),
    )?;
    if let Some(ids) = &input.tag_ids {
        replace_tags(&conn, "event", id, ids)?;
    }
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(id)
}

/// 给事件增加一个排除日期。
fn add_exclusion(conn: &Connection, id: i64, date: &str) -> Result<(), String> {
    let cur: Option<String> = conn
        .query_row("SELECT excluded_dates FROM events WHERE id = ?1", params![id], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    let mut v: Vec<String> = cur
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    if !v.iter().any(|d| d == date) {
        v.push(date.to_string());
    }
    let json = serde_json::to_string(&v).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE events SET excluded_dates = ?1, updated_at = ?2 WHERE id = ?3",
        params![json, now_str(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 拷贝原事件为独立日程（用于“仅本次”编辑/移动/删除）。
fn copy_occurrence(
    tx: &Transaction,
    base: &Event,
    date: &str,
    tags: &[i64],
) -> Result<i64, String> {
    let id = insert_event(
        tx,
        &base.title,
        &base.notes,
        base.category_id,
        date,
        date,
        base.start_time.as_deref(),
        base.end_time.as_deref(),
        base.is_all_day,
        None,
        base.reminder_enabled,
        base.reminder_offset_minutes,
        base.priority,
        base.completed,
    )?;
    for t in tags {
        tx.execute(
            "INSERT OR IGNORE INTO event_tags (event_id, tag_id) VALUES (?1, ?2)",
            params![id, t],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(id)
}

#[tauri::command]
pub fn update_event(
    app: tauri::AppHandle,
    state: State<DbState>,
    id: i64,
    input: EventInput,
    mode: Option<String>,
    occurrence_date: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let is_occurrence = mode.as_deref() == Some("occurrence");
    if is_occurrence {
        let occ = occurrence_date.ok_or("缺少发生日期")?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let sql = format!("SELECT {EVENT_COLS} FROM events WHERE id = ?1");
        let base: Event = tx
            .query_row(&sql, params![id], row_to_event)
            .map_err(|e| e.to_string())?;
        let base_tags = fetch_tags(&tx, "event_tags", "event_id", &[id])
            .remove(&id)
            .unwrap_or_default();
        // 创建独立日程，再套用本次修改
        let new_id = copy_occurrence(&tx, &base, &occ, &base_tags)?;
        let end_date = input
            .end_date
            .clone()
            .unwrap_or_else(|| occ.clone());
        tx.execute(
            "UPDATE events SET title=?1,notes=?2,category_id=?3,start_date=?4,end_date=?5,start_time=?6,end_time=?7,is_all_day=?8,reminder_enabled=?9,reminder_offset_minutes=?10,priority=?11,completed=?12,updated_at=?13 WHERE id=?14",
            params![
                input.title,
                input.notes.as_deref().unwrap_or(&base.notes),
                input.category_id.or(base.category_id),
                occ,
                end_date,
                input.start_time.as_deref(),
                input.end_time.as_deref(),
                input.is_all_day.unwrap_or(base.is_all_day) as i64,
                input.reminder_enabled.unwrap_or(base.reminder_enabled) as i64,
                input.reminder_offset_minutes.unwrap_or(base.reminder_offset_minutes),
                input.priority.unwrap_or(base.priority),
                input.completed.unwrap_or(base.completed) as i64,
                now_str(),
                new_id
            ],
        )
        .map_err(|e| e.to_string())?;
        if let Some(ids) = &input.tag_ids {
            replace_tags(&tx, "event", new_id, ids)?;
        }
        add_exclusion(&tx, id, &occ)?;
        tx.commit().map_err(|e| e.to_string())?;
    } else {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let sql = format!("SELECT {EVENT_COLS} FROM events WHERE id = ?1");
        let base: Event = tx
            .query_row(&sql, params![id], row_to_event)
            .map_err(|e| e.to_string())?;
        let end_date = input.end_date.clone().unwrap_or_else(|| base.end_date.clone());
        tx.execute(
            "UPDATE events SET title=?1,notes=?2,category_id=?3,start_date=?4,end_date=?5,start_time=?6,end_time=?7,is_all_day=?8,recurrence_rule=?9,reminder_enabled=?10,reminder_offset_minutes=?11,priority=?12,completed=?13,updated_at=?14 WHERE id=?15",
            params![
                input.title,
                input.notes.as_deref().unwrap_or(&base.notes),
                input.category_id.or(base.category_id),
                input.start_date,
                end_date,
                input.start_time.as_deref(),
                input.end_time.as_deref(),
                input.is_all_day.unwrap_or(base.is_all_day) as i64,
                input.recurrence_rule.as_deref(),
                input.reminder_enabled.unwrap_or(base.reminder_enabled) as i64,
                input.reminder_offset_minutes.unwrap_or(base.reminder_offset_minutes),
                input.priority.unwrap_or(base.priority),
                input.completed.unwrap_or(base.completed) as i64,
                now_str(),
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        if let Some(ids) = &input.tag_ids {
            replace_tags(&tx, "event", id, ids)?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}

#[tauri::command]
pub fn delete_event(
    app: tauri::AppHandle,
    state: State<DbState>,
    id: i64,
    mode: Option<String>,
    occurrence_date: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if mode.as_deref() == Some("occurrence") {
        let occ = occurrence_date.ok_or("缺少发生日期")?;
        add_exclusion(&conn, id, &occ)?;
    } else {
        conn.execute(
            "UPDATE events SET deleted=1, updated_at=?1 WHERE id=?2",
            params![now_str(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}

#[tauri::command]
pub fn set_event_completed(app: tauri::AppHandle, state: State<DbState>, id: i64, completed: bool) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE events SET completed=?1, updated_at=?2 WHERE id=?3",
        params![completed as i64, now_str(), id],
    )
    .map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}

/// 移动日程到新日期。重复日程的某一次 → 排除旧日期并新建独立日程。
#[tauri::command]
pub fn move_event(
    app: tauri::AppHandle,
    state: State<DbState>,
    id: i64,
    new_date: String,
    occurrence_date: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {EVENT_COLS} FROM events WHERE id = ?1");
    let base: Event = tx
        .query_row(&sql, params![id], row_to_event)
        .map_err(|e| e.to_string())?;
    let is_recurring = base.recurrence_rule.is_some();
    if is_recurring && occurrence_date.is_some() {
        let occ = occurrence_date.unwrap();
        let tags = fetch_tags(&tx, "event_tags", "event_id", &[id])
            .remove(&id)
            .unwrap_or_default();
        add_exclusion(&tx, id, &occ)?;
        copy_occurrence(&tx, &base, &new_date, &tags)?;
    } else {
        tx.execute(
            "UPDATE events SET start_date=?1, end_date=?1, updated_at=?2 WHERE id=?3",
            params![new_date, now_str(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}

/// 日程 → 待办（移除日期）。
#[tauri::command]
pub fn event_to_todo(
    app: tauri::AppHandle,
    state: State<DbState>,
    id: i64,
    occurrence_date: Option<String>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {EVENT_COLS} FROM events WHERE id = ?1");
    let base: Event = tx
        .query_row(&sql, params![id], row_to_event)
        .map_err(|e| e.to_string())?;
    let is_recurring = base.recurrence_rule.is_some();
    if is_recurring {
        if let Some(occ) = &occurrence_date {
            add_exclusion(&tx, id, occ)?;
        } else {
            tx.execute(
                "UPDATE events SET deleted=1, updated_at=?1 WHERE id=?2",
                params![now_str(), id],
            )
            .map_err(|e| e.to_string())?;
        }
    } else {
        tx.execute(
            "UPDATE events SET deleted=1, updated_at=?1 WHERE id=?2",
            params![now_str(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    // 计算一次性提醒时间：若有提醒且非全天 → 开始时刻 + 偏移
    let reminder_at: Option<String> = if base.reminder_enabled {
        match (&base.start_time, base.is_all_day) {
            (Some(t), false) => {
                let dt = format!("{} {}", base.start_date, t);
                chrono::NaiveDateTime::parse_from_str(&dt, "%Y-%m-%d %H:%M")
                    .ok()
                    .map(|d| {
                        (d + chrono::Duration::minutes(base.reminder_offset_minutes))
                            .format("%Y-%m-%d %H:%M")
                            .to_string()
                    })
            }
            _ => None,
        }
    } else {
        None
    };
    let max_sort: i64 = tx
        .query_row("SELECT COALESCE(MAX(sort_order),0) FROM todos", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    tx.execute(
        "INSERT INTO todos (title,notes,category_id,priority,reminder_at,completed,sort_order)
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![
            base.title,
            base.notes,
            base.category_id,
            base.priority,
            reminder_at,
            base.completed as i64,
            max_sort + 1
        ],
    )
    .map_err(|e| e.to_string())?;
    let tid = tx.last_insert_rowid();
    let base_tags = fetch_tags(&tx, "event_tags", "event_id", &[id])
        .remove(&id)
        .unwrap_or_default();
    for t in base_tags {
        tx.execute(
            "INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?1, ?2)",
            params![tid, t],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(tid)
}

#[tauri::command]
pub fn search_events(state: State<DbState>, q: String) -> Result<Vec<Event>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let like = format!("%{}%", q.trim());
    let sql = format!(
        "SELECT {EVENT_COLS} FROM events WHERE deleted=0 AND (title LIKE ?1 OR notes LIKE ?1 OR id IN (SELECT event_id FROM event_tags WHERE tag_id IN (SELECT id FROM tags WHERE name LIKE ?1))) ORDER BY start_date DESC LIMIT 100"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![like], row_to_event)
        .map_err(|e| e.to_string())?;
    let events: Vec<Event> = rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?;
    let ids: Vec<i64> = events.iter().map(|e| e.id).collect();
    let tags = fetch_tags(&conn, "event_tags", "event_id", &ids);
    let mut out = Vec::new();
    for mut e in events {
        e.tags = tags.get(&e.id).cloned().unwrap_or_default();
        out.push(e);
    }
    Ok(out)
}
