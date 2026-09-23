// build-data.js
// PokéAPI에서 1~649번(1~5세대) 포켓몬 정보를 받아오고, CLIP 모델로 벡터(임베딩)까지 계산해
// data/pokemon.json 파일로 저장하는 스크립트.
// 내 컴퓨터에서 실행한다: npm run build-data
// 2단계: CLIP으로 그림 벡터·설명글 벡터·분위기·판정용 문장 벡터를 채운다.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPVisionModelWithProjection,
  CLIPTextModelWithProjection,
  RawImage,
} from "@huggingface/transformers";

const POKEMON_COUNT = 649; // 1~5세대 전국도감 번호 (5세대 끝)
const DATA_PATH = "data/pokemon.json";

// 반드시 브라우저(public/matcher.js)와 같은 모델을 써야 벡터끼리 비교가 가능하다
const MODEL_NAME = "Xenova/clip-vit-base-patch32";

// 사람이 있는 사진인지 확인하는 제로샷 분류용 문장 4개
const SUBJECT_LABELS = [
  { key: "person", text: "a photo of a person" },
  { key: "animal", text: "a photo of an animal" },
  { key: "scenery", text: "a photo of a landscape" },
  { key: "object", text: "a photo of an object" },
];

// 분위기 제로샷 분류용 문장 6개
const VIBE_LABELS = [
  { key: "cute", nameKo: "귀여운", text: "a cute looking face" },
  { key: "chic", nameKo: "시크한", text: "a chic and cool looking face" },
  { key: "lively", nameKo: "활발한", text: "an energetic and lively looking face" },
  { key: "calm", nameKo: "차분한", text: "a calm and gentle looking face" },
  { key: "tough", nameKo: "강인한", text: "a strong and tough looking face" },
  { key: "dreamy", nameKo: "몽환적인", text: "a dreamy and mysterious looking face" },
];

// 벡터의 길이(크기)를 1로 맞추는 함수 (정규화)
// 정규화된 벡터끼리는 내적 = 코사인 유사도가 된다
function normalize(vector) {
  const length = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / length);
}

// 저장 용량을 줄이기 위해 소수점 4자리까지만 남기는 함수
function round4(vector) {
  return vector.map((v) => Math.round(v * 10000) / 10000);
}

// 정규화된 두 벡터의 내적(= 코사인 유사도)을 구하는 함수
function dot(a, b) {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

// 포켓몬 한 마리의 "글자 정보"를 PokéAPI 두 곳에서 가져와 합치는 함수 (1단계와 동일)
async function fetchPokemonInfo(id) {
  const pokemonRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
  const pokemonData = await pokemonRes.json();

  const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  const speciesData = await speciesRes.json();

  const koName = speciesData.names.find((n) => n.language.name === "ko");

  return {
    id,
    nameEn: pokemonData.name,
    nameKo: koName ? koName.name : pokemonData.name,
    types: pokemonData.types.map((t) => t.type.name),
    color: speciesData.color.name,
    artwork: pokemonData.sprites.other["official-artwork"].front_default,
  };
}

// 그림 주소(URL)를 받아 CLIP 이미지 벡터를 계산하는 함수
async function embedImage(processor, visionModel, url) {
  const image = await RawImage.fromURL(url);
  const inputs = await processor(image);
  const { image_embeds } = await visionModel(inputs);
  return normalize(Array.from(image_embeds.data));
}

// 문장을 받아 CLIP 글 벡터를 계산하는 함수
async function embedText(tokenizer, textModel, text) {
  const inputs = tokenizer(text, { padding: true, truncation: true });
  const { text_embeds } = await textModel(inputs);
  return normalize(Array.from(text_embeds.data));
}

// 이미 CLIP 계산까지 끝난 포켓몬인지 확인하는 함수
// (중간에 스크립트가 멈춰도 처음부터 다시 계산하지 않도록)
function isDone(entry) {
  return (
    entry &&
    Array.isArray(entry.imageVector) &&
    entry.imageVector.length > 0 &&
    Array.isArray(entry.textVector) &&
    entry.textVector.length > 0 &&
    entry.vibe
  );
}

// labels(사람 확인 문장 + 분위기 문장)의 벡터까지 이미 계산되어 있는지 확인하는 함수
function labelsDone(labels) {
  return (
    labels &&
    labels.subject?.length === SUBJECT_LABELS.length &&
    labels.subject.every((l) => l.vector?.length > 0) &&
    labels.vibe?.length === VIBE_LABELS.length &&
    labels.vibe.every((l) => l.vector?.length > 0)
  );
}

async function main() {
  // 이전에 저장해 둔 결과가 있으면 불러온다 (이어서 실행하기 위해)
  let existingData = null;
  try {
    const raw = await readFile(DATA_PATH, "utf-8");
    existingData = JSON.parse(raw);
  } catch {
    existingData = null; // 파일이 없으면 처음부터 시작
  }

  const existingPokemonMap = new Map();
  if (existingData?.pokemon) {
    for (const p of existingData.pokemon) existingPokemonMap.set(p.id, p);
  }

  console.log("CLIP 모델을 불러오는 중... (처음 실행이면 시간이 걸릴 수 있어요)");

  // pipeline 대신 모델 클래스를 직접 불러온다 (버전이 바뀌어도 안정적으로 동작하도록)
  const processor = await AutoProcessor.from_pretrained(MODEL_NAME);
  const visionModel = await CLIPVisionModelWithProjection.from_pretrained(MODEL_NAME);
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME);
  const textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL_NAME);

  console.log("모델 준비 완료.");

  // labels(사람 확인 문장 4개, 분위기 문장 6개) 벡터 계산
  let labels = existingData?.labels;
  if (labelsDone(labels)) {
    console.log("labels는 이미 계산되어 있어 건너뜁니다.");
  } else {
    console.log("labels(사람 확인/분위기 문장) 벡터 계산 중...");
    const subject = [];
    for (const item of SUBJECT_LABELS) {
      const vector = await embedText(tokenizer, textModel, item.text);
      subject.push({ ...item, vector: round4(vector) });
    }
    const vibe = [];
    for (const item of VIBE_LABELS) {
      const vector = await embedText(tokenizer, textModel, item.text);
      vibe.push({ ...item, vector: round4(vector) });
    }
    labels = { subject, vibe };
  }

  // 분위기를 정할 때 쓰는, 반올림 전의 vibe 문장 벡터 (정확도를 위해 매번 새로 계산)
  const vibeVectors = [];
  for (const item of labels.vibe) {
    vibeVectors.push({ key: item.key, vector: item.vector });
  }

  const pokemonList = [];

  for (let id = 1; id <= POKEMON_COUNT; id++) {
    const existing = existingPokemonMap.get(id);

    if (isDone(existing)) {
      pokemonList.push(existing);
      console.log(`  ${id}/${POKEMON_COUNT} ${existing.nameKo} 이미 계산됨 (건너뜀)`);
      continue;
    }

    // PokéAPI에서 이름·타입·색·그림 주소를 받아온다
    const info = await fetchPokemonInfo(id);

    // 그림 벡터 계산
    const imageVector = await embedImage(processor, visionModel, info.artwork);

    // 설명글 벡터 계산 (예: "a picture of pikachu, a yellow pokemon of electric type")
    const description = `a picture of ${info.nameEn}, a ${info.color} pokemon of ${info.types.join(" and ")} type`;
    const textVector = await embedText(tokenizer, textModel, description);

    // 그림 벡터와 분위기 문장 벡터를 비교해서 가장 잘 맞는 분위기를 고른다 (제로샷 분류)
    let bestVibe = vibeVectors[0];
    let bestScore = dot(imageVector, bestVibe.vector);
    for (const candidate of vibeVectors.slice(1)) {
      const score = dot(imageVector, candidate.vector);
      if (score > bestScore) {
        bestScore = score;
        bestVibe = candidate;
      }
    }

    pokemonList.push({
      ...info,
      vibe: bestVibe.key,
      imageVector: round4(imageVector),
      textVector: round4(textVector),
    });

    console.log(`  ${id}/${POKEMON_COUNT} ${info.nameKo} (${info.nameEn}) 완료 - 분위기: ${bestVibe.key}`);
  }

  const result = {
    model: MODEL_NAME,
    labels,
    pokemon: pokemonList,
  };

  await mkdir("data", { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(result, null, 2), "utf-8");

  console.log(`완료! data/pokemon.json 에 ${pokemonList.length}마리 저장됨`);
}

main();
