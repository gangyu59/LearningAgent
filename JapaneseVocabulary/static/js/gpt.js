// ===== 清洗代码块标记与空白 =====
window.cleanGPTContent = function (text) {
  if (!text) return "";
  return text
    .replace(/^```(json)?/i, "")      // 去除开头的 ```json
    .replace(/```$/, "")              // 去除结尾的 ```
    .replace(/"""/g, '"')             // 修复 """ 引号
    .replace(/"\s*\[/g, '[')          // 修复数组前引号
    .replace(/\]\s*"/g, ']')          // 修复数组后引号
    .replace(/"\s*{/g, '{')           // 修复对象前引号
    .replace(/}\s*"/g, '}')           // 修复对象后引号
    .replace(/\\n/g, '')              // 去除换行转义
    .trim();
};

window.fixVocabJson = function (text) {
  if (!text) return "";

  // 1. 清除 code block 包裹和三重引号
  let cleaned = text
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .replace(/：/g, ":")
    .replace(/"""/g, '"')
    .trim();

  // 2. 手动提取 examples，并修复其中的重复 key
  const examples = [];
  const exampleRegex = /\{[^{}]*"ja"[^{}]*?\}/g;
  const exampleMatches = cleaned.match(exampleRegex);

  if (exampleMatches) {
    for (let match of exampleMatches) {
      let ex = {};
      const pairs = match.match(/"([^"]+)"\s*:\s*"([^"]*)"/g) || [];
      for (let pair of pairs) {
        let [k, v] = pair.split(/:(.+)/); // only split on first ":"
        k = k.trim().replace(/^"/, "").replace(/"$/, "");
        v = v.trim().replace(/^"/, "").replace(/"$/, "");
        ex[k] = v;
      }
      if (ex.ja && ex.romaji && ex.zh) {
        examples.push({
          ja: ex.ja,
          romaji: ex.romaji,
          zh: ex.zh
        });
      }
    }
  }

  // 3. 去掉旧 examples 区域
  cleaned = cleaned.replace(/"examples"\s*:\s*\[[\s\S]*?\],?/, "");

  // 4. 插入修复后的 examples
  const examplesJson = JSON.stringify(examples, null, 2);
  const insertPoint = cleaned.lastIndexOf("}");
  if (insertPoint !== -1) {
    cleaned = cleaned.slice(0, insertPoint) + `,\n  "examples": ${examplesJson}\n}`;
  }

  return cleaned;
};

// ===== 校验字段完整性 =====
window.validateVocab = function (item) {
  if (!item) return false;
  const required = ["kana", "romaji", "translation", "examples"];
  return required.every(k => k in item && item[k]);
};

// ===== 添加词条并刷新 =====
window.addVocabEntryToList = function (vocab) {
  if (!window.vocabList.some(v => v.kana === vocab.kana)) {
    window.vocabList.unshift(vocab);
    localStorage.setItem("myVocabList", JSON.stringify(window.vocabList));
  }
  window.selectedVocab = vocab;
  if (typeof renderVocabList === "function") renderVocabList();
  if (typeof renderVocabDetails === "function") renderVocabDetails(vocab);
};

// ===== 生成词条主函数 =====
window.generateVocabByARK = async function (kana, callback) {
  const hourglass = document.getElementById('hourglass');
  hourglass.style.display = 'block';

  const userMessage = `请为以下日语单词生成词典条目，返回 JSON 格式如下：
{
  "kana": "日语词",
  "romaji": "罗马音",
  "translation": "中文翻译",
  "examples": [
    { "ja": "例句1", "romaji": "例句1的罗马音", "zh": "例句1的翻译" },
    { "ja": "例句2", "romaji": "例句2的罗马音", "zh": "例句2的翻译" }
  ],
  "association": "联想记忆",
  "network": ["相关词1", "相关词2"],
  "synonyms": ["近义词1", "近义词2"],
  "antonyms": ["反义词1", "反义词2"]
}
只返回 JSON 字符串，不要加代码块标记，也不要解释。词语是：“${kana}”`;

  const messages = [
    { role: "system", content: "你是一个日语学习助手，专门生成词汇数据。" },
    { role: "user", content: userMessage }
  ];

  try {
    const response = await callARK(messages, {
      temperature: 0.5,
      max_tokens: 1000
    });

    const raw = response.choices?.[0]?.message?.content;
//    console.log("📩 ARK 原始返回：", raw);

    if (!raw) throw new Error("ARK 返回内容为空");

    const cleaned = window.fixVocabJson(raw);
 //   console.log("🧹 清洗后内容：", cleaned);

    let vocab;
    try {
      vocab = JSON.parse(cleaned);
    } catch (e1) {
      console.error("🧨 二次解析失败：", cleaned);
      alert("GPT生成失败：返回的 JSON 无法解析！");
      return;
    }

    // 补全 ID 和 fallback 字段
		vocab.id = Date.now();
		if (!vocab.kana) vocab.kana = kana;
		if (!vocab.romaji) vocab.romaji = '';
		if (!vocab.translation) vocab.translation = '';
		if (!Array.isArray(vocab.examples)) vocab.examples = [];
		
		// 强制确保使用假名 kana 作为词条唯一键（不存储汉字）
		vocab.kana = kana;
		
		// 修复 examples 中格式异常
		vocab.examples = vocab.examples.map(ex => {
		  if (typeof ex === 'object' && ex.ja && ex.romaji && ex.zh) return ex;
		  const keys = Object.keys(ex || {});
		  const ja = keys.find(k => /[\u3040-\u30FF]/.test(k));
		  if (ja) {
		    return {
		      ja: ja,
		      romaji: ex[ja]?.romaji || '',
		      zh: ex[ja]?.zh || ''
		    };
		  }
		  return { ja: "", romaji: "", zh: "" };
		});
		
		// 校验字段
		const missing = ["kana", "romaji", "translation", "examples"].filter(k => !vocab[k]);
		if (missing.length) {
		  console.error("❌ 缺失字段：", missing);
		  alert("❌ GPT生成失败：词条缺失必要字段\n(\n" + missing.join(",\n") + "\n)");
		  return;
		}
		
		callback(vocab);

  } catch (err) {
    console.error("❌ GPT生成异常：", err);
    alert("❌ GPT生成失败（JSON解析错误）：\n" + err.message);
  } finally {
    hourglass.style.display = 'none';
  }
};