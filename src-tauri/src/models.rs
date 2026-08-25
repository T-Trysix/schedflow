use serde::{Deserialize, Serialize};

/// 重复规则。weekday 使用 ISO 编号：1=周一 … 7=周日。
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceRule {
    #[serde(rename = "type")]
    pub rule_type: String, // none | daily | weekly | monthly | yearly | custom
    pub interval: i64,     // 每 N 天/周/月/年
    pub days_of_week: Vec<i64>, // weekly/custom 生效，ISO 1..7
    pub by_weekday: bool,       // custom: 仅工作日（周一至周五）
    pub end_date: Option<String>, // YYYY-MM-DD，None=永不结束
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: i64,
    pub title: String,
    pub notes: String,
    pub category_id: Option<i64>,
    pub start_date: String,
    pub end_date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub is_all_day: bool,
    pub recurrence_rule: Option<String>,
    pub reminder_enabled: bool,
    pub reminder_offset_minutes: i64,
    pub priority: i64,
    pub completed: bool,
    pub excluded_dates: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    pub title: String,
    pub notes: Option<String>,
    pub category_id: Option<i64>,
    pub start_date: String,
    pub end_date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub is_all_day: Option<bool>,
    pub recurrence_rule: Option<String>,
    pub reminder_enabled: Option<bool>,
    pub reminder_offset_minutes: Option<i64>,
    pub priority: Option<i64>,
    pub completed: Option<bool>,
    pub tag_ids: Option<Vec<i64>>,
}

/// 月视图/日程模式使用的“某一天的一条日程出现”，可能来自重复展开。
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DayEvent {
    pub id: i64,
    pub title: String,
    pub notes: String,
    pub category_id: Option<i64>,
    pub occurrence_date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub is_all_day: bool,
    pub recurrence_rule: Option<String>,
    pub is_recurring: bool,
    pub reminder_enabled: bool,
    pub reminder_offset_minutes: i64,
    pub priority: i64,
    pub completed: bool,
    pub tags: Vec<i64>,
    pub category_color: Option<String>,
    pub category_name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TodoInput {
    pub title: String,
    pub notes: Option<String>,
    pub category_id: Option<i64>,
    pub priority: Option<i64>,
    pub reminder_at: Option<String>,
    pub completed: Option<bool>,
    pub tag_ids: Option<Vec<i64>>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: i64,
    pub title: String,
    pub notes: String,
    pub category_id: Option<i64>,
    pub priority: i64,
    pub reminder_at: Option<String>,
    pub completed: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<i64>,
    pub category_color: Option<String>,
    pub category_name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub sort_order: i64,
    pub is_builtin: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReminderInfo {
    pub id: i64,
    pub entity_type: String, // event | todo
    pub entity_id: i64,
    pub title: String,
    pub notes: String,
    pub occurrence_at: String,
}
