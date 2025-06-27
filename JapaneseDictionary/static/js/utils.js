// static/js/utils.js

// 加载本地 JSON 文件
window.loadJSON = async function(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load ${path}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        alert("无法加载数据，请检查路径或文件内容。");
    }
};

// 清理 GPT 返回内容，提取干净的 JSON
window.cleanGPTContent = function(rawContent) {
    let content = rawContent.trim();

    if (content.startsWith("```json")) {
        content = content.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (content.startsWith("```")) {
        content = content.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const firstBraceIndex = content.indexOf('{');
    if (firstBraceIndex > 0) {
        content = content.slice(firstBraceIndex);
    }

    return content;
};

// 验证场景格式是否正确
window.validateSceneFormat = function(scene) {
    if (!scene || typeof scene !== 'object') return false;
    if (typeof scene.title !== "string" || scene.title.trim() === "") return false;
    if (typeof scene.description !== "string" || scene.description.trim() === "") return false;
    if (!Array.isArray(scene.dialog) || scene.dialog.length === 0) return false;
    if (!scene.dialog.every(d => d.speaker && typeof d.speaker === "string" &&
                                  d.text && typeof d.text === "string" &&
                                  d.romaji && typeof d.romaji === "string")) {
        return false;
    }
    if (!Array.isArray(scene.translation) || scene.translation.length === 0) return false;

    return true;
};

// 打印当前可用语音（调试用）
window.logAvailableVoices = function() {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
        console.warn("No voices available.");
        return;
    }
    // 可选：打印出来调试
    // console.log("Available voices:", voices.map(v => ({ name: v.name, lang: v.lang })));
};

// 语音列表更新时打印一次（调试）
window.speechSynthesis.onvoiceschanged = () => {
//    console.log("Voices updated.");
    window.logAvailableVoices();
};