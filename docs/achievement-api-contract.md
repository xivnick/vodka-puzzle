# 업적·꾸미기 API 계약

2026-11-05 기준. 신규 API 10개를 구현했다. 기존 완료 API와 화면은 호출하지 않으며 기능은 비활성 상태다.

## 공통

- Supabase의 기존 인증 클라이언트로 호출한다. 사용자 ID는 입력하지 않는다. Google 로그인과 활성 학기 닉네임을 요구한다.
- 모든 RPC는 먼저 `private.cosmetic_settings.enabled`를 검사한다. false이면 `COSMETICS_DISABLED`로 거절하고 경제·방문 데이터를 만들지 않는다.
- 경제 변경 요청마다 UUID를 만든다. 전송 실패 재시도에는 같은 UUID와 같은 입력을 재사용한다. 같은 UUID로 내용을 바꾸면 `REQUEST_ID_REUSED`다. 실패해서 롤백된 요청은 성공 기록이 남지 않는다.
- 동일 요청이 완료됐다면 저장된 응답을 그대로 반환한다. 현재 상태를 다시 읽으려면 context API를 호출한다.
- 경제 응답의 `state_revision`과 `state.state_revision`은 같은 값이다. 계정 전체에서 증가한다. 늦게 도착한 낮은 버전의 상태는 적용하지 않는다. 그 응답의 미표시 결과까지 버리지는 않는다.
- 장착은 `equipment_version`을 별도로 비교한다. 경제 버전이 높더라도 더 최신 장착을 덮어쓰지 않는다.
- 지급·차감·거래·원장은 한 DB 트랜잭션이다. 에러가 나면 전체 롤백한다.

문제 난이도는 DB·관리자 API·업적 모두 정수 0~3을 사용한다. 0은 표기 안 함이며 난이도별 업적에서는 제외하고 일반 누적에는 포함한다.

## 조회

### `cosmetic_context()`

`state`, `progress`, `draw`, `catalog`를 반환한다. 조회로 지갑을 생성하지 않는다.

- `state`: coins, state_revision, inventory, equipment, tickets, all_clear. 아이템별 수량·이름·정의가 포함된다. tickets가 NULL이면 기존 티켓 지갑이 아직 만들어지지 않은 상태다.
- `equipment`: equipment_version, icon_id, color_id, effect_id, expression, direction, all_clear_enabled. 기본값과 아이콘 해제는 NULL로 표현한다.
- `progress`: draw_count, craft_count. 완료 거래에서 계산한다.
- `draw`: 활성 설정의 version, price_per_draw, weights, items. 활성 설정이 없으면 NULL이다.
- `catalog`: 활성 고정 아이템 정의. 조합으로 생성되는 언커먼은 본인 inventory에 정의가 포함된다.

### `achievement_context()`

`season`, `current_day`, `state`, `achievements`, `daily_tasks`를 반환한다. 날짜는 서버 한국 날짜다.

업적: id, name, description, category, rule_version, display_item_id, scope_key, current, threshold, goal, state, active, reward, configured.

- 난이도별 미션 설명은 난이도 ⬥ 퍼즐 풀기·난이도 ⬥⬥ 퍼즐 풀기·난이도 ⬥⬥⬥ 퍼즐 풀기로 표시한다.
- category는 basic/group/special이며 화면에서 일반/유형/특수로 표시한다.
- state는 claimable/in_progress/completed다. 유형 공개 문제 수가 3개 미만이거나 전체 공개 문제가 0개면 active=false다.
- current는 실제 현재 수치다. 과거 연속 단계는 기록으로 재구성하므로 current가 낮아도 claimable일 수 있다.
- threshold는 수령 API에 전달할 고유 단계다. 전체 완료는 업적 목록과 수령 대상에 포함하지 않는다.
- configured=false면 보상량 또는 기록 소급 정책을 확정해야 한다. 달성했어도 받기를 활성화하지 않는다.
- 아이콘 단계 reward는 item_id만 가진다. 반복 단계는 coins다. 최초 아이콘에 코인을 함께 주지 않는다.
- 마지막 정적 단계 뒤에도 repeat_every에 따라 계속 이어진다.

일일 과제: id, name, day, complete, state, reward, configured. state에는 unavailable도 포함된다. 이미 수령한 과제는 completed다.

### `cosmetic_operation(request_id uuid)`

본인의 완료 거래 응답을 반환한다. 없으면 NULL이다. 다른 계정의 요청 UUID를 알아도 조회할 수 없다.

## 변경

### `set_cosmetic_equipment(expected_equipment_version bigint, equipment jsonb)`

전체 선택을 보낸다. 누락된 아이콘·색깔·효과는 NULL, 표현·방향은 기본값으로 해석한다.

```json
{"icon_id":"icon:leaf","color_id":"rare:r-berry","effect_id":"effect:ribbon","expression":"gradient","direction":"diagonal"}
```

expression은 gradient/split, direction은 diagonal/horizontal이다. 모든 아이템의 종류·보유·활성 여부와 효과 적용 조건을 검사한다. 현재와 같으면 버전이 오래됐어도 unchanged=true로 반환한다. 다른 선택인데 버전이 다르면 EQUIPMENT_CHANGED다. 장착 이력이나 경제 거래를 만들지 않는다.

### `set_all_clear_effect(expected_equipment_version bigint, enabled boolean)`

현재 공개된 해당 학기 일반 문제를 전부 풀었을 때만 독립 토글을 변경한다. 미달성이면 ALL_CLEAR_REQUIRED다. 일반 장착과 같은 equipment_version으로 충돌을 처리한다. 일반 장착 API는 이 선택을 변경하지 않는다.

`state.all_clear`는 season, total, completed, eligible, enabled, active를 반환한다. enabled는 저장된 선택, active는 현재 자격과 선택을 함께 적용한 결과다. 새 문제가 공개되면 eligible/active는 false가 되지만 enabled는 유지된다. 다시 올클하면 이전 enabled를 적용한다. 기본색·커먼에서도 가능하며 일반 효과와 중첩된다.

별빛 반짝임은 영구 소유 inventory나 업적 수령으로 지급하지 않는다. catalog에도 eligible인 동안만 표시한다. 일반 effect_id에 `effect:sparkle`을 넣으면 USE_ALL_CLEAR_TOGGLE로 거절한다. 아이콘 해제 시 렌더러는 반짝임도 숨긴다.

### `draw_cosmetics(request_id uuid, expected_draw_config_version integer, count integer)`

count는 1 또는 10이다. 활성 설정과 버전이 다르면 CONFIG_CHANGED, 설정이 없으면 DRAW_NOT_CONFIGURED다. 전체 비용을 먼저 검사한다. 잔액 부족이면 중복 환급을 예상해서 실행하지 않는다.

응답은 ok, operation_id, state_revision, state, progress, cost, config_version, results다. 결과마다 item_id, name, kind, definition, duplicate, refund_coins를 반환한다. 10회 내 중복도 순서대로 처리한다.

### `craft_cosmetic(request_id uuid, material_ids text[])`

정확히 커먼 ID 3개를 보낸다. 같은 색의 반복 선택은 실제 수량만큼만 가능하다. 재료 순서는 정규화한다.

- ABC: AB/AC/BC 균등 추첨.
- AAB: AB 확정.
- AAA: AA 단색 언커먼 확정.

세 재료를 모두 소모하고 언커먼 1개 또는 중복 100코인을 지급한다. 결과 색을 자동 적용하며 아이콘 해제 상태는 유지한다. 응답은 results 1개와 소모 materials, 전체 상태를 포함한다. 미리 결과를 조회하는 API는 없다.

### `claim_achievement(request_id uuid, achievement_id text, scope_key text, threshold bigint)`

현재 조회 결과의 scope_key와 threshold를 보낸다. 다음 미수령 단계부터 차례로 받는다. 수령 시 조건을 다시 계산한다. 멋쟁이는 이 시점에 아이콘을 장착 중이어야 한다. 수령 후 해제해도 보상을 회수하지 않는다.

다른 UUID로 이미 받은 단계를 요청해도 already_claimed=true이며 다시 지급하지 않는다. 아이콘을 이미 소유했으면 추가 코인을 주지 않는다. 수령 보상 금액과 아이템은 거래 당시 값으로 보존한다.

### `record_site_visit(request_id uuid)`

로그인 방문 시 호출한다. 한국 날짜별 한 행만 남기며 코인을 자동 지급하지 않는다. 응답은 day와 daily_tasks다. 같은 날짜에 여러 UUID로 호출해도 출석이 늘어나지 않는다.

### `claim_daily_task(request_id uuid, task_key text, target_day date)`

attendance/daily-complete/daily-champion 중 하나다. 해당 한국 날짜에만 새 수령할 수 있다. 같은 UUID의 확정 응답 재조회나 이미 수령한 날짜의 재요청은 보상을 늘리지 않는다.

출석 20코인, 일반 또는 데일리 신규 완료 100코인이다. 과거 데일리를 타임머신으로 새로 완료한 날에도 완료 과제를 달성한다. 챔피언은 target_day의 데일리 rank=1이고 제외되지 않은 사용자만 가능하다. 티켓 수량은 설정해야 한다. 기존 초기 티켓 지급과 상한 없는 지갑을 보존한다.

## 오류

로그인·프로필: LOGIN_REQUIRED, PROFILE_REQUIRED, COSMETICS_DISABLED.

입력·수령: INVALID_REQUEST, INVALID_STAGE, UNKNOWN_ACHIEVEMENT, ACHIEVEMENT_NOT_READY, REWARD_NOT_CONFIGURED, DAILY_TASK_NOT_READY, DAILY_TASK_EXPIRED.

장착·조합: ITEM_NOT_OWNED, INVALID_EQUIPMENT, EQUIPMENT_CHANGED, ALL_CLEAR_REQUIRED, USE_ALL_CLEAR_TOGGLE, EFFECT_REQUIRES_UNCOMMON, INVALID_MATERIALS, INSUFFICIENT_MATERIALS.

거래: REQUEST_ID_REUSED, INSUFFICIENT_COINS, DRAW_NOT_CONFIGURED, CONFIG_CHANGED, INVALID_DRAW_CONFIG. 관리용 설정 수정의 DRAW_CONFIG_IMMUTABLE은 새 버전 생성이 필요하다는 뜻이다.

## 설정과 활성화 전 작업

- 반복 보상은 고정 코인·티켓·무작위 코인 목록으로 확정했으며 rule version을 올려 적용했다. 과거 수령 기록의 보상을 고쳐 계산하지 않는다.
- 뽑기 가격은 1회 100코인으로 확정했다. 운영 뽑기 설정 1은 100코인의 draft다. 대상 목록 검토와 화면 연동 후 활성화한다. 활성화했던 버전은 가격·확률·목록을 수정할 수 없다. 변경은 새 버전으로 한다.
- `cosmetic_settings.champion_tickets`는 1이다. 데일리 챔피언 보상은 타임머신 티켓 1장이다.
- `history_policy`는 all_records다. 일반 문제 도전과제에 출시 전 유효한 풀이 기록을 포함한다. 일일 과제의 과거 날짜 수령은 허용하지 않는다.
- 기존 완료 API에는 아직 연결하지 않았다. 활성화 전에 일반 문제 공통 잠금과 최초 완료자 확정 호출을 연결하고, 새 달성 알림은 milestone snapshot/diff 함수를 사용한다. 이 연결 전에는 수령 전 탈퇴·동시 완료에 대한 최초 완료 보존을 완성했다고 보지 않는다.
- 실제 화면의 호출, 계정 전환·응답 버전 처리, 달성 토스트·공개 랭킹 표시를 연결한 뒤 enabled를 켠다.

## 반복 보상 응답

다음 단계의 reward는 `{"coins":100}`, `{"tickets":1}`, 또는 `{"coin_options":[10,20,30,40,50,60,70,80,90,100]}` 중 하나다. 무작위 후보 조회는 추첨하지 않는다. `claim_achievement`의 성공 응답과 수령 기록은 실제 지급액인 `{"coins":선택값}`을 반환·보존한다. 꺼지지 않는 불은 7 아이콘 다음 30 티켓, 이후 60·90…이며 수령 함수와 달성 알림이 같은 경계를 사용한다.

## 시간 여행자 준비

`progress.time_machine_count`는 계정 전체의 기존 타임머신 개방 기록 수다. 새 `time-traveler` 규칙은 account 범위·threshold 3·아이콘 1회이며, 아이콘 후보 선택 대기 중에는 비활성이라 실제 업적 목록과 보유 후보 목록에 노출하지 않는다. 기존 개방 요청·차감 API 계약은 그대로다.

시간 여행자의 최종 아이콘은 후보 3번 `clock-bolt`(시계와 번개)로 확정했다. `20261106_time_traveler_clock_bolt.sql`로 해당 규칙·아이템의 선택 대기 상태를 해제했다. 활성 규칙은 20개이며 경제 기능 전체의 enabled=false는 유지한다. 테스트 마이페이지·전체 정리에도 같은 아이콘을 적용한다.

출시일 기준은 일일 과제에만 적용한다. 꺼지지 않는 불은 기존 데일리 연속 수치를 그대로 유지하며 출시일에 초기화하거나 출시 이후 기록만으로 다시 계산하지 않는다. 일반 문제 도전과제도 기존 유효한 풀이 기록을 포함한다.

## 색 표현 방향·반전

`set_cosmetic_equipment`의 equipment는 direction에 diagonal·horizontal·vertical을 허용한다. vertical은 CSS 180deg(상하), horizontal은 90deg(좌우)다. reversed boolean은 두 색의 순서를 뒤집으며 기본값은 false다. 그라데이션·2분할에 동일하게 적용하고 장착 버전으로 충돌을 처리한다. 현재 장착 응답에도 reversed를 포함하며 미생성 기본 장착에서는 클라이언트가 false로 해석한다.

꾸미기 클라이언트는 장착 저장 중에도 아이콘·색·효과·표현·방향·반전·별빛 토글 입력을 받는다. 미리보기는 즉시 갱신하며 한 요청이 진행 중이면 후속 장착 선택을 마지막 값으로 합친다. 장착과 별빛 토글은 순서대로 전송하고 매번 최신 장착 버전을 사용한다. 저장 중 이전 응답으로 미리보기를 덮지 않으며 최종 응답 후 서버 상태와 동기화한다. 보상 수령·뽑기·조합 같은 경제 동작의 잠금은 유지한다.
