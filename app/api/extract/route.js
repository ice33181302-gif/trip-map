// POST /api/extract  { url?: string, text?: string }
// → { title, region, sourceUrl, days: [{ day, places: [{ name, time, memo, match, candidates }] }] }
import { fetchContent } from "@/lib/fetchContent";
import { extractItinerary } from "@/lib/llm";
import { geocodePlace } from "@/lib/geocode";

export const runtime = "nodejs"; // jsdom 등 Node 전용 라이브러리를 쓰기 때문
export const maxDuration = 60; // LLM 응답이 길어질 수 있어요 (Vercel 기준 초)

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const url = body.url?.trim() || "";
  let text = body.text?.trim() || "";

  // 1) 본문 가져오기 (텍스트가 직접 오면 그걸 우선 사용)
  if (!text && url) {
    try {
      text = await fetchContent(url);
    } catch (e) {
      return Response.json({ error: e.message, needText: true }, { status: 422 });
    }
  }
  if (text.length < 50) {
    return Response.json(
      { error: "본문을 충분히 가져오지 못했어요. 글 내용을 복사해서 붙여넣어 주세요.", needText: true },
      { status: 422 }
    );
  }

  try {
    // 2) LLM으로 일정 추출
    const itinerary = await extractItinerary(text);
    if (itinerary.days.length === 0) {
      return Response.json({ error: "글에서 방문한 장소를 찾지 못했어요." }, { status: 422 });
    }

    // 3) 장소마다 좌표 찾기
    const days = await Promise.all(
      itinerary.days.map(async (d) => ({
        day: d.day,
        places: await Promise.all(
          d.places.map(async (p) => ({ ...p, ...(await geocodePlace(p, itinerary.region)) }))
        ),
      }))
    );

    return Response.json({ ...itinerary, days, sourceUrl: url || null });
  } catch (e) {
    console.error(e);
    // Gemini 무료 티어는 분당/일일 요청 한도가 있어서 초과 시 429를 돌려줍니다.
    if (e.status === 429 || e.message?.includes("429")) {
      return Response.json(
        { error: "무료 사용량을 잠시 다 썼어요. 1분 뒤 다시 시도해 주세요." },
        { status: 429 }
      );
    }
    return Response.json({ error: e.message || "처리 중 문제가 생겼어요." }, { status: 500 });
  }
}
