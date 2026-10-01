const JOBS_SHEET = 'Jobs Master';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Anchor Posters')
    .addItem('Generate from selected rows', 'generatePosterFromSelection')
    .addToUi();
}

function generatePosterFromSelection() {
  const sheet = SpreadsheetApp.getActive().getActiveSheet();
  if (sheet.getName() !== JOBS_SHEET) throw new Error(`Select rows in ${JOBS_SHEET}.`);
  const range = sheet.getActiveRange();
  if (range.getRow() < 2 || range.getNumRows() > 4) throw new Error('Select 1–4 complete job rows.');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const rows = sheet.getRange(range.getRow(), 1, range.getNumRows(), sheet.getLastColumn()).getDisplayValues();
  const objects = rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
  if (objects.some(r => r['Review Status'] !== 'Approved')) throw new Error('Every selected job must be Approved.');

  const countries = [...new Set(objects.map(r => r.Country).filter(Boolean))];
  if (countries.length !== 1) throw new Error('Selected rows must belong to one country.');
  const props = PropertiesService.getScriptProperties();
  const roleFamily = objects[0]['Role Family'] || objects[0].Industry || 'GENERAL';
  const hero = props.getProperty(`HERO_${String(roleFamily).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`) || props.getProperty('HERO_GENERAL');

  const facts = buildFacts_(objects[0]);
  const payload = {
    orderCode: objects[0]['Source Employer Code'] || objects[0]['Job ID'],
    country: countries[0],
    headline: `${objects.length > 1 ? 'MULTIPLE ' : ''}RECRUITMENT OPPORTUNITY IN ${countries[0]}`,
    status: 'Recruiting',
    heroImageUrl: hero || requiredProperty_(props, 'HERO_GENERAL'),
    roles: objects.map(r => ({
      title: r.Position,
      vacancies: valid_(r.Vacancies) ? r.Vacancies : '',
      localSalary: salaryLocal_(r),
      inrSalary: requiredValue_(r['Salary in INR'], 'Salary in INR')
    })),
    facts
  };
  validatePayload_(payload);
  dispatch_(payload, props);
  SpreadsheetApp.getUi().alert('Poster queued for rendering. It will enter 01_INBOX_JOB_POSTERS and then the existing approval workflow.');
}

function buildFacts_(r) {
  const candidates = [
    ['Experience', years_(r['Experience Min (Years)'], r['Experience Max (Years)']), 'EX'],
    ['Age range', years_(r['Age Min'], r['Age Max']), 'AGE'],
    ['Language', r.Language, 'LANG'],
    ['Working hours', r['Duty Hours'], 'TIME'],
    ['Meals', r.Food, 'MEAL'],
    ['Accommodation', r.Accommodation, 'HOME'],
    ['Transportation', r.Transport, 'BUS'],
    ['Contract term', r['Contract Months'] ? `${r['Contract Months']} months` : '', 'DOC']
  ];
  return candidates.filter(x => valid_(x[1])).map(x => ({ label: x[0], value: x[1], icon: x[2] }));
}

function salaryLocal_(r) {
  const min = r['Salary Min'], max = r['Salary Max'], cur = r.Currency || '';
  if (!valid_(min) && !valid_(max)) throw new Error(`Missing salary for ${r.Position}`);
  if ((!valid_(min) || Number(min) === 0) && valid_(max)) return `UP TO ${cur} ${max}`;
  return `${cur} ${min}${valid_(max) && max !== min ? '–' + max : ''} ${r['Salary Period'] || ''}`.trim();
}

function years_(min, max) {
  if (!valid_(min) || Number(min) === 0) return '';
  return `${min}${valid_(max) && max !== min ? '–' + max : ''} years`;
}

function valid_(v) { return v !== '' && v != null && !/unknown|not stated|#error|#n\/a/i.test(String(v)); }
function requiredValue_(v, label) { if (!valid_(v)) throw new Error(`${label} is missing or invalid.`); return v; }
function requiredProperty_(props, key) { const v = props.getProperty(key); if (!v) throw new Error(`Set Script Property ${key}.`); return v; }

function validatePayload_(p) {
  const text = JSON.stringify(p);
  if (/#ERROR!|#N\/A|undefined|null/i.test(text)) throw new Error('Poster contains an invalid value.');
  if (!p.heroImageUrl) throw new Error('An approved hero image is required.');
}

function dispatch_(payload, props) {
  const owner = requiredProperty_(props, 'GITHUB_OWNER');
  const repo = requiredProperty_(props, 'GITHUB_REPO');
  const token = requiredProperty_(props, 'GITHUB_TOKEN');
  const body = { event_type: 'poster_render', client_payload: { poster_json_base64: Utilities.base64Encode(JSON.stringify(payload)) } };
  const res = UrlFetchApp.fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  });
  if (res.getResponseCode() !== 204) throw new Error(`GitHub dispatch failed: ${res.getResponseCode()} ${res.getContentText()}`);
}
