document.addEventListener("DOMContentLoaded", async () => {
  let currentLevel = "beginner";

  const dataMap = {
    beginner: await loadJSON("data/beginner.json"),
    intermediate: await loadJSON("data/intermediate.json"),
    advanced: await loadJSON("data/advanced.json")
  };

  const listMap = {
    beginner: "beginnerList",
    intermediate: "intermediateList",
    advanced: "advancedList"
  };

  const contentMap = {
    beginner: "beginnerContent",
    intermediate: "intermediateContent",
    advanced: "advancedContent"
  };

  // 初始化加载当前级别课程
  renderLessonList(currentLevel);

  // 设置切换级别逻辑
  const switcher = document.getElementById("lessonLevelSwitcher");
  switcher.addEventListener("click", () => {
    currentLevel = currentLevel === "beginner"
      ? "intermediate"
      : currentLevel === "intermediate"
        ? "advanced"
        : "beginner";

    switcher.textContent =
      currentLevel === "beginner" ? "初级课程" :
      currentLevel === "intermediate" ? "中级课程" : "高级课程";

    ["beginner", "intermediate", "advanced"].forEach(level => {
      document.getElementById(`${level}ListContainer`).style.display = level === currentLevel ? "block" : "none";
      document.getElementById(`${level}Details`).style.display = level === currentLevel ? "block" : "none";
    });

    renderLessonList(currentLevel);
  });

  function renderLessonList(level) {
    const data = dataMap[level];
    const listId = listMap[level];
    const contentId = contentMap[level];

    const ul = document.getElementById(listId);
    ul.innerHTML = "";

    data.forEach((lesson, index) => {
      const li = document.createElement("li");
      li.innerHTML = `<div style="font-weight:bold;">第${lesson.id}課</div><div>${lesson.title}</div>`;
      li.style.cursor = "pointer";
      li.addEventListener("click", () => {
        renderLessonContent(contentId, lesson);
      });
      ul.appendChild(li);
    });

    if (data.length > 0) {
      renderLessonContent(contentId, data[0]);
    }
  }
});