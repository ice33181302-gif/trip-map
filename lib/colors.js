// 일차별 색상 (지도 마커, 경로선, 목록에서 똑같이 사용)
const DAY_COLORS = ["#E5484D", "#2F6FEB", "#1F9D55", "#E8830C", "#8B5CF6", "#0EA5B7", "#D6409F"];

export function dayColor(day) {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length];
}

// 여행기별 색상 ("장소 모음" 보기에서 사용). 일차 색과 헷갈리지 않게 톤이 다른 색을 씁니다.
const SOURCE_COLORS = ["#A16207", "#0F766E", "#9D174D"];
const NO_SOURCE_COLOR = "#94A3B8"; // 직접 추가한 장소 (출처 없음)

// index: 여행기 번호(0부터). 없으면(undefined) 직접 추가한 장소 색
export function sourceColor(index) {
  if (index === undefined || index === null) return NO_SOURCE_COLOR;
  return SOURCE_COLORS[index % SOURCE_COLORS.length];
}
