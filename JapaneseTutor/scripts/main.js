function initApp() {
  const startBtn = document.getElementById('startSpeechBtn');
  const micBtn = document.getElementById('micBtn');
  const outputDiv = document.getElementById('output');
  const Speech = window.JapaneseTutor.Speech;
  const Assistant = window.JapaneseTutor.Assistant;
  const Scenario = window.JapaneseTutor.Scenario;

  let isRecognizing = false;

  function appendMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-block';

  if (role === '老师') {
    const row = document.createElement('div');
    row.className = 'teacher-row';

    const roleText = document.createElement('span');
    roleText.innerHTML = `<strong>${role}:</strong> ${text}`;
    row.appendChild(roleText);

    const replayBtn = document.createElement('button');
    replayBtn.className = 'replay-btn';
    replayBtn.innerHTML = '🔁';
    replayBtn.onclick = () => {
      window.JapaneseTutor.Speech.speak(text);
    };
    row.appendChild(replayBtn);

    wrapper.appendChild(row);
    window.JapaneseTutor.Speech.speak(text);
  } else if (role === '中文解释') {
    const lines = text.split(/[\n•▪︎·•●◉・]/).map(line => line.trim()).filter(Boolean);
    const explainList = document.createElement('ul');
    explainList.className = 'cn-explain';
    lines.forEach(line => {
      const li = document.createElement('li');
      li.textContent = line;
      explainList.appendChild(li);
    });
    wrapper.appendChild(explainList);
  } else {
    const p = document.createElement('p');
    p.innerHTML = `<strong>${role}:</strong> ${text}`;
    wrapper.appendChild(p);
  }

  outputDiv.appendChild(wrapper);
  outputDiv.scrollTop = outputDiv.scrollHeight;
}

  // ✅ 点击欢迎按钮播放中文欢迎词 + 激活语音权限
  startBtn.addEventListener('click', () => {
    const welcome = new SpeechSynthesisUtterance("欢迎！请选择场景后点击按钮开始对话");
    welcome.lang = 'zh-CN';
    welcome.rate = 1.1;

    welcome.onend = () => {
      startBtn.style.display = 'none';
      micBtn.style.display = 'inline-block';
    };

    speechSynthesis.speak(welcome);
  });

  // ✅ 语音识别主流程
  async function handleSpeechRecognition() {
    if (isRecognizing) return;
    isRecognizing = true;

    micBtn.textContent = '🎤 说话中…';
    logDebug("开始识别语音...");

    Speech.startRecognition(async (userInput) => {
      appendMessage('你', userInput);
      logDebug("用户说了：" + userInput);

      micBtn.textContent = '🎤 处理中…';
      toggleHourglass(true);

      const scenario = Scenario.getScenario();
      logDebug("当前场景：" + scenario);

      try {
        const reply = await Assistant.askAssistant(userInput, scenario);
        logDebug("收到 GPT 回复：" + reply);

        const lines = reply.split('\n').map(line => line.trim()).filter(Boolean);
        const jp = lines[0] || '[GPT没有返回日文]';
        const cn = lines.slice(1).join('\n') || '[GPT没有返回中文解释]';

        appendMessage('老师', jp);
        appendMessage('中文解释', cn);

        logDebug("▶️ 正在朗读：" + jp);
 //       Speech.speak(jp);
      } catch (err) {
        console.error('处理对话出错:', err);
        logDebug("❌ 出错：" + err.message);
        alert('处理失败，请检查网络或 API 设置。');
      } finally {
        micBtn.textContent = '🎤 点击说日语';
        toggleHourglass(false);
        isRecognizing = false;
      }
    });
  }

  // ✅ 长按说日语按钮绑定
  micBtn.addEventListener('mousedown', handleSpeechRecognition);
  micBtn.addEventListener('touchstart', handleSpeechRecognition);
}