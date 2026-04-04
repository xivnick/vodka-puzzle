# 정적 Nginx 환경 기준 리팩터링 계획

이 프로젝트는 Nginx로 정적 파일을 그대로 서빙하는 구조다.
따라서 서버 템플릿, 빌드 도입, SPA 라우팅 전환 같은 접근은 1차 리팩터링 대상이 아니다.

이번 계획의 목표는 두 가지다.

1. 지금 동작하는 퍼즐 페이지를 고장내지 않는다.
2. 반복되는 HTML/CSS/JS를 얇게 줄여서 이후 수정 누락을 줄인다.

## 현재 구조 요약

- 각 퍼즐은 날짜별 폴더의 단일 `index.html`로 존재한다.
- 공통 기능은 `js/common.js`, `css/common.css`에 일부만 모여 있다.
- 퍼즐별 `index.html` 안에는 다음이 반복된다.
  - 헤더 아래 제목/부제
  - 규칙 토글과 규칙 박스
  - 하단 버튼
  - 클라우드 버튼
  - 메시지 영역
  - 리더보드 영역
  - localStorage 저장/복원
  - 클라우드 저장/불러오기 핸들러
  - 초기화 확인
  - 흑백 퍼즐의 BFS/연결성 검사 유틸

## 이번에 바로 해도 안전한 것

### 1. 공통 CSS 확장

`css/common.css`로 옮겨도 동작 리스크가 낮은 스타일:

- `.subtitle`
- `.container`
- `.rules-toggle`
- `.rules-box`
- `.bottom-buttons`
- `.bottom-buttons button`
- `.bottom-buttons button.danger`
- `.message`

주의:

- 퍼즐별 보드 크기, 셀 크기, 숫자패드 레이아웃은 페이지별 차이가 있으므로 1차에서는 공통화하지 않는다.
- 기존 페이지의 개별 스타일을 한 번에 지우지 말고, 공통 스타일 추가 후 시범 페이지 몇 개만 제거한다.

### 2. 공통 JS helper 추가

`js/common.js`에 추가해도 안전한 함수:

- `toggleRules(id = 'rulesBox')`
- `saveLocalState(key, state)`
- `loadLocalState(key, fallback)`
- `confirmPuzzleReset(puzzleId, resetFn, message)`
- `wireCloudHandlers({ puzzleId, getState, setState, afterLoad })`

주의:

- 각 퍼즐의 검증 로직은 건드리지 않는다.
- `handleCloudSave`, `handleCloudLoad`, `resetBoard`를 한 번에 전면 교체하지 않는다.
- 시범 적용 페이지에서만 helper 호출로 바꾼 뒤 동작 확인 후 확대한다.

### 3. 흑백 퍼즐 공통 유틸 추가

다음 유틸은 별도 파일 또는 `common.js` 하단으로 이동 후보:

- `bfsGrid(startR, startC, passable, rows, cols)`
- `hasFilled2x2(board)`
- `getOrthogonallyConnected(board, start)`

주의:

- 퍼즐마다 "검은 칸", "칠해진 칸", "흰 영역" 의미가 조금씩 다르므로, 규칙 판정 자체를 공통화하지 않는다.
- 공통화 범위는 탐색 유틸까지만 제한한다.

## 지금은 보류할 것

- 퍼즐 페이지를 하나의 범용 엔진으로 합치기
- 메인 `index.html`을 런타임 데이터 기반으로 재구성하기
- 번들러, 프레임워크, 모듈 빌드 도입
- 퍼즐별 HTML 구조를 크게 바꾸는 작업
- 이미 수정 중인 페이지 파일을 광범위하게 일괄 변경하는 작업

## 권장 실행 순서

### 1단계

- `css/common.css`에 공통 UI 스타일 추가
- `js/common.js`에 helper 추가
- 실제 퍼즐 페이지는 아직 거의 건드리지 않음

목표:

- 공통 자산만 확장하고 기존 동작에 영향이 없게 만든다.

### 2단계

- 수정 중이 아닌 비교적 최근 퍼즐 2~3개만 시범 적용
- `rulesBox` 토글, reset confirm, cloud save/load를 helper 기반으로 교체

추천 후보:

- `260330_02`
- `260331_03`
- `260401_01`

이유:

- 패턴이 비교적 명확하고, 최근 퍼즐이라 이후 확장 기준으로 쓰기 좋다.

### 3단계

- 흑백 퍼즐 계열에 BFS helper 적용
- 스도쿠 계열은 저장/리셋/메시지 처리만 먼저 통일

### 4단계

- 기준 템플릿 파일 정리
- 새 퍼즐 추가 시 복사할 베이스 페이지를 명확히 하나로 고정

## 파일별 권장 역할

### `css/common.css`

- 헤더
- 토스트
- 리더보드
- 공통 퍼즐 UI 레이아웃
- 규칙 박스
- 공통 하단 버튼
- 공통 메시지

### `js/common.js`

- 닉네임
- Supabase 통신
- 완료 기록
- 클라우드 저장
- 리더보드
- 퍼즐 공통 helper

### 각 퍼즐 `index.html`

- 퍼즐 데이터
- 퍼즐별 상태 모델
- 퍼즐별 렌더링
- 퍼즐별 검증 로직
- 공통 helper 호출

## 변경 시 체크리스트

공통 JS/CSS 수정 시:

- `CLAUDE.md`에 적힌 `?v=N` 캐시 버스팅 규칙 반영
- 시범 적용 페이지 2~3개에서만 먼저 확인
- 메인 페이지, 닉네임 페이지, 퍼즐 1개 이상에서 회귀 확인

퍼즐 페이지 수정 시:

- `initHeader()`
- `initCloudBtns()`
- `renderLeaderboard(PUZZLE_ID, 'leaderboard')`
- localStorage 저장/복원
- 초기화 후 `resetCompletion(PUZZLE_ID)`
- 클라우드 불러오기 후 렌더/완료 판정

## 이번 작업 범위

이번 정리는 실제 페이지 로직을 건드리지 않고 계획을 문서화하는 데서 멈춘다.

이유:

- 현재 워크트리에 수정 중인 퍼즐 파일이 이미 존재한다.
- 공통화 작업을 성급히 진행하면 기존 사용자 변경과 충돌할 수 있다.
- 먼저 기준 문서를 두고, 수정 중이 아닌 페이지부터 좁게 옮기는 편이 안전하다.
