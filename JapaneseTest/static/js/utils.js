window.loadJSON = async function(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error("加载失败：" + path);
  return res.json();
};

document.addEventListener("DOMContentLoaded", () => {
  // 切换 tab 级别（初级 -> 中级 -> 高级 -> 初级）
  let levels = ["beginner", "intermediate", "advanced"];
  let currentIndex = 0;

  document.getElementById("testLevelSwitcher").addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % levels.length;
    const current = levels[currentIndex];

    // ✅ 同步当前级别变量（关键）
    currentLevel = current;

    levels.forEach(lvl => {
      document.getElementById(`${lvl}ListContainer`).style.display = lvl === current ? "block" : "none";
      document.getElementById(`${lvl}Details`).style.display = lvl === current ? "block" : "none";
    });

    const levelName =
      current === "beginner" ? "初级测试" :
      current === "intermediate" ? "中级测试" :
      "高级测试";

    document.getElementById("testLevelSwitcher").textContent = levelName;
  });
});