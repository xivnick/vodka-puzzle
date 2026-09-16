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
- `src/layouts/PageLayout.astro`: 홈·문제·닉네임·아카이브 목록의 본문 너비, 제목·부제, 모바일 여백. 페이지별 CSS에서 body/h1/헤더 레이아웃을 덮어쓰지 않는다.
- `src/layouts/PuzzleLayout.astro`: 신규 퍼즐의 규칙·저장 버튼·리더보드
- `src/data/season.json`: 현재 학기
- `src/data/puzzles.json`: 현재 사이트 문제 목록. `id`, `title`, `type`, `season`, `publishedAt`(시간대 포함 ISO 날짜), `href`를 입력한다.
- `src/pages/`: 현재 사이트 페이지. 새 문제는 이곳에서 `PuzzleLayout`을 사용한다.
- `src/legacy/`: 기존 연습·제작 도구의 HTML/스타일 호환 조각. 헤더는 포함하지 않는다.
- `public/js/common.js`: 현재 학기의 저장·순위 기능
- `public/archive/2026-1/`: DB와 독립된 지난 학기 사이트와 공개 완료 기록

신규 퍼즐은 `PuzzleLayout`에 `title`, `puzzleId`, `description`을 넘기고 `rules` 슬롯에 규칙을 넣는다. 기존 퍼즐처럼 `handleCloudSave`, `handleCloudLoad`를 구현하고 완료 시 `recordCompletion(puzzleId)`를 호출한다. 브라우저 저장은 `saveLocalState`/`loadLocalState`를 사용한다. 공통 스타일·스크립트 변경 시 SiteLayout의 버전 번호를 갱신한다.

루트의 기존 HTML/JS는 복원과 아카이브 재생성을 위한 원본이며 현재 Astro 빌드에는 포함되지 않는다. 기존 문제 주소는 아카이브로 연결된다. 아카이브를 새 공통 파일과 연결하지 않는다.

## 데이터와 전환 상태

`semester_nicknames`, `semester_completions`, `semester_progress`는 Google OAuth 계정의 `user_id`로 소유자를 식별한다. 학기별 닉네임은 중복할 수 없고 한 계정당 하나이다. 닉네임 변경은 외래키의 ON UPDATE CASCADE로 완료·진행 기록에 반영된다. 브라우저 저장 키도 계정 ID를 사용한다.

구글 로그인 없이 퍼즐을 풀 수 있지만 DB 기록은 저장할 수 없다. 현재 학기의 본인 기록에만 쓰기를 허용하며, 진행 상태는 본인만 조회한다. 공개 순위·닉네임은 누구나 조회할 수 있다. 기존 1학기 자료는 삭제하지 않으며 아카이브는 별도의 정적 기록 파일을 사용한다.

### Google OAuth

- `src/scripts/auth.js`: Supabase SDK, PKCE 코드 교환, 세션 복원·갱신, 닉네임 설정, 로그아웃
- `src/pages/auth/callback/`: 로그인 후 복귀 경로
- `src/pages/nickname/`: 구글 로그인과 계정에 연결된 닉네임 관리
- Google 승인된 원본: `https://xivnick.me`
- Google 승인된 리디렉션: `https://hlhrzbylbwebtoytmmpd.supabase.co/auth/v1/callback`
- Supabase 허용 복귀 주소: `https://xivnick.me/puzzle/auth/callback/`
- Client Secret은 Supabase 설정에만 보관한다. 이메일 로그인은 비활성화했다.

신규 퍼즐은 초기 상태 복원을 `window.puzzleAuthReady.then(init)`처럼 인증 초기화 이후에 실행한다. 오프라인/비로그인 상태에서도 초기화는 완료된다. 완료·클라우드 저장 함수는 내부에서 인증 초기화를 기다린다.

`npm test`는 OAuth 성공·취소·만료, 복귀 주소 검증, 계정별 저장 분리 등을 검사한다. `python3 scripts/verify-account-policies.py`는 실제 DB에서 두 가상 계정으로 권한과 닉네임 변경을 검증하고 전체 트랜잭션을 롤백한다. 실제 Google 동의 화면을 통과하는 로그인은 사용자 계정으로 최종 확인한다.

2026-09-16 정식 전환을 완료했다. 원래 테이블은 기록을 고정했으며, 진행 상태 테이블의 익명 접근도 차단했다. 최종 아카이브는 완료 기록 976개를 포함하며, 새 사이트는 `2026-2` 학기를 사용한다. `deploy dist www/puzzle`로 배포했으며 원격 전용 파일은 삭제하지 않았다.

전환 전 비공개 백업은 `~/Documents/Backups/vodka-puzzle/20260916-160431/`에 있으며 당시 운영 파일도 `production-site/`에 보존했다. 전환 후 최종 DB 스냅샷은 `20260916-160502/`에 보관했다.

### 전환 절차 (이번 전환 완료; 재실행하지 않음)

1. `python3 scripts/backup.py`로 전환 전 비공개 백업을 만든다. 출력 경로를 보관한다.
2. `python3 scripts/database.py supabase/cutover.sql`로 마지막 기록을 학기 테이블에 동기화하고 기존 테이블의 쓰기 정책을 닫는다.
3. 다시 `python3 scripts/backup.py`를 실행하고, 출력된 **새 백업 경로**로 `python3 scripts/create-archive.py /절대/백업/경로`를 실행한다. 이 시점의 완료 기록이 최종 아카이브가 된다.
4. `npm run build`와 `npm test`를 실행한다.
5. 기존 배포 도구로 `dist/`만 기존 `/puzzle/` 원격 경로에 배포한다. 원격 경로는 기존 배포 설정에서 확인하며, 원격 전용 파일은 삭제하지 않는다.
6. 현재 사이트, 닉네임 등록, 아카이브, 기존 문제 주소를 확인한다.

관리 API 토큰은 `~/.supabase/access-token`에서만 읽는다. 백업은 `~/Documents/Backups/vodka-puzzle/`에 저장되며 웹 출력물과 Git에 들어가지 않는다. 백업에는 테이블 데이터와 열·제약·인덱스·정책 정보가 포함된다. 전체 Supabase 프로젝트/스토리지 백업 도구는 아니다.

전환 실패 시 기존 정적 파일을 유지하거나 원본 백업을 복원하고, 전환 전 백업의 쓰기 정책을 복원한다. 데이터 삭제는 하지 않는다. 다음 학기는 `season.json`과 DB `semester_settings.active_season`을 함께 변경한다.
