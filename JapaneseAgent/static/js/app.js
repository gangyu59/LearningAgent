// static/js/app.js

// ===== 全局变量 =====
window.scenes = [];
window.words = [];
window.stories = [];
window.grammars = [];

window.selectedSceneId = null;
window.selectedWordId = null;
window.selectedStoryId = null;
window.selectedGrammarId = null;

window.currentMode = "scene"; // 当前模式："scene" | "word" | "story"

// ===== 初始化应用 =====
async function init() {
    try {
        window.scenes = await window.loadJSON("data/scenes.json");
        window.words = await window.loadJSON("data/words.json");
        window.stories = await window.loadJSON("data/stories.json");
				window.grammars = await window.loadJSON("data/grammars.json");
      
			 window.toggleMode(window.currentMode); // 初始显示场景模式
    } catch (error) {
        console.error("初始化数据加载失败：", error);
        alert("数据加载失败，请检查 network 或 JSON 文件！");
    }
}

// 绑定切换事件
function bindEvents() {
    const toggleTitle = document.getElementById("ToggleTitle");        // 常用场景标题
    const toggleWordTitle = document.getElementById("ToggleWordTitle"); // 常用词汇标题
    const toggleStoryTitle = document.getElementById("ToggleStoryTitle"); // 故事汇集标题
		const toggleGrammarTitle = document.getElementById("ToggleGrammarTitle");

    if (toggleTitle) {
        toggleTitle.addEventListener("click", () => {
            window.currentMode = "word";
            window.toggleMode(window.currentMode);
        });
    }

    if (toggleWordTitle) {
        toggleWordTitle.addEventListener("click", () => {
            window.currentMode = "story";
            window.toggleMode(window.currentMode);
        });
    }

    if (toggleStoryTitle) {
        toggleStoryTitle.addEventListener("click", () => {
            window.currentMode = "grammar";
            window.toggleMode(window.currentMode);
        });
    }

		if (toggleGrammarTitle) {
		    toggleGrammarTitle.addEventListener("click", () => {
		        window.currentMode = "scene";
		        window.toggleMode(window.currentMode);
		    });
		}

    // 生成对话按钮
    const generateSceneBtn = document.getElementById("generateSceneBtn");
    if (generateSceneBtn) {
        generateSceneBtn.addEventListener("click", window.generateScene);
    }

    // 防止触摸穿透
    const containerIds = [
        "sceneDetails", "sceneListContainer",
        "wordDetails", "wordListContainer",
        "storyDetails", "storyListContainer",
				"grammarDetails", "grammarListContainer"
    ];
    containerIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("touchstart", e => e.stopPropagation(), { passive: false });
        }
    });
}

// ===== 启动应用 =====
function startApp() {
    bindEvents();
		bindToggleVisibilityOptions();
    init();
}

// ===== 等待DOM准备好后启动 =====
document.addEventListener("DOMContentLoaded", startApp);