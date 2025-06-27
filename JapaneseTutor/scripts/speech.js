window.JapaneseTutor = window.JapaneseTutor || {};

(function () {
  // ========= 语音识别 =========
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = 'ja-JP';
  recognition.interimResults = false;

  function startRecognition(callback) {
    recognition.onresult = function (event) {
      const transcript = event.results[0][0].transcript;
      callback(transcript);
    };
    recognition.onerror = function (e) {
      alert('语音识别失败: ' + e.error);
    };
    recognition.start();
  }

  // ========= 语音朗读（优先 Kyoko） =========
  function speak(text) {
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ja-JP";
    utter.rate = 1.0;
    utter.pitch = 1.1;

    const voices = synth.getVoices();

    // ✅ 强制优先使用 Kyoko
    const kyoko = voices.find(v => v.name === "Kyoko" && v.lang === "ja-JP");
    if (kyoko) {
      utter.voice = kyoko;
      console.log("✅ 使用语音：Kyoko");
			logDebug("✅ 使用语音：Kyoko");
    } else {
      const fallback = voices.find(v => v.lang === "ja-JP");
      if (fallback) {
        utter.voice = fallback;
        console.warn("⚠️ Kyoko 不可用，使用 fallback：", fallback.name);
      } else {
        console.warn("⚠️ 未找到任何日语语音，使用系统默认语音");
      }
    }

    utter.onerror = (e) => {
      console.error("❌ 播放出错：", e.error);
    };

    utter.onend = () => {
      console.log("✅ 朗读完毕");
      toggleHourglass(false);
      const micBtn = document.getElementById('micBtn');
      if (micBtn) micBtn.textContent = '🎤 点击说日语';
    };

    synth.speak(utter);
  }

  // ========= 模块导出 =========
  window.JapaneseTutor.Speech = {
    startRecognition,
    speak
  };
})();