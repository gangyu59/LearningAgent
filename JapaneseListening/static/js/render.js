// static/js/render.js

// 切换模式：初级 / 中级 / 高级 
window.toggleMode = function(mode) {
    // 所有相关元素
    const beginnerElements = ["beginnerListContainer", "beginnerDetails"];
    const intermediateElements = ["intermediateListContainer", "intermediateDetails"];
    const advancedElements = ["advancedListContainer", "advancedDetails"];
		

    // 先隐藏所有
    [...beginnerElements, ...intermediateElements, ...advancedElements].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = "none";
        }
    });

    // 然后只显示对应的部分
    if (mode === "beginner") {
        document.getElementById("ToggleBeginnerTitle").textContent = "初级听力";
        window.renderBeginnerList();
        beginnerElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });
    } else if (mode === "intermediate") {
        document.getElementById("ToggleBeginnerTitle").textContent = "中级听力";
        window.renderIntermediateList();
        intermediateElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });
    } else if (mode === "advanced") {
        document.getElementById("ToggleBeginnerTitle").textContent = "高级听力";
        window.renderAdvancedList();
        advancedElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });
			} 
};

// 渲染初级列表
window.renderBeginnerList = function() {
    const beginnerList = document.getElementById("beginnerList");
    beginnerList.innerHTML = "";

    window.beginners.forEach(beginner => {
        const li = document.createElement("li");
        li.textContent = beginner.title;
        li.dataset.id = beginner.id;
        li.classList.remove("selected");
        li.addEventListener("click", () => {
            window.selectedBeginnerId = beginner.id;
            window.highlightSelectedBeginner(li);
            window.displayBeginner(beginner);
        });
        beginnerList.appendChild(li);
    });
};

// 渲染中级列表
window.renderIntermediateList = function() {
    const intermediateList = document.getElementById("intermediateList");
    intermediateList.innerHTML = "";

    window.intermediates.forEach(intermediate => {
        const li = document.createElement("li");
        li.textContent = intermediate.title;
        li.dataset.id = intermediate.id;
        li.classList.remove("selected");
        li.addEventListener("click", () => {
            window.selectedIntermediateId = intermediate.id;
            window.highlightSelectedIntermediate(li);
            window.displayIntermediate(intermediate);
        });
        intermediateList.appendChild(li);
    });
};

// 高亮选中的初级
window.highlightSelectedBeginner = function(selectedLi) {
    document.querySelectorAll("#beginnerList li").forEach(li => li.classList.remove("selected"));
    selectedLi.classList.add("selected");
};

// 高亮选中的词汇
window.highlightSelectedIntermediate = function(selectedLi) {
    document.querySelectorAll("#intermediateList li").forEach(li => li.classList.remove("selected"));
    selectedLi.classList.add("selected");
};

// 显示选中的初级详细内容
window.displayBeginner = function(beginner) {
    const titleElem = document.getElementById("beginnerTitle");

    // 清空标题区域（防止按钮重复）
    titleElem.innerHTML = "";

    // 插入标题文本
    const span = document.createElement("span");
    span.textContent = beginner.title;
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
		        window.readAllSceneText(beginner.dialog, () => {
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

    // 设置初级描述
    document.getElementById("beginnerDescription").textContent = beginner.description;

    // 渲染初级内容
    const dialogDiv = document.getElementById("beginnerDialog");
    dialogDiv.innerHTML = beginner.dialog.map((d, index) => `
        <div class="dialog-entry">
						<p><strong>${d.speaker}:</strong> <span class="text">${d.text}</span> <br>
            <em class="romaji">${d.romaji}</em> <br>
            <span class="translation">${beginner.translation[index]}</span></p>
            <button class="play-audio" data-index="${index}" data-gender="${d.speaker === 'A' ? 'male' : 'female'}">
                🔊 朗读
            </button>
        </div>
    `).join("");

    // 隐藏翻译框（如果有）
    const translationDiv = document.getElementById("beginnerTranslation");
    if (translationDiv) {
        translationDiv.style.display = "none";
    }

    // 绑定所有句子的朗读按钮
    window.bindPlayAudioButtons("beginnerDialog", beginner.dialog);
		setTimeout(window.applyVisibility, 50);
};


// 显示选中的词汇详细内容
window.displayIntermediate = function(intermediate) {
    const titleElem = document.getElementById("intermediateTitle");

    // 清空标题区域（防止按钮重复）
    titleElem.innerHTML = "";

    // 插入标题文本
    const span = document.createElement("span");
    span.textContent = intermediate.title;
    titleElem.appendChild(span);

		// 插入“朗读全部”按钮（toggle）
		const readAllIntermediateBtn = document.createElement("button");
		readAllIntermediateBtn.id = "readAllIntermediateBtn";
		readAllIntermediateBtn.textContent = "朗读全部";
		readAllIntermediateBtn.className = "play-audio";
		readAllIntermediateBtn.style.marginLeft = "10px";
		readAllIntermediateBtn.dataset.status = "idle"; // idle | playing
		
		readAllIntermediateBtn.addEventListener("click", () => {
		    if (readAllIntermediateBtn.dataset.status === "idle") {
		        readAllIntermediateBtn.textContent = "停止朗读";
		        readAllIntermediateBtn.style.backgroundColor = "#dc3545"; // Bootstrap 红色
		        readAllIntermediateBtn.dataset.status = "playing";
		        window.readAllSceneText(intermediate.dialog, () => {
		            // 朗读完成后恢复按钮
		            readAllIntermediateBtn.textContent = "朗读全部";
		            readAllIntermediateBtn.style.backgroundColor = "#007bff";
		            readAllIntermediateBtn.dataset.status = "idle";
		        });
		    } else {
		        window.speechSynthesis.cancel(); // 停止朗读
		        readAllIntermediateBtn.textContent = "朗读全部";
		        readAllIntermediateBtn.style.backgroundColor = "#007bff";
		        readAllIntermediateBtn.dataset.status = "idle";
		    }
		});
		titleElem.appendChild(readAllIntermediateBtn);

    // 设置场景描述
    document.getElementById("intermediateDescription").textContent = intermediate.description;

    // 渲染对话内容
    const dialogDiv = document.getElementById("intermediateDialog");
    dialogDiv.innerHTML = intermediate.dialog.map((d, index) => `
        <div class="dialog-entry">
						<p><strong>${d.speaker}:</strong> <span class="text">${d.text}</span> <br>
            <em class="romaji">${d.romaji}</em> <br>
            <span class="translation">${intermediate.translation[index]}</span></p>
            <button class="play-audio" data-index="${index}" data-gender="${d.speaker === 'A' ? 'male' : 'female'}">
                🔊 朗读
            </button>
        </div>
    `).join("");

    // 隐藏翻译框（如果有）
    const translationDiv = document.getElementById("intermediateTranslation");
    if (translationDiv) {
        translationDiv.style.display = "none";
    }

    // 绑定所有句子的朗读按钮
    window.bindPlayAudioButtons("intermediateDialog", intermediate.dialog);
		setTimeout(window.applyVisibility, 50);
};

// 渲染故事列表
window.renderAdvancedList = function() {
    const advancedList = document.getElementById("advancedList");
    advancedList.innerHTML = "";

    window.advanceds.forEach(advanced => {
        const li = document.createElement("li");
        li.textContent = advanced.title;
        li.dataset.id = advanced.id;
        li.classList.remove("selected");
        li.addEventListener("click", () => {
            window.selectedAdvancedId = advanced.id;
            window.highlightSelectedAdvanced(li);
            window.displayAdvanced(advanced);
        });
        advancedList.appendChild(li);
    });
};

// 高亮选中的高级
window.highlightSelectedAdvanced = function(selectedLi) {
    document.querySelectorAll("#advancedList li").forEach(li => li.classList.remove("selected"));
    selectedLi.classList.add("selected");
};

// 显示选中的高级内容
window.displayAdvanced = function(advanced) {
    const titleElem = document.getElementById("advancedTitle");

    // 清空标题区域（防止重复按钮）
    titleElem.innerHTML = "";

    // 插入标题文字
    const span = document.createElement("span");
    span.textContent = advanced.title;
    titleElem.appendChild(span);

    // 插入朗读全部按钮（toggle）
    const readAllBtn = document.createElement("button");
    readAllBtn.id = "readAllAdvancedBtn";
    readAllBtn.textContent = "朗读全部";
    readAllBtn.className = "play-audio";
    readAllBtn.style.marginLeft = "10px";
    readAllBtn.dataset.status = "idle";

    readAllBtn.addEventListener("click", () => {
        if (readAllBtn.dataset.status === "idle") {
            readAllBtn.textContent = "停止朗读";
            readAllBtn.style.backgroundColor = "#dc3545"; // 红色
            readAllBtn.dataset.status = "playing";
            window.readAllSceneText(advanced.dialog, () => {
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

    // 设置高级简介
  document.getElementById("advancedDescription").textContent = advanced.description;

    // 渲染正文
    const dialogDiv = document.getElementById("advancedDialog");
    dialogDiv.innerHTML = advanced.dialog.map((d, index) => `
        <div class="dialog-entry">
 						<p><strong>${d.speaker}:</strong> <span class="text">${d.text}</span> <br>
            <em class="romaji">${d.romaji}</em><br>
            <span class="translation">${advanced.translation[index]}</span></p>
        </div>
    `).join("");

    // 隐藏 advancedTranslation（未来扩展用）
    const translationDiv = document.getElementById("advancedTranslation");
    if (translationDiv) translationDiv.style.display = "none";
		setTimeout(window.applyVisibility, 50);
};

window.applyVisibility = function () {
    const mode = window.currentMode;  // beginner | intermediate | advanced

    let showJapanese = true;
    let showTranslation = true;

    if (mode === "beginner") {
        showJapanese = document.querySelector("#toggleBeginnerJapanese")?.checked ?? true;
        showTranslation = document.querySelector("#toggleBeginnerTranslation")?.checked ?? true;
    } else if (mode === "intermediate") {
        showJapanese = document.querySelector("#toggleIntermediateJapanese")?.checked ?? true;
        showTranslation = document.querySelector("#toggleIntermediateTranslation")?.checked ?? true;
    } else if (mode === "advanced") {
				showJapanese = document.querySelector("#toggleAdvancedJapanese")?.checked ?? true;
        showTranslation = document.querySelector("#toggleAdvancedTranslation")?.checked ?? true;
			} 

    const JapaneseElems = document.querySelectorAll(".text");
    const translationElems = document.querySelectorAll(".translation");

    JapaneseElems.forEach(el => {
        el.style.display = showJapanese ? "block" : "none";
    });

    translationElems.forEach(el => {
        el.style.display = showTranslation ? "block" : "none";
    });
};

function bindToggleVisibilityOptions() {
    const allCheckboxes = document.querySelectorAll(
        "#toggleBeginnerJapanese, #toggleBeginnerTranslation, #toggleAdvancedJapanese, #toggleAdvancedTranslation,#toggleIntermediateJapanese, #toggleIntermediateTranslation"
    );

    allCheckboxes.forEach(cb => {
        cb.addEventListener("change", window.applyVisibility);
    });

    window.applyVisibility(); // 页面加载时也执行一次
		
		window.currentSpeechRate = 1.0;
		// 初级滑条
	document.getElementById("speechRateBeginner")?.addEventListener("input", (e) => {
	    const rate = parseFloat(e.target.value);
	    window.currentSpeechRate = rate;
	  document.getElementById("speechRateValueBeginner").textContent = rate.toFixed(1);
		});
	
		// 中级滑条
	document.getElementById("speechRateIntermediate")?.addEventListener("input", (e) => {
	    const rate = parseFloat(e.target.value);
	    window.currentSpeechRate = rate;
	    document.getElementById("speechRateValueIntermediate").textContent = rate.toFixed(1);
		});
	
		// 高级滑条
	document.getElementById("speechRateAdvanced")?.addEventListener("input", (e) => {
	    const rate = parseFloat(e.target.value);
	    window.currentSpeechRate = rate;
	    document.getElementById("speechRateValueAdvanced").textContent = rate.toFixed(1);
		});
}
