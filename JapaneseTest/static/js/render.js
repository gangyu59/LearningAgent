window.renderTestContent = function(containerId, data, showAnswer, showExplain, index) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (!Array.isArray(data) || index < 0 || index >= data.length) return;

  const test = data[index];
  const questions = test.questions;

  if (!Array.isArray(questions)) return;

  questions.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "question-block";

    const q = document.createElement("p");
    q.innerHTML = `<strong>题 ${i + 1}：</strong>${item.question}`;
    div.appendChild(q);

		item.options.forEach(opt => {
		  const label = document.createElement("label");
		  label.style.display = "block";
		
		  const input = document.createElement("input");
		  input.type = "radio";
		  input.name = `q${i}`;
		  input.value = opt;
		
		  // 🎯 即时反馈：判断是否正确
		  input.addEventListener("change", () => {
		    const all = document.getElementsByName(`q${i}`);
		    all.forEach(r => {
		      r.parentNode.style.color = ""; // 清除原来颜色
		    });

    if (input.value === item.answer) {
      input.parentNode.style.color = ""; // 正确，保持默认
    } else {
      input.parentNode.style.color = "red"; // 错误，红色
    }
  });

  label.appendChild(input);
  label.append(` ${opt}`);
  div.appendChild(label);
});

		if (showAnswer) {
		  const a = document.createElement("p");
		  a.innerHTML = `<strong>✔ 正确答案：</strong>${item.answer}`;
		  a.style.color = "green";
		  div.appendChild(a);
		
		  // 单行显示例句 + 朗读按钮
		  const ex = document.createElement("p");
		  ex.style.fontStyle = "italic";
		  ex.style.margin = "4px 0";
		
		  const span = document.createElement("span");
		  span.innerHTML = `<strong>例句：</strong>${item.example}`;
		  ex.appendChild(span);
		
		  const btn = document.createElement("button");
		  btn.textContent = "🔊";
		  btn.className = "play-audio";
		  btn.style.marginLeft = "8px";
		  btn.style.fontSize = "13px";
		  btn.style.padding = "2px 6px";
		  btn.onclick = () => window.playAudio(item.example);
		
		  ex.appendChild(btn);
		  div.appendChild(ex);
		}

    if (showExplain) {
      const exp = document.createElement("p");
      exp.innerHTML = `<strong>📘 解释：</strong>${item.explanation}`;
      exp.style.color = "#555";
      div.appendChild(exp);
    }

    container.appendChild(div);
  });
		  // 👉 添加“上缴答卷”按钮
	  const submitBtn = document.createElement("button");
	  submitBtn.textContent = "上缴答卷";
	  submitBtn.className = "submit-btn"; // 可在 CSS 自定义样式
	  submitBtn.style.marginTop = "20px";
	
	  submitBtn.addEventListener("click", () => {
	    let correctCount = 0;
	
	    questions.forEach((item, i) => {
	      const selected = document.querySelector(`input[name="q${i}"]:checked`);
	      if (selected && selected.value === item.answer) {
	        correctCount++;
	      }
	    });
	
	    const score = Math.round(correctCount / questions.length * 100);
	    alert(`🎯 你答对了 ${correctCount} / ${questions.length} 题，得分：${score} 分`);
	  });
	
	  container.appendChild(submitBtn);
};

