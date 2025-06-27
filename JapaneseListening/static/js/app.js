// /JapaneseListening/static/js/app.js

window.beginners = [];
window.intermediates = [];
window.advanceds = [];

window.selectedBeginnerId = null;
window.selectedIntermediateId = null;
window.selectedAdvancedId = null;

window.currentMode = "beginner"; // 当前模式："beginner" | "intermediate" | "advanced"

window.currentLevel = "beginner";
window.selectedListeningId = null;

// ===== 初始化应用 =====
async function init() {
    try {
        window.beginners = await window.loadJSON("data/beginner.json");
        window.intermediates = await window.loadJSON("data/intermediate.json");
        window.advanceds = await window.loadJSON("data/advanced.json");
			 window.toggleMode(window.currentMode); // 初始显示场景模式
    } catch (error) {
        console.error("初始化数据加载失败：", error);
        alert("数据加载失败，请检查 network 或 JSON 文件！");
    }
}

// 绑定切换事件
function bindEvents() {
    const toggleBeginnerTitle = document.getElementById("ToggleBeginnerTitle");        // 初级标题
    const toggleIntermediateTitle = document.getElementById("ToggleIntermediateTitle"); // 中级标题
    const toggleAdvancedTitle = document.getElementById("ToggleAdvancedTitle"); // 高级标题
		
    if (toggleBeginnerTitle) {
        toggleBeginnerTitle.addEventListener("click", () => {
            window.currentMode = "intermediate";
            window.toggleMode(window.currentMode);
        });
    }

    if (toggleIntermediateTitle) {
        toggleIntermediateTitle.addEventListener("click", () => {
            window.currentMode = "advanced";
            window.toggleMode(window.currentMode);
        });
    }

    if (toggleAdvancedTitle) {
        toggleAdvancedTitle.addEventListener("click", () => {
            window.currentMode = "beginner";
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
        "beginnerDetails", "beginnerListContainer",
        "intermediateDetails", "intermediateListContainer",
        "advancedDetails", "advancedListContainer"
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
