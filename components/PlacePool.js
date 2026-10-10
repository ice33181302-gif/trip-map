"use client";
// "장소 모음" 목록: 여러 여행기의 장소를 한 줄로 보여주고, 어느 여행기에서 왔는지 표시합니다.
import { sourceColor } from "@/lib/colors";
import { distinctRegions, sourceCount } from "@/lib/pool";

// focusKey/onFocus: 목록과 지도 핀 강조를 맞추는 값. 지도(KakaoMap)가 모음을 1일차 하나로 받아서
// 핀 key가 "1-순번"이 되므로 여기서도 같은 형태를 씁니다.
export default function PlacePool({ pool, focusKey, onFocus }) {
  const regions = distinctRegions(pool);
  const sharedCount = pool.places.filter((p) => sourceCount(p) >= 2).length;
  const missing = pool.places.filter((p) => !p.match).length;

  return (
    <div className="pool">
      <ul className="pool-sources">
        {pool.sources.map((s, i) => (
          <li key={i} style={{ "--c": sourceColor(i) }}>
            <span className="pool-dot" />
            <span className="pool-source-title">{s.title}</span>
            {s.sourceUrl && (
              <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                원문
              </a>
            )}
          </li>
        ))}
      </ul>

      {regions.length > 1 && (
        <p className="notice warn">
          여행기마다 지역이 달라요 ({regions.join(", ")}). 일정을 짤 때 이동 거리를 꼭 확인해 주세요.
        </p>
      )}

      <p className="notice">
        장소 {pool.places.length}곳
        {sharedCount > 0 && ` · 여러 여행기에 나온 곳 ${sharedCount}곳`}
        {missing > 0 && ` · 위치 못 찾음 ${missing}곳`}
      </p>

      <ol className="stops pool-stops">
        {pool.places.map((p, i) => {
          const key = `1-${i}`;
          const count = sourceCount(p);
          return (
            <li
              key={p.id}
              className={p.match ? "" : "unmatched"}
              style={{ "--c": sourceColor(p.sources[0]?.source) }}
            >
              <button
                type="button"
                className={`stop ${focusKey === key ? "active" : ""}`}
                onClick={() => p.match && onFocus(key)}
                disabled={!p.match}
              >
                <span className="num">{i + 1}</span>
                <span className="body">
                  <strong>
                    {p.name}
                    {count >= 2 && <span className="pool-badge">{count}개 여행기에 나옴</span>}
                    {count === 0 && <span className="pool-badge plain">직접 추가</span>}
                  </strong>
                  <span className="addr">{p.match ? p.match.address : "위치를 찾지 못했어요"}</span>
                  {p.memo && <span className="memo">{p.memo}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
