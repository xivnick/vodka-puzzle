# 보드카 퍼즐

Astro 정적 사이트와 Supabase로 운영하는 퍼즐 사이트다. 운영 주소는 **https://puzzle.xivnick.me/**이며 현재 학기는 `2026-2`다. 별도 Node 백엔드나 SQLite를 사용하지 않는다. 작업 규칙과 디자인 기준은 [AGENTS.md](AGENTS.md)를 따른다.

## 실행과 배포

로컬 프로젝트는 `~/Documents/Development/vodka-puzzle/`에 있다. Node.js 22.12 이상과 npm을 사용한다. 배포에는 Python 3, SSH, rsync와 로컬 `~/.supabase/access-token`이 필요하다.

```sh
npm ci
npm run dev
npm run build
npm test
npm run preview
```

`npm test`의 페이지 검증은 `dist/`를 읽으므로 변경 후 먼저 빌드한다. 배포는 다음 명령을 사용한다.

```sh
npm run deploy
```

로컬에서 빌드·테스트한 후 승인된 문제 목록을 `scripts/sync-puzzle-catalog.py`로 DB에 동기화하고 `scripts/deploy-site.py`가 **빌드 결과만** `xivnick@xivnick.me:~/vodka-puzzle/releases/<id>/`에 업로드하고 `~/vodka-puzzle/dist` 링크를 원자적으로 전환한다. 소스·node_modules·비밀 설정은 업로드하지 않는다. 이전 릴리스는 자동 삭제하지 않는다.

서버 nginx는 `/home/xivnick/vodka-puzzle/dist`만 공개한다. 설정 원본은 `ops/puzzle.nginx.conf`다. DNS·HTTPS·실제 Google 로그인은 2026-09-17에 확인했다. nginx 설정을 변경할 때만 서버에서 다음 명령을 사용한다.

```sh
sudo install -m 644 ~/vodka-puzzle/ops/puzzle.nginx.conf /etc/nginx/sites-enabled/puzzle.conf
sudo nginx -t && sudo systemctl reload nginx
```

롤백할 때는 서버에서 `dist` 링크를 보관된 이전 릴리스로 전환한다. 다음 예시의 `<id>`를 실제 릴리스 ID로 바꾸고, 해당 릴리스에 `index.html`이 있는지 먼저 확인한다.

```sh
cd ~/vodka-puzzle
ln -s releases/<id> dist-rollback
mv -Tf dist-rollback dist
```

기존 `deploy` 도구는 `~/www` 내부용이므로 현재 사이트의 일반 배포에는 사용하지 않는다. 기존 `https://xivnick.me/puzzle`은 브라우저에서 새 도메인 루트로 이동한다. 로컬 `~/Documents/Development/-sftp/www/puzzle/`과 서버 `~/www/puzzle/`에는 이동용 `index.html` 하나만 있다. 쿼리·해시는 유지하며 JavaScript 비활성 시 이동 링크를 제공한다. 기존 도메인의 개별 문제 하위 경로는 404다. `ops/legacy-puzzle-redirect.nginx.conf`의 nginx 리디렉션 스니펫은 적용하지 않았다.

도메인별 localStorage와 로그인 세션은 자동 이전되지 않는다. 기존 SFTP 자동 업로드 설정은 공개 경로 밖의 로컬 백업으로 옮겼다.

## 디렉터리 역할

| 경로 | 역할 |
|---|---|
| `src/pages/` | 현재 사이트 페이지와 신규 퍼즐 |
| `src/layouts/`, `src/components/` | 공통 화면·헤더·규칙·완료 안내 |
| `src/scripts/`, `src/lib/`, `src/styles/` | 현재 퍼즐 동작·로직·스타일 |
| `src/data/` | 현재 학기·문제 목록·아카이브 문제 ID |
| `src/legacy/` | 현재 연습·제작 도구가 사용하는 호환 조각 |
| `public/` | 빌드에 그대로 포함되는 공개 파일 |
| `public/archive/2026-1/` | 실제 서비스하는 1학기 아카이브와 고정 완료 기록 |
| `legacy/2026-1/` | 보관용 이전 사이트 원본. 빌드·배포에 포함되지 않음 |
| `scripts/`, `supabase/`, `ops/`, `tests/` | 운영 도구·DB·배포 설정·검증 |
| `dist/`, `.astro/`, `node_modules/` | 재생성 가능한 결과물·캐시·의존성 |

`legacy/2026-1/`과 공개 아카이브는 내용과 저장 방식이 다르다. 원본을 아카이브에 덮어쓰거나 아카이브를 현재 DB·공통 코드에 연결하지 않는다. 새 도메인의 날짜별 1학기 주소는 `src/pages/[legacy].astro`가 `/archive/2026-1/<id>/`로 연결한다.

## 화면과 신규 문제

- `Header.astro`: 공통 헤더와 로그인 링크
- `SiteLayout.astro`: 메타·공통 CSS/JS·인증 연결
- `PageLayout.astro`: 제목·부제·본문 너비·모바일 여백
- `PuzzleLayout.astro`: 규칙·조작 방법·클라우드 저장·리더보드
- `PuzzleCompletion.astro`: 공통 완료 안내
- `ThermoSudoku.astro`: 9×9(3×3 영역)·6×6(2×3 영역) 온도계 스도쿠 화면. 정식 문제는 `260917_01`·`260917_02`·`260917_03`·`260918_01`(A, 9×9)·`260918_02`(B, 6×6)이며 테스트 경로는 기록·저장 없이 시연한다.
- `public/js/common.js`: 일반 문제의 로컬 저장·클라우드 저장·완료 기록·순위

신규 문제는 `src/pages/<YYMMDD_번호>/index.astro`에서 `PuzzleLayout`을 사용한다. `title`, `puzzleId`, `description`과 필요한 `subtitle`을 전달하고 `rules`, `controls` 슬롯에 안내를 넣는다. 판 구성·조작·일반 정답 검증은 문제별 코드에 둔다.

새 문제는 **별도 테스트 URL에서 시연 → 사용자 피드백에 따른 수정 → 명시적인 공개 승인 → 정식 문제 경로와 목록에 반영** 순서로 진행한다. 승인 전에는 공개 목록에 등록하지 않으며 실제 완료 기록·클라우드 진행 저장을 연결하지 않는다. 테스트 URL 자체는 인증된 비공개 경로가 아니다. 사진 기반 온도계 두 문제는 `/test/thermo-sudoku/photo-20260918-1/`(9×9)과 `/test/thermo-sudoku/photo-20260918-2/`(6×6)에서 시연하며 기록·진행 저장을 하지 않는다.

승인된 문제의 목록은 `src/data/puzzles.json`에 등록한다. 필드는 `id`, `title`, `type`, `season`, `publishedAt`(시간대 포함 ISO 날짜), `href`다. 링크는 `/<id>/` 형식이다. `listed: false`는 목록에서만 숨기며 접근 권한을 제한하지 않는다. 공개일 필터는 빌드 시 적용되므로 일반 문제의 목록 공개에는 재빌드·배포가 필요하다.

일반 문제는 `handleCloudSave`, `handleCloudLoad`를 구현하고 완료 시 `recordCompletion(puzzleId, state)`를 호출한다. 제출 상태는 문제별 형식을 유지하며 `version: 1`을 포함한다. 초기화는 `window.puzzleAuthReady.then(init)` 이후에 수행하고 로컬 저장은 `saveLocalState`·`loadLocalState`를 사용한다. 연습 페이지는 완료 순위에 포함하지 않는다. 공통 CSS/JS 변경 시 `SiteLayout.astro`의 해당 파일 버전 번호를 갱신한다.

## 로그인과 기록

Supabase Google OAuth 계정의 `user_id`로 소유자를 식별한다. `semester_nicknames`, `semester_completions`, `semester_progress`는 학기별 데이터를 관리한다. 닉네임은 학기 내 중복할 수 없으며 한 계정당 하나다. 닉네임 변경은 외래 키의 ON UPDATE CASCADE로 기록에 반영된다.

비로그인 플레이는 가능하지만 DB 기록 저장은 로그인과 현재 학기 닉네임이 필요하다. 진행 데이터는 본인만 조회하고 현재 학기의 본인 기록만 쓸 수 있다. 닉네임·순위는 공개다. 일반 문제의 로컬 저장 키는 `<학기>:<계정 ID 또는 guest>:<문제 ID>` 형식이다.

- 인증 코드: `src/scripts/auth.js` (PKCE 교환·세션 관리·닉네임·로그아웃)
- Supabase Site URL: `https://puzzle.xivnick.me/`
- 현재 OAuth 복귀 주소: `https://puzzle.xivnick.me/auth/callback/`
- Google OAuth 리디렉션 URI: `https://hlhrzbylbwebtoytmmpd.supabase.co/auth/v1/callback` (기존과 동일)
- Supabase에는 이전 도메인의 복귀 주소도 유지했다. Google Console의 승인된 원본을 새 주소로 추가 변경하지 않고 실제 로그인이 정상 동작함을 확인했다.

Client Secret은 Supabase 설정에만 보관한다. 이메일 로그인은 비활성화했다. `/terms/`, `/privacy/`는 정책 페이지다.

계정 삭제 Edge Function은 요청 토큰을 Auth 서버에서 검증한 계정만 삭제한다. `verify_jwt`는 false이며 함수 내부 검증을 생략하면 안 된다. 관리자 키는 함수 환경에서만 사용한다. CORS는 `https://xivnick.me`와 `https://puzzle.xivnick.me`를 허용한다. 계정 삭제 시 연결된 학기별·데일리 기록도 삭제된다. 정적 아카이브·별도 백업은 자동 수정되지 않으므로 삭제 요청과 백업 복원 시 함께 확인한다.

## 데일리 스도쿠

`/daily-sudoku/`는 한국 시간 자정부터 다음 자정까지 같은 문제를 제공한다. `?day=YYYY-MM-DD`로 특정 회차를 열 수 있고 마감 회차는 연습만 가능하다. 홈 최상단 카드는 일반 목록 페이징과 독립적이며 일반 학기 순위와 데일리 순위는 분리된다.

`private.daily_sudoku`는 미공개 문제 대기열이다. 조회·제출·진행 저장 RPC가 서버 시각으로 공개 시점을 확인하고, 열린 문제를 `public.daily_sudoku`로 원자적으로 옮긴다. 방문이 없는 동안에는 공개 시점이 지난 행도 대기열에 남을 수 있지만 미래 정보는 조회할 수 없다. 공개 문제에는 고정 숫자만 있으며 DB에 정답을 보관하지 않는다. 매일 빌드나 cron은 필요 없다.

일반 퍼즐과 데일리 모두 브라우저에서 규칙 준수·완료를 판단하고 `submit_completion(requested_puzzle, submitted_state, state_version)`으로 보드를 제출한다. 데일리 ID는 `daily-sudoku:YYYY-MM-DD` 형식이다. 서버는 로그인·현재 학기 닉네임·등록된 문제 또는 열린 데일리 회차·JSON 크기·버전을 확인하고 완료 정보와 제출 보드를 한 트랜잭션으로 저장한다. 풀이 규칙은 서버에서 검사하지 않으며 사후 검토한다. 제출 시각과 데일리 순번은 서버가 정하고, 중복 요청은 최초 기록을 반환한다. 데일리 순위는 소요 시간이 아닌 제출 순서다. 이전 클라이언트의 `submit_daily_sudoku`는 답안 문자열을 보드 배열로 바꿔 같은 제출 함수에 전달한다.

전광판은 `recent_completions()` RPC로 현재 학기의 일반 문제·데일리 완료 기록을 합쳐 최신 3건을 표시한다. 데일리 제목에는 회차 날짜를 붙이며 정답·계정 ID는 반환하지 않는다. DB 변경은 `supabase/migrations/20260917_recent_completions.sql`을 한 번 적용한다.

스트릭은 **2026-09-19 회차부터** Google 계정별 완료 날짜로 집계하며 학기가 바뀌어도 이어진다. `daily_sudoku_context`는 서버의 한국 날짜로 계산한 본인 `streak: {count, status}`만 반환한다. `excluded` 기록은 제외하고 시작일 이전 기록은 집계하지 않는다. 완료 날짜 사이의 하루 공백은 허용하지만 쉰 날은 숫자에 더하지 않는다. 어제 완료·오늘 미완료는 윤곽선 불꽃(`pending`), 오늘 완료는 채운 불꽃(`completed`), 어제 쉬고 오늘 미완료는 Zzz(`rest`)로 표시한다. 이틀 연속 미완료 후 자정이 지나면 현재 스트릭이 종료되어 표시하지 않는다(`none`). 휴식 후 다음 날 완료하면 같은 스트릭에 1을 더하고, 종료 후 완료하면 1부터 시작한다. 최초 완료·중복 제출·사후 집계 제외는 기존 완료 행에서 계산하므로 별도 카운터나 cron이 필요 없다.

홈에는 `YYMMDD 오늘의 스도쿠`, 푼 사람 수와 오른쪽 스트릭을 표시하고 데일리의 기존 체크를 스트릭으로 대체한다. 당일 데일리 페이지에는 제목 위 한 줄을 표시하며 과거 연습 페이지에는 표시하지 않는다. 서버 완료 저장 후 조회한 스트릭으로만 갱신하고, 로그아웃·계정 전환 시 이전 표시와 조회 응답을 버린다. 아이콘은 `public/icons/daily-streak/`의 Tabler Icons(MIT)를 사용한다. DB 변경은 `supabase/migrations/20260919_daily_streak.sql`을 한 번 적용한다.

주요 코드는 `src/lib/sudoku.js`, `src/lib/daily-sudoku-client.js`, `src/scripts/daily-sudoku.js`, `src/scripts/daily-home.js`다. 당일 캐시는 날짜와 고정 숫자만 저장하고 서버에서 재확인한다. 계정별 진행 저장과 캐시는 분리되며 정답·순위는 캐시에 넣지 않는다.

초기 문제 묶음은 **2026-09-16~2026-10-15**다. 다음 묶음은 만료 전에 생성·등록한다.

```sh
npm run daily:generate -- --start 2026-10-16 --count 30
# 생성 명령이 출력한 실제 절대 SQL 경로를 사용한다.
python3 scripts/database.py /비공개/경로/daily-sudoku-2026-10-16.sql
```

생성은 DB 등록과 별개다. `--output /비공개/절대경로.sql`로 저장 위치를 지정할 수 있다. 생성 SQL에는 미래 고정 숫자와 생성 메타데이터만 포함하며 정답은 포함하지 않는다. 미래 문제 SQL/JSON을 `public/`, `dist/`, Git이나 공개 서버 경로에 넣지 않는다. 기존 날짜는 ON CONFLICT DO NOTHING으로 보존한다. 문제 묶음이 소진되면 문제 없음 화면이 표시된다.

## 완료 제출과 검토

완료 정보는 기존 `public.semester_completions`와 `public.daily_sudoku_completions`에 보관한다. 두 종류의 최초 완료 보드는 `public.completion_submissions`에 계정·학기·문제 ID·형식 버전·서버 시각과 함께 저장한다. 진행 저장과 독립적인 사본이며 이후 저장하기·초기화·중복 완료로 덮어쓰지 않는다. 일반 사용자는 완료 보드를 읽거나 직접 쓸 수 없다. 개인 진행은 기존처럼 본인만 조회한다. 공개 조회에는 제출 보드가 포함되지 않는다.

기존 완료 기록의 시각·순위는 그대로 보존하고, 이전 기록에는 제출 보드를 소급해 붙이지 않는다. 스키마 변경은 `supabase/migrations/20260917_completion_states.sql`을 한 번 적용한다. 변경 전 데일리 문제·정답·완료·진행과 일반 완료는 로컬 비공개 백업에 보관했다. 이미 생성한 이전 형식의 문제 SQL에는 삭제된 `solution` 열이 있으므로 그대로 실행하지 않고 새 생성 명령으로 준비한다.

```sh
# 읽기 전용 운영자 검토: 닉네임·문제·제출 시각·판정 출력
python3 scripts/review-completions.py
# 새 문제 메타데이터 등록 (일반 배포에서도 실행)
python3 scripts/sync-puzzle-catalog.py
```

검토는 현재 학기의 수집된 보드를 문제별 기존 규칙 코드로 확인한다. 정상 보드는 `valid`, 규칙 위반은 `invalid`, 미지원 버전·문제는 별도 결과로 출력한다. 직접 풀었는지는 판단하지 않는다. 검토 명령은 기록을 자동 변경하지 않는다. 운영자가 규칙 위반을 확인한 경우 해당 완료 행의 `excluded`를 true로 변경하면 전광판·일반 순위·데일리 순위에서 제외한다. 최초 보드와 시각·순번은 남고, 되돌릴 때는 false로 변경한다.

일반 퍼즐은 화면에서 완료를 즉시 표시하고 기록 저장 응답 후 저장 안내를 표시한다. 실패 시 30초 뒤 최초 보드로 재시도하며 계정 전환 후에는 이전 계정의 보드를 제출하지 않는다. 새로고침하면 로컬 보드의 완료 여부로 다시 제출한다. 데일리도 완료 화면을 먼저 표시하고 실패 시 기존 30초 갱신 주기에 재시도한다.

## 검증과 운영 주의

문제 정답의 유일성 검증은 사용자가 명시적으로 요청한 경우에만 수행한다. 플레이어 입력의 규칙 준수·완료 판정과 화면·조작 검증은 계속 수행한다.

- `npm run build` 후 `npm test`: 생성 페이지·링크·OAuth 복귀·저장 분리·정답 판정·캐시·삭제 권한 검증
- `python3 scripts/verify-account-policies.py`: 실제 DB의 계정별 권한·닉네임 변경을 확인하고 트랜잭션 롤백
- `python3 scripts/verify-completion-policies.py` (`verify-daily-sudoku.py`도 같은 검사): 일반·데일리 제출 상태, 중복, 권한, 공개 전환, 집계 제외, 계정 삭제를 확인하고 트랜잭션 롤백
- `python3 scripts/verify-daily-streak.py`: 시작일·하루 휴식·복구·종료·중복·권한·계정 분리 검증 후 롤백 (`--rehearse`는 스트릭 마이그레이션도 함께 롤백)
- 실제 Google 로그인은 사용자 계정으로 확인한다.

관리 API 토큰은 `~/.supabase/access-token`에서 읽고 출력·배포하지 않는다. 로컬 비공개 백업은 `~/Documents/Backups/vodka-puzzle/`에 둔다.

`2026-1`에서 `2026-2`로의 전환과 기존 테이블 잠금은 2026-09-16에 완료했다. 최종 공개 아카이브에는 완료 기록 976개가 있다. `supabase/cutover.sql`과 적용 완료 마이그레이션을 일반 배포 시 재실행하지 않는다. 다음 학기에는 `src/data/season.json`과 DB `semester_settings.active_season`을 함께 변경한다.

`scripts/backup.py`는 이전 `nicknames`·`completions`·`progress` 데이터와 공개 스키마 메타 정보, 커밋된 HEAD 소스를 저장하는 기존 전환용 도구다. 현재 학기·데일리·Auth·Storage 전체 백업이 아니며 미커밋 변경도 포함하지 않는다. `scripts/create-archive.py`는 해당 전환 백업으로 아카이브를 재생성하는 도구이며 이전·현재 원본 폴더 구조를 모두 인식한다. 일반 작업 중 재생성하지 않는다.

보관된 전환 백업은 `20260916-160431/`과 `20260916-160502/`다. 기존 원격 폴더 정리 전 백업은 서버의 `~/vodka-puzzle/backups/legacy-puzzle-before-cleanup-20260917.tar.gz`에 있다. 교체 전 루트 문서도 로컬 비공개 백업에 보관했다. 공개 아카이브 내 이미지의 출처·라이선스 README는 유지한다.
