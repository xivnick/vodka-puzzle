# 퍼즐 프로젝트 규칙

## 디자인
- 디자인 가이드는 `DESIGN.md`를 따른다.

## 퍼즐 목록 관리
- `puzzle/index.html`이 퍼즐 목록 페이지 역할을 한다.
- 새 퍼즐을 추가하면 반드시 `puzzle/index.html`의 `.list` 안에 항목을 추가해야 한다.
- 링크 형식: `/puzzle/{폴더명}/` (도메인: `xivnick.me`)
- 각 항목에는 퍼즐 제목과 유형 태그를 포함한다.

## 폴더 구조
```
puzzle/
  index.html        ← 퍼즐 목록 페이지
  DESIGN.md         ← 디자인 가이드
  CLAUDE.md         ← 이 파일
  {YYMMDD}_{번호}/   ← 개별 퍼즐 폴더
    index.html      ← 퍼즐 페이지
```

## 네이밍 컨벤션
- 폴더명: `{YYMMDD}_{번호}` (예: `260316_01`, `260316_02`)
- 같은 날짜에 여러 퍼즐이 있으면 번호를 `_01`부터 1씩 증가
- 퍼즐 제목 형식: `{YYMMDD} {퍼즐 유형}` (예: "260316 노 터치 스도쿠")

## 내비게이션
- 모든 페이지 상단에 `<header class="site-header">` 고정 헤더를 배치한다.
- 헤더 좌측: 퍼즐 페이지는 `< puzzles` 뒤로가기 링크 (`.header-back`), 메인 페이지는 빈 `<span>`
- 헤더 우측: 닉네임 입력 input (`.header-nick-input`)
- 헤더 스타일은 `css/common.css`에 정의되어 있음

## 풀이 저장
- `localStorage`를 사용하여 사용자의 풀이 진행 상태를 저장한다.
- 키 형식: `puzzle_{폴더명}` (예: `puzzle_260316_01`)
- 숫자를 입력하거나 지울 때, 초기화할 때 `saveProgress()` 호출
- 페이지 로드 시 `loadProgress()`로 저장된 상태를 복원
- 초기화 시 저장 데이터도 초기 상태로 덮어쓴다

## OG 메타 태그
- 모든 페이지에 Open Graph 메타 태그를 포함한다.
- 필수 태그: `og:title`, `og:description`, `og:type`, `og:url`
- `og:type`은 `website`
- `og:url`은 `https://xivnick.me/puzzle/{폴더명}/` 형식
- `og:description`은 퍼즐의 핵심 규칙을 한 줄로 요약

## 닉네임 및 랭킹 시스템

### 공통 파일
- `js/common.js` — Supabase 클라이언트, 닉네임 관리, 타이머, 랭킹 렌더링
- `css/common.css` — 헤더, 리더보드, 토스트 스타일

### 닉네임
- localStorage 키: `vodka_nickname`
- 헤더 input에서 Enter 또는 포커스 해제 시 자동 저장
- 변경 시 토스트 알림 표시
- `initHeader()` 호출로 초기화

### 타이머 & 완료 기록
- 페이지 로드 시 `timerStart(PUZZLE_ID)` 호출
- 초기화 시 `timerReset(PUZZLE_ID); timerStart(PUZZLE_ID);` 호출
- 완성 감지 시 `recordCompletion(PUZZLE_ID)` 호출
- Supabase `completions` 테이블에 저장 (`puzzle_id`, `nickname`, `elapsed_seconds`)

### 랭킹 표시
- 각 퍼즐 페이지 하단에 `<div class="lb-section">` 추가
- `renderLeaderboard(PUZZLE_ID, 'leaderboard')` 호출로 렌더링
- 기본 10개 표시, 더 보기 버튼으로 전체 열람
- 내 닉네임 행은 강조 표시

### 메인 페이지 완료 표시
- `loadCompletions()` → `getMyCompletedPuzzles()` 로 완료한 퍼즐 조회
- 완료한 퍼즐 항목에 ✓ 체크마크 표시

## 퍼즐 추가 체크리스트
1. `{YYMMDD}_{번호}/` 폴더 생성 (네이밍 컨벤션 준수)
2. 해당 폴더에 `index.html` 작성 (DESIGN.md 준수)
3. `<head>`에 `css/common.css`, `js/common.js` 로드
4. `<body>` 첫 줄에 `<header class="site-header">` 헤더 추가
5. `localStorage` 저장/복원 로직 포함 (키: `puzzle_{폴더명}`)
6. OG 메타 태그 포함 (`og:title`, `og:description`, `og:type`, `og:url`)
7. `const PUZZLE_ID = '{폴더명}'` 선언
8. `initHeader(); timerStart(PUZZLE_ID); renderLeaderboard(PUZZLE_ID, 'leaderboard');` 호출
9. 완성 시 `recordCompletion(PUZZLE_ID)` 호출
10. 초기화 시 `timerReset(PUZZLE_ID); timerStart(PUZZLE_ID);` 호출
11. `puzzle/index.html`의 `.list` 안에 `data-puzzle-id` 속성과 함께 항목 추가 (최신 퍼즐이 위로)
