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

## 완료 기록과 DB 검증

`python3 scripts/review-completions.py`는 수집된 완료 보드를 읽기 전용으로 검토한다. 직접 풀었는지는 판정하지 않으며 기록을 자동 변경하지 않는다. `python3 scripts/sync-puzzle-catalog.py`는 빌드에 포함된 새 일반 문제만 테스트 상태로 등록한다.

DB 권한 검증 도구는 관련 DB 작업 때만 적용 범위를 확인하고 사용한다. 각 도구의 테스트 트랜잭션은 롤백한다.

| 도구 | 범위 |
| --- | --- |
| `scripts/verify-account-policies.py` | 계정별 권한과 닉네임 변경 |
| `scripts/verify-completion-policies.py` | 일반·데일리 완료 제출과 접근 권한 |
| `scripts/verify-puzzle-management.py` | 관리자 권한, 공개·예약 상태, 완료·클라우드 차단, 수정 충돌과 변경 이력 |
| `scripts/verify-daily-streak.py` | 스트릭 집계와 계정 분리 |
| `scripts/verify-daily-streak-rankings.py` | 스트릭 순위와 동률 처리 |

관리 API 토큰은 `~/.supabase/access-token`에서 읽고 출력하거나 배포하지 않는다. 로컬 비공개 백업은 `~/Documents/Backups/vodka-puzzle/`에 둔다. 이전 운영·전환 기록은 [보관된 README](history/README-2026-09-29.md)에 남아 있다.

## 문제 목록과 공개 관리

일반 문제 본문과 규칙은 정적 파일이다. `src/data/puzzles.json`은 배포할 페이지와 DB 최초 등록값의 명세이며, 운영 목록의 원본은 `public.puzzle_catalog`다. 제목·요약설명·종류·목록 순서·공개 상태·공개 일시 변경은 `/admin/`에서 처리하고 재배포하지 않는다.

`draft`(초안)와 `test`(테스트)는 목록에 나오지 않고, 링크로 플레이와 기기 저장만 가능하다. `published`(공개)는 한국 시간으로 지정한 공개 일시가 지난 뒤 목록·완료 제출·클라우드 저장을 활성화한다. 미래 일시를 지정하면 예약 공개다. 새 문제의 공개 전환은 사용자 승인 후에만 수행한다. 비공개 전환은 기존 기록을 삭제하지 않으며 재공개하면 다시 조회할 수 있다.

기존 `YYMMDD_NN` ID와 URL을 유지한다. 예전 퍼즐 테스트 URL은 같은 퍼즐 URL로 이동하며, 배너 같은 UI 시연 경로는 별도로 유지한다. 데일리 스도쿠 일정과 이전 학기 독립 아카이브는 이 관리 대상에 포함하지 않는다.

관리자 권한은 `private.puzzle_admins`의 사용자 UUID와 검증된 구글 세션으로 확인한다. 클라이언트는 관리자 테이블·목록 테이블에 직접 쓰지 못한다. 관리 RPC는 입력 검증과 수정 시각 충돌 확인을 수행하고, 변경 전후 값과 수정 계정을 `private.puzzle_catalog_audit`에 기록한다. 관리자 지정은 `python3 scripts/set-puzzle-admin.py <구글 이메일>`로 수행한다. 사용자 이메일이 확인된 계정에만 권한을 부여한다.

최초 전환에는 `20261001_puzzle_management.sql`을 한 번 적용한다. 기존 승인 문제는 공개 상태, 폭탄 스도쿠 `261001_04`는 테스트 상태로 이관한다. 적용 전 `python3 scripts/verify-puzzle-management.py --rehearse`로 마이그레이션과 검증을 함께 롤백하며 확인할 수 있다. 이미 적용한 초기 전환 파일을 재실행하지 않는다.
