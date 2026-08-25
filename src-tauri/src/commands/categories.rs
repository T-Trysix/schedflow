use rusqlite::{Connection, params};
use tauri::{Emitter, State};

use crate::DbState;
use crate::models::Category;
use super::events::now_str;

#[tauri::command]
pub fn list_categories(state: State<DbState>) -> Result<Vec<Category>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    list_categories_conn(&conn)
}

pub(crate) fn list_categories_conn(conn: &Connection) -> Result<Vec<Category>, String> {
    let mut stmt = conn
        .prepare("SELECT id,name,color,sort_order,is_builtin FROM categories ORDER BY sort_order ASC, id ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Category {
                id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                sort_order: r.get(3)?,
                is_builtin: r.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_category(app: tauri::AppHandle, state: State<DbState>, name: String, color: String) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let max_sort: i64 = conn
        .query_row("SELECT COALESCE(MAX(sort_order),0) FROM categories", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO categories (name,color,sort_order,is_builtin) VALUES (?1,?2,?3,0)",
        params![name.trim(), color, max_sort + 1],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(id)
}

#[tauri::command]
pub fn update_category(
    app: tauri::AppHandle,
    state: State<DbState>,
    id: i64,
    name: String,
    color: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE categories SET name=?1, color=?2 WHERE id=?3",
        params![name.trim(), color, id],
    )
    .map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}

/// 删除分类：其下日程/待办归入“未分类”（category_id → NULL）。
#[tauri::command]
pub fn delete_category(app: tauri::AppHandle, state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE events SET category_id=NULL, updated_at=?1 WHERE category_id=?2",
        params![now_str(), id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE todos SET category_id=NULL, updated_at=?1 WHERE category_id=?2",
        params![now_str(), id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM categories WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);
    let _ = app.emit("data-changed", ());
    Ok(())
}
