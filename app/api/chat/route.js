// POST /api/chat  { trip, originalTrip, messages, message }
// → { reply, itinerary: { days: [...] } | null }
// AI에게는 장소를 id로만 알려주고 고르게 합니다. id → 실제 장소 객체(match 등) 치환은
// 이 파일에서만 하고, 여기서 못 찾은 id는 버립니다(환각 방지).
import { chatItinerary } from "@/lib/llm";

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

      const days = result.itinerary.days
        .map((d) => ({
          day: Number(d.day),
          places: (Array.isArray(d.places) ? d.places : []).map((p) => byId.get(p.id)).filter(Boolean),
        }))
        .filter((d) => Number.isFinite(d.day) && d.places.length > 0);

      const total = days.reduce((n, d) => n + d.places.length, 0);
      if (total > 0) itinerary = { days }; // 치환 결과가 0개면 null로 두고 답변만 보여줌
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
