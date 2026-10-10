// POST /api/chat  { trip, pool, messages, message }
// → { reply, itinerary: { days: [...] } | null }
// pool은 장소 모음(lib/pool.js)이에요. AI는 모음에 있는 장소는 id로, 새로 추천하는 장소는 name/regionHint로 알려줍니다.
// id → 실제 장소 객체 치환과 새 장소 좌표 검색은 이 파일에서만 하고, 모음에 없는 id는 버립니다(환각 방지).
import { randomUUID } from "crypto";
import { chatItinerary } from "@/lib/llm";
import { geocodePlace } from "@/lib/geocode";

export const runtime = "nodejs";
export const maxDuration = 60; // LLM 응답이 길어질 수 있어요 (Vercel 기준 초)

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const { trip, pool, messages, message } = body;
  if (!Array.isArray(trip?.days) || !Array.isArray(pool?.places) || !Array.isArray(pool?.sources) || !message?.trim()) {
    return Response.json({ error: "요청 내용이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const result = await chatItinerary({
      pool,
      currentTrip: trip,
      history: Array.isArray(messages) ? messages.slice(-6) : [],
      message: message.trim(),
    });

    let itinerary = null;
    if (result.itinerary) {
      // 모음에 있는 id만 받아들입니다.
      // 실제 장소 객체는 현재 일정에서 먼저 찾아요. 사용자가 "다른 장소"로 위치를 고친 내용을 지키기 위해서예요.
      const poolById = new Map();
      for (const p of pool.places) if (p.id) poolById.set(p.id, p);
      const currentById = new Map();
      for (const d of trip.days) for (const p of d.places) if (p.id) currentById.set(p.id, p);
      // 모음용 sources 필드는 일정에 넣을 필요가 없어서 뺍니다.
      // ({ sources, ...rest }는 sources만 빼고 나머지 필드를 rest에 담는 문법이에요.)
      function resolveId(id) {
        if (!poolById.has(id)) return null;
        const { sources, ...place } = currentById.get(id) || poolById.get(id);
        return place;
      }
      // 새 장소 좌표 검색 기준 지역. 여행기가 여러 개면 첫 번째 여행기 지역을 써요.
      const region = trip.region || pool.sources[0]?.region || "";

      // id가 있으면 기존 장소, 없고 name만 있으면 새로 추천한 장소로 봅니다.
      // 새 장소는 실제로 좌표가 있는지 카카오 검색으로 확인합니다.
      const resolved = await Promise.all(
        result.itinerary.days.map(async (d) => {
          const places = await Promise.all(
            (Array.isArray(d.places) ? d.places : []).map(async (p) => {
              if (p.id) return resolveId(p.id);
              if (p.name?.trim()) {
                const { match, candidates } = await geocodePlace(
                  { name: p.name.trim(), regionHint: p.regionHint || "" },
                  region
                );
                return {
                  id: randomUUID(),
                  name: p.name.trim(),
                  regionHint: p.regionHint || "",
                  time: "",
                  memo: "",
                  match,
                  candidates,
                };
              }
              return null;
            })
          );
          return { day: Number(d.day), places: places.filter(Boolean) };
        })
      );

      const days = resolved.filter((d) => Number.isFinite(d.day) && d.places.length > 0);
      const total = days.reduce((n, d) => n + d.places.length, 0);
      if (total > 0) itinerary = { days }; // 결과가 0개면 null로 두고 답변만 보여줌
    }

    return Response.json({ reply: result.reply, itinerary });
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
