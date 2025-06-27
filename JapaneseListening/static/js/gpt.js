// static/js/gpt.js

// 调用 GPT 生成新场景
window.generateScene = async function() {
    const descriptionInput = document.getElementById("newSceneDescription").value.trim();
    if (!descriptionInput) {
        alert("请输入新场景描述！");
        return;
    }

    const hourglass = document.getElementById('hourglass');
    const generateSceneBtn = document.getElementById('generateSceneBtn');
    hourglass.style.display = 'block';
    generateSceneBtn.disabled = true;

    const userMessage = `请根据以下描述生成一个日语对话，并为该场景生成一个最多不超过四个字的中文标题。返回的 JSON 格式应符合以下结构：
{
    "id": 1,
    "title": "场景标题",
    "description": "场景描述",
    "dialog": [
        { "speaker": "A", "text": "对话文本1", "romaji": "罗马音1" },
        { "speaker": "B", "text": "对话文本2", "romaji": "罗马音2" }
    ],
    "translation": [
        "A: 中文翻译1",
        "B: 中文翻译2"
    ]
}
请直接返回 JSON 内容，不要添加解释文字或代码块。对话最多6句。
描述: ${descriptionInput}`;

    const messages = [
        { role: "system", content: "你是一个生成日语学习对话的助手。" },
        { role: "user", content: userMessage }
    ];

    try {
        const response = await fetch('https://gpt4-111-us.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-02-01', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': '84fba46b577b46f58832ef36527e41d4' // 请替换成你的实际API KEY
            },
            body: JSON.stringify({
                messages: messages,
                max_tokens: 1000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            console.error("Error fetching data from GPT:", response.status, response.statusText);
            throw new Error('Error fetching data from OpenAI');
        }

        const data = await response.json();
        const rawContent = data.choices[0].message.content;

        let generatedScene;
        try {
            const cleanedContent = window.cleanGPTContent(rawContent);
            generatedScene = JSON.parse(cleanedContent);

            if (!window.validateSceneFormat(generatedScene)) {
                console.error("Invalid scene format:", generatedScene);
                alert("生成的场景格式不正确！");
                return;
            }

            window.displayScene(generatedScene);
        } catch (error) {
            console.error("Error parsing or validating the scene:", error);
            alert("生成场景失败，返回的数据格式不正确！");
        }
    } catch (error) {
        console.error("生成场景失败：", error);
        alert("生成场景失败，请检查网络或 API 配置。");
    } finally {
        hourglass.style.display = 'none';
        generateSceneBtn.disabled = false;
    }
};