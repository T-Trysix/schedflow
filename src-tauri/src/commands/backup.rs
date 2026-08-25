use std::path::PathBuf;

use rusqlite::params;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};

use crate::{db, DbState};

fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取数据目录失败: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
    Ok(dir.join("schedflow.db"))
}

fn pick_save(app: &AppHandle, title: &str, filter: (&str, &[&str]), name: &str) -> Result<PathBuf, String> {
    let f = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter(filter.0, filter.1)
        .set_file_name(name)
        .blocking_save_file();
    match f {
        Some(FilePath::Path(p)) => Ok(p),
        _ => Err("未选择保存位置".to_string()),
    }
}

fn pick_open(app: &AppHandle, title: &str, filter: (&str, &[&str])) -> Result<PathBuf, String> {
    let f = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter(filter.0, filter.1)
        .blocking_pick_file();
    match f {
        Some(FilePath::Path(p)) => Ok(p),
        _ => Err("未选择文件".to_string()),
    }
}

/// 备份数据库（复制 SQLite 文件到指定位置）。
#[tauri::command]
pub fn backup_db(app: AppHandle, path: Option<String>) -> Result<String, String> {
    let db_path = get_db_path(&app)?;
    // 先做 WAL checkpoint，确保主库文件包含最新数据
    {
        let st = app.state::<DbState>();
        let guard = st.0.lock().map_err(|e| e.to_string())?;
        let _ = guard.pragma_update(None, "wal_checkpoint", "TRUNCATE");
    }
    let dest = match path {
        Some(p) => PathBuf::from(p),
        None => {
            let name = format!(
                "schedflow-backup-{}.db",
                chrono::Local::now().format("%Y%m%d-%H%M%S")
            );
            pick_save(&app, "备份数据库", ("数据库文件", &["db"]), &name)?
        }
    };
    std::fs::copy(&db_path, &dest).map_err(|e| format!("备份失败: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

/// 从备份文件恢复。
#[tauri::command]
pub fn restore_db(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let src = match path {
        Some(p) => PathBuf::from(p),
        None => pick_open(&app, "选择备份文件", ("数据库文件", &["db"]))?,
    };
    if !src.exists() {
        return Err("备份文件不存在".to_string());
    }
    let db_path = get_db_path(&app)?;
    let st = app.state::<DbState>();
    let mut guard = st.0.lock().map_err(|e| e.to_string())?;
    // 关闭旧连接（用临时内存连接占位再替换）
    let _old = std::mem::replace(
        &mut *guard,
        rusqlite::Connection::open_in_memory().map_err(|e| e.to_string())?,
    );
    // 清除可能残留的 WAL/SHM
    let _ = std::fs::remove_file(db_path.with_extension("db-wal"));
    let _ = std::fs::remove_file(db_path.with_extension("db-shm"));
    std::fs::copy(&src, &db_path).map_err(|e| format!("恢复失败: {e}"))?;
    let new_conn = db::init_db(&db_path)?;
    *guard = new_conn;
    let _ = app.emit("data-changed", ());
    Ok(())
}

fn export_events_json(conn: &rusqlite::Connection) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id,title,notes,category_id,start_date,end_date,start_time,end_time,is_all_day,recurrence_rule,reminder_enabled,reminder_offset_minutes,priority,completed,created_at FROM events WHERE deleted=0 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "title": r.get::<_, String>(1)?,
                "notes": r.get::<_, String>(2)?,
                "categoryId": r.get::<_, Option<i64>>(3)?,
                "startDate": r.get::<_, String>(4)?,
                "endDate": r.get::<_, String>(5)?,
                "startTime": r.get::<_, Option<String>>(6)?,
                "endTime": r.get::<_, Option<String>>(7)?,
                "isAllDay": r.get::<_, i64>(8)? != 0,
                "recurrenceRule": r.get::<_, Option<String>>(9)?,
                "reminderEnabled": r.get::<_, i64>(10)? != 0,
                "reminderOffsetMinutes": r.get::<_, i64>(11)?,
                "priority": r.get::<_, i64>(12)?,
                "completed": r.get::<_, i64>(13)? != 0,
                "createdAt": r.get::<_, String>(14)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out: Vec<Value> = rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?;
    // 附带标签名
    let mut stmt2 = conn
        .prepare("SELECT et.event_id, t.name FROM event_tags et JOIN tags t ON t.id=et.tag_id")
        .map_err(|e| e.to_string())?;
    let tr = stmt2
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    for row in tr.flatten() {
        if let Some(ev) = out.iter_mut().find(|e| e["id"].as_i64() == Some(row.0)) {
            if ev["tags"].is_null() {
                ev["tags"] = json!([]);
            }
            let tags = ev["tags"].as_array_mut().unwrap();
            tags.push(json!(row.1));
        }
    }
    for e in out.iter_mut() {
        if e.get("tags").is_none() {
            e["tags"] = json!([]);
        }
    }
    Ok(out)
}

fn export_todos_json(conn: &rusqlite::Connection) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare("SELECT id,title,notes,category_id,priority,reminder_at,completed,created_at FROM todos WHERE deleted=0 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "title": r.get::<_, String>(1)?,
                "notes": r.get::<_, String>(2)?,
                "categoryId": r.get::<_, Option<i64>>(3)?,
                "priority": r.get::<_, i64>(4)?,
                "reminderAt": r.get::<_, Option<String>>(5)?,
                "completed": r.get::<_, i64>(6)? != 0,
                "createdAt": r.get::<_, String>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out: Vec<Value> = rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?;
    let mut stmt2 = conn
        .prepare("SELECT tt.todo_id, t.name FROM todo_tags tt JOIN tags t ON t.id=tt.tag_id")
        .map_err(|e| e.to_string())?;
    let tr = stmt2
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    for row in tr.flatten() {
        if let Some(ev) = out.iter_mut().find(|e| e["id"].as_i64() == Some(row.0)) {
            if ev["tags"].is_null() {
                ev["tags"] = json!([]);
            }
            let tags = ev["tags"].as_array_mut().unwrap();
            tags.push(json!(row.1));
        }
    }
    for e in out.iter_mut() {
        if e.get("tags").is_none() {
            e["tags"] = json!([]);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn export_json(app: AppHandle, path: Option<String>) -> Result<String, String> {
    let _ = get_db_path(&app)?;
    {
        let st = app.state::<DbState>();
        let guard = st.0.lock().map_err(|e| e.to_string())?;
        let _ = guard.pragma_update(None, "wal_checkpoint", "TRUNCATE");
    }
    let st = app.state::<DbState>();
    let conn = st.0.lock().map_err(|e| e.to_string())?;
    let mut cats = Vec::new();
    if let Ok(rows) = super::categories::list_categories_conn(&conn) {
        cats = rows
            .into_iter()
            .map(|c| {
                json!({
                    "id": c.id, "name": c.name, "color": c.color, "sortOrder": c.sort_order, "isBuiltin": c.is_builtin
                })
            })
            .collect();
    }
    let mut tags = Vec::new();
    let mut stmt = conn
        .prepare("SELECT id, name FROM tags ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        tags.push(json!({ "id": row.0, "name": row.1 }));
    }
    let payload = json!({
        "version": 1,
        "exportedAt": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        "categories": cats,
        "tags": tags,
        "events": export_events_json(&conn)?,
        "todos": export_todos_json(&conn)?,
    });
    drop(stmt);
    drop(conn);
    let dest = match path {
        Some(p) => PathBuf::from(p),
        None => {
            let name = format!(
                "schedflow-export-{}.json",
                chrono::Local::now().format("%Y%m%d-%H%M%S")
            );
            pick_save(&app, "导出数据", ("JSON 文件", &["json"]), &name)?
        }
    };
    let text = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    std::fs::write(&dest, text).map_err(|e| format!("导出失败: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

/// 导出 CSV（事件 + 待办，写入所选目录）。
#[tauri::command]
pub fn export_csv(app: AppHandle, dir: Option<String>) -> Result<String, String> {
    let dest_dir = match dir {
        Some(p) => PathBuf::from(p),
        None => {
            let f = app
                .dialog()
                .file()
                .set_title("选择导出目录")
                .blocking_pick_folder();
            match f {
                Some(FilePath::Path(p)) => p,
                _ => return Err("未选择目录".to_string()),
            }
        }
    };
    let st = app.state::<DbState>();
    let conn = st.0.lock().map_err(|e| e.to_string())?;
    let cats = super::categories::list_categories_conn(&conn)?;
    let cat_name = |id: Option<i64>| -> String {
        id.and_then(|i| cats.iter().find(|c| c.id == i).map(|c| c.name.clone()))
            .unwrap_or_default()
    };
    // 事件 CSV
    let mut event_rows = vec!["标题,开始日期,结束日期,开始时间,结束时间,全天,分类,优先级,已完成,备注".to_string()];
    let mut stmt = conn
        .prepare("SELECT title,start_date,end_date,start_time,end_time,is_all_day,category_id,priority,completed,notes FROM events WHERE deleted=0 ORDER BY start_date")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, Option<i64>>(6)?,
                r.get::<_, i64>(7)?,
                r.get::<_, i64>(8)?,
                r.get::<_, String>(9)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        let pri = ["无", "低", "中", "高"].get(row.7 as usize).unwrap_or(&"无").to_string();
        event_rows.push(format!(
            "\"{}\",{},{},{},{},{},{},{},{},\"{}\"",
            row.0.replace('"', "\"\""),
            row.1,
            row.2,
            row.3.as_deref().unwrap_or(""),
            row.4.as_deref().unwrap_or(""),
            if row.5 != 0 { "是" } else { "否" },
            cat_name(row.6),
            pri,
            if row.8 != 0 { "是" } else { "否" },
            row.9.replace('"', "\"\""),
        ));
    }
    // 待办 CSV
    let mut todo_rows = vec!["标题,分类,优先级,提醒时间,已完成,备注".to_string()];
    let mut stmt2 = conn
        .prepare("SELECT title,category_id,priority,reminder_at,completed,notes FROM todos WHERE deleted=0 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt2
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<i64>>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        let pri = ["无", "低", "中", "高"].get(row.2 as usize).unwrap_or(&"无").to_string();
        todo_rows.push(format!(
            "\"{}\",{},{},{},{},\"{}\"",
            row.0.replace('"', "\"\""),
            cat_name(row.1),
            pri,
            row.3.as_deref().unwrap_or(""),
            if row.4 != 0 { "是" } else { "否" },
            row.5.replace('"', "\"\""),
        ));
    }
    drop(stmt);
    drop(stmt2);
    drop(conn);
    // UTF-8 BOM 便于 Excel 打开中文
    let ev_path = dest_dir.join("events.csv");
    let td_path = dest_dir.join("todos.csv");
    let mut ev_content = vec![0xEF, 0xBB, 0xBF];
    ev_content.extend_from_slice(event_rows.join("\n").as_bytes());
    let mut td_content = vec![0xEF, 0xBB, 0xBF];
    td_content.extend_from_slice(todo_rows.join("\n").as_bytes());
    std::fs::write(&ev_path, ev_content).map_err(|e| format!("导出事件 CSV 失败: {e}"))?;
    std::fs::write(&td_path, td_content).map_err(|e| format!("导出待办 CSV 失败: {e}"))?;
    Ok(dest_dir.to_string_lossy().to_string())
}

/// 从 JSON 备份导入（合并：新数据追加插入）。
#[tauri::command]
pub fn import_json(app: AppHandle, path: Option<String>) -> Result<usize, String> {
    let src = match path {
        Some(p) => PathBuf::from(p),
        None => pick_open(&app, "选择 JSON 数据文件", ("JSON 文件", &["json"]))?,
    };
    let text = std::fs::read_to_string(&src).map_err(|e| format!("读取文件失败: {e}"))?;
    let data: Value = serde_json::from_str(&text).map_err(|e| format!("JSON 解析失败: {e}"))?;

    let st = app.state::<DbState>();
    let conn = st.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let mut cat_id_map: std::collections::HashMap<i64, i64> = Default::default();
    if let Some(cats) = data.get("categories").and_then(|c| c.as_array()) {
        for c in cats {
            let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("未分类");
            let color = c.get("color").and_then(|v| v.as_str()).unwrap_or("#1677ff");
            let old_id = c.get("id").and_then(|v| v.as_i64());
            let exists: Option<i64> = tx
                .query_row("SELECT id FROM categories WHERE name=?1", params![name], |r| {
                    r.get(0)
                })
                .ok();
            let id = match exists {
                Some(i) => i,
                None => {
                    tx.execute(
                        "INSERT INTO categories (name,color,sort_order,is_builtin) VALUES (?1,?2,0,0)",
                        params![name, color],
                    )
                    .map_err(|e| e.to_string())?;
                    tx.last_insert_rowid()
                }
            };
            if let Some(o) = old_id {
                cat_id_map.insert(o, id);
            }
        }
    }

    let mut tag_id_map: std::collections::HashMap<i64, i64> = Default::default();
    let mut tag_name_map: std::collections::HashMap<String, i64> = Default::default();
    if let Some(tags) = data.get("tags").and_then(|t| t.as_array()) {
        for t in tags {
            let name = t.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if name.is_empty() {
                continue;
            }
            let old_id = t.get("id").and_then(|v| v.as_i64());
            let exists: Option<i64> = tx
                .query_row("SELECT id FROM tags WHERE name=?1", params![name], |r| r.get(0))
                .ok();
            let id = match exists {
                Some(i) => i,
                None => {
                    tx.execute("INSERT INTO tags (name) VALUES (?1)", params![name])
                        .map_err(|e| e.to_string())?;
                    tx.last_insert_rowid()
                }
            };
            tag_name_map.insert(name.clone(), id);
            if let Some(o) = old_id {
                tag_id_map.insert(o, id);
            }
        }
    }

    let mut count = 0usize;
    if let Some(events) = data.get("events").and_then(|e| e.as_array()) {
        for e in events {
            let title = e.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if title.is_empty() {
                continue;
            }
            let start_date = e.get("startDate").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if start_date.is_empty() {
                continue;
            }
            let cat = e.get("categoryId").and_then(|v| v.as_i64()).and_then(|c| cat_id_map.get(&c)).copied();
            let end_date = e.get("endDate").and_then(|v| v.as_str()).unwrap_or(&start_date).to_string();
            tx.execute(
                "INSERT INTO events (title,notes,category_id,start_date,end_date,start_time,end_time,is_all_day,recurrence_rule,reminder_enabled,reminder_offset_minutes,priority,completed) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
                params![
                    title,
                    e.get("notes").and_then(|v| v.as_str()).unwrap_or(""),
                    cat,
                    start_date,
                    end_date,
                    e.get("startTime").and_then(|v| v.as_str()),
                    e.get("endTime").and_then(|v| v.as_str()),
                    e.get("isAllDay").and_then(|v| v.as_bool()).unwrap_or(false) as i64,
                    e.get("recurrenceRule").and_then(|v| v.as_str()),
                    e.get("reminderEnabled").and_then(|v| v.as_bool()).unwrap_or(false) as i64,
                    e.get("reminderOffsetMinutes").and_then(|v| v.as_i64()).unwrap_or(0),
                    e.get("priority").and_then(|v| v.as_i64()).unwrap_or(0),
                    e.get("completed").and_then(|v| v.as_bool()).unwrap_or(false) as i64,
                ],
            )
            .map_err(|e| e.to_string())?;
            let new_id = tx.last_insert_rowid();
            if let Some(tags) = e.get("tags").and_then(|t| t.as_array()) {
                for tv in tags {
                    if let Some(name) = tv.as_str() {
                        if let Some(tid) = tag_name_map.get(name) {
                            let _ = tx.execute(
                                "INSERT OR IGNORE INTO event_tags (event_id, tag_id) VALUES (?1,?2)",
                                params![new_id, tid],
                            );
                        }
                    }
                }
            }
            count += 1;
        }
    }
    if let Some(todos) = data.get("todos").and_then(|t| t.as_array()) {
        for t in todos {
            let title = t.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if title.is_empty() {
                continue;
            }
            let cat = t.get("categoryId").and_then(|v| v.as_i64()).and_then(|c| cat_id_map.get(&c)).copied();
            tx.execute(
                "INSERT INTO todos (title,notes,category_id,priority,reminder_at,completed,sort_order) VALUES (?1,?2,?3,?4,?5,?6,0)",
                params![
                    title,
                    t.get("notes").and_then(|v| v.as_str()).unwrap_or(""),
                    cat,
                    t.get("priority").and_then(|v| v.as_i64()).unwrap_or(0),
                    t.get("reminderAt").and_then(|v| v.as_str()),
                    t.get("completed").and_then(|v| v.as_bool()).unwrap_or(false) as i64,
                ],
            )
            .map_err(|e| e.to_string())?;
            let new_id = tx.last_insert_rowid();
            if let Some(tags) = t.get("tags").and_then(|t| t.as_array()) {
                for tv in tags {
                    if let Some(name) = tv.as_str() {
                        if let Some(tid) = tag_name_map.get(name) {
                            let _ = tx.execute(
                                "INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?1,?2)",
                                params![new_id, tid],
                            );
                        }
                    }
                }
            }
            count += 1;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    let _ = app.emit("data-changed", ());
    Ok(count)
}

/// 清空所有日程/待办数据（保留分类、标签、设置）。
#[tauri::command]
pub fn clear_all_data(app: AppHandle) -> Result<(), String> {
    let st = app.state::<DbState>();
    let conn = st.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute_batch(
        "DELETE FROM event_tags;
         DELETE FROM todo_tags;
         DELETE FROM events;
         DELETE FROM todos;
         DELETE FROM notifications;",
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    let _ = app.emit("data-changed", ());
    Ok(())
}
