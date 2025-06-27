window.loadJSON = async function (path) {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error("网络请求失败：" + res.status + " " + res.statusText);
    }
    return await res.json();
  } catch (e) {
    console.error("加载失败：", path, e);
    alert("加载语法数据失败，请检查路径是否正确：" + path);
    return [];
  }
};