use rusqlite::params;
use tauri::{Emitter, State};

use crate::DbState;
use crate::models::Tag;

#[tauri::command]
pub fn list_tags(state: State<DbState>) -> Result<Vec<Tag>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id,name FROM tags ORDER BY id ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Tag {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_tag(app: tauri::AppHandle, state: State<DbState>, name: String) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // 已存在同名标签则返回其 id
    let existing: Option<i64> = conn
        .query_row("SELECT id FROM tags WHERE name = ?1", params![name.trim()], |r| {
            r.get(0)
        })
        .ok();
    if let Some(id) = existing {
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO tags (name) VALUES (?1)",
        params![name.trim()],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(id)
}

#[tauri::command]
pub fn delete_tag(app: tauri::AppHandle, state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM event_tags WHERE tag_id=?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM todo_tags WHERE tag_id=?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tags WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}
