# CLAUDE.md

PokeMatch 작업 시 필요한 맥락만 짧게 정리한 문서. 설치법·구조 같은 사용자용 설명은
`README.md`, 튜닝 실험 기록은 `docs/feedback.md`, 원래 설계 문서는 `PRD.md` 참고.

## 이 프로젝트가 뭔지

사진 1장 → CLIP으로 가장 닮은 포켓몬 3마리(1~5세대, 649마리)를 찾아주는 웹앱.
사진 분석은 전부 브라우저(`public/matcher.js`)에서 하고, 서버(`src/app.js`)는
미리 계산해 둔 `data/pokemon.json`을 내려주기만 한다. Vercel에 배포됨
(GitHub: `choose0/PokeMatch`, 주소: `https://poke-match-alpha.vercel.app`).

## 사용자 스타일 (중요)

- 자바스크립트/Node.js를 배우는 중인 학부생. 코드에 **한국어 주석**, 쉬운 문법,
  불필요한 추상화 금지, 파일 수 늘리지 않기.
- 각 단계 끝나면 무엇을 했는지 쉽게 설명 + git commit.
- 디자인 등 취향이 갈리는 결정은 몇 가지 안을 만들어 직접 보여주고 고르게 한다
  (AskUserQuestion + 실제 스크린샷).

## 작업 흐름

1. 코드 수정
2. **로컬 서버(`npm start`) + Claude in Chrome으로 실제 화면에서 확인** (find-button은
   `document.getElementById('find-button').click()`처럼 JS로 클릭하는 게
   좌표 클릭보다 안정적임)
3. `git add/commit/push` (원격 `origin`은 이미 `main` 브랜치로 연결돼 있음)
4. Vercel이 자동 재배포 → 배포 사이트에서도 한 번 더 확인
   (`/api/pokemon`에 1시간 캐시가 걸려 있어서, 같은 브라우저로 반복 테스트할 때
   옛날 데이터가 보이면 `fetch(url, {cache:'reload'})`로 캐시부터 갱신할 것)

## 잊기 쉬운 것들

- **vercel.json**: `builds`를 직접 쓰면 Vercel이 `public/`을 자동으로 정적 서빙해주지
  않는다. `@vercel/static` 빌드 + 명시적 라우트가 꼭 필요함.
- **matcher.js의 센터링 보정**: 649마리 벡터 평균을 빼고 비교하는 이유는 CLIP이
  피카츄·코일처럼 유명한 포켓몬에 쏠리는 편향을 줄이기 위함. `SIMILARITY_MIN/MAX`는
  이 보정이 적용된 점수 분포(대략 0~0.25) 기준으로 잡혀 있음 — 점수 계산 로직을
  바꾸면 이 값도 실제 분포를 재보고 다시 조정해야 함.
- **scripts/build-data.js**: `POKEMON_COUNT`를 올리면 세대를 늘릴 수 있음. `hasVectors`
  (CLIP 벡터 재사용 여부)와 `isFullyDone`(PokéAPI 재조회까지 건너뛸지)이 분리돼 있어서,
  세대·도감 설명 같은 새 필드만 추가할 때는 벡터 재계산 없이 PokéAPI만 다시 부르게 됨.
- `[hidden]` 속성은 반드시 `!important`로 감춰야 한다 (`.card`류 클래스의 `display:flex`가
  기본 hidden 스타일을 명시도로 이겨버리는 버그를 겪었음).
