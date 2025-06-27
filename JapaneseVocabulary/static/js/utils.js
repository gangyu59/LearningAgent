window.loadJSON = async function (path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error("网络请求失败：" + res.status);
    return await res.json();
  } catch (e) {
    console.error("加载失败：", path, e);
    alert("加载数据失败：" + path);
    return [];
  }
};
