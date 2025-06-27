document.addEventListener('DOMContentLoaded', () => {
  const translateBtn = document.getElementById('translateBtn');
  const inputField = document.getElementById('userInput');
  const outputDiv = document.getElementById('output');

  translateBtn.addEventListener('click', async () => {
    const inputText = inputField.value.trim();
    if (!inputText) return;

    const inputLang = document.getElementById('inputLang').value;
    const model = document.getElementById('aiModel').value;
    const outputLangs = Array.from(document.getElementById('outputLang').selectedOptions).map(opt => opt.value);
//    const targetLang = outputLangs[0];
		targetLang = document.getElementById('outputLang').value;
		
    outputDiv.innerHTML = '<em style="font-size:26px;">⏳ 正在翻译，请稍候...</em>';

    try {
      const result = await window.Translator.translate(inputText, inputLang, outputLangs, model);

      const transObj = result.translations?.[targetLang];
      const trans = (transObj && transObj.text && transObj.text.trim()) ? transObj.text.trim() : '无翻译';
      const romaji = transObj?.romaji || '';

			const langDisplayMap = {
			  zh: '中文翻译',
			  en: '英文翻译',
			  ja: '日语翻译'
			};

			const displayLang = langDisplayMap[targetLang] || `${targetLang} 翻译`;
			
// 更新HTML生成代码
const transHtml = `
  <div class="output-section">
    <span class="section-title">📘 ${displayLang}：</span>
    <div class="content-row">
      <span>${trans}</span>
      <span onclick="playAudio('${trans}', '${targetLang}')" class="inline-btn">🔊</span>
      <span onclick="copyText('${trans}')" class="inline-btn">📋</span>
    </div>
    ${romaji ? `<div class="content-block"><em class="romaji-text">罗马音：${romaji}</em></div>` : ''}
  </div>
`;

const suggestHtml = `<hr>
  <div class="output-section">
    <span class="section-title">💬 推荐下一句：</span>
    <div class="content-row">
      <span>${result.suggestion.trim()}</span>
      <span class="play-audio inline-btn" data-text="${result.suggestion.trim()}" data-lang="${targetLang}">🔊</span>
      <span onclick="copyText('${result.suggestion.trim()}')" class="inline-btn">📋</span>
    </div>
  </div>
`;

const grammarHtml = `<hr>
  <div class="output-section">
    <span class="section-title">📚 语法分析：</span>
    <div class="content-block">${result.grammar}</div>
  </div>
`;

const vocabHtml = `<hr>
  <div class="output-section">
    <span class="section-title">🧠 生词清单：</span>
    <ul class="vocab-list">
      ${result.vocab.map(v => `<li class="vocab-item"><strong>${v.word}</strong>：${v.meaning}</li>`).join('')}
    </ul>
  </div>
`;

outputDiv.innerHTML = transHtml + suggestHtml + grammarHtml + vocabHtml;

			// ⚠️ 插入后绑定事件
			document.querySelectorAll('.play-audio').forEach(btn => {
			  btn.addEventListener('click', () => {
			    const text = btn.getAttribute('data-text');
			    const lang = btn.getAttribute('data-lang');
			    window.playAudio(text, lang);
			  });
			});

    } catch (err) {
      outputDiv.innerHTML = `<span style="color:red;">❌ 出错：${err.message}</span>`;
    }
  });
});

function copyText(text) {
  navigator.clipboard.writeText(text);
  // 静默，不弹窗
}