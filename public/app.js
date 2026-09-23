// public/app.js
// 화면(index.html)의 동작을 담당하는 파일.
// 사진 파일 검사 + 미리보기, 그리고 matcher.js로 실제 닮은꼴 판정을 실행한다.

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
const photoInput = document.getElementById("photo-input");
const preview = document.getElementById("preview");
const errorMessage = document.getElementById("error-message");
const findButton = document.getElementById("find-button");
const resultDiv = document.getElementById("result");

// 오류 메시지를 보여주는 함수
function showError(text) {
  errorMessage.textContent = text;
  errorMessage.style.display = "block";
}

// 오류 메시지를 감추는 함수
function hideError() {
  errorMessage.style.display = "none";
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

// 지금 선택된 파일을 기억해 둔다 (찾기 버튼을 눌렀을 때 사용)
let selectedFile = null;

// 사진 파일을 고를 때마다 실행되는 함수
photoInput.addEventListener("change", () => {
  hideError();
  resultDiv.textContent = "";
  const file = photoInput.files[0];
  if (!file) return;

  // 파일 검사 (BAD_FILE)
  const errorText = checkFile(file);
  if (errorText) {
    showError(errorText);
    preview.style.display = "none";
    photoInput.value = ""; // 선택한 파일 지우기
    selectedFile = null;
    return;
  }

  // 문제없으면 미리보기로 보여주고, 파일을 기억해 둔다
  selectedFile = file;
  const imageUrl = URL.createObjectURL(file);
  preview.src = imageUrl;
  preview.style.display = "block";
});

// 찾기 버튼을 누르면 실행되는 함수
// matcher.js가 브라우저 안에서 CLIP으로 사진을 분석해 닮은 포켓몬 3마리를 찾는다
findButton.addEventListener("click", async () => {
  hideError();

  if (!selectedFile) {
    showError("먼저 사진을 선택해 주세요.");
    return;
  }

  // 처음 실행하면 CLIP 모델을 내려받아야 해서 시간이 걸릴 수 있다
  resultDiv.textContent = "분석 중... (처음 한 번은 모델을 내려받아 오래 걸릴 수 있어요)";

  try {
    const matches = await findMatches(selectedFile);

    // 글자로만 결과를 보여준다 (꾸미기는 3단계에서)
    resultDiv.innerHTML = matches
      .map(
        (m) =>
          `<p>#${m.id} ${m.nameKo} (${m.nameEn}) - 닮은 정도 ${m.matchPercent}%<br>` +
          `이유: ${m.reasons.join(", ")}</p>`
      )
      .join("");
  } catch (err) {
    resultDiv.textContent = "";
    const message = ERROR_MESSAGES[err?.code] ?? "알 수 없는 오류가 발생했어요.";
    showError(message);
  }
});
