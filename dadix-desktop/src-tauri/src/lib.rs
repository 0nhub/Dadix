// All dadix_* commands run on Tauri's thread pool, so SQLite access never blocks the UI.
mod db;
mod state;

use db::{DadixDb, GridViewColumnRow, ProjectMeta, TableRow, ViewRow};
use state::AppState;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
fn dadix_create_project(path: String, state: State<AppState>) -> Result<ProjectMeta, String> {
    let path_buf = PathBuf::from(&path);
    let db = DadixDb::create(&path_buf).map_err(|e| e.to_string())?;
    let meta = db.get_project_meta().map_err(|e| e.to_string())?;
    let mut guard = state.db.lock().map_err(|_| "Lock error")?;
    *guard = Some((db, path_buf));
    Ok(meta)
}

#[tauri::command]
fn dadix_open_project(path: String, state: State<AppState>) -> Result<ProjectMeta, String> {
    let path_buf = PathBuf::from(&path);
    let db = DadixDb::open(&path_buf).map_err(|e| e.to_string())?;
    let meta = db.get_project_meta().map_err(|e| e.to_string())?;
    let mut guard = state.db.lock().map_err(|_| "Lock error")?;
    *guard = Some((db, path_buf));
    Ok(meta)
}

#[tauri::command]
fn dadix_close_project(state: State<AppState>) -> Result<(), String> {
    let mut guard = state.db.lock().map_err(|_| "Lock error")?;
    *guard = None;
    Ok(())
}

#[tauri::command]
fn dadix_get_project_meta(state: State<AppState>) -> Result<Option<ProjectMeta>, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Ok(None);
    };
    let meta = db.get_project_meta().map_err(|e| e.to_string())?;
    Ok(Some(meta))
}

#[tauri::command]
fn dadix_get_tables(state: State<AppState>) -> Result<Vec<TableRow>, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Err("No project open".into());
    };
    db.get_tables().map_err(|e| e.to_string())
}

#[tauri::command]
fn dadix_get_table(state: State<AppState>, id: i64) -> Result<Option<TableRow>, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Err("No project open".into());
    };
    db.get_table(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn dadix_get_columns(state: State<AppState>, table_id: i64) -> Result<Vec<db::ColumnRow>, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Err("No project open".into());
    };
    db.get_columns(table_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn dadix_get_views(state: State<AppState>, table_id: i64) -> Result<Vec<ViewRow>, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Err("No project open".into());
    };
    db.get_views(table_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn dadix_get_view(state: State<AppState>, view_id: i64) -> Result<Option<ViewRow>, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Err("No project open".into());
    };
    db.get_view(view_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn dadix_get_grid_view_columns(
    state: State<AppState>,
    view_id: i64,
) -> Result<Vec<GridViewColumnRow>, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Err("No project open".into());
    };
    db.get_grid_view_columns(view_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn dadix_get_records(
    state: State<AppState>,
    table_id: i64,
    limit: i64,
    offset: i64,
) -> Result<Vec<db::RecordRow>, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Err("No project open".into());
    };
    db.get_records(table_id, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
fn dadix_get_record_count(state: State<AppState>, table_id: i64) -> Result<i64, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Err("No project open".into());
    };
    db.get_record_count(table_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn dadix_create_table(state: State<AppState>, name: String) -> Result<TableRow, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Err("No project open".into());
    };
    db.create_table(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn dadix_create_column(
    state: State<AppState>,
    table_id: i64,
    name: String,
    type_name: String,
) -> Result<db::ColumnRow, String> {
    let guard = state.db.lock().map_err(|_| "Lock error")?;
    let Some((ref db, _)) = *guard else {
        return Err("No project open".into());
    };
    db.create_column(table_id, &name, &type_name).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            dadix_create_project,
            dadix_open_project,
            dadix_close_project,
            dadix_get_project_meta,
            dadix_get_tables,
            dadix_get_table,
            dadix_get_columns,
            dadix_get_views,
            dadix_get_view,
            dadix_get_grid_view_columns,
            dadix_get_records,
            dadix_get_record_count,
            dadix_create_table,
            dadix_create_column,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
