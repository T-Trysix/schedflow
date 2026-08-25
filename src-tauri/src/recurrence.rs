use chrono::{Datelike, NaiveDate};
use serde_json::Value;
use std::collections::HashSet;

use crate::models::RecurrenceRule;

/// 解析存库的 JSON 重复规则。
pub fn parse_rule(json: &Option<String>) -> Option<RecurrenceRule> {
    let s = json.as_ref()?;
    serde_json::from_str::<RecurrenceRule>(s).ok()
}

/// 解析 excluded_dates JSON（日期数组）。
pub fn parse_excluded(json: &Option<String>) -> HashSet<NaiveDate> {
    let mut out = HashSet::new();
    let Some(s) = json.as_ref() else { return out };
    if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(s) {
        for v in arr {
            if let Some(d) = v.as_str() {
                if let Ok(d) = NaiveDate::parse_from_str(d, "%Y-%m-%d") {
                    out.insert(d);
                }
            }
        }
    }
    out
}

pub fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

/// 平闰年对应月份天数。
fn days_in_month(y: i32, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) => 29,
        _ => 28,
    }
}

/// 按 +n 月计算日期，月末自动钳制（1-31 → 2-28）。
fn add_months(d: NaiveDate, months: i64) -> Option<NaiveDate> {
    let total = (d.year() as i64) * 12 + (d.month0() as i64) + months;
    let y = (total.div_euclid(12)) as i32;
    let m = (total.rem_euclid(12)) + 1;
    let day = (d.day() as i64).min(days_in_month(y, m as u32) as i64) as u32;
    NaiveDate::from_ymd_opt(y, m as u32, day)
}

fn weekday_filter_ok(rule: &RecurrenceRule, iso_wd: i64) -> bool {
    if rule.by_weekday {
        (1..=5).contains(&iso_wd)
    } else if rule.days_of_week.is_empty() {
        true
    } else {
        rule.days_of_week.contains(&iso_wd)
    }
}

/// 展开重复日程在 [range_start, range_end] 内的所有发生日期（不含被排除日期）。
pub fn occurrences(
    rule: &RecurrenceRule,
    start: NaiveDate,
    excluded: &HashSet<NaiveDate>,
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> Vec<NaiveDate> {
    let mut out = Vec::new();
    let end_limit = rule
        .end_date
        .as_deref()
        .and_then(parse_date)
        .unwrap_or(NaiveDate::from_ymd_opt(9999, 12, 31).unwrap());

    let push = |d: NaiveDate, out: &mut Vec<NaiveDate>| {
        if d >= start
            && d >= range_start
            && d <= range_end
            && d <= end_limit
            && !excluded.contains(&d)
        {
            out.push(d);
        }
    };

    let interval = rule.interval.max(1);
    match rule.rule_type.as_str() {
        "daily" => {
            let mut d = start;
            let mut guard = 0;
            while d <= end_limit && guard < 40000 {
                push(d, &mut out);
                d += chrono::Duration::days(interval);
                guard += 1;
            }
        }
        "weekly" => {
            let anchor = start - chrono::Duration::days(start.weekday().num_days_from_monday() as i64);
            let mut guard = 0;
            let mut week = 0i64;
            while guard < 6000 {
                let base = anchor + chrono::Duration::weeks(week * interval);
                if base > end_limit || base > range_end + chrono::Duration::weeks(8) {
                    break;
                }
                let mut added_any = false;
                let days: Vec<i64> = if rule.by_weekday {
                    (1..=5).collect()
                } else if rule.days_of_week.is_empty() {
                    vec![start.weekday().number_from_monday() as i64]
                } else {
                    rule.days_of_week.clone()
                };
                for iso in &days {
                    let d = base + chrono::Duration::days(iso - 1);
                    push(d, &mut out);
                    added_any = true;
                }
                if !added_any {
                    break;
                }
                week += 1;
                guard += 1;
            }
        }
        "monthly" => {
            let mut guard = 0;
            let mut d = start;
            while d <= end_limit && guard < 4000 {
                push(d, &mut out);
                match add_months(d, interval) {
                    Some(next) => {
                        if next <= d {
                            break;
                        }
                        d = next;
                    }
                    None => break,
                }
                guard += 1;
            }
        }
        "yearly" => {
            let mut guard = 0;
            let mut d = start;
            while d <= end_limit && guard < 500 {
                push(d, &mut out);
                match d.with_year(d.year() + interval as i32) {
                    Some(next) if next > d => d = next,
                    _ => break,
                }
                guard += 1;
            }
        }
        "custom" => {
            // 每 interval 天，且可选限定在指定星期几
            let mut d = start;
            let mut guard = 0;
            while d <= end_limit && guard < 40000 {
                let iso = d.weekday().number_from_monday() as i64;
                if weekday_filter_ok(rule, iso) {
                    push(d, &mut out);
                }
                d += chrono::Duration::days(interval);
                guard += 1;
            }
        }
        _ => {
            push(start, &mut out);
        }
    }
    out
}
