const JOBS_SHEET = 'Jobs Master';
const POSTER_INBOX_FOLDER_ID = '1XeQdM1Rkqw_4lDCQ2GBUcnqMCK_C4_EM';

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
  const requestId = Utilities.getUuid();
  dispatch_(payload, props, requestId);
  const file = waitForPoster_(payload, props, requestId);
  SpreadsheetApp.getUi().alert(`Poster created: ${file.getName()}\nIt is now in 01_INBOX_JOB_POSTERS and will enter the existing approval workflow.`);
}

function buildFacts_(r) {
  const candidates = [
    ['Location', [r.City, r.Country].filter(valid_).join(', '), 'LOC'],
    ['Experience', experience_(r), 'EX'],
    ['Age range', years_(r['Age Min'], r['Age Max']), 'AGE'],
    ['Gender', r.Gender, 'GEN'],
    ['Nationality', r.Nationality, 'NAT'],
    ['Requirements', r.Education || r['Skills / Keywords'], 'REQ'],
    ['Language', r.Language, 'LANG'],
    ['Work schedule', workSchedule_(r), 'TIME'],
    ['Meals', r.Food, 'MEAL'],
    ['Accommodation', r.Accommodation, 'HOME'],
    ['Transportation', r.Transport, 'BUS'],
    ['Air ticket', r['Air Ticket'], 'AIR'],
    ['Contract term', r['Contract Months'] ? `${r['Contract Months']} months` : '', 'DOC']
  ];
  return candidates.filter(x => valid_(x[1])).map(x => ({ label: x[0], value: x[1], icon: x[2] }));
}

function salaryLocal_(r) {
  const min = r['Salary Min'], max = r['Salary Max'], cur = r.Currency || '';
  if (!valid_(min) && !valid_(max)) throw new Error(`Missing salary for ${r.Position}`);
  if ((!valid_(min) || Number(min) === 0) && valid_(max)) return `UP TO ${cur} ${formatNumber_(max)}${period_(r)}`;
  return `${cur} ${formatNumber_(min)}${valid_(max) && max !== min ? ' – ' + formatNumber_(max) : ''}${period_(r)}`.trim();
}

function formatNumber_(value) {
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number.toLocaleString('en-IN') : value;
}

function period_(r) {
  const value = valid_(r['Salary Period']) ? String(r['Salary Period']).toLowerCase() : '';
  return value ? ` / ${value.replace(/ly$/, '')}` : '';
}

function experience_(r) {
  const notes = String(r['Reviewer Notes'] || '');
  if (/no (prior )?experience required/i.test(notes)) return 'No prior experience required';
  return years_(r['Experience Min (Years)'], r['Experience Max (Years)']);
}

function workSchedule_(r) {
  const hours = valid_(r['Duty Hours']) ? r['Duty Hours'] : '';
  const match = String(r['Reviewer Notes'] || '').match(/\b(\d+)\s*days?\/week\b/i);
  return [hours, match ? `${match[1]} days/week` : ''].filter(valid_).join('; ');
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

function dispatch_(payload, props, requestId) {
  const owner = requiredProperty_(props, 'GITHUB_OWNER');
  const repo = requiredProperty_(props, 'GITHUB_REPO');
  const token = requiredProperty_(props, 'GITHUB_TOKEN');
  const jsonBytes = Utilities.newBlob(JSON.stringify(payload), 'application/json').getBytes();
  const body = { event_type: 'poster_render', client_payload: { poster_json_base64: Utilities.base64Encode(jsonBytes), request_id: requestId } };
  const res = UrlFetchApp.fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  });
  if (res.getResponseCode() !== 204) throw new Error(`GitHub dispatch failed: ${res.getResponseCode()} ${res.getContentText()}`);
}

function waitForPoster_(payload, props, requestId) {
  const owner = requiredProperty_(props, 'GITHUB_OWNER');
  const repo = requiredProperty_(props, 'GITHUB_REPO');
  const token = requiredProperty_(props, 'GITHUB_TOKEN');
  const artifactName = `poster-${requestId}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const listUrl = `https://api.github.com/repos/${owner}/${repo}/actions/artifacts?name=${encodeURIComponent(artifactName)}`;
  for (let attempt = 0; attempt < 30; attempt++) {
    Utilities.sleep(10000);
    const list = UrlFetchApp.fetch(listUrl, { headers, muteHttpExceptions: true });
    if (list.getResponseCode() !== 200) throw new Error(`Artifact lookup failed: ${list.getResponseCode()} ${list.getContentText()}`);
    const artifacts = JSON.parse(list.getContentText()).artifacts || [];
    const artifact = artifacts.find(a => !a.expired && a.name === artifactName);
    if (!artifact) continue;
    const redirectResponse = UrlFetchApp.fetch(artifact.archive_download_url, { headers, followRedirects: false, muteHttpExceptions: true });
    if (![302, 303, 307].includes(redirectResponse.getResponseCode())) {
      throw new Error(`Artifact redirect failed: ${redirectResponse.getResponseCode()} ${redirectResponse.getContentText()}`);
    }
    const redirectHeaders = redirectResponse.getAllHeaders();
    const downloadUrl = redirectHeaders.Location || redirectHeaders.location;
    if (!downloadUrl) throw new Error('GitHub did not provide an artifact download URL.');
    const zipResponse = UrlFetchApp.fetch(downloadUrl, { followRedirects: true, muteHttpExceptions: true });
    if (zipResponse.getResponseCode() !== 200) throw new Error(`Artifact download failed: ${zipResponse.getResponseCode()}`);
    const files = Utilities.unzip(zipResponse.getBlob());
    const png = files.find(b => /poster\.png$/i.test(b.getName()));
    if (!png) throw new Error('Rendered artifact did not contain poster.png.');
    const fileName = `${payload.orderCode || 'JOB'}_${payload.roles.map(r => r.title).join('_')}_Anchor_Abroad_Approval.png`
      .replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);
    return DriveApp.getFolderById(POSTER_INBOX_FOLDER_ID).createFile(png.setName(fileName));
  }
  throw new Error('Poster rendering did not finish within five minutes. Check the GitHub Actions run.');
}
