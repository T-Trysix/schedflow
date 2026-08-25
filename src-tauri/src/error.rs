#[allow(dead_code)]
pub type AppResult<T> = Result<T, String>;

pub fn to_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
