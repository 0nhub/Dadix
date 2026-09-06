use crate::atomic::{backup_project, bak_path, tmp_path};
use crate::domain::{AccessMode, CredentialRef, NewJob, NewSource, NewSourceTable, SourceKind};
use crate::error::ErrorCode;
use crate::paths::{resolve_source_path, PathMode};
use crate::project::{
    close_project, create_project, list_project_recovery, migrate_project, open_project,
    open_project_with, peek_format_version, restore_project_backup, save_project, validate_project,
};
use crate::schema::FORMAT_VERSION;
use rusqlite::Connection;
use std::fs;
use std::path::Path;

fn write_v1_project(path: &Path) {
    let conn = Connection::open(path).unwrap();
    conn.execute_batch(
        r#"
        CREATE TABLE project_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            format_version INTEGER NOT NULL
        );
        INSERT INTO project_meta (id, name, created_at, format_version)
        VALUES (1, 'Legacy', '2026-01-01T00:00:00Z', 1);
        "#,
    )
    .unwrap();
}

fn linked_csv(name: &str, uri: &str) -> NewSource {
    NewSource {
        name: name.into(),
        type_name: "csv".into(),
        kind: SourceKind::LinkedFile,
        path_mode: PathMode::Relative,
        uri: Some(uri.into()),
        options: None,
        credential: None,
    }
}

#[test]
fn create_save_close_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Controlling.dadix");
    let handle = create_project(&path).unwrap();
    let project = handle.meta().unwrap();
    assert_eq!(project.name, "Controlling");
    assert_eq!(project.format_version, FORMAT_VERSION);
    assert!(!project.project_id.is_empty());
    assert!(!project.updated_at.is_empty());
    handle.create_table("Umsatz").unwrap();
    save_project(&handle).unwrap();
    assert!(!tmp_path(&path).exists());
    close_project(handle).unwrap();

    let reopened = open_project(&path).unwrap();
    assert_eq!(reopened.meta().unwrap().name, "Controlling");
    assert_eq!(reopened.tables().unwrap().len(), 1);
    close_project(reopened).unwrap();
}

#[test]
fn migrate_v1_through_current() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy.dadix");
    write_v1_project(&path);
    assert_eq!(peek_format_version(&path).unwrap(), Some(1));

    let project = migrate_project(&path).unwrap();
    assert_eq!(project.format_version, FORMAT_VERSION);
    assert!(!project.project_id.is_empty());
    assert!(bak_path(&path).exists());
}

#[test]
fn detect_invalid_and_corrupt_files() {
    let dir = tempfile::tempdir().unwrap();

    let notes = dir.path().join("notes.txt");
    fs::write(&notes, "hello").unwrap();
    assert_eq!(
        open_project(&notes).unwrap_err().code,
        ErrorCode::InvalidPath
    );

    let garbage = dir.path().join("broken.dadix");
    fs::write(&garbage, "not sqlite").unwrap();
    assert_eq!(
        open_project(&garbage).unwrap_err().code,
        ErrorCode::InvalidProject
    );
    let report = validate_project(&garbage).unwrap();
    assert!(!report.ok);
    assert_eq!(report.issues[0].code, ErrorCode::InvalidProject);
}

#[test]
fn relative_paths_follow_project_move() {
    let dir = tempfile::tempdir().unwrap();
    let folder_a = dir.path().join("a");
    let folder_b = dir.path().join("b");
    fs::create_dir_all(folder_a.join("data")).unwrap();
    fs::create_dir_all(folder_b.join("data")).unwrap();
    fs::write(folder_a.join("data/umsatz.csv"), "a,b\n1,2\n").unwrap();

    let project_a = folder_a.join("analyse.dadix");
    let handle = create_project(&project_a).unwrap();
    let source = handle
        .add_source(linked_csv("Umsatz", "./data/umsatz.csv"))
        .unwrap();
    assert_eq!(source.uri.as_deref(), Some("./data/umsatz.csv"));
    close_project(handle).unwrap();

    let project_b = folder_b.join("analyse.dadix");
    fs::rename(&project_a, &project_b).unwrap();
    fs::rename(
        folder_a.join("data/umsatz.csv"),
        folder_b.join("data/umsatz.csv"),
    )
    .unwrap();

    let handle = open_project(&project_b).unwrap();
    let source = handle.list_sources().unwrap().pop().unwrap();
    let resolved = resolve_source_path(handle.path(), &source).unwrap();
    assert_eq!(resolved.mode, PathMode::Relative);
    assert_eq!(resolved.path, folder_b.join("data/umsatz.csv"));
    assert!(handle.missing_sources().unwrap().is_empty());
    close_project(handle).unwrap();
}

#[test]
fn missing_sources_can_be_relinked() {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("analyse.dadix");
    let handle = create_project(&project).unwrap();
    let first = handle
        .add_source(linked_csv("Umsatz", "./data/umsatz.csv"))
        .unwrap();
    let second = handle
        .add_source(linked_csv("Kosten", "./data/kosten.csv"))
        .unwrap();

    let missing = handle.missing_sources().unwrap();
    assert_eq!(missing.len(), 2);
    assert!(missing
        .iter()
        .any(|m| m.expected_path.contains("umsatz.csv")));

    fs::create_dir_all(dir.path().join("data")).unwrap();
    let new_umsatz = dir.path().join("data/umsatz.csv");
    fs::write(&new_umsatz, "x").unwrap();

    let updated = handle.relink_source(first.id, &new_umsatz, true).unwrap();
    assert_eq!(updated.id, first.id);
    assert_eq!(updated.uri.as_deref(), Some("./data/umsatz.csv"));
    assert_eq!(updated.path_mode, PathMode::Relative);

    let still_missing = handle.missing_sources().unwrap();
    assert_eq!(still_missing.len(), 1);
    assert_eq!(still_missing[0].source_id, second.id);
    close_project(handle).unwrap();
}

#[test]
fn rejects_secrets_in_the_project() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("safe.dadix");
    let handle = create_project(&path).unwrap();

    let err = handle.set_setting("password", "hunter2").unwrap_err();
    assert_eq!(err.code, ErrorCode::SecretInProject);
    close_project(handle).unwrap();

    let conn = Connection::open(&path).unwrap();
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('api_key', 'leaked')",
        [],
    )
    .unwrap();
    drop(conn);

    let report = validate_project(&path).unwrap();
    assert!(!report.ok);
    assert!(report
        .issues
        .iter()
        .any(|i| i.code == ErrorCode::SecretInProject));
}

#[test]
fn persists_sources_jobs_and_settings() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("persist.dadix");
    fs::create_dir_all(dir.path().join("Daten")).unwrap();
    fs::write(dir.path().join("Daten/Kosten.csv"), "a\n").unwrap();
    let handle = create_project(&path).unwrap();

    let source = handle
        .add_source(NewSource {
            name: "Kosten".into(),
            type_name: "csv".into(),
            kind: SourceKind::LinkedFile,
            path_mode: PathMode::Relative,
            uri: Some("Daten/Kosten.csv".into()),
            options: None,
            credential: Some(CredentialRef {
                id: "cred-1".into(),
            }),
        })
        .unwrap();
    assert_eq!(source.uri.as_deref(), Some("./Daten/Kosten.csv"));
    handle
        .add_source_table(NewSourceTable {
            source_id: source.id,
            logical_name: "kosten".into(),
            remote_name: Some("sheet1".into()),
            options: None,
        })
        .unwrap();
    handle
        .add_job(NewJob {
            name: "nightly".into(),
            enabled: true,
            schedule: Some("0 2 * * *".into()),
            payload: Some(r#"{"op":"refresh"}"#.into()),
        })
        .unwrap();
    handle.set_setting("theme", "dark").unwrap();
    save_project(&handle).unwrap();
    close_project(handle).unwrap();

    let handle = open_project(&path).unwrap();
    let sources = handle.list_sources().unwrap();
    assert_eq!(sources[0].kind, SourceKind::LinkedFile);
    assert_eq!(sources[0].uri.as_deref(), Some("./Daten/Kosten.csv"));
    assert_eq!(
        sources[0].credential.as_ref().map(|c| c.id.as_str()),
        Some("cred-1")
    );
    assert_eq!(handle.list_source_tables(sources[0].id).unwrap().len(), 1);
    assert_eq!(
        handle.get_setting("theme").unwrap().as_deref(),
        Some("dark")
    );
    assert!(handle.validate().unwrap().ok);
    close_project(handle).unwrap();
}

#[test]
fn rejects_newer_unsupported_format_without_changing_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("future.dadix");
    let handle = create_project(&path).unwrap();
    close_project(handle).unwrap();

    let conn = Connection::open(&path).unwrap();
    conn.execute(
        "UPDATE project_meta SET format_version = 5, minimum_reader_version = 5 WHERE id = 1",
        [],
    )
    .unwrap();
    drop(conn);

    let err = open_project(&path).unwrap_err();
    assert_eq!(err.code, ErrorCode::UnsupportedNewerFormat);
    assert_eq!(peek_format_version(&path).unwrap(), Some(5));

    let report = validate_project(&path).unwrap();
    assert!(!report.ok);
    assert!(report
        .issues
        .iter()
        .any(|i| i.code == ErrorCode::UnsupportedNewerFormat));
}

#[test]
fn parallel_write_is_blocked() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("locked.dadix");
    let first = create_project(&path).unwrap();
    let err = open_project(&path).unwrap_err();
    assert_eq!(err.code, ErrorCode::ProjectLocked);
    let err = open_project_with(&path, AccessMode::ReadOnly).unwrap_err();
    assert_eq!(err.code, ErrorCode::ProjectLocked);
    close_project(first).unwrap();
    let second = open_project(&path).unwrap();
    close_project(second).unwrap();
}

#[test]
fn atomic_save_leaves_no_tmp_and_keeps_file_valid() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("atomic.dadix");
    let handle = create_project(&path).unwrap();
    handle.create_table("A").unwrap();
    save_project(&handle).unwrap();
    assert!(!tmp_path(&path).exists());
    close_project(handle).unwrap();
    assert!(validate_project(&path).unwrap().ok);
}

#[test]
fn incomplete_tmp_is_detected_and_backup_can_restore() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("recover.dadix");
    let handle = create_project(&path).unwrap();
    close_project(handle).unwrap();

    backup_project(&path).unwrap();
    fs::write(tmp_path(&path), "partial").unwrap();
    let artifacts = list_project_recovery(&path);
    assert!(artifacts.iter().any(|a| a.path.ends_with(".tmp")));
    let report = validate_project(&path).unwrap();
    assert!(report
        .issues
        .iter()
        .any(|i| i.code == ErrorCode::IncompleteSave));

    fs::write(&path, "destroyed").unwrap();
    restore_project_backup(&path).unwrap();
    let handle = open_project(&path).unwrap();
    assert_eq!(handle.meta().unwrap().format_version, FORMAT_VERSION);
    close_project(handle).unwrap();
}

#[test]
fn demo_project_has_tables_and_rows() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Dadix-Test.dadix");
    let handle = crate::open_or_create_demo_at(&path).unwrap();
    let tables = handle.tables().unwrap();
    assert_eq!(tables.len(), 2);
    assert_eq!(tables[0].name, "Kunden");
    assert_eq!(tables[1].name, "Bestellungen");
    assert_eq!(handle.record_count(tables[0].id).unwrap(), 3);
    assert_eq!(handle.columns(tables[0].id).unwrap().len(), 3);
    close_project(handle).unwrap();

    let again = crate::open_or_create_demo_at(&path).unwrap();
    assert_eq!(again.tables().unwrap().len(), 2);
    close_project(again).unwrap();
}

#[test]
fn web_demo_matches_existing_dadix_tables() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Demo Projekt.dadix");
    let handle = crate::open_or_create_web_demo_at(&path).unwrap();
    let tables = handle.tables().unwrap();
    assert_eq!(tables.len(), 4);
    assert_eq!(tables[0].name, "Demo Tabelle");
    assert_eq!(tables[1].name, "Test-Liste");
    assert_eq!(tables[2].name, "Breite Demo");
    assert_eq!(tables[3].name, "AI Test");
    assert_eq!(handle.record_count(tables[0].id).unwrap(), 12);
    assert_eq!(handle.columns(tables[2].id).unwrap().len(), 15);
    close_project(handle).unwrap();
}

#[test]
fn created_table_view_and_record_survive_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Persistenz.dadix");
    let handle = crate::create_project(&path).unwrap();
    handle.set_project_name("Persistenz").unwrap();
    let table = handle.create_table("Neue Tabelle").unwrap();
    handle.create_column(table.id, "Titel", "TEXT", None).unwrap();
    handle.insert_record(table.id, serde_json::json!({ "Titel": "Zeile 1" })).unwrap();
    let view = handle.create_view(table.id, "Meine View", "gridView").unwrap();
    handle
        .update_view(view.id, "Meine View", Some(r#"[{"op":"eq"}]"#), Some(r#"[{"fieldId":1}]"#))
        .unwrap();
    crate::close_project(handle).unwrap();

    let again = crate::open_project(&path).unwrap();
    assert_eq!(again.meta().unwrap().name, "Persistenz");
    let tables = again.tables().unwrap();
    assert_eq!(tables.len(), 1);
    assert_eq!(tables[0].name, "Neue Tabelle");
    assert_eq!(again.record_count(tables[0].id).unwrap(), 1);
    let views = again.views(tables[0].id).unwrap();
    assert!(views.iter().any(|item| item.name == "Meine View"));
    assert!(views.iter().any(|item| item.name == "All entries"));
    crate::close_project(again).unwrap();
}

#[test]
fn record_serializes_column_fields_at_top_level() {
    let rec = crate::Record {
        id: 1,
        data: serde_json::json!({ "Name": "Müller GmbH", "Ort": "München" }),
    };
    let value = serde_json::to_value(&rec).unwrap();
    assert_eq!(value["id"], 1);
    assert_eq!(value["Name"], "Müller GmbH");
    assert_eq!(value["Ort"], "München");
    assert!(value.get("data").is_none());
}

#[test]
fn query_records_filters_and_sorts_in_core() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("filter.dadix");
    let handle = create_project(&path).unwrap();
    let table = handle.create_table("Kunden").unwrap();
    handle.create_column(table.id, "Name", "TEXT", None).unwrap();
    handle
        .create_column(table.id, "Ort", "TEXT", None)
        .unwrap();
    handle
        .insert_record(table.id, serde_json::json!({ "Name": "Müller", "Ort": "München" }))
        .unwrap();
    handle
        .insert_record(table.id, serde_json::json!({ "Name": "Schmidt", "Ort": "Hamburg" }))
        .unwrap();
    let columns = handle.columns(table.id).unwrap();
    let name_id = columns.iter().find(|c| c.name == "Name").unwrap().id;
    let filter = serde_json::json!([{
        "id": "f1",
        "operation": "like",
        "fieldId": name_id,
        "relation": "and",
        "value": "müll"
    }])
    .to_string();
    let page = handle
        .query_records(table.id, Some(&filter), None, None, 50, 0)
        .unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.records[0].data["Name"], "Müller");

    let sort = serde_json::json!([{ "fieldId": name_id, "direction": "DESC" }]).to_string();
    let sorted = handle
        .query_records(table.id, None, Some(&sort), None, 50, 0)
        .unwrap();
    assert_eq!(sorted.records[0].data["Name"], "Schmidt");

    let searched = handle
        .query_records(table.id, None, None, Some("hamburg"), 50, 0)
        .unwrap();
    assert_eq!(searched.total, 1);

    let express = handle
        .query_records(table.id, Some(r#"like(Name,"müll")"#), None, None, 50, 0)
        .unwrap();
    assert_eq!(express.total, 1);
    close_project(handle).unwrap();
}

#[test]
fn insert_and_update_record_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rows.dadix");
    let handle = create_project(&path).unwrap();
    let table = handle.create_table("Kunden").unwrap();
    handle.create_column(table.id, "Name", "TEXT", None).unwrap();
    let inserted = handle
        .insert_record(table.id, serde_json::json!({ "Name": "Alt" }))
        .unwrap();
    handle
        .update_record(table.id, inserted.id, serde_json::json!({ "Name": "Neu" }))
        .unwrap();
    let rows = handle.records(table.id, 10, 0).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].data["Name"], "Neu");
    close_project(handle).unwrap();
}

#[test]
fn update_column_renames_record_keys() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rename-col.dadix");
    let handle = create_project(&path).unwrap();
    let table = handle.create_table("Kunden").unwrap();
    let col = handle
        .create_column(table.id, "Name", "TEXT", None)
        .unwrap();
    handle
        .insert_record(table.id, serde_json::json!({ "Name": "Alt" }))
        .unwrap();
    handle
        .update_column(col.id, "Firma", "TEXT", None)
        .unwrap();
    let rows = handle.records(table.id, 10, 0).unwrap();
    assert!(rows[0].data.get("Name").is_none());
    assert_eq!(rows[0].data["Firma"], "Alt");
    handle.delete_record(table.id, rows[0].id).unwrap();
    assert_eq!(handle.record_count(table.id).unwrap(), 0);
    close_project(handle).unwrap();
}

#[test]
fn update_record_merges_partial_patch() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("merge.dadix");
    let handle = create_project(&path).unwrap();
    let table = handle.create_table("Kunden").unwrap();
    handle.create_column(table.id, "Name", "TEXT", None).unwrap();
    handle.create_column(table.id, "Ort", "TEXT", None).unwrap();
    let inserted = handle
        .insert_record(
            table.id,
            serde_json::json!({ "Name": "Müller", "Ort": "München" }),
        )
        .unwrap();
    handle
        .update_record(table.id, inserted.id, serde_json::json!({ "Ort": "Berlin" }))
        .unwrap();
    let rows = handle.records(table.id, 10, 0).unwrap();
    assert_eq!(rows[0].data["Name"], "Müller");
    assert_eq!(rows[0].data["Ort"], "Berlin");
    close_project(handle).unwrap();
}

#[test]
fn create_column_keeps_given_name_and_rejects_empty() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("field-name.dadix");
    let handle = create_project(&path).unwrap();
    let table = handle.create_table("Personen").unwrap();
    let col = handle
        .create_column(table.id, "Geburtsdatum", "DATE", None)
        .unwrap();
    assert_eq!(col.name, "Geburtsdatum");
    let listed = handle.columns(table.id).unwrap();
    assert_eq!(listed[0].name, "Geburtsdatum");
    let err = handle
        .create_column(table.id, "   ", "TEXT", None)
        .unwrap_err();
    assert_eq!(err.code, ErrorCode::Validation);
    handle
        .update_column(col.id, "", "DATE", None)
        .unwrap();
    let kept = handle.column(col.id).unwrap().unwrap();
    assert_eq!(kept.name, "Geburtsdatum");
    close_project(handle).unwrap();
}

#[test]
fn delete_table_removes_columns_views_and_records() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("delete-table.dadix");
    let handle = create_project(&path).unwrap();
    let table = handle.create_table("Weg").unwrap();
    handle
        .create_column(table.id, "Name", "TEXT", None)
        .unwrap();
    handle
        .insert_record(table.id, serde_json::json!({ "Name": "x" }))
        .unwrap();
    handle.delete_table(table.id).unwrap();
    assert!(handle.table(table.id).unwrap().is_none());
    assert!(handle.columns(table.id).unwrap().is_empty());
    assert!(handle.views(table.id).unwrap().is_empty());
    assert_eq!(handle.tables().unwrap().len(), 0);
    close_project(handle).unwrap();
}

#[test]
fn sequential_columns_keep_their_names() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("four-fields.dadix");
    let handle = create_project(&path).unwrap();
    let table = handle.create_table("Matrix").unwrap();
    let names = ["Vorname", "Nachname", "Alter", "Geburtsdatum"];
    for (index, name) in names.iter().enumerate() {
        let col = handle
            .create_column(table.id, name, "TEXT", None)
            .unwrap();
        assert_eq!(col.name, *name);
        let listed = handle.columns(table.id).unwrap();
        assert_eq!(listed.len(), index + 1);
        assert_eq!(listed[index].name, *name);
        assert_eq!(listed[0].name, "Vorname");
    }
    close_project(handle).unwrap();
}

#[test]
fn new_columns_appear_on_default_and_extra_views() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("grid-columns.dadix");
    let handle = create_project(&path).unwrap();
    let table = handle.create_table("Personen").unwrap();
    let default_view = handle.views(table.id).unwrap()[0].id;
    handle
        .create_column(table.id, "Vorname", "TEXT", None)
        .unwrap();
    handle
        .create_column(table.id, "Nachname", "TEXT", None)
        .unwrap();
    handle
        .create_column(table.id, "Alter", "INTEGER", None)
        .unwrap();
    handle
        .create_column(table.id, "Aktiv", "BOOLEAN", None)
        .unwrap();
    handle
        .create_column(table.id, "Geburtsdatum", "DATE", None)
        .unwrap();
    let extra = handle.create_view(table.id, "View2", "gridView").unwrap();
    let default_cols = handle.grid_view_columns(default_view).unwrap();
    let extra_cols = handle.grid_view_columns(extra.id).unwrap();
    for name in ["Vorname", "Nachname", "Alter", "Aktiv", "Geburtsdatum"] {
        assert!(
            default_cols.iter().any(|c| c.name.as_deref() == Some(name) && c.is_visible),
            "default view missing visible {name}: {default_cols:?}"
        );
        assert!(
            extra_cols.iter().any(|c| c.name.as_deref() == Some(name) && c.is_visible),
            "extra view missing visible {name}: {extra_cols:?}"
        );
    }
    close_project(handle).unwrap();
}
