window.JapaneseTutor = window.JapaneseTutor || {};

(function () {
  // 文字输入处理模块
  function initTextInput(callback) {
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    
    function handleSend() {
      const text = userInput.value.trim();
      if (text) {
        callback(text);
        userInput.value = '';
      }
    }
    
    sendBtn.addEventListener('click', handleSend);
    userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSend();
      }
    });

    // 确保输入框获得焦点
    userInput.focus();
  }

  window.JapaneseTutor.TextInput = {
    init: initTextInput
  };
})();