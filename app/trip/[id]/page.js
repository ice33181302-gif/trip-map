"use client";
// 공유 링크로 들어왔을 때 저장된 일정을 보여주는 화면
// - 보기용 링크 /trip/{id}: 일정만 볼 수 있어요 (편집·AI 상담·저장 숨김)
// - 편집용 링크 /trip/{id}?edit={비밀값}: 수정하고 다시 저장할 수 있어요
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TripPanel from "@/components/TripPanel";
import { addMissingPlaces, buildPool } from "@/lib/pool";

// 옛날에 저장된 일정은 장소에 id가 없을 수 있어서, 불러올 때 채워 넣습니다.
function withIds(days) {
  return days.map((d) => ({
    ...d,
    places: d.places.map((p) => (p.id ? p : { ...p, id: crypto.randomUUID() })),
  }));
}

export default function SharedTripPage() {
  const { id } = useParams();
  const [trip, setTrip] = useState(null);
  const [originalTrip, setOriginalTrip] = useState(null);
  const [pool, setPool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editToken, setEditToken] = useState(""); // 편집용 링크로 들어왔을 때만 값이 있어요
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // 주소의 ?edit= 값을 읽어 둡니다. (URLSearchParams는 주소의 ? 뒤 부분을 쉽게 읽게 해주는 브라우저 기능)
    setEditToken(new URLSearchParams(window.location.search).get("edit") || "");
    fetch(`/api/trips/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error || "불러오지 못했어요.");
          return;
        }
        const { originalDays, pool: savedPool, ...tripData } = data;
        const days = withIds(tripData.days);
        setTrip({ ...tripData, days });
        // originalDays가 없는 옛날 저장본은 현재 일정을 원본으로 취급합니다(비교 탭은 안 보임).
        const original = { ...tripData, days: withIds(originalDays || tripData.days) };
        setOriginalTrip(original);
        // 장소 모음이 없는 옛날 저장본은 원본 일정으로 모음을 만들고,
        // 그 뒤에 추가했던 장소도 모음에 넣어 AI 상담에서 쓸 수 있게 합니다.
        setPool(addMissingPlaces(savedPool || buildPool([original]), days));
      })
      .catch(() => setLoadError("서버에 연결하지 못했어요."))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/trips/${id}`, {
        method: "PUT",
        // 비밀값은 일정 데이터에 섞여 저장되지 않게 본문이 아니라 헤더로 보냅니다.
        headers: { "Content-Type": "application/json", "X-Edit-Token": editToken },
        body: JSON.stringify({ ...trip, originalDays: (originalTrip || trip).days, pool }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "저장하지 못했어요.");
        return;
      }
      setSaved(true);
    } catch {
      setSaveError("서버에 연결하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="shell">
        <aside className="panel">
          <p className="notice">불러오는 중…</p>
        </aside>
        <main className="map-wrap" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="shell">
        <aside className="panel">
          <p className="error" role="alert">{loadError}</p>
          <a href="/" className="link">새 여행기 지도 만들기</a>
        </aside>
        <main className="map-wrap" />
      </div>
    );
  }

  const top = (
    <header className="brand brand-row">
      <h1>여행기 지도</h1>
      <a href="/" className="btn">새로 만들기</a>
    </header>
  );

  // 편집용 링크를 보고 있을 때, 다른 사람에게 보낼 보기용 링크를 복사합니다.
  async function copyViewLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/trip/${id}`);
      setCopied(true);
    } catch {
      setSaveError("복사하지 못했어요. 주소창에서 ?edit= 앞부분까지만 복사해 주세요.");
    }
  }

  const readOnly = !editToken;
  const actions = readOnly ? (
    <span className="readonly-badge">보기 전용</span>
  ) : (
    <div className="save-box">
      <button type="button" className="btn" onClick={handleSave} disabled={saving}>
        {saving ? "저장 중…" : saved ? "저장됨" : "수정 내용 저장"}
      </button>
      <button type="button" className="btn" onClick={copyViewLink}>
        {copied ? "복사됨" : "보기용 링크 복사"}
      </button>
      {saveError && <p className="error">{saveError}</p>}
    </div>
  );

  return (
    <TripPanel
      trip={trip}
      originalTrip={originalTrip}
      pool={pool}
      onChange={setTrip}
      onPoolChange={setPool}
      top={top}
      actions={actions}
      readOnly={readOnly}
    />
  );
}
