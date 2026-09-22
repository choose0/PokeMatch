# PRD: 닮은꼴 포켓몬 찾기 (PokeMatch)

## 0. 요약
- 무엇: 사람 사진을 올리면 닮은 포켓몬 1위 + 후보 2개를 이유와 함께 보여주는 웹 서비스
- 대상 수준: 자바스크립트와 Node.js를 처음 배우는 학부생의 포트폴리오 프로젝트. 꼭 필요한 기능 위주로 만들고, 보기 좋은 요소는 조금만 넣음
- 판정 방식: 미리 학습된 딥러닝 모델 CLIP을 사용. 사진과 포켓몬을 각각 숫자 목록(벡터)으로 바꾼 뒤, 방향이 얼마나 비슷한지 계산해서 순위를 매김. 모델을 새로 학습시키지는 않음
- 실행 위치: 사진 분석은 사용자의 브라우저 안에서 실행. 사진이 기기 밖으로 나가지 않고, API 요금도 없음
- 구성: 화면은 HTML·CSS·순수 자바스크립트, 서버는 Node.js + Express(포켓몬 데이터 API 담당), 포켓몬 벡터는 내 컴퓨터에서 미리 계산
- 배포: Vercel 무료(Hobby) 요금제
- 개발 순서: [1 뼈대] → [2 기능 부여] → [3 디자인] → [4 피드백 및 수정] → [5 배포]
- 알고 시작할 점: AI 언어 모델처럼 "왜 닮았는지"를 문장으로 설명하지는 못함. 이유는 색과 분위기 같은 계산 결과로 보여줌. 결과가 가끔 엉뚱할 수 있으며, 이를 4단계에서 조정함

## 1. 목표와 범위

### 목표
- 사진 1장을 올리면 닮은 포켓몬 3마리와 닮은 이유가 나온다
- 사진은 기기 밖으로 전송되지 않는다
- 만든 사람(나)이 모든 파일이 무슨 일을 하는지 설명할 수 있다
- 인터넷 주소로 누구나 접속해서 써 볼 수 있다

### 만들지 않는 것
- 회원가입, 로그인, 데이터베이스
- React 같은 프론트엔드 프레임워크, TypeScript
- 모델 직접 학습 ("이 사람은 이 포켓몬을 닮았다"는 정답 데이터가 없기 때문)
- 상업적 배포 (포켓몬 이름과 그림은 Nintendo, Game Freak, The Pokémon Company의 저작물이며, Vercel Hobby도 비상업용만 허용)

## 2. 핵심 개념: CLIP은 무엇을 하나

CLIP은 OpenAI가 공개한 모델로, 그림과 글을 같은 공간의 벡터로 바꿔 준다.

- 비슷한 내용의 그림과 글은 비슷한 방향의 벡터가 된다
  - 예: 노란 옷을 입고 웃는 사람 사진과 "귀여운 노란 생물" 이라는 글의 벡터는 방향이 가깝다
- 두 벡터가 얼마나 비슷한지 = 코사인 유사도
  - 코사인 유사도 = (A와 B의 내적) ÷ (A의 길이 × B의 길이)
  - 1에 가까울수록 같은 방향(비슷함), 0에 가까울수록 관계없음
  - CLIP 벡터는 길이를 1로 맞춰서(정규화) 쓰므로, 실제 계산은 내적만 하면 된다
  - 내적 = 두 벡터의 같은 자리 숫자끼리 곱해서 모두 더한 값
- 제로샷(zero-shot) 분류: 따로 학습시키지 않고, 후보 문장들("사람 사진", "동물 사진", "풍경 사진")과 사진의 유사도를 비교해서 가장 높은 쪽을 고르는 방법. 이 프로젝트에서는 "사람이 있는 사진인지" 확인과 "분위기" 판정에 사용한다.

## 3. 구성

```
[내 컴퓨터에서 1번 실행]  scripts/build-data.js
   PokéAPI ──▶ 이름·타입·색·그림 주소
   CLIP    ──▶ 그림 벡터, 설명글 벡터, 분위기, 판정용 문장 벡터
          ──▶ data/pokemon.json

[서버: Express, Vercel에 배포]
   GET /api/pokemon          포켓몬 목록 + 벡터
   GET /api/pokemon/:id      한 마리 정보
   GET /api/labels           판정용 문장 벡터 (사람 확인, 분위기)
   public/ 폴더의 화면 파일 제공

[브라우저]
   1) CLIP 이미지 모델 불러오기 (처음 1번 내려받고, 이후 브라우저가 저장해 둠)
   2) 사진 → 벡터
   3) 사람 사진인지 확인
   4) 151마리와 점수 계산 → 상위 3마리
   5) 이유(색, 분위기) 만들어서 표시
```

나눈 이유
- 포켓몬 151마리의 벡터는 매번 계산할 필요가 없으므로 미리 계산해 둔다 (시간 절약)
- 사진 벡터만 브라우저에서 계산하므로, 브라우저는 이미지 모델만 내려받으면 된다
- 서버는 데이터를 정해진 형식으로 내주는 API 역할을 한다

### 폴더 구조
```
pokematch/
├─ public/              화면 파일 (Vercel이 그대로 내보냄)
│  ├─ index.html
│  ├─ style.css
│  ├─ app.js            화면 동작
│  └─ matcher.js        모델 불러오기, 벡터 계산, 점수 계산
├─ src/
│  ├─ app.js            Express 앱 (Vercel이 찾는 위치와 이름)
│  └─ local.js          내 컴퓨터에서 실행할 때만 사용 (app.listen)
├─ scripts/
│  └─ build-data.js     포켓몬 데이터 + 벡터 만들기
├─ data/
│  └─ pokemon.json
├─ docs/
│  └─ feedback.md       4단계 시험 기록
├─ .gitignore
├─ package.json
└─ README.md
```

## 4. 기술 스택

| 구분 | 사용 | 용도 |
|---|---|---|
| 화면 | HTML, CSS, 순수 자바스크립트 | 사진 선택, 결과 표시 |
| 서버 | Node.js (18 이상), Express | 포켓몬 데이터 API |
| 딥러닝 | Transformers.js (@huggingface/transformers) | 브라우저와 Node.js에서 CLIP 실행 |
| 모델 | Xenova/clip-vit-base-patch32 (기본), Xenova/mobileclip_s0 (가벼운 대안) | 그림·글 → 벡터 |
| 데이터 | PokéAPI | 포켓몬 이름, 타입, 색, 그림 |
| 배포 | Vercel Hobby | 무료 배포 |

모듈 방식은 import로 통일. 브라우저에서 Transformers.js를 import로 불러오므로, 서버와 스크립트도 import를 쓴다. (package.json에 "type": "module")

꼭 지킬 것
- 포켓몬 벡터를 만들 때와 브라우저에서 사진 벡터를 만들 때 반드시 같은 모델을 쓴다. 모델이 다르면 벡터 공간이 달라서 비교가 의미 없어진다
- Transformers.js 버전은 고정한다. 과거에 버전을 올리자 CLIP의 이미지 특징 추출 기능(pipeline)이 오류를 낸 사례가 있다. 그래서 pipeline 대신 CLIPVisionModelWithProjection, CLIPTextModelWithProjection을 직접 쓰는 방식을 권장한다

## 5. 점수 계산

### 5-1. 점수 세 가지

| 점수 | 계산 | 의미 |
|---|---|---|
| 설명 점수 | 사진 벡터 · 포켓몬 설명글 벡터 | 사진이 "귀여운 노란 쥐 포켓몬 피카츄" 같은 설명과 얼마나 맞나 |
| 그림 점수 | 사진 벡터 · 포켓몬 그림 벡터 | 사진과 공식 그림이 겉보기에 얼마나 비슷한가 |
| 색 점수 | 사진의 주된 색 = 포켓몬 색이면 1, 아니면 0 | 색감이 같은가 |

(· 는 내적)

### 5-2. 최종 점수
```
최종 점수 = 0.5 × 설명 점수 + 0.4 × 그림 점수 + 0.1 × 색 점수
```
- 0.5, 0.4, 0.1은 시작값이며 4단계에서 바꿔 가며 조정한다
- 가중치는 public/matcher.js 맨 위에 상수로 둔다

### 5-3. 화면에 보여줄 "닮은 정도"

CLIP 유사도는 보통 0.15~0.35 사이의 작은 값이라 그대로 보여주면 낮아 보인다. 그래서 0~100으로 바꾼다.
```
닮은 정도 = (최종 점수 − 0.15) ÷ (0.35 − 0.15) × 100
```
- 0보다 작으면 0, 100보다 크면 100으로 자른다
- 0.15와 0.35도 4단계에서 실제 값 분포를 보고 조정한다
- 화면에 "재미로 보는 수치"라고 적는다

### 5-4. 이유 만들기
- 색: 사진 가운데 부분의 픽셀 색을 세어 가장 많은 색을 PokéAPI의 10가지 색(검정, 파랑, 갈색, 회색, 초록, 분홍, 보라, 빨강, 하양, 노랑) 중 하나로 정한다. 포켓몬 색과 같으면 "사진의 주된 색(노랑)이 피카츄와 같아요"
- 분위기: 분위기 문장 6개(귀여운, 시크한, 활발한, 차분한, 강인한, 몽환적인)와 사진의 유사도를 비교해 가장 높은 분위기를 고른다. 포켓몬도 미리 같은 방식으로 분위기를 정해 둔다. 같으면 "둘 다 활발한 분위기예요"
- 둘 다 해당이 없으면 "전체적인 인상이 가장 가까워요"

색 판정은 딥러닝 없이 canvas로 픽셀을 직접 세는 방식이다.

## 6. 데이터 명세

### 6-1. data/pokemon.json

scripts/build-data.js를 한 번 실행해서 만든다. 1세대 151마리부터 시작한다.

```json
{
  "model": "Xenova/clip-vit-base-patch32",
  "labels": {
    "subject": [
      { "key": "person", "text": "a photo of a person", "vector": [0.012, "..."] },
      { "key": "animal", "text": "a photo of an animal", "vector": ["..."] },
      { "key": "scenery", "text": "a photo of a landscape", "vector": ["..."] },
      { "key": "object", "text": "a photo of an object", "vector": ["..."] }
    ],
    "vibe": [
      { "key": "cute", "nameKo": "귀여운", "text": "a cute looking face", "vector": ["..."] }
    ]
  },
  "pokemon": [
    {
      "id": 25,
      "nameEn": "pikachu",
      "nameKo": "피카츄",
      "types": ["electric"],
      "color": "yellow",
      "vibe": "cheerful",
      "artwork": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
      "imageVector": [0.031, "..."],
      "textVector": [0.018, "..."]
    }
  ]
}
```

- 벡터는 소수점 4자리로 반올림해 파일 크기를 줄인다
- 설명글 예: "a picture of pikachu, a cute yellow pokemon of electric type"
- model 값을 저장해 두고, 브라우저가 같은 모델을 쓰는지 확인하는 데 사용한다

가져오는 곳
- https://pokeapi.co/api/v2/pokemon/{번호} → 영어 이름, 타입, 공식 그림 주소
- https://pokeapi.co/api/v2/pokemon-species/{번호} → 한국어 이름 (names에서 language가 ko), 색 (color.name)

### 6-2. 서버 API

| 요청 | 응답 | 오류 |
|---|---|---|
| GET /api/pokemon | { model, pokemon: [...] } | — |
| GET /api/pokemon/:id | 한 마리 정보 (벡터 제외) | 없는 번호 → 404 { "error": { "code": "NOT_FOUND" } } |
| GET /api/labels | { model, labels } | — |

- 데이터는 자주 바뀌지 않으므로 응답에 캐시 헤더(Cache-Control)를 붙인다
- pokemon.json은 import로 불러와서, Vercel 배포 때 파일이 함께 포함되게 한다

### 6-3. 화면 오류 (브라우저에서 판단)

| code | 상황 | 화면 문구 |
|---|---|---|
| BAD_FILE | JPG·PNG·WEBP가 아니거나 10MB 초과 | "10MB 이하 JPG·PNG·WEBP만 올릴 수 있어요." |
| NO_PERSON | 사람 판정 점수가 가장 높지 않음 | "사람이 보이는 사진을 올려 주세요." |
| MODEL_FAIL | 모델 내려받기 실패 | "모델을 불러오지 못했어요. 인터넷 연결을 확인해 주세요." |
| DATA_FAIL | 서버 API 실패 | "포켓몬 도감을 불러오지 못했어요." |

사진이 서버로 가지 않으므로 파일 크기 상한을 넉넉하게 둔다. 분석 전에 canvas로 작게 줄여서 처리한다.

## 7. 개인정보
- 사진은 브라우저 안에서만 처리하고, 서버를 포함해 어디로도 전송하지 않는다
- 화면 문구: "사진은 이 기기 안에서만 분석되고 어디에도 전송되지 않아요."
- 확인 방법: 브라우저 개발자 도구의 Network 탭에서 사진 분석 중에 사진 데이터가 나가는 요청이 없는지 본다 (모델 파일을 받는 요청만 있어야 함)
- API 키가 필요 없으므로 키 유출 걱정이 없다

## 8. 단계별 구현 계획

### 모든 단계 공통으로 Claude Code에 함께 줄 말

나는 자바스크립트와 Node.js를 배우는 중인 학부생이야.
- 코드에 한국어 주석을 달아서 각 부분이 무슨 일을 하는지 설명해줘
- 어려운 문법이나 불필요한 추상화는 피하고, 파일 수를 늘리지 마
- 단계가 끝나면 무엇을 만들었는지, 새로 쓴 개념이 무엇인지 쉽게 정리해줘

단계가 끝날 때마다 Git에 커밋한다. (예: "1단계: 뼈대 완성")

### [1단계] 뼈대

목표: 딥러닝 없이 "데이터 만들기 → 서버 API → 화면"이 한 바퀴 도는지 확인

이 단계에서 배우는 것
- npm으로 프로젝트 만들기, 패키지 설치, import 방식 모듈
- Express 라우트, 경로 변수(:id), 404 처리
- fetch와 async/await로 외부 API 부르기 (PokéAPI)
- 화면에서 서버 API를 불러와 DOM에 그리기

지시문
- 3장의 폴더 구조대로 프로젝트를 만들고 express 설치, package.json에 "type": "module"
- scripts/build-data.js: PokéAPI에서 1~151번을 받아 6-1 형식으로 data/pokemon.json 저장
  (요청은 한꺼번에 보내지 말고 순서대로. 벡터 항목과 labels는 아직 비워 둠)
- src/app.js: 6-2의 API 세 개를 만들고 app을 export
- src/local.js: app을 불러와 3000번 포트로 실행하고 public 폴더도 내보냄. npm start로 실행
- public: 파일 선택, 미리보기, 찾기 버튼.
  버튼을 누르면 /api/pokemon에서 무작위 3마리를 골라 글자로 표시 (꾸미기 없음)
- 파일 형식·크기 검사, 실패 시 6-3의 BAD_FILE
- 아직 딥러닝 모델은 넣지 마

완료 기준
- node scripts/build-data.js 후 pokemon.json에 151마리, 한글 이름과 색 있음
- npm start 후 브라우저에서 사진을 고르고 버튼을 누르면 무작위 3마리가 나옴
- /api/pokemon/9999 접속 시 404와 오류 JSON
- 각 파일이 무슨 역할인지 내가 한 줄씩 설명할 수 있음
