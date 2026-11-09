const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

const port = 39871;
const base = `http://127.0.0.1:${port}`;
let child;
let executiveToken;
let managerToken;

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Server did not start in time");
}

before(async () => {
  child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: "test-secret-only",
      DEMO_EXECUTIVE_PASSWORD: "Executive123!",
      DEMO_MANAGER_PASSWORD: "Manager123!"
    },
    stdio: "ignore"
  });
  await waitForServer();

  const login = async (email, password) => {
    const r = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(r.status, 200);
    return (await r.json()).token;
  };
  executiveToken = await login("executive@cargolens.demo", "Executive123!");
  managerToken = await login("manager@cargolens.demo", "Manager123!");
});

after(() => {
  if (child && !child.killed) child.kill();
});

test("health endpoint responds", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test("seed shipment exposes 45 kg mismatch and missing BOL", async () => {
  const r = await fetch(base + "/api/shipments/SHP-24811", {
    headers: { Authorization: "Bearer " + executiveToken }
  });
  assert.equal(r.status, 200);
  const shipment = await r.json();
  assert.ok(shipment.checks.some(c => c.code === "WEIGHT_MISMATCH" && c.message.includes("45 kg")));
  assert.ok(shipment.checks.some(c => c.code === "MISSING_BOL"));
});

test("executive cannot read manager-only audit log", async () => {
  const r = await fetch(base + "/api/audit", {
    headers: { Authorization: "Bearer " + executiveToken }
  });
  assert.equal(r.status, 403);
});

test("manager can read audit log", async () => {
  const r = await fetch(base + "/api/audit", {
    headers: { Authorization: "Bearer " + managerToken }
  });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(await r.json()));
});
