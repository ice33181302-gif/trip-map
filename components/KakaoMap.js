"use client";
// 카카오맵은 브라우저에서만 동작하므로 이 컴포넌트는 클라이언트 전용입니다.
import { useEffect, useRef } from "react";
import { dayColor } from "@/lib/colors";

// SDK 스크립트를 한 번만 불러오도록 Promise를 공유합니다.
let sdkPromise = null;
function loadKakaoSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve(window.kakao));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_JS_KEY}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("카카오맵을 불러오지 못했어요. JavaScript 키와 등록한 도메인을 확인하세요."));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export default function KakaoMap({ days = [], selectedDay = "all", focusKey = null, onSelect, routeLegs = {} }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const drawnRef = useRef([]); // 지도에 올린 마커·선 (다시 그릴 때 지우기용)
  const pinsRef = useRef(new Map()); // key → { el, position }
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const focusRef = useRef(focusKey);
  focusRef.current = focusKey;

  // 1) 지도 생성 (처음 한 번)
  useEffect(() => {
    let cancelled = false;
    loadKakaoSdk()
      .then((kakao) => {
        if (cancelled || mapRef.current) return;
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(36.35, 127.8), // 대한민국 가운데쯤
          level: 13,
        });
      })
      .catch((e) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<p class="map-error">${e.message}</p>`;
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) 일정이 바뀌면 마커와 경로를 다시 그리기
  useEffect(() => {
    let cancelled = false;
    loadKakaoSdk().then((kakao) => {
      const map = mapRef.current;
      if (cancelled || !map) return;

      drawnRef.current.forEach((obj) => obj.setMap(null));
      drawnRef.current = [];
      pinsRef.current.clear();

      const bounds = new kakao.maps.LatLngBounds();
      let count = 0;

      const visible = days.filter((d) => selectedDay === "all" || d.day === selectedDay);
      visible.forEach((d) => {
        const color = dayColor(d.day);
        const path = [];

        d.places.forEach((p, i) => {
          if (!p.match) return;
          const key = `${d.day}-${i}`;
          const position = new kakao.maps.LatLng(p.match.lat, p.match.lng);
          path.push(position);
          bounds.extend(position);
          count++;

          // 번호가 적힌 원형 핀 (일차 색상)
          const el = document.createElement("button");
          el.type = "button";
          el.className = "pin";
          el.style.setProperty("--c", color);
          el.textContent = String(i + 1);
          el.title = `${d.day}일차 ${i + 1}. ${p.name}`;
          if (key === focusRef.current) el.classList.add("active");
          el.addEventListener("click", () => onSelectRef.current?.(key));

          const overlay = new kakao.maps.CustomOverlay({ position, content: el, yAnchor: 0.5 });
          overlay.setMap(map);
          drawnRef.current.push(overlay);
          pinsRef.current.set(key, { el, position });
        });

        // 방문 순서대로 구간마다 선을 그립니다.
        // "실제 경로 보기"로 받아온 구간은 그 좌표를, 아직 없거나 실패한 구간은 직선을 씁니다.
        const legs = routeLegs[d.day];
        for (let j = 0; j < path.length - 1; j++) {
          const leg = legs?.[j];
          const linePath = leg
            ? leg.points.map(([lat, lng]) => new kakao.maps.LatLng(lat, lng))
            : [path[j], path[j + 1]];
          const line = new kakao.maps.Polyline({
            path: linePath,
            strokeWeight: 4,
            strokeColor: color,
            strokeOpacity: 0.8,
            strokeStyle: leg ? "solid" : "shortdash", // 직선 구간은 점선으로 구분
          });
          line.setMap(map);
          drawnRef.current.push(line);
        }
      });

      if (count === 1) {
        map.setLevel(5);
        map.setCenter(bounds.getSouthWest());
      } else if (count > 1) {
        map.setBounds(bounds, 60, 60, 60, 60);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [days, selectedDay, routeLegs]);

  // 3) 목록에서 장소를 고르면 그 위치로 이동하고 핀 강조
  useEffect(() => {
    pinsRef.current.forEach(({ el }, key) => el.classList.toggle("active", key === focusKey));
    const target = focusKey && pinsRef.current.get(focusKey);
    if (target && mapRef.current) mapRef.current.panTo(target.position);
  }, [focusKey, days, selectedDay]);

  return <div ref={containerRef} className="map" />;
}
