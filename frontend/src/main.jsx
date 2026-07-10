import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  Edit3,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  Home,
  KeyRound,
  Layers3,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  Terminal,
  Trash2,
  Wifi,
  X
} from "lucide-react";
import "./styles.css";

const EMPTY_DATA = {
  meta: {},
  assets: [],
  services: [],
  docs: [],
  runbooks: [],
  secrets: [],
  networking: [],
  activity: [],
  projects: [],
  projectsSecurity: [],
  maintenance: [],
  connectors: [],
  runbookExecutions: []
};

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "assets", label: "Assets", icon: Boxes },
  { id: "services", label: "Services", icon: Server },
  {
    id: "networking",
    label: "Networking",
    icon: Network,
    children: [
      { id: "networking-overview", label: "Overview" },
      { id: "interactive-topology", label: "Interactive Topology" },
      { id: "topology-map", label: "Topology Map" },
      { id: "physical-port-map", label: "Physical Port Map" },
      { id: "unifi-devices", label: "UniFi Devices" },
      { id: "clients", label: "Clients" },
      { id: "wireless", label: "Wireless" },
      { id: "networks-vlans", label: "Networks/VLANs" },
      { id: "raw-data", label: "Raw Data" }
    ]
  },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "runbooks", label: "Runbooks", icon: Activity },
  {
    id: "operations",
    label: "Operations",
    icon: Gauge,
    children: [
      { id: "monitoring", label: "Health Monitoring" },
      { id: "maintenance", label: "Maintenance" },
      { id: "backups", label: "Backup & Restore" },
      { id: "integrations", label: "Integrations" },
      { id: "audit", label: "Audit History" }
    ]
  },
  { id: "projects-security", label: "Projects/Security", icon: Shield },
  { id: "secret-references", label: "Secret References", icon: KeyRound }
];

const PAGE_META = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Operations command center for services, assets, runbooks, networking, and project notes."
  },
  assets: {
    title: "Assets",
    subtitle: "Inventory of servers, workstations, infrastructure, storage, endpoints, and ownership."
  },
  services: {
    title: "Services",
    subtitle: "Docker apps, internal URLs, ports, owners, categories, and operational notes."
  },
  "networking-overview": {
    title: "Network Overview",
    subtitle: "Core routing, DNS, VLANs, physical layout, and known network documentation."
  },
  "interactive-topology": {
    title: "Interactive Topology",
    subtitle: "Embedded network map for fast visual reference."
  },
  "topology-map": {
    title: "Topology Map",
    subtitle: "Live UniFi topology when the UniFi connector is enabled."
  },
  "physical-port-map": {
    title: "Physical Port Map",
    subtitle: "Manual source-of-truth for gateway, switch, VLAN, and endpoint port mapping."
  },
  "unifi-devices": {
    title: "UniFi Devices",
    subtitle: "Live device inventory from the UniFi API connector."
  },
  clients: {
    title: "Clients",
    subtitle: "Live wired and wireless client inventory from UniFi."
  },
  wireless: {
    title: "Wireless",
    subtitle: "WLANs, SSIDs, security mode, and wireless connector status."
  },
  "networks-vlans": {
    title: "Networks/VLANs",
    subtitle: "UniFi network definitions, VLANs, gateways, and DHCP notes."
  },
  "raw-data": {
    title: "Raw Data",
    subtitle: "Troubleshooting view for normalized UniFi payloads."
  },
  documents: {
    title: "Documents",
    subtitle: "Structured internal docs, notes, architecture references, and change documentation."
  },
  runbooks: {
    title: "Runbooks",
    subtitle: "Operational procedures with steps, impact, category, and validation notes."
  },
  "projects-security": {
    title: "Projects/Security",
    subtitle: "Project notes, security patching, remediation work, and infrastructure changes."
  },
  "secret-references": {
    title: "Secret References",
    subtitle: "References only — store where secrets live, never the secret value itself."
  },
  monitoring: { title: "Health Monitoring", subtitle: "Availability, response time, certificate expiry, and check history." },
  maintenance: { title: "Maintenance", subtitle: "Recurring work, due dates, ownership, and completion status." },
  backups: { title: "Backup & Restore", subtitle: "Create, download, validate, and restore portable snapshots." },
  integrations: { title: "Integrations", subtitle: "Connect and preview external homelab inventory sources." },
  audit: { title: "Audit History", subtitle: "Trace changes and inspect the operational activity stream." }
};

function normalizeData(data) {
  const result = { ...EMPTY_DATA, ...(data || {}) };
  if (!result.projectsSecurity.length) result.projectsSecurity = result.docs.filter(doc => String(doc.category || "").startsWith("Projects/Security"));
  return result;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function searchMatch(item, query) {
  const q = cleanText(query).toLowerCase();
  if (!q) return true;
  return JSON.stringify(item || {}).toLowerCase().includes(q);
}

function sortByUpdated(items = []) {
  return [...items].sort((a, b) => {
    const ad = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bd = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bd - ad;
  });
}

function displayName(item) {
  return item?.title || item?.name || item?.hostname || item?.displayName || item?.id || "Untitled";
}

function displaySummary(item) {
  return item?.summary || item?.notes || item?.details || item?.body || "No summary documented yet.";
}

function tagList(item) {
  const tags = item?.tags;
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === "string") return tags.split(",").map(t => t.trim()).filter(Boolean);
  return [];
}

function collectionForActive(active) {
  if (active === "assets") return "assets";
  if (active === "services") return "services";
  if (active === "runbooks") return "runbooks";
  if (active === "projects-security") return "projectsSecurity";
  if (active === "maintenance") return "maintenance";
  if (active === "integrations") return "connectors";
  if (active === "secret-references") return "secrets";
  if (active === "networking-overview" || active === "physical-port-map") return "networking";
  return "docs";
}

function defaultItemForActive(active) {
  if (active === "assets") {
    return {
      name: "",
      type: "Server",
      status: "Active",
      ip: "",
      owner: "",
      tags: [],
      summary: "",
      details: ""
    };
  }

  if (active === "services") {
    return {
      name: "",
      category: "Application",
      status: "Active",
      host: "LAB-SERVER-01",
      url: "",
      port: "",
      image: "",
      tags: ["Docker"],
      notes: ""
    };
  }

  if (active === "runbooks") {
    return {
      title: "",
      category: "Operations",
      displayStatus: "Draft",
      displayImpact: "Normal",
      tags: [],
      summary: "",
      steps: [],
      notes: ""
    };
  }

  if (active === "maintenance") return { name: "", category: "Maintenance", status: "Planned", dueAt: "", recurrence: "Monthly", owner: "", related: "", notes: "" };
  if (active === "integrations") return { name: "", type: "Docker", status: "Disabled", url: "", notes: "" };

  if (active === "projects-security") {
    return {
      title: "",
      category: "Projects/Security/Projects Patching",
      status: "Draft",
      type: "document",
      format: "text",
      tags: ["Project"],
      summary: "",
      body: ""
    };
  }

  if (active === "secret-references") {
    return {
      name: "",
      location: "External password manager",
      related: "",
      rotation: "",
      notes: ""
    };
  }

  if (active === "networking-overview" || active === "physical-port-map") {
    return {
      name: "",
      type: "Network Note",
      status: "Active",
      ip: "",
      url: "",
      tags: ["Networking"],
      notes: ""
    };
  }

  return {
    title: "",
    category: "Documents",
    status: "Draft",
    type: "document",
    format: "text",
    tags: [],
    summary: "",
    body: ""
  };
}

async function api(path, options = {}) {
  const headers = options.body instanceof FormData
    ? options.headers || {}
    : { "Content-Type": "application/json", ...(options.headers || {}) };

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

function App() {
  const [active, setActive] = useState("dashboard");
  const [data, setData] = useState(EMPTY_DATA);
  const [health, setHealth] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [toast, setToast] = useState(null);

  async function loadData() {
    setLoading(true);
    try {
      const [result, healthResult] = await Promise.all([
        api("/api/data"),
        api("/api/health").catch(() => null)
      ]);
      setData(normalizeData(result));
      setHealth(healthResult);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const counts = useMemo(() => {
    const d = normalizeData(data);
    return {
      docs: d.docs.length,
      assets: d.assets.length,
      services: d.services.length,
      runbooks: d.runbooks.length,
      projects: d.projectsSecurity.length,
      secrets: d.secrets.length,
      networking: d.networking.length,
      maintenance: d.maintenance.length,
      activity: d.activity.length,
      activeServices: d.services.filter(s => String(s.status || "").toLowerCase().includes("active")).length,
      readyRunbooks: d.runbooks.filter(r => String(r.displayStatus || r.status || "").toLowerCase().includes("ready")).length
    };
  }, [data]);

  const meta = PAGE_META[active] || PAGE_META.dashboard;

  function switchPage(id) {
    setActive(id);
    setSelectedItem(null);
  }

  function openCreate() {
    const collection = collectionForActive(active);
    setEditor({
      mode: "create",
      collection,
      item: defaultItemForActive(active)
    });
  }

  function openEdit(collection, item) {
    setEditor({
      mode: "edit",
      collection,
      item: { ...item }
    });
  }

  async function saveEditor(item) {
    setSaving(true);
    try {
      const payload = { ...item };
      if (typeof payload.tags === "string") {
        payload.tags = payload.tags.split(",").map(t => t.trim()).filter(Boolean);
      }

      if (editor.mode === "create") {
        await api(`/api/${editor.collection}`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setToast("Entry created.");
      } else {
        await api(`/api/${editor.collection}/${encodeURIComponent(editor.item.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setToast("Entry updated.");
      }

      setEditor(null);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(collection, item) {
    const label = displayName(item);
    const ok = window.confirm(`Delete "${label}"?`);
    if (!ok) return;

    await api(`/api/${collection}/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    setSelectedItem(null);
    setToast("Entry deleted.");
    await loadData();
  }

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timeout);
  }, [toast]);

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={switchPage} counts={counts} health={health} />

      <main className="main">
        <header className="topbar">
          <div className="topbar-copy">
            <div className="eyebrow">Demo Homelab</div>
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>

          <div className="topbar-actions">
            <div className="search">
              <Search size={16} />
              <input
                placeholder="Search docs, IPs, ports, tags..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>

            <button className="btn ghost" onClick={loadData} disabled={loading}>
              <RefreshCw size={16} />
              Refresh
            </button>

            <button className="btn" onClick={openCreate}>
              <Plus size={16} />
              New Entry
            </button>
          </div>
        </header>

        {loading ? (
          <LoadingPanel />
        ) : (
          <Page
            active={active}
            data={data}
            counts={counts}
            health={health}
            query={query}
            selectedItem={selectedItem}
            setSelectedItem={setSelectedItem}
            onEdit={openEdit}
            onDelete={deleteItem}
          />
        )}
      </main>

      {editor && (
        <EditorModal
          editor={editor}
          saving={saving}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
        />
      )}

      {toast && <div className="toast"><CheckCircle2 size={16} />{toast}</div>}
    </div>
  );
}

function Sidebar({ active, setActive, counts, health }) {
  const status = health?.ok ? "Online" : "Local";
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">B</div>
        <div>
          <div className="brand-title">Homelab Docs</div>
          <div className="brand-subtitle">Homelab Glue v3.0</div>
        </div>
      </div>

      <div className="nav-label">Navigate</div>
      <nav className="nav">
        {NAV.map(item => (
          <NavItem key={item.id} item={item} active={active} setActive={setActive} counts={counts} />
        ))}
      </nav>

      <div className="system-card">
        <div className="system-title">Runtime</div>
          <div className="system-row"><strong>Storage</strong><span>{health?.storage || "local"}</span></div>
          <div className="system-row"><strong>Version</strong><span>{health?.version || "3.0.0"}</span></div>
        <div className="system-row"><strong>Status</strong><span className="green-text">{status}</span></div>
        <div className="system-divider" />
        <div className="system-title">Coverage</div>
        <div className="coverage-bar"><span style={{ width: "96%" }} /></div>
        <div className="system-foot">Polished shell · CRUD · live UniFi-ready</div>
      </div>
    </aside>
  );
}

function NavItem({ item, active, setActive, counts }) {
  const Icon = item.icon;
  const sectionActive = active === item.id || item.children?.some(child => child.id === active);
  const countMap = {
    assets: counts.assets,
    services: counts.services,
    documents: counts.docs,
    runbooks: counts.runbooks,
    "projects-security": counts.projects,
    operations: counts.maintenance,
    "secret-references": counts.secrets
  };

  function clickMain() {
    if (item.children?.length) setActive(item.children[0].id);
    else setActive(item.id);
  }

  return (
    <div className="nav-group">
      <button className={`nav-item ${sectionActive ? "active" : ""}`} onClick={clickMain} type="button">
        {Icon && <Icon size={17} />}
        <span>{item.label}</span>
        {countMap[item.id] !== undefined && <small>{countMap[item.id]}</small>}
      </button>

      {item.children && (sectionActive || item.id === "networking") && (
        <div className="subnav">
          {item.children.map(child => (
            <button
              type="button"
              key={child.id}
              className={`subnav-item ${active === child.id ? "active" : ""}`}
              onClick={() => setActive(child.id)}
            >
              {child.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Page(props) {
  const { active, data, counts, health, query, selectedItem, setSelectedItem, onEdit, onDelete } = props;

  if (active === "dashboard") return <Dashboard data={data} counts={counts} health={health} query={query} setActive={props.setActive} />;
  if (active === "assets") return <AssetsPage items={data.assets || []} query={query} selectedItem={selectedItem} setSelectedItem={setSelectedItem} onEdit={onEdit} onDelete={onDelete} />;
  if (active === "services") return <ServicesPage items={data.services || []} query={query} selectedItem={selectedItem} setSelectedItem={setSelectedItem} onEdit={onEdit} onDelete={onDelete} />;
  if (active === "runbooks") return <RunbooksPage items={data.runbooks || []} query={query} selectedItem={selectedItem} setSelectedItem={setSelectedItem} onEdit={onEdit} onDelete={onDelete} />;
  if (active === "documents") return <DocumentsPage items={data.docs || []} collection="docs" query={query} selectedItem={selectedItem} setSelectedItem={setSelectedItem} onEdit={onEdit} onDelete={onDelete} />;
  if (active === "projects-security") return <ProjectsSecurityPage items={data.projectsSecurity || []} query={query} selectedItem={selectedItem} setSelectedItem={setSelectedItem} onEdit={onEdit} onDelete={onDelete} />;
  if (active === "secret-references") return <SecretReferencesPage items={data.secrets || []} query={query} selectedItem={selectedItem} setSelectedItem={setSelectedItem} onEdit={onEdit} onDelete={onDelete} />;
  if (active === "networking-overview") return <NetworkingOverview data={data} query={query} selectedItem={selectedItem} setSelectedItem={setSelectedItem} onEdit={onEdit} onDelete={onDelete} />;
  if (active === "physical-port-map") return <PhysicalPortMap />;
  if (active === "interactive-topology") return <InteractiveTopology />;
  if (active === "topology-map") return <UniFiLivePage section="topology" />;
  if (active === "unifi-devices") return <UniFiLivePage section="devices" />;
  if (active === "clients") return <UniFiLivePage section="clients" />;
  if (active === "wireless") return <UniFiLivePage section="wireless" />;
  if (active === "networks-vlans") return <UniFiLivePage section="networks" />;
  if (active === "raw-data") return <UniFiLivePage section="raw" />;
  if (["monitoring", "maintenance", "backups", "integrations", "audit"].includes(active)) return <OperationsPage section={active} data={data} onEdit={onEdit} onDelete={onDelete} />;

  return <EmptyState title="Page coming soon" message="This section is ready for future expansion." />;
}

function LoadingPanel() {
  return (
    <div className="loading-panel">
      <div className="spinner" />
      <div>
        <strong>Loading Homelab Docs...</strong>
        <p>Pulling local data from the v2 API.</p>
      </div>
    </div>
  );
}

function Dashboard({ data, counts, health, query }) {
  const d = normalizeData(data);
  const recentActivity = sortByUpdated(d.activity.map(a => ({ ...a, updatedAt: a.at }))).slice(0, 6);
  const recentDocs = sortByUpdated([...d.docs, ...d.runbooks]).filter(item => searchMatch(item, query)).slice(0, 6);
  const services = d.services || [];
  const activeServices = services.filter(s => String(s.status || "").toLowerCase().includes("active"));

  const stats = [
    { label: "Assets", value: counts.assets, icon: Boxes, note: "Inventory" },
    { label: "Services", value: counts.services, icon: Server, note: `${counts.activeServices} active` },
    { label: "Runbooks", value: counts.runbooks, icon: Activity, note: `${counts.readyRunbooks} ready` },
    { label: "Documents", value: counts.docs, icon: FileText, note: `${counts.projects} projects` },
    { label: "Secrets", value: counts.secrets, icon: KeyRound, note: "references only" }
  ];

  return (
    <section className="dashboard-v2">
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow">Command Center</div>
          <h2>Homelab Glue Operations Portal</h2>
          <p>
            A polished, self-hosted knowledge base for your homelab: infrastructure inventory,
            Docker services, networking, runbooks, security projects, and secret references.
          </p>
          <div className="hero-chips">
            <span>{health?.storage || "SQLite"} storage</span>
            <span>Auth: {health?.auth || "local"}</span>
            <span>{health?.ok ? "API healthy" : "API local/offline"}</span>
          </div>
        </div>
        <div className="migration-score">
          <strong>96%</strong>
          <span>Polished</span>
        </div>
      </div>

      <div className="dashboard-stat-grid">
        {stats.map(stat => <StatCard key={stat.label} {...stat} />)}
      </div>

      <div className="dashboard-two-col">
        <section className="panel elevated">
          <PanelTitle eyebrow="Operations" title="Core Runtime" />
          <div className="runtime-grid">
            <RuntimeRow label="Storage" value={health?.storage || "Local"} detail="Atomic persistent records" />
            <RuntimeRow label="Authentication" value={health?.auth || "Off"} detail="Admin and read-only roles" />
            <RuntimeRow label="Version" value={health?.version || "3.0.0"} detail="React/Vite + Express" />
            <RuntimeRow label="API" value={health?.ok ? "Healthy" : "Unknown"} detail={health?.time || "Refresh to re-check"} />
          </div>
        </section>

        <section className="panel elevated">
          <PanelTitle eyebrow="Service Snapshot" title="Active Services" />
          <div className="mini-list">
            {activeServices.slice(0, 7).map(service => (
              <div className="mini-row" key={service.id || service.name}>
                <span className="status-dot good" />
                <div>
                  <strong>{service.name}</strong>
                  <small>{service.url || `${service.host || "LAB-SERVER-01"}:${service.port || ""}`}</small>
                </div>
              </div>
            ))}
            {!activeServices.length && <EmptyInline message="No active services documented yet." />}
          </div>
        </section>
      </div>

      <div className="dashboard-two-col wide-left">
        <section className="panel elevated">
          <PanelTitle eyebrow="Recently Touched" title="Latest Docs & Runbooks" />
          <div className="cards compact-cards">
            {recentDocs.map(item => (
              <article className="doc-card compact" key={`${item.id}-${displayName(item)}`}>
                <div className="doc-card-head">
                  <div>
                    <div className="doc-title">{displayName(item)}</div>
                    <div className="doc-meta">{item.category || item.displayCategory || "Uncategorized"}</div>
                  </div>
                  <span className={badgeClass(item.status || item.displayStatus || "Ready")}>{item.status || item.displayStatus || "Ready"}</span>
                </div>
                <p>{clip(stripHtml(displaySummary(item)), 190)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel elevated">
          <PanelTitle eyebrow="Audit" title="Recent Activity" />
          <div className="timeline">
            {recentActivity.map(activity => (
              <div className="timeline-item" key={activity.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>{activity.itemName || activity.itemId || "Item"}</strong>
                  <small>{activity.action || "updated"} · {activity.collection || "data"} · {formatDate(activity.at)}</small>
                </div>
              </div>
            ))}
            {!recentActivity.length && <EmptyInline message="No activity events recorded yet." />}
          </div>
        </section>
      </div>

      <section className="panel elevated">
        <PanelTitle eyebrow="Migration" title="Finish Line Checklist" />
        <div className="migration-grid">
          {[
            ["Dashboard shell", "Complete", "Polished command center with search and runtime cards."],
            ["CRUD flows", "Complete", "Create, edit, delete for docs, assets, services, runbooks, networking, and secrets."],
            ["Networking", "Complete", "Manual physical map plus live UniFi-ready pages."],
            ["Runbooks", "Complete", "Structured runbook view with steps, impact, and notes."],
            ["Deploy package", "Complete", "Ready to zip, copy back to /opt, and rebuild."],
            ["Operations layer", "Complete", "Auth, SQLite, monitoring, maintenance, backups, revisions, notifications, and connectors."]
          ].map(([name, status, note]) => (
            <div className="migration-card" key={name}>
              <div className="migration-card-head">
                <strong>{name}</strong>
                <span className={status === "Complete" ? "migration-status good" : "migration-status warn"}>{status}</span>
              </div>
              <p>{note}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function StatCard({ label, value, icon: Icon, note }) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{Icon && <Icon size={19} />}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      <p>{note}</p>
    </article>
  );
}

function RuntimeRow({ label, value, detail }) {
  return (
    <div className="runtime-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function PanelTitle({ eyebrow, title, children }) {
  return (
    <div className="panel-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function AssetsPage(props) {
  const { items, query, selectedItem, setSelectedItem, onEdit, onDelete } = props;
  const filtered = sortByUpdated(items).filter(item => searchMatch(item, query));
  const stats = [
    ["Total Assets", items.length],
    ["Active", items.filter(i => /active/i.test(i.status || "")).length],
    ["Servers", items.filter(i => /server|docker|linux|windows/i.test(`${i.type} ${i.tags}`)).length],
    ["Endpoints", items.filter(i => /pc|workstation|gaming|endpoint/i.test(`${i.type} ${i.tags} ${i.name}`)).length]
  ];

  if (selectedItem) {
    return <DetailView title="Asset Detail" collection="assets" item={selectedItem} onBack={() => setSelectedItem(null)} onEdit={onEdit} onDelete={onDelete} />;
  }

  return (
    <section className="page-stack">
      <StatsStrip stats={stats} />
      <div className="cards asset-grid">
        {filtered.map(asset => (
          <article className="doc-card clickable-card" key={asset.id || asset.name} onClick={() => setSelectedItem(asset)}>
            <div className="doc-card-head">
              <div>
                <div className="doc-title">{asset.name || asset.hostname || "Unnamed Asset"}</div>
                <div className="doc-meta">{asset.type || "Asset"} · {asset.owner || "Unassigned"}</div>
              </div>
              <span className={badgeClass(asset.status || "Unknown")}>{asset.status || "Unknown"}</span>
            </div>
            <div className="kv-grid small">
              <KeyValue label="IP" value={asset.ip || "—"} />
              <KeyValue label="Owner" value={asset.owner || "—"} />
            </div>
            <p>{clip(stripHtml(displaySummary(asset)), 220)}</p>
            <Tags tags={tagList(asset)} />
            <CardActions collection="assets" item={asset} onEdit={onEdit} onDelete={onDelete} />
          </article>
        ))}
        {!filtered.length && <EmptyState title="No assets found" message="Create your first asset or adjust the search filter." />}
      </div>
    </section>
  );
}

function ServicesPage(props) {
  const { items, query, selectedItem, setSelectedItem, onEdit, onDelete } = props;
  const filtered = sortByUpdated(items).filter(item => searchMatch(item, query));
  const categories = [...new Set(items.map(s => s.category || "Other"))].sort();
  const stats = [
    ["Services", items.length],
    ["Active", items.filter(i => /active/i.test(i.status || "")).length],
    ["Categories", categories.length],
    ["LAB-SERVER-01", items.filter(i => /lab-server-01/i.test(i.host || "")).length]
  ];

  if (selectedItem) {
    return <DetailView title="Service Detail" collection="services" item={selectedItem} onBack={() => setSelectedItem(null)} onEdit={onEdit} onDelete={onDelete} />;
  }

  return (
    <section className="page-stack">
      <StatsStrip stats={stats} />
      <div className="category-rail">
        {categories.map(category => <span key={category}>{category}</span>)}
      </div>
      <div className="cards service-grid">
        {filtered.map(service => (
          <article className="doc-card service-card clickable-card" key={service.id || service.name} onClick={() => setSelectedItem(service)}>
            <div className="doc-card-head">
              <div>
                <div className="doc-title">{service.name || "Unnamed Service"}</div>
                <div className="doc-meta">{service.category || "Service"} · {service.host || "LAB-SERVER-01"}</div>
              </div>
              <span className={badgeClass(service.status || "Unknown")}>{service.status || "Unknown"}</span>
            </div>
            <div className="service-url-row">
              <Globe2 size={15} />
              {service.url ? <a href={service.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{service.url}</a> : <span>No URL</span>}
            </div>
            <div className="kv-grid small">
              <KeyValue label="Port" value={service.port || "—"} />
              <KeyValue label="Image" value={clip(service.image || "—", 36)} />
            </div>
            <p>{clip(stripHtml(service.notes || service.summary || "No service notes documented yet."), 220)}</p>
            <Tags tags={tagList(service)} />
            <CardActions collection="services" item={service} onEdit={onEdit} onDelete={onDelete} />
          </article>
        ))}
        {!filtered.length && <EmptyState title="No services found" message="Create a service entry or adjust the search filter." />}
      </div>
    </section>
  );
}

function DocumentsPage({ items, collection, query, selectedItem, setSelectedItem, onEdit, onDelete }) {
  const filtered = sortByUpdated(items).filter(item => searchMatch(item, query));
  const categories = [...new Set(filtered.map(i => i.category || "Uncategorized"))].sort();

  if (selectedItem) {
    return <DetailView title="Document Detail" collection={collection} item={selectedItem} onBack={() => setSelectedItem(null)} onEdit={onEdit} onDelete={onDelete} />;
  }

  return (
    <section className="page-stack">
      <div className="category-rail">{categories.slice(0, 16).map(category => <span key={category}>{category}</span>)}</div>
      <div className="cards document-grid">
        {filtered.map(doc => (
          <DocumentCard key={doc.id || doc.title} item={doc} collection={collection} setSelectedItem={setSelectedItem} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {!filtered.length && <EmptyState title="No documents found" message="Create a document or adjust the search filter." />}
      </div>
    </section>
  );
}

function DocumentCard({ item, collection, setSelectedItem, onEdit, onDelete }) {
  return (
    <article className="doc-card clickable-card" onClick={() => setSelectedItem(item)}>
      <div className="doc-card-head">
        <div>
          <div className="doc-title">{displayName(item)}</div>
          <div className="doc-meta">{item.category || "Uncategorized"} · {formatDate(item.updatedAt || item.createdAt)}</div>
        </div>
        <span className={badgeClass(item.status || "Doc")}>{item.status || item.type || "Doc"}</span>
      </div>
      <p>{clip(stripHtml(displaySummary(item)), 260)}</p>
      <Tags tags={tagList(item)} />
      <CardActions collection={collection} item={item} onEdit={onEdit} onDelete={onDelete} />
    </article>
  );
}

function RunbooksPage(props) {
  const { items, query, selectedItem, setSelectedItem, onEdit, onDelete } = props;
  const filtered = sortByUpdated(items).filter(item => searchMatch(item, query));
  const stats = [
    ["Runbooks", items.length],
    ["Ready", items.filter(i => /ready/i.test(i.displayStatus || i.status || "")).length],
    ["High Impact", items.filter(i => /high|critical/i.test(i.displayImpact || "")).length],
    ["Categories", new Set(items.map(i => i.displayCategory || i.category || "Other")).size]
  ];

  if (selectedItem) {
    return <RunbookDetail item={selectedItem} onBack={() => setSelectedItem(null)} onEdit={onEdit} onDelete={onDelete} />;
  }

  return (
    <section className="page-stack">
      <StatsStrip stats={stats} />
      <div className="cards runbook-grid">
        {filtered.map(runbook => (
          <article className="doc-card runbook-card clickable-card" key={runbook.id || runbook.title} onClick={() => setSelectedItem(runbook)}>
            <div className="doc-card-head">
              <div>
                <div className="doc-title">{runbook.displayName || runbook.title || "Untitled Runbook"}</div>
                <div className="doc-meta">{runbook.displayCategory || runbook.category || "Operations"}</div>
              </div>
              <span className={badgeClass(runbook.displayStatus || runbook.status || "Draft")}>{runbook.displayStatus || runbook.status || "Draft"}</span>
            </div>
            <div className="runbook-meta-row">
              <span><Gauge size={14} />{runbook.displayImpact || "Normal"}</span>
              <span><Terminal size={14} />{Array.isArray(runbook.steps) ? runbook.steps.length : 0} steps</span>
            </div>
            <p>{clip(stripHtml(runbook.summary || runbook.notes || runbook.body || "No runbook summary documented yet."), 230)}</p>
            <Tags tags={tagList(runbook)} />
            <CardActions collection="runbooks" item={runbook} onEdit={onEdit} onDelete={onDelete} />
          </article>
        ))}
        {!filtered.length && <EmptyState title="No runbooks found" message="Create a runbook or adjust the search filter." />}
      </div>
    </section>
  );
}

function RunbookDetail({ item, onBack, onEdit, onDelete }) {
  const steps = Array.isArray(item.steps) ? item.steps : [];
  const [completed, setCompleted] = useState([]);
  const [recorded, setRecorded] = useState(false);
  async function recordExecution() {
    await api("/api/runbookExecutions", { method: "POST", body: JSON.stringify({ runbookId: item.id, name: `${item.title || item.id} execution`, status: completed.length === steps.length ? "Complete" : "Partial", completedSteps: completed, totalSteps: steps.length, executedAt: new Date().toISOString() }) });
    setRecorded(true);
  }
  return (
    <section className="detail-page">
      <DetailHeader title={item.displayName || item.title || "Runbook"} subtitle={item.category || item.displayCategory || "Operations"} onBack={onBack} actions={<HeaderActions collection="runbooks" item={item} onEdit={onEdit} onDelete={onDelete} />} />
      <div className="detail-grid">
        <article className="panel elevated detail-main">
          <PanelTitle eyebrow="Procedure" title="Execution Steps" />
          {steps.length ? (
            <ol className="step-list checklist">
              {steps.map((step, idx) => <li key={`${idx}-${step}`}><label><input type="checkbox" checked={completed.includes(idx)} onChange={() => setCompleted(value => value.includes(idx) ? value.filter(n => n !== idx) : [...value, idx])} />{step}</label></li>)}
            </ol>
          ) : (
            <RenderedBody value={item.body || item.summary || "No steps documented."} />
          )}
          {!!steps.length && <button className="btn" onClick={recordExecution} disabled={recorded}>{recorded ? "Execution recorded" : "Record execution"}</button>}
          {item.validation && <p><strong>Validation:</strong> {item.validation}</p>}
          {item.rollback && <p><strong>Rollback:</strong> {item.rollback}</p>}
        </article>
        <aside className="panel elevated detail-side">
          <PanelTitle eyebrow="Runbook" title="Metadata" />
          <KeyValue label="Status" value={item.displayStatus || item.status || "Draft"} />
          <KeyValue label="Impact" value={item.displayImpact || "Normal"} />
          <KeyValue label="Category" value={item.displayCategory || item.category || "Operations"} />
          <KeyValue label="Updated" value={formatDate(item.updatedAt)} />
          <Tags tags={tagList(item)} />
          {item.notes && <p className="side-note">{item.notes}</p>}
        </aside>
      </div>
    </section>
  );
}

function ProjectsSecurityPage({ items, query, selectedItem, setSelectedItem, onEdit, onDelete }) {
  const groups = [
    { id: "Projects Patching", label: "Projects Patching", match: item => /Projects Patching/i.test(item.category || "") },
    { id: "Security Patching", label: "Security Patching", match: item => /Security Patching/i.test(item.category || "") },
    { id: "Change Log", label: "Change Log", match: item => /change|log|history/i.test(item.category || "") },
    { id: "Other", label: "Other", match: item => !/Projects Patching|Security Patching|change|log|history/i.test(item.category || "") }
  ];
  const [folder, setFolder] = useState(groups[0].id);
  const activeGroup = groups.find(g => g.id === folder) || groups[0];
  const filtered = sortByUpdated(items).filter(activeGroup.match).filter(item => searchMatch(item, query));

  if (selectedItem) {
    return <DetailView title="Project/Security Detail" collection="docs" item={selectedItem} onBack={() => setSelectedItem(null)} onEdit={onEdit} onDelete={onDelete} />;
  }

  return (
    <section className="project-page">
      <aside className="project-folders">
        {groups.map(group => (
          <button className={`project-folder ${folder === group.id ? "active" : ""}`} key={group.id} onClick={() => setFolder(group.id)}>
            <span>{group.label}</span>
            <strong>{items.filter(group.match).length}</strong>
          </button>
        ))}
      </aside>
      <div className="project-docs">
        <PanelTitle eyebrow="Folder" title={activeGroup.label}><span className="count-pill">{filtered.length} docs</span></PanelTitle>
        <div className="cards document-grid">
          {filtered.map(doc => <DocumentCard key={doc.id || doc.title} item={doc} collection="docs" setSelectedItem={setSelectedItem} onEdit={onEdit} onDelete={onDelete} />)}
          {!filtered.length && <EmptyState title="No project docs found" message="Create a Projects/Security entry or switch folders." />}
        </div>
      </div>
    </section>
  );
}

function SecretReferencesPage({ items, query, selectedItem, setSelectedItem, onEdit, onDelete }) {
  const filtered = sortByUpdated(items).filter(item => searchMatch(item, query));
  if (selectedItem) {
    return <DetailView title="Secret Reference" collection="secrets" item={selectedItem} onBack={() => setSelectedItem(null)} onEdit={onEdit} onDelete={onDelete} />;
  }
  return (
    <section className="page-stack">
      <div className="security-banner">
        <Shield size={18} />
        <div><strong>Reference-only vault map.</strong> Do not store raw passwords, API keys, seed phrases, or recovery codes here.</div>
      </div>
      <div className="cards secret-grid">
        {filtered.map(secret => (
          <article className="doc-card clickable-card" key={secret.id || secret.name} onClick={() => setSelectedItem(secret)}>
            <div className="doc-card-head">
              <div>
                <div className="doc-title">{secret.name || secret.title || "Secret Reference"}</div>
                <div className="doc-meta">{secret.location || "External vault"}</div>
              </div>
              <span className="status-badge warn">Reference</span>
            </div>
            <KeyValue label="Related" value={secret.related || "—"} />
            <KeyValue label="Rotation" value={secret.rotation || "—"} />
            <p>{clip(secret.notes || "No notes documented yet.", 220)}</p>
            <CardActions collection="secrets" item={secret} onEdit={onEdit} onDelete={onDelete} />
          </article>
        ))}
        {!filtered.length && <EmptyState title="No secret references found" message="Create a reference to document where a credential is stored." />}
      </div>
    </section>
  );
}

function NetworkingOverview({ data, query, selectedItem, setSelectedItem, onEdit, onDelete }) {
  const items = sortByUpdated(data.networking || []).filter(item => searchMatch(item, query));
  const core = [
    { name: "Gateway Appliance", role: "Firewall / Router / DHCP", ip: "10.0.0.1", status: "Active", notes: "Primary gateway for LAN and VLAN routing." },
    { name: "LAB-DC-01", role: "Domain Controller / DNS", ip: "10.0.10.5", status: "Active", notes: "Primary DC and DNS for lab.example." },
    { name: "LAB-SERVER-01", role: "Docker Production Host", ip: "10.0.10.10", status: "Active", notes: "Hosts Homelab Docs Portal, dashboard, monitoring, storage, and automation tooling." },
    { name: "ADMIN-WS-01", role: "Admin Workstation", ip: "10.0.20.25", status: "Active", notes: "Example admin workstation used for management and operations." }
  ];

  if (selectedItem) {
    return <DetailView title="Networking Note" collection="networking" item={selectedItem} onBack={() => setSelectedItem(null)} onEdit={onEdit} onDelete={onDelete} />;
  }

  return (
    <section className="networking-page page-stack">
      <div className="network-hero">
        <div>
          <div className="eyebrow">Network Source of Truth</div>
          <h2>LAN, VLAN, DNS, and Core Infrastructure</h2>
          <p>Static source-of-truth notes paired with live UniFi connector pages for topology, devices, clients, wireless, VLANs, and raw data.</p>
        </div>
        <div className="network-stats">
          <NetworkStat label="Notes" value={items.length} />
          <NetworkStat label="Core" value={core.length} />
          <NetworkStat label="Server VLAN" value="Prod" />
          <NetworkStat label="DNS" value="AD" />
        </div>
      </div>

      <div className="network-flow-panel">
        <div className="network-flow">
          <span>Internet</span><strong>→</strong><span>ISP Modem</span><strong>→</strong><span>UniFi Gateway</span><strong>→</strong><span>Access Switch 01</span><strong>→</strong><span>LAB-SERVER-01 / Servers / AP</span>
        </div>
      </div>

      <div className="network-grid">
        {core.map(item => (
          <article className="network-card" key={item.name}>
            <div className="network-card-head">
              <div><div className="network-title">{item.name}</div><div className="doc-meta">{item.role}</div></div>
              <span className="status-badge good">{item.status}</span>
            </div>
            <div className="network-chip-row"><span>IP: {item.ip}</span><span>{item.role}</span></div>
            <p>{item.notes}</p>
          </article>
        ))}
      </div>

      <section className="panel elevated">
        <PanelTitle eyebrow="Network Notes" title="Documented Items"><span className="count-pill">{items.length}</span></PanelTitle>
        <div className="cards network-note-grid">
          {items.map(item => (
            <article className="doc-card clickable-card" key={item.id || item.name} onClick={() => setSelectedItem(item)}>
              <div className="doc-card-head">
                <div><div className="doc-title">{item.name}</div><div className="doc-meta">{item.type || "Network"} · {item.ip || "No IP"}</div></div>
                <span className={badgeClass(item.status || "Active")}>{item.status || "Active"}</span>
              </div>
              <p>{clip(item.notes || item.summary || "No networking notes documented.", 240)}</p>
              <Tags tags={tagList(item)} />
              <CardActions collection="networking" item={item} onEdit={onEdit} onDelete={onDelete} />
            </article>
          ))}
          {!items.length && <EmptyState title="No network notes found" message="Create a networking entry for VLANs, DNS, or gateway changes." />}
        </div>
      </section>
    </section>
  );
}

function NetworkStat({ label, value }) {
  return <div className="network-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function PhysicalPortMap() {
  const gatewayPorts = [
    ["WAN", "ISP Modem", "ISP uplink", "WAN", "Active"],
    ["LAN 1", "Access Switch 01", "Managed switch", "LAN / Trunks", "Active"],
    ["LAN 2", "ADMIN-WS-01", "10.0.20.25", "Trusted LAN", "Active"],
    ["LAN 3", "LAB-SERVER-01", "10.0.10.10", "Server VLAN", "Active"],
    ["LAN 4", "Available", "Unused", "None", "Empty"]
  ];
  const switchPorts = [
    ["SW01-1", "Uplink", "UniFi Gateway LAN 1", "LAN / Trunks", "Active"],
    ["SW01-2", "LAB-FILE-01", "10.0.10.20", "Trusted LAN", "Active"],
    ["SW01-3", "LAB-FILE-02", "10.0.10.21", "Trusted LAN", "Active"],
    ["SW01-4", "LAB-DC-01", "10.0.10.5", "Trusted LAN", "Active"],
    ["SW01-5", "LAB-HV-01", "10.0.10.30", "Trusted LAN", "Active"],
    ["SW01-6", "UniFi AP / PoE", "Wireless VLANs", "LAN / IoT / Guest", "Active"],
    ["SW01-7", "Lab / Endpoint", "Reserved", "Trusted LAN", "Planned"],
    ["SW01-8", "Available", "Unused", "None", "Empty"]
  ];

  return (
    <section className="physical-map-page page-stack">
      <div className="network-flow-panel">
        <PanelTitle eyebrow="Physical Flow" title="Cable Path" />
        <div className="network-flow"><span>Internet</span><strong>→</strong><span>ISP</span><strong>→</strong><span>Gateway Appliance</span><strong>→</strong><span>SW01</span><strong>→</strong><span>Servers / AP / Endpoints</span></div>
      </div>
      <PortSection title="Gateway Appliance" eyebrow="Gateway" ports={gatewayPorts} />
      <PortSection title="Access Switch 01 / GS308Ev4" eyebrow="Distribution" ports={switchPorts} />
    </section>
  );
}

function PortSection({ title, eyebrow, ports }) {
  return (
    <section className="panel elevated">
      <PanelTitle eyebrow={eyebrow} title={title}><span className="count-pill">{ports.length} ports</span></PanelTitle>
      <div className="port-grid">
        {ports.map(([port, name, target, vlan, status]) => (
          <article className={`port-card ${String(status).toLowerCase()}`} key={port}>
            <div className="port-id">{port}</div>
            <h3>{name}</h3>
            <p>{target}</p>
            <div className="network-chip-row"><span>{vlan}</span><span>{status}</span></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function InteractiveTopology() {
  return (
    <section className="page-stack">
      <div className="panel elevated topology-panel-head">
        <div>
          <PanelTitle eyebrow="Topology" title="Interactive Network Map" />
          <p>Embedded from the static public topology page. Use this as a quick visual map while the live UniFi connector fills in API data.</p>
        </div>
        <a className="btn ghost" href="/interactive-topology.html" target="_blank" rel="noreferrer"><ExternalLink size={16} />Open Full Page</a>
      </div>
      <iframe title="Interactive Topology" src="/interactive-topology.html" className="topology-frame" />
    </section>
  );
}

function UniFiLivePage({ section }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  async function load() {
    setState({ loading: true, data: null, error: null });
    try {
      const data = await api("/api/unifi/topology-v2");
      setState({ loading: false, data, error: null });
    } catch (err) {
      setState({ loading: false, data: null, error: err.message });
    }
  }

  useEffect(() => { load(); }, []);

  const payload = state.data;
  const counts = payload?.counts || {};

  return (
    <section className="unifi-live-page page-stack">
      <div className="unifi-live-hero panel elevated">
        <div>
          <div className="eyebrow">UniFi Connector</div>
          <h2>{PAGE_META[section === "devices" ? "unifi-devices" : section === "networks" ? "networks-vlans" : section === "topology" ? "topology-map" : section]?.title || "UniFi Live"}</h2>
          <p>{payload?.enabled === false ? payload.message : "Live view uses /api/unifi/topology-v2 when UNIFI_ENABLED=true."}</p>
        </div>
        <button className="btn ghost" onClick={load}><RefreshCw size={16} />Reload</button>
      </div>

      {state.loading && <LoadingPanel />}
      {state.error && <ErrorPanel message={state.error} />}
      {!state.loading && payload?.enabled === false && <ErrorPanel soft message="UniFi integration is disabled. Set UNIFI_ENABLED=true and configure UNIFI_HOST, UNIFI_USERNAME, UNIFI_PASSWORD, and UNIFI_SITE in .env." />}

      {payload?.enabled && (
        <>
          <StatsStrip stats={[
            ["Devices", counts.devices || 0],
            ["Clients", counts.clients || 0],
            ["Wired", counts.wiredClients || 0],
            ["Wireless", counts.wirelessClients || 0],
            ["Networks", counts.networks || 0],
            ["WLANs", counts.wlans || 0]
          ]} />
          {section === "devices" && <SimpleTable rows={payload.devices || []} columns={["name", "type", "model", "ip", "version"]} />}
          {section === "clients" && <SimpleTable rows={payload.clients || []} columns={["name", "ip", "network", "ssid", "vlan"]} />}
          {section === "wireless" && <SimpleTable rows={payload.wlans || []} columns={["name", "enabled", "security", "networkId"]} />}
          {section === "networks" && <SimpleTable rows={payload.networks || []} columns={["name", "purpose", "subnet", "vlan", "gateway"]} />}
          {section === "topology" && <TopologyNodes data={payload.topology} />}
          {section === "raw" && <pre className="raw-json">{JSON.stringify(payload, null, 2)}</pre>}
        </>
      )}
    </section>
  );
}

function TopologyNodes({ data }) {
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];
  return (
    <section className="panel elevated">
      <PanelTitle eyebrow="Topology" title="Nodes & Edges"><span className="count-pill">{nodes.length} nodes / {edges.length} edges</span></PanelTitle>
      <div className="topology-node-grid">
        {nodes.slice(0, 160).map(node => (
          <div className="topology-node" key={node.id || node.label}>
            <Network size={16} />
            <div><strong>{node.label}</strong><small>{node.type || "node"} · {node.ip || "no ip"}</small></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SimpleTable({ rows, columns }) {
  columns = columns.map(column => Array.isArray(column) ? column[0] : column);
  return (
    <section className="panel elevated table-panel">
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map(col => <th key={col}>{col}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id || row.mac || idx}>{columns.map(col => <td key={col}>{String(row[col] ?? "—")}</td>)}</tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <EmptyInline message="No rows returned from UniFi." />}
      </div>
    </section>
  );
}

function OperationsPage({ section, data, onEdit, onDelete }) {
  const [remote, setRemote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      if (section === "monitoring") setRemote(await api("/api/monitoring"));
      if (section === "backups") setRemote(await api("/api/backups"));
      if (section === "integrations") setRemote(await api("/api/integrations"));
      if (section === "maintenance") setRemote(await api("/api/maintenance-due?days=3650"));
      if (section === "audit") setRemote(data.activity || []);
    } catch (err) { setError(err.message); }
  }

  useEffect(() => { load(); }, [section]);

  async function action(path, options = {}) {
    setBusy(true); setError("");
    try { await api(path, { method: "POST", ...options }); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (error) return <ErrorPanel message={error} />;
  if (remote === null) return <LoadingPanel />;

  if (section === "monitoring") return (
    <section className="panel elevated">
      <PanelTitle eyebrow="Live checks" title="Service Health"><button className="btn" disabled={busy} onClick={() => action("/api/monitoring/check", { body: "{}" })}><RefreshCw size={16} />Check now</button></PanelTitle>
      <SimpleTable rows={remote.latest || []} columns={[
        ["serviceId", "Service"], ["ok", "Online", value => value ? "Yes" : "No"], ["statusCode", "HTTP"], ["responseMs", "Latency", value => value == null ? "—" : `${value} ms`], ["tlsExpiresAt", "TLS expires", formatDate], ["checkedAt", "Checked", formatDate]
      ]} />
      {!(remote.latest || []).length && <EmptyState title="No checks yet" message="Give services a URL or health URL, then run the first check." />}
    </section>
  );

  if (section === "maintenance") return (
    <section className="panel elevated">
      <PanelTitle eyebrow="Schedule" title="Maintenance Calendar" />
      <div className="cards">{remote.map(item => <article className="doc-card" key={item.id}>
        <div className="doc-card-head"><div><div className="doc-title">{item.name}</div><div className="doc-meta">{item.recurrence || "One-time"} · {item.owner || "Unassigned"}</div></div><span className={badgeClass(item.overdue ? "overdue" : item.status)}>{item.overdue ? "Overdue" : item.status}</span></div>
        <p>Due {formatDate(item.dueAt)} · {item.related || "No linked system"}</p><CardActions collection="maintenance" item={item} onEdit={onEdit} onDelete={onDelete} />
      </article>)}</div>
      {!remote.length && <EmptyState title="Nothing scheduled" message="Use New Entry to schedule patching, backup tests, certificate renewals, and rotations." />}
    </section>
  );

  if (section === "backups") return (
    <section className="panel elevated">
      <PanelTitle eyebrow="Portable data" title="Backup & Restore"><div className="detail-actions"><a className="btn ghost" href="/api/export">Download export</a><button className="btn" disabled={busy} onClick={() => action("/api/backups")}><Database size={16} />Create backup</button></div></PanelTitle>
      <ImportControl busy={busy} onImport={file => file.text().then(text => action("/api/import", { body: JSON.stringify({ data: JSON.parse(text), replace: true }) }))} />
      <SimpleTable rows={remote} columns={[["name", "Backup"], ["size", "Size", value => `${Math.ceil(value / 1024)} KB`], ["createdAt", "Created", formatDate]]} />
    </section>
  );

  if (section === "integrations") return (
    <section className="panel elevated">
      <PanelTitle eyebrow="Discovery" title="Connector Catalog" />
      <div className="hero-chips">{remote.available.map(name => <span key={name}>{name}</span>)}</div>
      <div className="cards">{remote.configured.map(item => <article className="doc-card" key={item.id}><div className="doc-title">{item.name}</div><p>{item.type} · {item.lastSyncStatus || item.status || "Not synced"}</p><div className="detail-actions"><button className="btn ghost" onClick={() => action(`/api/integrations/${encodeURIComponent(item.id)}/sync`)}>Preview sync</button><CardActions collection="connectors" item={item} onEdit={onEdit} onDelete={onDelete} /></div></article>)}</div>
      {!remote.configured.length && <EmptyState title="No connectors configured" message="Use New Entry to add an API URL, then preview its discovery payload before importing anything." />}
    </section>
  );

  return <section className="panel elevated"><PanelTitle eyebrow="Accountability" title="Activity Stream" /><SimpleTable rows={remote} columns={[["at", "When", formatDate], ["actor", "Actor"], ["action", "Action"], ["collection", "Collection"], ["itemName", "Item"]]} /></section>;
}

function ImportControl({ onImport, busy }) {
  return <label className="import-control">Restore JSON snapshot<input type="file" accept="application/json,.json" disabled={busy} onChange={event => event.target.files?.[0] && window.confirm("Replace current data with this snapshot? A safety backup will be created first.") && onImport(event.target.files[0])} /></label>;
}

function DetailView({ title, collection, item, onBack, onEdit, onDelete }) {
  const body = item.body || item.details || item.notes || item.summary || "No body documented yet.";
  const fields = Object.entries(item).filter(([key, value]) => !["body", "details", "notes", "summary", "steps", "tags", "attachments"].includes(key) && value !== null && value !== undefined && String(value) !== "");

  return (
    <section className="detail-page">
      <DetailHeader title={displayName(item)} subtitle={title} onBack={onBack} actions={<HeaderActions collection={collection} item={item} onEdit={onEdit} onDelete={onDelete} />} />
      <div className="detail-grid">
        <article className="panel elevated detail-main">
          <RenderedBody value={body} />
          {Array.isArray(item.attachments) && item.attachments.length > 0 && (
            <div className="attachment-list">
              <h3>Attachments</h3>
              {item.attachments.map(att => <a key={att.url || att.filename} href={att.url} target="_blank" rel="noreferrer"><Download size={14} />{att.originalName || att.filename || att.url}</a>)}
            </div>
          )}
        </article>
        <aside className="panel elevated detail-side">
          <PanelTitle eyebrow="Metadata" title="Entry Details" />
          {fields.slice(0, 14).map(([key, value]) => <KeyValue key={key} label={key} value={Array.isArray(value) ? value.join(", ") : String(value)} />)}
          <Tags tags={tagList(item)} />
        </aside>
      </div>
    </section>
  );
}

function DetailHeader({ title, subtitle, onBack, actions }) {
  return (
    <div className="detail-header">
      <button className="btn ghost" onClick={onBack}>← Back</button>
      <div><div className="eyebrow">{subtitle}</div><h2>{title}</h2></div>
      <div className="detail-actions">{actions}</div>
    </div>
  );
}

function HeaderActions({ collection, item, onEdit, onDelete }) {
  return (
    <>
      <button className="btn ghost" onClick={() => onEdit(collection, item)}><Edit3 size={15} />Edit</button>
      <button className="btn danger" onClick={() => onDelete(collection, item)}><Trash2 size={15} />Delete</button>
    </>
  );
}

function CardActions({ collection, item, onEdit, onDelete }) {
  return (
    <div className="card-actions" onClick={e => e.stopPropagation()}>
      <button className="icon-btn" onClick={() => onEdit(collection, item)} title="Edit"><Edit3 size={15} /></button>
      <button className="icon-btn danger" onClick={() => onDelete(collection, item)} title="Delete"><Trash2 size={15} /></button>
    </div>
  );
}

function StatsStrip({ stats }) {
  return <div className="stats-strip">{stats.map(([label, value]) => <div className="mini-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function KeyValue({ label, value }) {
  return <div className="key-value"><span>{humanize(label)}</span><strong>{value || "—"}</strong></div>;
}

function Tags({ tags }) {
  if (!tags?.length) return null;
  return <div className="tags">{tags.slice(0, 8).map(tag => <span key={tag}>{tag}</span>)}</div>;
}

function RenderedBody({ value }) {
  return <div className="rendered-body" dangerouslySetInnerHTML={{ __html: renderBody(value) }} />;
}

function EmptyState({ title, message }) {
  return (
    <div className="empty-state">
      <Database size={28} />
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

function EmptyInline({ message }) {
  return <div className="empty-inline">{message}</div>;
}

function ErrorPanel({ message, soft = false }) {
  return <div className={`error-panel ${soft ? "soft" : ""}`}><AlertTriangle size={18} /><span>{message}</span></div>;
}

function EditorModal({ editor, saving, onClose, onSave }) {
  const [item, setItem] = useState(() => ({ ...editor.item }));
  const [stepsText, setStepsText] = useState(Array.isArray(editor.item.steps) ? editor.item.steps.join("\n") : "");
  const [tagsText, setTagsText] = useState(Array.isArray(editor.item.tags) ? editor.item.tags.join(", ") : editor.item.tags || "");

  function setField(field, value) {
    setItem(prev => ({ ...prev, [field]: value }));
  }

  function submit(e) {
    e.preventDefault();
    const payload = {
      ...item,
      tags: tagsText.split(",").map(t => t.trim()).filter(Boolean)
    };
    if (editor.collection === "runbooks") {
      payload.steps = stepsText.split("\n").map(s => s.trim()).filter(Boolean);
    }
    onSave(payload);
  }

  const title = editor.mode === "create" ? `New ${humanize(editor.collection)}` : `Edit ${displayName(item)}`;

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-header">
          <div><div className="eyebrow">{editor.mode}</div><h2>{title}</h2></div>
          <button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="form-grid">
          <Field label="Title" value={item.title || ""} onChange={v => setField("title", v)} placeholder="Document or runbook title" />
          <Field label="Name" value={item.name || ""} onChange={v => setField("name", v)} placeholder="Friendly name" />
          <Field label="Category" value={item.category || item.displayCategory || ""} onChange={v => { setField("category", v); setField("displayCategory", v); }} placeholder="Category" />
          <Field label="Status" value={item.status || item.displayStatus || ""} onChange={v => { setField("status", v); setField("displayStatus", v); }} placeholder="Active, Ready, Draft" />
          <Field label="IP" value={item.ip || ""} onChange={v => setField("ip", v)} placeholder="10.0.x.x" />
          <Field label="URL" value={item.url || ""} onChange={v => setField("url", v)} placeholder="https://..." />
          <Field label="Port" value={item.port || ""} onChange={v => setField("port", v)} placeholder="8110" />
          <Field label="Host" value={item.host || item.hostname || ""} onChange={v => { setField("host", v); setField("hostname", v); }} placeholder="LAB-SERVER-01" />
          <Field label="Type" value={item.type || ""} onChange={v => setField("type", v)} placeholder="Server, Service, Document" />
          <Field label="Owner" value={item.owner || ""} onChange={v => setField("owner", v)} placeholder="Owner" />
          <Field label="Location" value={item.location || ""} onChange={v => setField("location", v)} placeholder="Vault / rack / provider" />
          <Field label="Rotation" value={item.rotation || ""} onChange={v => setField("rotation", v)} placeholder="Every 6 months" />
          <Field label="Related" value={item.related || ""} onChange={v => setField("related", v)} placeholder="Related system" />
          <Field label="Image" value={item.image || ""} onChange={v => setField("image", v)} placeholder="Docker image" />
          <Field label="Health URL" value={item.healthUrl || ""} onChange={v => setField("healthUrl", v)} placeholder="Optional dedicated health endpoint" />
          <Field label="Due At" value={item.dueAt || ""} onChange={v => setField("dueAt", v)} placeholder="2026-12-31T09:00:00Z" />
          <Field label="Recurrence" value={item.recurrence || ""} onChange={v => setField("recurrence", v)} placeholder="Monthly, quarterly, yearly" />
          <Field label="Asset ID" value={item.assetId || ""} onChange={v => setField("assetId", v)} placeholder="Linked asset ID" />
          <Field label="Service IDs" value={item.serviceIds || ""} onChange={v => setField("serviceIds", v)} placeholder="Comma-separated IDs" />
          <Field label="Runbook IDs" value={item.runbookIds || ""} onChange={v => setField("runbookIds", v)} placeholder="Comma-separated IDs" />
          <Field label="Secret Reference IDs" value={item.secretIds || ""} onChange={v => setField("secretIds", v)} placeholder="References only" />
        </div>

        <Field label="Tags" value={tagsText} onChange={setTagsText} placeholder="comma, separated, tags" />

        <label className="field-label">
          Summary
          <textarea className="small-textarea" value={item.summary || ""} onChange={e => setField("summary", e.target.value)} placeholder="Short summary" />
        </label>

        {editor.collection === "runbooks" && (<>
          <label className="field-label">
            Steps
            <textarea className="body-editor compact-editor" value={stepsText} onChange={e => setStepsText(e.target.value)} placeholder="One step per line" />
          </label>
          <Field label="Rollback" value={item.rollback || ""} onChange={v => setField("rollback", v)} placeholder="Rollback procedure" />
          <Field label="Validation" value={item.validation || ""} onChange={v => setField("validation", v)} placeholder="Success criteria" />
        </>)}

        <label className="field-label">
          Body / Notes / Details
          <textarea
            className="body-editor"
            value={item.body || item.notes || item.details || ""}
            onChange={e => {
              const value = e.target.value;
              setField("body", value);
              setField("notes", value);
              setField("details", value);
            }}
            placeholder="Markdown-ish text, HTML, commands, validation notes..."
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving}>{saving ? "Saving..." : "Save Entry"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="field-label">
      {label}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function badgeClass(value) {
  const text = String(value || "").toLowerCase();
  if (/active|ready|published|ok|online|complete|good/.test(text)) return "status-badge good";
  if (/warn|planned|draft|progress|next|pending/.test(text)) return "status-badge warn";
  if (/down|fail|critical|stale|disabled|delete/.test(text)) return "status-badge danger";
  return "status-badge";
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function renderBody(body) {
  if (!body) return "<p>No documentation body yet.</p>";
  const text = String(body);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\n/g, "<br />");
}

function clip(value, length = 120) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString([], { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function humanize(value) {
  return String(value || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

createRoot(document.getElementById("root")).render(<App />);
