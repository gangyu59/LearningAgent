window.JapaneseTutor = window.JapaneseTutor || {};

(function() {
  function getScenario() {
    const select = document.getElementById('scenario');
    const input = document.getElementById('customScene');

    if (!select) {
      console.warn("⚠️ 未找到 select#scenario 元素");
      return "通用对话";
    }

    if (!input) {
      console.warn("⚠️ 未找到 input#customScene 元素");
      return select.value?.trim() || "通用对话";
    }

    const selected = select.value?.trim();
    const custom = input.value?.trim();

    return custom || selected || "通用对话";
  }

  window.JapaneseTutor.Scenario = { getScenario };
})();