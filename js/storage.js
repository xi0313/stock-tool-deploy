// 持仓库数据层：localStorage 持久化，初始数据来自 data/holdings.json
(function () {
  const KEY = 'stock_tool_holdings_v1';

  let holdings = [];
  let loaded = false;

  // 默认初始持仓
  const DEFAULT_HOLDINGS = [
    { id: 'sh605117', code: '605117', name: '德业股份', shares: 500, cost: 68.791 }
  ];

  async function init() {
    if (loaded) return holdings;
    // 1. 先读 localStorage
    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) {}
    if (stored) {
      try { holdings = JSON.parse(stored); } catch (e) { holdings = null; }
    }
    // 2. 无则尝试读初始数据文件
    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
      try {
        const res = await fetch('data/holdings.json');
        const j = await res.json();
        holdings = Array.isArray(j) && j.length ? j : DEFAULT_HOLDINGS;
      } catch (e) {
        holdings = DEFAULT_HOLDINGS;
      }
      save();
    }
    loaded = true;
    return holdings;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(holdings)); } catch (e) {}
  }

  function list() { return holdings.slice(); }

  function add(item) {
    item.id = item.id || ('h' + Date.now());
    holdings.push(item);
    save();
    return item;
  }

  function update(id, patch) {
    const i = holdings.findIndex((h) => h.id === id);
    if (i >= 0) { holdings[i] = Object.assign({}, holdings[i], patch); save(); }
    return i >= 0;
  }

  function remove(id) {
    holdings = holdings.filter((h) => h.id !== id);
    save();
  }

  function total() {
    return holdings.reduce((s, h) => s + (h.shares * h.cost), 0);
  }

  window.HoldingsStore = { init, list, add, update, remove, save, total };
})();
