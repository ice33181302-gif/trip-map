// 일차별 색상 (지도 마커, 경로선, 목록에서 똑같이 사용)
const DAY_COLORS = ["#E5484D", "#2F6FEB", "#1F9D55", "#E8830C", "#8B5CF6", "#0EA5B7", "#D6409F"];

export function dayColor(day) {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length];
}
