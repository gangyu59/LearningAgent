window.vocabList = [];
window.selectedVocab = null;

// 加载本地数据 + 用户存储数据
async function init() {
  const saved = localStorage.getItem("myVocabList");
  const builtIn = await window.loadJSON("data/vocab.json");

  window.vocabList = saved ? JSON.parse(saved) : builtIn;
  renderVocabList();
}

// 渲染左侧生词列表
function renderVocabList() {
  const ul = document.getElementById("vocabList");
  ul.innerHTML = "";

  window.vocabList.forEach((item, index) => {
    const li = document.createElement("li");
    li.textContent = item.kana;
    li.className = item.id === window.selectedVocab?.id ? "selected" : "";
    li.addEventListener("click", () => {
      window.selectedVocab = item;
      renderVocabDetails(item);
      renderVocabList(); // 高亮刷新
    });
    ul.appendChild(li);
  });
}

// 渲染右侧详细内容
function renderVocabDetails(item) {
  // 设置标题和词义
  document.getElementById("vocabTitle").textContent = item.kana || "";
  document.getElementById("vocabMeaning").textContent = item.translation || "请填写中文含义";

  // 获取是否显示罗马音/翻译的勾选状态
  const jpToggle = document.getElementById("toggleRomaji")?.checked;
  const zhToggle = document.getElementById("toggleTranslation")?.checked;

  // 渲染例句
  const container = document.getElementById("vocabDialog");
  container.innerHTML = "";

  (item.examples || []).forEach((ex, index) => {
    const div = document.createElement("div");
    div.className = "dialog-entry";

    const sentence = `
      <p><strong>例句${index + 1}：</strong> ${ex.ja || "例句缺失"}</p>
      ${jpToggle ? `<p class="romaji">${ex.romaji || ""}</p>` : ""}
      ${zhToggle ? `<p class="translation">${ex.zh || ""}</p>` : ""}
      <button class="play-audio" data-index="${index}" data-gender="A">朗读</button>
    `;
    div.innerHTML = sentence;
    container.appendChild(div);
  });

  // 绑定朗读按钮
  if (typeof window.bindPlayAudioButtons === "function") {
    window.bindPlayAudioButtons("vocabDialog", item.examples || []);
  }

  // 联想记忆
  document.getElementById("vocabMnemonic").textContent = item.association || "无联想内容";

  // 词汇网络
  const networkDiv = document.getElementById("vocabNetwork");
  networkDiv.innerHTML = (item.network || []).map(word => `
    <span class="word-link" onclick="jumpToWord('${word}')">${word}</span>
  `).join(" ") || "无";

  // 近义词 / 反义词（注意用 vocabSynAnt）
  const syn = (item.synonyms || []).map(w => `<span class="word-link" onclick="jumpToWord('${w}')">${w}</span>`).join(" ") || "无";
  const ant = (item.antonyms || []).map(w => `<span class="word-link" onclick="jumpToWord('${w}')">${w}</span>`).join(" ") || "无";
  document.getElementById("vocabSynAnt").innerHTML = `近义词：${syn}<br>反义词：${ant}`;
}

// 跳转到词条
window.jumpToWord = function(wordKana) {
  const match = window.vocabList.find(v => v.kana === wordKana);
  if (match) {
    window.selectedVocab = match;
    renderVocabDetails(match);
    renderVocabList();
    return;
  }

  if (!confirm(`词条 "${wordKana}" 不在词典中，是否使用 GPT 自动生成？`)) return;

  window.generateVocabByARK(wordKana, function(vocab) {
    if (!vocab || !vocab.kana) {
      alert("⚠️ GPT 未返回有效内容");
      return;
    }

    window.vocabList.unshift(vocab);
    window.selectedVocab = vocab;
    renderVocabDetails(vocab);
    renderVocabList();
    saveLocal();
  });
};

// 添加到词库
window.addVocab = function () {
  const input = document.getElementById("newSceneDescription");
  const kana = input.value.trim();
  if (!kana) return;

  if (window.vocabList.some(v => v.kana === kana)) {
    alert("生词已存在！");
    return;
  }

  const newWord = {
    id: Date.now(),
    kana,
    romaji: "",
    translation: "",
    examples: [],
    association: "",
    network: [],
    synonyms: [],
    antonyms: []
  };

  window.vocabList.unshift(newWord);
  window.selectedVocab = newWord;
  renderVocabList();
  renderVocabDetails(newWord);
  saveLocal();
  input.value = "";
};

function saveLocal() {
  localStorage.setItem("myVocabList", JSON.stringify(window.vocabList));
}

// 可见性绑定
function bindVisibilityToggles() {
  document.querySelectorAll("#toggleRomaji, #toggleTranslation").forEach(cb => {
    cb.addEventListener("change", () => {
      if (window.selectedVocab) renderVocabDetails(window.selectedVocab);
    });
  });
}

// 入口
document.addEventListener("DOMContentLoaded", () => {
  bindVisibilityToggles();
  init();

  const addBtn = document.getElementById("generateSceneBtn");
  if (addBtn) addBtn.addEventListener("click", window.addVocab);
});

// 搜索并处理词条
window.searchVocab = function () {
  const input = document.getElementById("searchWord");
  const keyword = input.value.trim();
  if (!keyword) return;

  const found = window.vocabList.find(v => v.kana.includes(keyword));
  if (found) {
    window.selectedVocab = found;
    renderVocabDetails(found);
    renderVocabList();
  } else {
    if (confirm(`词条 "${keyword}" 不在词典中，是否使用 GPT 自动生成？`)) {
      window.generateVocabByARK(keyword, vocab => {
        window.addVocabEntryToList(vocab);
      });
    }
  }
};

// 页面初始化绑定按钮
document.addEventListener("DOMContentLoaded", () => {
  bindVisibilityToggles();
  init();

  const searchBtn = document.getElementById("searchBtn");
  if (searchBtn) searchBtn.addEventListener("click", window.searchVocab);
});

// 删除当前词条
window.deleteCurrentVocab = function () {
  if (!window.selectedVocab) return;

  const confirmDelete = confirm(`是否删除词条「${window.selectedVocab.kana}」？`);
  if (!confirmDelete) return;

  // 从词表中删除
  window.vocabList = window.vocabList.filter(v => v.kana !== window.selectedVocab.kana);
  localStorage.setItem("myVocabList", JSON.stringify(window.vocabList));

  // 清空右侧显示
  window.selectedVocab = null;
  document.getElementById("vocabTitle").textContent = "";
  document.getElementById("vocabMeaning").textContent = "";
  document.getElementById("vocabDialog").innerHTML = "";
  document.getElementById("vocabMnemonic").textContent = "";
  document.getElementById("vocabNetwork").innerHTML = "";
  document.getElementById("vocabSynonyms").innerHTML = "";
  document.getElementById("vocabAntonyms").innerHTML = "";

  renderVocabList();
};

// 页面加载时绑定按钮事件
document.addEventListener("DOMContentLoaded", () => {
  const delBtn = document.getElementById("deleteVocabBtn");
  if (delBtn) delBtn.addEventListener("click", window.deleteCurrentVocab);
});