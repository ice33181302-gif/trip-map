"use client";
// 일정 목록 + 지도 + 편집 기능을 한 화면(홈, 공유 링크)에서 공통으로 씁니다.
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { dayColor } from "@/lib/colors";
import { addMissingPlaces } from "@/lib/pool";
import PlacePool from "@/components/PlacePool";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

// 실제 경로 조회 결과(legs)를 "몇 번째 장소 다음 구간인지"로 바꿉니다. → { [장소 순번]: leg | null }
// legs는 위치를 찾은 장소끼리만 이은 구간이라, 위치 없는 장소를 건너뛰며 짝을 맞춰요.
function legsByPlaceIndex(places, legs) {
  const result = {};
  if (!legs) return result;
  const matched = [];
  places.forEach((p, i) => {
    if (p.match) matched.push(i);
  });
  for (let j = 0; j < matched.length - 1; j++) result[matched[j]] = legs[j] || null;
  return result;
}

// 경로 API는 시간을 초, 거리를 미터로 줘요.
function formatDuration(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

// top: 패널 맨 위에 넣을 내용 (홈은 주소 입력 폼, 공유 화면은 안내 문구 등)
// actions: 일정 제목 옆에 넣을 버튼 (저장하기 등)
// originalTrip: 변환 직후 원본 스냅샷. 여행기가 하나일 때 "원본 일정" 지도 보기에 씀
// pool: 장소 모음 (lib/pool.js). AI 채팅이 고를 수 있는 장소 범위이고, 여행기가 여러 개면 "장소 모음" 보기에 씀
// readOnly: 보기용 공유 링크. 편집·AI 상담 버튼을 숨기고 보기만 합니다.
export default function TripPanel({ trip, originalTrip, pool, onChange, onPoolChange, top, actions, readOnly = false }) {
  const isMulti = Boolean(pool && pool.sources.length > 1); // 여행기 여러 개를 합친 경우
  const [selectedDay, setSelectedDay] = useState("all");
  // "current" | "original" | "pool" — 어느 보기를 보여줄지.
  // 여러 여행기를 막 읽어서 내 일정이 비어 있으면 장소 모음부터 보여줍니다.
  const [mapView, setMapView] = useState(isMulti && trip && trip.days.length === 0 ? "pool" : "current");
  const [chatOpen, setChatOpen] = useState(false); // 버튼을 눌러야 채팅 패널이 나타남
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [focusKey, setFocusKey] = useState(null);
  // 편집 모드일 때만 순서 변경·일차 이동·삭제·다른 장소·장소 추가 버튼을 보여줍니다.
  // 평소에는 장소 정보만 보여서 목록이 깔끔해요.
  const [editing, setEditing] = useState(false);
  const [pickerKey, setPickerKey] = useState(null); // 후보 목록/검색창을 열어둔 장소 (day-index)
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [routeLegs, setRouteLegs] = useState({}); // { [day]: legs 배열 } — "실제 경로 보기" 누른 일차만 채워짐
  const [routeLoadingDay, setRouteLoadingDay] = useState(null);
  const [routeError, setRouteError] = useState({});
  // 채팅 대화 영역. 새 메시지가 오면 맨 아래로 스크롤하려고 DOM 요소를 기억해 둡니다.
  // (useRef는 화면을 다시 그리지 않고 값을 보관하는 상자예요.)
  const chatLogRef = useRef(null);

  useEffect(() => {
    const el = chatLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatLoading, chatOpen]);

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

  // 일정을 바꿀 때는 항상 이 함수를 거칩니다.
  // 내 일정에 새로 들어온 장소(직접 검색, AI 추천)를 장소 모음에도 넣어서,
  // 다음 AI 상담 때 "모음에 없는 id"로 버려지지 않게 합니다.
  function changeTrip(next) {
    onChange(next);
    if (!pool || !onPoolChange) return;
    const nextPool = addMissingPlaces(pool, next.days);
    if (nextPool !== pool) onPoolChange(nextPool);
  }

  // 보기를 바꾸면 핀 key 형태가 달라지니 강조는 초기화합니다.
  function switchView(view) {
    setMapView(view);
    setFocusKey(null);
  }

  // 편집을 끝내면 열려 있던 후보 목록/검색창도 닫습니다.
  function toggleEditing() {
    setEditing((v) => !v);
    setPickerKey(null);
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
    changeTrip({ ...trip, days });
    setPickerKey(null);
    clearRoute(day);
  }

  function removePlace(day, index) {
    const days = trip.days.map((d) =>
      d.day !== day ? d : { ...d, places: d.places.filter((_, i) => i !== index) }
    );
    changeTrip({ ...trip, days });
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
    changeTrip({ ...trip, days });
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
    changeTrip({ ...trip, days });
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
    changeTrip({ ...trip, days });
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
  // presetText: 추천 문장 버튼을 눌렀을 때 그 문장. 없으면 입력칸 내용을 보냅니다.
  async function sendChat(e, presetText) {
    if (e) e.preventDefault();
    const text = (presetText || chatInput).trim();
    if (!text || chatLoading) return;
    // API에는 최근 6개까지만, 역할과 글자만 보냅니다 (되돌리기용 일정 데이터는 빼고)
    const history = chatMessages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setChatMessages((m) => [...m, { role: "user", text }]);
    setChatInput("");
    setChatLoading(true);
    setChatError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip, pool, messages: history, message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error || "답변을 받지 못했어요.");
        return;
      }
      if (data.itinerary) {
        const newDays = data.itinerary.days;
        // 되돌리기용으로 바뀌기 전 일정(prevDays)과 바뀐 뒤 일정(newDays)을 답변 메시지에 같이 기억해 둡니다.
        setChatMessages((m) => [...m, { role: "assistant", text: data.reply, prevDays: trip.days, newDays }]);
        applyDays(newDays);
        // 장소 모음을 보고 있었다면, 새로 만든 내 일정을 바로 보여줍니다(핀 색은 일차별).
        if (mapView === "pool") switchView("current");
      } else {
        setChatMessages((m) => [...m, { role: "assistant", text: data.reply }]);
      }
    } catch {
      setChatError("서버에 연결하지 못했어요.");
    } finally {
      setChatLoading(false);
    }
  }

  // 일정을 통째로 바꿉니다(AI 변경, 되돌리기). 바뀐 일차의 실제 경로는 더 이상 안 맞으니 지워요.
  function applyDays(newDays) {
    const dayNums = new Set([...trip.days.map((d) => d.day), ...newDays.map((d) => d.day)]);
    dayNums.forEach((day) => {
      const oldIds = (trip.days.find((d) => d.day === day)?.places || []).map((p) => p.id).join(",");
      const newIds = (newDays.find((d) => d.day === day)?.places || []).map((p) => p.id).join(",");
      if (oldIds !== newIds) clearRoute(day);
    });
    changeTrip({ ...trip, days: newDays });
  }

  // AI가 바꾸기 전 일정으로 돌아갑니다.
  function undoChat(index) {
    applyDays(chatMessages[index].prevDays);
    setChatMessages((list) => list.map((m, i) => (i === index ? { ...m, undone: true } : m)));
  }

  // 되돌리기 버튼은 "가장 최근 AI 변경"에만, 그리고 그 뒤로 일정이 안 바뀌었을 때만 보여줍니다.
  // 사용자가 그 뒤에 직접 편집했다면 되돌리면 그 편집까지 사라지니까요.
  // (trip.days === m.newDays는 내용 비교가 아니라 "같은 배열인지" 비교예요. 편집하면 새 배열이 만들어져서 달라져요.)
  let undoIndex = -1;
  chatMessages.forEach((m, i) => {
    if (m.newDays) undoIndex = i;
  });
  if (undoIndex >= 0) {
    const last = chatMessages[undoIndex];
    if (last.undone || !trip || trip.days !== last.newDays) undoIndex = -1;
  }

  // 장소 모음 보기에서는 일차 목록 대신 PlacePool을 보여주니 비워 둡니다.
  const visibleDays = trip && !(isMulti && mapView === "pool")
    ? trip.days.filter((d) => selectedDay === "all" || d.day === selectedDay)
    : [];
  const missing = trip
    ? trip.days.reduce((n, d) => n + d.places.filter((p) => !p.match).length, 0)
    : 0;

  // 대화를 시작하기 전에 보여줄 추천 문장. 내 일정이 비어 있으면 "새로 짜기", 있으면 "조정하기" 위주예요.
  const emptyTrip = trip && trip.days.length === 0;
  const suggestions = emptyTrip
    ? ["1박 2일로 짜줘", "2박 3일로 짜줘", "여러 여행기에 나온 곳 위주로 짜줘"]
    : ["둘째 날은 여유롭게 바꿔줘", "실내 위주로 바꿔줘", "동선이 짧게 다시 짜줘"];

  // 데스크톱은 지도 위에 떠 있는 카드, 모바일은 아래에서 올라오는 시트예요. (모양은 CSS가 화면 폭에 따라 정함)
  const chatPanel = (
    <section className="chat-panel" aria-label="AI와 일정 상담하기">
      <div className="chat-panel-head">
        <h3>AI와 일정 상담하기</h3>
        <button type="button" className="chat-close" onClick={() => setChatOpen(false)} title="닫기">
          ✕
        </button>
      </div>
      <div className="chat-log" ref={chatLogRef}>
        {chatMessages.length === 0 && (
          <p className="notice">
            {emptyTrip
              ? "장소 모음에서 골라 일정을 만들어 드려요. 며칠 일정인지 알려주세요."
              : "원하는 분위기나 조건을 말하면 일정을 바꿔 드려요."}
          </p>
        )}
        {chatMessages.map((m, i) => (
          <div key={i} className={`chat-item ${m.role}`}>
            <p className={`chat-msg ${m.role}`}>{m.text}</p>
            {i === undoIndex && (
              <button type="button" className="chat-undo" onClick={() => undoChat(i)}>
                되돌리기
              </button>
            )}
            {m.undone && <span className="chat-undone">바꾸기 전 일정으로 되돌렸어요</span>}
          </div>
        ))}
        {chatLoading && (
          <p className="chat-msg assistant typing" aria-label="답변을 만드는 중">
            <span />
            <span />
            <span />
          </p>
        )}
      </div>
      {chatError && <p className="error chat-error">{chatError}</p>}
      {chatMessages.length === 0 && !chatLoading && (
        <div className="chat-suggestions">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chat-chip" onClick={() => sendChat(null, s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form className="chat-form" onSubmit={sendChat}>
        <input
          type="text"
          placeholder={emptyTrip ? "예: 2박 3일, 카페 위주로 짜줘" : "예: 셋째 날은 실내 위주로 바꿔줘"}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          disabled={chatLoading}
        />
        <button type="submit" disabled={chatLoading || !chatInput.trim()}>
          보내기
        </button>
      </form>
    </section>
  );

  // 지도는 일차 목록(days)을 받으니, 장소 모음은 "1일차 하나"로 감싸서 넘깁니다(선은 poolMode라 안 그림).
  // useMemo: pool이 바뀔 때만 새 배열을 만들어요. 매번 새로 만들면 지도가 렌더링마다 핀을 다시 그려요.
  const poolDays = useMemo(() => (pool ? [{ day: 1, places: pool.places }] : []), [pool]);
  const showPool = isMulti && mapView === "pool";

  // 여행기가 여러 개면 "내 일정 / 장소 모음" 탭을 항상 보여줍니다.
  // 하나면 기존처럼 원본과 내용이 다를 때만(뭔가 바꿨을 때만) "내 일정 / 원본 일정" 탭을 보여줘요.
  const showViewTabs =
    isMulti || (trip && originalTrip && JSON.stringify(originalTrip.days) !== JSON.stringify(trip.days));
  const mapDays = showPool
    ? poolDays
    : (!isMulti && showViewTabs && mapView === "original" ? originalTrip : trip)?.days || [];

  return (
    <div className="shell">
      <aside className="panel">
        {top}

        {trip && (
          <section className="trip">
            <div className="trip-head">
              <h2>{trip.title}</h2>
              <div className="trip-head-actions">
                {trip.sourceUrl && (
                  <a className="btn" href={trip.sourceUrl} target="_blank" rel="noreferrer">원문 보기</a>
                )}
                {actions}
              </div>
            </div>

            {showPool && <PlacePool pool={pool} focusKey={focusKey} onFocus={setFocusKey} />}

            {!showPool && trip.days.length === 0 && (
              <p className="notice">
                아직 내 일정이 없어요. 지도 오른쪽 아래 &quot;AI 상담&quot; 버튼을 눌러 장소 모음으로 일정을 만들어 보세요.
              </p>
            )}

            {!showPool && trip.days.length > 0 && (
              <div className="list-toolbar">
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
                {!readOnly && (
                  <button
                    type="button"
                    className={`btn edit-toggle ${editing ? "on" : ""}`}
                    aria-pressed={editing}
                    onClick={toggleEditing}
                  >
                    {editing ? "편집 완료" : "편집"}
                  </button>
                )}
              </div>
            )}

            {!showPool && missing > 0 && (
              <p className="notice-box">위치를 찾지 못한 장소가 {missing}곳 있어요. 지도에는 빠져 있어요.</p>
            )}

            {visibleDays.map((d) => {
              const legs = legsByPlaceIndex(d.places, routeLegs[d.day]);
              // 실제 경로를 조회한 일차만 총 이동 시간을 보여줘요 (못 찾은 구간은 빼고 더함)
              const totalSec = (routeLegs[d.day] || []).reduce((sum, leg) => sum + (leg ? leg.time : 0), 0);
              return (
                <div key={d.day} className="day" style={{ "--c": dayColor(d.day) }}>
                  <div className="day-head">
                    <h3>
                      {d.day}일차 <span className="day-count">{d.places.length}곳</span>
                      {totalSec > 0 && <span className="day-count"> · 이동 약 {formatDuration(totalSec)}</span>}
                    </h3>
                    <button
                      type="button"
                      className="btn route-toggle"
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
                            {/* 위치를 못 찾은 장소는 바로 고칠 수 있게 편집 모드가 아니어도 보여줘요 */}
                            {!readOnly && (editing || !p.match) && (
                              <button type="button" className="btn pick-toggle" onClick={() => openPicker(key)}>
                                {p.match ? "다른 장소" : "직접 검색"}
                              </button>
                            )}
                          </div>
  
                          {editing && (
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
                          )}
  
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

                          {/* 다음 장소까지 이동 정보 ("실제 경로 보기"를 누른 일차만).
                              i in legs: legs 객체에 i번 칸이 있는지 확인 (마지막 장소·위치 없는 장소는 칸이 없음) */}
                          {i in legs && (
                            <p className="leg">
                              {legs[i]
                                ? `${legs[i].mode === "walk" ? "도보" : "대중교통"} ${formatDuration(legs[i].time)} · ${formatDistance(legs[i].distance)}`
                                : "경로를 못 찾아 직선으로 표시했어요"}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
  
                  {editing && (
                    <button
                      type="button"
                      className="add-place-toggle"
                      onClick={() => openPicker(`add-${d.day}`)}
                    >
                      + 장소 추가
                    </button>
                  )}
  
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
              );
            })}
          </section>
        )}
      </aside>

      <main className="map-wrap">
        {showViewTabs && (
          <div className="view-tabs">
            <button
              type="button"
              className={`view-tab ${mapView === "current" ? "active" : ""}`}
              onClick={() => (isMulti ? switchView("current") : setMapView("current"))}
            >
              내 일정
            </button>
            {isMulti ? (
              <button
                type="button"
                className={`view-tab ${mapView === "pool" ? "active" : ""}`}
                onClick={() => switchView("pool")}
              >
                장소 모음
              </button>
            ) : (
              <button
                type="button"
                className={`view-tab ${mapView === "original" ? "active" : ""}`}
                onClick={() => setMapView("original")}
              >
                원본 일정
              </button>
            )}
          </div>
        )}
        <KakaoMap
          days={mapDays}
          selectedDay={showPool ? "all" : selectedDay}
          focusKey={focusKey}
          onSelect={setFocusKey}
          routeLegs={routeLegs}
          poolMode={showPool}
        />

        {/* AI 상담: 지도 오른쪽 아래 버튼으로 열고, 열려 있는 동안은 버튼을 숨깁니다 */}
        {trip && !readOnly && !chatOpen && (
          <button type="button" className="chat-fab" onClick={() => setChatOpen(true)}>
            AI 상담
          </button>
        )}
        {trip && !readOnly && chatOpen && chatPanel}
      </main>
    </div>
  );
}
