// static/js/audio.js

window.playAudio = function (text, lang = 'en') {
  const langMap = {
    ja: 'ja-JP',
    zh: 'zh-CN',
    en: 'en-US'
  };
  const voiceLang = langMap[lang] || 'en-US';

  const preferredVoices = {
    'ja-JP': 'Kyoko',
    'zh-CN': 'Tingting',
    'en-US': 'Samantha'
  };
  const preferredName = preferredVoices[voiceLang];

//  console.log('📢 即将朗读:', text);
//  console.log('🌐 目标语言代码:', lang);
//  console.log('🗣️ 映射为系统语言:', voiceLang);
//  console.log('🎯 优先语音名称:', preferredName);

  function speakWithVoice() {
    const voices = window.speechSynthesis.getVoices();
//    console.log('📦 获取到的语音列表:', voices.map(v => `${v.name} (${v.lang})`));

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceLang;

    let selected = voices.find(v => v.name === preferredName && v.lang === voiceLang);
    if (!selected) {
      console.warn('⚠️ 未找到首选语音，尝试匹配语种');
      selected = voices.find(v => v.lang === voiceLang);
    }
    if (selected) {
      utterance.voice = selected;
//      console.log('✅ 使用语音:', selected.name, selected.lang);
    } else {
      console.warn('❌ 无法找到匹配语音，将使用默认');
    }

    window.speechSynthesis.cancel(); // 停止前一条
    window.speechSynthesis.speak(utterance);
  }

  // ✅ 确保语音加载完成
  if (speechSynthesis.getVoices().length === 0) {
    console.log('⏳ 语音列表尚未加载，监听 voiceschanged 事件');
    window.speechSynthesis.onvoiceschanged = () => {
      speakWithVoice();
    };
  } else {
    speakWithVoice();
  }
};

// 顺序朗读整个对话文本，并在朗读完后执行回调
window.readAllSceneText = function(dialogList, onComplete = () => {}) {
    if (!Array.isArray(dialogList) || dialogList.length === 0) return;

    let index = 0;

    function speakNext() {
        if (index >= dialogList.length) {
            onComplete();
            return;
        }

        const line = dialogList[index];
        const utterance = new SpeechSynthesisUtterance(line.text);
        utterance.lang = "ja-JP";

        // 区分说话人：A → 女声，B → 男声
        const voices = window.speechSynthesis.getVoices();
        let selectedVoice = null;

        if (line.speaker === "A" ||line.speaker === "Narrator") {
            selectedVoice = voices.find(v => v.name === "Kyoko" && v.lang === "ja-JP"); // 女声
        } else if (line.speaker === "B") {
            selectedVoice = voices.find(v => (v.name === "Otoya" || v.name === "Hattori") && v.lang === "ja-JP"); // 男声
        }

        // 如果找不到设定的，就退而求其次
        if (!selectedVoice) {
            selectedVoice = voices.find(v => v.lang === "ja-JP");
        }

        utterance.voice = selectedVoice;

        utterance.onend = () => {
            index++;
            // ✅ 加入 600ms 间隔后朗读下一句
            setTimeout(speakNext, 600);
        };

        window.speechSynthesis.speak(utterance);
    }

    // 停止前一次朗读，开始新一轮
    window.speechSynthesis.cancel();
    speakNext();
};

// 给一组播放按钮绑定点击朗读事件
window.bindPlayAudioButtons = function(containerId, dialogData, lang = 'ja') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll(".play-audio").forEach(button => {
    button.addEventListener("click", event => {
      const index = event.target.getAttribute("data-index");
      const text = dialogData[index].text;
      window.playAudio(text, lang);  // ✅ 正确传入语言代码
    });
  });
};