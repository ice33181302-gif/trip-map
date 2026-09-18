# 여행기 지도 (프로토타입)

블로그 여행기 주소를 넣으면 AI가 일정을 읽어서 카카오맵에 일차별 색상 핀과 동선을 그려줍니다.

## 1. 준비물

- Node.js 18.18 이상 (`node -v`로 확인)
- Gemini API 키: https://aistudio.google.com/apikey (무료 티어 있음. 단, 무료 티어는 입력 데이터가 Google 제품 개선에 쓰일 수 있어요)
- 카카오 개발자 앱: https://developers.kakao.com

## 2. 카카오 설정

1. 카카오 개발자 콘솔에서 애플리케이션을 만듭니다.
2. **앱 키**에서 `REST API 키`와 `JavaScript 키`를 복사해 둡니다.
3. **[앱] > [플랫폼 키] > JavaScript 키 > [JavaScript SDK 도메인]**에 사이트 도메인 `http://localhost:3000`을 등록합니다. (배포하면 실제 도메인도 추가)
4. 콘솔의 **카카오맵** 메뉴에서 사용 설정을 켭니다. (꺼져 있으면 지도가 뜨지 않아요)

## 3. 실행

```bash
npm install
cp .env.local.example .env.local   # 윈도우는 copy .env.local.example .env.local
# .env.local 파일을 열어 키 4개를 채웁니다
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.

## 4. 파일 구조

| 파일 | 하는 일 |
| --- | --- |
| `app/page.js` | 화면: 주소 입력, 붙여넣기, 저장/공유 |
| `app/trip/[id]/page.js` | 공유 링크로 들어왔을 때 저장된 일정 보기·편집 |
| `components/TripPanel.js` | 일차 탭, 장소 목록, 후보 선택, 경로 조회 등 편집 UI (홈·공유 화면 공통) |
| `components/KakaoMap.js` | 카카오맵 표시, 핀과 경로선 그리기 (브라우저 전용) |
| `app/api/extract/route.js` | 서버 API: 본문 가져오기 → AI 추출 → 좌표 찾기 |
| `app/api/search-place/route.js` | 위치를 못 찾은 장소를 직접 검색어로 찾기 |
| `app/api/route/route.js` | 한 일차의 실제 이동 경로(도보/대중교통) 조회 |
| `app/api/trips/route.js` | 일정 저장 (공유용 id 발급) |
| `app/api/trips/[id]/route.js` | 저장된 일정 불러오기·수정 |
| `lib/fetchContent.js` | 네이버 블로그·일반 웹페이지 본문 추출 |
| `lib/llm.js` | Gemini에게 일정 JSON을 뽑아달라고 요청 |
| `lib/geocode.js` | 카카오 장소 검색으로 좌표 찾기 |
| `lib/route.js` | 카카오모빌리티 길찾기 API 호출, 구간별 캐싱 |
| `lib/db.js` | SQLite 연결, 일정 저장·조회 |
| `lib/colors.js` | 일차별 색상 |

## 5. 알아두면 좋은 점

- 지도 위 선은 방문 순서를 **직선으로** 이은 것이에요. 실제 도로 경로는 카카오모빌리티 길찾기 API를 붙이면 됩니다.
- 장소 검색은 지금 첫 번째 결과를 씁니다. API 응답의 `candidates`에 후보가 최대 5개 들어 있으니, "이 장소가 맞나요?" 선택 기능을 여기서부터 만들면 됩니다.
- 네이버 블로그의 HTML 구조는 바뀔 수 있어요. 본문을 못 가져오면 화면에 붙여넣기 칸이 자동으로 열립니다.
- 원문 텍스트는 저장하지 않고, 추출한 장소 정보와 원문 링크만 보여줍니다.

## 다음 단계 아이디어

1. 장소 후보 선택 / 일정 편집
2. 결과를 DB에 저장하고 공유 링크 만들기
3. 유튜브 설명란·자막 지원
4. 해외 일정은 Google Maps나 Mapbox로 표시
