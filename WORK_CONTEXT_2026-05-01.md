# 작업 복구 컨텍스트 (2026-05-01)

이 문서는 퍼즐 레포의 현재 작업 상태를 끊었다가 다시 이어 붙이기 위한 복구용 메모다.

## 현재 작업 디렉터리
- `/Users/XIV/Documents/Development/-sftp/www/puzzle`

## 최근 작업 핵심

### 1. `260430_01` 스타배틀
- 새 퍼즐 페이지 추가됨: [`260430_01/index.html`](/Users/XIV/Documents/Development/-sftp/www/puzzle/260430_01/index.html)
- 루트 목록에 추가됨: [`index.html`](/Users/XIV/Documents/Development/-sftp/www/puzzle/index.html)
- 현재 입력 방식:
  - 기본 모드: `클릭: 별 / 우클릭(모바일은 길게 누르기): x`
  - 토글 버튼으로 반전 가능
  - 반전 모드: `클릭: x / 우클릭(모바일은 길게 누르기): 별`
- 보드 표시는 현재 다음 기준:
  - 별: SVG 렌더
  - x: 선 2개 렌더
  - 입력 모드 버튼 안 아이콘도 별/x 렌더로 표시
- 별 오류 판정:
  - 별끼리 8방향 인접
  - 같은 행/열/영역에 별이 2개 초과
  - 오류인 별 칸만 빨강
- 현재 상태:
  - 최근 조정분은 마무리된 상태로 간주
  - 복구 후 이 파일부터 재검증할 필요는 없음

### 2. `260317_01`, `260317_02`, `260317_03` 노리노리 상/중/하
- 세 파일 모두 우클릭/길게누르기 `x` 추가 완료
  - [`260317_01/index.html`](/Users/XIV/Documents/Development/-sftp/www/puzzle/260317_01/index.html)
  - [`260317_02/index.html`](/Users/XIV/Documents/Development/-sftp/www/puzzle/260317_02/index.html)
  - [`260317_03/index.html`](/Users/XIV/Documents/Development/-sftp/www/puzzle/260317_03/index.html)
- 현재 동작:
  - 일반 클릭: 기존 도미노 배치
  - 우클릭/길게누르기: 해당 칸 `x` 토글
  - `x`가 있는 칸에 도미노를 놓으면 그 `x`는 제거
  - 그 칸에 도미노가 있으면 `x` 토글 시 도미노를 먼저 제거
- 저장 포맷 확장됨:
  - 예전: `dominoes` 배열만 저장
  - 현재: `{ dominoes, xMarks }`
  - 하위 호환 처리 포함
- 세 파일 모두 스크립트 문법 확인 완료
- 현재 상태:
  - 최근 조정분은 마무리된 상태로 간주
  - 복구 후 이 세 파일도 우선 재확인 대상에서 제외

### 3. 루트 페이지
- [`index.html`](/Users/XIV/Documents/Development/-sftp/www/puzzle/index.html)
- 퍼즐 목록은 이미 JS 기반 페이징(`10개씩`)이 들어가 있음
- 사용자는 루트 목록을 아예 JS 데이터 구조로 관리하는 방향에 관심을 보였지만 아직 구조 변경은 하지 않음

## Git 상태 메모
- 현재 `git status --short` 기준 수정/미추적 파일이 남아 있음
- 당시 상태:
  - 수정됨: `260317_01/index.html`, `260317_02/index.html`, `260317_03/index.html`, `CLAUDE.md`, `index.html`
  - 미추적: `260425_01/`, `260425_02/`, `260427_01/`, `260427_02/`, `260428_01/`, `260428_02/`, `260428_03/`, `260429_01/`, `260429_02/`, `260430_01/`
- 이 목록은 복구 시점에 다시 `git status --short`로 재확인 필요

## 주의할 점
- 수동 코드 수정은 `apply_patch`로 할 것
- `CLAUDE.md`는 운영 규칙 문서이며, 휘발성 작업 맥락은 이 파일에 계속 누적하지 않는 편이 좋음
- 공통 자산 `css/common.css`, `js/common.js`를 바꾸는 경우 캐시 버전 규칙을 따라야 함
- 노리노리/스타배틀 모두 길게누르기 뒤에 클릭이 중복 발동하지 않도록 `suppressNextClick` 류 처리가 들어가 있음

## 바로 이어서 점검할 후보
1. 루트 목록 구조 개선
   - HTML 하드코딩 목록을 JS 데이터 배열 렌더 방식으로 전환할지 판단
2. 변경분 커밋/푸시 여부 확인

## 복구용 프롬프트
아래 프롬프트를 그대로 붙여 넣으면 된다.

```text
/Users/XIV/Documents/Development/-sftp/www/puzzle/WORK_CONTEXT_2026-05-01.md 를 먼저 읽고 현재 작업 상태를 복구해.
그 다음 git status를 확인해서 문서와 실제 변경점을 대조하고,
1) 260430_01 스타배틀의 현재 상태를 요약하고
2) 260317_01, 260317_02, 260317_03 노리노리의 우클릭/길게누르기 x 지원 상태를 점검한 뒤
3) 내가 바로 이어서 지시할 수 있게 남은 리스크/확인 포인트만 짧게 정리해.
코드 수정이 필요하면 apply_patch만 사용해.
```
