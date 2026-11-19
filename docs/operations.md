# 운영 참고

## 배포와 롤백

배포에는 Python 3, SSH, rsync와 로컬 `~/.supabase/access-token`이 필요하다. `npm run deploy`는 로컬에서 빌드한 결과만 `xivnick@xivnick.me:~/vodka-puzzle/releases/<id>/`에 올리고, 서버의 `~/vodka-puzzle/dist` 심볼릭 링크를 새 릴리스로 전환한다. 소스·의존성·비밀 설정은 업로드하지 않으며 이전 릴리스는 자동 삭제하지 않는다. 페이지 전환 후 `scripts/sync-puzzle-catalog.py`가 새 문제만 DB에 테스트 상태로 등록하며, 기존 메타데이터와 공개 일정은 덮어쓰지 않는다.

서버 nginx는 `/home/xivnick/vodka-puzzle/dist`를 서빙한다. 설정을 변경할 때만 다음 명령을 사용한다.

```sh
sudo install -m 644 ~/vodka-puzzle/ops/puzzle.nginx.conf /etc/nginx/sites-enabled/puzzle.conf
sudo nginx -t && sudo systemctl reload nginx
```

롤백할 때는 보관된 릴리스에 `index.html`이 있는지 확인하고 `<id>`를 실제 릴리스 ID로 바꾼다.

```sh
cd ~/vodka-puzzle
ln -s releases/<id> dist-rollback
mv -Tf dist-rollback dist
```

기존 `deploy` 도구는 이 사이트의 일반 배포에 사용하지 않는다. 서버 파일 삭제와 릴리스 정리는 요청된 범위에서만 수행한다.

## 데일리 문제 등록

새 문제 묶음은 현재 등록된 날짜가 끝나기 전에 생성한다. 생성 SQL에는 미래 고정 숫자가 들어가므로 비공개 경로에 두고, `public/`, `dist/` 또는 Git에 넣지 않는다. 생성과 DB 등록은 별개다. 등록할 때는 생성 명령이 출력한 실제 SQL 경로를 사용한다.

```sh
npm run daily:generate -- --start YYYY-MM-DD --count 30
python3 scripts/database.py /비공개/경로/daily-sudoku-YYYY-MM-DD.sql
```

이미 적용한 `supabase/cutover.sql`이나 과거 마이그레이션은 일반 배포에서 재실행하지 않는다.

## 푸시 알림 자동 발송

`20261119_zz_notification_dispatch.sql`을 적용한 뒤 `python3 scripts/deploy-notification-dispatch.py`를 실행한다. 이 스크립트는 전용 인증 값을 Vault와 Edge Function에 설정하고, Supabase Cron의 `vodka-puzzle-notifications` 작업을 등록한다.

정식 공개 트랜잭션이 커밋되면 새 문제 알림 발송을 시작한다. 미래 공개는 공개 시간까지 기다린다. Cron은 한국 시간 자정과 밤 11시에 데일리 알림을 등록하고 대기 중인 발송을 확인한다. 밤 11시 알림은 오늘 문제를 완료한 계정을 제외한다. 기기별 알림 설정은 발송 직전에 다시 확인한다.

`private.puzzle_notification_jobs`와 `private.puzzle_notification_deliveries`에서 대기 건과 결과를 확인할 수 있다. 푸시 서비스가 명시적으로 재시도 가능한 오류를 반환하면 최대 세 번 시도한다. 발송 요청의 처리 결과가 불명확한 경우에는 중복 알림을 피하기 위해 `uncertain`으로 기록한다.

## 완료 기록과 DB 검증

### 느린 요청과 실패 진단

공통 요청 래퍼는 Supabase 요청 중 2초 이상 지연된 요청과 실패만 `client-events` Edge Function으로 보낸다. SDK 요청(인증 포함)과 공통 REST 요청을 함께 기록한다. 전송 항목은 API 경로, 시각, 소요 시간, HTTP 상태, 오류 코드, Supabase 요청 ID, 호출 계기, 요청 시작 시 동시 요청 수, 화면 종류와 임시 페이지 ID다. 쿼리 문자열·요청/응답 본문·오류 메시지·토큰·이메일·사용자 ID·답안은 전송하지 않는다. 임시 페이지 ID는 새 페이지마다 바뀐다. 전송 대기 이벤트에만 보관하며 다음 페이지의 ID로 재사용하지 않는다.

같은 종류의 오류는 30초 동안 중복 전송하지 않고, 페이지당 새 이벤트 최대 40건을 10건 이하로 묶어 보낸다. 수집기는 출처·크기·항목을 다시 검증하고 허용하지 않은 필드를 버린다. 수집기 제한은 인스턴스별 임시 제한이며 전역 공격 방어를 보장하지 않는다. 게임 요청 결과는 로그 전송 결과와 관계없다.

진단 v3는 전송 전에 허용된 메타데이터를 localStorage의 `vodka_request_event_v3:` 키에 저장한다. 2xx 수신 확인 후에만 해당 이벤트를 삭제한다. 네트워크 오류·HTTP 오류·10초 전송 제한을 넘긴 요청은 보관하고 15초부터 최대 5분 간격으로 재전송한다. 연속 실패는 페이지당 최대 8회 시도하며, 온라인 복귀 또는 다음 페이지 진입 때 다시 시도한다. 대기열은 페이지에서 최대 80건이다. 24시간 지난 이벤트는 다음 진입·전송 시 폐기한다. 저장소 차단·용량 부족 시 메모리 대기로 동작한다. 재전송은 중복될 수 있으므로 `client_request_id`와 `phase`로 같은 이벤트를 구분한다. 기존 게임 저장 키는 수정하지 않는다.

진단 v2는 요청마다 임의 UUID를 `x-client-info`의 `vodka-diag/<UUID>`로 붙인다. 기존 SDK·갱신 계기 헤더를 보존하며 UUID에 계정 정보는 넣지 않는다. 브라우저 이벤트의 `client_request_id`로 게이트웨이 로그와 대조할 수 있다. REST 응답의 `sb-request-id`는 현재 CORS 노출 헤더에 없어 브라우저에서 비어 있을 수 있다. 서버가 이 헤더를 반환하지 않았다는 뜻은 아니다.

실패·지연 로그에는 요청 시작 시각, 브라우저 계열, 예외 이름과 고정 오류 분류, AbortSignal 취소 여부, 요청 중 페이지 표시 상태 변화도 남긴다. 원본 예외 메시지와 전체 User-Agent는 보내지 않는다. Resource Timing이 노출된 경우에만 DNS·연결·첫 응답 시간을 남기며, 다른 출처의 타이밍이 가려졌거나 요청을 구분하지 못하면 `restricted`·`missing`·`ambiguous`로 표시한다. 이를 0 ms로 해석하지 않는다.

화면이 열린 상태에서 취소·화면 전환을 동반하지 않은 통신 실패가 나면 사이트의 `/diagnostics/ping.json`과 Supabase `/auth/v1/health`를 읽기 전용으로 확인한다. 페이지당 최대 3회, 60초에 한 번이며 각각 6초 제한이다. 결과는 같은 추적 UUID의 `phase=probe` 이벤트로 남긴다. 인증 상태·DB 쿼리·완료 제출을 재시도하지 않으며, 사용자 토큰을 전달하지 않는다. 이 검사는 연결 가능성 비교용이다. 둘 다 성공하더라도 앞선 요청의 통신 장애나 CORS 오류를 배제하지 않는다.

수집기는 DB·인증 서버를 호출하지 않으며 `function_logs`에 `kind=client_request` JSON 로그를 남긴다. `verify_jwt=false`는 로그인·DB 장애 중에도 진단을 수신하기 위한 설정이다. 로그 보관 기간은 현재 Supabase 요금제의 로그 보관 정책을 따른다. 수집기를 수정하면 `python3 scripts/deploy-client-events.py`로 이 함수만 배포한다. 사이트 정적 배포는 함수를 배포하지 않는다.

Supabase의 수집기 자체가 멈추면 원격 진단 로그도 누락될 수 있다. 별도로 `python3 scripts/deploy-health-monitor.py`가 웹 서버 계정의 cron에 1분마다 실행하는 독립 검사를 설치한다. 웹 정적 응답, Supabase 인증 상태, 게스트 데일리 요약의 상태·소요 시간·고정 오류 분류를 `/home/xivnick/vodka-puzzle/diagnostics/health-logs/YYYY-MM-DD.jsonl`에 직접 기록한다. 원격 관리자 토큰·사용자 토큰은 사용하지 않고, 응답 본문·IP·계정 정보는 저장하지 않는다. 이 경로는 공개 사이트 루트 밖이며 디렉터리 700, 파일 600으로 만든다. 30일분을 유지하며 이 검사 파일만 정리한다. 기존 cron 항목은 보존한다. 실행 오류는 같은 상위 디렉터리의 `monitor-last-run.log`로 확인한다. 1분 단위 서버 관측이므로 짧은 장애나 특정 브라우저의 연결 장애는 놓칠 수 있다. 이 독립 검사는 2026-11-17 12:10 KST부터 기록한다.

`python3 scripts/inspect-request-health.py --minutes 30`은 클라이언트 로그, 같은 시각의 DB·인증 시간 초과 집계, 현재 자원 지표와 연결 수를 읽는다. 지표 출력은 조회 시점의 스냅샷이며 과거 자원 추이가 아니다. 장애 당시의 CPU·메모리·스왑·디스크 I/O 추이는 Supabase Reports와 대조한다. 로그 수집기까지 장애가 나면 클라이언트 이벤트는 유실될 수 있으므로 DB·인증 원본 로그도 함께 확인한다.

게이트웨이의 HTTP 오류·2초 이상 원본 서버 지연도 함께 집계한다. `--trace <client_request_id>`를 추가하면 해당 브라우저 요청과 연결 확인 요청의 게이트웨이 수신 여부, 상태, 원본 서버 처리 시간, upstream 처리 시간, Cloudflare ray·리전을 조회한다. 로그 반영 지연과 조회 범위를 고려해야 하며, 조회 결과가 없다는 사실만으로 서버 미도달을 확정하지 않는다. 쿼리 문자열·IP·인증 메타데이터는 출력하지 않는다.

데일리 첫 진입은 기존 `daily_sudoku_context`를 사용한다. 홈과 30초 주기 갱신은 보드·저장 내용을 제외한 `daily_sudoku_summary`를 사용하며, 홈에서만 전체 스트릭 순위를 요청한다. 같은 계정·날짜·종류의 동시 요청은 공유한다. `20261107_request_performance.sql` 적용 전 `python3 scripts/verify-request-performance.py`로 현재/과거 날짜, 게스트/계정별 결과·공개 필터·권한을 롤백 검증한다.

`python3 scripts/review-completions.py`는 수집된 완료 보드를 읽기 전용으로 검토한다. 직접 풀었는지는 판정하지 않으며 기록을 자동 변경하지 않는다. `python3 scripts/sync-puzzle-catalog.py`는 빌드에 포함된 새 일반 문제만 테스트 상태로 등록한다.

DB 권한 검증 도구는 관련 DB 작업 때만 적용 범위를 확인하고 사용한다. 각 도구의 테스트 트랜잭션은 롤백한다.

| 도구 | 범위 |
| --- | --- |
| `scripts/verify-account-policies.py` | 계정별 권한과 닉네임 변경 |
| `scripts/verify-completion-policies.py` | 일반·데일리 완료 제출과 접근 권한 |
| `scripts/verify-puzzle-management.py` | 관리자 권한, 공개·예약 상태, 완료·클라우드 차단, 수정 충돌과 변경 이력 |
| `scripts/verify-daily-streak.py` | 스트릭 집계와 계정 분리 |
| `scripts/verify-daily-streak-rankings.py` | 스트릭 순위와 동률 처리 |
| `scripts/verify-time-machine.py` | 초기 티켓 지급, 중복 차감·계정 접근 차단, 과거 완료 저장과 스트릭 복원 |

관리 API 토큰은 `~/.supabase/access-token`에서 읽고 출력하거나 배포하지 않는다. 로컬 비공개 백업은 `~/Documents/Backups/vodka-puzzle/`에 둔다. 이전 운영·전환 기록은 [보관된 README](history/README-2026-09-29.md)에 남아 있다.

## 타임머신

`/time-machine/`은 데일리 스도쿠 화면 최하단의 타임머신 링크로 진입하는 별도 페이지다. 2026-10-11에 사용자 승인으로 진입 링크를 공개했다. 달력에서 오늘을 선택하면 기본 데일리 화면으로 이동하고, 지난 미완료 문제는 티켓 사용 버튼으로 연다. 완료한 문제나 이미 티켓으로 연 문제는 추가 차감 없이 다시 볼 수 있다.

티켓은 Supabase의 계정별 `private.time_machine_wallets`에 저장한다. 날짜별 사용 권한은 `private.time_machine_openings`, 지급·차감 이력은 `private.time_machine_ticket_events`에 보관한다. 브라우저가 테이블을 직접 수정할 수 없고, `time_machine_context`는 본인 수량·달력 상태만 반환한다. `open_time_machine`은 티켓 차감과 날짜 권한 생성을 같은 트랜잭션에서 처리한다.

티켓 보유 수량에는 서비스 상한이 없으며 음수 잔액은 허용하지 않는다. `20261024_remove_time_machine_ticket_cap.sql`은 지갑과 지급·차감 이력의 기존 2장 제한을 제거한다.

`20261011_time_machine.sql`은 2026-10-11에 한 번 적용했다. 적용 당시 기존 39개 계정에 1장씩 지급했고 신규 구글 계정은 첫 인증된 타임머신 조회 때 한 번 지급한다. 이미 적용한 마이그레이션을 재실행하지 않는다. 자동 추가 지급 규칙은 아직 연결하지 않았다.

티켓으로 연 날짜는 마감 후에도 기존 완료 API로 기록과 완료 보드를 저장할 수 있다. 완료 날짜를 기준으로 스트릭을 다시 집계하므로 비어 있던 날짜를 완료하면 이어진 연속 도전 기록에 반영된다. 사용 권한은 계정별로 확인하며 URL 매개변수만으로 과거 완료 권한을 얻을 수 없다. DB 검증은 임시 계정과 날짜를 만들고 전부 롤백한다.

## 문제 목록과 공개 관리

일반 문제 본문과 규칙은 정적 파일이다. `src/data/puzzles.json`은 배포할 페이지와 DB 최초 등록값의 명세이며, 운영 목록의 원본은 `public.puzzle_catalog`다. 제목·요약설명·난이도·목록 순서·공개 상태·공개 일시 변경은 `/admin/`에서 처리하고 재배포하지 않는다. 유형별 도전과제의 대상 문제는 `private.achievement_puzzle_bindings`에 시즌과 문제 ID로 지정한다.

난이도도 `/admin/`에서 관리한다. 목록은 쉬움·중간·어려움을 오른쪽 마름모 1·2·3개로 표시한다. 보통·상중하·영어 표기도 같은 등급으로 인식하며, 미설정 또는 인식하지 못한 값은 표시하지 않는다.

목록 상단의 마름모 버튼으로 난이도를 여러 개 선택할 수 있다. 선택한 난이도 중 하나에 해당하는 문제를 보여 주며, 로그인한 사용자는 기존 미해결 조건을 함께 적용할 수 있다. 마름모 버튼을 모두 해제하면 미지정 문제를 포함한 전체 난이도로 돌아간다. 필터를 바꾸면 첫 페이지로 이동하며, 데일리 스도쿠 카드는 난이도 필터와 관계없이 유지한다.

테스트 문제(`test`와 기존 `draft`)는 관리자 화면에서 테스트로 표시한다. 메인 목록에는 나오지 않고, 링크로 플레이와 기기 저장만 가능하다. `published`(공개)는 한국 시간으로 지정한 공개 일시가 지난 뒤 목록·완료 제출·클라우드 저장을 활성화한다. 미래 일시를 지정하면 예약 공개다. 새 문제의 공개 전환은 사용자 승인 후에만 수행한다. 비공개 전환은 기존 기록을 삭제하지 않으며 재공개하면 다시 조회할 수 있다.

기존 `YYMMDD_NN` ID와 URL을 유지한다. 예전 퍼즐 테스트 URL은 같은 퍼즐 URL로 이동하며, 배너 같은 UI 시연 경로는 별도로 유지한다. 데일리 스도쿠 일정과 이전 학기 독립 아카이브는 이 관리 대상에 포함하지 않는다.

관리자 권한은 `private.puzzle_admins`의 사용자 UUID와 검증된 구글 세션으로 확인한다. 클라이언트는 관리자 테이블·목록 테이블에 직접 쓰지 못한다. 관리 RPC는 입력 검증과 수정 시각 충돌 확인을 수행하고, 변경 전후 값과 수정 계정을 `private.puzzle_catalog_audit`에 기록한다. 관리자 지정은 `python3 scripts/set-puzzle-admin.py <구글 이메일>`로 수행한다. 사용자 이메일이 확인된 계정에만 권한을 부여한다.

문제 종류 제거는 `20261118_update_puzzle_without_type.sql` 적용, 새 관리자 화면 배포, `20261118_z_remove_puzzle_type.sql` 적용 순서로 진행한다. 마지막 단계에서 예전 저장 RPC와 분류 컬럼을 제거하고 감사 기록의 분류 키를 정리한다. 이전 릴리스의 관리자 편집 화면을 열어둔 경우 새로고침하면 새 저장 RPC를 사용한다.

최초 전환에는 `20261001_puzzle_management.sql`을 한 번 적용한다. 기존 승인 문제는 공개 상태, 폭탄 스도쿠 `261001_04`는 테스트 상태로 이관한다. 적용 전 `python3 scripts/verify-puzzle-management.py --rehearse`로 마이그레이션과 검증을 함께 롤백하며 확인할 수 있다. 이미 적용한 초기 전환 파일을 재실행하지 않는다.


## 조회 부하 구조 (2026-11-18)

`20261118_shared_read_state.sql`은 기존 RPC 계약을 유지하면서 업적 지표와 공통 집계의 계산 결과를 재사용한다. 업적 캐시는 계정·시즌·규칙별로 저장하고 관련 원본 변경 트리거로 무효화한다. 날짜 경계와 다음 퍼즐 공개 시각에 만료된다. 규칙·퍼즐·정책 변경은 공통 정의 버전으로 무효화한다. 초기 데이터는 첫 조회 때 계산하므로 별도 백필이 필요 없고, 캐시 재생성은 보상을 지급하지 않는다.

최근 완료와 스트릭 순위는 최대 30초간 계산 결과를 공유한다. 완료·닉네임·공개 상태 변경은 즉시 버전을 갱신한다. 스트릭의 사용자 식별자는 private 캐시에만 저장하고 RPC에서 `is_me`로 변환한다. 데일리 개인 상태와 보상 판정은 기존 원본 검증을 유지한다. 최초 캐시 생성은 공통 잠금으로 합치고 기존 결과 조회에는 잠금을 추가하지 않는다.

정상 보상·뽑기·조합·장착 응답에는 업적·일일 상태를 함께 반환한다. 프런트는 정상 변경 후 전체 컨텍스트 2회 재조회 대신 응답을 적용한다. 과거에 저장된 재전송 응답에는 부족한 업적 정보만 보충한다. 헤더는 일반 화면에서 가벼운 `reward_summary`를 조회하고 마이페이지에서는 본문의 결과를 사용한다. 계정 읽기는 진행 중 요청과 1초 이내 결과를 공유하며 계정 변경과 거래 후 무효화한다. 다른 탭의 변경은 알림을 받아 활성 화면에서 갱신하고 숨겨진 화면은 복귀 때 갱신한다.

일일 보상의 날짜 잠금은 순위와 관련된 `daily-champion`에 유지하고 출석·일반 완료 보상은 기존 사용자 지갑 잠금과 고유 수령 제약으로 보호한다. 거래 요청 ID와 원장 규칙은 유지한다.

로컬 검증: `python3 scripts/verify-cosmetic-concurrency.py --shared-reads`, `node scripts/verify-cosmetic-client.mjs`, `node scripts/verify-request-diagnostics.mjs`, `npm run build`. 동시성 검증은 임시 로컬 DB만 사용한다. 운영에서는 실제 기록의 계산 결과만 대조한다.

복구는 정적 이전 릴리스 전환과 `supabase/rollback/20261118_shared_read_state.sql`을 사용한다. 복구 SQL은 원래 함수와 잠금 동작을 복원하고 무효화 트리거를 해제한다. 파생 테이블과 비공개 계산 함수는 조사용으로 보존한다. 복구 후 재적용할 때는 기존 파생 테이블을 고려해 migration을 조정하고 캐시를 재생성한다. 원본 기록이나 완료된 거래를 되돌리지 않는다.


### 캐시 조회 RPC의 트랜잭션 모드

PostgREST는 STABLE/IMMUTABLE RPC를 읽기 전용 트랜잭션으로 실행한다. 캐시를 채우는 `achievement_context`와 `cosmetic_context`는 `20261118_cached_context_volatility.sql`로 VOLATILE을 지정한다. SQL Editor의 일반 SELECT 성공만으로 API 호환성을 판단하지 않는다. 캐시 함수는 `20261118_read_only_cache_fallback.sql`에 따라 읽기 전용 트랜잭션에서 캐시가 없으면 원본 계산을 반환한다. 동시성 검증의 `--shared-reads`는 컨텍스트 volatility와 캐시가 빈 읽기 전용 호출도 검증한다.
