// GET  /api/trips/:id  → 저장된 일정 불러오기
// PUT  /api/trips/:id  { title, region, sourceUrl, days, ... } → 편집용 링크에서 수정한 내용 다시 저장
//      헤더 X-Edit-Token에 편집용 비밀값이 맞아야 저장돼요. (보기용 링크로는 저장 불가)
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

  const result = updateTrip(id, trip, req.headers.get("x-edit-token") || "");
  if (result === "not_found") {
    return Response.json({ error: "해당 일정을 찾을 수 없어요." }, { status: 404 });
  }
  if (result === "forbidden") {
    return Response.json({ error: "보기 전용 링크라 저장할 수 없어요." }, { status: 403 });
  }
  return Response.json({ ok: true });
}
