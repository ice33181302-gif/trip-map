"use client";
import { useState } from "react";
import TripPanel from "@/components/TripPanel";

export default function Home() {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trip, setTrip] = useState(null);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [saveError, setSaveError] = useState("");

  // 입력값과 지금까지 만든 결과를 모두 지우고 처음 상태로 되돌립니다.
  function handleClear() {
    setUrl("");
    setText("");
    setShowText(false);
    setError("");
    setTrip(null);
    setShareUrl("");
    setSaveError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim() && !text.trim()) {
      setError("여행기 주소를 넣거나 글 내용을 붙여넣어 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, text: showText ? text : "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "처리하지 못했어요.");
        if (data.needText) setShowText(true); // 가져오기 실패 → 붙여넣기 칸 열기
        return;
      }
      setTrip(data);
      setShareUrl("");
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  // 지금 화면의 일정을 저장하고, 다른 사람과 나눌 수 있는 링크를 만듭니다.
  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trip),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "저장하지 못했어요.");
        return;
      }
      setShareUrl(`${window.location.origin}/trip/${data.id}`);
    } catch {
      setSaveError("서버에 연결하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  const top = (
    <>
      <header className="brand">
        <h1>여행기 지도</h1>
        <p>블로그 여행기 링크를 넣으면 일차별 동선을 지도에 그려드려요.</p>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <label htmlFor="url" className="sr-only">여행기 주소</label>
        <div className="url-row">
          <input
            id="url"
            type="url"
            inputMode="url"
            placeholder="https://blog.naver.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {(url || text || trip) && (
            <button type="button" className="clear-btn" onClick={handleClear} title="입력값과 결과 지우기">
              지우기
            </button>
          )}
        </div>

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
            {loading ? "일정 읽는 중…" : "지도로 만들기"}
          </button>
          <button type="button" className="link" onClick={() => setShowText((v) => !v)}>
            {showText ? "붙여넣기 닫기" : "글 내용 직접 붙여넣기"}
          </button>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </>
  );

  const actions = (
    <div className="save-box">
      <button type="button" className="link" onClick={handleSave} disabled={saving}>
        {saving ? "저장 중…" : "저장하고 공유 링크 만들기"}
      </button>
      {shareUrl && (
        <p className="share-url">
          <a href={shareUrl}>{shareUrl}</a>
        </p>
      )}
      {saveError && <p className="error">{saveError}</p>}
    </div>
  );

  return <TripPanel trip={trip} onChange={setTrip} top={top} actions={trip && actions} />;
}
