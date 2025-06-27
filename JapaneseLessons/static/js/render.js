// 渲染右侧课程内容
window.renderLessonContent = function(containerId, lesson) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <h2>${lesson.title}</h2>
    <p><strong>【教学目标】</strong> ${lesson.objective}</p>
    <hr>
    <div>${formatLessonContentWithAudio(lesson.content)}</div>
  `;

  bindLessonAudioButtons(containerId);
};

function formatLessonContentWithAudio(content) {
  const lines = content.split("\n").filter(line => line.trim());

  return lines.map((line, i) => {
    const trimmed = line.trim();

    // 判断是否是完整日语句子（例句）
    const isJapaneseSentence =
      /^[\u3040-\u30FF\u4E00-\u9FAF]/.test(trimmed) &&     // 日文字符开头
      /[。！？]$/.test(trimmed) &&                         // 句末标点结尾
      trimmed.length >= 8 &&                               // 至少 8 字
      !/[（(].+[)）]/.test(trimmed) &&                     // 没有括号注释
      !/[：:]/.test(trimmed);                              // 没有冒号结构

    // 输出格式
    return `
      <div class="lesson-line">
        <span>${trimmed}</span>
        ${isJapaneseSentence ? `<button class="play-audio" data-text="${trimmed}" style="margin-left: 8px;">▶️</button>` : ""}
      </div>
    `;
  }).join("");
}

// 绑定按钮点击朗读
function bindLessonAudioButtons(containerId) {
  const container = document.getElementById(containerId);
  const buttons = container.querySelectorAll(".play-audio");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const text = btn.getAttribute("data-text");
      window.playAudio(text);
    });
  });
}