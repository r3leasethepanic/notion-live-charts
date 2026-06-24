Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = 'rgba(15,23,42,0.08)';

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
      labels: { color: '#64748b', boxWidth: 9, boxHeight: 9, usePointStyle: true, font: { size: 11, weight: 600 } }
    },
    tooltip: {
      backgroundColor: '#0f172a',
      titleColor: '#ffffff',
      bodyColor: '#ffffff',
      borderColor: 'rgba(15,23,42,0.14)',
      borderWidth: 1,
      cornerRadius: 12,
      padding: 11
    }
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11, weight: 600 } }, border: { display: false } },
    y: { grid: { color: 'rgba(15,23,42,0.08)' }, ticks: { color: '#64748b', font: { size: 11, weight: 600 }, callback: moneyTick }, border: { display: false } }
  }
};

function drawMonthly(data) {
  const m = data.monthly || [];
  chart = new Chart(document.getElementById('chart'), {
    type: 'bar',
    data: {
      labels: m.map(r => r.month),
      datasets: [
        { type: 'bar', label: 'Доходы', data: m.map(r => r.income), backgroundColor: 'rgba(34,197,94,0.24)', borderColor: '#22c55e', borderWidth: 1, borderRadius: 9, barPercentage: 0.62, categoryPercentage: 0.58 },
        { type: 'bar', label: 'Оплачено', data: m.map(r => r.paidExpenses ?? r.expenses), backgroundColor: 'rgba(244,63,94,0.22)', borderColor: '#f43f5e', borderWidth: 1, borderRadius: 9, barPercentage: 0.62, categoryPercentage: 0.58 },
        { type: 'bar', label: 'Запланировано', data: m.map(r => r.plannedExpenses || 0), backgroundColor: 'rgba(245,158,11,0.22)', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 9, barPercentage: 0.62, categoryPercentage: 0.58 },
        { type: 'line', label: 'Прогноз', data: m.map(r => r.forecastNet ?? r.net), borderColor: '#3b82f6', backgroundColor: '#3b82f6', pointBackgroundColor: '#3b82f6', pointBorderColor: '#ffffff', pointBorderWidth: 1.5, pointRadius: 3.5, borderWidth: 2.5, tension: 0.35 }
      ]
    },
    options: { ...baseOptions, interaction: { intersect: false, mode: 'index' }, plugins: { ...baseOptions.plugins, tooltip: { ...baseOptions.plugins.tooltip, callbacks: { label: c => c.dataset.label + ': ' + rub(c.parsed.y) } } } }
  });
}

function drawDonut(rows, totalValue) {
  chart = new Chart(document.getElementById('chart'), {
    type: 'doughnut',
    data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[1]), backgroundColor: rows.map((_, i) => colors[i % colors.length] + '55'), borderColor: rows.map((_, i) => colors[i % colors.length]), borderWidth: 1.5, hoverOffset: 3 }] },
    options: { ...baseOptions, cutout: '72%', scales: {}, plugins: { ...baseOptions.plugins, legend: { display: false }, tooltip: { ...baseOptions.plugins.tooltip, callbacks: { label: c => c.label + ': ' + rub(c.raw) } } } }
  });
}

function route(data) {
  const paidTotal = data.totals.paidExpenses ?? data.totals.expenses ?? total(data.expensesByCategory);
  if (view === 'monthly') return renderOverview(data);
  if (view === 'category') return renderRank({ title: 'Куда уходят деньги' }, data.expensesByCategory, paidTotal);
  if (view === 'income') return renderRank({ title: 'Источники дохода' }, data.incomeBySource, data.totals.income || total(data.incomeBySource));
  if (view === 'payer') return renderDonutLayout({ title: 'Кто тратит' }, data.expensesByPayer, paidTotal);
  if (view === 'type') return renderDonutLayout({ title: 'Тип расходов' }, data.expensesByType, paidTotal);
  if (view === 'required') return renderDonutLayout({ title: 'Обязательные расходы' }, data.expensesByRequired, paidTotal);
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
