# 보드카 퍼즐

Astro로 공통 화면을 관리하고 Supabase에 학기별 기록을 저장하는 퍼즐 사이트다. 배포 주소는 `https://xivnick.me/puzzle/`이다.

## 실행

```sh
npm ci
npm run dev
npm run build
npm test
```

Node.js 22.12 이상을 사용한다. 배포 대상은 **`dist/`만**이다. 저장소 전체를 업로드하지 않는다.

## 화면 관리

- `src/components/Header.astro`: 모든 현재 페이지의 헤더와 메뉴
- `src/layouts/SiteLayout.astro`: 메타 정보, 공통 스타일·스크립트
- `src/layouts/PuzzleLayout.astro`: 신규 퍼즐의 규칙·저장 버튼·리더보드
- `src/data/season.json`: 현재 학기
- `src/data/puzzles.json`: 현재 사이트 문제 목록. `id`, `title`, `type`, `season`, `publishedAt`(시간대 포함 ISO 날짜), `href`를 입력한다.
- `src/pages/`: 현재 사이트 페이지. 새 문제는 이곳에서 `PuzzleLayout`을 사용한다.
- `src/legacy/`: 기존 닉네임·연습·제작 도구의 HTML/스타일 호환 조각. 헤더는 포함하지 않는다.
- `public/js/common.js`: 현재 학기의 저장·순위 기능
- `public/archive/2026-1/`: DB와 독립된 지난 학기 사이트와 공개 완료 기록

신규 퍼즐은 `PuzzleLayout`에 `title`, `puzzleId`, `description`을 넘기고 `rules` 슬롯에 규칙을 넣는다. 기존 퍼즐처럼 `handleCloudSave`, `handleCloudLoad`를 구현하고 완료 시 `recordCompletion(puzzleId)`를 호출한다. 브라우저 저장은 `saveLocalState`/`loadLocalState`를 사용한다. 공통 스타일·스크립트 변경 시 SiteLayout의 버전 번호를 갱신한다.

루트의 기존 HTML/JS는 복원과 아카이브 재생성을 위한 원본이며 현재 Astro 빌드에는 포함되지 않는다. 기존 문제 주소는 아카이브로 연결된다. 아카이브를 새 공통 파일과 연결하지 않는다.

## 데이터와 전환 상태

`semester_nicknames`, `semester_completions`, `semester_progress`를 추가했다. 키는 학기·닉네임(및 문제)이다. 기존 테이블을 변경하지 않고 2026-1 기록을 복사했으며, `semester_settings.active_season`에 해당하는 학기만 익명 쓰기를 허용한다. 닉네임 기반 식별 방식은 기존과 같다.

기존 운영 사이트를 보호하기 위해 원래 `nicknames`, `completions`, `progress`의 저장 정책은 아직 유지한다. **정식 전환 시 마지막 기록 동기화와 잠금이 필요하다.** 현재 아카이브는 작업 시점의 스냅샷이다.

### 정식 배포 순서

1. `python3 scripts/backup.py`로 전환 전 비공개 백업을 만든다. 출력 경로를 보관한다.
2. `python3 scripts/database.py supabase/cutover.sql`로 마지막 기록을 학기 테이블에 동기화하고 기존 테이블의 쓰기 정책을 닫는다.
3. 다시 `python3 scripts/backup.py`를 실행하고, 출력된 **새 백업 경로**로 `python3 scripts/create-archive.py /절대/백업/경로`를 실행한다. 이 시점의 완료 기록이 최종 아카이브가 된다.
4. `npm run build`와 `npm test`를 실행한다.
5. 기존 배포 도구로 `dist/`만 기존 `/puzzle/` 원격 경로에 배포한다. 원격 경로는 기존 배포 설정에서 확인하며, 원격 전용 파일은 삭제하지 않는다.
6. 현재 사이트, 닉네임 등록, 아카이브, 기존 문제 주소를 확인한다.

관리 API 토큰은 `~/.supabase/access-token`에서만 읽는다. 백업은 `~/Documents/Backups/vodka-puzzle/`에 저장되며 웹 출력물과 Git에 들어가지 않는다. 백업에는 테이블 데이터와 열·제약·인덱스·정책 정보가 포함된다. 전체 Supabase 프로젝트/스토리지 백업 도구는 아니다.

전환 실패 시 기존 정적 파일을 유지하거나 원본 백업을 복원하고, 전환 전 백업의 쓰기 정책을 복원한다. 데이터 삭제는 하지 않는다. 다음 학기는 `season.json`과 DB `semester_settings.active_season`을 함께 변경한다.
