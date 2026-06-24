const charts = {};
const formatRub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const formatPlain = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
let lastPayload = null;

const palette = {
  income: '#34a853',
  expense: '#ea4335',
  net: '#1f2328',
  blue: '#4285f4',
  amber: '#fbbc04',
  purple: '#8b5cf6',
  teal: '#14b8a6',
  pink: '#ec4899',
  gray: '#9ca3af',
  grid: '#eef0f3',
  text: '#1f2328',
  muted: '#6b7280',
};

const chartColors = [palette.blue, palette.amber, palette.purple, palette.teal, palette.pink, palette.income, palette.expense, palette.gray];

const view = new URLSearchParams(window.location.search).get('view') || 'dashboard';
const viewToChartId = {
  monthly: 'monthlyChart',
  category: 'categoryChart',
  income: 'incomeSourceChart',
  payer: 'payerChart',
  type: 'expenseTypeChart',
  required: 'requiredChart',
};

if (view !== 'dashboard') document.body.classList.add('single-view');

function applyViewMode() {
  if (view === 'dashboard') return;
  const activeId = viewToChartId[view] || 'monthlyChart';
  document.querySelectorAll('.chart-card').forEach(card => {
    card.classList.toggle('active-chart', Boolean(card.querySelector(`#${activeId}`)));
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

function entries(obj, limit = 8, withOther = true) {
  const rows = Object.entries(obj || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!withOther || rows.length <= limit) return rows.slice(0, limit);

  const visible = rows.slice(0, limit - 1);
  const other = rows.slice(limit - 1).reduce((sum, [, value]) => sum + Number(value || 0), 0);
  if (other > 0) visible.push(['Другое', other]);
  return visible;
}

function total(obj) {
  return Object.values(obj || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function pct(value, base) {
  if (!base) return '0%';
  return `${Math.round((Number(value || 0) / base) * 100)}%`;
}

function moneyTick(value) {
  if (typeof value !== 'number') return value;
  if (Math.abs(value) >= 1000000) return `${Math.round(value / 1000000)} млн`;
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)} тыс`;
  return `${Math.round(value)}`;
}

function rub(value) {
  return formatRub.format(Math.round(Number(value || 0)));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateInsights(data) {
  const expenseTotal = data.totals?.expenses || 0;
  const incomeTotal = data.totals?.income || 0;
  const net = data.totals?.net || 0;

  const categoryTop = entries(data.expensesByCategory, 1, false)[0];
  const incomeTop = entries(data.incomeBySource, 1, false)[0];
  const payerTop = entries(data.expensesByPayer, 1, false)[0];
  const typeTop = entries(data.expensesByType, 1, false)[0];
  const requiredTop = entries(data.expensesByRequired, 1, false)[0];

  setText('monthlyInsight', net >= 0 ? `Плюс ${rub(net)} за период` : `Минус ${rub(Math.abs(net))} за период`);
  setText('categoryInsight', categoryTop ? `${categoryTop[0]} — ${pct(categoryTop[1], expenseTotal)} трат` : 'Нет расходов');
  setText('incomeInsight', incomeTop ? `${incomeTop[0]} — ${pct(incomeTop[1], incomeTotal)} доходов` : 'Нет доходов');
  setText('payerInsight', payerTop ? `${payerTop[0]} — ${pct(payerTop[1], expenseTotal)} трат` : 'Нет расходов');
  setText('typeInsight', typeTop ? `${typeTop[0]} — ${pct(typeTop[1], expenseTotal)}` : 'Нет расходов');
  setText('requiredInsight', requiredTop ? `${requiredTop[0]} — ${pct(requiredTop[1], expenseTotal)}` : 'Нет расходов');
}

function setKpis(data) {
  document.getElementById('totalIncome').textContent = rub(data.totals?.income || 0);
  document.getElementById('totalExpenses').textContent = rub(data.totals?.expenses || 0);
  document.getElementById('netBalance').textContent = rub(data.totals?.net || 0);
  document.getElementById('expenseCount').textContent = String(data.counts?.expenses || 0);
  document.getElementById('netBalance').style.color = (data.totals?.net || 0) >= 0 ? palette.income : palette.expense;
}

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  resizeDelay: 100,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: {
      labels: {
        boxWidth: 9,
        boxHeight: 9,
        usePointStyle: true,
        color: palette.muted,
        font: { size: 11 },
      },
    },
    tooltip: {
      backgroundColor: '#111827',
      titleColor: '#ffffff',
      bodyColor: '#ffffff',
      padding: 10,
      cornerRadius: 10,
      displayColors: true,
    },
  },
  scales: {
    x: {
      grid: { display: false, color: palette.grid },
      ticks: { color: palette.muted, font: { size: 11 } },
      border: { display: false },
    },
    y: {
      grid: { color: palette.grid, drawBorder: false },
      ticks: { color: palette.muted, font: { size: 11 }, callback: moneyTick },
      border: { display: false },
    },
  },
};

const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart, args, opts) {
    if (!opts || !opts.text) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.text;
    ctx.font = '700 18px Inter, system-ui, sans-serif';
    ctx.fillText(opts.text, x, y - 6);
    if (opts.subtext) {
      ctx.fillStyle = palette.muted;
      ctx.font = '500 10px Inter, system-ui, sans-serif';
      ctx.fillText(opts.subtext, x, y + 13);
    }
    ctx.restore();
  },
};

Chart.register(centerTextPlugin);

function renderMonthly(data) {
  const rows = data.monthly || [];
  makeChart('monthlyChart', {
    type: 'bar',
    data: {
      labels: rows.map(row => row.month),
      datasets: [
        {
          type: 'bar',
          label: 'Доходы',
          data: rows.map(row => row.income),
          backgroundColor: 'rgba(52, 168, 83, 0.22)',
          borderColor: palette.income,
          borderWidth: 1,
          borderRadius: 8,
          barPercentage: 0.72,
          categoryPercentage: 0.62,
        },
        {
          type: 'bar',
          label: 'Расходы',
          data: rows.map(row => row.expenses),
          backgroundColor: 'rgba(234, 67, 53, 0.18)',
          borderColor: palette.expense,
          borderWidth: 1,
          borderRadius: 8,
          barPercentage: 0.72,
          categoryPercentage: 0.62,
        },
        {
          type: 'line',
          label: 'Баланс',
          data: rows.map(row => row.net),
          borderColor: palette.net,
          backgroundColor: palette.net,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 4,
          tension: 0.32,
        },
      ],
    },
    options: {
      ...baseChartOptions,
      plugins: {
        ...baseChartOptions.plugins,
        tooltip: {
          ...baseChartOptions.plugins.tooltip,
          callbacks: { label: ctx => `${ctx.dataset.label}: ${rub(ctx.parsed.y)}` },
        },
      },
    },
  });
}

function renderHorizontalBar(id, label, rows, color = palette.blue) {
  makeChart(id, {
    type: 'bar',
    data: {
      labels: rows.map(([name]) => name),
      datasets: [{
        label,
        data: rows.map(([, value]) => value),
        backgroundColor: rows.map((_, index) => `${chartColors[index % chartColors.length]}33`),
        borderColor: rows.map((_, index) => chartColors[index % chartColors.length]),
        borderWidth: 1,
        borderRadius: 9,
        barPercentage: 0.72,
        categoryPercentage: 0.72,
      }],
    },
    options: {
      ...baseChartOptions,
      indexAxis: 'y',
      scales: {
        x: {
          grid: { color: palette.grid, drawBorder: false },
          ticks: { color: palette.muted, font: { size: 11 }, callback: moneyTick },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          ticks: { color: palette.text, font: { size: 11, weight: 600 } },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...baseChartOptions.plugins.tooltip,
          callbacks: { label: ctx => `${label}: ${rub(ctx.raw || 0)}` },
        },
      },
    },
  });
}

function renderDoughnut(id, label, rows, centerValue, subtext) {
  makeChart(id, {
    type: 'doughnut',
    data: {
      labels: rows.map(([name]) => name),
      datasets: [{
        label,
        data: rows.map(([, value]) => value),
        backgroundColor: rows.map((_, index) => `${chartColors[index % chartColors.length]}55`),
        borderColor: rows.map((_, index) => chartColors[index % chartColors.length]),
        borderWidth: 1.5,
        hoverOffset: 3,
      }],
    },
    options: {
      ...baseChartOptions,
      cutout: '70%',
      scales: {},
      plugins: {
        ...baseChartOptions.plugins,
        centerText: { text: centerValue, subtext },
        tooltip: {
          ...baseChartOptions.plugins.tooltip,
          callbacks: { label: ctx => `${ctx.label}: ${rub(ctx.raw || 0)}` },
        },
      },
    },
  });
}

function renderRequired(data) {
  const rows = entries(data.expensesByRequired, 6, false);
  const sum = total(data.expensesByRequired);
  renderDoughnut('requiredChart', 'Расходы', rows, pct(rows[0]?.[1] || 0, sum), rows[0]?.[0] || 'расходов');
}

function render(data) {
  Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  setKpis(data);
  updateInsights(data);

  renderMonthly(data);
  renderHorizontalBar('categoryChart', 'Расходы', entries(data.expensesByCategory, 7, true), palette.blue);
  renderHorizontalBar('incomeSourceChart', 'Доходы', entries(data.incomeBySource, 7, true), palette.income);

  const expenseTotal = data.totals?.expenses || 0;
  const payerRows = entries(data.expensesByPayer, 5, false);
  const typeRows = entries(data.expensesByType, 5, false);
  renderDoughnut('payerChart', 'Расходы', payerRows, pct(payerRows[0]?.[1] || 0, expenseTotal), payerRows[0]?.[0] || 'трат');
  renderDoughnut('expenseTypeChart', 'Расходы', typeRows, pct(typeRows[0]?.[1] || 0, expenseTotal), typeRows[0]?.[0] || 'тип');
  renderRequired(data);

  applyViewMode();
}

function payloadChanged(nextPayload) {
  const next = JSON.stringify(nextPayload);
  const prev = JSON.stringify(lastPayload);
  lastPayload = nextPayload;
  return next !== prev;
}

function updateTimestamp() {
  const now = new Date();
  setText('lastUpdated', `Обновлено ${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`);
}

async function loadData({ silent = false } = {}) {
  const baseUrl = window.NOTION_CHARTS_API_URL || window.location.origin;
  if (!silent) status('Загружаю свежие данные из Notion…');
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/summary?ts=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    if (payloadChanged(data) || !silent) render(data);
    updateTimestamp();
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
