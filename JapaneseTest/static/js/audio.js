// static/js/audio.js

// 朗读指定文本
window.playAudio = function(text, gender) {

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP"; // 固定为日语

    const voices = window.speechSynthesis.getVoices();

    if (voices.length > 0) {
        // 优先使用 Kyoko 声音
        const voice = voices.find(v => v.name === "Kyoko" && v.lang === "ja-JP");
        if (voice) {
            utterance.voice = voice;
        } else {
            console.warn("Kyoko not found. Trying other Japanese voices.");
            const fallbackVoice = voices.find(v => v.lang === "ja-JP");
            if (fallbackVoice) {
                utterance.voice = fallbackVoice;
            } else {
                console.warn("No Japanese voice found. Using default voice.");
            }
        }
    } else {
        console.error("Voice list is empty. Ensure voices are loaded.");
    }

    window.speechSynthesis.speak(utterance);
};

// 顺序朗读整个对话文本，并在朗读完后执行回调
// 顺序朗读整个对话文本，支持男女声交替 + 每段间隔
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
window.bindPlayAudioButtons = function(containerId, dialogData) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll(".play-audio").forEach(button => {
        button.addEventListener("click", event => {
            const index = event.target.getAttribute("data-index");
            const gender = event.target.getAttribute("data-gender");
            const text = dialogData[index].text;
            window.playAudio(text, gender);
        });
    });
};