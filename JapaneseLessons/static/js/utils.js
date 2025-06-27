window.loadJSON = async function(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error("加载失败：" + path);
  return res.json();
};

window.lessonLevels = ["beginner", "intermediate", "advanced"];
window.currentLessonIndex = 0;
window.currentLessonLevel = "beginner";

// 页面加载完成后设置课程级别切换
document.addEventListener("DOMContentLoaded", () => {
  const levelSwitcher = document.getElementById("lessonLevelSwitcher");
  if (levelSwitcher) {
    levelSwitcher.addEventListener("click", () => {
      currentLessonIndex = (currentLessonIndex + 1) % lessonLevels.length;
      currentLessonLevel = lessonLevels[currentLessonIndex];

      lessonLevels.forEach(level => {
        const listEl = document.getElementById(`${level}ListContainer`);
        const detailEl = document.getElementById(`${level}Details`);
        if (listEl) listEl.style.display = level === currentLessonLevel ? "block" : "none";
        if (detailEl) detailEl.style.display = level === currentLessonLevel ? "block" : "none";
      });

      levelSwitcher.textContent =
        currentLessonLevel === "beginner" ? "初级课程" :
        currentLessonLevel === "intermediate" ? "中级课程" :
        "高级课程";
    });
  }
});