// POST /api/trips  { title, region, sourceUrl, days } → { id }
// 현재 화면의 일정을 저장하고 공유용 id를 발급합니다.
import { saveTrip } from "@/lib/db";

export const runtime = "nodejs"; // better-sqlite3는 Node 전용

export async function POST(req) {
  let trip;
  try {
    trip = await req.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  if (!Array.isArray(trip.days)) {
    return Response.json({ error: "저장할 일정이 없어요." }, { status: 400 });
  }

  const id = saveTrip(trip);
  return Response.json({ id });
}
