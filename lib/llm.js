// 여행기 텍스트 → 일차별 장소 목록(JSON)
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `너는 여행기에서 방문 일정을 뽑아내는 도우미야.
주어진 글을 읽고 아래 형식의 JSON만 출력해. 설명, 마크다운, 코드블록 없이 JSON만.

{
  "title": "여행 제목 (글에 없으면 지역과 기간으로 짧게 지어)",
  "region": "주요 여행 지역 (예: 부산, 제주)",
  "days": [
    {
      "day": 1,
      "places": [
        {
          "name": "지도에서 검색할 수 있는 정확한 장소명",
          "regionHint": "장소가 있는 시/구/동 (예: 부산 해운대구)",
          "time": "글에 나온 시간이나 시간대, 없으면 빈 문자열",
          "memo": "글쓴이가 남긴 한 줄 요약 (먹은 메뉴, 팁 등), 없으면 빈 문자열"
        }
      ]
    }
  ]
}

규칙:
- 글쓴이가 실제로 방문한 장소만, 방문한 순서대로 넣어.
- "근처 카페", "숙소"처럼 이름이 없는 곳은 빼. 숙소라도 이름이 있으면 넣어.
- 일차 구분이 없으면 모든 장소를 day 1에 넣어.
- 장소명은 간판 이름 그대로 쓰고, 지점명이 있으면 포함해 (예: "스타벅스 해운대점").
- 확실하지 않은 정보는 지어내지 말고 빈 문자열로 둬.`;

export async function extractItinerary(text) {
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    contents: `다음 여행기에서 일정을 뽑아줘.\n\n${text}`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json", // JSON만 받도록 강제
    },
  });

  const raw = response.text;

  // 혹시 코드블록으로 감싸서 답하면 벗겨냅니다.
  const json = raw.replace(/```json|```/g, "").trim();

  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("일정을 읽어내지 못했어요. 글 내용을 직접 붙여넣어 다시 시도해 보세요.");
  }

  // 최소한의 형태 보정
  const days = Array.isArray(data.days) ? data.days : [];
  return {
    title: data.title || "여행 일정",
    region: data.region || "",
    days: days
      .map((d, i) => ({
        day: Number(d.day) || i + 1,
        places: (Array.isArray(d.places) ? d.places : []).filter((p) => p?.name),
      }))
      .filter((d) => d.places.length > 0),
  };
}

const CHAT_SYSTEM_PROMPT = `너는 사용자의 여행 일정 조정을 돕는 도우미야.
사용자가 원하는 조건(분위기, 체력, 인원, 시간 등)을 말하면 대화하면서 일정을 조정해.

할 수 있는 조정:
- 기존 장소 빼기, 같은 일차 안에서 순서 바꾸기, 다른 일차로 옮기기
- 새 장소 추천해서 추가하기

규칙:
- 기존 장소(장소 모음에 있는 것)는 반드시 id로만 가리켜. name, area, from은 참고용이고 실제 식별자는 id야. id를 지어내지 마.
- 장소 모음은 여행기 순서, 일차 순서, 방문 순서대로 나열돼 있어. from은 그 장소가 나온 여행기 번호와 일차고, from이 빈 장소는 사용자가 직접 추가한 장소야.
- 현재 일정이 비어 있으면 장소 모음에서 골라 새 일정을 만들어. 며칠 일정인지 모르겠으면 먼저 물어봐도 돼. area가 가까운 장소끼리 같은 일차로 묶어.
- 여러 여행기에 함께 나온 장소(tripCount가 2 이상)는 여러 사람이 다녀간 곳이니 우선해서 고려해.
- 새 장소를 추천할 때는 id 없이 name(카카오맵에서 검색될 만한 정확한 상호명)과 regionHint(그 장소가 있는 시/구/동)만 줘.
  좌표는 신경 쓰지 마. 서버가 실제로 검색해서 찾아. 실존하지 않을 법한 이름을 지어내지 말고,
  확실하지 않으면 추천하지 마.
- 일정을 바꿀 필요가 없으면(질문에 답만 하거나 정보를 물어볼 때) itinerary는 null로 해.
- 일정을 바꿀 때는 itinerary.days에 "바뀐 뒤의 전체 일정"을 넣어. 바뀌지 않은 일차도 빠짐없이 포함해.
- reply는 사용자에게 보여줄 한국어 답변이야. 짧고 자연스럽게 해요체로 써. 새 장소를 추천했다면 왜 추천했는지도 한마디 덧붙여.`;

const CHAT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    itinerary: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        days: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              day: { type: Type.INTEGER },
              places: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, nullable: true }, // 기존 장소를 가리킬 때만
                    name: { type: Type.STRING, nullable: true }, // 새 장소를 추천할 때만
                    regionHint: { type: Type.STRING, nullable: true },
                  },
                },
              },
            },
            required: ["day", "places"],
          },
        },
      },
      required: ["days"],
    },
  },
  required: ["reply"],
};

// 일정을 id·name·day·order만 담은 가벼운 목록으로 바꿉니다. (좌표 등은 AI에게 줄 필요 없음)
function toPlaceList(trip) {
  return trip.days.flatMap((d) => d.places.map((p, i) => ({ id: p.id, name: p.name, day: d.day, order: i })));
}

// 장소 모음을 AI에게 줄 가벼운 목록으로 바꿉니다. 여행기 번호는 사람이 읽기 쉽게 1부터 셉니다.
function toPoolList(pool) {
  return pool.places.map((p) => {
    const sources = Array.isArray(p.sources) ? p.sources : [];
    return {
      id: p.id,
      name: p.name,
      area: p.regionHint || p.match?.address || "",
      from: sources.map((s) => ({ trip: s.source + 1, day: s.day })),
      tripCount: new Set(sources.map((s) => s.source)).size,
    };
  });
}

// pool: 장소 모음 (AI가 고를 수 있는 전체 후보, lib/pool.js)
// currentTrip: 지금 화면에 있는 일정 (AI가 참고할 현재 상태)
// history: 최근 대화 [{ role: "user" | "assistant", text }]
// message: 이번에 사용자가 보낸 메시지
export async function chatItinerary({ pool, currentTrip, history, message }) {
  const poolList = toPoolList(pool);
  const tripsText = pool.sources
    .map((s, i) => `${i + 1}. ${s.title}${s.region ? ` (${s.region})` : ""}`)
    .join("\n");
  const sharedCount = poolList.filter((p) => p.tripCount >= 2).length;
  // 여행기가 여러 개일 때만 참고 정보를 붙입니다.
  const sharedText =
    pool.sources.length > 1
      ? `\n\n[참고] 여러 여행기에 함께 나온 장소: ${sharedCount}곳 (tripCount가 2 이상인 장소)`
      : "";

  const context = `[여행기 목록]
${tripsText}

[장소 모음] (이 안에 있는 장소만 id로 쓸 수 있어)
${JSON.stringify(poolList)}${sharedText}

[현재 일정]
${JSON.stringify(toPlaceList(currentTrip))}`;

  const historyText = (history || [])
    .map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.text}`)
    .join("\n");

  const contents = `${context}\n\n${historyText ? `[이전 대화]\n${historyText}\n\n` : ""}[사용자 메시지]\n${message}`;

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    contents,
    config: {
      systemInstruction: CHAT_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: CHAT_RESPONSE_SCHEMA,
    },
  });

  const raw = response.text;
  const json = raw.replace(/```json|```/g, "").trim();

  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("답변을 읽어내지 못했어요. 다시 시도해 주세요.");
  }

  return {
    reply: typeof data.reply === "string" ? data.reply : "",
    itinerary: data.itinerary && Array.isArray(data.itinerary.days) ? data.itinerary : null,
  };
}
