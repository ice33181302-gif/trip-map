// POST /api/search-place  { query: string }
// → { candidates: [{ name, lat, lng, address, category, kakaoId, kakaoUrl }] }
// 위치를 못 찾은 장소를 사용자가 직접 검색어로 찾을 때 씁니다.
import { searchPlaces } from "@/lib/geocode";

export const runtime = "nodejs";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const query = body.query?.trim() || "";
  if (!query) {
    return Response.json({ error: "검색어를 입력해 주세요." }, { status: 400 });
  }

  try {
    const candidates = await searchPlaces(query);
    return Response.json({ candidates });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "검색 중 문제가 생겼어요." }, { status: 500 });
  }
}
