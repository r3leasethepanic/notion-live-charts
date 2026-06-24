const app = document.getElementById('app');
const rubFmt = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const colors = ['#60a5fa', '#4ade80', '#a78bfa', '#22d3ee', '#fbbf24', '#fb7185', '#f472b6'];
const view = new URLSearchParams(location.search).get('view') || 'overview';
let chart;

function rub(v) { return rubFmt.format(Math.round(Number(v || 0))); }
function num(v) { return numFmt.format(Math.round(Number(v || 0))); }
function pct(v, total) { return total ? Math.round(Number(v || 0) / total * 100) + '%' : '0%'; }
function total(obj) { return Object.values(obj || {}).reduce((s, v) => s + Number(v || 0), 0); }
function sorted(obj, limit = 6) { return Object.entries(obj || {}).filter(x => Number(x[1]) > 0).sort((a,b) => b[1] - a[1]).slice(0, limit); }
function top(obj) { return sorted(obj, 1)[0]; }
function safeName(x) { return String(x || 'Без значения'); }

function cardShell(meta, badgeLabel, badgeValue, body) {
  app.innerHTML = `
    <section class="card">
      <div class="inner">
        <header class="header">
          <div>
            <p class="kicker">${meta.kicker || 'Finance'}</p>
            <h1 class="title">${meta.title}</h1>
            <p class="subtitle">${meta.subtitle}</p>
          </div>
          <div class="badge"><span>${badgeLabel}</span><strong>${badgeValue}</strong></div>
        </header>
        ${body}
      </div>
    </section>`;
}

function renderRank(meta, source, totalValue, accent = 'blue') {
  const rows = sorted(source, 7);
  const max = Math.max(...rows.map(r => Number(r[1] || 0)), 1);
  const badge = rows[0] ? pct(rows[0][1], totalValue) : '0%';
  const body = `<div class="rank-list">${rows.map((r, i) => `
    <div class="rank-row">
      <div class="rank-name">${safeName(r[0])}</div>
      <div class="track"><div class="fill" style="width:${Math.max(4, Math.round(Number(r[1]) / max * 100))}%;background:linear-gradient(90deg, ${colors[i % colors.length]}, ${colors[(i + 1) % colors.length]})"></div></div>
      <div class="rank-value">${rub(r[1])}</div>
    </div>`).join('')}</div>`;
  cardShell(meta, rows[0] ? safeName(rows[0][0]) : 'Топ', badge, body);
}

function renderDonutLayout(meta, source, totalValue) {
  const rows = sorted(source, 6);
  const main = rows[0];
  const body = `<div class="split"><div class="donut-box"><canvas id="chart"></canvas></div><div class="legend-list">${rows.map((r, i) => `
    <div class="legend-row"><span class="dot" style="background:${colors[i % colors.length]}"></span><span>${safeName(r[0])}</span><strong>${pct(r[1], totalValue)}</strong></div>`).join('')}</div></div>`;
  cardShell(meta, main ? safeName(main[0]) : 'Доля', main ? pct(main[1], totalValue) : '0%', body);
  drawDonut(rows, totalValue);
}

function renderOverview(data) {
  const net = data.totals.net || 0;
  const body = `<div><div class="kpi-row">
    <div class="kpi"><span>Доходы</span><strong style="color:#4ade80">${rub(data.totals.income)}</strong></div>
    <div class="kpi"><span>Расходы</span><strong style="color:#fb7185">${rub(data.totals.expenses)}</strong></div>
    <div class="kpi"><span>Баланс</span><strong style="color:${net >= 0 ? '#4ade80' : '#fb7185'}">${rub(net)}</strong></div>
  </div><div class="chart-wrap" style="height:calc(100% - 94px);margin-top:12px"><canvas id="chart"></canvas></div></div>`;
  cardShell({ kicker: 'Financial overview', title: 'Финансовый обзор', subtitle: net >= 0 ? 'Период закрывается в плюс' : 'Расходы выше доходов за период' }, 'Операций', num(data.counts.expenses || 0), body);
  drawMonthly(data);
}
