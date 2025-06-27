// static/js/render.js

// 设置播放状态按钮样式（通用可复用）
window.togglePlayButton = function (button, status) {
  if (status === "playing") {
    button.textContent = "停止";
    button.style.backgroundColor = "#dc3545";
    button.dataset.status = "playing";
  } else {
    button.textContent = "朗读";
    button.style.backgroundColor = "#007bff";
    button.dataset.status = "idle";
  }
};

// 用于朗读全部例句
window.readAllExamples = function (examples, onComplete = () => {}) {
  if (!Array.isArray(examples) || examples.length === 0) return;

  let index = 0;
  function speakNext() {
    if (index >= examples.length) {
      onComplete();
      return;
    }

    const line = examples[index];
    const utterance = new SpeechSynthesisUtterance(line.text || line.ja);
    utterance.lang = "ja-JP";

    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === "Kyoko" && v.lang === "ja-JP") || voices.find(v => v.lang === "ja-JP");
    utterance.voice = voice;

    utterance.onend = () => {
      index++;
      setTimeout(speakNext, 500);
    };

    speechSynthesis.speak(utterance);
  }

  speechSynthesis.cancel();
  speakNext();
};