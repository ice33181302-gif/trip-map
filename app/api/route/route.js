// POST /api/route  { points: [{ lat, lng }, ...] }  (한 일차의 장소 좌표들, 방문 순서대로)
// → { legs: [{ points, distance, time, mode } | null, ...] }
// legs[i]는 points[i] → points[i+1] 구간. null이면 조회 실패(프론트에서 직선으로 대체)
import { getRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const points = Array.isArray(body.points) ? body.points : [];
  if (points.length < 2) {
    return Response.json({ error: "경로를 구할 장소가 부족해요." }, { status: 400 });
  }

  const legs = await Promise.all(
    points.slice(0, -1).map((from, i) => getRoute(from, points[i + 1]))
  );

  return Response.json({ legs });
}
