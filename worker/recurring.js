const NOTION_VERSION = '2025-09-03';

const IDS = {
  expenses: 'c6466c54-4c7d-4753-8284-8d55207b8f46',
  recurring: '5f612960-373f-4ec5-b765-2c6e9a358851',
  categories: '29d24cac-216f-4334-aa4a-d98bc6302014',
};

const P = {
  title: 'Наименование',
  amount: 'Сумма',
  date: 'Дата',
  category: 'Категория',
  status: 'Статус',
  payer: 'Кто потратил',
  type: 'Тип расхода',
  required: 'Обязательность',
  recurring: 'Регулярный платеж',
  account: 'Счет / способ оплаты',
};

const RP = {
  title: 'Платеж',
  amount: 'Сумма',
  day: 'День списания',
  frequency: 'Периодичность',
  status: 'Статус',
  required: 'Обязательность',
  category: 'Категория',
  account: 'Счет / способ оплаты',
};

function token(env) {
  if (!env.NOTION_TOKEN) throw new Error('Missing required environment variable: NOTION_TOKEN');
  return env.NOTION_TOKEN;
}

async function notion(env, path, init = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token(env)}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Notion API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function query(env, id) {
  let cursor;
  const out = [];
  do {
    const data = await notion(env, `/data_sources/${id}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    out.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

function rich(items) { return (items || []).map(i => i.plain_text || '').join('').trim(); }
function text(prop) {
  if (!prop) return '';
  if (prop.type === 'title') return rich(prop.title);
  if (prop.type === 'rich_text') return rich(prop.rich_text);
  if (prop.type === 'select') return prop.select?.name || '';
  if (prop.type === 'status') return prop.status?.name || '';
  if (prop.type === 'number') return prop.number == null ? '' : String(prop.number);
  if (prop.type === 'multi_select') return (prop.multi_select || []).map(x => x.name).join(', ');
  if (prop.type === 'date') return prop.date?.start || '';
  return '';
}
function number(prop) { return prop?.type === 'number' ? Number(prop.number || 0) : Number(text(prop).replace(/[^0-9.,-]/g, '').replace(',', '.') || 0); }
function relIds(prop) { return prop?.type === 'relation' ? (prop.relation || []).map(r => r.id) : []; }
function pageTitle(row) { for (const prop of Object.values(row.properties || {})) if (prop?.type === 'title') return text(prop); return 'Без названия'; }
function propDate(prop) { return prop?.type === 'date' ? prop.date?.start || '' : ''; }
function key(dateLike) { const d = new Date(dateLike); return Number.isNaN(d.getTime()) ? '' : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
function ymd(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
function dueDate(year, month, day) { const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); return new Date(Date.UTC(year, month, Math.min(Math.max(1, day || 1), last))); }
function monthName(date) { return ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'][date.getUTCMonth()] + ' ' + date.getUTCFullYear(); }
function selectName(prop) { return prop?.type === 'select' ? prop.select?.name || '' : ''; }
function multiNames(prop) { return prop?.type === 'multi_select' ? (prop.multi_select || []).map(x => x.name).filter(Boolean) : []; }
function latestExpense(rows) { return [...rows].sort((a, b) => String(propDate(b.properties?.[P.date] || '')).localeCompare(String(propDate(a.properties?.[P.date] || ''))))[0]; }

function shouldSkipCurrentMonth(rows, due) {
  return rows.some(row => key(propDate(row.properties?.[P.date])) === key(due));
}

async function createExpense(env, expensesId, properties) {
  return notion(env, '/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { data_source_id: expensesId }, properties }),
  });
}

function propsFromTemplate({ recurringId, recurringRow, expenseTemplate, categoryById, due, env }) {
  const recurringProps = recurringRow?.properties || {};
  const expenseProps = expenseTemplate?.properties || {};
  const title = text(recurringProps[RP.title]) || text(expenseProps[P.title]) || 'Регулярный платеж';
  const amount = number(recurringProps[RP.amount]) || number(expenseProps[P.amount]);
  const categoryNames = relIds(recurringProps[RP.category]).map(id => categoryById[id]).filter(Boolean);
  const expenseCategoryNames = multiNames(expenseProps[P.category]);
  const accountIds = relIds(recurringProps[RP.account]).length ? relIds(recurringProps[RP.account]) : relIds(expenseProps[P.account]);
  const requiredName = selectName(recurringProps[RP.required]) || selectName(expenseProps[P.required]);
  const payerName = selectName(expenseProps[P.payer]) || env.RECURRING_DEFAULT_PAYER || 'Я';
  const typeName = selectName(expenseProps[P.type]) || env.RECURRING_DEFAULT_EXPENSE_TYPE || 'Семейный';

  const out = {
    [P.title]: { title: [{ text: { content: `${title} — ${monthName(due)}` } }] },
    [P.amount]: { number: amount },
    [P.date]: { date: { start: ymd(due) } },
    [P.status]: { select: { name: 'Запланировано' } },
    [P.payer]: { select: { name: payerName } },
    [P.type]: { select: { name: typeName } },
    [P.recurring]: { relation: [{ id: recurringId }] },
  };
  if (requiredName) out[P.required] = { select: { name: requiredName } };
  const finalCategories = categoryNames.length ? categoryNames : expenseCategoryNames;
  if (finalCategories.length) out[P.category] = { multi_select: finalCategories.map(name => ({ name })) };
  if (accountIds.length) out[P.account] = { relation: accountIds.map(id => ({ id })) };
  return { title, amount, properties: out };
}

export async function generateRecurring(env, opts = {}) {
  const expensesId = env.NOTION_EXPENSES_DATA_SOURCE_ID || IDS.expenses;
  const recurringId = env.NOTION_RECURRING_DATA_SOURCE_ID || IDS.recurring;
  const categoriesId = env.NOTION_CATEGORIES_DATA_SOURCE_ID || IDS.categories;
  const [recurringRows, expenseRows, categoryRows] = await Promise.all([
    query(env, recurringId),
    query(env, expensesId),
    categoriesId ? query(env, categoriesId).catch(() => []) : [],
  ]);

  const categoryById = Object.fromEntries((categoryRows || []).map(row => [row.id, pageTitle(row)]));
  const recurringById = Object.fromEntries((recurringRows || []).map(row => [row.id, row]));
  const expenseGroups = {};
  for (const row of expenseRows) {
    for (const id of relIds(row.properties?.[P.recurring])) (expenseGroups[id] ||= []).push(row);
  }

  const now = new Date();
  const dueYear = now.getUTCFullYear();
  const dueMonth = now.getUTCMonth();
  const ids = new Set([...Object.keys(expenseGroups), ...recurringRows.filter(r => text(r.properties?.[RP.status]) === 'Активен').map(r => r.id)]);
  const result = { dryRun: !!opts.dryRun, created: [], skipped: [] };

  for (const id of ids) {
    const recurringRow = recurringById[id];
    const recurringProps = recurringRow?.properties || {};
    const linkedExpenses = expenseGroups[id] || [];
    const template = latestExpense(linkedExpenses);
    const title = text(recurringProps[RP.title]) || text(template?.properties?.[P.title]) || 'Регулярный платеж';
    const status = text(recurringProps[RP.status]) || 'Активен';
    if (status !== 'Активен') { result.skipped.push({ title, reason: `status:${status}` }); continue; }

    const templateDate = propDate(template?.properties?.[P.date]);
    const day = Math.round(number(recurringProps[RP.day]) || (templateDate ? new Date(templateDate).getUTCDate() : 1));
    const due = dueDate(dueYear, dueMonth, day);
    if (shouldSkipCurrentMonth(linkedExpenses, due)) { result.skipped.push({ title, reason: 'already_exists_this_month' }); continue; }

    const built = propsFromTemplate({ recurringId: id, recurringRow, expenseTemplate: template, categoryById, due, env });
    if (!built.amount) { result.skipped.push({ title, reason: 'no_amount' }); continue; }
    if (!opts.dryRun) await createExpense(env, expensesId, built.properties);
    result.created.push({ title: `${built.title} — ${monthName(due)}`, amount: built.amount, date: ymd(due) });
  }
  return result;
}
