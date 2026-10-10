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

// 편집 권한 확인용 비밀값 칸. 예전에 만든 DB에는 이 칸이 없어서, 없을 때만 추가합니다.
// 이 칸이 비어 있는 옛 저장본은 아무도 수정할 수 없어요(보기 전용).
const columns = db.prepare("PRAGMA table_info(trips)").all();
if (!columns.some((c) => c.name === "edit_token")) {
  db.exec("ALTER TABLE trips ADD COLUMN edit_token TEXT");
}

function makeId() {
  return randomBytes(6).toString("base64url"); // URL에 넣기 좋은 짧은 랜덤 id
}

function makeEditToken() {
  return randomBytes(18).toString("base64url"); // 추측할 수 없게 id보다 훨씬 길게
}

// 저장하고 { id, editToken }을 돌려줍니다. editToken은 편집용 링크에만 들어가요.
export function saveTrip(trip) {
  const id = makeId();
  const editToken = makeEditToken();
  db.prepare("INSERT INTO trips (id, data, edit_token) VALUES (?, ?, ?)").run(id, JSON.stringify(trip), editToken);
  return { id, editToken };
}

export function getTrip(id) {
  const row = db.prepare("SELECT data FROM trips WHERE id = ?").get(id);
  return row ? JSON.parse(row.data) : null;
}

// 결과: "ok" | "not_found" | "forbidden"
export function updateTrip(id, trip, editToken) {
  const row = db.prepare("SELECT edit_token FROM trips WHERE id = ?").get(id);
  if (!row) return "not_found";
  if (!row.edit_token || !editToken || row.edit_token !== editToken) return "forbidden";
  db.prepare("UPDATE trips SET data = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(trip), id);
  return "ok";
}
