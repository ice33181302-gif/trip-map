// 여행기 텍스트 → 일차별 장소 목록(JSON)
import { GoogleGenAI } from "@google/genai";

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
