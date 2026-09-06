//! Seed data that matches the existing Dadix web start project.

use crate::error::DadixResult;
use crate::project::{create_project, open_project, ProjectHandle};
use std::path::{Path, PathBuf};

/// Default location on this machine: `~/Dadix/demo/Dadix-Test.dadix`.
pub fn demo_project_path() -> PathBuf {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("Dadix").join("demo").join("Dadix-Test.dadix")
}

/// Existing 3020 start project: `~/Dadix/demo/Demo Projekt.dadix`.
pub fn web_demo_project_path() -> PathBuf {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("Dadix").join("demo").join("Demo Projekt.dadix")
}

/// Open the demo file, or create and seed it if it is missing or empty.
pub fn open_or_create_demo_project() -> DadixResult<ProjectHandle> {
    open_or_create_demo_at(demo_project_path())
}

pub fn open_or_create_demo_at(path: impl AsRef<Path>) -> DadixResult<ProjectHandle> {
    let path = path.as_ref();
    if path.exists() {
        let handle = open_project(path)?;
        if handle.tables()?.is_empty() {
            seed_demo(&handle)?;
        }
        return Ok(handle);
    }
    let handle = create_project(path)?;
    seed_demo(&handle)?;
    Ok(handle)
}

pub fn seed_demo(handle: &ProjectHandle) -> DadixResult<()> {
    let kunden = handle.create_table("Kunden")?;
    handle.create_column(kunden.id, "Name", "TEXT", None)?;
    handle.create_column(kunden.id, "Ort", "TEXT", None)?;
    let status_options = serde_json::json!({
        "choiceMode": "single",
        "options": [
            {"id": "aktiv", "value": "Aktiv", "color": "#16a34a", "order": 0},
            {"id": "entwurf", "value": "Entwurf", "color": "#ca8a04", "order": 1}
        ]
    })
    .to_string();
    handle.create_column(kunden.id, "Status", "CHOICE", Some(&status_options))?;
    handle.insert_record(
        kunden.id,
        serde_json::json!({
            "Name": "Müller GmbH",
            "Ort": "München",
            "Status": "Aktiv"
        }),
    )?;
    handle.insert_record(
        kunden.id,
        serde_json::json!({
            "Name": "Schmidt & Partner",
            "Ort": "Hamburg",
            "Status": "Aktiv"
        }),
    )?;
    handle.insert_record(
        kunden.id,
        serde_json::json!({
            "Name": "Klinik Nord",
            "Ort": "Berlin",
            "Status": "Entwurf"
        }),
    )?;

    let bestellungen = handle.create_table("Bestellungen")?;
    handle.create_column(bestellungen.id, "Nummer", "TEXT", None)?;
    handle.create_column(bestellungen.id, "Kunde", "TEXT", None)?;
    handle.create_column(bestellungen.id, "Betrag", "INTEGER", None)?;
    handle.create_column(bestellungen.id, "Datum", "DATE", None)?;
    handle.insert_record(
        bestellungen.id,
        serde_json::json!({
            "Nummer": "B-1001",
            "Kunde": "Müller GmbH",
            "Betrag": 1280.50,
            "Datum": "2026-08-12"
        }),
    )?;
    handle.insert_record(
        bestellungen.id,
        serde_json::json!({
            "Nummer": "B-1002",
            "Kunde": "Schmidt & Partner",
            "Betrag": 640.00,
            "Datum": "2026-08-28"
        }),
    )?;
    handle.insert_record(
        bestellungen.id,
        serde_json::json!({
            "Nummer": "B-1003",
            "Kunde": "Klinik Nord",
            "Betrag": 2190.00,
            "Datum": "2026-09-02"
        }),
    )?;
    Ok(())
}

pub fn open_or_create_web_demo_project() -> DadixResult<ProjectHandle> {
    open_or_create_web_demo_at(web_demo_project_path())
}

pub fn open_or_create_web_demo_at(path: impl AsRef<Path>) -> DadixResult<ProjectHandle> {
    let path = path.as_ref();
    if path.exists() {
        let handle = open_project(path)?;
        if handle.tables()?.is_empty() {
            seed_web_dadix(&handle)?;
        }
        return Ok(handle);
    }
    let handle = create_project(path)?;
    seed_web_dadix(&handle)?;
    Ok(handle)
}

fn choice(options: &[(&str, &str)]) -> String {
    let items: Vec<serde_json::Value> = options
        .iter()
        .enumerate()
        .map(|(index, (value, color))| {
            serde_json::json!({
                "id": index + 1,
                "value": value,
                "color": color,
                "order": index
            })
        })
        .collect();
    serde_json::json!({
        "choiceMode": "single",
        "options": items
    })
    .to_string()
}

fn text_options(size: i32) -> String {
    serde_json::json!({ "size": size, "isVisible": true, "contentAlign": "left", "action": null })
        .to_string()
}

/// Tables and rows from `app/src/lib/dev-demo-data.ts` — the existing Dadix start project.
pub fn seed_web_dadix(handle: &ProjectHandle) -> DadixResult<()> {
    let status = choice(&[
        ("Offen", "#22c55e"),
        ("In Arbeit", "#eab308"),
        ("Erledigt", "#3b82f6"),
    ]);
    let prio = choice(&[
        ("Niedrig", "#6b7280"),
        ("Mittel", "#eab308"),
        ("Hoch", "#f97316"),
    ]);
    let kategorie = choice(&[
        ("Bug", "#ef4444"),
        ("Feature", "#22c55e"),
        ("Dokumentation", "#3b82f6"),
    ]);
    let typ = choice(&[
        ("Aufgabe", "#3b82f6"),
        ("Bug", "#ef4444"),
        ("Feature", "#22c55e"),
    ]);
    let land = choice(&[
        ("Deutschland", "#22c55e"),
        ("Frankreich", "#3b82f6"),
        ("USA", "#eab308"),
    ]);

    let demo = handle.create_table("Demo Tabelle")?;
    handle.update_table(demo.id, None, Some("Table"), None)?;
    handle.create_column(demo.id, "Name", "TEXT", Some(&text_options(255)))?;
    handle.create_column(demo.id, "Status", "CHOICE", Some(&status))?;
    handle.create_column(demo.id, "Notizen", "TEXT", Some(&text_options(1000)))?;
    for row in [
        serde_json::json!({"Name":"Design-Review abschließen","Status":"Offen","Notizen":"UI-Mockups für die neue Ansicht prüfen und Feedback geben."}),
        serde_json::json!({"Name":"API-Dokumentation aktualisieren","Status":"In Arbeit","Notizen":"Endpoints für Projekt und Tabellen ergänzen."}),
        serde_json::json!({"Name":"Login-Flow testen","Status":"Erledigt","Notizen":"Test-Account und Cookie-Handling verifiziert."}),
        serde_json::json!({"Name":"Datenbank-Migration vorbereiten","Status":"Offen","Notizen":"Schema-Änderungen für neue Spalte „Priorität“ planen."}),
        serde_json::json!({"Name":"Fehlerbehandlung verbessern","Status":"In Arbeit","Notizen":"Toast-Meldungen und Fallbacks bei API-Fehlern einbauen."}),
        serde_json::json!({"Name":"Demo-Daten für Localhost","Status":"Erledigt","Notizen":"Vollständiges Demo-Projekt mit Beispieldatensätzen angelegt."}),
        serde_json::json!({"Name":"Performance-Check Grid-View","Status":"Offen","Notizen":"Rendering bei vielen Zeilen prüfen, ggf. virtualisieren."}),
        serde_json::json!({"Name":"Export nach CSV","Status":"Offen","Notizen":"Funktion zum Export der aktuellen Tabelle/Filterung."}),
        serde_json::json!({"Name":"Benachrichtigungen einrichten","Status":"In Arbeit","Notizen":"E-Mail-Hinweise bei Einladungen und Änderungen."}),
        serde_json::json!({"Name":"Rollen und Rechte prüfen","Status":"Erledigt","Notizen":"Owner/Admin/Editor/Viewer für alle Routen getestet."}),
        serde_json::json!({"Name":"Mobile Ansicht optimieren","Status":"Offen","Notizen":"Sidebar und Tabellen auf kleinen Screens anpassen."}),
        serde_json::json!({"Name":"Backup-Strategie dokumentieren","Status":"Offen","Notizen":"Anleitung für DB-Backup und Wiederherstellung."}),
    ] {
        handle.insert_record(demo.id, row)?;
    }
    if let Some(view) = handle.views(demo.id)?.into_iter().next() {
        handle.set_setting(&format!("view_icon_{}", view.id), "LayoutGrid")?;
    }

    let liste = handle.create_table("Test-Liste")?;
    handle.update_table(liste.id, None, Some("Tags"), None)?;
    handle.create_column(liste.id, "Titel", "TEXT", Some(&text_options(255)))?;
    handle.create_column(liste.id, "Kategorie", "CHOICE", Some(&kategorie))?;
    handle.create_column(liste.id, "Priorität", "CHOICE", Some(&prio))?;
    for row in [
        serde_json::json!({"Titel":"Login-Button reagiert nicht","Kategorie":"Bug","Priorität":"Hoch"}),
        serde_json::json!({"Titel":"Dark Mode hinzufügen","Kategorie":"Feature","Priorität":"Mittel"}),
        serde_json::json!({"Titel":"API-Readme aktualisieren","Kategorie":"Dokumentation","Priorität":"Niedrig"}),
        serde_json::json!({"Titel":"Validierung der E-Mail-Adresse","Kategorie":"Bug","Priorität":"Mittel"}),
        serde_json::json!({"Titel":"Export als PDF","Kategorie":"Feature","Priorität":"Niedrig"}),
    ] {
        handle.insert_record(liste.id, row)?;
    }
    if let Some(view) = handle.views(liste.id)?.into_iter().next() {
        handle.set_setting(&format!("view_icon_{}", view.id), "LayoutGrid")?;
    }

    let breit = handle.create_table("Breite Demo")?;
    handle.update_table(breit.id, None, Some("LayoutGrid"), None)?;
    handle.create_column(breit.id, "Name", "TEXT", Some(&text_options(200)))?;
    handle.create_column(breit.id, "Status", "CHOICE", Some(&status))?;
    handle.create_column(breit.id, "Notizen", "TEXT", Some(&text_options(220)))?;
    handle.create_column(breit.id, "Datum", "DATE", None)?;
    handle.create_column(breit.id, "Priorität", "CHOICE", Some(&prio))?;
    handle.create_column(breit.id, "Verantwortlich", "TEXT", Some(&text_options(180)))?;
    handle.create_column(breit.id, "Fortschritt", "INTEGER", None)?;
    handle.create_column(breit.id, "Typ", "CHOICE", Some(&typ))?;
    handle.create_column(breit.id, "Quelle", "TEXT", Some(&text_options(160)))?;
    handle.create_column(breit.id, "Bemerkung", "TEXT", Some(&text_options(200)))?;
    handle.create_column(breit.id, "Kunde", "TEXT", Some(&text_options(180)))?;
    handle.create_column(breit.id, "Deadline", "DATE", None)?;
    handle.create_column(breit.id, "Aufwand", "INTEGER", None)?;
    handle.create_column(breit.id, "Link", "TEXT", Some(&text_options(300)))?;
    handle.create_column(breit.id, "Tags", "TEXT", Some(&text_options(200)))?;
    handle.insert_record(
        breit.id,
        serde_json::json!({
            "Name":"Design-Review abschließen",
            "Status":"Offen",
            "Notizen":"UI-Mockups prüfen und Feedback einarbeiten.",
            "Datum":"2025-03-01",
            "Priorität":"Hoch",
            "Verantwortlich":"Anna M.",
            "Fortschritt":20,
            "Typ":"Aufgabe",
            "Quelle":"Kunde",
            "Bemerkung":"Bis Freitag.",
            "Kunde":"Acme GmbH",
            "Deadline":"2025-03-15",
            "Aufwand":8,
            "Link":"https://example.com/design",
            "Tags":"UI, Review"
        }),
    )?;
    handle.insert_record(
        breit.id,
        serde_json::json!({
            "Name":"API-Dokumentation aktualisieren",
            "Status":"In Arbeit",
            "Notizen":"Endpoints für Projekt und Tabellen ergänzen.",
            "Datum":"2025-03-05",
            "Priorität":"Mittel",
            "Verantwortlich":"Ben K.",
            "Fortschritt":65,
            "Typ":"Feature",
            "Quelle":"Intern",
            "Bemerkung":"OpenAPI 3.0",
            "Kunde":"–",
            "Deadline":"2025-03-20",
            "Aufwand":16,
            "Link":"https://docs.example.com",
            "Tags":"API, Docs"
        }),
    )?;
    handle.insert_record(
        breit.id,
        serde_json::json!({
            "Name":"Login-Flow testen",
            "Status":"Erledigt",
            "Notizen":"Test-Account und Cookie-Handling verifiziert.",
            "Datum":"2025-02-28",
            "Priorität":"Niedrig",
            "Verantwortlich":"Clara S.",
            "Fortschritt":100,
            "Typ":"Bug",
            "Quelle":"Support",
            "Bemerkung":"Abgeschlossen.",
            "Kunde":"Beta AG",
            "Deadline":"2025-03-01",
            "Aufwand":4,
            "Link":"",
            "Tags":"Auth, QA"
        }),
    )?;
    if let Some(view) = handle.views(breit.id)?.into_iter().next() {
        handle.set_setting(&format!("view_icon_{}", view.id), "LayoutGrid")?;
    }

    let ai = handle.create_table("AI Test")?;
    handle.update_table(ai.id, None, Some("Table"), None)?;
    handle.create_column(ai.id, "Land", "CHOICE", Some(&land))?;
    for row in [
        serde_json::json!({"Land":"Deutschland"}),
        serde_json::json!({"Land":"Frankreich"}),
        serde_json::json!({"Land":"USA"}),
    ] {
        handle.insert_record(ai.id, row)?;
    }
    if let Some(view) = handle.views(ai.id)?.into_iter().next() {
        handle.set_setting(&format!("view_icon_{}", view.id), "LayoutGrid")?;
    }
    Ok(())
}
