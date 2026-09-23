// public/app.js
// 화면(index.html)의 동작을 담당하는 파일.
// 화면은 4가지 상태를 오간다: 대기(사진 선택) → 모델 준비 → 분석 중 → 결과(또는 오류)
// 실제 계산(CLIP, 점수 매기기)은 모두 matcher.js가 한다. 이 파일은 화면만 바꾼다.

import { findMatches } from "./matcher.js";

// 6-3 화면 오류 코드 → 사용자에게 보여줄 문구
const ERROR_MESSAGES = {
  BAD_FILE: "10MB 이하 JPG·PNG·WEBP만 올릴 수 있어요.",
  NO_PERSON: "사람이 보이는 사진을 올려 주세요.",
  MODEL_FAIL: "모델을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.",
  DATA_FAIL: "포켓몬 도감을 불러오지 못했어요.",
};

// 허용하는 파일 형식과 최대 크기 (PRD 6-3 BAD_FILE 기준)
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// 화면의 요소들을 미리 찾아 둔다
const uploadSection = document.getElementById("upload-section");
const loadingSection = document.getElementById("loading-section");
const resultSection = document.getElementById("result-section");

const photoInput = document.getElementById("photo-input");
const preview = document.getElementById("preview");
const uploadHint = document.getElementById("upload-hint");
const errorMessage = document.getElementById("error-message");
const findButton = document.getElementById("find-button");

const modelProgress = document.getElementById("model-progress");
const progressFill = document.getElementById("progress-fill");

const top1Photo = document.getElementById("top1-photo");
const top1Artwork = document.getElementById("top1-artwork");
const top1Name = document.getElementById("top1-name");
const top1Generation = document.getElementById("top1-generation");
const matchBar = document.getElementById("match-bar");
const top1Percent = document.getElementById("top1-percent");
const top1Reasons = document.getElementById("top1-reasons");
const top1Flavor = document.getElementById("top1-flavor");
const flavorBox = document.getElementById("flavor-box");
const restCards = document.getElementById("rest-cards");
const retryButton = document.getElementById("retry-button");

// 지금 선택된 파일을 기억해 둔다 (찾기 버튼을 눌렀을 때 사용)
let selectedFile = null;

// 화면 상태 하나만 보이고 나머지는 숨기는 함수
function showSection(section) {
  uploadSection.hidden = section !== "upload";
  loadingSection.hidden = section !== "loading";
  resultSection.hidden = section !== "result";
}

function showError(text) {
  errorMessage.textContent = text;
  errorMessage.hidden = false;
}

function hideError() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
}

// 사진 파일을 검사하는 함수. 문제가 있으면 이유를 문자열로 돌려주고, 문제없으면 null을 돌려준다
function checkFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "10MB 이하 JPG·PNG·WEBP만 올릴 수 있어요.";
  }
  if (file.size > MAX_SIZE_BYTES) {
    return "10MB 이하 JPG·PNG·WEBP만 올릴 수 있어요.";
  }
  return null;
}

// 사진 파일을 고를 때마다 실행되는 함수
photoInput.addEventListener("change", () => {
  hideError();
  const file = photoInput.files[0];
  if (!file) return;

  // 파일 검사 (BAD_FILE)
  const errorText = checkFile(file);
  if (errorText) {
    showError(errorText);
    preview.hidden = true;
    uploadHint.hidden = false;
    photoInput.value = ""; // 선택한 파일 지우기
    selectedFile = null;
    findButton.disabled = true;
    return;
  }

  // 문제없으면 미리보기로 보여주고, 파일을 기억해 둔다
  selectedFile = file;
  const imageUrl = URL.createObjectURL(file);
  preview.src = imageUrl;
  preview.hidden = false;
  uploadHint.hidden = true;
  findButton.disabled = false;
});

// 모델 내려받기 진행률을 표시하는 함수 (transformers.js의 progress_callback이 호출해 준다)
// 파일마다 progress(0~100)를 따로 알려주므로, 파일별 진행률을 저장해 두고 평균을 낸다
const fileProgress = new Map();
function handleModelProgress(event) {
  if (event.status === "progress") {
    fileProgress.set(event.file, event.progress);
  } else if (event.status === "done") {
    fileProgress.set(event.file, 100);
  } else {
    return; // initiate, ready 같은 상태는 진행률 계산에 쓰지 않는다
  }

  const values = Array.from(fileProgress.values());
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  progressFill.style.width = `${average}%`;

  // 모델 파일을 모두 받았으면(=100%), 진행률 표시를 감추고
  // "도감을 뒤지는 중..." 분석 화면으로 바꾼다 (실제 벡터 계산은 이제부터 시작)
  if (average >= 100) {
    modelProgress.hidden = true;
    showSection("loading");
  }
}

// 찾기 버튼을 누르면 실행되는 함수
findButton.addEventListener("click", async () => {
  hideError();
  if (!selectedFile) return;

  // 버튼을 비활성화해서 분석 중에 여러 번 누르지 못하게 한다
  findButton.disabled = true;

  // 모델 내려받기 진행률 표시 시작
  fileProgress.clear();
  progressFill.style.width = "0%";
  modelProgress.hidden = false;

  try {
    const matches = await findMatches(selectedFile, handleModelProgress);
    renderResult(selectedFile, matches);
  } catch (err) {
    modelProgress.hidden = true;
    findButton.disabled = false;
    showSection("upload");
    const message = ERROR_MESSAGES[err?.code] ?? "알 수 없는 오류가 발생했어요.";
    showError(message);
  }
});

// 결과를 화면에 그리는 함수
function renderResult(photoFile, matches) {
  const [first, ...rest] = matches;

  top1Photo.src = URL.createObjectURL(photoFile);
  top1Artwork.src = first.artwork;
  top1Artwork.alt = first.nameKo;
  top1Name.textContent = `${first.nameKo} (${first.nameEn})`;
  top1Generation.textContent = `${first.generation}세대`;

  matchBar.style.width = `${first.matchPercent}%`;
  top1Percent.textContent = `${first.matchPercent}% 닮았어요`;

  top1Reasons.innerHTML = first.reasons.map((r) => `<li>${r}</li>`).join("");

  // 도감 설명이 없는 포켓몬도 있을 수 있으니 있을 때만 보여준다
  top1Flavor.textContent = first.flavorText ? `"${first.flavorText}"` : "";
  flavorBox.hidden = !first.flavorText;

  // 카드 테두리에 쓸 타입 색은 style.css에 정의된 CSS 변수(--type-xxx)를 사용한다
  restCards.innerHTML = rest
    .map(
      (m) => `
        <div class="rest-card" style="border-color: var(--type-${m.types[0]})">
          <img src="${m.artwork}" alt="${m.nameKo}" class="rest-card-img" />
          <p class="rest-card-name">${m.nameKo}</p>
          <p class="rest-card-sub">${m.generation}세대 · ${m.matchPercent}%</p>
        </div>
      `
    )
    .join("");

  showSection("result");
}

// "다른 사진으로 다시 찾기" 버튼을 누르면 처음 화면으로 되돌아간다
retryButton.addEventListener("click", () => {
  selectedFile = null;
  photoInput.value = "";
  preview.hidden = true;
  uploadHint.hidden = false;
  findButton.disabled = true;
  showSection("upload");
});
