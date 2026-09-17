# 보드카 퍼즐

Astro 정적 사이트와 Supabase로 운영하는 퍼즐 사이트다. 운영 주소는 **https://puzzle.xivnick.me/**이며 현재 학기는 `2026-2`다. 별도 Node 백엔드나 SQLite를 사용하지 않는다. 작업 규칙과 디자인 기준은 [AGENTS.md](AGENTS.md)를 따른다.

## 실행과 배포

로컬 프로젝트는 `~/Documents/Development/vodka-puzzle/`에 있다. Node.js 22.12 이상과 npm을 사용한다. 배포에는 Python 3, SSH, rsync가 필요하다.

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

로컬에서 빌드·테스트한 후 `scripts/deploy-site.py`가 **빌드 결과만** `xivnick@xivnick.me:~/vodka-puzzle/releases/<id>/`에 업로드하고 `~/vodka-puzzle/dist` 링크를 원자적으로 전환한다. 소스·node_modules·비밀 설정은 업로드하지 않는다. 이전 릴리스는 자동 삭제하지 않는다.

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
- `ThermoSudoku.astro`: 온도계 스도쿠 화면. 정식 문제는 `260917_01`·`260917_02`·`260917_03`이며 테스트 경로는 기록·저장 없이 시연한다.
- `public/js/common.js`: 일반 문제의 로컬 저장·클라우드 저장·완료 기록·순위

신규 문제는 `src/pages/<YYMMDD_번호>/index.astro`에서 `PuzzleLayout`을 사용한다. `title`, `puzzleId`, `description`과 필요한 `subtitle`을 전달하고 `rules`, `controls` 슬롯에 안내를 넣는다. 판 구성·조작·일반 정답 검증은 문제별 코드에 둔다.

새 문제는 **별도 테스트 URL에서 시연 → 사용자 피드백에 따른 수정 → 명시적인 공개 승인 → 정식 문제 경로와 목록에 반영** 순서로 진행한다. 승인 전에는 공개 목록에 등록하지 않으며 실제 완료 기록·클라우드 진행 저장을 연결하지 않는다. 테스트 URL 자체는 인증된 비공개 경로가 아니다.

승인된 문제의 목록은 `src/data/puzzles.json`에 등록한다. 필드는 `id`, `title`, `type`, `season`, `publishedAt`(시간대 포함 ISO 날짜), `href`다. 링크는 `/<id>/` 형식이다. `listed: false`는 목록에서만 숨기며 접근 권한을 제한하지 않는다. 공개일 필터는 빌드 시 적용되므로 일반 문제의 목록 공개에는 재빌드·배포가 필요하다.

일반 문제는 `handleCloudSave`, `handleCloudLoad`를 구현하고 완료 시 `recordCompletion(puzzleId)`를 호출한다. 초기화는 `window.puzzleAuthReady.then(init)` 이후에 수행하고 로컬 저장은 `saveLocalState`·`loadLocalState`를 사용한다. 연습 페이지는 완료 순위에 포함하지 않는다. 공통 CSS/JS 변경 시 `SiteLayout.astro`의 해당 파일 버전 번호를 갱신한다.

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

미래 문제·정답·완료 원본은 DB의 `private` 스키마에 보관한다. 서버 RPC로 문제 조회·정답 제출·진행 저장을 처리한다. 공개 여부는 DB 서버 시각으로 판단하므로 매일 빌드나 cron이 필요 없다. 브라우저는 조작과 표시를 담당하고 완료 시 자동으로 정답을 제출한다. 최초 성공의 순번·시각은 서버가 기록하며 중복 요청으로 변경되지 않는다. 순위는 소요 시간이 아닌 검증된 제출 순서다.

주요 코드는 `src/lib/sudoku.js`, `src/lib/daily-sudoku-client.js`, `src/scripts/daily-sudoku.js`, `src/scripts/daily-home.js`다. 당일 캐시는 날짜와 고정 숫자만 저장하고 서버에서 재확인한다. 계정별 진행 저장과 캐시는 분리되며 정답·순위는 캐시에 넣지 않는다.

초기 문제 묶음은 **2026-09-16~2026-10-15**다. 다음 묶음은 만료 전에 생성·등록한다.

```sh
npm run daily:generate -- --start 2026-10-16 --count 30
# 생성 명령이 출력한 실제 절대 SQL 경로를 사용한다.
python3 scripts/database.py /비공개/경로/daily-sudoku-2026-10-16.sql
```

생성은 DB 등록과 별개다. `--output /비공개/절대경로.sql`로 저장 위치를 지정할 수 있다. 정답이 포함된 SQL/JSON을 `public/`, `dist/`, Git이나 공개 서버 경로에 넣지 않는다. 기존 날짜는 ON CONFLICT DO NOTHING으로 보존한다. 문제 묶음이 소진되면 문제 없음 화면이 표시된다.

## 검증과 운영 주의

문제 정답의 유일성 검증은 사용자가 명시적으로 요청한 경우에만 수행한다. 플레이어 입력의 규칙 준수·완료 판정과 화면·조작 검증은 계속 수행한다.

- `npm run build` 후 `npm test`: 생성 페이지·링크·OAuth 복귀·저장 분리·정답 판정·캐시·삭제 권한 검증
- `python3 scripts/verify-account-policies.py`: 실제 DB의 계정별 권한·닉네임 변경을 확인하고 트랜잭션 롤백
- `python3 scripts/verify-daily-sudoku.py`: 실제 데일리 RPC·권한·중복 제출·계정 삭제 연계를 확인하고 트랜잭션 롤백
- 실제 Google 로그인은 사용자 계정으로 확인한다.

관리 API 토큰은 `~/.supabase/access-token`에서 읽고 출력·배포하지 않는다. 로컬 비공개 백업은 `~/Documents/Backups/vodka-puzzle/`에 둔다.

`2026-1`에서 `2026-2`로의 전환과 기존 테이블 잠금은 2026-09-16에 완료했다. 최종 공개 아카이브에는 완료 기록 976개가 있다. `supabase/cutover.sql`과 적용 완료 마이그레이션을 일반 배포 시 재실행하지 않는다. 다음 학기에는 `src/data/season.json`과 DB `semester_settings.active_season`을 함께 변경한다.

`scripts/backup.py`는 이전 `nicknames`·`completions`·`progress` 데이터와 공개 스키마 메타 정보, 커밋된 HEAD 소스를 저장하는 기존 전환용 도구다. 현재 학기·데일리·Auth·Storage 전체 백업이 아니며 미커밋 변경도 포함하지 않는다. `scripts/create-archive.py`는 해당 전환 백업으로 아카이브를 재생성하는 도구이며 이전·현재 원본 폴더 구조를 모두 인식한다. 일반 작업 중 재생성하지 않는다.

보관된 전환 백업은 `20260916-160431/`과 `20260916-160502/`다. 기존 원격 폴더 정리 전 백업은 서버의 `~/vodka-puzzle/backups/legacy-puzzle-before-cleanup-20260917.tar.gz`에 있다. 교체 전 루트 문서도 로컬 비공개 백업에 보관했다. 공개 아카이브 내 이미지의 출처·라이선스 README는 유지한다.
