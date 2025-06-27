window.JapaneseTutor = window.JapaneseTutor || {};

(function () {
  async function askAssistant(userInput, scenario) {
    const config = window.JapaneseTutor.Config || {};
    const { GPT_API_KEY, GPT_API_URL } = config;

    if (!GPT_API_KEY || !GPT_API_URL) {
      console.error("❌ API 配置未加载");
      throw new Error("API 配置未加载");
    }

    const systemPrompt = `你是一个日语对话老师。请根据用户选择的场景 "${scenario}" 与他进行自然真实的日语对话，并在回复中包含中文解释（解释语法、词汇和句子含义）。`;

    const body = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput }
      ],
      temperature: 0.7,
      max_tokens: 1000
    };

    try {
      const res = await fetch(GPT_API_URL, {
        method: 'POST',
        headers: {
          'api-key': GPT_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ Azure OpenAI 请求失败：", errorText);
        throw new Error("请求失败，状态码：" + res.status);
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