use rusqlite::Connection;
use std::path::Path;

/// 初始化数据库：建表、建索引、写入内置分类。
pub fn init_db(path: &Path) -> Result<Connection, String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
    }
    let conn = Connection::open(path).map_err(|e| format!("打开数据库失败: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("设置 WAL 失败: {e}"))?;
    conn.pragma_update(None, "synchronous", "NORMAL").ok();
    conn.pragma_update(None, "foreign_keys", "ON").ok();
    init_schema(&conn)?;
    seed_categories(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT '#1677ff',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_builtin INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            category_id INTEGER,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            is_all_day INTEGER NOT NULL DEFAULT 0,
            recurrence_rule TEXT,
            reminder_enabled INTEGER NOT NULL DEFAULT 0,
            reminder_offset_minutes INTEGER NOT NULL DEFAULT 0,
            priority INTEGER NOT NULL DEFAULT 0,
            completed INTEGER NOT NULL DEFAULT 0,
            excluded_dates TEXT,
            deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
        CREATE INDEX IF NOT EXISTS idx_events_deleted ON events(deleted);
        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            category_id INTEGER,
            priority INTEGER NOT NULL DEFAULT 0,
            reminder_at TEXT,
            completed INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_todos_deleted ON todos(deleted);
        CREATE TABLE IF NOT EXISTS event_tags (
            event_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (event_id, tag_id)
        );
        CREATE TABLE IF NOT EXISTS todo_tags (
            todo_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (todo_id, tag_id)
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            occurrence_at TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            read INTEGER NOT NULL DEFAULT 0,
            fired_at TEXT NOT NULL,
            UNIQUE(entity_type, entity_id, occurrence_at)
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )
    .map_err(|e| format!("初始化表结构失败: {e}"))?;
    Ok(())
}

fn seed_categories(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))
        .map_err(|e| format!("查询分类失败: {e}"))?;
    if count > 0 {
        return Ok(());
    }
    let builtin: [(&str, &str); 5] = [
        ("工作", "#3b82f6"),
        ("会议", "#8b5cf6"),
        ("个人", "#22c55e"),
        ("学习", "#f59e0b"),
        ("其他", "#6b7280"),
    ];
    conn.execute_batch(
        "BEGIN;
        INSERT INTO categories (name, color, sort_order, is_builtin) VALUES ('工作','#3b82f6',1,1);
        INSERT INTO categories (name, color, sort_order, is_builtin) VALUES ('会议','#8b5cf6',2,1);
        INSERT INTO categories (name, color, sort_order, is_builtin) VALUES ('个人','#22c55e',3,1);
        INSERT INTO categories (name, color, sort_order, is_builtin) VALUES ('学习','#f59e0b',4,1);
        INSERT INTO categories (name, color, sort_order, is_builtin) VALUES ('其他','#6b7280',5,1);
        COMMIT;",
    )
    .map_err(|e| format!("写入内置分类失败: {e}"))?;
    let _ = builtin;
    Ok(())
}
