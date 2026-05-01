# 퍼즐 프로젝트 규칙

## Git
- 작업(기능 추가, 버그 수정 등)이 완료될 때마다 반드시 커밋하고 푸시한다.
- 커밋 메시지는 영어로, 변경 내용을 간결하게 요약한다.

## 캐시 버스팅
- `css/common.css`와 `js/common.js`를 수정할 때마다 모든 HTML 파일의 `?v=N`을 1씩 올린다.
- 현재 버전: `?v=5`
- 변경 명령 예시: `sed -i '' 's|common.js?v=4|common.js?v=5|g'` (css도 동일)

## 디자인
- 디자인 가이드는 `DESIGN.md`를 따른다.
- **기준 파일**: `puzzle_test/index.html` (테스트 스도쿠) — 버튼/규칙박스/레이아웃의 기준

## 버튼 스타일 (puzzle_test 기준)
- **숫자 키패드** (`.numpad button`):
  - `height: 44px; border-radius: 3px; font-size: 18px; font-weight: 700`
  - `border: 1.5px solid #c8c3b8; background: #f4f1eb; color: #333`
  - hover: `#e8e4da` / active: `scale(0.95)` + `#ddd9cf`
- **하단 버튼** (`.bottom-buttons button`):
  - `height: 40px; border-radius: 3px; font-size: 13px; font-weight: 500`
  - `border: 1.5px solid #d0ccc4; background: #faf8f4; color: #777`
  - 초기화(danger): `border-color: #e0bfbf; background: #fdf5f5; color: #b05050`
  - HTML 클래스: 지우기는 클래스 없음, 초기화는 `class="danger"`
  - gap: 6px, margin-top: 6px
- **규칙 보기** (`.rules-toggle`):
  - `<span>` 태그 사용 (button 아님)
  - `font-size: 0.78rem; color: #999; border-bottom: 1px solid #ccc; padding-bottom: 1px; align-self: center; margin-bottom: 8px`
- **규칙 박스** (`.rules-box`):
  - `background: #faf8f4; border: 1px solid #e0ddd6; border-radius: 3px; padding: 14px 18px`

## 입력 UX
- 스도쿠 계열 퍼즐은 마우스/터치뿐 아니라 **키보드 입력**도 지원한다.
- 지원 키:
  - `1`~`9`: 숫자 입력
  - `0`, `Backspace`, `Delete`: 지우기
  - `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`: 선택 셀 이동
- 새 스도쿠 페이지를 만들 때는 기존 `260316_01`, `260316_02`의 `keydown` 처리 패턴을 기본으로 사용한다.
- 숫자 키패드가 있는 퍼즐은 종류와 관계없이 **물리 키보드 숫자 입력으로 키패드를 대체**할 수 있어야 한다.
- 이 경우 지원 키는 해당 퍼즐의 실제 입력 범위에 맞춘다.
  - 예: `1`~`6` 퍼즐이면 `1`~`6`만 입력
  - `Backspace`, `Delete`는 지우기 동작에 연결
- 퍼즐 진행 상태나 결과는 가능하면 **퍼즐 보드 자체의 시각 변화로 보여준다.**
- `tilt-note` 같은 별도 설명 문구는 만들지 않는다. 완료 메시지만 예외로 허용한다.

## container 내 요소 순서
- **container 안** 순서: `rules-toggle` → `rules-box` → board → (퍼즐별 요소: numpad 등) → `bottom-buttons` → `cloud-btns` → (사용 현황/보조 패널) → `message`(있는 경우) → `lb-section`
- 규칙 박스는 board **위**에 배치한다.
- `.subtitle`은 `margin-bottom: 0` — 제목 아래 여백은 board의 `margin-top: 20px`으로 처리한다.

## 퍼즐 목록 관리
- `puzzle/index.html`이 퍼즐 목록 페이지 역할을 한다.
- 새 퍼즐을 추가하면 반드시 `puzzle/index.html`의 `.list` 안에 항목을 추가해야 한다.
- 링크 형식: `/puzzle/{폴더명}/` (도메인: `xivnick.me`)
- 각 항목에는 퍼즐 제목과 유형 태그를 포함하고, `data-puzzle-id` 속성을 반드시 추가한다.
- 퍼즐 목록은 클라이언트에서 **10개씩 페이징**한다.
- 최신 퍼즐이 항상 위에 오도록 리스트 순서를 유지하고, 페이징은 그 순서를 기준으로 잘라 보여준다.
- 페이지 상태는 `#page-N` 해시로 관리한다.

## 폴더 구조
```
puzzle/
  index.html          ← 퍼즐 목록 페이지
  DESIGN.md           ← 디자인 가이드
  CLAUDE.md           ← 이 파일
  css/common.css      ← 공통 스타일 (헤더, 리더보드, 토스트, 클라우드 버튼)
  js/common.js        ← 공통 스크립트 (Supabase, 닉네임, 완료 기록, 리더보드, 클라우드 저장)
  nickname/           ← 닉네임 설정 페이지
  tools/              ← 제작 도구 모음
  puzzle_test/        ← 테스트 스도쿠 (기능 테스트용, 목록에 표시됨)
    index.html
  {YYMMDD}_{번호}/    ← 개별 퍼즐 폴더
    index.html        ← 퍼즐 페이지
```

## 퍼즐 데이터 컨벤션
- 프리셋 숫자(주어진 숫자)는 반드시 **2D 배열**로 정의한다. `0` = 빈 칸, 양수 = 프리셋 숫자.
- 도형 마스크, 고정 숫자, 단서 배치 등 **초기 보드 데이터는 항상 2차원 배열로 먼저 정의**한다.
- 런타임에서 필요한 `Set`, `Map`, 객체 형태는 2차원 배열에서 파생해서 만든다.
- 이후 `PRESETS` 객체는 2D 배열에서 자동 생성한다.
```js
const PRESET_GRID = [
  [0, 0, 0, 0, 7, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 6, 0],
  // ...
];
const PRESETS = {};
PRESET_GRID.forEach((row, r) => row.forEach((v, c) => { if (v) PRESETS[`${r},${c}`] = v; }));
```

## 네이밍 컨벤션
- 폴더명: `{YYMMDD}_{번호}` (예: `260316_01`, `260316_02`)
- 같은 날짜에 여러 퍼즐이 있으면 번호를 `_01`부터 1씩 증가
- 퍼즐 제목 형식: `{YYMMDD} {퍼즐 유형}` (예: "260316 노 터치 스도쿠")

## 내비게이션
- 모든 페이지 상단에 `<header class="site-header">` 고정 헤더를 배치한다.
- 헤더 좌측: 퍼즐 페이지는 `< puzzles` 뒤로가기 링크 (`.header-back`), 메인 페이지는 빈 `<span>`
- 헤더 우측: 닉네임 텍스트 링크 (`<a class="header-nick-link" id="nicknameLink" href="/puzzle/nickname/">`)
  - 닉네임 미설정 시 "게스트" 표시
  - 클릭 시 `/puzzle/nickname/` 페이지로 이동
- 헤더 스타일은 `css/common.css`에 정의되어 있음

## 닉네임 시스템
- localStorage 키: `vodka_nickname`
- `/puzzle/nickname/` 페이지에서 설정
- 게스트(미설정 또는 "게스트" 입력): 완료 기록 저장 안됨, 클라우드 저장 버튼 숨겨짐
- `GUEST_NAME = '게스트'` 상수는 `js/common.js`에 정의
- `isGuest()` 함수로 게스트 여부 확인
- `initHeader()` 호출로 헤더 닉네임 링크 텍스트 초기화
- `initCloudBtns()` 호출로 클라우드 버튼 표시 여부 초기화

## 풀이 저장 (localStorage)
- 키 형식: `puzzle_{폴더명}` (예: `puzzle_260316_01`)
- 숫자를 입력하거나 지울 때, 초기화할 때 `saveProgress()` 호출
- 페이지 로드 시 `loadProgress()`로 저장된 상태를 복원
- 초기화 시 저장 데이터도 초기 상태로 덮어쓴다

## 클라우드 저장 (Supabase)
- Supabase `progress` 테이블: `nickname`, `puzzle_id`, `state (jsonb)`, `saved_at`
- 기본키: `(nickname, puzzle_id)` — upsert로 덮어씀
- `saveProgressCloud(PUZZLE_ID, state)` — 현재 상태를 클라우드에 저장
- `loadProgressCloud(PUZZLE_ID)` — 클라우드에서 상태를 불러와 반환
- 퍼즐 페이지 하단에 저장하기 / 불러오기 버튼 (`#cloudBtns`) 배치
- 버튼은 `bottom-buttons` 바로 다음 줄에 배치
- 게스트일 때 버튼 숨김 (`initCloudBtns()` 호출 필요)
- 토스트 메시지: "저장했습니다." / "불러왔습니다." / "불러올 데이터가 없습니다."

## 완료 기록 (Supabase)
- Supabase `completions` 테이블: `nickname`, `puzzle_id`, `completed_at`
- 완성 감지 시 `recordCompletion(PUZZLE_ID)` 호출
- 완료 메시지는 기본적으로 `"축하합니다! 퍼즐을 완성했습니다!"` 로 통일한다.
- 게스트는 저장 안 됨 → confirm으로 닉네임 설정 유도
- 초기화 시 `resetCompletion(PUZZLE_ID)` 호출 (세션 플래그 초기화)
- localStorage 키 `completion_saved_{puzzleId}`로 세션 내 중복 저장 방지

## 리더보드
- 각 퍼즐 페이지 하단에 `<div class="lb-section"><div class="lb-title">푼 사람</div><div id="leaderboard"></div></div>` 추가
- `renderLeaderboard(PUZZLE_ID, 'leaderboard')` 호출로 렌더링
- 제목: "푼 사람(n)" — n은 고유 닉네임 수, 런타임에 자동 업데이트
- 완료 시각 기준 오름차순, 닉네임 중복 시 가장 빠른 기록만 표시
- 1~10위 표시, 11명 이상이면 마지막 순위도 별도 표시
- 완료 시각 포맷: `MM월 DD일 HH:MM`
- 내 닉네임 행은 `.lb-me` 클래스로 강조

## 메인 페이지
- `loadCompletions()` → `getMyCompletedPuzzles()`로 완료한 퍼즐 조회 → ✓ 체크마크 표시
- `loadCounts()` → `getSolverCounts()`로 퍼즐별 풀이자 수 조회 → 제목 옆 `(n)` 표시

## OG 메타 태그
- 모든 페이지에 Open Graph 메타 태그를 포함한다.
- 필수 태그: `og:title`, `og:description`, `og:type`, `og:url`
- `og:type`은 `website`
- `og:url`은 `https://xivnick.me/puzzle/{폴더명}/` 형식
- `og:description`은 퍼즐의 핵심 규칙을 한 줄로 요약

## 퍼즐 추가 체크리스트
1. `{YYMMDD}_{번호}/` 폴더 생성 (네이밍 컨벤션 준수)
2. 해당 폴더에 `index.html` 작성 (DESIGN.md 준수)
3. `<head>`에 `css/common.css`, `js/common.js` 로드
4. `<body>` 첫 줄에 `<header class="site-header">` 헤더 추가
   - 좌측: `<a class="header-back" href="/puzzle/">&lt; puzzles</a>`
   - 우측: `<a class="header-nick-link" id="nicknameLink" href="/puzzle/nickname/"></a>`
5. `localStorage` 저장/복원 로직 포함 (키: `puzzle_{폴더명}`)
6. OG 메타 태그 포함 (`og:title`, `og:description`, `og:type`, `og:url`)
7. `const PUZZLE_ID = '{폴더명}'` 선언
8. 완성 감지 시 `recordCompletion(PUZZLE_ID)` 호출
   - 완료 메시지는 기본적으로 `"축하합니다! 퍼즐을 완성했습니다!"`
9. 초기화 버튼에 `confirm('정말 초기화하시겠습니까?')` 추가, 확인 시 `resetCompletion(PUZZLE_ID)` 호출
10. 클라우드 버튼 HTML 추가 (`bottom-buttons` 바로 다음 줄):
    ```html
    <div class="cloud-btns" id="cloudBtns" style="display:none">
      <button class="cloud-btn" onclick="handleCloudSave()">저장하기</button>
      <button class="cloud-btn" onclick="handleCloudLoad()">불러오기</button>
    </div>
    ```
11. `handleCloudSave()` / `handleCloudLoad()` 함수 구현 (퍼즐 상태 직렬화/역직렬화)
12. 리더보드 섹션 추가: `<div class="lb-section"><div class="lb-title">푼 사람</div><div id="leaderboard"></div></div>`
13. 페이지 하단 스크립트에서 호출:
    ```javascript
    initHeader();
    initCloudBtns();
    renderLeaderboard(PUZZLE_ID, 'leaderboard');
    ```
14. `puzzle/index.html`의 `.list` 안에 `data-puzzle-id` 속성과 함께 항목 추가 (최신 퍼즐이 위로)
15. 스도쿠 계열 퍼즐이면 숫자키/방향키/지우기 키 입력 지원 추가
