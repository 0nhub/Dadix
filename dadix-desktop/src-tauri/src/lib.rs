//! Thin Tauri adapters. All project logic lives in `dadix-core`.

mod state;

use dadix_core::{
    close_project, create_project, list_project_recovery, open_or_create_web_demo_project,
    open_project, resolve_source_path, restore_project_backup, save_project, validate_project,
    BoundFileSource, Column, DadixError,
    DatabaseSecret, ErrorCode, FileFormat, GridViewColumn, Job, MissingSource, NewDatabaseSource, Project,
    ProjectHandle, QueryId, QueryParam, QueryRequest, QueryResult, QueryStatus, Record, RecordPage,
    RecoveryArtifact, RemoteColumn, RemoteTable, Setting, Source, SourceTable, Table,
    ValidationReport, View, ViewButton,
};
use state::AppState;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, State};

fn lock_err() -> DadixError {
    DadixError::lock()
}

fn snapshot_project(state: &AppState) -> Result<Arc<ProjectHandle>, DadixError> {
    let guard = state.session.lock().map_err(|_| lock_err())?;
    guard.as_ref().cloned().ok_or_else(|| {
        DadixError::new(ErrorCode::ProjectNotOpen, "No project open")
    })
}

fn with_project<T>(
    state: &AppState,
    f: impl FnOnce(&ProjectHandle) -> Result<T, DadixError>,
) -> Result<T, DadixError> {
    let project = snapshot_project(state)?;
    f(&project)
}

fn release_handle(handle: Arc<ProjectHandle>) -> Result<(), DadixError> {
    handle.shutdown_query();
    let started = Instant::now();
    let mut handle = handle;
    while started.elapsed() < Duration::from_secs(30) {
        match Arc::try_unwrap(handle) {
            Ok(owned) => return close_project(owned),
            Err(shared) => {
                handle = shared;
                std::thread::sleep(Duration::from_millis(25));
            }
        }
    }
    let _ = handle.save();
    Ok(())
}

fn path_from_launch_arg(arg: &str) -> Option<PathBuf> {
    if arg.starts_with('-') {
        return None;
    }
    let path = if arg.starts_with("file:") {
        url::Url::parse(arg)
            .ok()
            .and_then(|u| u.to_file_path().ok())
            .unwrap_or_else(|| PathBuf::from(arg))
    } else {
        PathBuf::from(arg)
    };
    dadix_core::is_dadix_path(&path).then_some(path)
}

fn first_dadix_from_args() -> Option<PathBuf> {
    std::env::args()
        .skip(1)
        .find_map(|a| path_from_launch_arg(&a))
}

fn queue_open_path(app: &tauri::AppHandle, path: PathBuf) {
    if !dadix_core::is_dadix_path(&path) {
        return;
    }
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut pending) = state.pending_open.lock() {
            *pending = Some(path.clone());
        }
    }
    let _ = app.emit("dadix-open-file", path.to_string_lossy().to_string());
}

#[tauri::command]
fn dadix_take_pending_open_path(state: State<AppState>) -> Result<Option<String>, DadixError> {
    let mut guard = state.pending_open.lock().map_err(|_| lock_err())?;
    Ok(guard.take().map(|p| p.to_string_lossy().into_owned()))
}

fn replace_session(state: &AppState, handle: dadix_core::ProjectHandle) -> Result<Project, DadixError> {
    let existing = {
        let mut guard = state.session.lock().map_err(|_| lock_err())?;
        guard.take()
    };
    if let Some(old) = existing {
        release_handle(old)?;
    }
    let meta = handle.meta()?;
    let mut guard = state.session.lock().map_err(|_| lock_err())?;
    *guard = Some(Arc::new(handle));
    Ok(meta)
}

fn named_project_path(name: &str) -> PathBuf {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = home.join("Dadix");
    let stem: String = name
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            _ => ch,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let stem = if stem.is_empty() {
        "Unbenannt".to_string()
    } else {
        stem
    };
    let mut path = dir.join(format!("{stem}.dadix"));
    let mut index = 2;
    while path.exists() {
        path = dir.join(format!("{stem} {index}.dadix"));
        index += 1;
    }
    path
}

#[tauri::command]
fn dadix_create_project(path: String, state: State<AppState>) -> Result<Project, DadixError> {
    let handle = create_project(PathBuf::from(&path))?;
    replace_session(&state, handle)
}

#[tauri::command]
fn dadix_create_named_project(name: String, state: State<AppState>) -> Result<Project, DadixError> {
    let path = named_project_path(&name);
    let handle = create_project(&path)?;
    if !name.trim().is_empty() {
        let _ = handle.set_project_name(name.trim());
    }
    replace_session(&state, handle)
}

#[tauri::command]
fn dadix_open_project(path: String, state: State<AppState>) -> Result<Project, DadixError> {
    let handle = open_project(PathBuf::from(&path))?;
    replace_session(&state, handle)
}

#[tauri::command]
fn dadix_open_demo_project(state: State<AppState>) -> Result<Project, DadixError> {
    let existing = {
        let mut guard = state.session.lock().map_err(|_| lock_err())?;
        guard.take()
    };
    if let Some(handle) = existing {
        release_handle(handle)?;
    }
    let handle = open_or_create_web_demo_project()?;
    let meta = handle.meta()?;
    let mut guard = state.session.lock().map_err(|_| lock_err())?;
    *guard = Some(Arc::new(handle));
    Ok(meta)
}

#[tauri::command]
fn dadix_close_project(state: State<AppState>) -> Result<(), DadixError> {
    let mut guard = state.session.lock().map_err(|_| lock_err())?;
    if let Some(handle) = guard.take() {
        drop(guard);
        release_handle(handle)?;
    }
    Ok(())
}

#[tauri::command]
fn dadix_save_project(state: State<AppState>) -> Result<(), DadixError> {
    with_project(&state, save_project)
}

#[tauri::command]
fn dadix_validate_project(
    path: Option<String>,
    state: State<AppState>,
) -> Result<ValidationReport, DadixError> {
    if let Some(path) = path {
        return validate_project(PathBuf::from(path));
    }
    with_project(&state, |project| project.validate())
}

#[tauri::command]
fn dadix_get_project_meta(state: State<AppState>) -> Result<Option<Project>, DadixError> {
    let Ok(project) = snapshot_project(&state) else {
        return Ok(None);
    };
    project.meta().map(Some)
}

#[tauri::command]
fn dadix_get_tables(state: State<AppState>) -> Result<Vec<Table>, DadixError> {
    with_project(&state, |p| p.tables())
}

#[tauri::command]
fn dadix_get_table(state: State<AppState>, id: i64) -> Result<Option<Table>, DadixError> {
    with_project(&state, |p| p.table(id))
}

#[tauri::command]
fn dadix_get_columns(state: State<AppState>, table_id: i64) -> Result<Vec<Column>, DadixError> {
    with_project(&state, |p| p.columns(table_id))
}

#[tauri::command]
fn dadix_get_views(state: State<AppState>, table_id: i64) -> Result<Vec<View>, DadixError> {
    with_project(&state, |p| p.views(table_id))
}

#[tauri::command]
fn dadix_get_view(state: State<AppState>, view_id: i64) -> Result<Option<View>, DadixError> {
    with_project(&state, |p| p.view(view_id))
}

#[tauri::command]
fn dadix_get_grid_view_columns(
    state: State<AppState>,
    view_id: i64,
) -> Result<Vec<GridViewColumn>, DadixError> {
    with_project(&state, |p| p.grid_view_columns(view_id))
}

#[tauri::command]
fn dadix_get_records(
    state: State<AppState>,
    table_id: i64,
    limit: i64,
    offset: i64,
) -> Result<Vec<Record>, DadixError> {
    with_project(&state, |p| p.records(table_id, limit, offset))
}

#[tauri::command]
fn dadix_get_record_count(state: State<AppState>, table_id: i64) -> Result<i64, DadixError> {
    with_project(&state, |p| p.record_count(table_id))
}

#[tauri::command]
fn dadix_query_records(
    state: State<AppState>,
    table_id: i64,
    filter: Option<String>,
    sort: Option<String>,
    search: Option<String>,
    limit: i64,
    offset: i64,
) -> Result<RecordPage, DadixError> {
    with_project(&state, |p| {
        p.query_records(
            table_id,
            filter.as_deref(),
            sort.as_deref(),
            search.as_deref(),
            limit,
            offset,
        )
    })
}

#[tauri::command]
fn dadix_create_table(state: State<AppState>, name: String) -> Result<Table, DadixError> {
    with_project(&state, |p| p.create_table(&name))
}

#[tauri::command]
fn dadix_insert_record(
    state: State<AppState>,
    table_id: i64,
    data: serde_json::Value,
) -> Result<Record, DadixError> {
    with_project(&state, |p| p.insert_record(table_id, data))
}

#[tauri::command]
fn dadix_update_record(
    state: State<AppState>,
    table_id: i64,
    id: i64,
    data: serde_json::Value,
) -> Result<Record, DadixError> {
    with_project(&state, |p| p.update_record(table_id, id, data))
}

#[tauri::command]
fn dadix_create_column(
    state: State<AppState>,
    table_id: i64,
    name: String,
    type_name: String,
    options: Option<String>,
) -> Result<Column, DadixError> {
    with_project(&state, |p| {
        p.create_column(table_id, &name, &type_name, options.as_deref())
    })
}

#[tauri::command]
fn dadix_update_column(
    state: State<AppState>,
    column_id: i64,
    name: String,
    type_name: String,
    options: Option<String>,
) -> Result<Column, DadixError> {
    with_project(&state, |p| {
        p.update_column(column_id, &name, &type_name, options.as_deref())
    })
}

#[tauri::command]
fn dadix_delete_column(state: State<AppState>, column_id: i64) -> Result<(), DadixError> {
    with_project(&state, |p| p.delete_column(column_id))
}

#[tauri::command]
fn dadix_rename_table(
    state: State<AppState>,
    table_id: i64,
    name: String,
) -> Result<Table, DadixError> {
    with_project(&state, |p| p.rename_table(table_id, &name))
}

#[tauri::command]
fn dadix_update_table(
    state: State<AppState>,
    table_id: i64,
    name: Option<String>,
    icon: Option<String>,
    order: Option<i32>,
) -> Result<Table, DadixError> {
    with_project(&state, |p| {
        p.update_table(table_id, name.as_deref(), icon.as_deref(), order)
    })
}

#[tauri::command]
fn dadix_set_project_name(state: State<AppState>, name: String) -> Result<(), DadixError> {
    with_project(&state, |p| p.set_project_name(&name))
}

#[tauri::command]
fn dadix_delete_table(state: State<AppState>, table_id: i64) -> Result<(), DadixError> {
    with_project(&state, |p| p.delete_table(table_id))
}

#[tauri::command]
fn dadix_delete_record(
    state: State<AppState>,
    table_id: i64,
    id: i64,
) -> Result<(), DadixError> {
    with_project(&state, |p| p.delete_record(table_id, id))
}

#[tauri::command]
fn dadix_create_view(
    state: State<AppState>,
    table_id: i64,
    name: String,
    type_name: String,
) -> Result<View, DadixError> {
    with_project(&state, |p| p.create_view(table_id, &name, &type_name))
}

#[tauri::command]
fn dadix_update_view(
    state: State<AppState>,
    view_id: i64,
    name: String,
    filter: Option<String>,
    sort: Option<String>,
) -> Result<View, DadixError> {
    with_project(&state, |p| {
        p.update_view(view_id, &name, filter.as_deref(), sort.as_deref())
    })
}

#[tauri::command]
fn dadix_delete_view(state: State<AppState>, view_id: i64) -> Result<(), DadixError> {
    with_project(&state, |p| p.delete_view(view_id))
}

#[tauri::command]
fn dadix_list_sources(state: State<AppState>) -> Result<Vec<Source>, DadixError> {
    with_project(&state, |p| p.list_sources())
}

#[tauri::command]
fn dadix_list_source_tables(
    state: State<AppState>,
    source_id: i64,
) -> Result<Vec<SourceTable>, DadixError> {
    with_project(&state, |p| p.list_source_tables(source_id))
}

#[tauri::command]
fn dadix_list_jobs(state: State<AppState>) -> Result<Vec<Job>, DadixError> {
    with_project(&state, |p| p.list_jobs())
}

#[tauri::command]
fn dadix_list_settings(state: State<AppState>) -> Result<Vec<Setting>, DadixError> {
    with_project(&state, |p| p.list_settings())
}

#[tauri::command]
fn dadix_get_setting(state: State<AppState>, key: String) -> Result<Option<String>, DadixError> {
    with_project(&state, |p| p.get_setting(&key))
}

#[tauri::command]
fn dadix_set_setting(state: State<AppState>, key: String, value: String) -> Result<Setting, DadixError> {
    with_project(&state, |p| p.set_setting(&key, &value))
}

#[tauri::command]
fn dadix_update_grid_view_column(
    state: State<AppState>,
    id: i64,
    name: Option<String>,
    size: Option<i32>,
    order: Option<i32>,
    is_visible: Option<bool>,
    content_align: Option<String>,
) -> Result<GridViewColumn, DadixError> {
    with_project(&state, |p| {
        p.update_grid_view_column(
            id,
            name.as_deref(),
            size,
            order,
            is_visible,
            content_align.as_deref(),
        )
    })
}

#[tauri::command]
fn dadix_view_buttons(state: State<AppState>, view_id: i64) -> Result<Vec<ViewButton>, DadixError> {
    with_project(&state, |p| p.view_buttons(view_id))
}

#[tauri::command]
fn dadix_create_view_button(
    state: State<AppState>,
    view_id: i64,
    label: String,
    order: Option<i32>,
) -> Result<ViewButton, DadixError> {
    with_project(&state, |p| p.create_view_button(view_id, &label, order))
}

#[tauri::command]
fn dadix_update_view_button(
    state: State<AppState>,
    id: i64,
    label: Option<String>,
    order: Option<i32>,
) -> Result<ViewButton, DadixError> {
    with_project(&state, |p| p.update_view_button(id, label.as_deref(), order))
}

#[tauri::command]
fn dadix_delete_view_button(state: State<AppState>, id: i64) -> Result<(), DadixError> {
    with_project(&state, |p| p.delete_view_button(id))
}

#[tauri::command]
fn dadix_resolve_source_path(state: State<AppState>, source_id: i64) -> Result<String, DadixError> {
    with_project(&state, |p| {
        let sources = p.list_sources()?;
        let source = sources
            .into_iter()
            .find(|s| s.id == source_id)
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "source not found"))?;
        let resolved = resolve_source_path(p.path(), &source)?;
        Ok(resolved.path.to_string_lossy().into_owned())
    })
}

#[tauri::command]
fn dadix_list_missing_sources(state: State<AppState>) -> Result<Vec<MissingSource>, DadixError> {
    with_project(&state, |p| p.missing_sources())
}

#[tauri::command]
fn dadix_relink_source(
    state: State<AppState>,
    source_id: i64,
    new_path: String,
    prefer_relative: bool,
) -> Result<Source, DadixError> {
    with_project(&state, |p| {
        p.relink_source(source_id, new_path, prefer_relative)
    })
}

#[tauri::command]
fn dadix_list_recovery(path: String) -> Result<Vec<RecoveryArtifact>, DadixError> {
    Ok(list_project_recovery(PathBuf::from(path)))
}

#[tauri::command]
fn dadix_restore_backup(path: String) -> Result<(), DadixError> {
    restore_project_backup(PathBuf::from(path))
}

#[tauri::command]
async fn dadix_execute_query(
    state: State<'_, AppState>,
    request: QueryRequest,
) -> Result<QueryResult, DadixError> {
    let project = snapshot_project(&state)?;
    tauri::async_runtime::spawn_blocking(move || project.execute_query(request))
        .await
        .map_err(|e| DadixError::new(ErrorCode::QueryEngineError, e.to_string()))?
}

#[tauri::command]
async fn dadix_cancel_query(
    state: State<'_, AppState>,
    query_id: String,
) -> Result<(), DadixError> {
    let project = snapshot_project(&state)?;
    project.cancel_query(&QueryId(query_id))
}

#[tauri::command]
fn dadix_explain_query(
    state: State<AppState>,
    sql: String,
    parameters: Option<Vec<QueryParam>>,
) -> Result<QueryResult, DadixError> {
    with_project(&state, |p| {
        p.explain_query(&sql, parameters.unwrap_or_default())
    })
}

#[tauri::command]
fn dadix_query_status(
    state: State<AppState>,
    query_id: String,
) -> Result<Option<QueryStatus>, DadixError> {
    with_project(&state, |p| p.query_status(&QueryId(query_id)))
}

#[tauri::command]
fn dadix_link_file(
    state: State<AppState>,
    path: String,
    prefer_relative: bool,
    format: Option<String>,
) -> Result<Source, DadixError> {
    let hint = format
        .as_deref()
        .and_then(FileFormat::from_type_name);
    with_project(&state, |p| p.link_file_with_format(path, prefer_relative, hint))
}

#[tauri::command]
fn dadix_list_bound_sources(state: State<AppState>) -> Result<Vec<BoundFileSource>, DadixError> {
    with_project(&state, |p| p.list_bound_sources())
}

#[tauri::command]
async fn dadix_preview_source(
    state: State<'_, AppState>,
    source_id: i64,
    offset: Option<u64>,
    limit: Option<u32>,
) -> Result<QueryResult, DadixError> {
    let project = snapshot_project(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        project.preview_source(source_id, offset.unwrap_or(0), limit)
    })
    .await
    .map_err(|e| DadixError::new(ErrorCode::QueryEngineError, e.to_string()))?
}

#[tauri::command]
fn dadix_describe_source(
    state: State<AppState>,
    source_id: i64,
) -> Result<QueryResult, DadixError> {
    with_project(&state, |p| p.describe_source(source_id))
}

#[tauri::command]
fn dadix_write_file_source(
    state: State<AppState>,
    source_id: i64,
    columns: Vec<String>,
    rows: Vec<serde_json::Map<String, serde_json::Value>>,
) -> Result<(), DadixError> {
    with_project(&state, |p| p.write_file_source(source_id, &columns, &rows))
}

#[tauri::command]
fn dadix_store_credential(
    state: State<AppState>,
    secret: DatabaseSecret,
) -> Result<String, DadixError> {
    with_project(&state, |p| p.store_credential(&secret))
}

#[tauri::command]
fn dadix_credential_exists(state: State<AppState>, id: String) -> Result<bool, DadixError> {
    with_project(&state, |p| p.credential_exists(&id))
}

#[tauri::command]
fn dadix_delete_credential(state: State<AppState>, id: String) -> Result<(), DadixError> {
    with_project(&state, |p| p.delete_stored_credential(&id))
}

#[tauri::command]
fn dadix_add_database_source(
    state: State<AppState>,
    spec: NewDatabaseSource,
) -> Result<Source, DadixError> {
    with_project(&state, |p| p.add_database_source(spec))
}

#[tauri::command]
async fn dadix_execute_source_query(
    state: State<'_, AppState>,
    source_id: i64,
    request: QueryRequest,
) -> Result<QueryResult, DadixError> {
    let project = snapshot_project(&state)?;
    tauri::async_runtime::spawn_blocking(move || project.execute_source_query(source_id, request))
        .await
        .map_err(|e| DadixError::new(ErrorCode::QueryEngineError, e.to_string()))?
}

#[tauri::command]
fn dadix_test_source_connection(
    state: State<AppState>,
    source_id: i64,
) -> Result<(), DadixError> {
    with_project(&state, |p| p.test_source_connection(source_id))
}

#[tauri::command]
fn dadix_list_remote_databases(
    state: State<AppState>,
    source_id: i64,
) -> Result<Vec<String>, DadixError> {
    with_project(&state, |p| p.list_remote_databases(source_id))
}

#[tauri::command]
fn dadix_list_remote_schemas(
    state: State<AppState>,
    source_id: i64,
) -> Result<Vec<String>, DadixError> {
    with_project(&state, |p| p.list_remote_schemas(source_id))
}

#[tauri::command]
fn dadix_cancel_source_query(
    state: State<AppState>,
    source_id: i64,
    query_id: String,
) -> Result<(), DadixError> {
    with_project(&state, |p| {
        p.cancel_source_query(source_id, &QueryId(query_id))
    })
}

#[tauri::command]
fn dadix_list_remote_tables(
    state: State<AppState>,
    source_id: i64,
) -> Result<Vec<RemoteTable>, DadixError> {
    with_project(&state, |p| p.list_remote_tables(source_id))
}

#[tauri::command]
fn dadix_list_remote_columns(
    state: State<AppState>,
    source_id: i64,
    table: String,
) -> Result<Vec<RemoteColumn>, DadixError> {
    with_project(&state, |p| p.list_remote_columns(source_id, &table))
}

fn ui_script_path() -> PathBuf {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("Dadix").join(".dadix-ui-script.json")
}

fn ui_result_path() -> PathBuf {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("Dadix").join(".dadix-ui-result.json")
}

#[tauri::command]
fn dadix_poll_ui_script() -> Option<String> {
    let path = ui_script_path();
    let text = std::fs::read_to_string(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    Some(text)
}

#[tauri::command]
fn dadix_write_ui_result(payload: String) -> Result<(), DadixError> {
    std::fs::write(ui_result_path(), payload).map_err(|e| {
        DadixError::new(ErrorCode::Io, e.to_string())
    })
}

/// Native overlay lights sit in AppKit's thin titlebar (~28px) and get
/// recentered on every live-resize tick. Pinning them to the 44px CSS bar
/// fights that layout and they bounce. Hide the system buttons; the shell
/// draws lights inside the CSS titlebar so resize cannot move them.
#[cfg(target_os = "macos")]
fn hide_macos_traffic_lights(window: &tauri::WebviewWindow) {
    let Ok(ptr) = window.ns_window() else {
        return;
    };
    if ptr.is_null() {
        return;
    }
    unsafe {
        use objc2::msg_send;
        use objc2::runtime::AnyObject;

        let win = ptr as *mut AnyObject;
        // Hide only the three system buttons. Never hide their superview —
        // on Overlay titlebars that view can be the whole window chrome.
        for button_id in [0usize, 1, 2] {
            let button: *mut AnyObject = msg_send![win, standardWindowButton: button_id];
            if !button.is_null() {
                let _: () = msg_send![button, setHidden: true];
            }
        }
    }
}

#[tauri::command]
fn dadix_pin_traffic_lights(window: tauri::WebviewWindow) -> Result<(), DadixError> {
    #[cfg(target_os = "macos")]
    hide_macos_traffic_lights(&window);
    let _ = window;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pending = first_dadix_from_args();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new(pending))
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(any(windows, target_os = "linux"))]
                {
                    let _ = window.set_decorations(false);
                }
                #[cfg(target_os = "macos")]
                {
                    hide_macos_traffic_lights(&window);
                }
                let url = window.url().map(|u| u.to_string()).unwrap_or_default();
                let _ = std::fs::write(
                    PathBuf::from("/Users/gabriel/Dadix/.dadix-webview-debug.txt"),
                    format!("url={url}\n"),
                );
                let probe = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(1500));
                    let title = probe.title().unwrap_or_default();
                    let url = probe.url().map(|u| u.to_string()).unwrap_or_default();
                    let _ = std::fs::write(
                        PathBuf::from("/Users/gabriel/Dadix/.dadix-webview-debug.txt"),
                        format!("url={url}\ntitle={title}\n"),
                    );
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dadix_take_pending_open_path,
            dadix_create_project,
            dadix_create_named_project,
            dadix_open_project,
            dadix_open_demo_project,
            dadix_close_project,
            dadix_save_project,
            dadix_validate_project,
            dadix_get_project_meta,
            dadix_get_tables,
            dadix_get_table,
            dadix_get_columns,
            dadix_get_views,
            dadix_get_view,
            dadix_get_grid_view_columns,
            dadix_get_records,
            dadix_get_record_count,
            dadix_query_records,
            dadix_create_table,
            dadix_insert_record,
            dadix_update_record,
            dadix_delete_record,
            dadix_create_column,
            dadix_update_column,
            dadix_delete_column,
            dadix_rename_table,
            dadix_update_table,
            dadix_set_project_name,
            dadix_delete_table,
            dadix_create_view,
            dadix_update_view,
            dadix_delete_view,
            dadix_list_sources,
            dadix_list_source_tables,
            dadix_list_jobs,
            dadix_list_settings,
            dadix_get_setting,
            dadix_set_setting,
            dadix_update_grid_view_column,
            dadix_view_buttons,
            dadix_create_view_button,
            dadix_update_view_button,
            dadix_delete_view_button,
            dadix_resolve_source_path,
            dadix_list_missing_sources,
            dadix_relink_source,
            dadix_list_recovery,
            dadix_restore_backup,
            dadix_execute_query,
            dadix_cancel_query,
            dadix_explain_query,
            dadix_query_status,
            dadix_link_file,
            dadix_list_bound_sources,
            dadix_preview_source,
            dadix_describe_source,
            dadix_write_file_source,
            dadix_store_credential,
            dadix_credential_exists,
            dadix_delete_credential,
            dadix_add_database_source,
            dadix_test_source_connection,
            dadix_execute_source_query,
            dadix_cancel_source_query,
            dadix_list_remote_databases,
            dadix_list_remote_schemas,
            dadix_list_remote_tables,
            dadix_list_remote_columns,
            dadix_pin_traffic_lights,
            dadix_poll_ui_script,
            dadix_write_ui_result,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::WindowEvent {
                label,
                event: win_event,
                ..
            } = &event
            {
                let _ = win_event;
                if let Some(window) = app.get_webview_window(label) {
                    hide_macos_traffic_lights(&window);
                }
            }
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        queue_open_path(app, path);
                    }
                }
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios")))]
            {
                let _ = (app, event);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn recognizes_dadix_extension() {
        assert!(dadix_core::is_dadix_path(Path::new(
            "/tmp/Controlling.dadix"
        )));
        assert!(dadix_core::is_dadix_path(Path::new(
            "/tmp/Controlling.DADIX"
        )));
        assert!(!dadix_core::is_dadix_path(Path::new("/tmp/notes.txt")));
    }

    #[test]
    fn parses_plain_and_file_url_args() {
        let plain = path_from_launch_arg("/tmp/Controlling.dadix").unwrap();
        assert_eq!(plain, PathBuf::from("/tmp/Controlling.dadix"));
        #[cfg(unix)]
        {
            let url = path_from_launch_arg("file:///tmp/Controlling.dadix").unwrap();
            assert_eq!(url, PathBuf::from("/tmp/Controlling.dadix"));
        }
        assert!(path_from_launch_arg("--flag").is_none());
        assert!(path_from_launch_arg("/tmp/notes.txt").is_none());
    }
}
