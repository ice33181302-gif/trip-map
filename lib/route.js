// 두 지점 사이 실제 이동 경로 조회 (카카오맵 REST API, KAKAO_REST_KEY로 별도 가입 없이 사용 가능)
// 무료 한도(하루 1,000건)를 아끼기 위해 서버 메모리에 구간별로 캐싱합니다.
const cache = new Map();
const WALK_ENDPOINT = "https://dapi.kakao.com/v2/routing/walk";
const TRANSIT_ENDPOINT = "https://dapi.kakao.com/v2/routing/publictraffic";
const WALK_DISTANCE_LIMIT_M = 1500; // 이 거리 이하는 도보, 넘으면 대중교통으로 조회

// 직선거리(m) — 도보/대중교통 중 뭘 부를지 정하는 데만 씀
function straightDistance(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function fetchWalk(from, to) {
  const url = `${WALK_ENDPOINT}?start_x=${from.lng}&start_y=${from.lat}&end_x=${to.lng}&end_y=${to.lat}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` } });
  if (!res.ok) throw new Error(`도보 경로 조회 실패 (HTTP ${res.status})`);
  const data = await res.json();
  const leg = data.route?.legs?.[0];
  if (!leg) throw new Error("도보 경로 결과가 비어 있어요.");
  const points = leg.steps.flatMap((s) => s.path.points.map(([lng, lat]) => [lat, lng]));
  return { points, distance: leg.properties.distance, time: leg.properties.time, mode: "walk" };
}

async function fetchTransit(from, to) {
  const url = `${TRANSIT_ENDPOINT}?start_x=${from.lng}&start_y=${from.lat}&end_x=${to.lng}&end_y=${to.lat}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` } });
  if (!res.ok) throw new Error(`대중교통 경로 조회 실패 (HTTP ${res.status})`);
  const data = await res.json();
  if (data.status !== "OK") throw new Error("대중교통 경로 결과가 없어요.");
  const route = data.routes?.[0];
  if (!route) throw new Error("대중교통 경로 결과가 비어 있어요.");
  const points = route.steps.flatMap((s) => s.path.points.map(([lng, lat]) => [lat, lng]));
  return {
    points,
    distance: route.properties.totalDistance,
    time: route.properties.totalTime,
    mode: "transit",
  };
}

// from, to: { lat, lng }. 실패하면 null을 돌려주고, 호출한 쪽에서 직선으로 대체합니다.
export async function getRoute(from, to) {
  const key = `${from.lat},${from.lng}-${to.lat},${to.lng}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const useTransit = straightDistance(from, to) > WALK_DISTANCE_LIMIT_M;
    const result = useTransit ? await fetchTransit(from, to) : await fetchWalk(from, to);
    cache.set(key, result);
    return result;
  } catch (e) {
    console.error("[route] 경로 조회 실패:", e.message);
    cache.set(key, null);
    return null;
  }
}
