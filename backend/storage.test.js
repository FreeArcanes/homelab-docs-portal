import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { createStorage } from "./storage.js";

test("SQLite storage migrates, revisions, checks, and removes atomically", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homelab-glue-"));
  const legacy = path.join(dir, "data.json");
  fs.writeFileSync(legacy, JSON.stringify({ assets: [{ id: "host-1", name: "Host" }] }));
  const storage = createStorage({ dataDir: dir, legacyFile: legacy });

  assert.equal(storage.list("assets").length, 1);
  const created = storage.save("services", { id: "service-1", name: "Portal" }, "created", "tester");
  storage.save("services", { ...created, status: "Active" }, "updated", "tester");
  assert.equal(storage.get("services", "service-1").status, "Active");
  assert.equal(storage.revisions("services", "service-1").length, 2);

  storage.recordCheck({ serviceId: "service-1", ok: true, statusCode: 200, responseMs: 12, checkedAt: new Date().toISOString() });
  assert.equal(storage.checks("service-1")[0].ok, true);
  assert.equal(storage.remove("services", "service-1", "tester"), true);
  assert.equal(storage.get("services", "service-1"), null);
  storage.setSetting("setup.completed", true);
  assert.equal(storage.setting("setup.completed"), true);
  assert.equal(storage.setting("missing", "fallback"), "fallback");
  storage.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
