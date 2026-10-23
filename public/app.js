import {FULL_REPOS} from './repositories.js';
/* Shared GitHub repository allowlist; browser reads only, authenticated writes use separate owner endpoint. */
const DEFAULT_REPOS = FULL_REPOS;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CACHE_TTL = 120000;
const memoryCache = new Map();
const el = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const readStored = (key, fallback) => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional local preference */ } };
const uniqueRepos = (repos) => [...new Set(repos.filter((value) => typeof value === 'string' && REPO_PATTERN.test(value) && FULL_REPOS.includes(value)))].slice(0, 12);
let repos = uniqueRepos(readStored('acc.repos.v2', DEFAULT_REPOS));
if (!repos.length) repos = [...DEFAULT_REPOS];
let selected = readStored('acc.selected.v1', repos[0]);
if (!repos.includes(selected)) selected = repos[0];
const requestedRepo = new URLSearchParams(location.search).get('repo');
if (requestedRepo && FULL_REPOS.includes('tanawutmalirum29-ux/'+requestedRepo)) {
 const full = 'tanawutmalirum29-ux/'+requestedRepo;
 if (!repos.includes(full)) repos.push(full);
 selected = full;
}
let currentView = 'workspace';
let requestId = 0;
let currentData = {info: null, issues: [], pulls: [], runs: [], errors: []};

const repoPage = () => 'https://github.com/' + selected;
const apiBase = () => 'https://api.github.com/repos/' + selected;
function setNotice(message) { el('load-state').textContent = message; }
function dateText(input) {
  if (!input) return 'ไม่ทราบเวลา';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return 'ไม่ทราบเวลา';
  return new Intl.DateTimeFormat('th-TH', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}).format(date);
}
function safeError(error) {
  if (String(error.message).includes('403') || String(error.message).includes('429')) return 'GitHub API จำกัดจำนวนคำขอชั่วคราว กรุณาลองอีกครั้งภายหลัง';
  if (String(error.message).includes('404')) return 'ไม่พบ Repository หรือข้อมูลเป็น Private';
  return 'โหลดข้อมูลไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ';
}
async function getJSON(path, force = false) {
  const key = selected + path;
  const cached = memoryCache.get(key);
  if (!force && cached && Date.now() - cached.when < CACHE_TTL) return cached.data;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(apiBase() + path, {
      headers: {'Accept':'application/vnd.github+json'},
      signal: controller.signal
    });
    if (!res.ok) throw new Error('GitHub API ' + res.status);
    const data = await res.json();
    memoryCache.set(key, {when:Date.now(), data});
    return data;
  } finally { clearTimeout(timeout); }
}
function switchView(view) {
  if (!['ceo','orgrooms','issue','mywork','relay','overview','issues','pulls','qa','agents','workspace','organization','operations','settings'].includes(view)) return;
  currentView = view;
  document.querySelectorAll('.view').forEach((node) => node.classList.toggle('hidden', node.id !== 'view-' + view));
  document.querySelectorAll('.navigation .nav-item').forEach((node) => node.classList.toggle('active', node.dataset.view === view));
  const titles = {ceo:['CEO Dashboard','CEO'],orgrooms:['พื้นที่องค์กร','ORGANIZATION ROOMS'],issue:['อ่าน Issue / PR','ISSUE READER'],mywork:['งานของ AI','MY WORK'],relay:['ส่งต่อ MN / AP-ROLE','RELAY INBOX'],overview:['ภาพรวมการพัฒนา','OVERVIEW'],issues:['งาน / Issues','ISSUES'],pulls:['Pull Requests','PULL REQUESTS'],qa:['QA & Actions','QUALITY GATE'],agents:['AI Work Queue','AI OPERATIONS'],workspace:['พื้นที่ทำงานโค้ด','PROJECT WORKSPACE'],organization:['องค์กร AI','ORGANIZATION'],operations:['ศูนย์สั่งงาน','OPERATIONS'],settings:['โปรเจกต์และการตั้งค่า','SETTINGS']};
  el('page-heading').textContent = titles[view][0];
  el('section-kicker').textContent = titles[view][1];
  window.scrollTo(0, 0);
}
function renderPicker() {
  el('repo-select').replaceChildren();
  for (const repo of repos) {
    const option = document.createElement('option');
    option.value = repo; option.textContent = repo.split('/')[1]; option.title = repo;
    option.selected = repo === selected; el('repo-select').append(option);
  }
}
function renderRepoSettings() {
  el('repo-list').replaceChildren();
  for (const repo of repos) {
    const row = document.createElement('div'); row.className = 'repo-row';
    const name = document.createElement('span'); name.textContent = repo;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'นำออก';
    remove.setAttribute('aria-label','นำ ' + repo + ' ออกจากรายการ');
    remove.addEventListener('click', () => {
      if (repos.length === 1) { el('repo-notice').textContent = 'ต้องเหลือ Repository อย่างน้อย 1 รายการ'; return; }
      repos = repos.filter((item) => item !== repo);
      if (selected === repo) selected = repos[0];
      persistRepos(); renderRepoSettings(); renderPicker(); loadProject();
      el('repo-notice').textContent = 'นำรายการออกจากอุปกรณ์นี้แล้ว (ไม่ได้ลบ Repository บน GitHub)';
    });
    row.append(name, remove); el('repo-list').append(row);
  }
}
function persistRepos() { store('acc.repos.v2', repos); store('acc.selected.v1', selected); }
function setLinks() {
  el('hero-repo').href = repoPage();
  el('issues-open').href = repoPage() + '/issues';
  el('pulls-open').href = repoPage() + '/pulls';
  el('qa-open').href = repoPage() + '/actions';
}
function statusTag(text, kind = '') { return '<span class="status-tag ' + kind + '">' + escapeHtml(text) + '</span>'; }
function issueRows(items, limit) {
  if (!items.length) return '<p class="empty">ไม่พบ Issue ที่เปิดอยู่ในชุดข้อมูลล่าสุด</p>';
  return items.slice(0, limit).map((item) => '<div class="list-item"><span class="list-icon">#</span><div><a href="' + repoPage() + '/issues/' + Number(item.number) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(item.title) + '</a><small>#' + Number(item.number) + ' · อัปเดต ' + escapeHtml(dateText(item.updated_at)) + '</small></div></div>').join('');
}
function prRows(items, limit) {
  if (!items.length) return '<p class="empty">ไม่มี Pull Request ที่เปิดอยู่</p>';
  return items.slice(0, limit).map((item) => '<div class="list-item" data-head-sha="' + escapeHtml(item.head_sha||'') + '"><span class="list-icon purple">⑂</span><div><a href="' + repoPage() + '/pull/' + Number(item.number) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(item.title) + '</a><small>PR #' + Number(item.number) + ' · LIVE HEAD ' + escapeHtml(item.head_sha||'UNKNOWN') + ' · อัปเดต ' + escapeHtml(dateText(item.updated_at)) + '</small></div>' + statusTag(item.draft ? 'Draft' : 'Open', item.draft ? 'wait' : '') + '</div>').join('');
}
function runTag(run) {
  if (run.status !== 'completed') return statusTag('กำลังรัน','wait');
  if (run.conclusion === 'success') return statusTag('PASS','good');
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out') return statusTag('FAIL','bad');
  return statusTag(run.conclusion || 'UNKNOWN','wait');
}
function runRows(items) {
  if (!items.length) return '<p class="empty">ยังไม่พบ GitHub Actions Run ใน Repository นี้</p>';
  return items.slice(0, 12).map((run) => '<div class="list-item"><span class="list-icon purple">✓</span><div><a href="' + repoPage() + '/actions/runs/' + Number(run.id) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(run.name || 'Workflow') + '</a><small>' + escapeHtml(run.head_branch || '') + ' · ' + escapeHtml(dateText(run.created_at)) + '</small></div>' + runTag(run) + '</div>').join('');
}
function renderAll() {
  const {info,issues,pulls,runs,errors} = currentData;
  el('metric-issues').textContent = info ? String(issues.length) + (issues.length === 100 ? '+' : '') : '—';
  el('metric-prs').textContent = info ? String(pulls.length) + (pulls.length === 30 ? '+' : '') : '—';
  el('metric-branch').textContent = info ? String(info.default_branch || '—') : '—';
  const latest = runs[0];
  el('metric-ci').textContent = !info ? '—' : !latest ? 'NO RUNS' : latest.status !== 'completed' ? 'RUNNING' : latest.conclusion === 'success' ? 'PASS' : latest.conclusion === 'failure' ? 'FAIL' : 'OTHER';
  el('metric-ci-note').textContent = latest ? dateText(latest.created_at) : 'GitHub Actions';
  if (errors.length && !info) {
    const empty = '<p class="empty">' + escapeHtml(errors[0]) + '</p>';
    ['overview-issues','overview-pulls','all-issues','all-pulls','all-runs'].forEach((id) => el(id).innerHTML = empty);
  } else {
    el('overview-issues').innerHTML = issueRows(issues, 5);
    el('overview-pulls').innerHTML = prRows(pulls, 5);
    el('all-issues').innerHTML = issueRows(issues, 100);
    el('all-pulls').innerHTML = prRows(pulls, 30);
    el('all-runs').innerHTML = runRows(runs);
  }
}
async function loadProject(force = false) {
  const id = ++requestId;
  setLinks(); setNotice('กำลังดึงข้อมูลจาก GitHub...');
  const results = await Promise.allSettled([
    getJSON('', force),
    getJSON('/issues?state=open&per_page=100', force),
    fetch('/api/v1/mission?repo='+encodeURIComponent(selected.split('/')[1])+'&fresh=1',
      {cache:'no-store'}).then(async r=>{
       const data=await r.json();if(!r.ok||data.stale)throw Error('Live PR data unavailable');
       return (data.prs||[]).map(p=>({number:p.number,title:p.title,draft:p.draft,
        head_sha:p.head_sha,updated_at:p.updated_at,html_url:p.github_source_url}));
      }),
    getJSON('/actions/runs?per_page=12', force)
  ]);
  if (id !== requestId) return;
  const errors = results.filter((item) => item.status === 'rejected').map((item) => safeError(item.reason));
  const value = (index, fallback) => results[index].status === 'fulfilled' ? results[index].value : fallback;
  const rawIssues = value(1, []);
  const rawRuns = value(3, {workflow_runs:[]});
  currentData = {
    info: value(0, null),
    issues: Array.isArray(rawIssues) ? rawIssues.filter((item) => !item.pull_request) : [],
    pulls: value(2, []),
    runs: rawRuns.workflow_runs || [],
    errors
  };
  renderAll();
  setNotice(errors.length ? ('ข้อมูลบางส่วนไม่พร้อม · ' + errors[0]+' · อย่าใช้ SHA เก่าในการตัดสิน QA') :
    ('อัปเดต '+dateText(new Date().toISOString())+' · PR HEAD จาก Control Center/GitHub แบบสด · CI ต้องตรวจตาม SHA ของ PR'));
}
function createTaskText() {
  const role = el('task-role').value;
  const title = el('task-title').value.trim();
  const detail = el('task-body').value.trim();
  const body = 'ROLE: ' + role + '\n\n' + (detail || 'โปรดระบุรายละเอียดและเกณฑ์ QA') + '\n\n## Acceptance / QA\n- [ ] ตรวจสอบโค้ดและความเข้ากันได้\n- [ ] รันทดสอบที่เกี่ยวข้อง\n- [ ] ขอรีวิวก่อน Merge\n\nCreated via AI Control Center V1';
  return {title:'[' + role + '] ' + title, body};
}
function setup() {
  renderPicker(); renderRepoSettings(); setLinks();
  document.querySelectorAll('[data-view]').forEach((node) => node.addEventListener('click', () => switchView(node.dataset.view)));
  el('repo-select').addEventListener('change', (event) => { selected = event.target.value; persistRepos(); loadProject(); });
  el('refresh-btn').addEventListener('click', () => loadProject(true));
  el('repo-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = el('repo-add').value.trim();
    if (!REPO_PATTERN.test(value) || !FULL_REPOS.includes(value)) { el('repo-notice').textContent = 'Repository นี้ยังไม่ได้รับอนุญาตในระบบกลาง (public/repositories.js)'; return; }
    if (repos.includes(value)) { el('repo-notice').textContent = 'มี Repository นี้อยู่แล้ว'; return; }
    if (repos.length >= 12) { el('repo-notice').textContent = 'ติดตามได้ไม่เกิน 12 Repository'; return; }
    repos.push(value); selected = value; persistRepos(); renderRepoSettings(); renderPicker(); el('repo-add').value = '';
    el('repo-notice').textContent = 'เพิ่มรายการแล้ว กำลังตรวจสอบข้อมูล Public Repository'; loadProject();
  });
  el('task-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!el('task-title').value.trim()) { el('task-notice').textContent = 'กรุณากรอกหัวข้องาน'; return; }
    const task = createTaskText();
    const url = repoPage() + '/issues/new?title=' + encodeURIComponent(task.title) + '&body=' + encodeURIComponent(task.body);
    window.open(url, '_blank', 'noopener,noreferrer');
    el('task-notice').textContent = 'เปิดหน้า GitHub แล้ว กรุณาตรวจทานและกด Submit new issue ด้วยตัวเอง';
  });
  el('copy-task').addEventListener('click', async () => {
    if (!el('task-title').value.trim()) { el('task-notice').textContent = 'กรุณากรอกหัวข้องานก่อน'; return; }
    const task = createTaskText();
    try { await navigator.clipboard.writeText(task.title + '\n\n' + task.body); el('task-notice').textContent = 'คัดลอกคำสั่งแล้ว'; }
    catch { el('task-notice').textContent = 'คัดลอกไม่สำเร็จ กรุณาเปิดใน HTTPS และอนุญาต Clipboard'; }
  });
  switchView('orgrooms'); loadProject();
}
setup();
