(function () {
  // 判断是否在本地环境运行（file:// 或 localhost）
  const isLocal = location.protocol === 'file:' || location.hostname === 'localhost';

  if (isLocal) {
    // 本地：加载本地 config.js
    const script = document.createElement('script');
    script.src = 'scripts/config.js';
    script.onload = () => {
      if (typeof initApp === 'function') initApp();
    };
    script.onerror = () => {
      alert('❌ 本地配置加载失败');
    };
    document.head.appendChild(script);
  } else {
    // 部署环境：使用 /api/get-config 获取
    fetch('/api/get-config')
      .then(res => res.json())
      .then(config => {
        window.JapaneseTutor = window.JapaneseTutor || {};
        window.JapaneseTutor.Config = window.JapaneseTutor.Config || {};
        Object.assign(window.JapaneseTutor.Config, config);

        if (typeof initApp === 'function') initApp();
      })
      .catch(err => {
        console.error('❌ 配置加载失败:', err);
        alert('配置加载失败，请检查网络或联系开发者');
      });
  }
})();