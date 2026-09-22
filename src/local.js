// src/local.js
// 내 컴퓨터에서 서버를 실행할 때만 사용하는 파일. (npm start로 실행)
// Vercel에 배포할 때는 이 파일 대신 src/app.js를 바로 사용하므로,
// "서버를 켜는 코드"는 이 파일에만 몰아 둔다.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "./app.js";

const PORT = 3000;

// ESM(import 방식)에서는 __dirname이 없어서 이렇게 직접 만들어야 한다
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// public 폴더(화면 파일들)를 그대로 내보낸다
// 예: public/index.html → http://localhost:3000/index.html
app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
