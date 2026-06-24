const NOTION_VERSION = '2025-09-03';

const IDS = {
  expenses: 'c6466c54-4c7d-4753-8284-8d55207b8f46',
  recurring: '5f612960-373f-4ec5-b765-2c6e9a358851',
  categories: '29d24cac-216f-4334-aa4a-d98bc6302014',
};

const P = {
  title: 'Расход',
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
function key(dateLike) { const d = new Date(dateLike); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
function ymd(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
function dueDate(year, month, day) { const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); return new Date(Date.UTC(year, month, Math.min(Math.max(1, day || 1), last))); }
function monthsBetween(a, b) { return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()); }
function monthName(date) { return ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'][date.getUTCMonth()] + ' ' + date.getUTCFullYear(); }

function shouldCreate(frequency, due, existingDates) {
  const freq = String(frequency || '').toLowerCase();
  if (!freq || freq.includes('другое')) return false;
  if (existingDates.some(d => key(d) === key(due))) return false;
  if (freq.includes('квартал')) return !existingDates.some(d => monthsBetween(new Date(d), due) >= 0 && monthsBetween(new Date(d), due) < 3);
  if (freq.includes('год')) return !existingDates.some(d => monthsBetween(new Date(d), due) >= 0 && monthsBetween(new Date(d), due) < 12);
  return true;
}

async function createExpense(env, expensesId, properties) {
  return notion(env, '/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { data_source_id: expensesId }, properties }),
  });
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
  const existingByRecurring = {};
  for (const row of expenseRows) {
    const props = row.properties || {};
    const date = propDate(props[P.date]);
    if (!date) continue;
    for (const id of relIds(props[P.recurring])) (existingByRecurring[id] ||= []).push(date);
  }

  const now = new Date();
  const dueYear = now.getUTCFullYear();
  const dueMonth = now.getUTCMonth();
  const result = { dryRun: !!opts.dryRun, created: [], skipped: [] };

  for (const row of recurringRows) {
    const props = row.properties || {};
    const title = text(props[RP.title]) || 'Регулярный платеж';
    const status = text(props[RP.status]);
    const amount = number(props[RP.amount]);
    const frequency = text(props[RP.frequency]);
    const day = Math.round(number(props[RP.day]) || 1);

    if (status !== 'Активен') { result.skipped.push({ title, reason: `status:${status}` }); continue; }
    if (!amount) { result.skipped.push({ title, reason: 'no_amount' }); continue; }

    const due = dueDate(dueYear, dueMonth, day);
    if (!shouldCreate(frequency, due, existingByRecurring[row.id] || [])) { result.skipped.push({ title, reason: 'already_exists_or_not_due' }); continue; }

    const expenseTitle = `${title} — ${monthName(due)}`;
    const categoryNames = relIds(props[RP.category]).map(id => categoryById[id]).filter(Boolean);
    const accountIds = relIds(props[RP.account]);
    const requiredName = text(props[RP.required]);

    const expenseProps = {
      [P.title]: { title: [{ text: { content: expenseTitle } }] },
      [P.amount]: { number: amount },
      [P.date]: { date: { start: ymd(due) } },
      [P.status]: { select: { name: 'Запланировано' } },
      [P.payer]: { select: { name: env.RECURRING_DEFAULT_PAYER || 'Я' } },
      [P.type]: { select: { name: env.RECURRING_DEFAULT_EXPENSE_TYPE || 'Семейный' } },
      [P.recurring]: { relation: [{ id: row.id }] },
    };
    if (requiredName) expenseProps[P.required] = { select: { name: requiredName } };
    if (categoryNames.length) expenseProps[P.category] = { multi_select: categoryNames.map(name => ({ name })) };
    if (accountIds.length) expenseProps[P.account] = { relation: accountIds.map(id => ({ id })) };

    if (!opts.dryRun) await createExpense(env, expensesId, expenseProps);
    result.created.push({ title: expenseTitle, amount, date: ymd(due), frequency });
  }
  return result;
}
