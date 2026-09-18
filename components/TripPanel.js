"use client";
// 일정 목록 + 지도 + 편집 기능을 한 화면(홈, 공유 링크)에서 공통으로 씁니다.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { dayColor } from "@/lib/colors";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

// top: 패널 맨 위에 넣을 내용 (홈은 주소 입력 폼, 공유 화면은 안내 문구 등)
// actions: 일정 제목 옆에 넣을 버튼 (저장하기 등)
// originalTrip: 변환 직후 원본 스냅샷. "원본 일정" 지도 보기와 AI 채팅이 고를 수 있는 장소 범위로 씀
export default function TripPanel({ trip, originalTrip, onChange, top, actions }) {
  const [selectedDay, setSelectedDay] = useState("all");
  const [mapView, setMapView] = useState("current"); // "current" | "original" — 지도에 어느 일정을 보여줄지
  const [chatOpen, setChatOpen] = useState(false); // 버튼을 눌러야 채팅 패널이 나타남
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [focusKey, setFocusKey] = useState(null);
  const [pickerKey, setPickerKey] = useState(null); // 후보 목록/검색창을 열어둔 장소 (day-index)
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [routeLegs, setRouteLegs] = useState({}); // { [day]: legs 배열 } — "실제 경로 보기" 누른 일차만 채워짐
  const [routeLoadingDay, setRouteLoadingDay] = useState(null);
  const [routeError, setRouteError] = useState({});
  // 모바일에서는 채팅창을 버튼 바로 아래에, 데스크톱에서는 지도 오른쪽 별도 칸에 보여줍니다.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 800px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // 그 일차에 위치가 있는 장소들을 순서대로 이어서 실제 경로를 조회
  async function loadRoute(day) {
    const d = trip.days.find((x) => x.day === day);
    const points = d.places.filter((p) => p.match).map((p) => ({ lat: p.match.lat, lng: p.match.lng }));
    if (points.length < 2) return;

    setRouteLoadingDay(day);
    setRouteError((prev) => ({ ...prev, [day]: "" }));
    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRouteError((prev) => ({ ...prev, [day]: data.error || "경로를 가져오지 못했어요." }));
        return;
      }
      setRouteLegs((prev) => ({ ...prev, [day]: data.legs }));
      if (data.legs.some((leg) => leg === null)) {
        setRouteError((prev) => ({
          ...prev,
          [day]: "일부 구간은 실제 경로를 가져오지 못해 직선으로 표시했어요.",
        }));
      }
    } catch {
      setRouteError((prev) => ({ ...prev, [day]: "서버에 연결하지 못했어요." }));
    } finally {
      setRouteLoadingDay(null);
    }
  }

  // 장소 순서/구성이 바뀌면 예전에 조회해둔 실제 경로는 더 이상 안 맞으니 지웁니다.
  function clearRoute(day) {
    setRouteLegs((prev) => {
      if (!(day in prev)) return prev;
      const next = { ...prev };
      delete next[day];
      return next;
    });
    setRouteError((prev) => ({ ...prev, [day]: "" }));
  }

  function openPicker(key) {
    setPickerKey((k) => (k === key ? null : key)); // 같은 걸 다시 누르면 닫기
    setSearchText("");
    setSearchResults([]);
    setSearchError("");
  }

  // 후보 목록이나 직접 검색 결과 중 하나를 골라 해당 장소의 위치로 반영
  function applyMatch(day, placeIndex, candidate) {
    const days = trip.days.map((d) => {
      if (d.day !== day) return d;
      const places = d.places.map((p, pi) => (pi !== placeIndex ? p : { ...p, match: candidate }));
      return { ...d, places };
    });
    onChange({ ...trip, days });
    setPickerKey(null);
    clearRoute(day);
  }

  function removePlace(day, index) {
    const days = trip.days.map((d) =>
      d.day !== day ? d : { ...d, places: d.places.filter((_, i) => i !== index) }
    );
    onChange({ ...trip, days });
    setFocusKey(null);
    clearRoute(day);
  }

  // offset: -1이면 위로, 1이면 아래로 한 칸 이동
  function movePlace(day, index, offset) {
    const days = trip.days.map((d) => {
      if (d.day !== day) return d;
      const target = index + offset;
      if (target < 0 || target >= d.places.length) return d;
      const places = [...d.places];
      [places[index], places[target]] = [places[target], places[index]];
      return { ...d, places };
    });
    onChange({ ...trip, days });
    setFocusKey(null); // 순서가 바뀌면 인덱스 기반 key가 달라지니 강조는 초기화
    clearRoute(day);
  }

  function moveToDay(day, index, targetDay) {
    if (targetDay === day) return;
    const place = trip.days.find((d) => d.day === day)?.places[index];
    if (!place) return;
    const days = trip.days.map((d) => {
      if (d.day === day) return { ...d, places: d.places.filter((_, i) => i !== index) };
      if (d.day === targetDay) return { ...d, places: [...d.places, place] };
      return d;
    });
    onChange({ ...trip, days });
    setFocusKey(null);
    clearRoute(day);
    clearRoute(targetDay);
  }

  // 검색해서 고른 장소를 해당 일차 목록 맨 뒤에 새로 추가
  function addPlace(day, candidate) {
    const days = trip.days.map((d) =>
      d.day !== day
        ? d
        : {
            ...d,
            places: [
              ...d.places,
              {
                id: crypto.randomUUID(),
                name: candidate.name,
                regionHint: "",
                time: "",
                memo: "",
                match: candidate,
                candidates: [candidate],
              },
            ],
          }
    );
    onChange({ ...trip, days });
    setPickerKey(null);
    clearRoute(day);
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchText.trim()) return;
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch("/api/search-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || "검색하지 못했어요.");
        return;
      }
      if (data.candidates.length === 0) setSearchError("검색 결과가 없어요.");
      setSearchResults(data.candidates);
    } catch {
      setSearchError("서버에 연결하지 못했어요.");
    } finally {
      setSearching(false);
    }
  }

  // AI와 대화하며 일정을 조정합니다. id 치환은 서버(app/api/chat)에서만 하고,
  // 여기서는 받은 itinerary를 그대로 반영합니다.
  async function sendChat(e) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const history = chatMessages.slice(-6); // API에는 최근 6개까지만 보냅니다
    setChatMessages((m) => [...m, { role: "user", text }]);
    setChatInput("");
    setChatLoading(true);
    setChatError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip, originalTrip: originalTrip || trip, messages: history, message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error || "답변을 받지 못했어요.");
        return;
      }
      setChatMessages((m) => [...m, { role: "assistant", text: data.reply }]);
      if (data.itinerary) {
        const newDays = data.itinerary.days;
        // 바뀐 일차의 실제 경로는 더 이상 안 맞으니 지웁니다.
        const dayNums = new Set([...trip.days.map((d) => d.day), ...newDays.map((d) => d.day)]);
        dayNums.forEach((day) => {
          const oldIds = (trip.days.find((d) => d.day === day)?.places || []).map((p) => p.id).join(",");
          const newIds = (newDays.find((d) => d.day === day)?.places || []).map((p) => p.id).join(",");
          if (oldIds !== newIds) clearRoute(day);
        });
        onChange({ ...trip, days: newDays });
      }
    } catch {
      setChatError("서버에 연결하지 못했어요.");
    } finally {
      setChatLoading(false);
    }
  }

  const visibleDays = trip
    ? trip.days.filter((d) => selectedDay === "all" || d.day === selectedDay)
    : [];
  const missing = trip
    ? trip.days.reduce((n, d) => n + d.places.filter((p) => !p.match).length, 0)
    : 0;

  const chatBody = (
    <>
      <div className="chat-panel-head">
        <h3>AI와 일정 상담하기</h3>
        <button type="button" className="chat-close" onClick={() => setChatOpen(false)} title="닫기">
          ✕
        </button>
      </div>
      <div className="chat-log">
        {chatMessages.length === 0 && (
          <p className="notice">예: &quot;둘째 날은 좀 여유롭게 바꿔줘&quot;처럼 말해보세요.</p>
        )}
        {chatMessages.map((m, i) => (
          <p key={i} className={`chat-msg ${m.role}`}>
            {m.text}
          </p>
        ))}
        {chatLoading && <p className="chat-msg assistant">생각하는 중…</p>}
      </div>
      {chatError && <p className="error">{chatError}</p>}
      <form className="chat-form" onSubmit={sendChat}>
        <input
          type="text"
          placeholder="예: 셋째 날은 실내 위주로 바꿔줘"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          disabled={chatLoading}
        />
        <button type="submit" disabled={chatLoading || !chatInput.trim()}>
          {chatLoading ? "전송 중…" : "보내기"}
        </button>
      </form>
    </>
  );

  // 원본과 내용이 같으면(아직 아무것도 안 바꿨으면) 비교 탭은 보여줄 필요가 없어요.
  const showViewTabs =
    trip && originalTrip && JSON.stringify(originalTrip.days) !== JSON.stringify(trip.days);
  const mapDays = (showViewTabs && mapView === "original" ? originalTrip : trip)?.days || [];

  return (
    <div className={`shell ${trip && chatOpen ? "chat-open" : ""}`}>
      <aside className="panel">
        {top}

        {trip && (
          <section className="trip">
            <div className="trip-head">
              <h2>{trip.title}</h2>
              <div className="trip-head-actions">
                {trip.sourceUrl && (
                  <a href={trip.sourceUrl} target="_blank" rel="noreferrer">원문 보기</a>
                )}
                {actions}
              </div>
            </div>

            <button type="button" className="primary chat-toggle" onClick={() => setChatOpen((v) => !v)}>
              {chatOpen ? "AI 상담 닫기" : "AI와 일정 상담하기"}
            </button>

            {isMobile && chatOpen && <div className="chat-panel chat-panel-inline">{chatBody}</div>}

            <div className="tabs" role="tablist">
              <button
                role="tab"
                aria-selected={selectedDay === "all"}
                className="tab"
                onClick={() => setSelectedDay("all")}
              >
                전체
              </button>
              {trip.days.map((d) => (
                <button
                  key={d.day}
                  role="tab"
                  aria-selected={selectedDay === d.day}
                  className="tab"
                  style={{ "--c": dayColor(d.day) }}
                  onClick={() => setSelectedDay(d.day)}
                >
                  {d.day}일차
                </button>
              ))}
            </div>

            {missing > 0 && (
              <p className="notice">위치를 찾지 못한 장소가 {missing}곳 있어요. 지도에는 빠져 있어요.</p>
            )}

            {visibleDays.map((d) => (
              <div key={d.day} className="day" style={{ "--c": dayColor(d.day) }}>
                <div className="day-head">
                  <h3>{d.day}일차</h3>
                  <button
                    type="button"
                    className="route-toggle"
                    onClick={() => loadRoute(d.day)}
                    disabled={routeLoadingDay === d.day || d.places.filter((p) => p.match).length < 2}
                  >
                    {routeLoadingDay === d.day
                      ? "경로 찾는 중…"
                      : routeLegs[d.day]
                      ? "다시 조회"
                      : "실제 경로 보기"}
                  </button>
                </div>
                {routeError[d.day] && <p className="notice">{routeError[d.day]}</p>}
                <ol className="stops">
                  {d.places.map((p, i) => {
                    const key = `${d.day}-${i}`;
                    const pickerOpen = pickerKey === key;
                    return (
                      <li key={key} className={p.match ? "" : "unmatched"}>
                        <div className="stop-row">
                          <button
                            type="button"
                            className={`stop ${focusKey === key ? "active" : ""}`}
                            onClick={() => p.match && setFocusKey(key)}
                            disabled={!p.match}
                          >
                            <span className="num">{i + 1}</span>
                            <span className="body">
                              <strong>{p.name}</strong>
                              {p.match ? (
                                <span className="addr">{p.match.address}</span>
                              ) : (
                                <span className="addr">위치를 찾지 못했어요</span>
                              )}
                              {(p.time || p.memo) && (
                                <span className="memo">{[p.time, p.memo].filter(Boolean).join(" / ")}</span>
                              )}
                            </span>
                          </button>
                          <button type="button" className="pick-toggle" onClick={() => openPicker(key)}>
                            {p.match ? "다른 장소" : "직접 검색"}
                          </button>
                        </div>

                        <div className="edit-row">
                          <button
                            type="button"
                            className="edit-btn"
                            title="위로 이동"
                            disabled={i === 0}
                            onClick={() => movePlace(d.day, i, -1)}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="edit-btn"
                            title="아래로 이동"
                            disabled={i === d.places.length - 1}
                            onClick={() => movePlace(d.day, i, 1)}
                          >
                            ▼
                          </button>
                          {trip.days.length > 1 && (
                            <select
                              className="day-move"
                              value=""
                              onChange={(e) => e.target.value && moveToDay(d.day, i, Number(e.target.value))}
                              aria-label="다른 일차로 이동"
                            >
                              <option value="" disabled>
                                일차 이동
                              </option>
                              {trip.days
                                .filter((other) => other.day !== d.day)
                                .map((other) => (
                                  <option key={other.day} value={other.day}>
                                    {other.day}일차로
                                  </option>
                                ))}
                            </select>
                          )}
                          <button
                            type="button"
                            className="edit-btn danger"
                            title="삭제"
                            onClick={() => removePlace(d.day, i)}
                          >
                            삭제
                          </button>
                        </div>

                        {pickerOpen && (
                          <div className="picker">
                            {p.candidates?.length > 0 && (
                              <ul className="picker-list">
                                {p.candidates.map((c) => (
                                  <li key={c.kakaoId}>
                                    <button type="button" onClick={() => applyMatch(d.day, i, c)}>
                                      <strong>{c.name}</strong>
                                      <span>{c.address}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}

                            <form className="picker-search" onSubmit={handleSearch}>
                              <input
                                type="text"
                                placeholder="장소명으로 검색"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                              />
                              <button type="submit" disabled={searching}>
                                {searching ? "검색 중…" : "검색"}
                              </button>
                            </form>
                            {searchError && <p className="error">{searchError}</p>}
                            {searchResults.length > 0 && (
                              <ul className="picker-list">
                                {searchResults.map((c) => (
                                  <li key={c.kakaoId}>
                                    <button type="button" onClick={() => applyMatch(d.day, i, c)}>
                                      <strong>{c.name}</strong>
                                      <span>{c.address}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>

                <button
                  type="button"
                  className="add-place-toggle"
                  onClick={() => openPicker(`add-${d.day}`)}
                >
                  + 장소 추가
                </button>

                {pickerKey === `add-${d.day}` && (
                  <div className="picker">
                    <form className="picker-search" onSubmit={handleSearch}>
                      <input
                        type="text"
                        placeholder="장소명으로 검색"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                      />
                      <button type="submit" disabled={searching}>
                        {searching ? "검색 중…" : "검색"}
                      </button>
                    </form>
                    {searchError && <p className="error">{searchError}</p>}
                    {searchResults.length > 0 && (
                      <ul className="picker-list">
                        {searchResults.map((c) => (
                          <li key={c.kakaoId}>
                            <button type="button" onClick={() => addPlace(d.day, c)}>
                              <strong>{c.name}</strong>
                              <span>{c.address}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </aside>

      <main className="map-wrap">
        {showViewTabs && (
          <div className="view-tabs">
            <button
              type="button"
              className={`view-tab ${mapView === "current" ? "active" : ""}`}
              onClick={() => setMapView("current")}
            >
              내 일정
            </button>
            <button
              type="button"
              className={`view-tab ${mapView === "original" ? "active" : ""}`}
              onClick={() => setMapView("original")}
            >
              원본 일정
            </button>
          </div>
        )}
        <KakaoMap
          days={mapDays}
          selectedDay={selectedDay}
          focusKey={focusKey}
          onSelect={setFocusKey}
          routeLegs={routeLegs}
        />
      </main>

      {trip && chatOpen && !isMobile && <aside className="chat-panel">{chatBody}</aside>}
    </div>
  );
}
