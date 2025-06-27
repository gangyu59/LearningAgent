window.JapaneseTutor = window.JapaneseTutor || {};

(function () {
  // ✅ Ark 格式转换函数，仅 Ark 使用
  function formatForArk(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: [
        {
          type: "text",
          text: msg.content || ""
        }
      ]
    }));
  }

  async function askAssistant(userInput, scenario) {
    const config = window.JapaneseTutor.Config || {};
    const selectedModel = (document.getElementById('aiModel')?.value || 'GPT').toUpperCase();
//    console.log("✅ 当前模型选择：", selectedModel);

    // 构造基础消息结构ba
		const rawMessages = [
		  {
		    role: 'system',
		    content: `
		你是一个日语会话老师。你的任务是基于用户输入的日文句子或请求，进行自然真实的日语回应，并提供中文解释。请严格遵守以下格式输出：
		
		第一段：只用日语进行回答，模拟真实的日本人说话，不要添加任何中文或解释。
		
		第二段：空一行后开始中文解释，解释刚才的日文内容，包括语法、词汇含义和场景使用建议，使用 bullet 分点形式，每行前加 "•"，空行不需要加。
		
		第三段：推荐的下一句对话，先显示日语，然后是读音，最后是中文翻译。
		
		注意：
		- 请务必将日文回答和中文解释**严格分开段落**，不要中日文夹杂。
		- 中文解释请避免冗长，突出重点，保持清晰。
		- 输出结构如下：
		
		[日文回应]
		
		• 中文解释1
		• 中文解释2
		• 中文解释3
		
		[推荐的下一句对话]
		`
		  },
		  { role: 'user', content: userInput }
		];

    // 设置参数
    let apiKey = '', apiUrl = '', model = '', useBearer = false, messages = rawMessages;

    if (selectedModel === 'DEEPSEEK') {
      apiKey = config.DEEPSEEK_API_KEY;
      apiUrl = config.DEEPSEEK_API_URL;
      model = config.DEEPSEEK_API_MODEL;
      useBearer = true;
    } else if (selectedModel === 'ARK') {
      apiKey = config.ARK_API_KEY;
      apiUrl = config.ARK_API_URL;
      model = config.ARK_API_MODEL;
      messages = formatForArk(rawMessages);  // ✅ 仅 Ark 转格式
      useBearer = true;
    } else {
      apiKey = config.GPT_API_KEY;
      apiUrl = config.GPT_API_URL;
      model = config.GPT_API_MODEL;
    }

    if (!apiKey || !apiUrl || !model) {
      throw new Error("❌ API 配置不完整，请检查 config.js");
    }

    const body = {
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    if (useBearer) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['api-key'] = apiKey;
    }

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`❌ ${selectedModel} 请求失败：`, errorText);
        throw new Error(`请求失败：${res.status}`);
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content;

      if (!reply) throw new Error("未返回有效内容");

      return reply;
    } catch (err) {
      console.error("❌ assistant.js 出错：", err);
      throw err;
    }
  }

  window.JapaneseTutor.Assistant = { askAssistant };
})();