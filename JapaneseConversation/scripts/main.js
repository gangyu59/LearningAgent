function initApp() {
  const startBtn = document.getElementById('startBtn');
  const outputDiv = document.getElementById('output');
  const Assistant = window.JapaneseTutor.Assistant;
  const Scenario = window.JapaneseTutor.Scenario;
  const TextInput = window.JapaneseTutor.TextInput;

  function appendMessage(role, text) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-block';

    if (role === '老师') {
      const row = document.createElement('div');
      row.className = 'teacher-row';

      const roleText = document.createElement('span');
      roleText.innerHTML = `<strong>${role}:</strong> ${text}`;
      row.appendChild(roleText);

      // 保留重播按钮，绑定单句朗读功能
      const replayBtn = document.createElement('button');
      replayBtn.className = 'replay-btn';
      replayBtn.innerHTML = '🔁';
      replayBtn.onclick = () => {
        if (window.JapaneseTutor.Speech?.speak) {
          window.JapaneseTutor.Speech.speak(text);
        }
      };
      row.appendChild(replayBtn);

      wrapper.appendChild(row);
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

  // 开始对话按钮点击事件
  startBtn.addEventListener('click', () => {
    startBtn.style.display = 'none';
    document.querySelector('.text-input-container').style.display = 'flex';
    
    // 初始化文字输入
    TextInput.init(async (userInput) => {
      appendMessage('你', userInput);
      toggleHourglass(true);

      try {
        const scenario = Scenario.getScenario();
        const reply = await Assistant.askAssistant(userInput, scenario);

        const lines = reply.split('\n').map(line => line.trim()).filter(Boolean);
        const jp = lines[0] || '[GPT没有返回日文]';
        const cn = lines.slice(1).join('\n') || '[GPT没有返回中文解释]';

        appendMessage('老师', jp);
        appendMessage('中文解释', cn);
      } catch (err) {
        console.error('处理对话出错:', err);
        appendMessage('系统', '处理失败，请检查网络或 API 设置。');
      } finally {
        toggleHourglass(false);
        document.getElementById('userInput').focus();
      }
    });
    
    appendMessage('系统', '请输入日文开始对话');
  });
}

// 初始化应用
document.addEventListener('DOMContentLoaded', initApp);