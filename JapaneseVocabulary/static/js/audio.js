window.playAudio = function(text, gender) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  const voices = speechSynthesis.getVoices();

  const voice = voices.find(v => v.name === "Kyoko" && v.lang === "ja-JP")
              || voices.find(v => v.lang === "ja-JP");
  if (voice) utterance.voice = voice;

  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
};

window.readAllSceneText = function(dialogList, onComplete = () => {}) {
  if (!Array.isArray(dialogList) || dialogList.length === 0) return;
  let index = 0;
  function speakNext() {
    if (index >= dialogList.length) return onComplete();
    const line = dialogList[index];
    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.lang = "ja-JP";
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find(v => v.name === "Kyoko" && v.lang === "ja-JP") || voices.find(v => v.lang === "ja-JP");
    utterance.onend = () => {
      index++;
      setTimeout(speakNext, 600);
    };
    speechSynthesis.speak(utterance);
  }
  speechSynthesis.cancel();
  speakNext();
};

// 绑定播放按钮，支持 data-index 和 data-gender
window.bindPlayAudioButtons = function(containerId, dialogData) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const buttons = container.querySelectorAll(".play-audio");
  buttons.forEach(button => {
    button.addEventListener("click", event => {
      const index = event.target.getAttribute("data-index");
      const gender = event.target.getAttribute("data-gender");
      const text = dialogData[index]?.text || dialogData[index]?.ja || "";
      window.playAudio(text, gender);
    });
  });
};