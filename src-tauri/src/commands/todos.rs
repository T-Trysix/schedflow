use rusqlite::{Connection, Row, params};
use tauri::{Emitter, State};

use crate::DbState;
use crate::models::{Todo, TodoInput};
use super::events::{category_map, fetch_tags, now_str};

const TODO_COLS: &str = "id,title,notes,category_id,priority,reminder_at,completed,sort_order,created_at,updated_at";

fn row_to_todo(row: &Row) -> rusqlite::Result<Todo> {
    Ok(Todo {
        id: row.get(0)?,
        title: row.get(1)?,
        notes: row.get(2)?,
        category_id: row.get(3)?,
        priority: row.get(4)?,
        reminder_at: row.get(5)?,
        completed: row.get::<_, i64>(6)? != 0,
        sort_order: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        tags: Vec::new(),
        category_color: None,
        category_name: None,
    })
}

fn decorate(conn: &Connection, todos: Vec<Todo>) -> Result<Vec<Todo>, String> {
    let ids: Vec<i64> = todos.iter().map(|t| t.id).collect();
    let tags = fetch_tags(conn, "todo_tags", "todo_id", &ids);
    let cats = category_map(conn);
    let mut out = Vec::new();
    for mut t in todos {
        t.tags = tags.get(&t.id).cloned().unwrap_or_default();
        if let Some(cid) = t.category_id {
            if let Some((name, color)) = cats.get(&cid) {
                t.category_name = Some(name.clone());
                t.category_color = Some(color.clone());
            }
        }
        out.push(t);
    }
    Ok(out)
}

#[tauri::command]
pub fn list_todos(state: State<DbState>) -> Result<Vec<Todo>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {TODO_COLS} FROM todos WHERE deleted=0 ORDER BY completed ASC, sort_order ASC, created_at DESC");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_todo)
        .map_err(|e| e.to_string())?;
    let todos: Vec<Todo> = rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?;
    decorate(&conn, todos)
}

#[tauri::command]
pub fn get_todo(state: State<DbState>, id: i64) -> Result<Todo, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {TODO_COLS} FROM todos WHERE id = ?1");
    let t: Todo = conn
        .query_row(&sql, params![id], row_to_todo)
        .map_err(|e| e.to_string())?;
    Ok(decorate(&conn, vec![t])?.remove(0))
}

#[tauri::command]
pub fn create_todo(app: tauri::AppHandle, state: State<DbState>, input: TodoInput) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let max_sort: i64 = conn
        .query_row("SELECT COALESCE(MAX(sort_order),0) FROM todos", [], |r| r.get(0))
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO todos (title,notes,category_id,priority,reminder_at,completed,sort_order)
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![
            input.title,
            input.notes.unwrap_or_default(),
            input.category_id,
            input.priority.unwrap_or(0),
            input.reminder_at,
            input.completed.unwrap_or(false) as i64,
            max_sort + 1
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    if let Some(ids) = &input.tag_ids {
        for t in ids {
            conn.execute(
                "INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?1, ?2)",
                params![id, t],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(id)
}

#[tauri::command]
pub fn update_todo(app: tauri::AppHandle, state: State<DbState>, id: i64, input: TodoInput) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let cur: (String, Option<i64>, i64, Option<String>, i64) = tx
        .query_row(
            "SELECT notes, category_id, priority, reminder_at, completed FROM todos WHERE id=?1",
            params![id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<i64>>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, i64>(4)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE todos SET title=?1, notes=?2, category_id=?3, priority=?4, reminder_at=?5, completed=?6, updated_at=?7 WHERE id=?8",
        params![
            input.title,
            input.notes.as_deref().unwrap_or(&cur.0),
            input.category_id.or(cur.1),
            input.priority.unwrap_or(cur.2),
            input.reminder_at.as_deref().or(cur.3.as_deref()),
            input.completed.unwrap_or(cur.4 != 0) as i64,
            now_str(),
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    if let Some(ids) = &input.tag_ids {
        tx.execute("DELETE FROM todo_tags WHERE todo_id=?1", params![id])
            .map_err(|e| e.to_string())?;
        for t in ids {
            tx.execute(
                "INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?1, ?2)",
                params![id, t],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}

#[tauri::command]
pub fn delete_todo(app: tauri::AppHandle, state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE todos SET deleted=1, updated_at=?1 WHERE id=?2",
        params![now_str(), id],
    )
    .map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}

#[tauri::command]
pub fn set_todo_completed(app: tauri::AppHandle, state: State<DbState>, id: i64, completed: bool) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE todos SET completed=?1, updated_at=?2 WHERE id=?3",
        params![completed as i64, now_str(), id],
    )
    .map_err(|e| e.to_string())?;
    // 完成待办后，把该待办未读的提醒一并标记已读：事项已完成，提醒不应再计"未读"
    if completed {
        conn.execute(
            "UPDATE notifications SET read=1 WHERE entity_type='todo' AND entity_id=?1 AND read=0",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    }
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}

#[tauri::command]
pub fn reorder_todos(app: tauri::AppHandle, state: State<DbState>, ids: Vec<i64>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE todos SET sort_order=?1, updated_at=?2 WHERE id=?3",
            params![i as i64, now_str(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}

/// 待办 → 日程（拖拽/手动安排到日期）。
#[tauri::command]
pub fn todo_to_event(
    app: tauri::AppHandle,
    state: State<DbState>,
    id: i64,
    date: String,
    start_time: Option<String>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let cur: (String, String, Option<i64>, i64, i64) = tx
        .query_row(
            "SELECT title, notes, category_id, priority, completed FROM todos WHERE id=?1",
            params![id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<i64>>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, i64>(4)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    // 有一次性提醒的待办 → 保留为日程提醒
    let reminder_at: Option<String> = tx
        .query_row("SELECT reminder_at FROM todos WHERE id=?1", params![id], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    let (rem_enabled, rem_offset) = match (&start_time, &reminder_at) {
        (Some(t), Some(ra)) => {
            // 待办提醒时间转换为相对日程开始时间的偏移
            let base = chrono::NaiveDateTime::parse_from_str(&format!("{} {}", date, t), "%Y-%m-%d %H:%M").ok();
            let ra_dt = chrono::NaiveDateTime::parse_from_str(ra, "%Y-%m-%d %H:%M").ok();
            match (base, ra_dt) {
                (Some(b), Some(r)) => (true, (r - b).num_minutes()),
                _ => (false, 0),
            }
        }
        _ => (false, 0),
    };
    tx.execute(
        "INSERT INTO events (title,notes,category_id,start_date,end_date,start_time,is_all_day,recurrence_rule,reminder_enabled,reminder_offset_minutes,priority,completed,excluded_dates)
         VALUES (?1,?2,?3,?4,?4,?5,0,NULL,?6,?7,?8,?9,NULL)",
        params![
            cur.0,
            cur.1,
            cur.2,
            date,
            start_time,
            rem_enabled as i64,
            rem_offset,
            cur.3,
            cur.4
        ],
    )
    .map_err(|e| e.to_string())?;
    let eid = tx.last_insert_rowid();
    // 复制标签
    let tag_ids: Vec<i64> = {
        let mut stmt = tx
            .prepare("SELECT tag_id FROM todo_tags WHERE todo_id=?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![id], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
    };
    for t in tag_ids {
        tx.execute(
            "INSERT OR IGNORE INTO event_tags (event_id, tag_id) VALUES (?1, ?2)",
            params![eid, t],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "UPDATE todos SET deleted=1, updated_at=?1 WHERE id=?2",
        params![now_str(), id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(eid)
}

#[tauri::command]
pub fn search_todos(state: State<DbState>, q: String) -> Result<Vec<Todo>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let like = format!("%{}%", q.trim());
    let sql = format!(
        "SELECT {TODO_COLS} FROM todos WHERE deleted=0 AND (title LIKE ?1 OR notes LIKE ?1 OR id IN (SELECT todo_id FROM todo_tags WHERE tag_id IN (SELECT id FROM tags WHERE name LIKE ?1))) ORDER BY created_at DESC LIMIT 100"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![like], row_to_todo)
        .map_err(|e| e.to_string())?;
    let todos: Vec<Todo> = rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?;
    decorate(&conn, todos)
}
