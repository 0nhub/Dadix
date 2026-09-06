//! SQLite persistence for tables, sources, jobs, and settings.

use crate::domain::{
    Column, CredentialRef, GridViewColumn, Job, NewJob, NewSource, NewSourceTable, Record, Setting,
    ViewButton,
    Source, SourceKind, SourceTable, Table, View,
};
use crate::error::{DadixError, DadixResult, ErrorCode};
use crate::paths::PathMode;
use crate::project::{prepare_source_uri, ProjectHandle};
use crate::schema::now_utc;
use crate::secrets::{reject_secret_key, reject_secret_options};
use rusqlite::{params, OptionalExtension};

impl ProjectHandle {
    pub fn tables(&self) -> DadixResult<Vec<Table>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, reference_name, icon, order_index FROM tables ORDER BY order_index, id",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Table {
                id: r.get(0)?,
                name: r.get(1)?,
                reference_name: r.get(2)?,
                icon: r.get(3)?,
                order: r.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn table(&self, id: i64) -> DadixResult<Option<Table>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, reference_name, icon, order_index FROM tables WHERE id = ?",
        )?;
        stmt.query_row([id], |r| {
            Ok(Table {
                id: r.get(0)?,
                name: r.get(1)?,
                reference_name: r.get(2)?,
                icon: r.get(3)?,
                order: r.get(4)?,
            })
        })
        .optional()
        .map_err(Into::into)
    }

    pub fn columns(&self, table_id: i64) -> DadixResult<Vec<Column>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, table_id, name, type_name, options, order_index FROM columns WHERE table_id = ? ORDER BY order_index, id",
        )?;
        let rows = stmt.query_map([table_id], |r| {
            Ok(Column {
                id: r.get(0)?,
                table_id: r.get(1)?,
                name: r.get(2)?,
                type_name: r.get(3)?,
                options: r.get(4)?,
                order: r.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn views(&self, table_id: i64) -> DadixResult<Vec<View>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, table_id, name, type_name, filter, sort, order_index FROM views WHERE table_id = ? ORDER BY order_index, id",
        )?;
        let rows = stmt.query_map([table_id], |r| {
            Ok(View {
                id: r.get(0)?,
                table_id: r.get(1)?,
                name: r.get(2)?,
                type_name: r.get(3)?,
                filter: r.get(4)?,
                sort: r.get(5)?,
                order: r.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn view(&self, view_id: i64) -> DadixResult<Option<View>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, table_id, name, type_name, filter, sort, order_index FROM views WHERE id = ?",
        )?;
        stmt.query_row([view_id], |r| {
            Ok(View {
                id: r.get(0)?,
                table_id: r.get(1)?,
                name: r.get(2)?,
                type_name: r.get(3)?,
                filter: r.get(4)?,
                sort: r.get(5)?,
                order: r.get(6)?,
            })
        })
        .optional()
        .map_err(Into::into)
    }

    pub fn ensure_grid_view_columns(&self, view_id: i64) -> DadixResult<()> {
        let Some(view) = self.view(view_id)? else {
            return Ok(());
        };
        if self.ensure_writable().is_err() {
            return Ok(());
        }
        let columns = self.columns(view.table_id)?;
        let conn = self.lock_conn()?;
        let existing: Vec<i64> = {
            let mut stmt =
                conn.prepare("SELECT column_id FROM grid_view_columns WHERE view_id = ?")?;
            let rows = stmt.query_map([view_id], |r| r.get::<_, i64>(0))?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        for column in columns {
            if existing.iter().any(|id| *id == column.id) {
                continue;
            }
            conn.execute(
                "INSERT INTO grid_view_columns (view_id, column_id, name, order_index, is_visible)
                 VALUES (?, ?, ?, ?, 1)",
                params![view_id, column.id, column.name, column.order],
            )?;
        }
        drop(conn);
        Ok(())
    }

    pub fn grid_view_columns(&self, view_id: i64) -> DadixResult<Vec<GridViewColumn>> {
        let _ = self.ensure_grid_view_columns(view_id);
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, view_id, column_id, name, size, order_index, is_visible, content_align FROM grid_view_columns WHERE view_id = ? ORDER BY order_index, id",
        )?;
        let rows = stmt.query_map([view_id], |r| {
            Ok(GridViewColumn {
                id: r.get(0)?,
                view_id: r.get(1)?,
                column_id: r.get(2)?,
                name: r.get(3)?,
                size: r.get(4)?,
                order: r.get(5)?,
                is_visible: r.get::<_, i32>(6)? != 0,
                content_align: r.get(7)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update_grid_view_column(
        &self,
        id: i64,
        name: Option<&str>,
        size: Option<i32>,
        order: Option<i32>,
        is_visible: Option<bool>,
        content_align: Option<&str>,
    ) -> DadixResult<GridViewColumn> {
        self.ensure_writable()?;
        let current = self
            .grid_view_column(id)?
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "grid view column not found"))?;
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE grid_view_columns SET name = ?, size = ?, order_index = ?, is_visible = ?, content_align = ? WHERE id = ?",
            params![
                name.unwrap_or(current.name.as_deref().unwrap_or("")),
                size.or(current.size),
                order.unwrap_or(current.order),
                i32::from(is_visible.unwrap_or(current.is_visible)),
                content_align.or(current.content_align.as_deref()),
                id
            ],
        )?;
        drop(conn);
        self.touch_updated()?;
        self.grid_view_column(id)?
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "grid view column not found"))
    }

    pub fn grid_view_column(&self, id: i64) -> DadixResult<Option<GridViewColumn>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, view_id, column_id, name, size, order_index, is_visible, content_align FROM grid_view_columns WHERE id = ?",
        )?;
        stmt.query_row([id], |r| {
            Ok(GridViewColumn {
                id: r.get(0)?,
                view_id: r.get(1)?,
                column_id: r.get(2)?,
                name: r.get(3)?,
                size: r.get(4)?,
                order: r.get(5)?,
                is_visible: r.get::<_, i32>(6)? != 0,
                content_align: r.get(7)?,
            })
        })
        .optional()
        .map_err(Into::into)
    }

    pub fn view_buttons(&self, view_id: i64) -> DadixResult<Vec<ViewButton>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, view_id, label, order_index FROM view_buttons WHERE view_id = ? ORDER BY order_index, id",
        )?;
        let rows = stmt.query_map([view_id], |r| {
            Ok(ViewButton {
                id: r.get(0)?,
                view_id: r.get(1)?,
                label: r.get(2)?,
                order: r.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn create_view_button(
        &self,
        view_id: i64,
        label: &str,
        order: Option<i32>,
    ) -> DadixResult<ViewButton> {
        self.ensure_writable()?;
        let conn = self.lock_conn()?;
        let order_index: i32 = match order {
            Some(value) => value,
            None => conn.query_row(
                "SELECT COALESCE(MAX(order_index), -1) + 1 FROM view_buttons WHERE view_id = ?",
                [view_id],
                |r| r.get(0),
            )?,
        };
        conn.execute(
            "INSERT INTO view_buttons (view_id, label, order_index) VALUES (?, ?, ?)",
            params![view_id, label, order_index],
        )?;
        let id = conn.last_insert_rowid();
        drop(conn);
        self.touch_updated()?;
        Ok(ViewButton {
            id,
            view_id,
            label: label.to_string(),
            order: order_index,
        })
    }

    pub fn update_view_button(
        &self,
        id: i64,
        label: Option<&str>,
        order: Option<i32>,
    ) -> DadixResult<ViewButton> {
        self.ensure_writable()?;
        let conn = self.lock_conn()?;
        let mut current = conn.query_row(
            "SELECT view_id, label, order_index FROM view_buttons WHERE id = ?",
            [id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i32>(2)?)),
        )?;
        if let Some(label) = label {
            current.1 = label.to_string();
        }
        if let Some(order) = order {
            current.2 = order;
        }
        conn.execute(
            "UPDATE view_buttons SET label = ?, order_index = ? WHERE id = ?",
            params![current.1, current.2, id],
        )?;
        drop(conn);
        self.touch_updated()?;
        Ok(ViewButton {
            id,
            view_id: current.0,
            label: current.1,
            order: current.2,
        })
    }

    pub fn delete_view_button(&self, id: i64) -> DadixResult<()> {
        self.ensure_writable()?;
        let conn = self.lock_conn()?;
        let changed = conn.execute("DELETE FROM view_buttons WHERE id = ?", [id])?;
        if changed == 0 {
            return Err(DadixError::new(ErrorCode::NotFound, "view button not found"));
        }
        drop(conn);
        self.touch_updated()?;
        Ok(())
    }

    pub fn records(&self, table_id: i64, limit: i64, offset: i64) -> DadixResult<Vec<Record>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, data FROM records WHERE table_id = ? ORDER BY id LIMIT ? OFFSET ?",
        )?;
        let rows = stmt.query_map(params![table_id, limit, offset], |r| {
            let id: i64 = r.get(0)?;
            let data_str: String = r.get(1)?;
            let data: serde_json::Value =
                serde_json::from_str(&data_str).unwrap_or_else(|_| serde_json::json!({}));
            Ok(Record { id, data })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn query_records(
        &self,
        table_id: i64,
        filter_json: Option<&str>,
        sort_json: Option<&str>,
        search: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> DadixResult<crate::RecordPage> {
        let columns = self.columns(table_id)?;
        let records = self.records(table_id, 1_000_000, 0)?;
        crate::table_query::query_records(
            &columns,
            records,
            &crate::table_query::TableQuery {
                filter_json: filter_json.map(str::to_string),
                sort_json: sort_json.map(str::to_string),
                search: search.map(str::to_string),
                limit,
                offset,
            },
        )
    }

    pub fn record_count(&self, table_id: i64) -> DadixResult<i64> {
        let conn = self.lock_conn()?;
        conn.query_row(
            "SELECT COUNT(*) FROM records WHERE table_id = ?",
            [table_id],
            |r| r.get(0),
        )
        .map_err(Into::into)
    }

    pub fn create_table(&self, name: &str) -> DadixResult<Table> {
        self.ensure_writable()?;
        let conn = self.lock_conn()?;
        let order: i32 = conn.query_row(
            "SELECT COALESCE(MAX(order_index), -1) + 1 FROM tables",
            [],
            |r| r.get(0),
        )?;
        let ref_name = format!("t_{}", uuid::Uuid::new_v4().as_simple());
        conn.execute(
            "INSERT INTO tables (name, reference_name, icon, order_index) VALUES (?, ?, 'Table', ?)",
            params![name, ref_name, order],
        )?;
        let id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO views (table_id, name, type_name, order_index) VALUES (?, 'All entries', 'gridView', 0)",
            [id],
        )?;
        drop(conn);
        self.touch_updated()?;
        Ok(Table {
            id,
            name: name.to_string(),
            reference_name: ref_name,
            icon: "Table".to_string(),
            order,
        })
    }

    pub fn create_column(
        &self,
        table_id: i64,
        name: &str,
        type_name: &str,
        options: Option<&str>,
    ) -> DadixResult<Column> {
        self.ensure_writable()?;
        if name.trim().is_empty() {
            return Err(DadixError::new(
                ErrorCode::Validation,
                "column name is required",
            ));
        }
        if self.table(table_id)?.is_none() {
            return Err(DadixError::new(ErrorCode::NotFound, "table not found"));
        }
        let conn = self.lock_conn()?;
        let order: i32 = conn.query_row(
            "SELECT COALESCE(MAX(order_index), -1) + 1 FROM columns WHERE table_id = ?",
            [table_id],
            |r| r.get(0),
        )?;
        conn.execute(
            "INSERT INTO columns (table_id, name, type_name, options, order_index) VALUES (?, ?, ?, ?, ?)",
            params![table_id, name, type_name, options, order],
        )?;
        let column_id = conn.last_insert_rowid();
        let mut view_ids = Vec::new();
        {
            let mut stmt = conn.prepare("SELECT id FROM views WHERE table_id = ?")?;
            let rows = stmt.query_map([table_id], |r| r.get::<_, i64>(0))?;
            for row in rows {
                view_ids.push(row?);
            }
        }
        for view_id in view_ids {
            conn.execute(
                "INSERT INTO grid_view_columns (view_id, column_id, name, order_index, is_visible)
                 VALUES (?, ?, ?, ?, 1)",
                params![view_id, column_id, name, order],
            )?;
        }
        drop(conn);
        self.touch_updated()?;
        Ok(Column {
            id: column_id,
            table_id,
            name: name.to_string(),
            type_name: type_name.to_string(),
            options: options.map(str::to_string),
            order,
        })
    }

    pub fn update_column(
        &self,
        column_id: i64,
        name: &str,
        type_name: &str,
        options: Option<&str>,
    ) -> DadixResult<Column> {
        self.ensure_writable()?;
        let existing = self
            .column(column_id)?
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "column not found"))?;
        let name = if name.trim().is_empty() {
            existing.name.as_str()
        } else {
            name
        };
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE columns SET name = ?, type_name = ?, options = ? WHERE id = ?",
            params![name, type_name, options, column_id],
        )?;
        if existing.name != name {
            let mut stmt = conn.prepare("SELECT id, data FROM records WHERE table_id = ?")?;
            let rows = stmt
                .query_map([existing.table_id], |r| {
                    Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            drop(stmt);
            for (record_id, data_str) in rows {
                let mut value: serde_json::Value =
                    serde_json::from_str(&data_str).unwrap_or_else(|_| serde_json::json!({}));
                if let Some(obj) = value.as_object_mut() {
                    if let Some(old) = obj.remove(&existing.name) {
                        obj.insert(name.to_string(), old);
                    }
                    conn.execute(
                        "UPDATE records SET data = ? WHERE table_id = ? AND id = ?",
                        params![value.to_string(), existing.table_id, record_id],
                    )?;
                }
            }
            conn.execute(
                "UPDATE grid_view_columns SET name = ? WHERE column_id = ?",
                params![name, column_id],
            )?;
        }
        let order = existing.order;
        let table_id = existing.table_id;
        drop(conn);
        self.touch_updated()?;
        Ok(Column {
            id: column_id,
            table_id,
            name: name.to_string(),
            type_name: type_name.to_string(),
            options: options.map(str::to_string),
            order,
        })
    }

    pub fn column(&self, column_id: i64) -> DadixResult<Option<Column>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, table_id, name, type_name, options, order_index FROM columns WHERE id = ?",
        )?;
        stmt.query_row([column_id], |r| {
            Ok(Column {
                id: r.get(0)?,
                table_id: r.get(1)?,
                name: r.get(2)?,
                type_name: r.get(3)?,
                options: r.get(4)?,
                order: r.get(5)?,
            })
        })
        .optional()
        .map_err(Into::into)
    }

    pub fn delete_column(&self, column_id: i64) -> DadixResult<()> {
        self.ensure_writable()?;
        let existing = self
            .column(column_id)?
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "column not found"))?;
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare("SELECT id, data FROM records WHERE table_id = ?")?;
        let rows = stmt
            .query_map([existing.table_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        drop(stmt);
        for (record_id, data_str) in rows {
            let mut value: serde_json::Value =
                serde_json::from_str(&data_str).unwrap_or_else(|_| serde_json::json!({}));
            if let Some(obj) = value.as_object_mut() {
                obj.remove(&existing.name);
                conn.execute(
                    "UPDATE records SET data = ? WHERE table_id = ? AND id = ?",
                    params![value.to_string(), existing.table_id, record_id],
                )?;
            }
        }
        conn.execute("DELETE FROM columns WHERE id = ?", [column_id])?;
        drop(conn);
        self.touch_updated()?;
        Ok(())
    }

    pub fn rename_table(&self, table_id: i64, name: &str) -> DadixResult<Table> {
        self.update_table(table_id, Some(name), None, None)
    }

    pub fn update_table(
        &self,
        table_id: i64,
        name: Option<&str>,
        icon: Option<&str>,
        order: Option<i32>,
    ) -> DadixResult<Table> {
        self.ensure_writable()?;
        {
            let conn = self.lock_conn()?;
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM tables WHERE id = ?",
                [table_id],
                |r| r.get(0),
            )?;
            if exists == 0 {
                return Err(DadixError::new(ErrorCode::NotFound, "table not found"));
            }
            if let Some(name) = name {
                conn.execute(
                    "UPDATE tables SET name = ? WHERE id = ?",
                    params![name, table_id],
                )?;
            }
            if let Some(icon) = icon {
                conn.execute(
                    "UPDATE tables SET icon = ? WHERE id = ?",
                    params![icon, table_id],
                )?;
            }
            if let Some(order) = order {
                conn.execute(
                    "UPDATE tables SET order_index = ? WHERE id = ?",
                    params![order, table_id],
                )?;
            }
        }
        self.touch_updated()?;
        self.table(table_id)?
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "table not found"))
    }

    pub fn set_project_name(&self, name: &str) -> DadixResult<()> {
        self.ensure_writable()?;
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE project_meta SET name = ? WHERE id = 1",
            params![name],
        )?;
        drop(conn);
        self.touch_updated()?;
        Ok(())
    }

    pub fn delete_table(&self, table_id: i64) -> DadixResult<()> {
        self.ensure_writable()?;
        if self.table(table_id)?.is_none() {
            return Err(DadixError::new(ErrorCode::NotFound, "table not found"));
        }
        let conn = self.lock_conn()?;
        conn.execute("DELETE FROM records WHERE table_id = ?", [table_id])?;
        conn.execute(
            "DELETE FROM grid_view_columns WHERE view_id IN (SELECT id FROM views WHERE table_id = ?)",
            [table_id],
        )?;
        conn.execute(
            "DELETE FROM view_buttons WHERE view_id IN (SELECT id FROM views WHERE table_id = ?)",
            [table_id],
        )?;
        conn.execute("DELETE FROM columns WHERE table_id = ?", [table_id])?;
        conn.execute("DELETE FROM views WHERE table_id = ?", [table_id])?;
        let changed = conn.execute("DELETE FROM tables WHERE id = ?", [table_id])?;
        if changed == 0 {
            return Err(DadixError::new(ErrorCode::NotFound, "table not found"));
        }
        drop(conn);
        self.touch_updated()?;
        Ok(())
    }

    pub fn delete_record(&self, table_id: i64, id: i64) -> DadixResult<()> {
        self.ensure_writable()?;
        let conn = self.lock_conn()?;
        let changed = conn.execute(
            "DELETE FROM records WHERE table_id = ? AND id = ?",
            params![table_id, id],
        )?;
        if changed == 0 {
            return Err(DadixError::new(ErrorCode::NotFound, "record not found"));
        }
        drop(conn);
        self.touch_updated()?;
        Ok(())
    }

    pub fn create_view(
        &self,
        table_id: i64,
        name: &str,
        type_name: &str,
    ) -> DadixResult<View> {
        self.ensure_writable()?;
        if self.table(table_id)?.is_none() {
            return Err(DadixError::new(ErrorCode::NotFound, "table not found"));
        }
        let conn = self.lock_conn()?;
        let order: i32 = conn.query_row(
            "SELECT COALESCE(MAX(order_index), -1) + 1 FROM views WHERE table_id = ?",
            [table_id],
            |r| r.get(0),
        )?;
        conn.execute(
            "INSERT INTO views (table_id, name, type_name, order_index) VALUES (?, ?, ?, ?)",
            params![table_id, name, type_name, order],
        )?;
        let id = conn.last_insert_rowid();
        let columns = {
            let mut stmt = conn.prepare(
                "SELECT id, name, order_index FROM columns WHERE table_id = ? ORDER BY order_index, id",
            )?;
            let rows = stmt.query_map([table_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i32>(2)?))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        for (column_id, name, order) in columns {
            conn.execute(
                "INSERT INTO grid_view_columns (view_id, column_id, name, order_index, is_visible)
                 VALUES (?, ?, ?, ?, 1)",
                params![id, column_id, name, order],
            )?;
        }
        drop(conn);
        self.touch_updated()?;
        self.view(id)?
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "view not found"))
    }

    pub fn update_view(
        &self,
        view_id: i64,
        name: &str,
        filter: Option<&str>,
        sort: Option<&str>,
    ) -> DadixResult<View> {
        self.ensure_writable()?;
        let conn = self.lock_conn()?;
        let changed = conn.execute(
            "UPDATE views SET name = ?, filter = ?, sort = ? WHERE id = ?",
            params![name, filter, sort, view_id],
        )?;
        if changed == 0 {
            return Err(DadixError::new(ErrorCode::NotFound, "view not found"));
        }
        drop(conn);
        self.touch_updated()?;
        self.view(view_id)?
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "view not found"))
    }

    pub fn delete_view(&self, view_id: i64) -> DadixResult<()> {
        self.ensure_writable()?;
        let view = self
            .view(view_id)?
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "view not found"))?;
        let remaining = self.views(view.table_id)?.len();
        if remaining <= 1 {
            return Err(DadixError::new(
                ErrorCode::Validation,
                "cannot delete the last view",
            ));
        }
        let conn = self.lock_conn()?;
        conn.execute("DELETE FROM views WHERE id = ?", [view_id])?;
        drop(conn);
        self.touch_updated()?;
        Ok(())
    }

    pub fn insert_record(
        &self,
        table_id: i64,
        data: serde_json::Value,
    ) -> DadixResult<Record> {
        self.ensure_writable()?;
        if !data.is_object() {
            return Err(DadixError::new(
                ErrorCode::InvalidProject,
                "record data must be a JSON object",
            ));
        }
        let conn = self.lock_conn()?;
        let id: i64 = conn.query_row(
            "SELECT COALESCE(MAX(id), 0) + 1 FROM records WHERE table_id = ?",
            [table_id],
            |r| r.get(0),
        )?;
        let data_str = data.to_string();
        conn.execute(
            "INSERT INTO records (table_id, id, data) VALUES (?, ?, ?)",
            params![table_id, id, data_str],
        )?;
        drop(conn);
        self.touch_updated()?;
        Ok(Record { id, data })
    }

    pub fn update_record(
        &self,
        table_id: i64,
        id: i64,
        data: serde_json::Value,
    ) -> DadixResult<Record> {
        self.ensure_writable()?;
        if !data.is_object() {
            return Err(DadixError::new(
                ErrorCode::InvalidProject,
                "record data must be a JSON object",
            ));
        }
        let conn = self.lock_conn()?;
        let existing_str: String = conn
            .query_row(
                "SELECT data FROM records WHERE table_id = ? AND id = ?",
                params![table_id, id],
                |r| r.get(0),
            )
            .map_err(|_| DadixError::new(ErrorCode::NotFound, "record not found"))?;
        let mut merged: serde_json::Value =
            serde_json::from_str(&existing_str).unwrap_or_else(|_| serde_json::json!({}));
        if !merged.is_object() {
            merged = serde_json::json!({});
        }
        if let (Some(target), Some(patch)) = (merged.as_object_mut(), data.as_object()) {
            for (key, value) in patch {
                if matches!(key.as_str(), "id" | "createdAt" | "updatedAt") {
                    continue;
                }
                target.insert(key.clone(), value.clone());
            }
        }
        conn.execute(
            "UPDATE records SET data = ? WHERE table_id = ? AND id = ?",
            params![merged.to_string(), table_id, id],
        )?;
        drop(conn);
        self.touch_updated()?;
        Ok(Record { id, data: merged })
    }

    pub fn list_sources(&self) -> DadixResult<Vec<Source>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, type_name, kind, path_mode, uri, options, credential_id, created_at
             FROM sources ORDER BY id",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, Option<String>>(6)?,
                r.get::<_, Option<String>>(7)?,
                r.get::<_, String>(8)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (id, name, type_name, kind, path_mode, uri, options, credential_id, created_at) =
                row?;
            out.push(Source {
                id,
                name,
                type_name,
                kind: SourceKind::parse(&kind).map_err(|other| {
                    DadixError::new(
                        ErrorCode::Validation,
                        format!("invalid source kind '{other}'"),
                    )
                })?,
                path_mode: PathMode::parse(&path_mode)?,
                uri,
                options,
                credential: credential_id.map(|id| CredentialRef { id }),
                created_at,
            });
        }
        Ok(out)
    }

    pub fn add_source(&self, source: NewSource) -> DadixResult<Source> {
        self.ensure_writable()?;
        reject_secret_options(source.options.as_deref())?;
        if let Some(ref uri) = source.uri {
            crate::credentials::reject_secret_uri(uri)?;
        }
        if let Some(ref cred) = source.credential {
            if cred.id.trim().is_empty() {
                return Err(DadixError::new(
                    ErrorCode::Validation,
                    "credential_id must not be empty",
                ));
            }
        }
        let uri = prepare_source_uri(source.path_mode, source.uri)?;
        let created_at = now_utc();
        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO sources (name, type_name, kind, path_mode, uri, options, credential_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                source.name,
                source.type_name,
                source.kind.as_str(),
                source.path_mode.as_str(),
                uri,
                source.options,
                source.credential.as_ref().map(|c| c.id.as_str()),
                created_at,
            ],
        )?;
        let created = Source {
            id: conn.last_insert_rowid(),
            name: source.name,
            type_name: source.type_name,
            kind: source.kind,
            path_mode: source.path_mode,
            uri,
            options: source.options,
            credential: source.credential,
            created_at,
        };
        drop(conn);
        self.touch_updated()?;
        let _ = self.sync_file_source(created.id);
        Ok(created)
    }

    pub fn set_source_credential(
        &self,
        source_id: i64,
        credential_id: Option<String>,
    ) -> DadixResult<Source> {
        self.ensure_writable()?;
        if let Some(ref id) = credential_id {
            crate::credentials::validate_credential_id(id)?;
        }
        {
            let conn = self.lock_conn()?;
            let n = conn.execute(
                "UPDATE sources SET credential_id = ? WHERE id = ?",
                params![credential_id.as_deref(), source_id],
            )?;
            if n == 0 {
                return Err(DadixError::new(ErrorCode::NotFound, "source not found"));
            }
        }
        let _ = self.drop_database_session(source_id);
        self.touch_updated()?;
        self.list_sources()?
            .into_iter()
            .find(|s| s.id == source_id)
            .ok_or_else(|| DadixError::new(ErrorCode::NotFound, "source not found"))
    }

    pub fn update_source_link(
        &self,
        source_id: i64,
        path_mode: PathMode,
        uri: &str,
        kind: SourceKind,
        options: Option<&str>,
    ) -> DadixResult<()> {
        self.ensure_writable()?;
        reject_secret_options(options)?;
        crate::credentials::reject_secret_uri(uri)?;
        let uri = prepare_source_uri(path_mode, Some(uri.to_string()))?
            .ok_or_else(|| DadixError::new(ErrorCode::PathResolution, "source uri is empty"))?;
        let conn = self.lock_conn()?;
        let n = conn.execute(
            "UPDATE sources SET path_mode = ?, uri = ?, kind = ?, options = COALESCE(?, options) WHERE id = ?",
            params![path_mode.as_str(), uri, kind.as_str(), options, source_id],
        )?;
        if n == 0 {
            return Err(DadixError::new(ErrorCode::NotFound, "source not found"));
        }
        drop(conn);
        self.touch_updated()?;
        Ok(())
    }

    pub fn list_source_tables(&self, source_id: i64) -> DadixResult<Vec<SourceTable>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, source_id, logical_name, remote_name, options
             FROM source_tables WHERE source_id = ? ORDER BY id",
        )?;
        let rows = stmt.query_map([source_id], |r| {
            Ok(SourceTable {
                id: r.get(0)?,
                source_id: r.get(1)?,
                logical_name: r.get(2)?,
                remote_name: r.get(3)?,
                options: r.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn add_source_table(&self, table: NewSourceTable) -> DadixResult<SourceTable> {
        self.ensure_writable()?;
        reject_secret_options(table.options.as_deref())?;
        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO source_tables (source_id, logical_name, remote_name, options)
             VALUES (?, ?, ?, ?)",
            params![
                table.source_id,
                table.logical_name,
                table.remote_name,
                table.options
            ],
        )?;
        let created = SourceTable {
            id: conn.last_insert_rowid(),
            source_id: table.source_id,
            logical_name: table.logical_name,
            remote_name: table.remote_name,
            options: table.options,
        };
        drop(conn);
        self.touch_updated()?;
        Ok(created)
    }

    pub fn list_jobs(&self) -> DadixResult<Vec<Job>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, enabled, schedule, payload, created_at FROM jobs ORDER BY id",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Job {
                id: r.get(0)?,
                name: r.get(1)?,
                enabled: r.get::<_, i32>(2)? != 0,
                schedule: r.get(3)?,
                payload: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn add_job(&self, job: NewJob) -> DadixResult<Job> {
        self.ensure_writable()?;
        reject_secret_options(job.payload.as_deref())?;
        let created_at = now_utc();
        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO jobs (name, enabled, schedule, payload, created_at) VALUES (?, ?, ?, ?, ?)",
            params![
                job.name,
                if job.enabled { 1 } else { 0 },
                job.schedule,
                job.payload,
                created_at
            ],
        )?;
        let created = Job {
            id: conn.last_insert_rowid(),
            name: job.name,
            enabled: job.enabled,
            schedule: job.schedule,
            payload: job.payload,
            created_at,
        };
        drop(conn);
        self.touch_updated()?;
        Ok(created)
    }

    pub fn list_settings(&self) -> DadixResult<Vec<Setting>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key")?;
        let rows = stmt.query_map([], |r| {
            Ok(Setting {
                key: r.get(0)?,
                value: r.get(1)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_setting(&self, key: &str) -> DadixResult<Option<String>> {
        let conn = self.lock_conn()?;
        conn.query_row("SELECT value FROM settings WHERE key = ?", [key], |r| {
            r.get(0)
        })
        .optional()
        .map_err(Into::into)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> DadixResult<Setting> {
        self.ensure_writable()?;
        reject_secret_key(key)?;
        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        drop(conn);
        self.touch_updated()?;
        Ok(Setting {
            key: key.to_string(),
            value: value.to_string(),
        })
    }
}
