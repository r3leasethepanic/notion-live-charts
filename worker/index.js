const NOTION_VERSION = '2025-09-03';

const DEFAULTS = {
  expensesDataSourceId: 'c6466c54-4c7d-4753-8284-8d55207b8f46',
  incomeDataSourceId: '54e91f62-f449-469e-894a-f6d0a1f6b6f1',
  expenseTitleProperty: 'Наименование',
  expenseAmountProperty: 'Сумма',
  expenseDateProperty: 'Дата',
  expenseCategoryProperty: 'Категория',
  expensePayerProperty: 'Кто потратил',
  expenseTypeProperty: 'Тип расхода',
  expenseStatusProperty: 'Статус',
  expenseRequiredProperty: 'Обязательность',
  incomeAmountProperty: 'Сумма',
  incomeDateProperty: 'Дата',
  incomeSourceProperty: 'Источник',
};

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': `public, max-age=${Number(env.CACHE_SECONDS || 60)}`,
  };
}

function json(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(env) },
  });
}

function envOrDefault(env, key, fallback) { return env[key] || fallback; }
function required(env, key) { if (!env[key]) throw new Error(`Missing required environment variable: ${key}`); return env[key]; }
function richText(items) { return (items || []).map(part => part.plain_text || '').join('').trim(); }

function propText(prop) {
  if (!prop) return 'Без значения';
  switch (prop.type) {
    case 'title': return richText(prop.title) || 'Без названия';
    case 'rich_text': return richText(prop.rich_text) || 'Без значения';
    case 'select': return prop.select?.name || 'Без значения';
    case 'status': return prop.status?.name || 'Без значения';
    case 'multi_select': return (prop.multi_select || []).map(i => i.name).join(', ') || 'Без значения';
    case 'date': return prop.date?.start || 'Без даты';
    case 'number': return prop.number == null ? '0' : String(prop.number);
    case 'checkbox': return prop.checkbox ? 'Да' : 'Нет';
    case 'url': return prop.url || 'Без значения';
    case 'email': return prop.email || 'Без значения';
    case 'phone_number': return prop.phone_number || 'Без значения';
    case 'formula': return propText(prop.formula);
    case 'rollup': {
      const rollup = prop.rollup;
      if (!rollup) return 'Без значения';
      if (rollup.type === 'number') return rollup.number == null ? '0' : String(rollup.number);
      if (rollup.type === 'date') return rollup.date?.start || 'Без даты';
      if (rollup.type === 'array') return (rollup.array || []).map(propText).filter(Boolean).join(', ') || 'Без значения';
      return 'Без значения';
    }
    case 'relation': return prop.relation?.length ? `${prop.relation.length} связ.` : 'Без значения';
    case 'people': return (prop.people || []).map(p => p.name || p.id).join(', ') || 'Без значения';
    default: return 'Без значения';
  }
}

function propNumber(prop) {
  if (!prop) return 0;
  if (prop.type === 'number') return Number(prop.number || 0);
  if (prop.type === 'formula' && prop.formula?.type === 'number') return Number(prop.formula.number || 0);
  if (prop.type === 'rollup' && prop.rollup?.type === 'number') return Number(prop.rollup.number || 0);
  const text = propText(prop).replace(/[^0-9.,-]/g, '').replace(',', '.');
  return Number(text || 0) || 0;
}

function propDate(prop) {
  if (!prop) return null;
  if (prop.type === 'date') return prop.date?.start || null;
  if (prop.type === 'formula' && prop.formula?.type === 'date') return prop.formula.date?.start || null;
  if (prop.type === 'rollup' && prop.rollup?.type === 'date') return prop.rollup.date?.start || null;
  const text = propText(prop);
  return text && text !== 'Без даты' ? text : null;
}

function monthKey(dateLike) {
  if (!dateLike) return 'Без даты';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return 'Без даты';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function add(map, key, amount) { map[key || 'Без значения'] = Number((map[key || 'Без значения'] || 0) + (amount || 0)); }
function isPaid(status) { return String(status || '').toLowerCase().trim() === 'оплачено'; }
function isPlanned(status) { return String(status || '').toLowerCase().trim() === 'запланировано'; }

async function queryDataSource(env, id) {
  const token = required(env, 'NOTION_TOKEN');
  let cursor;
  const results = [];
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${id}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) throw new Error(`Notion API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

function emptyExpenseSummary() {
  return { total: 0, count: 0, byMonth: {}, byCategory: {}, byPayer: {}, byType: {}, byStatus: {}, byRequired: {} };
}

function addExpenseBucket(out, amount, month, category, payer, type, status, required) {
  out.total += amount;
  out.count += 1;
  add(out.byMonth, month, amount);
  add(out.byCategory, category, amount);
  add(out.byPayer, payer, amount);
  add(out.byType, type, amount);
  add(out.byStatus, status, amount);
  add(out.byRequired, required, amount);
}

function summarizeExpenses(rows, env) {
  const amountProp = envOrDefault(env, 'EXPENSE_AMOUNT_PROPERTY', DEFAULTS.expenseAmountProperty);
  const dateProp = envOrDefault(env, 'EXPENSE_DATE_PROPERTY', DEFAULTS.expenseDateProperty);
  const categoryProp = envOrDefault(env, 'EXPENSE_CATEGORY_PROPERTY', DEFAULTS.expenseCategoryProperty);
  const payerProp = envOrDefault(env, 'EXPENSE_PAYER_PROPERTY', DEFAULTS.expensePayerProperty);
  const typeProp = envOrDefault(env, 'EXPENSE_TYPE_PROPERTY', DEFAULTS.expenseTypeProperty);
  const statusProp = envOrDefault(env, 'EXPENSE_STATUS_PROPERTY', DEFAULTS.expenseStatusProperty);
  const requiredProp = envOrDefault(env, 'EXPENSE_REQUIRED_PROPERTY', DEFAULTS.expenseRequiredProperty);
  const out = { all: emptyExpenseSummary(), paid: emptyExpenseSummary(), planned: emptyExpenseSummary() };

  for (const row of rows) {
    const p = row.properties || {};
    const amount = propNumber(p[amountProp]);
    if (!amount) continue;
    const month = monthKey(propDate(p[dateProp]));
    const category = propText(p[categoryProp]);
    const payer = propText(p[payerProp]);
    const type = propText(p[typeProp]);
    const status = propText(p[statusProp]);
    const required = propText(p[requiredProp]);

    addExpenseBucket(out.all, amount, month, category, payer, type, status, required);
    if (isPaid(status)) addExpenseBucket(out.paid, amount, month, category, payer, type, status, required);
    else if (isPlanned(status)) addExpenseBucket(out.planned, amount, month, category, payer, type, status, required);
  }
  return out;
}

function summarizeIncome(rows, env) {
  const amountProp = envOrDefault(env, 'INCOME_AMOUNT_PROPERTY', DEFAULTS.incomeAmountProperty);
  const dateProp = envOrDefault(env, 'INCOME_DATE_PROPERTY', DEFAULTS.incomeDateProperty);
  const sourceProp = envOrDefault(env, 'INCOME_SOURCE_PROPERTY', DEFAULTS.incomeSourceProperty);
  const out = { total: 0, count: 0, byMonth: {}, bySource: {} };
  for (const row of rows) {
    const p = row.properties || {};
    const amount = propNumber(p[amountProp]);
    if (!amount) continue;
    out.total += amount;
    out.count += 1;
    add(out.byMonth, monthKey(propDate(p[dateProp])), amount);
    add(out.bySource, propText(p[sourceProp]), amount);
  }
  return out;
}

function monthly(paidByMonth, plannedByMonth, incomeByMonth) {
  return Array.from(new Set([...Object.keys(paidByMonth || {}), ...Object.keys(plannedByMonth || {}), ...Object.keys(incomeByMonth || {})])).sort().map(month => {
    const expenses = Number(paidByMonth[month] || 0);
    const plannedExpenses = Number(plannedByMonth[month] || 0);
    const income = Number(incomeByMonth[month] || 0);
    return { month, expenses, paidExpenses: expenses, plannedExpenses, allExpenses: expenses + plannedExpenses, income, net: income - expenses, forecastNet: income - expenses - plannedExpenses };
  });
}

async function summary(env) {
  const expensesId = envOrDefault(env, 'NOTION_EXPENSES_DATA_SOURCE_ID', DEFAULTS.expensesDataSourceId);
  const incomeId = envOrDefault(env, 'NOTION_INCOME_DATA_SOURCE_ID', DEFAULTS.incomeDataSourceId);
  const [expenseRows, incomeRows] = await Promise.all([queryDataSource(env, expensesId), queryDataSource(env, incomeId)]);
  const expenses = summarizeExpenses(expenseRows, env);
  const income = summarizeIncome(incomeRows, env);
  return {
    generatedAt: new Date().toISOString(),
    counts: { expenses: expenses.paid.count, plannedExpenses: expenses.planned.count, allExpenses: expenses.all.count, income: income.count },
    totals: {
      expenses: Math.round(expenses.paid.total),
      paidExpenses: Math.round(expenses.paid.total),
      plannedExpenses: Math.round(expenses.planned.total),
      allExpenses: Math.round(expenses.all.total),
      income: Math.round(income.total),
      net: Math.round(income.total - expenses.paid.total),
      forecastNet: Math.round(income.total - expenses.paid.total - expenses.planned.total),
    },
    monthly: monthly(expenses.paid.byMonth, expenses.planned.byMonth, income.byMonth),
    expensesByCategory: expenses.paid.byCategory,
    expensesByCategoryPlanned: expenses.planned.byCategory,
    expensesByPayer: expenses.paid.byPayer,
    expensesByPayerPlanned: expenses.planned.byPayer,
    expensesByType: expenses.paid.byType,
    expensesByTypePlanned: expenses.planned.byType,
    expensesByStatus: expenses.all.byStatus,
    expensesByRequired: expenses.paid.byRequired,
    expensesByRequiredPlanned: expenses.planned.byRequired,
    incomeBySource: income.bySource,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(env) });
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/health') return json({ ok: true, service: 'notion-live-charts', notionVersion: NOTION_VERSION }, 200, env);
      if (url.pathname === '/api/summary') return json(await summary(env), 200, env);
      return json({ ok: false, error: 'Not found' }, 404, env);
    } catch (error) {
      return json({ ok: false, error: error.message }, 500, env);
    }
  },
};
