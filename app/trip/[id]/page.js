"use client";
// 공유 링크로 들어왔을 때 저장된 일정을 보여주고, 편집 후 다시 저장할 수 있는 화면
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TripPanel from "@/components/TripPanel";

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch(`/api/trips/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error || "불러오지 못했어요.");
          return;
        }
        const { originalDays, ...tripData } = data;
        const days = withIds(tripData.days);
        setTrip({ ...tripData, days });
        // originalDays가 없는 옛날 저장본은 현재 일정을 원본으로 취급합니다(비교 탭은 안 보임).
        setOriginalTrip({ ...tripData, days: withIds(originalDays || tripData.days) });
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...trip, originalDays: (originalTrip || trip).days }),
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
    <header className="brand">
      <h1>여행기 지도</h1>
      <a href="/" className="link">새로 만들기</a>
    </header>
  );

  const actions = (
    <div className="save-box">
      <button type="button" className="link" onClick={handleSave} disabled={saving}>
        {saving ? "저장 중…" : saved ? "저장됨" : "수정 내용 저장"}
      </button>
      {saveError && <p className="error">{saveError}</p>}
    </div>
  );

  return (
    <TripPanel
      trip={trip}
      originalTrip={originalTrip}
      onChange={setTrip}
      top={top}
      actions={actions}
    />
  );
}
