const app = document.getElementById('app');
const rubFmt = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const colors = ['#3b82f6', '#22c55e', '#8b5cf6', '#06b6d4', '#f59e0b', '#f43f5e', '#ec4899'];
const view = window.MODERN_VIEW || new URLSearchParams(location.search).get('view') || 'overview';
let chart;
function rub(v) { return rubFmt.format(Math.round(Number(v || 0))); }
function num(v) { return numFmt.format(Math.round(Number(v || 0))); }
function pct(v, total) { return total ? Math.round(Number(v || 0) / total * 100) + '%' : '0%'; }
function total(obj) { return Object.values(obj || {}).reduce((s, v) => s + Number(v || 0), 0); }
function sorted(obj, limit = 6) { return Object.entries(obj || {}).filter(x => Number(x[1]) > 0).sort((a,b) => b[1] - a[1]).slice(0, limit); }
function safeName(x) { return String(x || 'Без значения'); }
function cardShell(meta, badgeLabel, badgeValue, body) { app.innerHTML = `<section class="card"><div class="inner"><header class="header"><h1 class="title">${meta.title}</h1></header>${body}</div></section>`; }
function renderRank(meta, source, totalValue) {
  const rankRows = sorted(source, 7);
  const maxValue = Math.max(...rankRows.map(r => Number(r[1] || 0)), 1);
  const body = `<div class="rank-list">${rankRows.map((r, i) => `<div class="rank-row"><div class="rank-name">${safeName(r[0])}</div><div class="track"><div class="fill" style="width:${Math.max(4, Math.round(Number(r[1]) / maxValue * 100))}%;background:linear-gradient(90deg, ${colors[i % colors.length]}, ${colors[(i + 1) % colors.length]})"></div></div><div class="rank-value">${rub(r[1])}</div></div>`).join('')}</div>`;
  cardShell(meta, '', '', body);
}
function renderDonutLayout(meta, source, totalValue) {
  const donutRows = sorted(source, 6);
  const body = `<div class="split"><div class="donut-box"><canvas id="chart"></canvas></div><div class="legend-list">${donutRows.map((r, i) => `<div class="legend-row"><span class="dot" style="background:${colors[i % colors.length]}"></span><span>${safeName(r[0])}</span><strong>${pct(r[1], totalValue)}</strong></div>`).join('')}</div></div>`;
  cardShell(meta, '', '', body);
  drawDonut(donutRows, totalValue);
}
function renderOverview(data) {
  const net = data.totals.net || 0;
  const body = `<div><div class="kpi-row"><div class="kpi"><span>Доходы</span><strong style="color:#22c55e">${rub(data.totals.income)}</strong></div><div class="kpi"><span>Расходы</span><strong style="color:#f43f5e">${rub(data.totals.expenses)}</strong></div><div class="kpi"><span>Баланс</span><strong style="color:${net >= 0 ? '#22c55e' : '#f43f5e'}">${rub(net)}</strong></div></div><div class="chart-wrap" style="height:calc(100% - 94px);margin-top:12px"><canvas id="chart"></canvas></div></div>`;
  cardShell({ title: 'Финансовый обзор' }, '', '', body);
  drawMonthly(data);
}
