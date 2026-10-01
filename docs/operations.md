# 운영 참고

## 배포와 롤백

배포에는 Python 3, SSH, rsync와 로컬 `~/.supabase/access-token`이 필요하다. `npm run deploy`는 로컬에서 빌드한 결과만 `xivnick@xivnick.me:~/vodka-puzzle/releases/<id>/`에 올리고, 서버의 `~/vodka-puzzle/dist` 심볼릭 링크를 새 릴리스로 전환한다. 소스·의존성·비밀 설정은 업로드하지 않으며 이전 릴리스는 자동 삭제하지 않는다. 승인된 문제 목록은 배포 과정에서 `scripts/sync-puzzle-catalog.py`로 DB에 등록한다.

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

`python3 scripts/review-completions.py`는 수집된 완료 보드를 읽기 전용으로 검토한다. 직접 풀었는지는 판정하지 않으며 기록을 자동 변경하지 않는다. `python3 scripts/sync-puzzle-catalog.py`는 승인된 일반 문제의 메타데이터를 등록한다.

DB 권한 검증 도구는 관련 DB 작업 때만 적용 범위를 확인하고 사용한다. 각 도구의 테스트 트랜잭션은 롤백한다.

| 도구 | 범위 |
| --- | --- |
| `scripts/verify-account-policies.py` | 계정별 권한과 닉네임 변경 |
| `scripts/verify-completion-policies.py` | 일반·데일리 완료 제출과 접근 권한 |
| `scripts/verify-daily-streak.py` | 스트릭 집계와 계정 분리 |
| `scripts/verify-daily-streak-rankings.py` | 스트릭 순위와 동률 처리 |

관리 API 토큰은 `~/.supabase/access-token`에서 읽고 출력하거나 배포하지 않는다. 로컬 비공개 백업은 `~/Documents/Backups/vodka-puzzle/`에 둔다. 이전 운영·전환 기록은 [보관된 README](history/README-2026-09-29.md)에 남아 있다.
