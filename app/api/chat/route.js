// POST /api/chat  { trip, originalTrip, messages, message }
// → { reply, itinerary: { days: [...] } | null }
// AI는 기존 장소는 id로, 새로 추천하는 장소는 name/regionHint로 알려줍니다.
// id → 실제 장소 객체 치환과 새 장소 좌표 검색은 이 파일에서만 하고, 못 찾은 id는 버립니다(환각 방지).
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

  const { trip, originalTrip, messages, message } = body;
  if (!trip?.days || !originalTrip?.days || !message?.trim()) {
    return Response.json({ error: "요청 내용이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const result = await chatItinerary({
      originalTrip,
      currentTrip: trip,
      history: Array.isArray(messages) ? messages.slice(-6) : [],
      message: message.trim(),
    });

    let itinerary = null;
    if (result.itinerary) {
      // id → 실제 장소 객체. 현재 일정에서 먼저 찾고, 없으면 원본에서 찾습니다.
      const byId = new Map();
      for (const d of trip.days) for (const p of d.places) if (p.id) byId.set(p.id, p);
      for (const d of originalTrip.days) for (const p of d.places) if (p.id && !byId.has(p.id)) byId.set(p.id, p);

      // id가 있으면 기존 장소, 없고 name만 있으면 새로 추천한 장소로 봅니다.
      // 새 장소는 실제로 좌표가 있는지 카카오 검색으로 확인합니다.
      const resolved = await Promise.all(
        result.itinerary.days.map(async (d) => {
          const places = await Promise.all(
            (Array.isArray(d.places) ? d.places : []).map(async (p) => {
              if (p.id) return byId.get(p.id) || null;
              if (p.name?.trim()) {
                const { match, candidates } = await geocodePlace(
                  { name: p.name.trim(), regionHint: p.regionHint || "" },
                  trip.region
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
