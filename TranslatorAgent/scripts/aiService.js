window.AIService = window.AIService || {};

(function () {
  function formatForArk(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: [{ type: "text", text: msg.content }]
    }));
  }

  async function callAI({ messages, modelName }) {
    const config = window.JapaneseTutor?.Config || {};
    let apiKey = '', apiUrl = '', model = '', useBearer = false;

    if (modelName === 'GPT') {
      apiKey = config.GPT_API_KEY;
      apiUrl = config.GPT_API_URL;
      model = config.GPT_API_MODEL;
    } else if (modelName === 'DEEPSEEK') {
      apiKey = config.DEEPSEEK_API_KEY;
      apiUrl = config.DEEPSEEK_API_URL;
      model = config.DEEPSEEK_API_MODEL;
      useBearer = true;
    } else if (modelName === 'ARK') {
      apiKey = config.ARK_API_KEY;
      apiUrl = config.ARK_API_URL;
      model = config.ARK_API_MODEL;
      messages = formatForArk(messages);
      useBearer = true;
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(useBearer ? { Authorization: `Bearer ${apiKey}` } : { 'api-key': apiKey })
    };

    const body = {
      model: model,
      messages,
      temperature: 0.6
    };

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error("AI 无返回");
    }

    return data.choices[0].message.content;
  }

  window.AIService.callAI = callAI;
})();