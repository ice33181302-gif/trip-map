// GET  /api/trips/:id  → 저장된 일정 불러오기
// PUT  /api/trips/:id  { title, region, sourceUrl, days } → 공유 화면에서 편집한 내용 다시 저장
import { getTrip, updateTrip } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const { id } = await params;
  const trip = getTrip(id);
  if (!trip) {
    return Response.json({ error: "해당 일정을 찾을 수 없어요." }, { status: 404 });
  }
  return Response.json(trip);
}

export async function PUT(req, { params }) {
  const { id } = await params;
  let trip;
  try {
    trip = await req.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  if (!Array.isArray(trip.days)) {
    return Response.json({ error: "저장할 일정이 없어요." }, { status: 400 });
  }

  const ok = updateTrip(id, trip);
  if (!ok) {
    return Response.json({ error: "해당 일정을 찾을 수 없어요." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
