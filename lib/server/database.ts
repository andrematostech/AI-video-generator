import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import initSqlJs, { Database, SqlJsStatic, SqlValue } from "sql.js";
import { getServerEnv } from "@/lib/config/env.server";

type DatabaseHandle = {
  db: Database;
  filePath: string;
};

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL,
    max_attempts INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    error TEXT,
    title TEXT NOT NULL,
    script TEXT NOT NULL,
    target_duration_seconds REAL NOT NULL,
    current_step TEXT NOT NULL,
    completed_scenes INTEGER NOT NULL,
    total_scenes INTEGER NOT NULL,
    narration_audio_path TEXT,
    subtitle_path TEXT,
    output_video_path TEXT NOT NULL,
    assets_directory TEXT NOT NULL,
    video_metadata_json TEXT,
    performance_metrics_json TEXT
  );

  CREATE TABLE IF NOT EXISTS scenes (
    job_id TEXT NOT NULL,
    scene_index INTEGER NOT NULL,
    narration TEXT NOT NULL,
    video_prompt TEXT NOT NULL,
    duration_seconds REAL NOT NULL,
    clip_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (job_id, scene_index),
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS generated_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    scene_index INTEGER,
    asset_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    source_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(job_id, asset_type, scene_index, file_path),
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pipeline_step_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_ms INTEGER,
    error_message TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rate_limit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    limiter_key TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
  );
`;

let sqlJsPromise: Promise<SqlJsStatic> | null = null;
let databaseHandlePromise: Promise<DatabaseHandle> | null = null;
let writeChain = Promise.resolve();

function ensureColumnExists(
  db: Database,
  tableName: string,
  columnName: string,
  columnDefinition: string
) {
  const rows = mapRows<{ name: string }>(db, `PRAGMA table_info(${tableName})`);
  const hasColumn = rows.some((row) => row.name === columnName);

  if (!hasColumn) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  }
}

function getDatabaseFilePath() {
  const env = getServerEnv();
  return path.join(env.ASSETS_DIR, ".data", "video-generator.sqlite");
}

function getSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file: string) =>
        path.join(process.cwd(), "node_modules", "sql.js", "dist", file)
    });
  }

  return sqlJsPromise;
}

async function openDatabase() {
  const SQL = await getSqlJs();
  const filePath = getDatabaseFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });

  const db = existsSync(filePath)
    ? new SQL.Database(new Uint8Array(await readFile(filePath)))
    : new SQL.Database();

  db.run(SCHEMA_SQL);
  ensureColumnExists(db, "jobs", "video_metadata_json", "video_metadata_json TEXT");
  ensureColumnExists(
    db,
    "jobs",
    "performance_metrics_json",
    "performance_metrics_json TEXT"
  );

  return {
    db,
    filePath
  };
}

async function getDatabaseHandle() {
  if (!databaseHandlePromise) {
    databaseHandlePromise = openDatabase();
  }

  return databaseHandlePromise;
}

async function persistDatabase(handle: DatabaseHandle) {
  const bytes = handle.db.export();
  await writeFile(handle.filePath, Buffer.from(bytes));
}

export async function runDatabaseWrite<T>(callback: (db: Database) => T | Promise<T>) {
  const pendingResult = writeChain.then(async () => {
    const handle = await getDatabaseHandle();
    const result = await callback(handle.db);
    await persistDatabase(handle);
    return result;
  });

  writeChain = pendingResult.then(
    () => undefined,
    () => undefined
  );

  return pendingResult;
}

export async function runDatabaseRead<T>(callback: (db: Database) => T | Promise<T>) {
  const handle = await getDatabaseHandle();
  return callback(handle.db);
}

export function mapRows<T>(db: Database, sql: string, params: SqlValue[] = []) {
  const statement = db.prepare(sql, params);
  const rows: T[] = [];

  while (statement.step()) {
    rows.push(statement.getAsObject() as T);
  }

  statement.free();
  return rows;
}

export function mapFirstRow<T>(db: Database, sql: string, params: SqlValue[] = []) {
  const rows = mapRows<T>(db, sql, params);
  return rows[0] ?? null;
}

export async function resetDatabaseForTests() {
  if (databaseHandlePromise) {
    const handle = await databaseHandlePromise;
    handle.db.close();
  }

  databaseHandlePromise = null;
  writeChain = Promise.resolve();
}
