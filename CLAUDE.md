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
- 모든 퍼즐 페이지 상단 왼쪽에 `< puzzles` 텍스트 링크를 배치한다.
- 링크 대상: `/puzzle/` (목록 페이지)
- 스타일: `.back` 클래스, 회색(`#999`), 호버 시 진해짐(`#555`), 밑줄 없음

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

## 퍼즐 추가 체크리스트
1. `{YYMMDD}_{번호}/` 폴더 생성 (네이밍 컨벤션 준수)
2. 해당 폴더에 `index.html` 작성 (DESIGN.md 준수)
3. 상단에 `< puzzles` 뒤로가기 링크 포함
4. `localStorage` 저장/복원 로직 포함 (키: `puzzle_{폴더명}`)
5. OG 메타 태그 포함 (`og:title`, `og:description`, `og:type`, `og:url`)
6. `puzzle/index.html`의 `.list` 안에 항목 추가 (최신 퍼즐이 위로)
