Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(148,163,184,0.12)';

function moneyTick(value) {
  value = Number(value || 0);
  if (Math.abs(value) >= 1000000) return Math.round(value / 1000000) + ' млн';
  if (Math.abs(value) >= 1000) return Math.round(value / 1000) + ' тыс';
  return String(Math.round(value));
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: {
      labels: { color: '#94a3b8', boxWidth: 9, boxHeight: 9, usePointStyle: true, font: { size: 11, weight: 600 } }
    },
    tooltip: {
      backgroundColor: 'rgba(7,17,31,0.96)',
      titleColor: '#f8fafc',
      bodyColor: '#f8fafc',
      borderColor: 'rgba(148,163,184,0.24)',
      borderWidth: 1,
      cornerRadius: 12,
      padding: 11
    }
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11, weight: 600 } }, border: { display: false } },
    y: { grid: { color: 'rgba(148,163,184,0.12)' }, ticks: { color: '#94a3b8', font: { size: 11, weight: 600 }, callback: moneyTick }, border: { display: false } }
  }
};

function drawMonthly(data) {
  const m = data.monthly || [];
  chart = new Chart(document.getElementById('chart'), {
    type: 'bar',
    data: {
      labels: m.map(r => r.month),
      datasets: [
        { type: 'bar', label: 'Доходы', data: m.map(r => r.income), backgroundColor: 'rgba(74,222,128,0.32)', borderColor: '#4ade80', borderWidth: 1, borderRadius: 9, barPercentage: 0.65, categoryPercentage: 0.62 },
        { type: 'bar', label: 'Расходы', data: m.map(r => r.expenses), backgroundColor: 'rgba(251,113,133,0.28)', borderColor: '#fb7185', borderWidth: 1, borderRadius: 9, barPercentage: 0.65, categoryPercentage: 0.62 },
        { type: 'line', label: 'Баланс', data: m.map(r => r.net), borderColor: '#60a5fa', backgroundColor: '#60a5fa', pointBackgroundColor: '#60a5fa', pointBorderColor: 'rgba(255,255,255,0.9)', pointBorderWidth: 1.5, pointRadius: 3.5, borderWidth: 2.5, tension: 0.35 }
      ]
    },
    options: { ...baseOptions, interaction: { intersect: false, mode: 'index' }, plugins: { ...baseOptions.plugins, tooltip: { ...baseOptions.plugins.tooltip, callbacks: { label: c => c.dataset.label + ': ' + rub(c.parsed.y) } } } }
  });
}

function drawDonut(rows, totalValue) {
  chart = new Chart(document.getElementById('chart'), {
    type: 'doughnut',
    data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[1]), backgroundColor: rows.map((_, i) => colors[i % colors.length] + '66'), borderColor: rows.map((_, i) => colors[i % colors.length]), borderWidth: 1.5, hoverOffset: 3 }] },
    options: { ...baseOptions, cutout: '72%', scales: {}, plugins: { ...baseOptions.plugins, legend: { display: false }, tooltip: { ...baseOptions.plugins.tooltip, callbacks: { label: c => c.label + ': ' + rub(c.raw) } } } }
  });
}

function route(data) {
  const expenseTotal = data.totals.expenses || total(data.expensesByCategory);
  if (view === 'monthly') return renderOverview(data);
  if (view === 'category') return renderRank({ kicker: 'Expense breakdown', title: 'Куда уходят деньги', subtitle: 'Рейтинг категорий по сумме расходов' }, data.expensesByCategory, expenseTotal);
  if (view === 'income') return renderRank({ kicker: 'Revenue sources', title: 'Источники дохода', subtitle: 'Структура поступлений за период' }, data.incomeBySource, data.totals.income || total(data.incomeBySource));
  if (view === 'payer') return renderDonutLayout({ kicker: 'Spending owners', title: 'Кто тратит', subtitle: 'Доля расходов по участникам' }, data.expensesByPayer, expenseTotal);
  if (view === 'type') return renderDonutLayout({ kicker: 'Expense type', title: 'Тип расходов', subtitle: 'Структура расходов по типу' }, data.expensesByType, expenseTotal);
  if (view === 'required') return renderDonutLayout({ kicker: 'Fixed load', title: 'Обязательные расходы', subtitle: 'Какая часть бюджета уходит на обязательное' }, data.expensesByRequired, expenseTotal);
  return renderOverview(data);
}

async function load() {
  try {
    const baseUrl = window.NOTION_CHARTS_API_URL || location.origin;
    const res = await fetch(baseUrl.replace(/\/$/, '') + '/api/summary?ts=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || 'HTTP ' + res.status);
    route(data);
  } catch (e) {
    app.innerHTML = '<section class="loader">Не удалось загрузить данные: ' + e.message + '</section>';
  }
}

load();
setInterval(load, 15000);
