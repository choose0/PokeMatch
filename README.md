# PokeMatch: 닮은꼴 포켓몬 찾기

> 🔗 배포 주소: `https://(배포 후 여기에 주소를 적어주세요).vercel.app`
>
> ⏳ **처음 접속하면 브라우저가 CLIP 모델(약 수십MB)을 내려받느라 시간이 좀 걸려요.**
> 진행률 바가 다 차고 나면 두 번째부터는 브라우저에 저장돼 있어서 훨씬 빨라집니다.

사진 1장을 올리면 CLIP이라는 딥러닝 모델로 사진과 가장 닮은 포켓몬 3마리를 찾아주는 웹 서비스입니다.
사진 분석은 전부 브라우저 안에서 실행되며, 사진이 서버로 전송되지 않습니다.

## 폴더 구조

```
public/     화면 파일 (Vercel이 정적 파일로 그대로 내보냄)
src/app.js  Express 앱 (Vercel이 서버리스 함수로 실행)
src/local.js  내 컴퓨터에서 실행할 때만 사용
scripts/    포켓몬 데이터 + CLIP 벡터를 만드는 스크립트
data/       scripts/build-data.js가 만든 결과 (Git에 포함되어 있음)
docs/       시험 기록 (feedback.md)
```

## 로컬에서 실행하기

```bash
npm install
npm start
```

`http://localhost:3000` 접속. (포켓몬 데이터는 `data/pokemon.json`에 이미 들어있으므로
`npm run build-data`를 다시 실행할 필요는 없습니다. 벡터를 새로 만들고 싶을 때만 실행하세요.)

## Vercel로 배포하기

1. 이 프로젝트를 GitHub 저장소에 올린다 (공개 저장소 권장).
2. [vercel.com](https://vercel.com)에 GitHub 계정으로 가입/로그인한다.
3. **Add New → Project**에서 방금 올린 저장소를 선택하고 **Deploy**를 누른다.
   (`vercel.json`에 필요한 설정이 이미 들어있어서 따로 건드릴 항목이 없습니다.)
4. 배포가 끝나면 나오는 `https://(이름).vercel.app` 주소로 접속해 확인한다.
5. 이후 코드를 고쳐서 GitHub에 push하면 Vercel이 자동으로 다시 배포한다.

### 배포 후 확인할 것

- `https://(이름).vercel.app` 접속 시 사진 선택 화면이 나오는지
- `https://(이름).vercel.app/api/pokemon/25` 접속 시 피카츄 정보(JSON)가 나오는지
- 휴대폰 데이터(와이파이 아님)로 접속해도 똑같이 동작하는지
- `data/pokemon.json`은 Git에 이미 포함되어 있으므로, 배포할 때 서버에서 새로 만들지 않는다
  (서버리스 방식은 요청마다 코드가 새로 실행되고 메모리도 유지되지 않기 때문에,
  벡터 계산처럼 오래 걸리는 작업은 미리 계산해서 파일로 저장해 두는 이 방식이 꼭 필요하다)

## 기술 스택

HTML·CSS·순수 자바스크립트, Node.js + Express, Transformers.js(CLIP), PokéAPI, Vercel Hobby
