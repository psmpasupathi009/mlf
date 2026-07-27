/**
 * Local MongoDB helper (when Atlas IP allowlist blocks this machine).
 *
 * Prisma Mongo requires a replica set — this starts a single-node rs0.
 *
 *   npx tsx scripts/mongo-local.ts start
 *   npx tsx scripts/mongo-local.ts stop
 *   npx tsx scripts/mongo-local.ts status
 *
 * Binary: .tools/mongodb  |  mongosh: .tools/mongosh  |  data: .data/mongo
 * DATABASE_URL=mongodb://127.0.0.1:27017/mlf?replicaSet=rs0&directConnection=true&maxPoolSize=20
 */
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createConnection } from "node:net";

const ROOT = process.cwd();
const BIN = join(ROOT, ".tools", "mongodb", "bin", "mongod");
const MONGOSH = join(ROOT, ".tools", "mongosh", "bin", "mongosh");
const DBPATH = join(ROOT, ".data", "mongo");
const LOGPATH = join(ROOT, ".data", "mongo-logs", "mongod.log");
const PORT = 27017;
const LOCAL_URL =
  "mongodb://127.0.0.1:27017/mlf?replicaSet=rs0&directConnection=true&maxPoolSize=20";

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection({ host: "127.0.0.1", port }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });
}

function ensureDirs() {
  mkdirSync(DBPATH, { recursive: true });
  mkdirSync(join(ROOT, ".data", "mongo-logs"), { recursive: true });
}

function initiateReplicaSet() {
  if (!existsSync(MONGOSH)) {
    console.warn(
      "mongosh missing at .tools/mongosh/bin/mongosh — initiate rs0 manually if needed"
    );
    return;
  }
  spawnSync(
    MONGOSH,
    [
      "--quiet",
      "--eval",
      'try { rs.status() } catch (e) { rs.initiate({_id:"rs0", members:[{_id:0, host:"127.0.0.1:27017"}]}) }',
    ],
    { encoding: "utf8" }
  );
}

async function waitPrimary(timeoutMs = 20000) {
  if (!existsSync(MONGOSH)) return;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = spawnSync(
      MONGOSH,
      ["--quiet", "--eval", "db.hello().isWritablePrimary"],
      { encoding: "utf8" }
    );
    if ((r.stdout || "").trim() === "true") return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function status() {
  const up = await portOpen(PORT);
  console.log(
    up
      ? `MongoDB listening on 127.0.0.1:${PORT}`
      : `MongoDB not running on 127.0.0.1:${PORT}`
  );
  if (!existsSync(BIN)) {
    console.log("Binary missing: .tools/mongodb/bin/mongod");
  }
  console.log(`Expected DATABASE_URL=${LOCAL_URL}`);
  process.exit(up ? 0 : 1);
}

async function start() {
  if (await portOpen(PORT)) {
    console.log(`Already running on 127.0.0.1:${PORT}`);
    initiateReplicaSet();
    await waitPrimary();
    console.log(`Use DATABASE_URL=${LOCAL_URL}`);
    return;
  }
  if (!existsSync(BIN)) {
    console.error(
      "Missing .tools/mongodb/bin/mongod — place MongoDB Community macOS build in .tools/mongodb"
    );
    process.exit(1);
  }
  ensureDirs();
  const r = spawnSync(
    BIN,
    [
      "--dbpath",
      DBPATH,
      "--bind_ip",
      "127.0.0.1",
      "--port",
      String(PORT),
      "--replSet",
      "rs0",
      "--logpath",
      LOGPATH,
      "--fork",
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || "mongod failed to start");
    process.exit(r.status ?? 1);
  }
  for (let i = 0; i < 25; i++) {
    if (await portOpen(PORT)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!(await portOpen(PORT))) {
    console.error("mongod forked but port never opened — see .data/mongo-logs/mongod.log");
    process.exit(1);
  }
  initiateReplicaSet();
  await waitPrimary();
  console.log(`Started MongoDB replica set rs0 on 127.0.0.1:${PORT}`);
  console.log(`Use DATABASE_URL=${LOCAL_URL}`);
}

function stop() {
  try {
    execFileSync("pkill", ["-f", `${BIN}`], { stdio: "ignore" });
  } catch {
    /* not running */
  }
  console.log("Stop signal sent (if mongod was running)");
}

const cmd = process.argv[2] ?? "status";
if (cmd === "start") void start();
else if (cmd === "stop") stop();
else if (cmd === "status") void status();
else {
  console.error("Usage: npx tsx scripts/mongo-local.ts [start|stop|status]");
  process.exit(1);
}
