async function searchDictionary() {
  const keyword = document.getElementById('searchInput').value.trim();
  const resultArea = document.getElementById('results');
  resultArea.innerHTML = '';

  if (!keyword) return;

  const dictionary = await window.loadJSON('data/dictionary.json');
  if (!dictionary) return;

//  console.log("载入数据:", dictionary);

  const seen = new Set();
  const matches = dictionary.filter(entry => {
    const key = entry.word;
    if (seen.has(key)) return false;

    const matchText = [
      entry.word,
      entry.kana,
      ...(entry.meanings || [])
    ].join(' ');

    if (matchText.includes(keyword)) {
      seen.add(key);
      return true;
    }

    return false;
  });

  if (matches.length === 0) {
    resultArea.textContent = '未找到相关词条。';
  } else {
    matches.forEach(entry => {
      resultArea.appendChild(renderResult(entry));
    });
  }
}

function renderResult(entry) {
  const container = document.createElement('div');
  container.className = 'result-block';

  container.innerHTML = `
    <h3>${entry.word}【${entry.kana}】</h3>
    <div class="romaji">罗马音: ${entry.romaji}</div>
    <div class="type">词性: ${entry.type}</div>
    <div class="tags">标签: ${entry.tags.join(', ')}</div>
    <div><strong>释义:</strong> ${entry.meanings.join('；')}</div>
  `;

  const examples = document.createElement('div');
  examples.innerHTML = '<strong>例句:</strong>';
  entry.examples.forEach((ex, index) => {
    const p = document.createElement('p');
    p.className = 'example';
    p.innerHTML = `
      ${ex.ja}
      <button class="play-audio" onclick="window.playAudio('${ex.ja}')">朗读</button><br>
      ${ex.romaji}<br>${ex.zh}
    `;
    examples.appendChild(p);
  });
  container.appendChild(examples);

  if (entry.conjugations && Object.keys(entry.conjugations).length > 0) {
    const conj = document.createElement('div');
    conj.className = 'conjugations';
    conj.innerHTML = '<strong>变形:</strong><ul>' +
      Object.entries(entry.conjugations).map(([form, val]) =>
        `<li>${form}: ${val}</li>`).join('') + '</ul>';
    container.appendChild(conj);
  }

  return container;
}

document.getElementById('searchBtn').addEventListener('click', searchDictionary);
document.getElementById('searchInput').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') searchDictionary();
});