import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import https from "https";
import fs from "fs/promises";
import { constants, existsSync } from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import tls from "tls";
import { createStorage } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const trustProxy = String(process.env.TRUST_PROXY || "false").toLowerCase();
if (trustProxy === "true") app.set("trust proxy", 1);

const PORT = process.env.PORT || 8110;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const DATA_FILE = path.join(DATA_DIR, "data.json");
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "uploads"));
const FRONTEND_DIST = path.join(__dirname, "..", "frontend", "dist");
const storage = createStorage({ dataDir: DATA_DIR, legacyFile: DATA_FILE });

await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
await fs.mkdir(UPLOAD_DIR, { recursive: true });

app.use(helmet({
  contentSecurityPolicy: false
}));

const allowedOrigins = String(process.env.CORS_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins, credentials: true } : {}));
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(morgan("combined"));

async function readData() { return ensureShape(storage.snapshot()); }

function ensureShape(data) {
  return {
    meta: {},
    docs: [],
    assets: [],
    services: [],
    runbooks: [],
    projectsSecurity: [],
    secrets: [],
    networking: [],
    activity: [],
    projects: [],
    maintenance: [],
    connectors: [],
    runbookExecutions: [],
    ...(data || {})
  };
}

function addActivity(data, action, collection, item = {}, req = null) {
  data.activity = Array.isArray(data.activity) ? data.activity : [];
  data.activity.unshift({
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    collection,
    itemId: item.id || null,
    itemName: item.title || item.name || item.hostname || item.displayName || item.id || "Untitled",
    host: req?.hostname || null,
    at: new Date().toISOString()
  });

  data.activity = data.activity.slice(0, 250);
}

function normalizeCollection(name) {
  const allowed = new Set([
    "docs",
    "assets",
    "services",
    "runbooks",
    "projectsSecurity",
    "secrets",
    "networking",
    "activity",
    "projects",
    "maintenance",
    "connectors",
    "runbookExecutions"
  ]);

  if (!allowed.has(name)) return null;
  return name;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authenticate(req, res, next) {
  const mode = String(process.env.AUTH_MODE || "off").toLowerCase();
  if (mode === "off" || req.path === "/health") {
    req.user = { name: "local", role: "admin" };
    return next();
  }
  const apiKey = req.get("x-api-key");
  if (process.env.API_KEY && safeEqual(apiKey, process.env.API_KEY)) {
    req.user = { name: "api-key", role: "admin" };
    return next();
  }
  const encoded = req.get("authorization")?.match(/^Basic (.+)$/i)?.[1];
  let username = ""; let password = "";
  try { [username, password] = Buffer.from(encoded || "", "base64").toString("utf8").split(":"); } catch {}
  const admin = safeEqual(username, process.env.ADMIN_USERNAME) && safeEqual(password, process.env.ADMIN_PASSWORD);
  const viewer = process.env.VIEWER_USERNAME && safeEqual(username, process.env.VIEWER_USERNAME) && safeEqual(password, process.env.VIEWER_PASSWORD);
  if (admin || viewer) {
    req.user = { name: username, role: admin ? "admin" : "viewer" };
    return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Homelab Glue"');
  return res.status(401).json({ error: "Authentication required" });
}

app.use("/api", rateLimit({ windowMs: 60_000, limit: Number(process.env.RATE_LIMIT || 240), standardHeaders: true, legacyHeaders: false }));
app.use("/api", authenticate);

function requireEditor(req, res, next) {
  if (req.user?.role === "viewer") return res.status(403).json({ error: "Read-only account" });
  next();
}

function validateItem(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "A JSON object is required";
  if (JSON.stringify(body).length > 1_000_000) return "Entry is too large";
  if (body.id && !/^[a-zA-Z0-9._:-]{1,160}$/.test(String(body.id))) return "Invalid id";
  return null;
}

app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    app: "Homelab Glue",
    version: "3.0.0",
    storage: "sqlite",
    auth: String(process.env.AUTH_MODE || "off").toLowerCase(),
    time: new Date().toISOString()
  });
});

app.get("/api/data", async (req, res) => {
  const data = await readData();
  res.json(data);
});

app.get("/api/export", (req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.set("Content-Disposition", `attachment; filename="homelab-glue-${stamp}.json"`);
  res.json(storage.snapshot());
});

app.post("/api/import", requireEditor, async (req, res) => {
  const snapshot = req.body?.data || req.body;
  if (!snapshot || typeof snapshot !== "object") return res.status(400).json({ error: "Invalid snapshot" });
  const backupDir = path.join(__dirname, "data", "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.writeFile(path.join(backupDir, `pre-import-${stamp}.json`), JSON.stringify(storage.snapshot(), null, 2));
  storage.importSnapshot(snapshot, { replace: Boolean(req.body?.replace) });
  res.json({ ok: true, collections: storage.collections });
});

app.get("/api/backups", async (req, res) => {
  const backupDir = path.join(__dirname, "data", "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const files = (await fs.readdir(backupDir)).filter(name => name.endsWith(".json"));
  const result = await Promise.all(files.map(async name => {
    const stat = await fs.stat(path.join(backupDir, name));
    return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
  }));
  res.json(result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.post("/api/backups", requireEditor, async (req, res) => {
  const backupDir = path.join(__dirname, "data", "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `manual-${stamp}.json`;
  await fs.writeFile(path.join(backupDir, name), JSON.stringify(storage.snapshot(), null, 2));
  const retention = Math.max(1, Number(process.env.BACKUP_RETENTION || 30));
  const files = (await fs.readdir(backupDir)).filter(file => file.endsWith(".json")).sort().reverse();
  await Promise.all(files.slice(retention).map(file => fs.unlink(path.join(backupDir, file))));
  res.status(201).json({ ok: true, name });
});

app.get("/api/revisions/:collection/:id", (req, res) => {
  const collection = normalizeCollection(req.params.collection);
  if (!collection) return res.status(404).json({ error: "Unknown collection" });
  res.json(storage.revisions(collection, req.params.id));
});

app.post("/api/revisions/:collection/:id/:revisionId/restore", requireEditor, (req, res) => {
  const collection = normalizeCollection(req.params.collection);
  if (!collection) return res.status(404).json({ error: "Unknown collection" });
  const revision = storage.revisions(collection, req.params.id).find(r => String(r.revisionId) === String(req.params.revisionId));
  if (!revision?.data) return res.status(404).json({ error: "Revision not found" });
  res.json(storage.save(collection, revision.data, "restored", req.user.name));
});

function certificateExpiry(url) {
  if (url.protocol !== "https:") return Promise.resolve(null);
  return new Promise(resolve => {
    const socket = tls.connect({ host: url.hostname, port: Number(url.port || 443), servername: url.hostname, rejectUnauthorized: false, timeout: 5000 }, () => {
      const validTo = socket.getPeerCertificate()?.valid_to;
      socket.end();
      resolve(validTo ? new Date(validTo).toISOString() : null);
    });
    socket.on("timeout", () => { socket.destroy(); resolve(null); });
    socket.on("error", () => resolve(null));
  });
}

async function notify(event) {
  const webhook = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `[Homelab Glue] ${event.message}`, ...event }), signal: AbortSignal.timeout(5000) });
  } catch (error) { console.warn(`Notification failed: ${error.message}`); }
}

async function checkService(service) {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  let result;
  try {
    const url = new URL(service.healthUrl || service.url);
    const response = await fetch(url, { method: service.healthMethod || "GET", redirect: "follow", signal: AbortSignal.timeout(Number(service.healthTimeoutMs || 8000)) });
    result = { serviceId: service.id, ok: response.ok, statusCode: response.status, responseMs: Date.now() - started, tlsExpiresAt: await certificateExpiry(url), error: response.ok ? null : `HTTP ${response.status}`, checkedAt };
  } catch (error) {
    result = { serviceId: service.id, ok: false, statusCode: null, responseMs: Date.now() - started, tlsExpiresAt: null, error: error.message, checkedAt };
  }
  const previous = storage.checks(service.id)[0];
  storage.recordCheck(result);
  if (previous && previous.ok !== result.ok) await notify({ type: "service-status", serviceId: service.id, message: `${service.name || service.id} is now ${result.ok ? "online" : "offline"}` });
  return result;
}

app.get("/api/monitoring", (req, res) => res.json({ latest: storage.checks(), enabled: String(process.env.MONITORING_ENABLED || "false") === "true" }));
app.get("/api/monitoring/:serviceId/history", (req, res) => res.json(storage.checks(req.params.serviceId)));
app.post("/api/monitoring/check", requireEditor, async (req, res) => {
  const services = storage.list("services").filter(service => (req.body?.serviceId ? service.id === req.body.serviceId : true) && (service.healthUrl || service.url));
  const results = await Promise.all(services.map(checkService));
  res.json(results);
});

app.get("/api/maintenance-due", (req, res) => {
  const now = Date.now();
  const horizon = now + Number(req.query.days || 30) * 86400000;
  const items = storage.list("maintenance").map(item => ({ ...item, overdue: item.dueAt ? new Date(item.dueAt).getTime() < now && item.status !== "Complete" : false }))
    .filter(item => !item.dueAt || new Date(item.dueAt).getTime() <= horizon);
  res.json(items);
});

app.get("/api/integrations", (req, res) => {
  const configured = storage.list("connectors");
  res.json({
    available: ["UniFi", "Docker", "Proxmox", "TrueNAS", "Home Assistant", "Pi-hole", "AdGuard Home", "Tailscale", "Uptime Kuma", "Portainer"],
    configured,
    unifi: { enabled: unifiEnabled() }
  });
});

app.post("/api/integrations/:id/sync", requireEditor, async (req, res) => {
  const connector = storage.get("connectors", req.params.id);
  if (!connector) return res.status(404).json({ error: "Connector not found" });
  if (!connector.url) return res.status(400).json({ error: "Connector URL is required" });
  try {
    const tokenKey = `CONNECTOR_TOKEN_${String(connector.id).replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
    const token = process.env[tokenKey];
    const response = await fetch(connector.url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10000) });
    const payload = await response.json();
    const updated = storage.save("connectors", { ...connector, lastSyncAt: new Date().toISOString(), lastSyncStatus: response.ok ? "success" : "failed", discoveredCount: Array.isArray(payload) ? payload.length : null }, "synced", req.user.name);
    res.json({ connector: updated, preview: payload });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

function envValue(value) {
  const text = String(value ?? "");
  if (/\r|\n/.test(text)) throw new Error("Configuration values cannot contain newlines");
  const composeSafe = text.replaceAll("$", "$$");
  return /[\s#!"'`$\\]/.test(text) ? JSON.stringify(composeSafe) : composeSafe;
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) throw new Error(`Expected a number between ${min} and ${max}`);
  return Math.min(max, Math.max(min, Math.round(number)));
}

app.get("/api/setup/status", async (req, res) => {
  const snapshot = storage.snapshot();
  const writable = await Promise.all([path.dirname(DATA_FILE), UPLOAD_DIR].map(async target => {
    try { await fs.access(target, constants.W_OK); return true; } catch { return false; }
  }));
  const authMode = String(process.env.AUTH_MODE || "off").toLowerCase();
  const adminSafe = authMode === "basic" && Boolean(process.env.ADMIN_USERNAME) && Boolean(process.env.ADMIN_PASSWORD) && process.env.ADMIN_PASSWORD !== "change-me";
  const counts = Object.fromEntries(storage.collections.map(name => [name, Array.isArray(snapshot[name]) ? snapshot[name].length : 0]));
  res.json({
    completed: Boolean(storage.setting("setup.completed", false)),
    completedAt: storage.setting("setup.completedAt", null),
    runtime: { version: "3.0.0", port: Number(PORT), storage: "sqlite", database: path.basename(storage.dbPath), nodeEnv: process.env.NODE_ENV || "development", auth: authMode },
    checks: {
      databaseWritable: writable[0], uploadsWritable: writable[1], authConfigured: adminSafe,
      corsRestricted: Boolean(process.env.CORS_ORIGINS), monitoringEnabled: String(process.env.MONITORING_ENABLED || "false") === "true",
      notificationConfigured: Boolean(process.env.NOTIFICATION_WEBHOOK_URL), unifiEnabled: unifiEnabled(), unifiCredentialsPresent: Boolean(process.env.UNIFI_USERNAME && process.env.UNIFI_PASSWORD)
    },
    counts
  });
});

app.post("/api/setup/config-preview", requireEditor, (req, res) => {
  try {
    const config = req.body || {};
    const port = boundedNumber(config.port, 8110, 1, 65535);
    const hostPort = boundedNumber(config.hostPort, port, 1, 65535);
    const rateLimitValue = boundedNumber(config.rateLimit, 240, 10, 100000);
    const uploadMaxBytes = boundedNumber(config.uploadMaxBytes, 10485760, 1024, 1073741824);
    const monitorSeconds = boundedNumber(config.monitoringIntervalSeconds, 300, 30, 86400);
    const backupRetention = boundedNumber(config.backupRetention, 30, 1, 1000);
    const authMode = config.authEnabled ? "basic" : "off";
    if (authMode === "basic" && (!config.adminUsername || String(config.adminPassword || "").length < 12)) {
      return res.status(400).json({ error: "Admin credentials and a password of at least 12 characters are required" });
    }
    if (config.authEnabled && Boolean(config.viewerUsername) !== Boolean(config.viewerPassword)) return res.status(400).json({ error: "Provide both read-only username and password, or leave both blank" });
    if (config.viewerPassword && String(config.viewerPassword).length < 12) return res.status(400).json({ error: "Read-only password must be at least 12 characters" });
    if (config.apiKey && String(config.apiKey).length < 24) return res.status(400).json({ error: "Automation API key must be at least 24 characters" });
    const origins = String(config.corsOrigins || "").split(",").map(value => value.trim()).filter(Boolean);
    if (!origins.length) return res.status(400).json({ error: "At least one allowed browser origin is required" });
    for (const origin of origins) {
      const parsed = new URL(origin);
      if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin.replace(/\/$/, "")) return res.status(400).json({ error: `Invalid browser origin: ${origin}` });
    }
    if (config.unifiEnabled && (!config.unifiHost || !config.unifiUsername || !config.unifiPassword)) {
      return res.status(400).json({ error: "UniFi host, username, and password are required when UniFi is enabled" });
    }
    const lines = [
      "# Homelab Glue generated configuration", `PORT=${port}`, "", "# Security", `AUTH_MODE=${authMode}`,
      `ADMIN_USERNAME=${envValue(config.authEnabled ? config.adminUsername || "admin" : "")}`, `ADMIN_PASSWORD=${envValue(config.authEnabled ? config.adminPassword || "" : "")}`,
      `VIEWER_USERNAME=${envValue(config.authEnabled ? config.viewerUsername || "" : "")}`, `VIEWER_PASSWORD=${envValue(config.authEnabled ? config.viewerPassword || "" : "")}`,
      `API_KEY=${envValue(config.authEnabled ? config.apiKey || "" : "")}`, `CORS_ORIGINS=${envValue(origins.join(","))}`, `TRUST_PROXY=${Boolean(config.trustProxy)}`,
      `RATE_LIMIT=${rateLimitValue}`, `UPLOAD_MAX_BYTES=${uploadMaxBytes}`,
      "", "# Operations", `MONITORING_ENABLED=${Boolean(config.monitoringEnabled)}`, `MONITORING_INTERVAL_SECONDS=${monitorSeconds}`,
      `NOTIFICATION_WEBHOOK_URL=${envValue(config.notificationWebhookUrl || "")}`, `BACKUP_RETENTION=${backupRetention}`,
      "", "# Optional UniFi connector", `UNIFI_ENABLED=${Boolean(config.unifiEnabled)}`, `UNIFI_HOST=${envValue(config.unifiEnabled ? config.unifiHost || "" : "")}`,
      `UNIFI_USERNAME=${envValue(config.unifiEnabled ? config.unifiUsername || "" : "")}`, `UNIFI_PASSWORD=${envValue(config.unifiEnabled ? config.unifiPassword || "" : "")}`,
      `UNIFI_SITE=${envValue(config.unifiSite || "default")}`, `UNIFI_INSECURE_TLS=${Boolean(config.unifiInsecureTls)}`, ""
    ];
    const compose = [
      "services:", "  homelab-glue:", "    build: .", "    container_name: homelab-glue", "    restart: unless-stopped", "    init: true",
      "    env_file:", "      - .env", "    ports:", `      - \"${hostPort}:${port}\"`, "    volumes:",
      "      - ./backend/data:/app/backend/data", "      - ./backend/uploads:/app/backend/uploads", "    healthcheck:",
      `      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:${port}/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\"]`,
      "      interval: 30s", "      timeout: 5s", "      retries: 3", "      start_period: 20s", ""
    ].join("\n");
    res.json({ env: lines.join("\n"), compose, port, hostPort, restartRequired: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post("/api/setup/unifi-test", requireEditor, async (req, res) => {
  try {
    const result = await testUnifiConfig(req.body || {});
    res.json(result);
  } catch (error) { res.status(502).json({ ok: false, error: error.message }); }
});

app.post("/api/setup/complete", requireEditor, (req, res) => {
  const at = new Date().toISOString();
  storage.setSetting("setup.completed", true);
  storage.setSetting("setup.completedAt", at);
  storage.setSetting("setup.profile", { deploymentName: String(req.body?.deploymentName || "My Homelab"), completedBy: req.user.name });
  res.json({ ok: true, completedAt: at });
});

const allowedUploadTypes = new Set(["application/pdf", "text/plain", "text/markdown", "image/png", "image/jpeg", "image/webp"]);
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024), files: 1 },
  fileFilter: (req, file, callback) => callback(allowedUploadTypes.has(file.mimetype) ? null : new Error("Unsupported file type"), allowedUploadTypes.has(file.mimetype))
});

app.post("/api/uploads", requireEditor, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const extension = path.extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
  const finalName = `${crypto.randomUUID()}${extension}`;
  await fs.rename(req.file.path, path.join(UPLOAD_DIR, finalName));
  res.status(201).json({ filename: finalName, originalName: path.basename(req.file.originalname), url: `/uploads/${finalName}` });
});

app.get("/api/:collection", async (req, res) => {
  const collection = normalizeCollection(req.params.collection);
  if (!collection) return res.status(404).json({ error: "Unknown collection" });

  res.json(storage.list(collection));
});

app.post("/api/:collection", requireEditor, async (req, res) => {
  const collection = normalizeCollection(req.params.collection);
  if (!collection) return res.status(404).json({ error: "Unknown collection" });

  const validationError = validateItem(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const item = storage.save(collection, {
    id: req.body.id || `${collection}-${Date.now()}`,
    createdAt: req.body.createdAt || new Date().toISOString(),
    ...req.body
  }, "created", req.user.name);
  storage.save("activity", { id: `activity-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, action: "created", collection, itemId: item.id, itemName: item.title || item.name || item.id, actor: req.user.name, at: new Date().toISOString() }, "created", req.user.name);

  res.status(201).json(item);
});

app.put("/api/:collection/:id", requireEditor, async (req, res) => {
  const collection = normalizeCollection(req.params.collection);
  if (!collection) return res.status(404).json({ error: "Unknown collection" });

  const validationError = validateItem(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = storage.get(collection, req.params.id);
  if (!existing) return res.status(404).json({ error: "Item not found" });
  const item = storage.save(collection, { ...existing, ...req.body, id: existing.id }, "updated", req.user.name);
  storage.save("activity", { id: `activity-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, action: "updated", collection, itemId: item.id, itemName: item.title || item.name || item.id, actor: req.user.name, at: new Date().toISOString() }, "created", req.user.name);
  res.json(item);
});

app.delete("/api/:collection/:id", requireEditor, async (req, res) => {
  const collection = normalizeCollection(req.params.collection);
  if (!collection) return res.status(404).json({ error: "Unknown collection" });

  const deletedItem = storage.get(collection, req.params.id);
  if (!storage.remove(collection, req.params.id, req.user.name)) return res.status(404).json({ error: "Item not found" });
  storage.save("activity", { id: `activity-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, action: "deleted", collection, itemId: req.params.id, itemName: deletedItem?.title || deletedItem?.name || req.params.id, actor: req.user.name, at: new Date().toISOString() }, "created", req.user.name);
  res.json({ ok: true });
});

/* OPTIONAL_NETWORK_CONTROLLER_CONNECTOR */
function unifiEnabled() {
  return String(process.env.UNIFI_ENABLED || "").toLowerCase() === "true";
}

function unifiBase() {
  return String(process.env.UNIFI_HOST || "").replace(/\/+$/, "");
}

function unifiSite() {
  return process.env.UNIFI_SITE || "default";
}

function unifiInsecureTls() {
  return String(process.env.UNIFI_INSECURE_TLS || "false").toLowerCase() === "true";
}

function requestJson(urlString, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);

    const payload = body ? JSON.stringify(body) : null;

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(options.headers || {})
        },
        agent: new https.Agent({
          rejectUnauthorized: options.rejectUnauthorized ?? !unifiInsecureTls()
        }),
        timeout: 15000
      },
      res => {
        let data = "";

        res.on("data", chunk => {
          data += chunk;
        });

        res.on("end", () => {
          let json = {};
          try {
            json = data ? JSON.parse(data) : {};
          } catch {
            json = { raw: data };
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: json
          });
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("UniFi request timed out")));
    req.on("error", reject);

    if (payload) req.write(payload);
    req.end();
  });
}

async function testUnifiConfig(config) {
  const base = String(config.host || "").replace(/\/+$/, "");
  const username = String(config.username || "");
  const password = String(config.password || "");
  const site = String(config.site || "default");
  if (!/^https:\/\//i.test(base)) throw new Error("UniFi host must use an https:// URL");
  if (!username || !password) throw new Error("UniFi username and password are required");
  const login = await requestJson(`${base}/api/auth/login`, { method: "POST", rejectUnauthorized: !Boolean(config.insecureTls) }, { username, password });
  if (login.status < 200 || login.status >= 300) throw new Error(`UniFi login failed with HTTP ${login.status}`);
  const setCookie = login.headers["set-cookie"] || [];
  const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).map(value => String(value).split(";")[0]).join("; ");
  if (!cookie) throw new Error("UniFi login succeeded but no session cookie was returned");
  const devices = await requestJson(`${base}/proxy/network/api/s/${encodeURIComponent(site)}/stat/device`, { headers: { Cookie: cookie }, rejectUnauthorized: !Boolean(config.insecureTls) });
  if (devices.status < 200 || devices.status >= 300) throw new Error(`UniFi site check failed with HTTP ${devices.status}`);
  return { ok: true, site, deviceCount: Array.isArray(devices.data?.data) ? devices.data.data.length : 0, message: "Connection successful. Credentials were tested but not saved." };
}

async function unifiLoginV2() {
  if (!unifiEnabled()) throw new Error("UniFi integration disabled.");

  const username = process.env.UNIFI_USERNAME;
  const password = process.env.UNIFI_PASSWORD;

  if (!username || !password) {
    throw new Error("UniFi credentials are not configured in v2 .env");
  }

  const res = await requestJson(
    `${unifiBase()}/api/auth/login`,
    { method: "POST" },
    { username, password }
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`UniFi login failed with HTTP ${res.status}`);
  }

  const setCookie = res.headers["set-cookie"] || [];
  const cookieHeader = Array.isArray(setCookie)
    ? setCookie.map(cookie => cookie.split(";")[0]).join("; ")
    : String(setCookie).split(";")[0];

  if (!cookieHeader) throw new Error("UniFi login did not return a session cookie.");

  return cookieHeader;
}

async function unifiGetV2(pathname, cookie, fallback = null) {
  const res = await requestJson(`${unifiBase()}${pathname}`, {
    method: "GET",
    headers: {
      Cookie: cookie
    }
  });

  if (res.status < 200 || res.status >= 300) {
    if (fallback !== null) return fallback;
    throw new Error(`UniFi API failed ${pathname} with HTTP ${res.status}`);
  }

  return res.data || {};
}

function cleanDevice(d) {
  return {
    id: d._id || d.device_id || d.mac,
    name: d.name || d.hostname || d.model || d.type || "Unnamed Device",
    type: d.type || d.model || "device",
    model: d.model || "",
    mac: d.mac || "",
    ip: d.ip || d.network_table?.[0]?.ip || "",
    state: d.state,
    version: d.version || "",
    uptime: d.uptime || 0,
    numSta: d.num_sta || d.user_num_sta || 0,
    adopted: d.adopted,
    disabled: d.disabled,
    uplink: d.uplink || d.uplink_table?.[0] || null
  };
}

function cleanClient(c) {
  return {
    id: c._id || c.mac,
    name: c.name || c.hostname || c.mac || "Unknown Client",
    hostname: c.hostname || "",
    mac: c.mac || "",
    ip: c.ip || "",
    oui: c.oui || "",
    isWired: Boolean(c.is_wired),
    network: c.network || c.network_name || "",
    ssid: c.essid || c.ssid || "",
    radio: c.radio || "",
    signal: c.signal,
    uptime: c.uptime || 0,
    rxBytes: c.rx_bytes || 0,
    txBytes: c.tx_bytes || 0,
    vlan: c.vlan || c.vlan_id || "",
    switchMac: c.sw_mac || "",
    apMac: c.ap_mac || "",
    lastSeen: c.last_seen || null
  };
}

function cleanNetwork(n) {
  return {
    id: n._id || n.id || n.name,
    name: n.name || "Unnamed Network",
    purpose: n.purpose || "",
    subnet: n.ip_subnet || n.subnet || "",
    vlan: n.vlan || "",
    dhcpEnabled: n.dhcpd_enabled,
    domainName: n.domain_name || "",
    gateway: n.gateway_ip || ""
  };
}

function cleanWlan(w) {
  return {
    id: w._id || w.id || w.name,
    name: w.name || "Unnamed WLAN",
    enabled: w.enabled,
    security: w.security || "",
    networkId: w.networkconf_id || "",
    userGroupId: w.usergroup_id || ""
  };
}

function buildTopology(devices, clients) {
  const nodes = [];
  const edges = [];

  for (const d of devices) {
    nodes.push({
      id: d.mac || d.id || d.name,
      label: d.name,
      type: d.type,
      ip: d.ip,
      status: d.state === 1 ? "online" : "warning"
    });
  }

  for (const c of clients.slice(0, 150)) {
    const clientId = c.mac || c.id || c.name;
    nodes.push({
      id: clientId,
      label: c.name,
      type: c.isWired ? "wired-client" : "wireless-client",
      ip: c.ip,
      status: "client"
    });

    const parent = c.apMac || c.switchMac;
    if (parent) {
      edges.push({
        from: parent,
        to: clientId,
        type: c.isWired ? "wired" : "wireless"
      });
    }
  }

  return { nodes, edges };
}

app.get("/api/unifi/topology-v2", async (req, res) => {
  try {
    if (!unifiEnabled()) {
      return res.json({
        enabled: false,
        message: "UniFi integration disabled."
      });
    }

    const cookie = await unifiLoginV2();
    const site = unifiSite();

    const [devicesRaw, clientsRaw, networksRaw, wlansRaw, healthRaw] = await Promise.all([
      unifiGetV2(`/proxy/network/api/s/${site}/stat/device`, cookie, { data: [] }),
      unifiGetV2(`/proxy/network/api/s/${site}/stat/sta`, cookie, { data: [] }),
      unifiGetV2(`/proxy/network/api/s/${site}/rest/networkconf`, cookie, { data: [] }),
      unifiGetV2(`/proxy/network/api/s/${site}/rest/wlanconf`, cookie, { data: [] }),
      unifiGetV2(`/proxy/network/api/s/${site}/stat/health`, cookie, { data: [] }).catch(() => ({ data: [] }))
    ]);

    const devices = (devicesRaw.data || []).map(cleanDevice);
    const clients = (clientsRaw.data || []).map(cleanClient);
    const networks = (networksRaw.data || []).map(cleanNetwork);
    const wlans = (wlansRaw.data || []).map(cleanWlan);
    const topology = buildTopology(devices, clients);

    res.json({
      enabled: true,
      source: "v2-local-unifi",
      host: unifiBase(),
      site,
      fetchedAt: new Date().toISOString(),
      counts: {
        devices: devices.length,
        clients: clients.length,
        wiredClients: clients.filter(c => c.isWired).length,
        wirelessClients: clients.filter(c => !c.isWired).length,
        networks: networks.length,
        wlans: wlans.length
      },
      devices,
      clients,
      networks,
      wlans,
      health: healthRaw.data || [],
      topology
    });
  } catch (err) {
    res.status(500).json({
      enabled: unifiEnabled(),
      error: err.message
    });
  }
});

app.get("/api/unifi/summary", async (req, res) => {
  try {
    if (!unifiEnabled()) {
      return res.json({
        enabled: false,
        message: "UniFi integration disabled."
      });
    }

    const cookie = await unifiLoginV2();
    const site = unifiSite();

    const [devicesRaw, clientsRaw] = await Promise.all([
      unifiGetV2(`/proxy/network/api/s/${site}/stat/device`, cookie, { data: [] }),
      unifiGetV2(`/proxy/network/api/s/${site}/stat/sta`, cookie, { data: [] })
    ]);

    const devices = (devicesRaw.data || []).map(cleanDevice);
    const clients = (clientsRaw.data || []).map(cleanClient);

    res.json({
      enabled: true,
      host: unifiBase(),
      site,
      fetchedAt: new Date().toISOString(),
      counts: {
        devices: devices.length,
        clients: clients.length,
        wiredClients: clients.filter(c => c.isWired).length,
        wirelessClients: clients.filter(c => !c.isWired).length
      },
      devices,
      clients: clients.slice(0, 100)
    });
  } catch (err) {
    res.status(500).json({
      enabled: unifiEnabled(),
      error: err.message
    });
  }
});


app.use("/uploads", authenticate, express.static(UPLOAD_DIR, { setHeaders: res => {
  res.setHeader("Content-Disposition", "attachment");
  res.setHeader("X-Content-Type-Options", "nosniff");
} }));

app.use((error, req, res, next) => {
  if (!error) return next();
  res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: error.message });
});

if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));

  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "API route not found" });
    }

    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
}

const monitorInterval = Number(process.env.MONITORING_INTERVAL_SECONDS || 300) * 1000;
if (String(process.env.MONITORING_ENABLED || "false") === "true" && monitorInterval >= 30000) {
  setInterval(() => Promise.all(storage.list("services").filter(service => service.healthUrl || service.url).map(checkService)).catch(error => console.warn(`Scheduled checks failed: ${error.message}`)), monitorInterval).unref();
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Homelab Glue running on port ${PORT}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing Homelab Glue cleanly.`);
  const forced = setTimeout(() => process.exit(1), 10000).unref();
  server.close(() => {
    clearTimeout(forced);
    try { storage.close(); } catch {}
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
