const charts = {};
const formatRub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
let lastPayload = null;

const view = new URLSearchParams(window.location.search).get('view') || 'dashboard';
const viewToChartId = {
  monthly: 'monthlyChart',
  category: 'categoryChart',
  income: 'incomeSourceChart',
  payer: 'payerChart',
  type: 'expenseTypeChart',
  required: 'requiredChart',
};

if (view !== 'dashboard') {
  document.body.classList.add('single-view');
}

function applyViewMode() {
  if (view === 'dashboard') return;
  const activeId = viewToChartId[view] || 'monthlyChart';
  document.querySelectorAll('.chart-card').forEach(card => {
    if (card.querySelector(`#${activeId}`)) card.classList.add('active-chart');
    else card.classList.remove('active-chart');
  });
}

function status(message, isError = false) {
  const el = document.getElementById('status');
  el.textContent = message;
  el.classList.add('visible');
  el.classList.toggle('error', isError);
}

function clearStatus() {
  document.getElementById('status').classList.remove('visible', 'error');
}

function destroy(id) {
  if (charts[id]) charts[id].destroy();
}

function makeChart(id, config) {
  destroy(id);
  charts[id] = new Chart(document.getElementById(id), config);
}

function entries(obj, limit = 10) {
  return Object.entries(obj || {}).filter(([, v]) => Number(v) > 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function moneyTick(value) {
  if (typeof value !== 'number') return value;
  if (Math.abs(value) >= 1000000) return `${Math.round(value / 1000000)} млн ₽`;
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)} тыс ₽`;
  return `${Math.round(value)} ₽`;
}

function setKpis(data) {
  document.getElementById('totalExpenses').textContent = formatRub.format(data.totals?.expenses || 0);
  document.getElementById('totalIncome').textContent = formatRub.format(data.totals?.income || 0);
  document.getElementById('netBalance').textContent = formatRub.format(data.totals?.net || 0);
  document.getElementById('expenseCount').textContent = String(data.counts?.expenses || 0);
}

const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { labels: { boxWidth: 10, usePointStyle: true } },
  },
};

function renderMonthly(data) {
  const rows = data.monthly || [];
  makeChart('monthlyChart', {
    type: 'line',
    data: {
      labels: rows.map(r => r.month),
      datasets: [
        { label: 'Доходы', data: rows.map(r => r.income), tension: 0.28, borderWidth: 2, pointRadius: 2 },
        { label: 'Расходы', data: rows.map(r => r.expenses), tension: 0.28, borderWidth: 2, pointRadius: 2 },
        { label: 'Баланс', data: rows.map(r => r.net), tension: 0.28, borderWidth: 2, pointRadius: 2 },
      ],
    },
    options: {
      ...commonOptions,
      interaction: { mode: 'index', intersect: false },
      scales: { y: { ticks: { callback: moneyTick } } },
      plugins: { ...commonOptions.plugins, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatRub.format(ctx.parsed.y)}` } } },
    },
  });
}

function renderBar(id, label, rows) {
  makeChart(id, {
    type: 'bar',
    data: { labels: rows.map(([name]) => name), datasets: [{ label, data: rows.map(([, value]) => value), borderRadius: 8 }] },
    options: {
      ...commonOptions,
      indexAxis: rows.length > 5 ? 'y' : 'x',
      scales: {
        x: { ticks: { callback: moneyTick } },
        y: { ticks: { callback: moneyTick } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => formatRub.format(ctx.raw || 0) } } },
    },
  });
}

function renderDoughnut(id, label, rows) {
  makeChart(id, {
    type: 'doughnut',
    data: { labels: rows.map(([name]) => name), datasets: [{ label, data: rows.map(([, value]) => value) }] },
    options: {
      ...commonOptions,
      cutout: '62%',
      plugins: { ...commonOptions.plugins, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatRub.format(ctx.raw || 0)}` } } },
    },
  });
}

function render(data) {
  Chart.defaults.font.family = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  setKpis(data);
  renderMonthly(data);
  renderDoughnut('categoryChart', 'Расходы', entries(data.expensesByCategory, 8));
  renderBar('incomeSourceChart', 'Доходы', entries(data.incomeBySource, 8));
  renderBar('payerChart', 'Расходы', entries(data.expensesByPayer, 8));
  renderDoughnut('expenseTypeChart', 'Расходы', entries(data.expensesByType, 8));
  renderBar('requiredChart', 'Расходы', entries(data.expensesByRequired, 8));
  applyViewMode();
}

function payloadChanged(nextPayload) {
  const next = JSON.stringify(nextPayload);
  const prev = JSON.stringify(lastPayload);
  lastPayload = nextPayload;
  return next !== prev;
}

async function loadData({ silent = false } = {}) {
  const baseUrl = window.NOTION_CHARTS_API_URL || window.location.origin;
  if (!silent) status('Загружаю свежие данные из Notion…');
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/summary?ts=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    if (payloadChanged(data) || !silent) render(data);
    clearStatus();
  } catch (error) {
    status(`Не удалось загрузить данные: ${error.message}`, true);
  }
}

document.getElementById('refreshButton').addEventListener('click', () => loadData());
loadData();
setInterval(() => loadData({ silent: true }), 15000);
window.addEventListener('focus', () => loadData({ silent: true }));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadData({ silent: true });
});
window.addEventListener('pageshow', () => loadData({ silent: true }));
