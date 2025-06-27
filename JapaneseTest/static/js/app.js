document.addEventListener("DOMContentLoaded", async () => {
  async function loadTestData(level) {
    const fileData = await loadJSON(`data/${level}.json`);
    const localData = JSON.parse(localStorage.getItem(`${level}Tests`) || "[]");
    return { fileData, allData: fileData.concat(localData) };
  }

  const { fileData: beginnerFile, allData: beginnerData } = await loadTestData("beginner");
  const { fileData: intermediateFile, allData: intermediateData } = await loadTestData("intermediate");
  const { fileData: advancedFile, allData: advancedData } = await loadTestData("advanced");

  // 记录初始 JSON 文件长度（不可删除）
  window.initialFileCounts = {
    beginner: beginnerFile.length,
    intermediate: intermediateFile.length,
    advanced: advancedFile.length
  };

  const dataMap = {
    beginner: beginnerData,
    intermediate: intermediateData,
    advanced: advancedData
  };

  const listMap = {
    beginner: "beginnerList",
    intermediate: "intermediateList",
    advanced: "advancedList"
  };

  const titleMap = {
    beginner: "beginnerTitle",
    intermediate: "intermediateTitle",
    advanced: "advancedTitle"
  };

  const contentMap = {
    beginner: "beginnerContent",
    intermediate: "intermediateContent",
    advanced: "advancedContent"
  };

  const checkboxMap = {
    beginner: {
      answer: document.getElementById("toggleBeginnerJapanese"),
      explain: document.getElementById("toggleBeginnerTranslation")
    },
    intermediate: {
      answer: document.getElementById("toggleIntermediateJapanese"),
      explain: document.getElementById("toggleIntermediateTranslation")
    },
    advanced: {
      answer: document.getElementById("toggleAdvancedJapanese"),
      explain: document.getElementById("toggleAdvancedTranslation")
    }
  };

  let currentLevel = null;
  let currentIndex = -1;

  // 初始化测试列表
  Object.keys(dataMap).forEach(level => {
    const ul = document.getElementById(listMap[level]);
    ul.innerHTML = "";

    dataMap[level].forEach((test, index) => {
      if (!test || !Array.isArray(test.questions)) return;

      const li = document.createElement("li");
      li.textContent = test.title || `测试 ${index + 1}`;
      li.dataset.index = index;

      li.addEventListener("click", () => {
        currentLevel = level;
        currentIndex = index;

        updateTitle(level, index);
        renderTestContent(
          contentMap[level],
          dataMap[level],
          checkboxMap[level].answer.checked,
          checkboxMap[level].explain.checked,
          index
        );
      });

      ul.appendChild(li);
    });

    checkboxMap[level].answer.addEventListener("change", () => {
      if (currentLevel === level && currentIndex >= 0) {
        renderTestContent(
          contentMap[level],
          dataMap[level],
          checkboxMap[level].answer.checked,
          checkboxMap[level].explain.checked,
          currentIndex
        );
      }
    });

    checkboxMap[level].explain.addEventListener("change", () => {
      if (currentLevel === level && currentIndex >= 0) {
        renderTestContent(
          contentMap[level],
          dataMap[level],
          checkboxMap[level].answer.checked,
          checkboxMap[level].explain.checked,
          currentIndex
        );
      }
    });
  });


  function updateTitle(level, index) {
    const titleEl = document.getElementById(titleMap[level]);
    const deleteBtn = document.getElementById("deleteTestBtn");

    const title = dataMap[level][index]?.title || `测试 ${index + 1}`;
    titleEl.textContent = title;
    deleteBtn.style.display = index >= 0 ? "inline-block" : "none";

    deleteBtn.onclick = () => {
      if (!confirm(`确定要删除「${title}」？此操作不可恢复！`)) return;

      const fileLength = window.initialFileCounts[level] || 0;
      if (index < fileLength) {
        alert("⚠ 无法删除原始题目！");
        return;
      }

      dataMap[level].splice(index, 1);

      const newList = dataMap[level].slice(fileLength);
      localStorage.setItem(`${level}Tests`, JSON.stringify(newList));

      document.getElementById(contentMap[level]).innerHTML = "";
      titleEl.textContent = level === "beginner" ? "初级测试" : level === "intermediate" ? "中级测试" : "高级测试";
      deleteBtn.style.display = "none";

      const ul = document.getElementById(listMap[level]);
      ul.innerHTML = "";
      dataMap[level].forEach((test, idx) => {
        if (!test || !Array.isArray(test.questions)) return;
        const li = document.createElement("li");
        li.textContent = test.title || `测试 ${idx + 1}`;
        li.dataset.index = idx;
        li.addEventListener("click", () => {
          currentLevel = level;
          currentIndex = idx;
          updateTitle(level, idx);
          renderTestContent(
            contentMap[level],
            dataMap[level],
            checkboxMap[level].answer.checked,
            checkboxMap[level].explain.checked,
            idx
          );
        });
        ul.appendChild(li);
      });
    };
  }

  function switchLevel(level) {
    currentLevel = level;
    currentIndex = -1;

    ["beginner", "intermediate", "advanced"].forEach(lvl => {
      document.getElementById(`${lvl}ListContainer`).style.display = lvl === level ? "block" : "none";
      document.getElementById(`${lvl}Details`).style.display = lvl === level ? "block" : "none";

      document.getElementById(contentMap[lvl]).innerHTML = "";
      document.getElementById(titleMap[lvl]).textContent =
        lvl === "beginner" ? "初级测试" : lvl === "intermediate" ? "中级测试" : "高级测试";
    });
  }

  // 默认初始打开
  switchLevel("beginner");

// 👇 加入这段切换按钮逻辑，注意变量作用域一致
let levels = ["beginner", "intermediate", "advanced"];
let currentTabIndex = 0;

document.getElementById("testLevelSwitcher").addEventListener("click", () => {
  currentTabIndex = (currentTabIndex + 1) % levels.length;
  const newLevel = levels[currentTabIndex];

  currentLevel = newLevel; // ✅ 同作用域，确保同步成功

  // 更新界面显示
  levels.forEach(lvl => {
    document.getElementById(`${lvl}ListContainer`).style.display = lvl === newLevel ? "block" : "none";
    document.getElementById(`${lvl}Details`).style.display = lvl === newLevel ? "block" : "none";
  });

  // 更新标题
  const label =
    newLevel === "beginner" ? "初级测试" :
    newLevel === "intermediate" ? "中级测试" : "高级测试";
  document.getElementById("testLevelSwitcher").textContent = label;
});

  // 超时处理
  function timeoutPromise(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("请求超时，请稍后重试")), ms)
      )
    ]);
  }

  function fixJson(text) {
    console.log("🧠 原始返回文本：", text);
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");

    let jsonPart = "";
    if (start !== -1 && end !== -1) {
      jsonPart = text.slice(start, end + 1);
    } else {
      throw new Error("找不到 JSON 数组边界");
    }

    try {
      return JSON.parse(jsonPart);
    } catch (e) {
      console.warn("❗JSON 初次解析失败，尝试修复格式...");
      const fixed = jsonPart
        .replace(/“|”/g, '"')
        .replace(/：/g, ':')
        .replace(/，/g, ',')
        .replace(/；/g, ';')
        .replace(/（/g, '(')
        .replace(/）/g, ')')
        .replace(/'/g, '"')
        .replace(/\n/g, "")
        .replace(/\s*$/, "")
        .replace(/,\s*]/g, "]");

      try {
        return JSON.parse(fixed);
      } catch (e2) {
        console.error("🧨 解析失败，最终内容如下：", fixed);
        throw new Error("JSON Parse error: " + e2.message);
      }
    }
  }

document.getElementById("generateTestBtn").addEventListener("click", async () => {
  const hourglass = document.getElementById("hourglass");
  hourglass.style.display = "block";

  try {
    const level = currentLevel;
    if (!level) throw new Error("请先切换到一个级别页面");

    const levelCN =
      level === "beginner" ? "初级" :
      level === "intermediate" ? "中级" :
      "高级";

    const testNumber = dataMap[level].length + 1;

    let difficultyDescription = "";
    if (testNumber <= 3) {
      difficultyDescription = "重点考察基础词汇和简单语法点，如「これは何ですか？」";
    } else if (testNumber <= 6) {
      difficultyDescription = "加入动词变形、小句结构、助词使用等稍复杂内容";
    } else {
      difficultyDescription = "增加难度，如短句阅读、助词辨析、敬语表达、情景应用等综合题";
    }

    const messages = [
      {
        role: "system",
        content: "你是一个日语教学专家，擅长为学生设计选择题。请严格按照要求输出 JSON 数组。"
      },
      {
        role: "user",
        content: `请为日语${levelCN}学习者生成10题的多项选择题，第 ${testNumber} 套题目，${difficultyDescription}。
题目格式如下：
[
  {
    "question": "问题",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "answer": "正确答案",
    "example": "例句",
    "explanation": "解释"
  }
]
不要包含解释文字，不要代码块标记。仅输出 JSON 数组本身。`
      }
    ];

    const result = await timeoutPromise(
      callARK(messages, {
        temperature: 0.5,
        max_tokens: 1500
      }),
      100000
    );

    const raw = result.choices?.[0]?.message?.content || "";
    if (!raw.trim()) throw new Error("返回内容为空，AI 没有生成任何内容");

    const questions = fixJson(raw);
    if (!Array.isArray(questions)) throw new Error("解析结果不是有效的题目数组");

    const newTest = {
      title: `测试 ${testNumber}`,
      questions: questions
    };

    const key = `${level}Tests`;
    const local = JSON.parse(localStorage.getItem(key) || "[]");
    local.push(newTest);
    localStorage.setItem(key, JSON.stringify(local));
    dataMap[level].push(newTest);

    const ul = document.getElementById(listMap[level]);
    const li = document.createElement("li");
    li.textContent = newTest.title;
    li.dataset.index = dataMap[level].length - 1;
    li.addEventListener("click", () => {
      currentIndex = parseInt(li.dataset.index);
      updateTitle(level, currentIndex);
      renderTestContent(
        contentMap[level],
        dataMap[level],
        checkboxMap[level].answer.checked,
        checkboxMap[level].explain.checked,
        currentIndex
      );
    });
    ul.appendChild(li);

    alert("✅ 新测试已生成！");
  } catch (err) {
    console.error("❌ 生成测试失败：", err);
    alert("生成测试失败：" + err.message);
  } finally {
    hourglass.style.display = "none";
  }
});
});