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

// 색 판정에 쓸 가운데 영역의 비율 (0~1)
// 4단계 시험에서 60%로 하면 인물 사진 뒤 배경(특히 회색 스튜디오 배경)까지 포함돼
// 엉뚱한 색으로 판정되는 경우가 많았다. 얼굴 쪽으로 더 좁혀서 배경의 영향을 줄인다
const COLOR_BOX_RATIO = 0.35;

// 5장 공식: 최종 점수 = 0.5 × 설명 점수 + 0.4 × 그림 점수 + 0.1 × 색 점수
const TEXT_WEIGHT = 0.5;
const IMAGE_WEIGHT = 0.4;
const COLOR_WEIGHT = 0.1;

// 닮은 정도(0~100)로 바꿀 때 쓰는 유사도 범위
// 649마리로 늘린 뒤, 센터링 보정(아래 설명)을 적용한 점수 분포(대략 0~0.25)에 맞춰 조정했다
const SIMILARITY_MIN = 0;
const SIMILARITY_MAX = 0.25;

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

// onProgress: transformers.js가 모델 파일을 내려받을 때마다 진행 상황을 알려주는 콜백 (3단계 진행률 표시용)
function loadModels(onProgress) {
  if (!processorPromise) {
    processorPromise = AutoProcessor.from_pretrained(MODEL_NAME, { progress_callback: onProgress });
  }
  if (!visionModelPromise) {
    visionModelPromise = CLIPVisionModelWithProjection.from_pretrained(MODEL_NAME, {
      progress_callback: onProgress,
    });
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

// 벡터 a에서 벡터 b를 빼는 함수 (센터링에 사용)
function subtract(a, b) {
  return a.map((v, i) => v - b[i]);
}

// 여러 벡터의 평균(중심)을 구하는 함수
function meanVector(vectors) {
  const dimension = vectors[0].length;
  const sum = new Array(dimension).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dimension; i++) sum[i] += vector[i];
  }
  return sum.map((v) => v / vectors.length);
}

// 포켓몬 벡터 전체의 "평균 방향"을 구해서 빼는 보정 (센터링)
// 사진이 배경이나 형태가 단순하면, CLIP이 유명하거나 흔한 포켓몬(예: 피카츄, 코일)에게
// 항상 비슷하게 높은 점수를 주는 경향이 있었다. 평균 방향을 미리 구해서 빼 주면
// "모든 포켓몬과 공통으로 비슷한 정도"는 지우고, 그 사진만의 특징이 더 잘 드러난다
function center(vectors, mean) {
  return vectors.map((v) => normalize(subtract(v, mean)));
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

  // 가운데 영역만 살펴본다 (배경보다 사진의 주요 대상이 있을 확률이 높음)
  const boxW = Math.round(canvas.width * COLOR_BOX_RATIO);
  const boxH = Math.round(canvas.height * COLOR_BOX_RATIO);
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
async function embedPhoto(canvas, onProgress) {
  const [processor, visionModel] = await loadModels(onProgress);
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
// textScore, imageScore: 이 포켓몬과 사진의 설명글 점수·그림 점수 (색·분위기로 다 못 채울 때 구체적인 이유로 사용)
function buildReasons(photoColor, photoVibe, pokemon, textScore, imageScore) {
  const reasons = [];

  if (photoColor.key === pokemon.color) {
    reasons.push(`사진의 주된 색(${photoColor.nameKo})이 ${pokemon.nameKo}와 같아요`);
  }
  if (photoVibe.item.key === pokemon.vibe) {
    reasons.push(`둘 다 ${photoVibe.item.nameKo} 분위기예요`);
  }

  // 색·분위기가 안 맞으면, 그림 점수와 설명 점수 중 어느 쪽이 더 높은지 보고
  // "생김새가 닮았다" 또는 "느낌·특징이 닮았다" 중 더 구체적인 이유를 골라준다
  if (reasons.length < 2) {
    if (imageScore >= textScore) {
      reasons.push(`${pokemon.nameKo}의 생김새(그림)가 사진과 가장 비슷해요`);
    } else {
      reasons.push(`${pokemon.nameKo}의 특징·분위기가 사진과 가장 비슷해요`);
    }
  }
  while (reasons.length < 2) {
    reasons.push("전체적인 인상이 가장 가까워요");
  }
  return reasons.slice(0, 2);
}

// 사진 파일을 받아 닮은 포켓몬 top 3를 돌려주는 메인 함수
// onProgress: 모델을 내려받는 동안 진행 상황을 화면에 보여주기 위한 콜백 (생략 가능)
// 실패하면 { code: "BAD_FILE" | "NO_PERSON" | "MODEL_FAIL" | "DATA_FAIL" } 형태의 에러를 던진다
export async function findMatches(file, onProgress) {
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
    photoVector = await embedPhoto(canvas, onProgress);
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

  // 5) 포켓몬 전체와 점수 계산
  // 설명 점수·그림 점수는 센터링(평균 방향 빼기)을 적용해서 비교한다
  const meanImageVector = meanVector(pokemonData.pokemon.map((p) => p.imageVector));
  const meanTextVector = meanVector(pokemonData.pokemon.map((p) => p.textVector));

  const centeredImageVectors = center(
    pokemonData.pokemon.map((p) => p.imageVector),
    meanImageVector
  );
  const centeredTextVectors = center(
    pokemonData.pokemon.map((p) => p.textVector),
    meanTextVector
  );

  const centeredPhotoForImage = normalize(subtract(photoVector, meanImageVector));
  const centeredPhotoForText = normalize(subtract(photoVector, meanTextVector));

  const scored = pokemonData.pokemon.map((pokemon, index) => {
    const textScore = dot(centeredPhotoForText, centeredTextVectors[index]);
    const imageScore = dot(centeredPhotoForImage, centeredImageVectors[index]);
    const colorScore = photoColor.key === pokemon.color ? 1 : 0;

    const finalScore =
      TEXT_WEIGHT * textScore + IMAGE_WEIGHT * imageScore + COLOR_WEIGHT * colorScore;

    return { pokemon, finalScore, textScore, imageScore };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);
  const top3 = scored.slice(0, 3);

  // 6) 화면에 보여줄 형태로 정리
  return top3.map(({ pokemon, finalScore, textScore, imageScore }) => ({
    id: pokemon.id,
    nameKo: pokemon.nameKo,
    nameEn: pokemon.nameEn,
    artwork: pokemon.artwork,
    types: pokemon.types, // 화면에서 타입별 색을 카드 테두리에 쓰기 위함
    generation: pokemon.generation,
    flavorText: pokemon.flavorText,
    matchPercent: toPercent(finalScore),
    reasons: buildReasons(photoColor, photoVibe, pokemon, textScore, imageScore),
  }));
}
