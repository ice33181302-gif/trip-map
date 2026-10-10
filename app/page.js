"use client";
import { useState } from "react";
import TripPanel from "@/components/TripPanel";
import { buildPool } from "@/lib/pool";

const MAX_LINKS = 3;

// 여행기 하나를 /api/extract로 읽어옵니다. 성공하면 { data }, 실패하면 { error, needText }를 돌려줘요.
async function extractOne(url, text) {
  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, text }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "처리하지 못했어요.", needText: Boolean(data.needText) };
    return { data };
  } catch {
    return { error: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}

export default function Home() {
  const [urls, setUrls] = useState([""]); // 링크 입력칸들 (최대 MAX_LINKS개)
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(""); // 여러 링크를 읽을 때 "2/3 여행기 읽는 중…"
  const [error, setError] = useState("");
  const [failures, setFailures] = useState([]); // 읽지 못한 링크 [{ index, error, needText }]
  const [trip, setTrip] = useState(null);
  const [originalTrip, setOriginalTrip] = useState(null); // 여행기가 하나일 때 변환 직후 스냅샷. "원본 일정" 지도 보기용
  const [pool, setPool] = useState(null); // 장소 모음 (lib/pool.js). AI 채팅이 고를 수 있는 장소 범위
  const [saving, setSaving] = useState(false);
  const [shareLinks, setShareLinks] = useState(null); // 저장 후 { view, edit } 링크
  const [saveError, setSaveError] = useState("");
  // TripPanel의 key로 사용. 값이 바뀌면 리액트가 TripPanel을 통째로 새로 만들어서
  // routeLegs, selectedDay, focusKey 같은 내부 상태가 초기화됩니다.
  const [tripVersion, setTripVersion] = useState(0);

  // 입력값과 지금까지 만든 결과를 모두 지우고 처음 상태로 되돌립니다.
  function handleClear() {
    setUrls([""]);
    setText("");
    setShowText(false);
    setError("");
    setFailures([]);
    setTrip(null);
    setOriginalTrip(null);
    setPool(null);
    setShareLinks(null);
    setSaveError("");
    setTripVersion((v) => v + 1);
  }

  function changeUrl(index, value) {
    setUrls((list) => list.map((u, i) => (i === index ? value : u)));
  }

  function addUrl() {
    setUrls((list) => (list.length < MAX_LINKS ? [...list, ""] : list));
  }

  function removeUrl(index) {
    setUrls((list) => list.filter((_, i) => i !== index));
  }

  // 여행기 하나로 만든 결과를 화면에 반영 (기존 동작과 같음)
  function showSingle(data) {
    setTrip(data);
    setOriginalTrip(data);
    setPool(buildPool([data]));
    setShareLinks(null);
    setTripVersion((v) => v + 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const links = urls.map((u) => u.trim()).filter(Boolean);
    const pasted = showText ? text : "";
    if (links.length === 0 && !pasted.trim()) {
      setError("여행기 주소를 넣거나 글 내용을 붙여넣어 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setFailures([]);

    // 링크가 하나(또는 붙여넣기만)면 지금까지와 똑같이 처리합니다.
    if (links.length <= 1) {
      const result = await extractOne(links[0] || "", pasted);
      if (result.error) {
        setError(result.error);
        if (result.needText) setShowText(true); // 가져오기 실패 → 붙여넣기 칸 열기
      } else {
        showSingle(result.data);
      }
      setLoading(false);
      return;
    }

    // 여러 링크: Gemini 무료 한도(분당 요청 수) 때문에 동시에 보내지 않고 하나씩 순서대로 읽어요.
    const results = [];
    const failed = [];
    for (let i = 0; i < links.length; i++) {
      setProgress(`${i + 1}/${links.length} 여행기 읽는 중…`);
      // await를 for 문 안에서 쓰면 앞의 요청이 끝나야 다음 요청을 보냅니다.
      const result = await extractOne(links[i], "");
      if (result.error) failed.push({ index: i + 1, error: result.error, needText: result.needText });
      else results.push(result.data);
    }
    setProgress("");
    setLoading(false);
    setFailures(failed);

    if (results.length === 0) {
      setError("링크를 하나도 읽지 못했어요.");
      return;
    }
    if (results.length === 1) {
      showSingle(results[0]); // 하나만 성공했으면 링크 하나 넣었을 때와 똑같이 보여줘요
      return;
    }

    // 2개 이상 성공: 장소 모음을 만들고, 내 일정은 AI 상담으로 만들도록 비워 둡니다.
    const newPool = buildPool(results);
    setPool(newPool);
    setOriginalTrip(null);
    setTrip({
      title: `여행기 ${results.length}개 모음`,
      region: newPool.sources[0].region,
      sourceUrl: null,
      days: [],
    });
    setShareLinks(null);
    setTripVersion((v) => v + 1);
  }

  // 지금 화면의 일정과 장소 모음을 저장하고, 다른 사람과 나눌 수 있는 링크를 만듭니다.
  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...trip, originalDays: (originalTrip || trip).days, pool }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "저장하지 못했어요.");
        return;
      }
      const base = `${window.location.origin}/trip/${data.id}`;
      setShareLinks({ view: base, edit: `${base}?edit=${data.editToken}` });
    } catch {
      setSaveError("서버에 연결하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  const hasInput = urls.some((u) => u) || text;

  const top = (
    <>
      <header className="brand">
        <h1>여행기 지도</h1>
        <p>블로그 여행기 링크를 넣으면 일차별 동선을 지도에 그려드려요.</p>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        {urls.map((u, i) => (
          <div className="url-row" key={i}>
            <label htmlFor={`url-${i}`} className="sr-only">여행기 주소 {i + 1}</label>
            <input
              id={`url-${i}`}
              type="url"
              inputMode="url"
              placeholder="https://blog.naver.com/..."
              value={u}
              onChange={(e) => changeUrl(i, e.target.value)}
            />
            {i > 0 && (
              <button type="button" className="clear-btn" onClick={() => removeUrl(i)} title="이 링크 빼기">
                ✕
              </button>
            )}
            {i === 0 && (hasInput || trip) && (
              <button type="button" className="clear-btn" onClick={handleClear} title="입력값과 결과 지우기">
                지우기
              </button>
            )}
          </div>
        ))}

        {/* 붙여넣기는 링크 하나일 때만 써요. 붙여넣기 칸이 열려 있으면 링크를 더 추가할 수 없어요. */}
        {urls.length < MAX_LINKS && !showText && (
          <button type="button" className="link add-link" onClick={addUrl}>
            + 링크 추가
          </button>
        )}

        {showText && (
          <>
            <label htmlFor="text" className="sr-only">여행기 본문</label>
            <textarea
              id="text"
              rows={7}
              placeholder="여행기 본문을 복사해서 붙여넣으세요. 이 칸에 내용이 있으면 주소 대신 이 글을 읽어요."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </>
        )}

        <div className="form-row">
          <button type="submit" className="primary" disabled={loading}>
            {loading ? progress || "일정 읽는 중…" : "지도로 만들기"}
          </button>
          {urls.length === 1 && (
            <button type="button" className="link" onClick={() => setShowText((v) => !v)}>
              {showText ? "붙여넣기 닫기" : "글 내용 직접 붙여넣기"}
            </button>
          )}
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        {failures.length > 0 && (
          <div className="failures" role="alert">
            <p>읽지 못한 링크가 있어서 건너뛰었어요.</p>
            <ul>
              {failures.map((f) => (
                <li key={f.index}>
                  {f.index}번째 링크: {f.error}
                  {f.needText && " 이 링크만 따로 넣고 글 내용을 붙여넣어 보세요."}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </>
  );

  const actions = (
    <div className="save-box">
      <button type="button" className="btn" onClick={handleSave} disabled={saving}>
        {saving ? "저장 중…" : "저장하고 공유 링크 만들기"}
      </button>
      {shareLinks && (
        <div className="share-links">
          <p className="share-url">
            <span>보기용 (다른 사람에게 보내세요)</span>
            <a href={shareLinks.view}>{shareLinks.view}</a>
          </p>
          <p className="share-url">
            <span>편집용 (나만 보관하세요. 이 링크가 있으면 누구나 수정할 수 있어요)</span>
            <a href={shareLinks.edit}>{shareLinks.edit}</a>
          </p>
        </div>
      )}
      {saveError && <p className="error">{saveError}</p>}
    </div>
  );

  return (
    <TripPanel
      key={tripVersion}
      trip={trip}
      originalTrip={originalTrip}
      pool={pool}
      onChange={setTrip}
      onPoolChange={setPool}
      top={top}
      actions={trip && actions}
    />
  );
}
