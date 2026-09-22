// src/app.js
// Express로 만든 서버 앱. 라우트(경로)만 정의하고, 실제로 켜는 일(listen)은 하지 않는다.
// 이렇게 나누면 로컬(src/local.js)에서도, Vercel 배포 환경에서도 같은 app을 쓸 수 있다.

import express from "express";
import pokemonData from "../data/pokemon.json" with { type: "json" };

const app = express();

// 캐시 헤더를 붙이는 작은 함수
// 포켓몬 데이터는 build-data.js를 다시 돌리기 전까지 바뀌지 않으므로
// 브라우저가 1시간(3600초) 동안 다시 요청하지 않고 저장해 두도록 한다
function setCacheHeader(res) {
  res.set("Cache-Control", "public, max-age=3600");
}

// GET /api/pokemon : 전체 포켓몬 목록 + 모델 이름 반환
app.get("/api/pokemon", (req, res) => {
  setCacheHeader(res);
  res.json({
    model: pokemonData.model,
    pokemon: pokemonData.pokemon,
  });
});

// GET /api/pokemon/:id : 번호 하나로 포켓몬 한 마리 조회
// :id 처럼 콜론이 붙은 부분은 "경로 변수"라서 req.params.id로 꺼낼 수 있다
app.get("/api/pokemon/:id", (req, res) => {
  const id = Number(req.params.id);
  const found = pokemonData.pokemon.find((p) => p.id === id);

  if (!found) {
    // 없는 번호를 요청하면 404 상태 코드와 함께 오류 JSON을 보낸다
    return res.status(404).json({ error: { code: "NOT_FOUND" } });
  }

  setCacheHeader(res);
  res.json(found);
});

// GET /api/labels : 사람/분위기 판정용 문장 벡터 목록 반환 (2단계에서 채워짐)
app.get("/api/labels", (req, res) => {
  setCacheHeader(res);
  res.json({
    model: pokemonData.model,
    labels: pokemonData.labels,
  });
});

export default app;
