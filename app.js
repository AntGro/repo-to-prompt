
/* ===== LINE NUMBERS ===== */
let lineNumbersVisible = localStorage.getItem('f2p_line_numbers') === 'true';

function toggleLineNumbers(){
  lineNumbersVisible = !lineNumbersVisible;
  localStorage.setItem('f2p_line_numbers', String(lineNumbersVisible));
  applyLineNumbers();
}

function applyLineNumbers(){
  const wrapper = document.getElementById('outputWrapper');
  const gutter = document.getElementById('lineNumbers');
  const toggle = document.getElementById('lineNumToggle');

  if(lineNumbersVisible){
    gutter.classList.add('visible');
    wrapper.classList.add('line-numbers-active');
    toggle.classList.add('btn-primary');
    toggle.classList.remove('btn-secondary');
    updateLineNumbers();
  } else {
    gutter.classList.remove('visible');
    wrapper.classList.remove('line-numbers-active');
    toggle.classList.remove('btn-primary');
    toggle.classList.add('btn-secondary');
  }
}

function updateLineNumbers(){
  if(!lineNumbersVisible) return;
  const textarea = document.getElementById('outputArea');
  const gutter = document.getElementById('lineNumbers');
  const text = textarea.value;
  const lines = text.split('\n');
  const count = lines.length;
  const digits = String(count).length;
  gutter.style.minWidth = Math.max(40, (digits * 8) + 24) + 'px';
  const nums = [];
  for(let i = 1; i <= count; i++) nums.push(String(i).padStart(digits));
  gutter.textContent = nums.join('\n');
  gutter.scrollTop = textarea.scrollTop;
}

document.getElementById('outputArea').addEventListener('scroll', function(){
  if(lineNumbersVisible){
    document.getElementById('lineNumbers').scrollTop = this.scrollTop;
  }
});

(function initLineNumbers(){ applyLineNumbers(); })();

/* ===== MODE ===== */
let currentMode = 'github'; // 'github' | 'local'

function setMode(mode){
  currentMode = mode;
  localStorage.setItem('f2p_mode', mode);
  // Adaptive header title & subtitle
  document.getElementById('headerTitle').textContent = mode==='github' ? 'Repo2Prompt' : 'Files2Prompt';
  document.getElementById('headerSubtitle').textContent = mode==='github'
    ? 'Browse GitHub repos · Select files · Generate prompts'
    : 'Browse local folders · Select files · Generate prompts';
  document.title = mode==='github' ? 'Repo2Prompt' : 'Files2Prompt';
  document.getElementById('footerLabel').textContent = (mode==='github' ? 'Repo2Prompt' : 'Files2Prompt') + ' — Frontend-only, no server needed';
  document.getElementById('tabGithub').classList.toggle('active', mode==='github');
  document.getElementById('tabLocal').classList.toggle('active', mode==='local');
  document.getElementById('githubInputBar').style.display = mode==='github' ? '' : 'none';
  document.getElementById('localInputBar').style.display = mode==='local' ? '' : 'none';
  document.getElementById('localInputBar').classList.toggle('welcome-expand', mode==='local' && !localState.tree.length);
  document.getElementById('emptyState').style.display = mode==='github' && !ghState.tree.length ? '' : 'none';
  document.getElementById('branchSelect').style.display = mode==='github' ? '' : 'none';
  document.getElementById('settingsToken').style.display = mode==='github' ? '' : 'none';
  document.getElementById('settingsGitignore').style.display = mode==='local' ? '' : 'none';
  document.getElementById('rateLimitInfo').textContent = mode==='github' ? 'API rate limit: —' : '';
  // Show/hide folder display
  if(mode==='local' && localState.dirHandle){
    document.getElementById('folderNameDisplay').classList.add('visible');
    document.getElementById('localInputBar').querySelector('.drop-zone').style.display = 'none';
  } else {
    document.getElementById('folderNameDisplay').classList.remove('visible');
    if(mode==='local') document.getElementById('localInputBar').querySelector('.drop-zone').style.display = '';
  }
  // Reset main view
  hideMain();
  const st = mode==='github' ? ghState : localState;
  if(st.tree.length) showMain();
  if(mode==='github' && ghState.tree.length){ buildTreeUI(); updateBudgetBar(); }
  if(mode==='local' && localState.tree.length){ buildTreeUI(); updateBudgetBar(); }
}

/* ===== STATE ===== */
let ghState = {
  owner:'', repo:'', branch:'', sha:'',
  branches:[], tree:[], selected: new Set(),
  output:'', rawOutput:'', activeTemplate:null
};

let localState = {
  folderName:'', dirHandle:null,
  tree:[], selected: new Set(),
  output:'', rawOutput:'', activeTemplate:null,
  gitignorePatterns:[]
};

function getState(){ return currentMode==='github' ? ghState : localState; }

/* Token estimation */
function estimateTokens(bytes){ return Math.ceil(bytes / 4); }
function fmtTokens(n){
  if(n>=1000000) return (n/1000000).toFixed(1)+'M';
  if(n>=1000) return (n/1000).toFixed(1)+'k';
  return String(n);
}

/* ===== IMPORTANT FILES ===== */
const IMPORTANT_PATTERNS = [
  /^readme/i, /^license/i, /^contributing/i,
  /^package\.json$/i, /^pyproject\.toml$/i, /^setup\.py$/i, /^setup\.cfg$/i,
  /^cargo\.toml$/i, /^go\.mod$/i, /^gemfile$/i, /^requirements\.txt$/i,
  /^makefile$/i, /^dockerfile$/i, /^docker-compose/i,
  /^\.env\.example$/i, /^tsconfig\.json$/i, /^vite\.config/i, /^webpack\.config/i,
  /^src\/index\./i, /^src\/main\./i, /^src\/app\./i, /^app\./i, /^index\./i, /^main\./i,
  /^lib\/index\./i, /^cmd\/main\./i,
];
function isImportantFile(path){
  const name = path.split('/').pop();
  return IMPORTANT_PATTERNS.some(p => p.test(name) || p.test(path));
}

/* ===== PROMPT TEMPLATES ===== */
const BUILTIN_TEMPLATES = [
  {id:'review', icon:'🔍', name:'Code Review', prompt:'Review the following code for bugs, performance issues, and best practices. Provide specific, actionable feedback.\n\n{files}'},
  {id:'explain', icon:'🧠', name:'Explain Codebase', prompt:'Explain the architecture and key components of this codebase. Describe how the parts fit together and the main design decisions.\n\n{files}'},
  {id:'bugs', icon:'🐛', name:'Find Bugs', prompt:'Identify potential bugs, security vulnerabilities, and edge cases in the following code. For each issue, explain the risk and suggest a fix.\n\n{files}'},
  {id:'tests', icon:'🧪', name:'Write Tests', prompt:'Write comprehensive unit tests for the following code. Cover edge cases, error handling, and typical usage patterns.\n\n{files}'},
  {id:'refactor', icon:'♻️', name:'Refactor', prompt:'Suggest refactoring improvements for cleaner, more maintainable code. Explain each suggestion and its benefits.\n\n{files}'},
  {id:'docs', icon:'📖', name:'Documentation', prompt:'Generate clear, comprehensive documentation for the following code. Include function signatures, parameters, return values, and usage examples.\n\n{files}'},
];

let tplOpen = false;
function toggleTemplates(){
  tplOpen = !tplOpen;
  document.getElementById('tplBody').classList.toggle('open', tplOpen);
  document.getElementById('tplArrow').classList.toggle('open', tplOpen);
}

function renderTemplates(){
  const st = getState();
  const grid = document.getElementById('tplGrid');
  grid.innerHTML = '';
  BUILTIN_TEMPLATES.forEach(t => {
    const chip = document.createElement('div');
    chip.className = 'tpl-chip' + (st.activeTemplate === t.id ? ' active' : '');
    chip.innerHTML = `<span class="tpl-icon">${t.icon}</span>${t.name}`;
    chip.onclick = () => selectTemplate(t.id);
    grid.appendChild(chip);
  });
  const none = document.createElement('div');
  none.className = 'tpl-chip' + (st.activeTemplate === null ? ' active' : '');
  none.innerHTML = '<span class="tpl-icon">📄</span>Raw Output';
  none.onclick = () => selectTemplate(null);
  grid.appendChild(none);
  renderCustomTemplates();
}

function selectTemplate(id){
  getState().activeTemplate = id;
  renderTemplates();
  applyTemplate();
}

function applyTemplate(){
  const st = getState();
  if(!st.rawOutput) return;
  const indicator = document.getElementById('tplIndicator');
  if(st.activeTemplate === null){
    st.output = st.rawOutput;
    indicator.textContent = '';
  } else if(st.activeTemplate === '__inline__'){
    // already applied
  } else if(st.activeTemplate.startsWith('custom:')){
    const customs = getCustomTemplates();
    const ct = customs.find(c => c.id === st.activeTemplate);
    if(ct){
      st.output = ct.prompt.replace('{files}', st.rawOutput);
      indicator.textContent = '📝 ' + ct.name;
    }
  } else {
    const tpl = BUILTIN_TEMPLATES.find(t => t.id === st.activeTemplate);
    if(tpl){
      st.output = tpl.prompt.replace('{files}', st.rawOutput);
      indicator.textContent = tpl.icon + ' ' + tpl.name;
    }
  }
  document.getElementById('outputArea').value = st.output;
  updateOutputStats();
  updateLineNumbers();
}

function getCustomTemplates(){
  try { return JSON.parse(localStorage.getItem('f2p_custom_tpls') || '[]'); } catch(e){ return []; }
}
function setCustomTemplates(arr){ localStorage.setItem('f2p_custom_tpls', JSON.stringify(arr)); }

function saveCustomTemplate(){
  const text = document.getElementById('customTplInput').value.trim();
  if(!text){ showStatus('error','Enter a template with {files} placeholder first.'); return; }
  if(!text.includes('{files}')){
    if(!confirm('Your template does not contain {files} — the file content won\'t be included. Continue?')) return;
  }
  const name = prompt('Template name:', 'My Template');
  if(!name) return;
  const customs = getCustomTemplates();
  customs.push({id:'custom:'+Date.now(), name, prompt:text});
  setCustomTemplates(customs);
  renderCustomTemplates();
  showStatus('success', '💾 Template "'+name+'" saved');
}

function useCustomTemplate(){
  const text = document.getElementById('customTplInput').value.trim();
  if(!text) return;
  const st = getState();
  st.activeTemplate = '__inline__';
  if(st.rawOutput){
    st.output = text.replace('{files}', st.rawOutput);
    document.getElementById('outputArea').value = st.output;
    document.getElementById('tplIndicator').textContent = '📝 Custom';
    updateOutputStats();
  }
  renderTemplates();
}

function renderCustomTemplates(){
  const st = getState();
  const container = document.getElementById('customTplList');
  container.innerHTML = '';
  getCustomTemplates().forEach(ct => {
    const chip = document.createElement('div');
    chip.className = 'custom-chip' + (st.activeTemplate === ct.id ? ' active' : '');
    chip.innerHTML = `<span onclick="selectTemplate('${ct.id}')">${esc(ct.name)}</span><span class="del-btn" onclick="event.stopPropagation();deleteCustomTemplate('${ct.id}')">✕</span>`;
    container.appendChild(chip);
  });
}

function deleteCustomTemplate(id){
  setCustomTemplates(getCustomTemplates().filter(c => c.id !== id));
  const st = getState();
  if(st.activeTemplate === id) st.activeTemplate = null;
  renderCustomTemplates();
  applyTemplate();
}

const DEFAULT_IGNORES = [
  'node_modules/','.git/','__pycache__/','*.pyc','.DS_Store',
  'dist/','.env*','package-lock.json','*.lock','.vscode/',
  '.idea/','*.woff','*.woff2','*.ttf','*.eot','*.ico',
  '*.png','*.jpg','*.jpeg','*.gif','*.svg','*.webp',
  '*.mp3','*.mp4','*.zip','*.tar.gz','*.pdf','.next/',
  'venv/','env/','.venv/','.tox/','*.egg-info/'
];

/* ===== SETTINGS ===== */
function getToken(){ return localStorage.getItem('gh_token')||'' }
function setToken(t){ if(t)localStorage.setItem('gh_token',t);else localStorage.removeItem('gh_token') }
function getIgnores(){
  const key = currentMode==='local' ? 'f2p_local_ignores' : 'gh_ignores';
  const s = localStorage.getItem(key);
  return s ? s.split('\n').filter(l=>l.trim()) : [...DEFAULT_IGNORES];
}
function setIgnores(arr){
  const key = currentMode==='local' ? 'f2p_local_ignores' : 'gh_ignores';
  localStorage.setItem(key, arr.join('\n'));
}
function getMaxSize(){ return parseInt(localStorage.getItem('gh_max_size'))||500 }
function setMaxSize(v){ localStorage.setItem('gh_max_size',String(v)) }
function getUseGitignore(){ return localStorage.getItem('f2p_local_use_gitignore') !== 'false'; }
function setUseGitignore(v){ localStorage.setItem('f2p_local_use_gitignore', String(v)); }

/* ===== THEME ===== */
function getTheme(){ return localStorage.getItem('f2p_theme')||'light' }
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  document.getElementById('themeBtn').textContent = t==='dark'?'☀️':'🌙';
  localStorage.setItem('f2p_theme',t);
}
function toggleTheme(){ applyTheme(getTheme()==='dark'?'light':'dark') }

/* ===== GITHUB API ===== */
function apiHeaders(){
  const h = {'Accept':'application/vnd.github+json'};
  const t = getToken();
  if(t) h['Authorization'] = 'Bearer '+t;
  return h;
}

async function apiFetch(url){
  const res = await fetch(url, {headers:apiHeaders()});
  const rem = res.headers.get('x-ratelimit-remaining');
  const lim = res.headers.get('x-ratelimit-limit');
  if(rem!==null) document.getElementById('rateLimitInfo').textContent = `API rate limit: ${rem}/${lim} remaining`;
  if(!res.ok){
    const body = await res.json().catch(()=>({}));
    throw new Error(body.message || `GitHub API error ${res.status}`);
  }
  return res.json();
}

function parseRepoUrl(input){
  input = input.trim().replace(/\/$/,'');
  let m = input.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if(m) return {owner:m[1], repo:m[2].replace(/\.git$/,'')};
  m = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if(m) return {owner:m[1], repo:m[2]};
  return null;
}

/* ===== LOAD REPO (GITHUB) ===== */
async function loadRepo(){
  const input = document.getElementById('repoInput').value;
  const parsed = parseRepoUrl(input);
  if(!parsed){ showStatus('error','Invalid repository URL.'); return; }
  ghState.owner = parsed.owner; ghState.repo = parsed.repo;
  localStorage.setItem('gh_last_repo',input);
  const btn = document.getElementById('loadBtn');
  btn.disabled = true;
  document.getElementById('loadBtnText').textContent = 'Loading…';
  showStatus('info','<span class="spinner"></span> Fetching repository info…');
  hideMain();
  try {
    const repoInfo = await apiFetch(`https://api.github.com/repos/${ghState.owner}/${ghState.repo}`);
    ghState.branch = repoInfo.default_branch;
    const branchData = await apiFetch(`https://api.github.com/repos/${ghState.owner}/${ghState.repo}/branches?per_page=100`);
    ghState.branches = branchData.map(b=>b.name);
    populateBranches();
    await loadTree();
    showStatus('success',`✅ Loaded <strong>${ghState.owner}/${ghState.repo}</strong> (${ghState.branch}) — ${ghState.tree.length} items`);
    showMain();
    document.getElementById('emptyState').classList.add('hidden');
  } catch(e){ showStatus('error','❌ '+e.message); }
  finally { btn.disabled = false; document.getElementById('loadBtnText').textContent = 'Load Repo'; }
}

async function loadTree(){
  showStatus('info','<span class="spinner"></span> Fetching file tree…');
  const branchInfo = await apiFetch(`https://api.github.com/repos/${ghState.owner}/${ghState.repo}/branches/${encodeURIComponent(ghState.branch)}`);
  ghState.sha = branchInfo.commit.sha;
  const treeData = await apiFetch(`https://api.github.com/repos/${ghState.owner}/${ghState.repo}/git/trees/${ghState.sha}?recursive=1`);
  if(treeData.truncated) showStatus('warning','⚠️ Repository tree was truncated.');
  ghState.tree = treeData.tree || [];
  ghState.selected.clear();
  ghState.rawOutput = ''; ghState.output = '';
  document.getElementById('outputArea').value = '';
  buildTreeUI();
  updateBudgetBar();
}

async function switchBranch(branch){
  ghState.branch = branch;
  const btn = document.getElementById('loadBtn');
  btn.disabled = true;
  try { await loadTree(); showStatus('success',`✅ Switched to <strong>${branch}</strong>`); }
  catch(e){ showStatus('error','❌ '+e.message); }
  finally { btn.disabled = false; }
}

/* ===== LOCAL FILE SYSTEM ===== */
function parseGitignore(content){
  return content.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(l=>l.startsWith('/')?l.slice(1):l);
}

async function pickFolder(){
  if(!('showDirectoryPicker' in window)){ showStatus('error','File System Access API not supported. Use Chrome, Edge, or Brave.'); return; }
  try {
    const dirHandle = await window.showDirectoryPicker({mode:'read'});
    await loadFromHandle(dirHandle);
  } catch(e){ if(e.name!=='AbortError') showStatus('error','Error: '+e.message); }
}

async function loadFromHandle(dirHandle){
  localState.dirHandle = dirHandle;
  localState.folderName = dirHandle.name;
  localState.tree = [];
  localState.selected.clear();
  localState.rawOutput = ''; localState.output = '';
  localState.gitignorePatterns = [];
  document.getElementById('outputArea').value = '';
  showStatus('info','<span class="spinner"></span> Reading folder…');

  if(getUseGitignore()){
    try {
      const giFile = await (await dirHandle.getFileHandle('.gitignore')).getFile();
      localState.gitignorePatterns = parseGitignore(await giFile.text());
    } catch(e){}
  }

  const allIgnores = [...getIgnores(), ...localState.gitignorePatterns];
  await scanDirectory(dirHandle, '', allIgnores);
  localState.tree.sort((a,b)=>{
    const aI=isImportantFile(a.path)?0:1, bI=isImportantFile(b.path)?0:1;
    return aI!==bI ? aI-bI : a.path.localeCompare(b.path);
  });

  document.getElementById('localInputBar').querySelector('.drop-zone').style.display = 'none';
  document.getElementById('localInputBar').classList.remove('welcome-expand');
  document.getElementById('folderNameDisplay').classList.add('visible');
  document.getElementById('folderPath').textContent = localState.folderName;
  showMain();
  buildTreeUI();
  updateBudgetBar();
  showStatus('success','✅ Loaded <strong>'+esc(localState.folderName)+'</strong> — '+localState.tree.length+' files');
}

async function scanDirectory(dirHandle, prefix, ignores){
  try {
    for await (const entry of dirHandle.values()){
      const path = prefix ? prefix+'/'+entry.name : entry.name;
      if(matchesIgnore(path, ignores)) continue;
      if(entry.kind==='directory'){
        if(matchesIgnore(entry.name+'/', ignores)) continue;
        await scanDirectory(entry, path, ignores);
      } else {
        try { const f = await entry.getFile(); localState.tree.push({path,size:f.size,handle:entry,dirHandle}); } catch(e){}
      }
    }
  } catch(e){}
}

async function reloadFolder(){ if(localState.dirHandle) await loadFromHandle(localState.dirHandle); }

function setupDragDrop(){
  const dz = document.getElementById('dropZone');
  dz.addEventListener('dragover', e=>{ e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', e=>{ e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag-over'); });
  dz.addEventListener('drop', async e=>{
    e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag-over');
    for(const item of [...e.dataTransfer.items]){
      if(item.kind==='file'){
        const handle = await item.getAsFileSystemHandle();
        if(handle && handle.kind==='directory'){ await loadFromHandle(handle); return; }
      }
    }
    showStatus('error','Please drop a folder, not individual files.');
  });
}

/* ===== IGNORE MATCHING ===== */
function matchesIgnore(path, ignores){
  const parts = path.split('/');
  const name = parts[parts.length-1];
  for(const pat of ignores){
    if(pat.endsWith('/')){ if(parts.some(p=>p===pat.slice(0,-1))) return true; continue; }
    if(pat.startsWith('*.')){ if(name.endsWith(pat.slice(1))) return true; continue; }
    if(pat.endsWith('*')){ if(name.startsWith(pat.slice(0,-1))) return true; continue; }
    if(name===pat || path===pat) return true;
  }
  return false;
}

/* ===== BUILD TREE UI ===== */
function buildTreeUI(){
  const st = getState();
  const ignores = getIgnores();
  const container = document.getElementById('fileTree');
  container.innerHTML = '';

  let items;
  if(currentMode==='github'){
    items = st.tree.filter(item=>!matchesIgnore(item.path,ignores)).sort((a,b)=>{
      const aDir=a.type==='tree'?0:1, bDir=b.type==='tree'?0:1;
      if(aDir!==bDir) return aDir-bDir;
      if(a.type==='blob'&&b.type==='blob'){
        const aI=isImportantFile(a.path)?0:1, bI=isImportantFile(b.path)?0:1;
        if(aI!==bI) return aI-bI;
      }
      return a.path.localeCompare(b.path);
    });
  } else {
    items = st.tree; // already sorted
  }

  const root = {children:{}, files:[]};
  items.forEach(item=>{
    const parts = item.path.split('/');
    let node = root;
    for(let i=0;i<parts.length-1;i++){
      if(!node.children[parts[i]]) node.children[parts[i]] = {children:{}, files:[]};
      node = node.children[parts[i]];
    }
    if(currentMode==='github'){
      if(item.type==='blob') node.files.push(item);
      else if(!node.children[parts[parts.length-1]]) node.children[parts[parts.length-1]] = {children:{}, files:[]};
    } else {
      node.files.push(item);
    }
  });

  const fileItems = currentMode==='github' ? items.filter(i=>i.type==='blob') : items;
  const totalSize = fileItems.reduce((s,i)=>s+(i.size||0),0);
  document.getElementById('treeStats').textContent = `${fileItems.length} files · ${formatBytes(totalSize)} · ~${fmtTokens(estimateTokens(totalSize))} tokens`;
  updateFileCount();
  renderNode(root, container, '', 0);

  container.querySelectorAll('.tree-folder-children').forEach(el=>{
    const depth = parseInt(el.dataset.depth)||0;
    if(depth>1){
      el.style.display='none';
      const toggle = el.previousElementSibling?.querySelector('.tree-toggle');
      if(toggle) toggle.classList.remove('open');
    }
  });

  let maxDepth=0;
  container.querySelectorAll('.tree-indent').forEach(el=>{
    const d=(parseInt(el.style.width)||0)/16;
    if(d>maxDepth) maxDepth=d;
  });
  document.getElementById('mainPanels').style.setProperty('--tree-max-w', Math.min(500,Math.max(280,250+maxDepth*20))+'px');
}

function renderNode(node, container, prefix, depth){
  Object.keys(node.children).sort().forEach(name=>{
    const fullPath = prefix ? prefix+'/'+name : name;
    const folderEl = document.createElement('div');
    folderEl.className = 'tree-node folder';
    folderEl.dataset.path = fullPath;
    folderEl.innerHTML = `<span class="tree-indent" style="width:${depth*16}px"></span><span class="tree-toggle open" onclick="toggleFolder(event,'${esc(fullPath)}')">▶</span><input type="checkbox" class="tree-cb" data-path="${esc(fullPath)}" data-type="folder" onchange="onFolderCheck(this)" onclick="event.stopPropagation()"><span class="tree-icon">📁</span><span class="tree-name">${esc(name)}</span>`;
    folderEl.addEventListener('click',e=>{ if(e.target.tagName!=='INPUT') toggleFolder(e,fullPath); });
    container.appendChild(folderEl);
    const cc = document.createElement('div');
    cc.className='tree-folder-children'; cc.dataset.path=fullPath; cc.dataset.depth=depth+1;
    container.appendChild(cc);
    renderNode(node.children[name], cc, fullPath, depth+1);
  });

  [...node.files].sort((a,b)=>{
    const aI=isImportantFile(a.path)?0:1, bI=isImportantFile(b.path)?0:1;
    return aI!==bI ? aI-bI : a.path.localeCompare(b.path);
  }).forEach(item=>{
    const name = item.path.split('/').pop();
    const tokens = estimateTokens(item.size||0);
    const imp = isImportantFile(item.path);
    const el = document.createElement('div');
    el.className='tree-node file'; el.dataset.path=item.path;
    el.innerHTML = `<span class="tree-indent" style="width:${depth*16}px"></span><span class="tree-toggle hidden">▶</span><input type="checkbox" class="tree-cb" data-path="${esc(item.path)}" data-type="file" data-size="${item.size||0}" data-tokens="${tokens}" onchange="onFileCheck(this)" onclick="event.stopPropagation()">${imp?'<span class="tree-star" title="Important file">⭐</span>':''}<span class="tree-icon">${fileIcon(name)}</span><span class="tree-name">${esc(name)}</span><span class="tree-tokens">${fmtTokens(tokens)} tok</span><span class="tree-size">${formatBytes(item.size||0)}</span>`;
    el.addEventListener('click',e=>{ if(e.target.tagName!=='INPUT'){ const cb=el.querySelector('.tree-cb'); cb.checked=!cb.checked; onFileCheck(cb); }});
    container.appendChild(el);
  });
}

function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function fileIcon(name){
  const ext=name.split('.').pop().toLowerCase();
  const icons={js:'📜',ts:'📜',jsx:'📜',tsx:'📜',py:'🐍',rb:'💎',go:'🔵',rs:'🦀',java:'☕',c:'⚙️',cpp:'⚙️',h:'⚙️',cs:'🔷',swift:'🍎',kt:'🟣',html:'🌐',css:'🎨',scss:'🎨',less:'🎨',json:'📋',yaml:'📋',yml:'📋',toml:'📋',xml:'📋',md:'📝',txt:'📝',rst:'📝',sh:'💻',bash:'💻',zsh:'💻',fish:'💻',ps1:'💻',sql:'🗄️',graphql:'🗄️',dockerfile:'🐳'};
  if(name.toLowerCase()==='dockerfile') return '🐳';
  if(name.toLowerCase()==='makefile') return '🔧';
  return icons[ext]||'📄';
}

function formatBytes(b){
  if(b===0) return '0 B';
  if(b<1024) return b+' B';
  if(b<1024*1024) return (b/1024).toFixed(1)+' KB';
  return (b/1024/1024).toFixed(1)+' MB';
}

/* ===== TOKEN BUDGET ===== */
function getBudget(){
  const val=document.getElementById('budgetSelect').value;
  if(val==='custom'){
    const c=prompt('Enter custom token budget:','50000');
    if(c&&!isNaN(parseInt(c))){
      const n=parseInt(c);
      const sel=document.getElementById('budgetSelect');
      const opt=document.createElement('option'); opt.value=String(n); opt.textContent=fmtTokens(n);
      sel.insertBefore(opt, sel.querySelector('[value=custom]'));
      sel.value=String(n); return n;
    }
    document.getElementById('budgetSelect').value='32000'; return 32000;
  }
  return parseInt(val)||0;
}

function getSelectedTokens(){
  const st=getState(); let total=0;
  st.selected.forEach(path=>{
    const item=st.tree.find(t=>t.path===path);
    if(item) total+=estimateTokens(item.size||0);
  });
  return total;
}

function updateBudgetBar(){
  const budget=getBudget(), used=getSelectedTokens();
  const fill=document.getElementById('budgetFill'), text=document.getElementById('budgetText');
  if(budget===0){ fill.style.width='0%'; fill.className='budget-fill green'; text.textContent=used.toLocaleString()+' tokens selected'; text.style.color='var(--muted)'; return; }
  const pct=Math.min((used/budget)*100,100);
  fill.style.width=pct+'%';
  if(used>budget){ fill.className='budget-fill red pulse'; text.textContent='⚠️ '+used.toLocaleString()+' / '+budget.toLocaleString()+' tokens (OVER!)'; text.style.color='var(--danger)'; }
  else if(pct>80){ fill.className='budget-fill red'; text.textContent=used.toLocaleString()+' / '+budget.toLocaleString()+' tokens'; text.style.color='var(--danger)'; }
  else if(pct>50){ fill.className='budget-fill yellow'; text.textContent=used.toLocaleString()+' / '+budget.toLocaleString()+' tokens'; text.style.color='var(--warning)'; }
  else { fill.className='budget-fill green'; text.textContent=used.toLocaleString()+' / '+budget.toLocaleString()+' tokens'; text.style.color='var(--muted)'; }
}

function onBudgetChange(){ getBudget(); updateBudgetBar(); }

/* ===== FOLDER TOGGLE ===== */
function toggleFolder(e,path){
  e.stopPropagation();
  const ch=document.querySelector(`.tree-folder-children[data-path="${CSS.escape(path)}"]`);
  if(!ch) return;
  const open=ch.style.display!=='none';
  ch.style.display=open?'none':'';
  const toggle=document.querySelector(`.tree-node[data-path="${CSS.escape(path)}"]`)?.querySelector('.tree-toggle');
  if(toggle) toggle.classList.toggle('open',!open);
}

/* ===== CHECKBOX LOGIC ===== */
function onFileCheck(cb){
  const st=getState(), path=cb.dataset.path;
  if(cb.checked) st.selected.add(path); else st.selected.delete(path);
  updateParentCheckboxes(path); updateFileCount(); updateBudgetBar();
}

function onFolderCheck(cb){
  const st=getState(), path=cb.dataset.path, checked=cb.checked;
  const container=document.querySelector(`.tree-folder-children[data-path="${CSS.escape(path)}"]`);
  if(container){
    container.querySelectorAll('.tree-cb[data-type="file"]').forEach(fcb=>{
      fcb.checked=checked; if(checked) st.selected.add(fcb.dataset.path); else st.selected.delete(fcb.dataset.path);
    });
    container.querySelectorAll('.tree-cb[data-type="folder"]').forEach(fcb=>{ fcb.checked=checked; fcb.indeterminate=false; });
  }
  updateParentCheckboxes(path); updateFileCount(); updateBudgetBar();
}

function updateParentCheckboxes(path){
  const parts=path.split('/');
  for(let i=parts.length-2;i>=0;i--){
    const pp=parts.slice(0,i+1).join('/');
    const pcb=document.querySelector(`.tree-cb[data-path="${CSS.escape(pp)}"][data-type="folder"]`);
    if(!pcb) continue;
    const c=document.querySelector(`.tree-folder-children[data-path="${CSS.escape(pp)}"]`);
    if(!c) continue;
    const all=c.querySelectorAll('.tree-cb[data-type="file"]');
    const checked=c.querySelectorAll('.tree-cb[data-type="file"]:checked');
    if(checked.length===0){ pcb.checked=false; pcb.indeterminate=false; }
    else if(checked.length===all.length){ pcb.checked=true; pcb.indeterminate=false; }
    else { pcb.checked=false; pcb.indeterminate=true; }
  }
}

function updateFileCount(){
  const n=getState().selected.size;
  document.getElementById('fileCount').textContent=n>0?n+' file'+(n>1?'s':'')+' selected':'';
}

function selectAll(){
  const st=getState();
  document.querySelectorAll('.tree-cb[data-type="file"]').forEach(cb=>{
    if(cb.closest('.filtered-out')) return;
    cb.checked=true; st.selected.add(cb.dataset.path);
  });
  document.querySelectorAll('.tree-cb[data-type="folder"]').forEach(cb=>{ cb.checked=true; cb.indeterminate=false; });
  updateFileCount(); updateBudgetBar();
}

function selectNone(){
  getState().selected.clear();
  document.querySelectorAll('.tree-cb').forEach(cb=>{ cb.checked=false; cb.indeterminate=false; });
  updateFileCount(); updateBudgetBar();
}

/* ===== FILTER TREE ===== */
function filterTree(query){
  query=query.toLowerCase().trim();
  const nodes=document.querySelectorAll('.tree-node.file');
  const visibleFolders=new Set();
  nodes.forEach(node=>{
    const match=!query||node.dataset.path.toLowerCase().includes(query);
    node.classList.toggle('filtered-out',!match);
    if(match){ const p=node.dataset.path.split('/'); for(let i=1;i<p.length;i++) visibleFolders.add(p.slice(0,i).join('/')); }
  });
  document.querySelectorAll('.tree-node.folder').forEach(node=>{
    const show=!query||visibleFolders.has(node.dataset.path);
    node.classList.toggle('filtered-out',!show);
    const ch=document.querySelector(`.tree-folder-children[data-path="${CSS.escape(node.dataset.path)}"]`);
    if(ch) ch.classList.toggle('filtered-out',!show);
  });
  if(query){
    document.querySelectorAll('.tree-folder-children').forEach(el=>{ if(!el.classList.contains('filtered-out')) el.style.display=''; });
    document.querySelectorAll('.tree-toggle').forEach(t=>t.classList.add('open'));
  }
}

/* ===== GENERATE PROMPT ===== */
async function generatePrompt(){
  const st=getState();
  if(st.selected.size===0){ showStatus('error','No files selected.'); return; }
  const maxSize=getMaxSize()*1024;
  const files=Array.from(st.selected).sort();
  const total=files.length;
  let completed=0, skipped=0;
  document.getElementById('generateBtn').disabled=true;
  showStatus('info',`<span class="spinner"></span> ${currentMode==='github'?'Fetching':'Reading'} ${total} file${total>1?'s':''}…`);
  showProgress(0);

  if(currentMode==='github'){
    // Concurrent fetch from GitHub
    const CONCURRENCY=6;
    const results=new Array(files.length);
    let idx=0;
    async function worker(){
      while(idx<files.length){
        const i=idx++;
        const path=files[i];
        const item=ghState.tree.find(t=>t.path===path);
        if(item&&item.size>maxSize){ results[i]={path,content:null,skipped:true,reason:'exceeds size limit'}; completed++; updateProgress(completed/total); continue; }
        try {
          let content;
          const tk=getToken();
          if(tk){
            // Use GitHub API (supports CORS with auth) — raw.githubusercontent.com rejects CORS preflight with auth headers
            const apiUrl=`https://api.github.com/repos/${ghState.owner}/${ghState.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ghState.branch)}`;
            const res=await fetch(apiUrl,{headers:{'Authorization':'Bearer '+tk,'Accept':'application/vnd.github.v3.raw'}});
            if(!res.ok) throw new Error(`HTTP ${res.status}`);
            content=await res.text();
          } else {
            // No token — raw.githubusercontent.com works without CORS preflight
            const url=`https://raw.githubusercontent.com/${ghState.owner}/${ghState.repo}/${encodeURIComponent(ghState.branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
            const res=await fetch(url);
            if(!res.ok) throw new Error(`HTTP ${res.status}`);
            content=await res.text();
          }
          results[i]={path,content,skipped:false};
        } catch(e){ results[i]={path,content:null,skipped:true,reason:e.message}; }
        completed++; updateProgress(completed/total);
      }
    }
    const workers=[]; for(let w=0;w<Math.min(CONCURRENCY,files.length);w++) workers.push(worker());
    await Promise.all(workers);
    const parts=[];
    results.forEach(r=>{
      if(!r) return;
      parts.push(`\n${'='.repeat(60)}\nFile: ${r.path}\n${'='.repeat(60)}\n${r.skipped?'[SKIPPED: '+r.reason+']':r.content}\n`);
      if(r.skipped) skipped++;
    });
    st.rawOutput = `# Repository: ${ghState.owner}/${ghState.repo}\n# Branch: ${ghState.branch}\n# Files: ${total-skipped}/${total} (${skipped} skipped)\n# Generated: ${new Date().toISOString()}\n`+parts.join('');
  } else {
    // Read local files
    const parts=[];
    for(const path of files){
      const item=localState.tree.find(t=>t.path===path);
      if(!item){ parts.push(`\n${'='.repeat(60)}\nFile: ${path}\n${'='.repeat(60)}\n[SKIPPED: not found]\n`); skipped++; completed++; updateProgress(completed/total); continue; }
      if(item.size>maxSize){ parts.push(`\n${'='.repeat(60)}\nFile: ${path}\n${'='.repeat(60)}\n[SKIPPED: exceeds size limit]\n`); skipped++; completed++; updateProgress(completed/total); continue; }
      try {
        const file=await getFileFromPath(path);
        parts.push(`\n${'='.repeat(60)}\nFile: ${path}\n${'='.repeat(60)}\n${await file.text()}\n`);
      } catch(e){ parts.push(`\n${'='.repeat(60)}\nFile: ${path}\n${'='.repeat(60)}\n[SKIPPED: ${e.message}]\n`); skipped++; }
      completed++; updateProgress(completed/total);
    }
    st.rawOutput = `# Folder: ${localState.folderName}\n# Files: ${total-skipped}/${total} (${skipped} skipped)\n# Generated: ${new Date().toISOString()}\n`+parts.join('');
  }

  applyTemplate();
  hideProgress();
  showStatus('success',`✅ Generated from ${total-skipped} files`+(skipped?` (${skipped} skipped)`:''));
  document.getElementById('generateBtn').disabled=false;
}

async function getFileFromPath(path){
  const parts=path.split('/');
  let handle=localState.dirHandle;
  for(let i=0;i<parts.length-1;i++) handle=await handle.getDirectoryHandle(parts[i]);
  return await (await handle.getFileHandle(parts[parts.length-1])).getFile();
}

function updateOutputStats(){
  const st=getState(), text=st.output;
  const chars=text.length, tokens=Math.round(chars/3.7);
  document.getElementById('charCount').textContent=chars.toLocaleString()+' chars';
  document.getElementById('tokenCount').textContent='~'+tokens.toLocaleString()+' tokens';
  document.getElementById('fileCountOutput').textContent=st.selected.size+' files';
}

/* ===== COPY & DOWNLOAD ===== */
function copyOutput(){
  const text=document.getElementById('outputArea').value;
  if(!text){ showStatus('error','Nothing to copy.'); return; }
  navigator.clipboard.writeText(text).then(()=>showStatus('success','📋 Copied!')).catch(()=>{
    document.getElementById('outputArea').select(); document.execCommand('copy'); showStatus('success','📋 Copied!');
  });
}

function downloadOutput(){
  const st=getState(), text=document.getElementById('outputArea').value;
  if(!text){ showStatus('error','Nothing to download.'); return; }
  const name=currentMode==='github' ? `${ghState.owner}-${ghState.repo}-prompt.txt` : `${localState.folderName}-prompt.txt`;
  const blob=new Blob([text],{type:'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; a.click();
  URL.revokeObjectURL(url);
}

function populateBranches(){
  const sel=document.getElementById('branchSelect');
  sel.innerHTML=''; sel.style.display='';
  ghState.branches.forEach(b=>{
    const opt=document.createElement('option'); opt.value=b; opt.textContent=b;
    if(b===ghState.branch) opt.selected=true;
    sel.appendChild(opt);
  });
}

/* ===== SETTINGS ===== */
function openSettings(){
  if(currentMode==='github') document.getElementById('tokenInput').value=getToken();
  document.getElementById('ignoreInput').value=getIgnores().join('\n');
  document.getElementById('maxSizeInput').value=getMaxSize();
  if(currentMode==='local') document.getElementById('gitignoreToggle').checked=getUseGitignore();
  document.getElementById('settingsToken').style.display=currentMode==='github'?'':'none';
  document.getElementById('settingsGitignore').style.display=currentMode==='local'?'':'none';
  document.getElementById('settingsModal').classList.add('visible');
}
function closeSettings(){ document.getElementById('settingsModal').classList.remove('visible'); }
function saveSettings(){
  if(currentMode==='github') setToken(document.getElementById('tokenInput').value.trim());
  setIgnores(document.getElementById('ignoreInput').value.split('\n').map(l=>l.trim()).filter(Boolean));
  setMaxSize(parseInt(document.getElementById('maxSizeInput').value)||500);
  if(currentMode==='local') setUseGitignore(document.getElementById('gitignoreToggle').checked);
  closeSettings();
  if(currentMode==='github'&&ghState.tree.length) buildTreeUI();
  if(currentMode==='local'&&localState.dirHandle) reloadFolder();
  showStatus('success','⚙️ Settings saved');
}

/* ===== UI HELPERS ===== */
function showStatus(type,html){
  const bar=document.getElementById('statusBar'), msg=document.getElementById('statusMsg');
  clearTimeout(showStatus._timer);
  msg.className='status-msg status-'+type;
  msg.innerHTML=html+'<button class="status-close" onclick="hideStatus()" title="Dismiss">✕</button>';
  bar.classList.add('visible');
  if(type==='success'){ showStatus._timer=setTimeout(()=>hideStatus(),4000); }
  else if(type==='error'){ showStatus._timer=setTimeout(()=>hideStatus(),8000); }
}
function hideStatus(){
  const bar=document.getElementById('statusBar');
  bar.classList.remove('visible');
  clearTimeout(showStatus._timer);
}
function showProgress(pct){ document.getElementById('progressBar').classList.add('visible'); document.getElementById('progressFill').style.width=(pct*100)+'%'; }
function updateProgress(pct){ document.getElementById('progressFill').style.width=(pct*100)+'%'; }
function hideProgress(){ document.getElementById('progressBar').classList.remove('visible'); }

function showMain(){
  if(currentMode==='github') document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('controls').classList.add('visible');
  document.getElementById('budgetBar').classList.add('visible');
  document.getElementById('templatesSection').classList.add('visible');
  document.getElementById('mainPanels').classList.add('visible');
  document.getElementById('branchSelect').style.display=currentMode==='github'?'':'none';
}
function hideMain(){
  document.getElementById('controls').classList.remove('visible');
  document.getElementById('budgetBar').classList.remove('visible');
  document.getElementById('templatesSection').classList.remove('visible');
  document.getElementById('mainPanels').classList.remove('visible');
}

document.getElementById('repoInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); loadRepo(); }});

/* ===== INIT ===== */
(function init(){
  applyTheme(getTheme());
  const savedMode=localStorage.getItem('f2p_mode')||'github';
  setMode(savedMode);

  const last=localStorage.getItem('gh_last_repo');
  if(last) document.getElementById('repoInput').value=last;

  const savedBudget=localStorage.getItem('f2p_budget');
  if(savedBudget) document.getElementById('budgetSelect').value=savedBudget;

  renderTemplates();
  setupDragDrop();

  if(!('showDirectoryPicker' in window)) document.getElementById('browserWarning').style.display='block';

  const params=new URLSearchParams(window.location.search);
  const repoParam=params.get('repo');
  if(repoParam){ document.getElementById('repoInput').value=repoParam; setMode('github'); setTimeout(loadRepo,100); }
})();

document.getElementById('budgetSelect').addEventListener('change',()=>{ localStorage.setItem('f2p_budget',document.getElementById('budgetSelect').value); });

