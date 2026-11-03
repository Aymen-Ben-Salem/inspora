import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { originalQuery, patchedQuery, prepareSessionQueryPatch } from "./databull-session-query.mjs";

test("session lookup preserves latest session, counts, site isolation and timestamp ties", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE sessions (id TEXT, site_id TEXT, visitor_id TEXT, started_at INTEGER, last_activity INTEGER, PRIMARY KEY(site_id,id));
      CREATE INDEX idx_sessions_site_started ON sessions(site_id,started_at);
      CREATE INDEX idx_sessions_site_activity ON sessions(site_id,last_activity);
      CREATE INDEX idx_sessions_visitor ON sessions(site_id,visitor_id,started_at);`);
    const insert = db.prepare("INSERT INTO sessions VALUES (?,?,?,?,?)");
    let seed = 741;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let i = 0; i < 2000; i++) {
      insert.run(`id-${2000-i}`, `site-${i%3}`, `visitor-${random()%150}`, random()%100000, random()%20);
    }
    // Index traversal by started_at would choose the wrong member of this tie.
    insert.run("tie-a", "ties", "same", 10, 100);
    insert.run("tie-b", "ties", "same", 1, 100);
    const before = db.prepare(originalQuery), after = db.prepare(patchedQuery);
    for (const site of ["site-0", "site-1", "site-2", "missing", "ties"]) {
      for (const visitor of [...Array.from({length:151},(_,i)=>`visitor-${i}`), "same", "new"]) {
        assert.deepEqual(after.get(site, visitor), before.get(site, visitor));
      }
    }
    assert.equal(after.get("ties", "same").id, "tie-b");
    assert.equal(after.get("ties", "same").n, 2);
    const plan = db.prepare("EXPLAIN QUERY PLAN "+patchedQuery).all("site-0", "visitor-1");
    assert.ok(plan.some(row=>row.detail.includes("idx_sessions_visitor (site_id=? AND visitor_id=?)")));
    assert.ok(!plan.some(row=>row.detail.includes("idx_sessions_site_activity")));
  } finally { db.close(); }
});

test("patch preparation refuses unrecognized or already modified vendor sources", () => {
  assert.throws(()=>prepareSessionQueryPatch(Buffer.from(originalQuery)),/Unrecognized/);
  assert.throws(()=>prepareSessionQueryPatch(Buffer.from(patchedQuery)),/Unrecognized/);
});
