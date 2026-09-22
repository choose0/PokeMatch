// public/app.js
// 화면(index.html)의 동작을 담당하는 파일.
// 1단계에서는 딥러닝 없이, 사진 파일 검사 + 미리보기 + 서버 API에서 무작위 3마리 뽑기만 한다.

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

// 사진 파일을 고를 때마다 실행되는 함수
photoInput.addEventListener("change", () => {
  hideError();
  const file = photoInput.files[0];
  if (!file) return;

  // 파일 검사 (BAD_FILE)
  const errorText = checkFile(file);
  if (errorText) {
    showError(errorText);
    preview.style.display = "none";
    photoInput.value = ""; // 선택한 파일 지우기
    return;
  }

  // 문제없으면 미리보기로 보여준다
  const imageUrl = URL.createObjectURL(file);
  preview.src = imageUrl;
  preview.style.display = "block";
});

// 배열에서 무작위로 n개를 뽑는 함수
function pickRandom(array, n) {
  // 원본을 건드리지 않도록 복사한 뒤 섞는다
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied.slice(0, n);
}

// 찾기 버튼을 누르면 실행되는 함수
// 1단계에서는 딥러닝 계산 없이 /api/pokemon에서 무작위 3마리만 보여준다
findButton.addEventListener("click", async () => {
  resultDiv.textContent = "불러오는 중...";

  try {
    const response = await fetch("/api/pokemon");
    const data = await response.json();

    const picked = pickRandom(data.pokemon, 3);

    // 글자로만 결과를 보여준다 (꾸미기는 3단계에서)
    resultDiv.innerHTML = picked
      .map((p) => `<p>#${p.id} ${p.nameKo} (${p.nameEn}) - 색: ${p.color}</p>`)
      .join("");
  } catch (err) {
    resultDiv.textContent = "포켓몬 도감을 불러오지 못했어요.";
  }
});
