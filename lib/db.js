// SQLite 연결. 저장된 여행 일정을 공유 링크로 다시 불러올 때 씁니다.
import Database from "better-sqlite3";
import { randomBytes } from "crypto";

const db = new Database("trips.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

function makeId() {
  return randomBytes(6).toString("base64url"); // URL에 넣기 좋은 짧은 랜덤 id
}

export function saveTrip(trip) {
  const id = makeId();
  db.prepare("INSERT INTO trips (id, data) VALUES (?, ?)").run(id, JSON.stringify(trip));
  return id;
}

export function getTrip(id) {
  const row = db.prepare("SELECT data FROM trips WHERE id = ?").get(id);
  return row ? JSON.parse(row.data) : null;
}

export function updateTrip(id, trip) {
  const result = db
    .prepare("UPDATE trips SET data = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(trip), id);
  return result.changes > 0;
}
