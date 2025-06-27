window.beginners = [];
window.intermediates = [];
window.advanceds = [];

window.selectedBeginnerId = null;
window.selectedIntermediateId = null;
window.selectedAdvancedId = null;

window.currentMode = "beginner"; // 当前模式："beginner" | "intermediate" | "advanced"
window.selectedGrammarId = null;

// ========== 初始化 ==========
async function init() {
  try {
    window.beginners = await window.loadJSON("data/grammar_beginner.json");
    window.intermediates = await window.loadJSON("data/grammar_intermediate.json");
    window.advanceds = await window.loadJSON("data/grammar_advanced.json");

    window.toggleMode(window.currentMode);
  } catch (err) {
    console.error("❌ 数据加载失败", err);
    alert("加载语法数据失败，请检查 JSON 文件或网络！");
  }
}

// ========== 模式切换 ==========
window.toggleMode = function (mode) {
  window.currentMode = mode;

  const allContainers = [
    "beginnerListContainer", "beginnerDetails",
    "intermediateListContainer", "intermediateDetails",
    "advancedListContainer", "advancedDetails"
  ];

  allContainers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  if (mode === "beginner") {
    renderList("beginnerList", window.beginners, "beginner");
    document.getElementById("beginnerListContainer").style.display = "block";
    document.getElementById("beginnerDetails").style.display = "block";
  } else if (mode === "intermediate") {
    renderList("intermediateList", window.intermediates, "intermediate");
    document.getElementById("intermediateListContainer").style.display = "block";
    document.getElementById("intermediateDetails").style.display = "block";
  } else if (mode === "advanced") {
    renderList("advancedList", window.advanceds, "advanced");
    document.getElementById("advancedListContainer").style.display = "block";
    document.getElementById("advancedDetails").style.display = "block";
  }
};

// ========== 渲染语法点列表 ==========
function renderList(listId, items, level) {
  const ul = document.getElementById(listId);
  ul.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item.title;
    li.onclick = () => {
      window.selectedGrammarId = item.id;
      window.renderGrammarDetails(item, level);
    };
    ul.appendChild(li);
  });

  // 默认显示第一个
  if (items.length > 0) {
    window.selectedGrammarId = items[0].id;
    window.renderGrammarDetails(items[0], level);
  }
}

// ========== 模式按钮事件绑定 ==========
function bindEvents() {
  const toggleBeginnerTitle = document.getElementById("ToggleBeginnerTitle");
  const toggleIntermediateTitle = document.getElementById("ToggleIntermediateTitle");
  const toggleAdvancedTitle = document.getElementById("ToggleAdvancedTitle");

  if (toggleBeginnerTitle) {
    toggleBeginnerTitle.addEventListener("click", () => {
      window.toggleMode("intermediate");
    });
  }

  if (toggleIntermediateTitle) {
    toggleIntermediateTitle.addEventListener("click", () => {
      window.toggleMode("advanced");
    });
  }

  if (toggleAdvancedTitle) {
    toggleAdvancedTitle.addEventListener("click", () => {
      window.toggleMode("beginner");
    });
  }

  const generateSceneBtn = document.getElementById("generateSceneBtn");
  if (generateSceneBtn) {
    generateSceneBtn.addEventListener("click", window.generateScene);
  }

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

// ========== 可见性 & 语速控制绑定 ==========
function bindToggleVisibilityOptions() {
  const modes = ["Beginner", "Intermediate", "Advanced"];

  modes.forEach(mode => {
    const jpToggle = document.getElementById(`toggle${mode}Japanese`);
    const trToggle = document.getElementById(`toggle${mode}Translation`);
    const rateSlider = document.getElementById(`speechRate${mode}`);
    const rateValue = document.getElementById(`speechRateValue${mode}`);

    if (jpToggle && trToggle) {
      jpToggle.addEventListener("change", applyVisibility);
      trToggle.addEventListener("change", applyVisibility);
    }

    if (rateSlider && rateValue) {
      rateSlider.addEventListener("input", () => {
        rateValue.textContent = rateSlider.value;
      });
    }
  });
}

window.getSpeechRate = function (level) {
  const rateInput = document.getElementById(`speechRate${capitalize(level)}`);
  return rateInput ? parseFloat(rateInput.value) : 1.0;
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

window.applyVisibility = function () {
  const romajis = document.querySelectorAll(".romaji");
  const translations = document.querySelectorAll(".translation");

  romajis.forEach(el => {
    el.style.display = document.querySelector(`#toggle${capitalize(window.currentMode)}Japanese`).checked ? "inline" : "none";
  });

  translations.forEach(el => {
    el.style.display = document.querySelector(`#toggle${capitalize(window.currentMode)}Translation`).checked ? "inline" : "none";
  });
};

// ========== 启动 ==========
function startApp() {
  bindEvents();
  bindToggleVisibilityOptions();
  init();
}

document.addEventListener("DOMContentLoaded", startApp);