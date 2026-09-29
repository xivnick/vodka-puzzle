# 보드카 퍼즐

Astro 정적 사이트와 Supabase로 운영하는 퍼즐 사이트다. 운영 주소는 <https://puzzle.xivnick.me/>다.

## 로컬 실행

Node.js 22.12 이상이 필요하다.

```sh
npm ci
npm run dev
```

## 확인과 배포

```sh
npm run build
npm run deploy
```

`npm run deploy`는 빌드 결과물만 서버에 올린다. 서버 설정·롤백·DB 작업은 [운영 문서](docs/operations.md)를 참고한다.

## 코드 위치

| 경로 | 내용 |
| --- | --- |
| `src/pages/` | 페이지와 퍼즐 경로 |
| `src/layouts/`, `src/components/` | 공통 화면과 퍼즐 컴포넌트 |
| `src/lib/`, `src/scripts/`, `src/styles/` | 규칙·동작·스타일 |
| `src/data/puzzles.json` | 공개 승인된 퍼즐 목록 |
| `public/` | 그대로 공개되는 정적 파일 |
| `supabase/`, `scripts/`, `ops/` | DB와 운영 도구 |

`legacy/2026-1/`은 이전 사이트 원본이고, `public/archive/2026-1/`은 서비스 중인 독립 아카이브다.
