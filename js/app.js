// 主应用逻辑：六模块渲染 + tab 切换 + 持仓交互
(function () {
  // ===== 全局数据缓存 =====
  const DATA = { stockpool: null, alerts: null, market: null, rules: null };
  const quotes = {}; // code -> 行情（用于持仓浮盈亏）

  // ===== 工具函数 =====
  function fmt(n, d) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    return Number(n).toFixed(d === undefined ? 2 : d);
  }
  function pct(n) { return n === null || n === undefined ? '--' : (n > 0 ? '+' : '') + fmt(n, 2) + '%'; }
  function cls(n) { return n > 0 ? 'up' : (n < 0 ? 'down' : 'flat'); }
  function esc(s) { return String(s || '').replace(/[<>&]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }

  async function loadJSON(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error('load fail ' + path);
    return r.json();
  }

  // ===== 初始化：并行加载数据 =====
  async function init() {
    try {
      const [sp, al, mk, rl, ho] = await Promise.all([
        loadJSON('data/stockpool.json').catch(() => null),
        loadJSON('data/alerts.json').catch(() => null),
        loadJSON('data/market.json').catch(() => null),
        loadJSON('data/rules.json').catch(() => null),
        loadJSON('data/holdings.json').catch(() => null)
      ]);
      DATA.stockpool = sp; DATA.alerts = al; DATA.market = mk; DATA.rules = rl;
      // 收集持仓 + 选股标的的代码，用于行情映射（行情已在 data 文件里）
      buildQuoteMap();
    } catch (e) { console.error(e); }

    await HoldingsStore.init();

    renderAll();
    bindEvents();
    registerSW();
  }

  // 从 stockpool / market 里已有的行情字段构建 quotes
  function buildQuoteMap() {
    // stockpool 里的标的带 price 字段
    if (DATA.stockpool && Array.isArray(DATA.stockpool)) {
      DATA.stockpool.forEach((s) => { if (s && s.code && s.price != null) quotes[s.code] = s; });
    }
    // holdings 的行情通过 market.holdings 补充（后台可注入）
    if (DATA.market && DATA.market.holdings) {
      DATA.market.holdings.forEach((h) => { if (h && h.code) quotes[h.code] = h; });
    }
  }

  // ===== 六大模块渲染 =====
  function renderAll() {
    renderStockpool();
    renderHoldings();
    renderAlerts();
    renderMarket();
    renderRules();
    renderRisk();
  }

  // ① 选股页
  function renderStockpool() {
    const el = document.getElementById('stockpool');
    const sp = DATA.stockpool;
    if (!sp || !Array.isArray(sp) || sp.length === 0) {
      el.innerHTML = '<div class="empty">暂无选股结果<br>等待后台数据生成</div>';
      return;
    }
    let html = '<div class="sec-title">' + esc(sp.length) + ' 只标的通过四层漏斗（更新于 ' + esc(DATA.stockpoolMeta?.date || '') + '）</div>';
    sp.forEach((s) => {
      const layers = (s.layers || []).map((l) => '<span class="tag ' + (l.hit ? 'red' : 'gray') + '">' + esc(l.name) + '</span>').join(' ');
      html += `
        <div class="card">
          <div class="stock-item">
            <div class="row1">
              <div><span class="name">${esc(s.name)}</span> <span class="code">${esc(s.code)}</span></div>
              <span class="${cls(s.chg)}">${pct(s.chg)}</span>
            </div>
            <div class="row2"><span>现价 ${fmt(s.price)}</span><span>PE ${fmt(s.pe)}</span></div>
            <div style="margin:8px 0 4px;">${layers}</div>
            <table>
              <tr><th>止盈一档(+5%)</th><th>止盈二档(+10%)</th><th>止盈三档(+15%)</th><th>止损位</th></tr>
              <tr>
                <td class="up">${fmt(s.tp1)}</td><td class="up">${fmt(s.tp2)}</td><td class="up">${fmt(s.tp3)}</td>
                <td class="down">${fmt(s.stop)}</td>
              </tr>
            </table>
            <div class="row2" style="margin-top:6px;">
              <span>仓位建议：<span class="tag blue">${esc(s.position || '试错30%')}</span></span>
            </div>
            <p style="font-size:12px;color:var(--sub);margin-top:6px;">依据：${esc(s.reason || '')}</p>
          </div>
        </div>`;
    });
    el.innerHTML = html;
  }

  // ② 持仓页
  function renderHoldings() {
    const el = document.getElementById('holdings');
    const hs = HoldingsStore.list();
    const costTotal = HoldingsStore.total();
    let mvTotal = 0;
    const rows = hs.map((h) => {
      const q = quotes[h.code];
      const price = q && q.price != null ? q.price : h.cost;
      const mv = h.shares * price;
      const pl = mv - h.shares * h.cost;
      const plPct = h.cost ? (pl / (h.shares * h.cost)) * 100 : 0;
      mvTotal += mv;
      return `
        <div class="stock-item">
          <div class="row1">
            <div><span class="name">${esc(h.name)}</span> <span class="code">${esc(h.code)}</span></div>
            <span class="${cls(pl)}">${pl >= 0 ? '+' : ''}${fmt(pl)}</span>
          </div>
          <div class="row2">
            <span>成本 ${fmt(h.cost)}</span><span>现价 ${fmt(price)}</span><span>${pct(plPct)}</span>
          </div>
          <div class="row2">
            <span>${esc(h.shares)} 股</span><span>市值 ${fmt(mv)}</span>
            <span><a href="javascript:;" data-act="edit" data-id="${esc(h.id)}" style="color:var(--blue);">编辑</a> <a href="javascript:;" data-act="del" data-id="${esc(h.id)}" style="color:var(--red);margin-left:6px;">删除</a></span>
          </div>
        </div>`;
    }).join('');

    const plTotal = mvTotal - costTotal;
    el.innerHTML = `
      <div class="card">
        <div class="kpis">
          <div class="kpi"><div class="num">${fmt(costTotal)}</div><div class="lbl">总成本</div></div>
          <div class="kpi"><div class="num">${fmt(mvTotal)}</div><div class="lbl">总市值</div></div>
          <div class="kpi"><div class="num ${cls(plTotal)}">${plTotal >= 0 ? '+' : ''}${fmt(plTotal)}</div><div class="lbl">浮动盈亏</div></div>
        </div>
      </div>
      <div class="card">
        <h2>持仓明细（${hs.length} 只）</h2>
        ${rows || '<div class="empty">暂无持仓，点击下方添加</div>'}
      </div>
      <div class="card" id="addFormCard" style="display:none;">
        <h2 id="formTitle">添加持仓</h2>
        <div class="frow"><label>代码</label><input id="f_code" placeholder="如 605117"></div>
        <div class="frow"><label>名称</label><input id="f_name" placeholder="如 德业股份"></div>
        <div class="frow"><label>股数</label><input id="f_shares" type="number" placeholder="如 500"></div>
        <div class="frow"><label>成本</label><input id="f_cost" type="number" step="0.001" placeholder="如 68.791"></div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn" id="f_save">保存</button>
          <button class="btn secondary" id="f_cancel">取消</button>
        </div>
      </div>
      <button class="btn" id="btnAdd" style="width:100%;">+ 添加持仓</button>`;
  }

  // ③ 预警页
  function renderAlerts() {
    const el = document.getElementById('alerts');
    const al = DATA.alerts;
    if (!al || !Array.isArray(al) || al.length === 0) {
      el.innerHTML = '<div class="card"><div class="empty">当前无预警信号</div></div>';
      return;
    }
    let html = '';
    al.forEach((a) => {
      const dotCls = a.type === 'pos' ? 'pos' : (a.type === 'neg' ? 'neg' : 'neu');
      const tag = a.type === 'pos' ? '<span class="tag red">利好</span>' : (a.type === 'neg' ? '<span class="tag green">利空</span>' : '<span class="tag gray">中性</span>');
      html += `
        <div class="card">
          <div class="alert">
            <div class="dot ${dotCls}"></div>
            <div style="flex:1;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${esc(a.title)}</strong>${tag}
              </div>
              <div style="font-size:12px;color:var(--sub);margin:4px 0;">${esc(a.desc || '')}</div>
              <div style="font-size:12px;"><strong>操作建议：</strong>${esc(a.action || '')}</div>
            </div>
          </div>
        </div>`;
    });
    el.innerHTML = html;
  }

  // ④ 大盘/外围页
  function renderMarket() {
    const el = document.getElementById('market');
    const mk = DATA.market;
    if (!mk) { el.innerHTML = '<div class="card"><div class="empty">暂无大盘数据</div></div>'; return; }

    // 大盘指数
    let idxHtml = '';
    const idxList = mk.indices || [];
    idxList.forEach((i) => {
      idxHtml += `<tr><td>${esc(i.name)}</td><td>${fmt(i.price)}</td><td class="${cls(i.chg)}">${pct(i.chg)}</td><td>${fmt(i.amount ? i.amount / 100000000 : null, 0)}亿</td></tr>`;
    });

    // 外围市场
    let extHtml = '';
    const extList = mk.external || [];
    extList.forEach((x) => {
      extHtml += `<tr><td>${esc(x.name)}</td><td>${fmt(x.price)}</td><td class="${cls(x.chg)}">${pct(x.chg)}</td></tr>`;
    });

    const breadth = mk.breadth || {};
    el.innerHTML = `
      <div class="card">
        <h2>大盘指数</h2>
        <table><tr><th>指数</th><th>点位</th><th>涨跌</th><th>成交额</th></tr>${idxHtml || '<tr><td colspan="4">暂无</td></tr>'}</table>
        ${breadth.upCount ? `<div class="sec-title">市场宽度：上涨 ${esc(breadth.upCount)} 家（占比 ${esc(breadth.upRatio)}）· 涨停 ${esc(breadth.upLimitCount)} · 跌停 ${esc(breadth.downLimitCount)} · 两市成交 ${fmt(breadth.amount ? breadth.amount / 100000000 : null, 0)}亿</div>` : ''}
      </div>
      <div class="card">
        <h2>外围市场</h2>
        <table><tr><th>标的</th><th>最新</th><th>涨跌</th></tr>${extHtml || '<tr><td colspan="3">暂无</td></tr>'}</table>
      </div>
      ${mk.geo ? `<div class="card"><h2>地缘事件</h2><p style="font-size:13px;">${esc(mk.geo)}</p></div>` : ''}`;
  }

  // ⑤ 历史规律页
  function renderRules() {
    const el = document.getElementById('rules');
    const rl = DATA.rules;
    if (!rl || !Array.isArray(rl) || rl.length === 0) {
      el.innerHTML = '<div class="card"><div class="empty">暂无规律数据</div></div>';
      return;
    }
    let html = '<div class="sec-title">当前适用提示（' + esc(DATA.rulesMeta?.date || '') + '）</div>';
    rl.forEach((r) => {
      const tag = r.relevance === 'high' ? '<span class="tag red">高相关</span>' : '<span class="tag gold">参考</span>';
      html += `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong>${esc(r.title)}</strong>${tag}
          </div>
          <div style="font-size:12px;color:var(--sub);">${esc(r.category || '')} · ${esc(r.period || '')}</div>
          <p style="font-size:13px;margin-top:6px;">${esc(r.desc || '')}</p>
          ${r.sensitivity ? `<p style="font-size:12px;color:var(--blue);margin-top:4px;">敏感性：${esc(r.sensitivity)}</p>` : ''}
        </div>`;
    });
    el.innerHTML = html;
  }

  // ⑥ 风控面板
  function renderRisk() {
    const el = document.getElementById('risk');
    const hs = HoldingsStore.list();
    const costTotal = HoldingsStore.total();
    const singleMax = costTotal > 0 ? Math.max(...hs.map((h) => h.shares * h.cost)) : 0;
    const concRatio = costTotal > 0 ? (singleMax / costTotal) * 100 : 0;

    // 交易成本测算（假设买卖一次）
    const avgCost = hs.length ? costTotal / hs.length : 0;
    const buyFee = avgCost * 0.00025; // 佣金约万2.5
    const sellFee = avgCost * (0.00025 + 0.0005); // 佣金+印花税万5
    const roundTrip = buyFee + sellFee;

    el.innerHTML = `
      <div class="card">
        <h2>组合概览</h2>
        <div class="kpis">
          <div class="kpi"><div class="num">${hs.length}</div><div class="lbl">持仓标的数</div></div>
          <div class="kpi"><div class="num">${fmt(costTotal)}</div><div class="lbl">总成本</div></div>
          <div class="kpi"><div class="num">${fmt(concRatio)}%</div><div class="lbl">单一最大占比</div></div>
        </div>
      </div>
      <div class="card">
        <h2>分散度检查</h2>
        ${concRatio > 30 ? '<div class="alert"><div class="dot neg"></div><div>单一标的占比 ' + fmt(concRatio) + '% 超过 30%，集中度偏高，建议适度分散。</div></div>' : '<div class="alert"><div class="dot pos"></div><div>单一标的占比 ' + fmt(concRatio) + '%，处于健康区间。</div></div>'}
        ${hs.length < 3 ? '<div class="alert"><div class="dot neu"></div><div>持仓标的较少（' + hs.length + ' 只），抗单一风险能力有限。</div></div>' : ''}
      </div>
      <div class="card">
        <h2>交易成本测算</h2>
        <table>
          <tr><th>项目</th><th>金额（按单笔均价估算）</th></tr>
          <tr><td>买入佣金（约万2.5）</td><td>${fmt(buyFee)} 元</td></tr>
          <tr><td>卖出佣金+印花税（约万7.5）</td><td>${fmt(sellFee)} 元</td></tr>
          <tr><td>一次完整买卖成本</td><td class="down">${fmt(roundTrip)} 元</td></tr>
        </table>
        <p style="font-size:11px;color:var(--sub);margin-top:6px;">提示：频繁交易会显著侵蚀收益，降低换手率是控制成本的关键。</p>
      </div>
      <div class="card">
        <h2>回撤与仓位纪律</h2>
        <div class="alert"><div class="dot neu"></div><div>单笔风险预算建议：账户的 1%~2%。仓位 = 风险预算 ÷ 止损距离。</div></div>
        <div class="alert"><div class="dot neu"></div><div>单股止损建议 -8% 或跌破关键支撑，止损位一旦设定只许收紧。</div></div>
        <div class="alert"><div class="dot neu"></div><div>分批止盈：+5% 卖 1/3、+10% 再卖 1/3、+15% 清余仓，避免一次性卖飞。</div></div>
      </div>`;
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // tab 切换
    document.querySelectorAll('.tabbar .tab').forEach((t) => {
      t.addEventListener('click', () => {
        const target = t.getAttribute('data-page');
        document.querySelectorAll('.tabbar .tab').forEach((x) => x.classList.remove('active'));
        document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
        t.classList.add('active');
        const pg = document.getElementById(target);
        if (pg) pg.classList.add('active');
      });
    });

    // 持仓：添加按钮
    const btnAdd = document.getElementById('btnAdd');
    if (btnAdd) btnAdd.addEventListener('click', () => showForm(null));

    // 持仓：编辑/删除/保存/取消（事件委托）
    document.addEventListener('click', (e) => {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      const id = e.target.getAttribute && e.target.getAttribute('data-id');
      if (act === 'edit') showForm(id);
      else if (act === 'del') { if (confirm('确认删除该持仓？')) { HoldingsStore.remove(id); renderHoldings(); renderRisk(); } }
    });

    const fSave = document.getElementById('f_save');
    if (fSave) fSave.addEventListener('click', () => saveForm());
    const fCancel = document.getElementById('f_cancel');
    if (fCancel) fCancel.addEventListener('click', () => hideForm());
  }

  let editingId = null;
  function showForm(id) {
    editingId = id;
    const card = document.getElementById('addFormCard');
    if (id) {
      const h = HoldingsStore.list().find((x) => x.id === id);
      if (h) {
        document.getElementById('formTitle').textContent = '编辑持仓';
        document.getElementById('f_code').value = h.code;
        document.getElementById('f_name').value = h.name;
        document.getElementById('f_shares').value = h.shares;
        document.getElementById('f_cost').value = h.cost;
      }
    } else {
      document.getElementById('formTitle').textContent = '添加持仓';
      document.getElementById('f_code').value = '';
      document.getElementById('f_name').value = '';
      document.getElementById('f_shares').value = '';
      document.getElementById('f_cost').value = '';
    }
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth' });
  }
  function hideForm() { document.getElementById('addFormCard').style.display = 'none'; }

  function saveForm() {
    const code = document.getElementById('f_code').value.trim();
    const name = document.getElementById('f_name').value.trim();
    const shares = parseFloat(document.getElementById('f_shares').value);
    const cost = parseFloat(document.getElementById('f_cost').value);
    if (!code || !name || !shares || !cost) { alert('请填写完整（代码/名称/股数/成本）'); return; }
    const item = { code, name, shares, cost };
    if (editingId) HoldingsStore.update(editingId, item);
    else HoldingsStore.add(item);
    hideForm();
    renderHoldings();
    renderRisk();
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ===== 启动 =====
  document.addEventListener('DOMContentLoaded', init);
})();
