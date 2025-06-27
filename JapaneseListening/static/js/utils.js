window.loadJSON = async function (path) {
  try {
    const res = await fetch(path);
    return await res.json();
  } catch (e) {
    console.error("加载失败", e);
    return [];
  }
};