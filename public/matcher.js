// public/matcher.js
// 브라우저 안에서 CLIP 모델을 불러오고, 사진 벡터를 계산해 포켓몬과 비교하는 파일.
// 사진 데이터를 서버로 보내는 코드는 전혀 없다. 모든 계산은 이 파일 안에서 끝난다.

// CDN에서 Transformers.js를 불러온다. scripts/build-data.js와 반드시 같은 버전을 쓴다.
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

// 서버(scripts/build-data.js)와 반드시 같은 모델이어야 벡터를 비교할 수 있다
const MODEL_NAME = "Xenova/clip-vit-base-patch32";

// 사진을 줄일 긴 변 길이 (px)
const RESIZE_MAX_SIDE = 512;

// 5장 공식: 최종 점수 = 0.5 × 설명 점수 + 0.4 × 그림 점수 + 0.1 × 색 점수
const TEXT_WEIGHT = 0.5;
const IMAGE_WEIGHT = 0.4;
const COLOR_WEIGHT = 0.1;

// 닮은 정도(0~100)로 바꿀 때 쓰는 유사도 범위
const SIMILARITY_MIN = 0.15;
const SIMILARITY_MAX = 0.35;

// PokéAPI의 10가지 색 이름 → 한국어, 대표 RGB값
// 대표 RGB값은 사진의 픽셀 색과 비교해서 "가장 가까운 색"을 고르는 데 쓴다
const COLOR_TABLE = [
  { key: "black", nameKo: "검정", rgb: [40, 40, 40] },
  { key: "blue", nameKo: "파랑", rgb: [60, 110, 210] },
  { key: "brown", nameKo: "갈색", rgb: [140, 90, 50] },
  { key: "gray", nameKo: "회색", rgb: [140, 140, 140] },
  { key: "green", nameKo: "초록", rgb: [70, 160, 80] },
  { key: "pink", nameKo: "분홍", rgb: [235, 160, 190] },
  { key: "purple", nameKo: "보라", rgb: [140, 70, 170] },
  { key: "red", nameKo: "빨강", rgb: [210, 50, 50] },
  { key: "white", nameKo: "하양", rgb: [240, 240, 240] },
  { key: "yellow", nameKo: "노랑", rgb: [230, 210, 60] },
];

// 모델은 한 번만 불러오면 되므로, 불러온 뒤 변수에 저장해 재사용한다
let processorPromise = null;
let visionModelPromise = null;

function loadModels() {
  if (!processorPromise) {
    processorPromise = AutoProcessor.from_pretrained(MODEL_NAME);
  }
  if (!visionModelPromise) {
    visionModelPromise = CLIPVisionModelWithProjection.from_pretrained(MODEL_NAME);
  }
  return Promise.all([processorPromise, visionModelPromise]);
}

// 벡터의 길이를 1로 맞추는 함수 (build-data.js와 동일한 방식)
function normalize(vector) {
  const length = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / length);
}

// 정규화된 두 벡터의 내적(= 코사인 유사도)
function dot(a, b) {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

// 후보 목록 중 photoVector와 가장 유사도가 높은 항목을 찾는 함수 (제로샷 분류에 사용)
function findBestMatch(photoVector, candidates) {
  let best = candidates[0];
  let bestScore = dot(photoVector, best.vector);
  for (const candidate of candidates.slice(1)) {
    const score = dot(photoVector, candidate.vector);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return { item: best, score: bestScore };
}

// 사진 파일을 긴 변 512px 이하의 canvas로 줄이는 함수
async function resizeToCanvas(file) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = imageUrl;
    });

    const scale = Math.min(1, RESIZE_MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

// canvas 가운데 부분의 픽셀 색을 세어, COLOR_TABLE 중 가장 많이 나온 색을 고르는 함수
function detectDominantColor(canvas) {
  const ctx = canvas.getContext("2d");

  // 가운데 60% 영역만 살펴본다 (배경보다 사진의 주요 대상이 있을 확률이 높음)
  const boxW = Math.round(canvas.width * 0.6);
  const boxH = Math.round(canvas.height * 0.6);
  const startX = Math.round((canvas.width - boxW) / 2);
  const startY = Math.round((canvas.height - boxH) / 2);

  const { data } = ctx.getImageData(startX, startY, boxW, boxH);

  // 색 이름별로 몇 번 나왔는지 세는 표
  const counts = COLOR_TABLE.map(() => 0);

  // 픽셀 4개(r,g,b,a)마다 하나씩 읽는다. 너무 느려지지 않도록 4픽셀 간격으로 건너뛴다
  for (let i = 0; i < data.length; i += 4 * 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // 이 픽셀과 가장 가까운 대표색을 찾는다 (색 공간에서의 거리 계산)
    let closestIndex = 0;
    let closestDist = Infinity;
    COLOR_TABLE.forEach((color, index) => {
      const [cr, cg, cb] = color.rgb;
      const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = index;
      }
    });
    counts[closestIndex] += 1;
  }

  // 가장 많이 나온 색의 인덱스를 찾는다
  let bestIndex = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[bestIndex]) bestIndex = i;
  }
  return COLOR_TABLE[bestIndex];
}

// 사진(canvas)을 CLIP 이미지 벡터로 바꾸는 함수
async function embedPhoto(canvas) {
  const [processor, visionModel] = await loadModels();
  const image = await RawImage.fromCanvas(canvas);
  const inputs = await processor(image);
  const { image_embeds } = await visionModel(inputs);
  return normalize(Array.from(image_embeds.data));
}

// 0~1 사이가 아닌 값을 0~100 사이로 자르고 바꾸는 함수 (PRD 5-3)
function toPercent(score) {
  const ratio = (score - SIMILARITY_MIN) / (SIMILARITY_MAX - SIMILARITY_MIN);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

// 색/분위기가 같은 이유를 문장 2개로 만드는 함수
function buildReasons(photoColor, photoVibe, pokemon) {
  const reasons = [];

  if (photoColor.key === pokemon.color) {
    reasons.push(`사진의 주된 색(${photoColor.nameKo})이 ${pokemon.nameKo}와 같아요`);
  }
  if (photoVibe.item.key === pokemon.vibe) {
    reasons.push(`둘 다 ${photoVibe.item.nameKo} 분위기예요`);
  }
  while (reasons.length < 2) {
    reasons.push("전체적인 인상이 가장 가까워요");
  }
  return reasons.slice(0, 2);
}

// 사진 파일을 받아 닮은 포켓몬 top 3를 돌려주는 메인 함수
// 실패하면 { code: "BAD_FILE" | "NO_PERSON" | "MODEL_FAIL" | "DATA_FAIL" } 형태의 에러를 던진다
export async function findMatches(file) {
  // 1) 서버에서 판정용 문장 벡터와 포켓몬 목록을 받아온다
  let labelsData;
  let pokemonData;
  try {
    const [labelsRes, pokemonRes] = await Promise.all([
      fetch("/api/labels"),
      fetch("/api/pokemon"),
    ]);
    labelsData = await labelsRes.json();
    pokemonData = await pokemonRes.json();
  } catch {
    throw { code: "DATA_FAIL" };
  }

  // 브라우저가 쓸 모델과 서버가 벡터를 계산할 때 쓴 모델이 다르면 비교가 의미 없다
  if (labelsData.model !== MODEL_NAME) {
    throw { code: "MODEL_FAIL" };
  }

  // 2) 사진을 CLIP 벡터로 바꾼다
  let photoVector;
  let canvas;
  try {
    canvas = await resizeToCanvas(file);
    photoVector = await embedPhoto(canvas);
  } catch {
    throw { code: "MODEL_FAIL" };
  }

  // 3) 사람이 있는 사진인지 확인 (제로샷 분류)
  const subjectMatch = findBestMatch(photoVector, labelsData.labels.subject);
  if (subjectMatch.item.key !== "person") {
    throw { code: "NO_PERSON" };
  }

  // 4) 사진의 주된 색과 분위기를 정한다
  const photoColor = detectDominantColor(canvas);
  const photoVibe = findBestMatch(photoVector, labelsData.labels.vibe);

  // 5) 151마리와 점수 계산
  const scored = pokemonData.pokemon.map((pokemon) => {
    const textScore = dot(photoVector, pokemon.textVector);
    const imageScore = dot(photoVector, pokemon.imageVector);
    const colorScore = photoColor.key === pokemon.color ? 1 : 0;

    const finalScore =
      TEXT_WEIGHT * textScore + IMAGE_WEIGHT * imageScore + COLOR_WEIGHT * colorScore;

    return { pokemon, finalScore };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);
  const top3 = scored.slice(0, 3);

  // 6) 화면에 보여줄 형태로 정리
  return top3.map(({ pokemon, finalScore }) => ({
    id: pokemon.id,
    nameKo: pokemon.nameKo,
    nameEn: pokemon.nameEn,
    artwork: pokemon.artwork,
    matchPercent: toPercent(finalScore),
    reasons: buildReasons(photoColor, photoVibe, pokemon),
  }));
}
