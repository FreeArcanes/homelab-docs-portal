import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import https from "https";
import fs from "fs/promises";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 8110;
const DATA_FILE = path.join(__dirname, "data", "data.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const FRONTEND_DIST = path.join(__dirname, "..", "frontend", "dist");

await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
await fs.mkdir(UPLOAD_DIR, { recursive: true });

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(morgan("combined"));

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return ensureShape(JSON.parse(raw));
  } catch {
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
      projects: []
    };
  }
}

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

async function writeData(data) {
  data = ensureShape(data);
  data.meta = {
    ...(data.meta || {}),
    app: "Homelab Docs Portal",
    polishedVersion: "2.1.0",
    lastWriteAt: new Date().toISOString()
  };

  const backupDir = path.join(__dirname, "data", "backups");
  await fs.mkdir(backupDir, { recursive: true });

  if (existsSync(DATA_FILE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.copyFile(DATA_FILE, path.join(backupDir, `data-${stamp}.json`));
  }

  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
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
    "projects"
  ]);

  if (!allowed.has(name)) return null;
  return name;
}

app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    app: "Homelab Docs Portal",
    polishedVersion: "2.1.0",
    host: "demo-host",
    exampleIp: "10.0.10.10",
    time: new Date().toISOString()
  });
});

app.get("/api/data", async (req, res) => {
  const data = await readData();
  res.json(data);
});

app.get("/api/:collection", async (req, res) => {
  const collection = normalizeCollection(req.params.collection);
  if (!collection) return res.status(404).json({ error: "Unknown collection" });

  const data = await readData();
  res.json(data[collection] || []);
});

app.post("/api/:collection", async (req, res) => {
  const collection = normalizeCollection(req.params.collection);
  if (!collection) return res.status(404).json({ error: "Unknown collection" });

  const data = await readData();
  data[collection] = Array.isArray(data[collection]) ? data[collection] : [];

  const item = {
    id: req.body.id || `${collection}-${Date.now()}`,
    createdAt: req.body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...req.body
  };

  data[collection].push(item);
  addActivity(data, "created", collection, item, req);
  await writeData(data);

  res.status(201).json(item);
});

app.put("/api/:collection/:id", async (req, res) => {
  const collection = normalizeCollection(req.params.collection);
  if (!collection) return res.status(404).json({ error: "Unknown collection" });

  const data = await readData();
  data[collection] = Array.isArray(data[collection]) ? data[collection] : [];

  const idx = data[collection].findIndex(item => String(item.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Item not found" });

  data[collection][idx] = {
    ...data[collection][idx],
    ...req.body,
    updatedAt: new Date().toISOString()
  };

  addActivity(data, "updated", collection, data[collection][idx], req);
  await writeData(data);
  res.json(data[collection][idx]);
});

app.delete("/api/:collection/:id", async (req, res) => {
  const collection = normalizeCollection(req.params.collection);
  if (!collection) return res.status(404).json({ error: "Unknown collection" });

  const data = await readData();
  data[collection] = Array.isArray(data[collection]) ? data[collection] : [];

  const before = data[collection].length;
  const deletedItem = data[collection].find(item => String(item.id) === String(req.params.id));
  data[collection] = data[collection].filter(item => String(item.id) !== String(req.params.id));

  if (data[collection].length === before) {
    return res.status(404).json({ error: "Item not found" });
  }

  addActivity(data, "deleted", collection, deletedItem || { id: req.params.id }, req);
  await writeData(data);
  res.json({ ok: true });
});

const upload = multer({ dest: UPLOAD_DIR });

app.post("/api/uploads", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const safeOriginal = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const finalName = `${Date.now()}-${safeOriginal}`;
  const finalPath = path.join(UPLOAD_DIR, finalName);

  await fs.rename(req.file.path, finalPath);

  res.status(201).json({
    filename: finalName,
    originalName: req.file.originalname,
    url: `/uploads/${finalName}`
  });
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
          rejectUnauthorized: !unifiInsecureTls()
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


app.use("/uploads", express.static(UPLOAD_DIR));

if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));

  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "API route not found" });
    }

    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Homelab Docs Portal running on port ${PORT}`);
});
