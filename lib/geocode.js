// 장소명 → 좌표 (카카오 로컬 API 키워드 검색, 서버에서만 실행)
const ENDPOINT = "https://dapi.kakao.com/v2/local/search/keyword.json";

export async function searchPlaces(query) {
  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}&size=5`, {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` },
  });
  if (!res.ok) throw new Error(`카카오 장소 검색 실패 (HTTP ${res.status})`);
  const { documents } = await res.json();
  return documents.map((d) => ({
    name: d.place_name,
    lat: Number(d.y), // 카카오는 y가 위도, x가 경도
    lng: Number(d.x),
    address: d.road_address_name || d.address_name,
    category: d.category_group_name,
    kakaoId: d.id,
    kakaoUrl: d.place_url,
  }));
}

// 지역 힌트를 붙여 먼저 검색하고, 없으면 장소명만으로 다시 검색합니다.
export async function geocodePlace(place, fallbackRegion = "") {
  const region = place.regionHint || fallbackRegion;
  let candidates = region ? await searchPlaces(`${region} ${place.name}`) : [];
  if (candidates.length === 0) candidates = await searchPlaces(place.name);

  return {
    match: candidates[0] || null, // 지금은 첫 번째 결과를 사용
    candidates, // 나중에 "이 장소가 맞나요?" 선택 화면에 쓸 후보들
  };
}
