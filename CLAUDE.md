# CLAUDE.md

## 프로젝트 개요

여행기 지도: 블로그 여행기 URL(또는 붙여넣은 본문)을 받아 LLM으로 일차별 방문 장소를 추출하고, 카카오맵에 일차별 색상 핀과 동선을 그려주는 웹 서비스. 현재는 국내 여행 위주의 프로토타입 단계이며, 이후 해외(Google Maps/Mapbox)로 확장할 예정이다.

## 작업 방식 (중요)

- 사용자는 Next.js를 처음 쓰고 React는 조금 써본 수준이다. 코드를 바꾸면 무엇을 왜 바꿨는지 한국어로 짧게 설명한다.
- 대화, 코드 주석, UI 문구는 모두 한국어로 쓴다. UI 문구는 짧고 평이한 해요체를 쓴다.
- 새 개념(서버/클라이언트 컴포넌트, 라우트 핸들러 등)이 처음 등장하면 한두 문장으로 설명한다.
- 큰 변경(새 라이브러리 추가, 폴더 구조 변경, DB 도입)은 먼저 계획을 제안하고 확인받은 뒤 진행한다.
- TypeScript가 아닌 JavaScript를 쓴다. 사용자가 요청하기 전에는 TS로 전환하지 않는다.

## 명령어

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 (http://localhost:3000)
npm run build      # 프로덕션 빌드 (변경 후 에러 확인용으로 실행)
npm run start      # 빌드 결과 실행
```

API만 따로 확인할 때:

```bash
curl -X POST http://localhost:3000/api/extract \
  -H "Content-Type: application/json" \
  -d '{"text":"1일차: 해운대 해수욕장 → 더베이101. 2일차: 감천문화마을 → 자갈치시장"}'
```

## 기술 스택

- Next.js 15 (App Router), React 19, JavaScript
- `@google/genai`: 일정 추출 (모델은 `GEMINI_MODEL` 환경변수, 기본 `gemini-3.5-flash-lite`)
- `cheerio`: 네이버 블로그 HTML 파싱
- `jsdom` + `@mozilla/readability`: 일반 웹페이지 본문 추출
- 카카오 로컬 API(장소 검색, 서버) + 카카오맵 JS SDK(지도 표시, 브라우저)
- 스타일은 `app/globals.css` 하나의 일반 CSS 파일 (Tailwind 없음)

## 구조와 데이터 흐름

```
app/page.js                  화면: URL 입력, 붙여넣기, 일차 탭, 장소 목록 (클라이언트)
components/KakaoMap.js       지도, 핀(CustomOverlay), 경로선(Polyline) (클라이언트 전용)
app/api/extract/route.js     POST /api/extract: 아래 lib 함수들을 순서대로 호출
lib/fetchContent.js          URL → 본문 텍스트 (네이버 블로그는 PostView 주소로 변환)
lib/llm.js                   본문 → { title, region, days[] } JSON
lib/geocode.js               장소명 → { match, candidates[] } (카카오 키워드 검색)
lib/colors.js                일차별 색상 (지도와 목록이 공유)
```

`/api/extract` 응답 형태:

```js
{
  title, region, sourceUrl,
  days: [{
    day: 1,
    places: [{
      name, regionHint, time, memo,
      match: { name, lat, lng, address, category, kakaoId, kakaoUrl } | null,
      candidates: [ /* match와 같은 형태, 최대 5개 */ ]
    }]
  }]
}
```

실패 시 `{ error, needText? }`를 돌려준다. `needText: true`면 프론트가 붙여넣기 칸을 연다.

## 환경변수 (.env.local)

- `GEMINI_API_KEY`, `GEMINI_MODEL`: 서버 전용. 키 발급: https://aistudio.google.com/apikey
  - 무료 티어는 입력 데이터가 Google 제품 개선에 쓰일 수 있다는 점을 유의한다.
- `KAKAO_REST_KEY`: 서버 전용 (장소 검색)
- `NEXT_PUBLIC_KAKAO_JS_KEY`: 브라우저용 (지도 SDK). `NEXT_PUBLIC_` 접두사가 있어야 브라우저에서 읽힌다.

`.env.local`은 절대 커밋하지 않고, 코드에 키를 직접 쓰지 않는다. 서버 전용 키에 `NEXT_PUBLIC_`을 붙이지 않는다.

## 주의할 점 (자주 틀리는 부분)

- **카카오맵은 브라우저 전용이다.** `window.kakao`를 쓰는 코드는 `"use client"` 컴포넌트의 `useEffect` 안에서만 실행한다. `page.js`는 `dynamic(..., { ssr: false })`로 지도를 불러온다. "window is not defined" 에러가 나면 이 규칙을 어긴 것이다.
- **SDK는 `autoload=false`로 불러온 뒤 `kakao.maps.load()` 안에서 사용한다.** 로딩 로직은 `loadKakaoSdk()` 하나로 공유하며, 스크립트를 중복으로 삽입하지 않는다.
- **카카오 로컬 API는 `y`가 위도, `x`가 경도다.** 앱 내부에서는 항상 `lat`/`lng`로 변환해서 쓴다.
- **`jsdom`은 `next.config.mjs`의 `serverExternalPackages`에 있어야 한다.** 빼면 빌드가 깨질 수 있다.
- **route.js에는 `export const runtime = "nodejs"`가 있어야 한다.** jsdom 등 Node 전용 라이브러리 때문에 Edge 런타임에서는 동작하지 않는다.
- **네이버 블로그 본문은 iframe 안에 있다.** `blog.naver.com/{id}/{logNo}` 형태는 `PostView.naver?blogId=&logNo=`로 바꿔서 가져온다. 본문 셀렉터는 `.se-main-container`(스마트에디터 ONE)가 우선이고, 구버전 셀렉터는 fallback이다.
- **LLM 응답은 JSON만 오도록 프롬프트에 명시되어 있다.** 파싱 전에 코드블록 표시(```)를 제거하는 처리를 유지한다.
- **현재 경로선은 방문 순서를 직선으로 이은 것이다.** 실제 도로 경로가 아니라는 점을 UI나 문서에서 오해 없게 표현한다.

## 원칙 (저작권·안전)

- 원문 본문 텍스트는 DB나 화면에 저장·재게시하지 않는다. 추출한 장소 데이터와 원문 링크만 보관하고 보여준다.
- `lib/fetchContent.js`의 `assertPublicUrl`(내부망 주소 차단)은 제거하거나 약화하지 않는다.
- 인스타그램 등 로그인이 필요한 사이트의 스크래핑 기능은 추가하지 않는다.
- 유명인 이름이나 사진을 홍보용으로 쓰는 기능은 만들지 않는다 (퍼블리시티권 이슈).

## 로드맵 (우선순위 순)

1. 장소 후보 선택 UI: `candidates`로 "이 장소가 맞나요?" 수정 기능, 위치를 못 찾은 장소는 직접 검색해 추가
2. 일정 편집: 순서 변경, 장소 삭제·추가, 일차 이동
3. 저장과 공유 링크 (DB 도입 시 먼저 사용자와 선택지 논의)
4. 카카오모빌리티 길찾기 API로 실제 도로 경로와 이동 시간 표시
5. 유튜브 설명란·자막 지원 (자막은 비공식 방식이라 실패 시 붙여넣기로 대체)
6. 해외 확장: 지도 레이어를 공통 인터페이스(마커, 선, 범위 맞추기)로 분리하고, `country` 필드를 추가해 국내는 카카오, 해외는 Google/Mapbox로 분기

## 변경 후 확인 체크리스트

- `npm run build`가 에러 없이 끝나는지
- 네이버 블로그 URL 하나, 일반 웹페이지 URL 하나, 붙여넣기 텍스트 하나로 각각 동작하는지
- 일차 탭 전환, 목록 클릭 시 지도 이동·핀 강조가 되는지
- 모바일 폭(800px 이하)에서 지도가 위, 목록이 아래로 보이는지
- 브라우저 개발자도구 콘솔에 에러가 없는지
