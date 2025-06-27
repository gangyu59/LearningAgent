window.Translator = window.Translator || {};

(function () {
  function getLangName(code) {
    return { zh: '中文', en: '英文', ja: '日文' }[code] || code;
  }

  async function translate(inputText, inputLang, outputLangs, modelName) {
    const targetLangName = getLangName(outputLangs[0]);

		const systemPrompt = window.PromptFactory.getPrompt(inputLang, outputLangs[0]);
		
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: inputText }
    ];

    const reply = await window.AIService.callAI({ messages, modelName });
		console.log("📥 AI 原始返回内容：", reply);
		
    return parseStructuredReply(reply, outputLangs);
  }

function parseStructuredReply(text, outputLangs) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = {
    translations: {},
    suggestion: '',
    grammar: '',
    vocab: []
  };

  let mode = '';
  let currentLang = '';
  const targetLang = outputLangs[0];

  const langMap = {
    Chinese: 'zh',
    中文: 'zh',
    English: 'en',
    英文: 'en',
    Japanese: 'ja',
    日文: 'ja',
    日本語: 'ja'
  };

  for (let line of lines) {
    if (line.includes('【Translation】')) { mode = 'trans'; continue; }
    if (line.includes('【Next Sentence】')) { mode = 'suggest'; continue; }
    if (line.includes('【Grammar】')) { mode = 'grammar'; continue; }
    if (line.includes('【Vocabulary】')) { mode = 'vocab'; continue; }

    // ✅ 捕捉 Romaji（不管在哪一段）
    if (/Romaji/i.test(line)) {
      const romaji = line.replace(/^.*?[：:]/, '').trim();
      if (targetLang && result.translations[targetLang]) {
        result.translations[targetLang].romaji = romaji;
      }
      continue;
    }

    // ✅ 翻译行
    if (mode === 'trans') {
      const match = line.match(/^(?:-|\•)?\s*([\u4e00-\u9fa5a-zA-Z]+)[：:]\s*(.+)$/);
      if (match) {
        const label = match[1].trim();
        const code = langMap[label];
        if (code) {
          currentLang = code;
          result.translations[code] = {
            text: match[2].trim(),
            romaji: ''
          };
        }
      }
    }

    // ✅ 推荐下一句（只保留文本）
    else if (mode === 'suggest') {
      result.suggestion += line + ' ';
    }

    // ✅ 语法解析
    else if (mode === 'grammar') {
      result.grammar += line + '<br>';
    }

    // ✅ 生词清单
    else if (mode === 'vocab') {
      const parts = line.replace(/^[-•]\s*/, '').split(/[：:]/);
      if (parts.length === 2) {
        result.vocab.push({
          word: parts[0].trim(),
          meaning: parts[1].trim()
        });
      }
    }
  }

  return result;
}

  window.Translator.translate = translate;
})();