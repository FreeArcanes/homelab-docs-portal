import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const COLLECTIONS = [
  "docs", "assets", "services", "runbooks", "projectsSecurity", "secrets",
  "networking", "activity", "projects", "maintenance", "connectors", "runbookExecutions"
];

export function createStorage({ dataDir, legacyFile }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "homelab-glue.sqlite");
  const firstRun = !fs.existsSync(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS records_updated ON records(collection, updated_at DESC);
    CREATE TABLE IF NOT EXISTS revisions (
      revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection TEXT NOT NULL,
      item_id TEXT NOT NULL,
      action TEXT NOT NULL,
      data TEXT,
      actor TEXT,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS revisions_item ON revisions(collection, item_id, revision_id DESC);
    CREATE TABLE IF NOT EXISTS service_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT NOT NULL,
      ok INTEGER NOT NULL,
      status_code INTEGER,
      response_ms INTEGER,
      tls_expires_at TEXT,
      error TEXT,
      checked_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS checks_service ON service_checks(service_id, checked_at DESC);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
  const putSetting = db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const upsert = db.prepare(`INSERT INTO records(collection,id,data,created_at,updated_at)
    VALUES(@collection,@id,@data,@createdAt,@updatedAt)
    ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`);

  function importSnapshot(snapshot, { replace = false } = {}) {
    const now = new Date().toISOString();
    const migrated = { ...(snapshot || {}) };
    if ((!Array.isArray(migrated.projectsSecurity) || !migrated.projectsSecurity.length) && Array.isArray(migrated.docs)) {
      migrated.projectsSecurity = migrated.docs.filter(item => String(item.category || "").startsWith("Projects/Security"));
      migrated.docs = migrated.docs.filter(item => !String(item.category || "").startsWith("Projects/Security"));
    }
    db.transaction(() => {
      if (replace) db.prepare("DELETE FROM records").run();
      for (const collection of COLLECTIONS) {
        for (const raw of Array.isArray(migrated?.[collection]) ? migrated[collection] : []) {
          const item = { ...raw, id: String(raw.id || `${collection}-${crypto.randomUUID()}`) };
          upsert.run({ collection, id: item.id, data: JSON.stringify(item), createdAt: item.createdAt || now, updatedAt: item.updatedAt || item.createdAt || now });
        }
      }
      if (migrated?.meta) putSetting.run("meta", JSON.stringify(migrated.meta));
    })();
  }

  if (firstRun && fs.existsSync(legacyFile)) {
    try { importSnapshot(JSON.parse(fs.readFileSync(legacyFile, "utf8"))); }
    catch (error) { console.warn(`Legacy JSON import skipped: ${error.message}`); }
  }

  function snapshot() {
    const result = Object.fromEntries(COLLECTIONS.map(name => [name, []]));
    for (const row of db.prepare("SELECT collection,data FROM records ORDER BY updated_at DESC").all()) {
      if (result[row.collection]) result[row.collection].push(JSON.parse(row.data));
    }
    try { result.meta = JSON.parse(getSetting.get("meta")?.value || "{}"); } catch { result.meta = {}; }
    return result;
  }

  function list(collection) {
    return db.prepare("SELECT data FROM records WHERE collection=? ORDER BY updated_at DESC").all(collection).map(row => JSON.parse(row.data));
  }

  function get(collection, id) {
    const row = db.prepare("SELECT data FROM records WHERE collection=? AND id=?").get(collection, String(id));
    return row ? JSON.parse(row.data) : null;
  }

  function save(collection, item, action, actor = "local") {
    const now = new Date().toISOString();
    const value = { ...item, id: String(item.id || `${collection}-${Date.now()}`), updatedAt: now };
    if (!value.createdAt) value.createdAt = now;
    db.transaction(() => {
      upsert.run({ collection, id: value.id, data: JSON.stringify(value), createdAt: value.createdAt, updatedAt: value.updatedAt });
      db.prepare("INSERT INTO revisions(collection,item_id,action,data,actor,at) VALUES(?,?,?,?,?,?)")
        .run(collection, value.id, action, JSON.stringify(value), actor, now);
    })();
    return value;
  }

  function remove(collection, id, actor = "local") {
    const existing = get(collection, id);
    if (!existing) return false;
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("DELETE FROM records WHERE collection=? AND id=?").run(collection, String(id));
      db.prepare("INSERT INTO revisions(collection,item_id,action,data,actor,at) VALUES(?,?,?,?,?,?)")
        .run(collection, String(id), "deleted", JSON.stringify(existing), actor, now);
    })();
    return true;
  }

  function revisions(collection, id) {
    return db.prepare("SELECT revision_id AS revisionId,action,data,actor,at FROM revisions WHERE collection=? AND item_id=? ORDER BY revision_id DESC")
      .all(collection, String(id)).map(row => ({ ...row, data: row.data ? JSON.parse(row.data) : null }));
  }

  const addCheck = db.prepare("INSERT INTO service_checks(service_id,ok,status_code,response_ms,tls_expires_at,error,checked_at) VALUES(@serviceId,@ok,@statusCode,@responseMs,@tlsExpiresAt,@error,@checkedAt)");
  function recordCheck(check) {
    addCheck.run({ ...check, ok: check.ok ? 1 : 0, statusCode: check.statusCode ?? null, responseMs: check.responseMs ?? null, tlsExpiresAt: check.tlsExpiresAt ?? null, error: check.error ?? null });
    db.prepare("DELETE FROM service_checks WHERE id IN (SELECT id FROM service_checks WHERE service_id=? ORDER BY checked_at DESC LIMIT -1 OFFSET 100)").run(check.serviceId);
  }
  function checks(serviceId = null) {
    const rows = serviceId
      ? db.prepare("SELECT * FROM service_checks WHERE service_id=? ORDER BY checked_at DESC LIMIT 100").all(serviceId)
      : db.prepare("SELECT c.* FROM service_checks c JOIN (SELECT service_id,MAX(id) id FROM service_checks GROUP BY service_id) latest ON latest.id=c.id ORDER BY c.checked_at DESC").all();
    return rows.map(r => ({ serviceId: r.service_id, ok: Boolean(r.ok), statusCode: r.status_code, responseMs: r.response_ms, tlsExpiresAt: r.tls_expires_at, error: r.error, checkedAt: r.checked_at }));
  }

  function setting(key, fallback = null) {
    const row = getSetting.get(String(key));
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return row.value; }
  }

  function setSetting(key, value) {
    putSetting.run(String(key), JSON.stringify(value));
    return value;
  }

  return { dbPath, snapshot, list, get, save, remove, revisions, importSnapshot, recordCheck, checks, setting, setSetting, close: () => db.close(), collections: COLLECTIONS };
}
