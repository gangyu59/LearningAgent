// static/js/render.js

// 切换模式：场景 / 词汇 / 故事 / 语法
window.toggleMode = function(mode) {
    // 所有相关元素
    const sceneElements = ["sceneListContainer", "sceneDetails"];
    const wordElements = ["wordListContainer", "wordDetails"];
    const storyElements = ["storyListContainer", "storyDetails"];
		const grammarElements = ["grammarListContainer", "grammarDetails"];

    // 先隐藏所有
    [...sceneElements, ...wordElements, ...storyElements, ...grammarElements].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = "none";
        }
    });

    // 然后只显示对应的部分
    if (mode === "scene") {
        document.getElementById("ToggleTitle").textContent = "常用场景";
        window.renderSceneList();
        sceneElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });
    } else if (mode === "word") {
        document.getElementById("ToggleTitle").textContent = "常用词汇";
        window.renderWordList();
        wordElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });
    } else if (mode === "story") {
        document.getElementById("ToggleTitle").textContent = "故事汇集";
        window.renderStoryList();
        storyElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });
    } else if (mode === "grammar") {
		    document.getElementById("ToggleTitle").textContent = "常用语法";
		    window.renderGrammarList();
		    ["grammarListContainer", "grammarDetails"].forEach(id => {
		        const el = document.getElementById(id);
		        if (el) el.style.display = "block";
		    });
		}
};

// 渲染场景列表
window.renderSceneList = function() {
    const sceneList = document.getElementById("sceneList");
    sceneList.innerHTML = "";

    window.scenes.forEach(scene => {
        const li = document.createElement("li");
        li.textContent = scene.title;
        li.dataset.id = scene.id;
        li.classList.remove("selected");
        li.addEventListener("click", () => {
            window.selectedSceneId = scene.id;
            window.highlightSelectedScene(li);
            window.displayScene(scene);
        });
        sceneList.appendChild(li);
    });
};

// 渲染词汇列表
window.renderWordList = function() {
    const wordList = document.getElementById("wordList");
    wordList.innerHTML = "";

    window.words.forEach(word => {
        const li = document.createElement("li");
        li.textContent = word.title;
        li.dataset.id = word.id;
        li.classList.remove("selected");
        li.addEventListener("click", () => {
            window.selectedWordId = word.id;
            window.highlightSelectedWord(li);
            window.displayWord(word);
        });
        wordList.appendChild(li);
    });
};

// 高亮选中的场景
window.highlightSelectedScene = function(selectedLi) {
    document.querySelectorAll("#sceneList li").forEach(li => li.classList.remove("selected"));
    selectedLi.classList.add("selected");
};

// 高亮选中的词汇
window.highlightSelectedWord = function(selectedLi) {
    document.querySelectorAll("#wordList li").forEach(li => li.classList.remove("selected"));
    selectedLi.classList.add("selected");
};

// 显示选中的场景详细内容
window.displayScene = function(scene) {
    const titleElem = document.getElementById("sceneTitle");

    // 清空标题区域（防止按钮重复）
    titleElem.innerHTML = "";

    // 插入标题文本
    const span = document.createElement("span");
    span.textContent = scene.title;
    titleElem.appendChild(span);

		// 插入“朗读全部”按钮（toggle）
		const readAllBtn = document.createElement("button");
		readAllBtn.id = "readAllBtn";
		readAllBtn.textContent = "朗读全部";
		readAllBtn.className = "play-audio";
		readAllBtn.style.marginLeft = "10px";
		readAllBtn.dataset.status = "idle"; // idle | playing
		
		readAllBtn.addEventListener("click", () => {
		    if (readAllBtn.dataset.status === "idle") {
		        readAllBtn.textContent = "停止朗读";
		        readAllBtn.style.backgroundColor = "#dc3545"; // Bootstrap 红色
		        readAllBtn.dataset.status = "playing";
		        window.readAllSceneText(scene.dialog, () => {
		            // 朗读完成后恢复按钮
		            readAllBtn.textContent = "朗读全部";
		            readAllBtn.style.backgroundColor = "#007bff";
		            readAllBtn.dataset.status = "idle";
		        });
		    } else {
		        window.speechSynthesis.cancel(); // 停止朗读
		        readAllBtn.textContent = "朗读全部";
		        readAllBtn.style.backgroundColor = "#007bff";
		        readAllBtn.dataset.status = "idle";
		    }
		});
		titleElem.appendChild(readAllBtn);

    // 设置场景描述
    document.getElementById("sceneDescription").textContent = scene.description;

    // 渲染对话内容
    const dialogDiv = document.getElementById("sceneDialog");
    dialogDiv.innerHTML = scene.dialog.map((d, index) => `
        <div class="dialog-entry">
            <p><strong>${d.speaker}:</strong> ${d.text} <br>
            <em class="romaji">${d.romaji}</em> <br>
            <span class="translation">${scene.translation[index]}</span></p>
            <button class="play-audio" data-index="${index}" data-gender="${d.speaker === 'A' ? 'male' : 'female'}">
                🔊 朗读
            </button>
        </div>
    `).join("");

    // 隐藏翻译框（如果有）
    const translationDiv = document.getElementById("sceneTranslation");
    if (translationDiv) {
        translationDiv.style.display = "none";
    }

    // 绑定所有句子的朗读按钮
    window.bindPlayAudioButtons("sceneDialog", scene.dialog);
		setTimeout(window.applyVisibility, 50);
};


// 显示选中的词汇详细内容
window.displayWord = function(word) {
    const titleElem = document.getElementById("wordTitle");

    // 清空标题区域（防止按钮重复）
    titleElem.innerHTML = "";

    // 插入标题文本
    const span = document.createElement("span");
    span.textContent = word.title;
    titleElem.appendChild(span);

		// 插入“朗读全部”按钮（toggle）
		const readAllWordBtn = document.createElement("button");
		readAllWordBtn.id = "readAllWordBtn";
		readAllWordBtn.textContent = "朗读全部";
		readAllWordBtn.className = "play-audio";
		readAllWordBtn.style.marginLeft = "10px";
		readAllWordBtn.dataset.status = "idle"; // idle | playing
		
		readAllWordBtn.addEventListener("click", () => {
		    if (readAllWordBtn.dataset.status === "idle") {
		        readAllWordBtn.textContent = "停止朗读";
		        readAllWordBtn.style.backgroundColor = "#dc3545"; // Bootstrap 红色
		        readAllWordBtn.dataset.status = "playing";
		        window.readAllSceneText(word.dialog, () => {
		            // 朗读完成后恢复按钮
		            readAllWordBtn.textContent = "朗读全部";
		            readAllWordBtn.style.backgroundColor = "#007bff";
		            readAllWordBtn.dataset.status = "idle";
		        });
		    } else {
		        window.speechSynthesis.cancel(); // 停止朗读
		        readAllWordBtn.textContent = "朗读全部";
		        readAllWordBtn.style.backgroundColor = "#007bff";
		        readAllWordBtn.dataset.status = "idle";
		    }
		});
		titleElem.appendChild(readAllWordBtn);

    // 设置场景描述
    document.getElementById("wordDescription").textContent = word.description;

    // 渲染对话内容
    const dialogDiv = document.getElementById("wordDialog");
    dialogDiv.innerHTML = word.dialog.map((d, index) => `
        <div class="dialog-entry">
            <p><strong>${d.speaker}:</strong> ${d.text} <br>
            <em class="romaji">${d.romaji}</em> <br>
            <span class="translation">${word.translation[index]}</span></p>
            <button class="play-audio" data-index="${index}" data-gender="${d.speaker === 'A' ? 'male' : 'female'}">
                🔊 朗读
            </button>
        </div>
    `).join("");

    // 隐藏翻译框（如果有）
    const translationDiv = document.getElementById("wordTranslation");
    if (translationDiv) {
        translationDiv.style.display = "none";
    }

    // 绑定所有句子的朗读按钮
    window.bindPlayAudioButtons("wordDialog", word.dialog);
		setTimeout(window.applyVisibility, 50);
};

// 渲染故事列表
window.renderStoryList = function() {
    const storyList = document.getElementById("storyList");
    storyList.innerHTML = "";

    window.stories.forEach(story => {
        const li = document.createElement("li");
        li.textContent = story.title;
        li.dataset.id = story.id;
        li.classList.remove("selected");
        li.addEventListener("click", () => {
            window.selectedStoryId = story.id;
            window.highlightSelectedStory(li);
            window.displayStory(story);
        });
        storyList.appendChild(li);
    });
};

// 高亮选中的故事
window.highlightSelectedStory = function(selectedLi) {
    document.querySelectorAll("#storyList li").forEach(li => li.classList.remove("selected"));
    selectedLi.classList.add("selected");
};

// 显示选中的故事内容
window.displayStory = function(story) {
    const titleElem = document.getElementById("storyTitle");

    // 清空标题区域（防止重复按钮）
    titleElem.innerHTML = "";

    // 插入标题文字
    const span = document.createElement("span");
    span.textContent = story.title;
    titleElem.appendChild(span);

    // 插入朗读全部按钮（toggle）
    const readAllBtn = document.createElement("button");
    readAllBtn.id = "readAllStoryBtn";
    readAllBtn.textContent = "朗读全部";
    readAllBtn.className = "play-audio";
    readAllBtn.style.marginLeft = "10px";
    readAllBtn.dataset.status = "idle";

    readAllBtn.addEventListener("click", () => {
        if (readAllBtn.dataset.status === "idle") {
            readAllBtn.textContent = "停止朗读";
            readAllBtn.style.backgroundColor = "#dc3545"; // 红色
            readAllBtn.dataset.status = "playing";
            window.readAllSceneText(story.dialog, () => {
                readAllBtn.textContent = "朗读全部";
                readAllBtn.style.backgroundColor = "#007bff";
                readAllBtn.dataset.status = "idle";
            });
        } else {
            window.speechSynthesis.cancel();
            readAllBtn.textContent = "朗读全部";
            readAllBtn.style.backgroundColor = "#007bff";
            readAllBtn.dataset.status = "idle";
        }
    });

    titleElem.appendChild(readAllBtn);

    // 设置故事简介
  document.getElementById("storyDescription").textContent = story.description;

    // 渲染正文
    const dialogDiv = document.getElementById("storyDialog");
    dialogDiv.innerHTML = story.dialog.map((d, index) => `
        <div class="dialog-entry">
            <p><strong>${d.speaker}:</strong> ${d.text}<br>
            <em class="romaji">${d.romaji}</em><br>
            <span class="translation">${story.translation[index]}</span></p>
        </div>
    `).join("");

    // 隐藏 storyTranslation（未来扩展用）
    const translationDiv = document.getElementById("storyTranslation");
    if (translationDiv) translationDiv.style.display = "none";
		setTimeout(window.applyVisibility, 50);
};

// 渲染语法列表
window.renderGrammarList = function () {
    const grammarList = document.getElementById("grammarList");
    grammarList.innerHTML = "";

    window.grammars.forEach(grammar => {
        const li = document.createElement("li");
        li.textContent = grammar.title;
        li.dataset.id = grammar.id;
        li.classList.remove("selected");
        li.addEventListener("click", () => {
            window.selectedGrammarId = grammar.id;
            window.highlightSelectedGrammar(li);
            window.displayGrammar(grammar);
        });
        grammarList.appendChild(li);
    });
};

window.highlightSelectedGrammar = function (selectedLi) {
    document.querySelectorAll("#grammarList li").forEach(li => li.classList.remove("selected"));
    selectedLi.classList.add("selected");
};

window.displayGrammar = function (grammar) {
    const titleElem = document.getElementById("grammarTitle");
    titleElem.innerHTML = "";

    const span = document.createElement("span");
    span.textContent = grammar.title;
    titleElem.appendChild(span);

    const readAllBtn = document.createElement("button");
    readAllBtn.id = "readAllGrammarBtn";
    readAllBtn.textContent = "朗读全部";
    readAllBtn.className = "play-audio";
    readAllBtn.style.marginLeft = "10px";
    readAllBtn.dataset.status = "idle";

    readAllBtn.addEventListener("click", () => {
        if (readAllBtn.dataset.status === "idle") {
            readAllBtn.textContent = "停止朗读";
            readAllBtn.style.backgroundColor = "#dc3545";
            readAllBtn.dataset.status = "playing";
            window.readAllSceneText(grammar.dialog, () => {
                readAllBtn.textContent = "朗读全部";
                readAllBtn.style.backgroundColor = "#007bff";
                readAllBtn.dataset.status = "idle";
            });
        } else {
            window.speechSynthesis.cancel();
            readAllBtn.textContent = "朗读全部";
            readAllBtn.style.backgroundColor = "#007bff";
            readAllBtn.dataset.status = "idle";
        }
    });
    titleElem.appendChild(readAllBtn);

    document.getElementById("grammarDescription").textContent = grammar.description;

    const dialogDiv = document.getElementById("grammarDialog");
    dialogDiv.innerHTML = grammar.dialog.map((d, index) => `
        <div class="dialog-entry">
            <p><strong>${d.speaker}:</strong> ${d.text}<br>
            <em class="romaji">${d.romaji}</em><br>
            <span class="translation">${grammar.translation[index]}</span></p>
            <button class="play-audio" data-index="${index}" data-gender="${d.speaker === 'A' ? 'male' : 'female'}">
                🔊 朗读
            </button>
        </div>
    `).join("");

    const translationDiv = document.getElementById("grammarTranslation");
    if (translationDiv) translationDiv.style.display = "none";

    window.bindPlayAudioButtons("grammarDialog", grammar.dialog);
    setTimeout(window.applyVisibility, 50);
};

window.applyVisibility = function () {
    const mode = window.currentMode;  // scene | word | story

    let showRomaji = true;
    let showTranslation = true;

    if (mode === "scene") {
        showRomaji = document.querySelector("#toggleRomaji")?.checked ?? true;
        showTranslation = document.querySelector("#toggleTranslation")?.checked ?? true;
    } else if (mode === "story") {
        showRomaji = document.querySelector("#toggleStoryRomaji")?.checked ?? true;
        showTranslation = document.querySelector("#toggleStoryTranslation")?.checked ?? true;
    } else if (mode === "word") {
				showRomaji = document.querySelector("#toggleWordRomaji")?.checked ?? true;
        showTranslation = document.querySelector("#toggleWordTranslation")?.checked ?? true;
    } else if (mode === "grammar") {
		    showRomaji = document.querySelector("#toggleGrammarRomaji")?.checked ?? true;
		    showTranslation = document.querySelector("#toggleGrammarTranslation")?.checked ?? true;
		}

    const romajiElems = document.querySelectorAll(".romaji");
    const translationElems = document.querySelectorAll(".translation");

    romajiElems.forEach(el => {
        el.style.display = showRomaji ? "block" : "none";
    });

    translationElems.forEach(el => {
        el.style.display = showTranslation ? "block" : "none";
    });
};

function bindToggleVisibilityOptions() {
    const allCheckboxes = document.querySelectorAll(
        "#toggleRomaji, #toggleTranslation, #toggleStoryRomaji, #toggleStoryTranslation,#toggleWordRomaji, #toggleWordTranslation, #toggleGrammarRomaji, #toggleGrammarTranslation"
    );

    allCheckboxes.forEach(cb => {
        cb.addEventListener("change", window.applyVisibility);
    });

    window.applyVisibility(); // 页面加载时也执行一次
}
