// "장소 모음": 여러 여행기의 장소를 한 목록으로 합친 것. AI 상담이 고를 수 있는 장소 범위예요.
// 화면(app/page.js, 공유 화면)과 서버(app/api/chat) 양쪽에서 씁니다.
//
// pool = {
//   sources: [{ title, region, sourceUrl }],          // 입력한 순서대로
//   places: [{ ...기존 장소 필드, sources: [{ source: 여행기 번호(0부터), day }] }]
// }
// sources가 빈 장소는 사용자가 직접 검색해 넣었거나 AI가 추천한 장소예요.

// trips: /api/extract 응답 배열 → 장소 모음
export function buildPool(trips) {
  const sources = trips.map((t) => ({
    title: t.title,
    region: t.region || "",
    sourceUrl: t.sourceUrl || null,
  }));
  const places = [];
  const byKakaoId = new Map(); // kakaoId → 이미 모음에 들어간 장소

  trips.forEach((t, sourceIndex) => {
    t.days.forEach((d) => {
      d.places.forEach((p) => {
        const from = { source: sourceIndex, day: d.day };
        const kakaoId = p.match?.kakaoId;
        const existing = kakaoId ? byKakaoId.get(kakaoId) : null;

        // 다른 여행기에 이미 나온 장소면 합칩니다.
        // 같은 여행기 안에서 두 번 나온 장소(다시 방문)는 일정에서도 따로 있는 항목이라 합치지 않아요.
        // 합쳐버리면 두 번째 항목의 id가 모음에서 사라져 AI 상담에서 버려지기 때문입니다.
        if (existing && !existing.sources.some((s) => s.source === sourceIndex)) {
          existing.sources.push(from);
          return;
        }

        const place = { ...p, sources: [from] };
        places.push(place);
        if (kakaoId && !existing) byKakaoId.set(kakaoId, place);
      });
    });
  });

  return { sources, places };
}

// 일정(days)에 있는데 모음에 없는 장소를 모음 뒤에 붙입니다. (출처 없음 = 직접 추가)
// 바뀐 게 없으면 원래 pool을 그대로 돌려줘서, 불필요한 화면 갱신을 막습니다.
export function addMissingPlaces(pool, days) {
  const ids = new Set(pool.places.map((p) => p.id));
  const added = [];
  for (const d of days) {
    for (const p of d.places) {
      if (p.id && !ids.has(p.id)) {
        ids.add(p.id);
        added.push({ ...p, sources: [] });
      }
    }
  }
  if (added.length === 0) return pool;
  return { ...pool, places: [...pool.places, ...added] };
}

// 장소가 몇 개의 서로 다른 여행기에 나왔는지
export function sourceCount(place) {
  return new Set((place.sources || []).map((s) => s.source)).size;
}

// 여행기들의 지역 목록 (중복 제거). "부산 해운대"와 "부산"은 같은 지역으로 보려고 첫 단어만 비교해요.
export function distinctRegions(pool) {
  const regions = pool.sources
    .map((s) => s.region.trim().split(/\s+/)[0])
    .filter(Boolean);
  return [...new Set(regions)];
}
