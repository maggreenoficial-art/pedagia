
// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
let _sb, currentSession;
const st = {
  numQ: 18, dif: 'medio',
  // School template + biblioteca de cabeçalhos
  templateFile: null, templateKind: null,
  activeHeaderId: null,
  headersIndex: null,
  // Book PDF (page-based navigation)
  bookFile: null, bookPdf: null, bookFileName: '', bookTotalPages: 0,
  bookChapters: [], selectedChapterIdx: -1, selectedPages: new Set(),
  // Image gallery — catálogo + blocos imagem+questão
  imageCatalog: [],          // [{ imageId, previewUrl, dataUri, base64, pageNumber, caption, ... }]
  cloudImageIndex: [],       // listagem Supabase Storage …/images/
  chapterBrief: null,        // mapa IA do capítulo (conceitos / ângulos de questão)
  midiasFilterQuery: '',
  midiasSelected: null,      // Set<imageId> — seleção na aba Minhas mídias
  midiaGenCategory: 'mapa',
  pendingGeneratedImage: null,
  imageQuestionBlocks: [],   // [{ blockId, selected, imageId, image, question }]
  extractedImages: [],       // espelho do catálogo (compat. idx)
  selectedImageIdx: new Set(), // legado — não usar na prova final
  imgRendering: false,
  // Generation result
  provaText: '', gabText: '',
  // Criador Inteligente
  ciStep: 1, ciExamText: '', ciExamFileName: '', ciExamAnalysis: null,
  ciBookText: '', ciBookFileName: '', ciBookPdf: null, ciBookChapters: [],
  ciBookSelectedChapters: new Set(), ciBookChapterManual: '',
  ciNumQ: 10, ciDif: 'medio',
  ciMode: false, ciPromptOverride: '',
  // Saved data
  historyData: [],
  currentProvaId: null,
  activeView: 'form',
  // Material indexado (arquitetura v2)
  materialId: null,
  materialsList: [],
  bookStoragePath: null,
  materialChapters: [],
  sumarioSkipped: false,
  _pageSources: {},
  processedChapterId: null,
  examModel: null,
  examTemplate: null,
  examPlanOrder: null, // ['b:imageId', 't:1', 's:0', ...]
  evbFilter: 'all', // all | block | slot | text
  pendingQuestions: [], // { id, type, statement, alternatives, correctAnswer, justification, status }
  reviewFilter: 'all',
  reviewPedNote: '',
  builderPool: [], // { id, source, inProva, reviewStatus, variant, type, statement, ... }
  builderSelectedMedia: new Set(),
  builderSelectedExercises: new Set(),
  builderPagesConfirmed: false,
  builderConfirmedPageList: [],
  builderPoolTab: 'turma', // turma | adaptada | all
  builderWantAdapted: false,
  /** Montar ④ — rascunhos de exercício por mídia: { [imageId]: { question, reviewStatus, type, loading? } } */
  builderMediaDrafts: {},
};

const DRAFT_KEY = 'pgdraft';
const VIEW_KEY = 'pgview';

function saveActiveView() {
  try {
    if (st.activeView && st.activeView !== 'auth' && st.activeView !== 'loading' && st.activeView !== 'revisao' && st.activeView !== 'builder') {
      sessionStorage.setItem(VIEW_KEY, st.activeView);
    }
  } catch {}
}

function restoreActiveView() {
  try {
    const v = sessionStorage.getItem(VIEW_KEY);
    if (v && v !== 'auth' && v !== 'loading') return v;
  } catch {}
  return null;
}

let _authBootstrapSettled = false;
let _authBootstrapInProgress = false;
let _authListenerRegistered = false;
let _userInitiatedLogout = false;
let _authGraceUntil = 0;
let _supabaseUrl = '';
let _pendingInitialSession = null;
let _initialSessionWaiter = null;
const _authBootWait = { timer: null, resolve: null };

const PEDAGIA_AUTH_STORAGE_KEY = 'pedagia-auth';
const PEDAGIA_SESSION_V2_KEY = 'pedagia-session-v2';
const SESSION_BACKUP_KEY = 'pedagia-session-backup';
let _authListenerReady = false;

function authStorageAdapter() {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function persistSessionBackup(session) {
  if (!session?.access_token || !session?.refresh_token) return;
  const slim = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type || 'bearer',
    user: session.user,
  };
  const json = JSON.stringify(slim);
  const def = supabaseDefaultStorageKey(_supabaseUrl);
  try {
    localStorage.setItem(PEDAGIA_SESSION_V2_KEY, json);
    localStorage.setItem(PEDAGIA_AUTH_STORAGE_KEY, json);
    if (def) localStorage.setItem(def, json);
    sessionStorage.setItem(SESSION_BACKUP_KEY, json);
  } catch (e) {
    console.warn('PedagIA: não foi possível gravar sessão.', e);
  }
}

function readAllStoredSessionRaws() {
  const raws = [];
  const push = (raw) => {
    if (raw && typeof raw === 'string' && !raws.includes(raw)) raws.push(raw);
  };
  push(localStorage.getItem(PEDAGIA_SESSION_V2_KEY));
  push(sessionStorage.getItem(SESSION_BACKUP_KEY));
  push(localStorage.getItem(PEDAGIA_AUTH_STORAGE_KEY));
  const def = supabaseDefaultStorageKey(_supabaseUrl);
  if (def) push(localStorage.getItem(def));
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (/^sb-.+-auth-token/.test(key) || key.includes('pedagia') && key.includes('auth'))) {
        push(localStorage.getItem(key));
      }
    }
  } catch {}
  return raws;
}

function migrateLegacyAuthStorage() {
  try {
    const def = supabaseDefaultStorageKey(_supabaseUrl);
    const sources = [
      sessionStorage.getItem(SESSION_BACKUP_KEY),
      def ? localStorage.getItem(def) : null,
      localStorage.getItem(PEDAGIA_AUTH_STORAGE_KEY),
    ];
    for (const key of listPersistedAuthStorageKeys()) {
      if (key !== PEDAGIA_AUTH_STORAGE_KEY && key !== def) {
        sources.push(localStorage.getItem(key));
      }
    }
    let best = null;
    for (const raw of sources) {
      const s = parsePersistedSession(raw);
      if (s) best = raw;
    }
    if (!best) return;
    localStorage.setItem(PEDAGIA_SESSION_V2_KEY, best);
    localStorage.setItem(PEDAGIA_AUTH_STORAGE_KEY, best);
    if (def) localStorage.setItem(def, best);
    sessionStorage.setItem(SESSION_BACKUP_KEY, best);
  } catch {}
}

function supabaseDefaultStorageKey(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const ref = host.split('.')[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

function listPersistedAuthStorageKeys() {
  const keys = [PEDAGIA_AUTH_STORAGE_KEY];
  const def = supabaseDefaultStorageKey(_supabaseUrl);
  if (def && !keys.includes(def)) keys.push(def);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.+-auth-token/.test(key) && !keys.includes(key)) keys.push(key);
    }
  } catch {}
  return keys;
}

function parsePersistedSession(raw) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data[0]) return parsePersistedSession(JSON.stringify(data[0]));
    let session =
      data?.currentSession ||
      data?.session ||
      data?.data?.session ||
      (data?.access_token && data?.refresh_token ? data : null);
    if (!session?.access_token || !session?.refresh_token) return null;
    return session;
  } catch {
    return null;
  }
}

/** Restaura sessão ANTES de registrar listeners (evita SIGNED_OUT apagar o storage). */
async function restoreAuthOnPageLoad() {
  if (!_sb) return null;
  migrateLegacyAuthStorage();

  for (const raw of readAllStoredSessionRaws()) {
    const tokens = parsePersistedSession(raw);
    if (!tokens) continue;
    try {
      const { data, error } = await _sb.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (!error && data?.session?.user) {
        persistSessionBackup(data.session);
        return data.session;
      }
      if (error) console.warn('PedagIA setSession:', error.message);
    } catch (e) {
      console.warn('PedagIA setSession', e);
    }
  }

  try {
    const { data: { session }, error } = await _sb.auth.getSession();
    if (!error && session?.user) {
      persistSessionBackup(session);
      return session;
    }
  } catch (e) {
    console.warn('PedagIA getSession', e);
  }

  try {
    const { data: { session }, error } = await _sb.auth.refreshSession();
    if (!error && session?.user) {
      persistSessionBackup(session);
      return session;
    }
    if (error) console.warn('PedagIA refreshSession:', error.message);
  } catch (e) {
    console.warn('PedagIA refreshSession', e);
  }

  return null;
}

function hasPersistedAuthTokens() {
  return readAllStoredSessionRaws().some((raw) => !!parsePersistedSession(raw));
}

async function resolveStoredSession() {
  if (!_sb) return null;
  try {
    const { data: { session }, error } = await _sb.auth.getSession();
    if (error) console.warn('PedagIA getSession:', error.message);
    if (session?.user) return session;
  } catch (e) {
    console.warn('PedagIA getSession:', e);
  }
  return null;
}

async function tryRestoreSessionFromStorage() {
  if (!_sb) return null;
  const keys = listPersistedAuthStorageKeys();
  const rawBackup = sessionStorage.getItem(SESSION_BACKUP_KEY);
  if (rawBackup) {
    const session = parsePersistedSession(rawBackup);
    if (session) {
      try {
        const { data, error } = await _sb.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (!error && data?.session?.user) return data.session;
      } catch (e) {
        console.warn('PedagIA setSession backup', e);
      }
    }
  }
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    const session = parsePersistedSession(raw);
    if (!session) continue;
    try {
      const { data, error } = await _sb.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (!error && data?.session?.user) return data.session;
    } catch (e) {
      console.warn('PedagIA setSession', key, e);
    }
  }
  return null;
}

async function recoverSessionWithRefresh() {
  if (!_sb) return null;
  let session = await resolveStoredSession();
  if (session?.user) return session;
  session = await tryRestoreSessionFromStorage();
  if (session?.user) return session;
  try {
    const { data: { session: refreshed }, error } = await _sb.auth.refreshSession();
    if (!error && refreshed?.user) return refreshed;
  } catch (e) {
    console.warn('PedagIA refreshSession:', e);
  }
  return null;
}

async function resolveSessionForBootstrap() {
  for (let attempt = 0; attempt < 20; attempt++) {
    let session = await resolveStoredSession();
    if (session?.user) return session;
    if (attempt === 0 || attempt % 4 === 0) {
      session = await tryRestoreSessionFromStorage();
      if (session?.user) return session;
    }
    if (attempt === 2) {
      session = await recoverSessionWithRefresh();
      if (session?.user) return session;
    }
    if (!hasPersistedAuthTokens()) break;
    await sleep(150);
  }
  return null;
}

function applySessionIfNeeded(session) {
  if (!session?.user) return;
  _userInitiatedLogout = false;
  persistSessionBackup(session);
  if (!currentSession) onLogin(session, { skipTplToast: true });
  else currentSession = session;
}

function isAuthGracePeriod() {
  return Date.now() < _authGraceUntil || _authBootstrapInProgress;
}

function waitForInitialAuthEvent(timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (_pendingInitialSession !== null) {
      resolve(_pendingInitialSession);
      return;
    }
    _initialSessionWaiter = resolve;
    setTimeout(() => {
      if (_initialSessionWaiter === resolve) {
        _initialSessionWaiter = null;
        resolve(_pendingInitialSession);
      }
    }, timeoutMs);
  });
}

async function confirmSignedOut() {
  if (!_userInitiatedLogout) return;
  _userInitiatedLogout = false;
  try {
    sessionStorage.removeItem(SESSION_BACKUP_KEY);
    localStorage.removeItem(PEDAGIA_SESSION_V2_KEY);
  } catch {}
  onLogout();
}

function finishAuthBootstrapWait() {
  if (_authBootWait.timer) {
    clearTimeout(_authBootWait.timer);
    _authBootWait.timer = null;
  }
  const done = _authBootWait.resolve;
  _authBootWait.resolve = null;
  if (done) done();
}

function showAuthResolvingShell() {
  const topBar = document.getElementById('top-bar');
  const mainWrap = document.getElementById('main-wrap');
  const viewAuth = document.getElementById('view-auth');
  if (topBar) topBar.style.display = 'none';
  if (mainWrap) mainWrap.style.display = 'none';
  if (viewAuth) {
    viewAuth.style.display = '';
    const err = document.getElementById('auth-err');
    if (err) {
      err.style.display = '';
      err.style.color = 'var(--t2)';
      err.textContent = 'Restaurando sua sessão…';
    }
  }
}

function registerAuthListener() {
  if (_authListenerRegistered || !_sb) return;
  _authListenerRegistered = true;

  _sb.auth.onAuthStateChange((event, session) => {
    if (!_authListenerReady) return;

    if (session?.user) {
      persistSessionBackup(session);
      applySessionIfNeeded(session);
      return;
    }

    if (event === 'SIGNED_OUT' && _userInitiatedLogout) {
      void confirmSignedOut();
      return;
    }

    if (event === 'TOKEN_REFRESH_FAILED' && hasPersistedAuthTokens()) {
      void recoverSessionWithRefresh().then((s) => {
        if (s?.user) applySessionIfNeeded(s);
      });
    }
  });
}

async function ensureFreshSession() {
  if (!_sb) return !!currentSession?.access_token;
  const session = await recoverSessionWithRefresh();
  if (!session?.access_token) return false;
  currentSession = session;
  return true;
}

async function bootstrapAuthSession() {
  if (!_sb) return;

  _authBootstrapInProgress = true;
  _authListenerReady = false;
  try {
    const session = await restoreAuthOnPageLoad();

    if (typeof _sb.auth.startAutoRefresh === 'function') {
      try { _sb.auth.startAutoRefresh(); } catch {}
    }

    _authListenerReady = true;
    registerAuthListener();

    _authBootstrapSettled = true;
    const err = document.getElementById('auth-err');
    if (session?.user) {
      if (err) err.style.display = 'none';
      onLogin(session, { skipTplToast: true });
      return;
    }
    showLoggedOutShell();
    if (hasPersistedAuthTokens() && err) {
      err.style.display = '';
      err.style.color = 'var(--R)';
      err.textContent = 'Sessão expirada. Entre novamente com e-mail e senha.';
    }
  } finally {
    _authBootstrapInProgress = false;
  }
}

function createPedagiaSupabaseClient(sbLib, supabaseUrl, supabaseKey) {
  _supabaseUrl = supabaseUrl;
  return sbLib.createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

function showLoggedOutShell() {
  const err = document.getElementById('auth-err');
  if (err) err.style.display = 'none';
  showView('auth');
  loadCab();
  loadHeadersLibrary({ silent: true }).catch(() => {});
}

function getCore() {
  return typeof window !== 'undefined' ? window.PedagiaCore : null;
}

function getBnccPrefsFromUI() {
  return {
    orientacoes: v('f-bncc-orient'),
    habilidades: v('f-bncc-hab'),
    focoAvaliativo: v('f-bncc-foco') || 'compreensão, aplicação e análise',
  };
}

function getExamMetadata() {
  const bncc = getBnccPrefsFromUI();
  return {
    disciplina: v('f-disc') || '',
    serie: v('f-serie') || '',
    tipo: v('f-tipo') || 'Prova',
    valor: v('f-valor') || '10,0',
    bimestre: v('f-bimestre') || '1º Bimestre',
    dificuldade: st.dif || 'medio',
    numQuestoesPedidas: st.numQ,
    materialId: st.materialId || undefined,
    scopeLabel: st.processedChapterId || undefined,
    bnccOrientacoes: bncc.orientacoes,
    bnccHabilidades: bncc.habilidades,
    bnccFoco: bncc.focoAvaliativo,
  };
}

const BNCC_PREFS_KEY = 'pedagia_bncc_prefs';

function loadBnccPrefs() {
  const orientEl = document.getElementById('f-bncc-orient');
  if (!orientEl) return;
  const core = getCore();
  const fallback = core?.BNCC_DEFAULT_ORIENTACOES || '';
  try {
    const raw = localStorage.getItem(BNCC_PREFS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    if (!orientEl.value.trim()) orientEl.value = o.orientacoes || fallback;
    const hab = document.getElementById('f-bncc-hab');
    const foco = document.getElementById('f-bncc-foco');
    if (hab && o.habilidades) hab.value = o.habilidades;
    if (foco && o.focoAvaliativo) foco.value = o.focoAvaliativo;
  } catch {
    if (!orientEl.value.trim()) orientEl.value = fallback;
  }
}

function onBnccPrefsChange() {
  try {
    localStorage.setItem(BNCC_PREFS_KEY, JSON.stringify(getBnccPrefsFromUI()));
  } catch {}
  scheduleExamPreview();
}

function planItemKey(item) {
  if (item.kind === 'block') return `b:${item.imageId}`;
  if (item.kind === 'text') return `t:${item.number}`;
  return `s:${item.slotIndex}`;
}

function buildExamPlanItems() {
  const items = [];
  const blocks = st.imageQuestionBlocks.filter((b) => b.question?.statement?.trim());
  blocks.forEach((b) => {
    const img = b.image || getImageCatalogEntry(b.imageId) || {};
    items.push({
      kind: 'block',
      imageId: b.imageId,
      blockId: b.blockId,
      selected: !!b.selected,
      title: img.title || img.caption || `Figura ${b.imageId.slice(0, 8)}`,
      preview: (b.question.statement || '').slice(0, 160),
      typeLabel: 'Com figura (professor/IA)',
      thumb: img.previewUrl || img.dataUri,
    });
  });

  const textQs = st.provaText?.trim() ? parseProvaToStructured() : [];
  textQs.forEach((q) => {
    items.push({
      kind: 'text',
      number: q.number,
      selected: true,
      title: `Questão ${q.number} — ${q.type === 'discursive' ? 'discursiva' : 'objetiva'}`,
      preview: (q.statement || '').slice(0, 160),
      typeLabel: q.type === 'discursive' ? 'Discursiva (texto)' : 'Objetiva (texto)',
      thumb: null,
    });
  });

  const slots = Math.max(0, st.numQ - getSelectedImageBlocks().length - textQs.length);
  for (let i = 0; i < slots; i++) {
    items.push({
      kind: 'slot',
      slotIndex: i,
      selected: true,
      title: `Questão textual ${textQs.length + blocks.filter((x) => x.selected).length + i + 1} (IA)`,
      preview: 'Será gerada pela IA com base no capítulo e nas orientações BNCC.',
      typeLabel: 'A gerar · BNCC',
      thumb: null,
    });
  }

  const order = st.examPlanOrder;
  if (order?.length) {
    const map = new Map(items.map((it) => [planItemKey(it), it]));
    const sorted = [];
    order.forEach((k) => {
      if (map.has(k)) {
        sorted.push(map.get(k));
        map.delete(k);
      }
    });
    map.forEach((it) => sorted.push(it));
    return sorted;
  }
  return items;
}

function syncExamPlanOrderFromItems(items) {
  st.examPlanOrder = items.map(planItemKey);
}

function getExamPlanStats(items) {
  const blocks = items.filter((i) => i.kind === 'block');
  const selectedBlocks = blocks.filter((i) => i.selected).length;
  const textCount = items.filter((i) => i.kind === 'text').length;
  const slotCount = items.filter((i) => i.kind === 'slot').length;
  const planned = selectedBlocks + textCount + slotCount;
  return { blocks, selectedBlocks, textCount, slotCount, planned, total: st.numQ };
}

function evbItemMatchesFilter(it) {
  const f = st.evbFilter || 'all';
  if (f === 'all') return true;
  if (f === 'block') return it.kind === 'block';
  if (f === 'slot') return it.kind === 'slot';
  if (f === 'text') return it.kind === 'text';
  return true;
}

function renderEvbPlanRow(it, idx, globalIdx) {
  const key = planItemKey(it);
  const on = it.kind !== 'block' || it.selected;
  const kindClass =
    it.kind === 'block' ? 'evb-kind-fig' : it.kind === 'slot' ? 'evb-kind-ia' : 'evb-kind-txt';
  const badge =
    it.kind === 'block'
      ? on
        ? 'Na prova'
        : 'Fora'
      : it.kind === 'slot'
        ? 'IA'
        : 'Texto';
  const thumb = it.thumb
    ? `<img src="${it.thumb}" alt="" class="evb-item-thumb">`
    : `<span class="evb-item-thumb-ph">${it.kind === 'slot' ? '✦' : '📝'}</span>`;
  const toggler =
    it.kind === 'block'
      ? `<label class="evb-check"><input type="checkbox" ${on ? 'checked' : ''} onchange="toggleExamPlanBlock('${escHtml(it.imageId)}', this.checked)"> Incluir na prova</label>`
      : '';
  const actions =
    it.kind === 'block' && !on
      ? `<button type="button" class="chip cy evb-mini" onclick="toggleExamPlanBlock('${escHtml(it.imageId)}', true)">+ Incluir</button>`
      : '';
  return `
      <div class="evb-item ${on ? 'on' : ''} ${kindClass}" data-plan-key="${escHtml(key)}" data-global-idx="${globalIdx}">
        <div class="evb-item-num">${idx + 1}</div>
        <div class="evb-item-thumb-wrap">${thumb}</div>
        <div class="evb-item-body">
          <div class="evb-item-top">
            <span class="evb-badge">${badge}</span>
            <span class="evb-item-title">${escHtml(it.title)}</span>
          </div>
          <p class="evb-item-preview">${escHtml(it.preview)}</p>
          ${toggler}${actions}
        </div>
        <div class="evb-item-actions">
          <button type="button" class="chip evb-mini" title="Subir" onclick="moveExamPlanItem(${globalIdx},-1)">↑</button>
          <button type="button" class="chip evb-mini" title="Descer" onclick="moveExamPlanItem(${globalIdx},1)">↓</button>
        </div>
      </div>`;
}

function renderExamVisualBuilder() {
  const root = document.getElementById('exam-visual-builder');
  if (!root) return;
  const list = document.getElementById('evb-list');
  const summary = document.getElementById('evb-summary');
  const status = document.getElementById('evb-status');
  if (!list) return;

  const items = buildExamPlanItems();
  syncExamPlanOrderFromItems(items);
  const stats = getExamPlanStats(items);
  const pct = stats.total > 0 ? Math.min(100, Math.round((stats.planned / stats.total) * 100)) : 0;

  const fill = document.getElementById('evb-progress-fill');
  const progLabel = document.getElementById('evb-progress-label');
  if (fill) fill.style.width = `${pct}%`;
  if (progLabel) {
    if (!stats.total) progLabel.textContent = 'Defina o número de questões';
    else if (stats.planned >= stats.total)
      progLabel.textContent = `Plano completo: ${stats.planned} de ${stats.total} questões`;
    else
      progLabel.textContent = `Faltam ${stats.total - stats.planned} — inclua figuras ou use Gerar prova`;
  }
  if (status) {
    status.textContent = `${stats.planned}/${stats.total}`;
    status.classList.toggle('evb-status-ok', stats.planned >= stats.total && stats.total > 0);
  }

  document.querySelectorAll('.evb-step').forEach((el) => {
    const step = Number(el.dataset.step);
    let on = false;
    if (step === 1) on = stats.total > 0;
    else if (step === 2) on = stats.blocks.length > 0;
    else if (step === 3) on = stats.planned > 0;
    else if (step === 4) on = stats.planned > 0 || st.provaText?.trim();
    el.classList.toggle('on', on);
    el.classList.toggle('done', on);
  });

  const core = getCore();
  const mix = core?.describeBnccMix
    ? core.describeBnccMix(core.getBnccExamTemplate(st.numQ, v('f-serie')))
    : `${st.numQ} questões`;

  if (summary) {
    summary.innerHTML = `
      <div class="evb-stat-grid">
        <div class="evb-stat"><span class="evb-stat-n">${stats.selectedBlocks}</span><span class="evb-stat-l">Com figura</span></div>
        <div class="evb-stat"><span class="evb-stat-n">${stats.slotCount}</span><span class="evb-stat-l">IA gera</span></div>
        <div class="evb-stat"><span class="evb-stat-n">${stats.textCount}</span><span class="evb-stat-l">Já escritas</span></div>
        <div class="evb-stat evb-stat-total"><span class="evb-stat-n">${stats.planned}/${stats.total}</span><span class="evb-stat-l">${escHtml(mix)}</span></div>
      </div>`;
  }

  document.querySelectorAll('.evb-filter').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.evbFilter === (st.evbFilter || 'all'));
  });

  const filtered = items.filter(evbItemMatchesFilter);
  const groups = [
    { id: 'block', title: 'Suas questões com figura', hint: 'De Minhas mídias ou Material — marque as que entram', items: items.filter((i) => i.kind === 'block') },
    { id: 'slot', title: 'Serão geradas pela IA', hint: 'Preenchidas ao clicar em Gerar prova', items: items.filter((i) => i.kind === 'slot') },
    { id: 'text', title: 'Já na prova (texto)', hint: 'Após gerar ou editar a prova', items: items.filter((i) => i.kind === 'text') },
  ];

  if (!items.length) {
    list.innerHTML = `
      <div class="evb-empty">
        <p><strong>Comece assim:</strong></p>
        <ol class="evb-empty-steps">
          <li>Defina o <b>número de questões</b> abaixo</li>
          <li>Em <button type="button" class="chip" onclick="goTo('midias')">Minhas mídias</button>, use <b>Sugerir questão</b></li>
          <li>Volte aqui e marque <b>Incluir na prova</b></li>
          <li>Toque em <b>Gerar prova</b> para completar o restante (BNCC)</li>
        </ol>
      </div>`;
    return;
  }

  if (st.evbFilter !== 'all') {
    if (!filtered.length) {
      list.innerHTML = '<div class="exercicios-empty">Nenhum item neste filtro.</div>';
      return;
    }
    list.innerHTML = filtered
      .map((it) => {
        const globalIdx = items.indexOf(it);
        return renderEvbPlanRow(it, globalIdx, globalIdx);
      })
      .join('');
    return;
  }

  let html = '';
  let displayNum = 0;
  groups.forEach((g) => {
    if (!g.items.length) return;
    const visible = g.items;
    html += `<div class="evb-group">
      <div class="evb-group-head">
        <span class="evb-group-title">${escHtml(g.title)}</span>
        <span class="evb-group-count">${visible.length}</span>
      </div>
      <p class="evb-group-hint">${escHtml(g.hint)}</p>
      <div class="evb-group-list">`;
    visible.forEach((it) => {
      const globalIdx = items.indexOf(it);
      html += renderEvbPlanRow(it, displayNum, globalIdx);
      displayNum += 1;
    });
    html += '</div></div>';
  });
  list.innerHTML = html || '<div class="exercicios-empty">Nenhum item no plano.</div>';
}

function evbSetFilter(f) {
  st.evbFilter = f || 'all';
  renderExamVisualBuilder();
}

function evbSelectAllBlocks() {
  st.imageQuestionBlocks.forEach((b) => {
    if (b.question?.statement?.trim()) b.selected = true;
  });
  st.imageQuestionBlocks.forEach((b) => syncBlockCardUI(b.imageId));
  updateBlockSelInfo();
  scheduleSaveBuilder();
  scheduleExamPreview();
}

function evbClearAllBlocks() {
  st.imageQuestionBlocks.forEach((b) => {
    b.selected = false;
    syncBlockCardUI(b.imageId);
  });
  updateBlockSelInfo();
  scheduleSaveBuilder();
  scheduleExamPreview();
}

function evbSuggestOrder() {
  const items = buildExamPlanItems();
  const blocksOn = items.filter((i) => i.kind === 'block' && i.selected);
  const blocksOff = items.filter((i) => i.kind === 'block' && !i.selected);
  const slots = items.filter((i) => i.kind === 'slot');
  const texts = items.filter((i) => i.kind === 'text');
  const reordered = [...blocksOn, ...slots, ...texts, ...blocksOff];
  syncExamPlanOrderFromItems(reordered);
  const blockOrder = reordered.filter((i) => i.kind === 'block').map((i) => i.imageId);
  const newBlocks = [];
  blockOrder.forEach((id) => {
    const b = st.imageQuestionBlocks.find((x) => x.imageId === id);
    if (b) newBlocks.push(b);
  });
  st.imageQuestionBlocks.forEach((b) => {
    if (!blockOrder.includes(b.imageId)) newBlocks.push(b);
  });
  st.imageQuestionBlocks = newBlocks;
  renderExamVisualBuilder();
  scheduleSaveBuilder();
  scheduleExamPreview();
  toast('Ordem sugerida: figuras → IA → texto.', 'ok', 2500);
}

function moveExamPlanItem(index, delta) {
  const items = buildExamPlanItems();
  const next = index + delta;
  if (next < 0 || next >= items.length) return;
  const tmp = items[index];
  items[index] = items[next];
  items[next] = tmp;
  syncExamPlanOrderFromItems(items);
  const blockOrder = items.filter((i) => i.kind === 'block').map((i) => i.imageId);
  const reordered = [];
  blockOrder.forEach((id) => {
    const b = st.imageQuestionBlocks.find((x) => x.imageId === id);
    if (b) reordered.push(b);
  });
  st.imageQuestionBlocks.forEach((b) => {
    if (!blockOrder.includes(b.imageId)) reordered.push(b);
  });
  st.imageQuestionBlocks = reordered;
  renderExamVisualBuilder();
  scheduleSaveBuilder();
  scheduleExamPreview();
}

function toggleExamPlanBlock(imageId, on) {
  const b = st.imageQuestionBlocks.find((x) => x.imageId === imageId);
  if (!b) return;
  b.selected = !!on;
  syncBlockCardUI(imageId);
  updateBlockSelInfo();
  renderExamVisualBuilder();
  scheduleSaveBuilder();
  scheduleExamPreview();
}

async function resolveImageB64ForCore(imageId, img) {
  const merged = img || st.imageCatalog.find(i => i.imageId === imageId);
  if (!merged) return '';
  let b64 = getImageB64(merged);
  if (b64) return b64;
  if (cloudReady() && merged.storagePath) {
    b64 = await PedagiaCloud.fetchImageB64(merged);
    if (b64) merged.base64 = cleanB64(b64);
  }
  if (!b64) {
    const url = merged.previewUrl || merged.dataUri || merged.dataUrl || '';
    if (url) b64 = await fetchUrlToB64(url);
    if (b64) merged.base64 = b64;
  }
  return b64 || '';
}

function buildStateExamModel() {
  const core = getCore();
  if (!core) return null;
  syncProvaStateFromUI();
  const exam = core.buildExamModel({
    provaText: st.provaText,
    gabText: st.gabText,
    metadata: getExamMetadata(),
    header: getCab(),
    imageCatalog: st.imageCatalog,
    imageQuestionBlocks: st.imageQuestionBlocks,
  });
  st.examModel = exam;
  return exam;
}

function getExamBuildResult() {
  const core = getCore();
  if (core) {
    const exam = buildStateExamModel();
    const issues = core.validateExamModel(exam, { strictExport: false });
    return { exam, questions: exam.questions, issues };
  }
  return buildExamQuestions();
}

// ══════════════════════════════════════════════
// INIT + AUTH
// ══════════════════════════════════════════════
async function init() {
  showAuthResolvingShell();

  // Load PDF.js worker
  const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
  if (pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  try {
    const res = await fetch('/api/config');
    const cfg = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(cfg.error || `Servidor indisponível (${res.status})`);
    }
    if (!cfg.supabaseUrl || !cfg.supabaseKey) {
      throw new Error('Supabase não configurado no servidor (.env).');
    }
    _supabaseUrl = cfg.supabaseUrl;
    migrateLegacyAuthStorage();
    if (cfg.openRouterOk === false && cfg.openRouterHint) {
      console.warn('PedagIA — IA:', cfg.openRouterHint);
    }
    const sbLib = window.supabase;
    if (!sbLib?.createClient) {
      throw new Error('Biblioteca Supabase não carregou. Recarregue a página (Ctrl+F5).');
    }
    const w = window;
    const clientSig = `${cfg.supabaseUrl}|${cfg.supabaseKey}`;
    if (!w.__pedagiaSupabase || w.__pedagiaSupabaseSig !== clientSig) {
      w.__pedagiaSupabase = createPedagiaSupabaseClient(sbLib, cfg.supabaseUrl, cfg.supabaseKey);
      w.__pedagiaSupabaseSig = clientSig;
      _authListenerRegistered = false;
      _authListenerReady = false;
      _authBootstrapSettled = false;
    }
    _sb = w.__pedagiaSupabase;
    attachPedagiaGlobals();
    await bootstrapAuthSession();
  } catch (e) {
    console.error('PedagIA init:', e);
    const recovered = _sb ? await recoverSessionWithRefresh() : null;
    if (recovered?.user) {
      onLogin(recovered, { skipTplToast: true });
    } else {
      showLoggedOutShell();
      const errEl = document.getElementById('auth-err');
      if (errEl) {
        errEl.textContent = e.message || 'Erro ao iniciar o app.';
        errEl.style.display = '';
      }
    }
  }

  updateDist();
  loadBnccPrefs();
  ['f-disc', 'f-serie', 'f-tipo', 'f-valor', 'f-bimestre'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', scheduleExamPreview);
  });
  window.addEventListener('beforeunload', saveDraft);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveDraft();
  });
}

function saveDraft() {
  if (!currentSession) return;
  const provaText = (document.getElementById('prova-text')?.value || st.provaText || '').trim();
  if (!provaText) return;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      view: st.activeView || 'result',
      provaText,
      gabText: (document.getElementById('gab-text')?.value || st.gabText || '').trim(),
      currentProvaId: st.currentProvaId,
      disc: v('f-disc'),
      serie: v('f-serie'),
      savedAt: Date.now(),
    }));
  } catch {}
}

function restoreDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d?.provaText?.trim()) return false;

    st.provaText = d.provaText;
    st.gabText = d.gabText || '';
    st.currentProvaId = d.currentProvaId || null;
    const pt = document.getElementById('prova-text');
    const gt = document.getElementById('gab-text');
    if (pt) pt.value = st.provaText;
    if (gt) gt.value = st.gabText;
    if (d.disc) { const el = document.getElementById('f-disc'); if (el) el.value = d.disc; }
    if (d.serie) { const el = document.getElementById('f-serie'); if (el) el.value = d.serie; }
    if (st.currentProvaId) {
      const badge = document.getElementById('badge-saved');
      if (badge) badge.style.display = '';
    }
    showView('result');
    syncNavPills('result');
    rTab('preview');
    scheduleExamPreview();
    return true;
  } catch { return false; }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
}

function onLogin(session, opts = {}) {
  if (!session?.user) return;
  currentSession = session;
  attachPedagiaGlobals();
  const topBar = document.getElementById('top-bar');
  const mainWrap = document.getElementById('main-wrap');
  const viewAuth = document.getElementById('view-auth');
  if (!topBar || !mainWrap || !viewAuth) {
    console.error('PedagIA: elementos da interface não encontrados.');
    return;
  }
  topBar.style.display = 'flex';
  mainWrap.style.display = 'block';
  viewAuth.style.display = 'none';
  const email = session.user.email || '';
  document.getElementById('user-initials').textContent = email[0]?.toUpperCase() || 'P';
  document.getElementById('gbar').style.display = '';
  loadCab();
  loadHistory();
  loadHeadersLibrary({ silent: opts.skipTplToast }).then(ok => {
    if (ok && !opts.skipTplToast) toast('Cabeçalho restaurado.', 'ok', 3000);
  });
  initMaterialsAfterLogin({ silent: opts.skipTplToast });
  loadBnccPrefs();
  if (!restoreDraft()) {
    const savedView = restoreActiveView();
    const defaultView = savedView && savedView !== 'form' ? savedView : 'builder';
    showView(defaultView);
    if (defaultView === 'builder') initBuilderView().catch(() => {});
    if (savedView === 'material' || defaultView === 'material') initMaterialView().catch(() => {});
    if (savedView === 'midias') refreshMidiasPage();
  }
  renderExamVisualBuilder();
}
function onLogout() {
  currentSession = null;
  try {
    sessionStorage.removeItem(SESSION_BACKUP_KEY);
    localStorage.removeItem(PEDAGIA_SESSION_V2_KEY);
  } catch {}
  clearDraft();
  document.getElementById('top-bar').style.display = 'none';
  document.getElementById('main-wrap').style.display = 'none';
  document.getElementById('gbar').style.display = 'none';
  showView('auth');
}

let authMode = 'login';
function switchAuth(m) {
  authMode = m;
  document.getElementById('at-login').classList.toggle('on', m==='login');
  document.getElementById('at-reg').classList.toggle('on', m==='register');
  document.getElementById('auth-btn').textContent = m==='login' ? 'Entrar' : 'Criar conta';
  document.getElementById('auth-err').style.display = 'none';
}
async function doAuth() {
  const email = document.getElementById('a-email').value.trim();
  const pass  = document.getElementById('a-pass').value;
  const btn   = document.getElementById('auth-btn');
  const err   = document.getElementById('auth-err');
  if (!email || !pass) { err.textContent='Preencha e-mail e senha.'; err.style.display=''; return; }
  if (!_sb) {
    err.textContent = 'Aguarde o carregamento ou recarregue a página (Ctrl+F5).';
    err.style.display = '';
    return;
  }
  btn.disabled = true; btn.textContent = '...';
  err.style.display = 'none';
  try {
    let result;
    if (authMode === 'login') {
      result = await _sb.auth.signInWithPassword({ email, password: pass });
    } else {
      result = await _sb.auth.signUp({ email, password: pass });
    }
    if (result.error) throw result.error;
    if (result.data?.session) {
      _userInitiatedLogout = false;
      persistSessionBackup(result.data.session);
      await sleep(120);
      const { data: { session: verified } } = await _sb.auth.getSession();
      const sess = verified?.user ? verified : result.data.session;
      persistSessionBackup(sess);
      onLogin(sess);
    } else if (authMode === 'register') {
      err.style.cssText='display:block;color:#3DD86A;background:var(--Ga);border-color:rgba(24,160,60,.2)';
      err.textContent = 'Conta criada! Verifique seu e-mail para confirmar.';
    }
  } catch(e) {
    err.textContent = e.message || 'Erro de autenticação.';
    err.style.display = '';
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Entrar' : 'Criar conta';
  }
}
async function doLogout() {
  _userInitiatedLogout = true;
  await _sb?.auth.signOut();
}

// ══════════════════════════════════════════════
// VIEWS + NAV
// ══════════════════════════════════════════════
function showView(name) {
  st.activeView = name;
  saveActiveView();
  ['auth','builder','form','material','midias','exercicios','revisao','loading','result','history','inteligente'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.style.display = v === name ? '' : 'none';
  });
  const gbar = document.getElementById('gbar');
  const hideChrome = name === 'auth' || name === 'loading';
  if (gbar) gbar.style.display = !hideChrome && name === 'form' && currentSession ? '' : 'none';
  if (name === 'builder') document.getElementById('bd-montar-btn')?.scrollIntoView({ block: 'nearest' });
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.style.display = !hideChrome && currentSession ? 'flex' : 'none';
  if (name === 'result') saveDraft();
  syncNavPills(name === 'result' ? 'form' : name);
  document.documentElement.classList.toggle('view-result-active', name === 'result');
}
function syncNavPills(view) {
  const map = { builder:'np-builder', form:'np-form', material:'np-material', midias:'np-midias', exercicios:'np-exercicios', inteligente:'np-ci', history:'np-hist' };
  Object.entries(map).forEach(([v, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', v === view);
  });
  document.querySelectorAll('.bn-item').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.view === view);
  });
}
function goTo(view) {
  if (!currentSession) { showView('auth'); return; }
  // Fluxo antigo "Nova prova" unificado no Montar.
  if (view === 'form') view = 'builder';
  if (view === 'builder') {
    showView('builder');
    syncNavPills('builder');
    initBuilderView().catch((e) => console.warn('builder', e));
    return;
  }
  if (view === 'material') {
    showView('material');
    syncNavPills('material');
    initMaterialView().catch((e) => console.warn('material view', e));
    return;
  }
  if (view === 'midias') {
    showView('midias');
    syncNavPills('midias');
    refreshMidiasPage();
    return;
  }
  if (view === 'exercicios') {
    showView('exercicios');
    syncNavPills('exercicios');
    loadExercicios();
    return;
  }
  if (view === 'form' && st.provaText?.trim()) {
    const ok = confirm('Abrir nova prova? A prova atual continua salva no rascunho desta sessão.');
    if (!ok) return;
    clearDraft();
    st.provaText = '';
    st.gabText = '';
    st.currentProvaId = null;
    const pt = document.getElementById('prova-text');
    const gt = document.getElementById('gab-text');
    if (pt) pt.value = '';
    if (gt) gt.value = '';
    const badge = document.getElementById('badge-saved');
    if (badge) badge.style.display = 'none';
  }
  if (view === 'history') loadHistory();
  showView(view);
  syncNavPills(view);
}

// ══════════════════════════════════════════════
// FORM UI
// ══════════════════════════════════════════════
function setHtab(m) {
  document.getElementById('htab-m').classList.toggle('on', m==='m');
  document.getElementById('htab-a').classList.toggle('on', m==='a');
  const hl = document.getElementById('htab-l');
  if (hl) hl.classList.toggle('on', m==='l');
  document.getElementById('pnl-m').style.display = m==='m' ? 'block' : 'none';
  document.getElementById('pnl-a').style.display = m==='a' ? 'block' : 'none';
  const pl = document.getElementById('pnl-l');
  if (pl) pl.style.display = m==='l' ? 'block' : 'none';
  if (m === 'l') renderHeadersList();
}
function setSrc(s) {
  document.getElementById('s-livro').classList.toggle('on', s==='livro');
  document.getElementById('s-desc').classList.toggle('on', s==='desc');
  document.getElementById('fp-livro').classList.toggle('show', s==='livro');
  document.getElementById('fp-desc').classList.toggle('show', s==='desc');
}
function setDif(el) {
  document.querySelectorAll('[data-d]').forEach(c => c.className='chip');
  el.classList.add(el.dataset.d==='facil' ? 'cg' : 'cy');
  st.dif = el.dataset.d;
}
function chImgQ(d) {
  const el = document.getElementById('img-q-v');
  const totalEl = document.getElementById('img-q-total');
  if (!el) return;
  const max = st.numQ || parseInt(totalEl?.textContent, 10) || 18;
  let n = parseInt(el.textContent, 10) || 3;
  n = Math.max(1, Math.min(max, n + d));
  el.textContent = String(n);
  if (totalEl) totalEl.textContent = String(max);
}

function chN(d) {
  st.numQ = Math.min(30, Math.max(3, st.numQ + d));
  document.getElementById('nv').textContent = st.numQ;
  updateDist();
}

function updateDist() {
  const n = st.numQ;
  if (n < 5) { document.getElementById('dist-box').style.display='none'; return; }
  const t = [
    ['Compreensão do texto do livro', Math.max(1, Math.round(n * 0.22))],
    ['Aplicação de conceito do capítulo', Math.max(1, Math.round(n * 0.2))],
    ['Análise de dado/mapa do material', Math.max(1, Math.round(n * 0.18))],
    ['Com figura do professor', Math.max(0, Math.round(n * 0.14))],
    ['Discursiva com critérios BNCC', Math.max(1, Math.round(n * 0.14))],
    ['Síntese / justificativa', Math.max(0, Math.round(n * 0.12))],
  ];
  // Ajusta total para bater em n
  let sum = t.reduce((a,[,v])=>a+v, 0);
  let diff = n - sum;
  if (diff > 0) t[0][1] += diff;
  else if (diff < 0) { for (let i=t.length-1;i>=0&&diff<0;i--) { if(t[i][1]>0){t[i][1]--;diff++;} } }

  const distTitle = document.querySelector('#dist-box [style*="uppercase"]');
  if (distTitle) distTitle.textContent = 'Distribuição sugerida (BNCC)';
  document.getElementById('dist-table').innerHTML =
    t.filter(([,v])=>v>0).map(([lbl,val])=>
      `<span style="color:var(--t2)">${lbl}</span><span style="color:var(--Y);font-weight:800;text-align:right">${val}q</span>`
    ).join('');
  document.getElementById('dist-box').style.display = '';
  renderExamVisualBuilder();
}

// ══════════════════════════════════════════════
// SCHOOL TEMPLATE
// ══════════════════════════════════════════════
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function getKind(file) {
  if (file.name.endsWith('.docx') || file.type === DOCX_MIME) return 'docx';
  if (file.name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  return null;
}

const APP_DB_NAME = 'pedagia_v2';
const TPL_STORE = 'header_templates';
const BOOK_STORE = 'book_pdfs';
const BUILDER_STORE = 'builder_state';
const TPL_MAX_BYTES = 15 * 1024 * 1024;
const BOOK_MAX_BYTES = 200 * 1024 * 1024;
const BOOK_MAX_MB = Math.round(BOOK_MAX_BYTES / (1024 * 1024));
let _builderSaveTimer = null;

function storageUserKey(prefix) {
  return currentSession?.user?.id ? `${prefix}_${currentSession.user.id}` : `${prefix}_local`;
}
function templateStorageKey() { return storageUserKey('tpl'); }
const ACTIVE_MATERIAL_KEY = 'pg_active_material';
function activeMaterialKey() { return st.materialId || '_draft'; }
function bookStorageKey() { return `${storageUserKey('book')}_${activeMaterialKey()}`; }
function builderStorageKey() { return `${storageUserKey('bld')}_${activeMaterialKey()}`; }
function getActiveMaterialStorageKey() {
  return `${ACTIVE_MATERIAL_KEY}_${currentSession?.user?.id || 'local'}`;
}
function getStoredActiveMaterialId() {
  try { return localStorage.getItem(getActiveMaterialStorageKey()) || ''; } catch { return ''; }
}
function setStoredActiveMaterialId(id) {
  try {
    if (id) localStorage.setItem(getActiveMaterialStorageKey(), id);
    else localStorage.removeItem(getActiveMaterialStorageKey());
  } catch {}
}

function openAppDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB indisponível')); return; }
    const req = indexedDB.open(APP_DB_NAME, 2);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      [TPL_STORE, BOOK_STORE, BUILDER_STORE].forEach(s => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      });
    };
    req.onsuccess = () => resolve(req.result);
  });
}
const openTplDb = openAppDb;

async function saveTemplateToStorage(file, kind) {
  const ab = await file.arrayBuffer();
  const db = await openTplDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(TPL_STORE, 'readwrite');
    tx.objectStore(TPL_STORE).put({
      name: file.name,
      kind,
      mimeType: file.type || (kind === 'pdf' ? 'application/pdf' : DOCX_MIME),
      data: ab,
      savedAt: Date.now(),
    }, templateStorageKey());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function deleteTemplateFromStorage() {
  if (!window.indexedDB) return;
  try {
    const db = await openTplDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(TPL_STORE, 'readwrite');
      tx.objectStore(TPL_STORE).delete(templateStorageKey());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}

function showTemplateUI(file, kind, opts = {}) {
  const { fromStorage = false } = opts;
  document.getElementById('escola-empty').style.display = 'none';
  document.getElementById('escola-loaded').style.display = '';
  document.getElementById('escola-icon').textContent = kind === 'docx' ? '📝' : '📄';
  document.getElementById('escola-fname').textContent = file.name;
  const kindLbl = kind === 'docx' ? 'Word' : 'PDF';
  const savedLbl = fromStorage ? ' · salvo no perfil' : '';
  document.getElementById('escola-fsize').textContent = formatBytes(file.size) + ' — ' + kindLbl + savedLbl;
  const hint = document.getElementById('escola-saved-hint');
  if (hint) hint.style.display = fromStorage ? 'block' : 'none';
}

async function tplDbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TPL_STORE, 'readonly');
    const req = tx.objectStore(TPL_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function migrateLocalTemplateToUser() {
  if (!currentSession?.user?.id || !window.indexedDB) return;
  try {
    const db = await openTplDb();
    const userKey = templateStorageKey();
    const local = await tplDbGet(db, 'tpl_local');
    const user = await tplDbGet(db, userKey);
    if (local?.data && !user?.data) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(TPL_STORE, 'readwrite');
        tx.objectStore(TPL_STORE).put(local, userKey);
        tx.objectStore(TPL_STORE).delete('tpl_local');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    db.close();
  } catch {}
}

async function loadSavedTemplate() {
  if (!window.indexedDB) return false;
  try {
    await migrateLocalTemplateToUser();
    const key = templateStorageKey();
    const db = await openTplDb();
    const rec = await tplDbGet(db, key);
    db.close();
    if (!rec?.data) return false;

    const blob = new Blob([rec.data], { type: rec.mimeType });
    const file = new File([blob], rec.name, {
      type: rec.mimeType,
      lastModified: rec.savedAt || Date.now(),
    });
    st.templateFile = file;
    st.templateKind = rec.kind;
    showTemplateUI(file, rec.kind, { fromStorage: true });
    return true;
  } catch (e) {
    console.warn('Não foi possível carregar cabeçalho salvo:', e);
    return false;
  }
}

async function handleTemplateFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const kind = getKind(file);
  if (!kind) { toast('Envie .docx ou .pdf', 'err'); return; }
  if (file.size > TPL_MAX_BYTES) {
    toast('Arquivo muito grande (máx. 15 MB).', 'err');
    input.value = '';
    return;
  }
  st.templateFile = file;
  st.templateKind = kind;
  st._tplPreviewUrl = null;
  showTemplateUI(file, kind);
  scheduleExamPreview();
  try {
    await saveTemplateToStorage(file, kind);
    if (st.activeHeaderId) {
      const sp = await saveHeaderFileToStorage(st.activeHeaderId, file, kind);
      const idx = await getHeadersIndex();
      const item = idx.items.find(i => i.id === st.activeHeaderId);
      if (item) { item.storagePath = sp; await saveHeadersIndex(idx); }
      await syncActiveHeaderCab();
    }
    const hint = document.getElementById('escola-saved-hint');
    if (hint) hint.style.display = 'block';
    toast('Cabeçalho salvo — não precisa enviar de novo.', 'ok', 4500);
  } catch (e) {
    toast('Cabeçalho em uso, mas não foi possível salvar: ' + e.message, 'err', 5000);
  }
}

async function removeTemplate() {
  st.templateFile = null;
  st.templateKind = null;
  st._tplPreviewUrl = null;
  document.getElementById('f-escola-file').value = '';
  document.getElementById('escola-empty').style.display = '';
  document.getElementById('escola-loaded').style.display = 'none';
  const hint = document.getElementById('escola-saved-hint');
  if (hint) hint.style.display = 'none';
  await deleteTemplateFromStorage();
  if (st.activeHeaderId) {
    const idx = await getHeadersIndex();
    const item = idx.items.find(i => i.id === st.activeHeaderId);
    if (item) {
      item.hasFile = false;
      item.fileName = '';
      item.fileKind = null;
      item.kind = 'manual';
      await deleteHeaderFileFromStorage(st.activeHeaderId);
      await saveHeadersIndex(idx);
      renderHeadersList();
    }
  }
  toast('Cabeçalho removido deste dispositivo.', 'ok');
}
function formatBytes(b) {
  if (b < 1024) return b+'B'; if (b < 1048576) return (b/1024).toFixed(0)+'KB';
  return (b/1048576).toFixed(1)+'MB';
}

// ══════════════════════════════════════════════
// CAB (school data persistence)
// ══════════════════════════════════════════════
function getCab() {
  return {
    governo: v('f-governo'), secretaria: v('f-secretaria'),
    escola: v('f-escola'), endereco: v('f-endereco'),
    cidade: v('f-cidade'), fone: v('f-fone'),
    prof: v('f-prof'), bimestre: document.getElementById('f-bimestre')?.value || '',
    modo: st.templateFile ? 'arquivo' : 'manual',
  };
}
function v(id) { return document.getElementById(id)?.value || ''; }
function saveCab() {
  try { localStorage.setItem('pgcab', JSON.stringify(getCab())); } catch {}
  syncActiveHeaderCab().catch(() => {});
  scheduleExamPreview();
}
function loadCab() {
  try {
    const c = JSON.parse(localStorage.getItem('pgcab') || '{}');
    ['governo','secretaria','escola','endereco','cidade','fone','prof'].forEach(k => { const el=document.getElementById('f-'+k); if(el&&c[k]) el.value=c[k]; });
    if (c.bimestre) { const el=document.getElementById('f-bimestre'); if(el) el.value=c.bimestre; }
    // Mostra badge de perfil carregado se há dados
    if (c.escola || c.prof) {
      const badge = document.getElementById('cab-badge');
      const bname = document.getElementById('cab-badge-name');
      if (badge && bname) {
        bname.textContent = [c.escola, c.prof].filter(Boolean).join(' · ');
        badge.style.display = 'flex';
      }
    }
  } catch {}
}

// ══════════════════════════════════════════════
// MEUS CABEÇALHOS (biblioteca nomeada + seleção na prova)
// ══════════════════════════════════════════════
function headersIndexKey() { return storageUserKey('headers_idx'); }
function headerFileKey(id) { return `${storageUserKey('hdr_file')}_${id}`; }

async function getHeadersIndex() {
  if (cloudReady()) {
    try {
      const idx = await PedagiaCloud.loadHeadersIndex();
      if (idx && Array.isArray(idx.items)) return idx;
    } catch (e) { console.warn('headers cloud:', e); }
  }
  if (!window.indexedDB) return { activeId: null, items: [] };
  try {
    const db = await openTplDb();
    const rec = await tplDbGet(db, headersIndexKey());
    db.close();
    if (rec && Array.isArray(rec.items)) return rec;
    return { activeId: null, items: [] };
  } catch {
    return { activeId: null, items: [] };
  }
}

async function saveHeadersIndex(idx) {
  st.headersIndex = idx;
  if (cloudReady()) {
    try { await PedagiaCloud.saveHeadersIndex(idx); } catch (e) { console.warn('save headers:', e); }
  }
  if (!window.indexedDB) return;
  const db = await openTplDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(TPL_STORE, 'readwrite');
    tx.objectStore(TPL_STORE).put(idx, headersIndexKey());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function saveHeaderFileToStorage(id, file, kind) {
  if (cloudReady()) return PedagiaCloud.uploadHeaderFile(id, file, kind);
  const ab = await file.arrayBuffer();
  const db = await openTplDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(TPL_STORE, 'readwrite');
    tx.objectStore(TPL_STORE).put({
      name: file.name,
      kind,
      mimeType: file.type || (kind === 'pdf' ? 'application/pdf' : DOCX_MIME),
      data: ab,
      savedAt: Date.now(),
    }, headerFileKey(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function deleteHeaderFileFromStorage(id, item) {
  if (item?.storagePath && cloudReady()) {
    try { await PedagiaCloud.remove(item.storagePath); } catch {}
    return;
  }
  if (!window.indexedDB) return;
  try {
    const db = await openTplDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(TPL_STORE, 'readwrite');
      tx.objectStore(TPL_STORE).delete(headerFileKey(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}

function applyCabToForm(c = {}) {
  ['governo','secretaria','escola','endereco','cidade','fone','prof'].forEach(k => {
    const el = document.getElementById('f-' + k);
    if (el) el.value = c[k] || '';
  });
  if (c.bimestre) {
    const el = document.getElementById('f-bimestre');
    if (el) el.value = c.bimestre;
  }
  const badge = document.getElementById('cab-badge');
  const bname = document.getElementById('cab-badge-name');
  if (badge && bname && (c.escola || c.prof)) {
    bname.textContent = [c.escola, c.prof].filter(Boolean).join(' · ');
    badge.style.display = 'flex';
  } else if (badge) {
    badge.style.display = 'none';
  }
}

function resetTemplateUI() {
  st.templateFile = null;
  st.templateKind = null;
  const inp = document.getElementById('f-escola-file');
  if (inp) inp.value = '';
  const empty = document.getElementById('escola-empty');
  const loaded = document.getElementById('escola-loaded');
  if (empty) empty.style.display = '';
  if (loaded) loaded.style.display = 'none';
  const hint = document.getElementById('escola-saved-hint');
  if (hint) hint.style.display = 'none';
}

function headerItemMeta(item) {
  if (item.hasFile) return (item.fileKind === 'docx' ? 'Word' : 'PDF') + (item.fileName ? ' · ' + item.fileName : '');
  const c = item.cab || {};
  return [c.escola, c.prof].filter(Boolean).join(' · ') || 'Preenchimento manual';
}

function refreshHeaderSelect() {
  const sel = document.getElementById('f-cabecalho-sel');
  if (!sel) return;
  const items = st.headersIndex?.items || [];
  if (!items.length) {
    sel.innerHTML = '<option value="">— Nenhum salvo —</option>';
    sel.value = '';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = items.map(it =>
    `<option value="${it.id}">${escapeHtml(it.name)}</option>`
  ).join('');
  sel.value = st.activeHeaderId && items.some(i => i.id === st.activeHeaderId)
    ? st.activeHeaderId
    : (st.headersIndex?.activeId || items[0].id);
}

function renderHeadersList() {
  const box = document.getElementById('headers-list');
  if (!box) return;
  const items = st.headersIndex?.items || [];
  if (!items.length) {
    box.innerHTML = '<p style="font-size:12px;color:var(--t3);text-align:center;padding:16px 0">Nenhum cabeçalho salvo ainda.</p>';
    return;
  }
  box.innerHTML = items.map(it => {
    const on = it.id === st.activeHeaderId ? ' on' : '';
    return `<div class="hdr-item${on}" onclick="applyHeader('${it.id}')">
      <div style="flex:1;min-width:0">
        <div class="hdr-item-name">${escapeHtml(it.name)}</div>
        <div class="hdr-item-meta">${escapeHtml(headerItemMeta(it))}</div>
      </div>
      <div class="hdr-item-actions" onclick="event.stopPropagation()">
        <button type="button" onclick="applyHeader('${it.id}')">Usar</button>
        <button type="button" onclick="deleteHeaderFromLibrary('${it.id}')" style="color:var(--R);border-color:rgba(224,90,90,.35)">Excluir</button>
      </div>
    </div>`;
  }).join('');
}

async function migrateLegacyHeaders() {
  const idx = { activeId: null, items: [] };
  if (!window.indexedDB) return;
  try {
    await migrateLocalTemplateToUser();
    const db = await openTplDb();
    const legacy = await tplDbGet(db, templateStorageKey());
    if (legacy?.data) {
      const id = 'hdr_' + Date.now();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(TPL_STORE, 'readwrite');
        tx.objectStore(TPL_STORE).put(legacy, headerFileKey(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      idx.items.push({
        id,
        name: (legacy.name || 'Cabeçalho da escola').replace(/\.(docx|pdf)$/i, ''),
        kind: 'file',
        hasFile: true,
        fileName: legacy.name,
        fileKind: legacy.kind,
        cab: {},
        savedAt: legacy.savedAt || Date.now(),
      });
      idx.activeId = id;
    } else {
      let cab = {};
      try { cab = JSON.parse(localStorage.getItem('pgcab') || '{}'); } catch {}
      if (cab.escola || cab.prof || st.templateFile) {
        const id = 'hdr_' + Date.now();
        const hasFile = !!(st.templateFile && st.templateKind);
        const item = {
          id,
          name: cab.escola || st.templateFile?.name?.replace(/\.(docx|pdf)$/i, '') || 'Meu cabeçalho',
          kind: hasFile ? 'file' : 'manual',
          hasFile,
          fileName: st.templateFile?.name || '',
          fileKind: st.templateKind,
          cab: hasFile ? {} : cab,
          savedAt: Date.now(),
        };
        if (hasFile) {
          await saveHeaderFileToStorage(id, st.templateFile, st.templateKind);
        }
        idx.items.push(item);
        idx.activeId = id;
      }
    }
    db.close();
    if (idx.items.length) await saveHeadersIndex(idx);
  } catch (e) {
    console.warn('Migração de cabeçalhos:', e);
  }
}

async function loadHeaderFileRecord(id, item) {
  if (item?.storagePath && cloudReady()) {
    try {
      return await PedagiaCloud.loadHeaderFile(item.storagePath, item.fileName, item.fileKind);
    } catch { return null; }
  }
  const db = await openTplDb();
  const rec = await tplDbGet(db, headerFileKey(id));
  db.close();
  if (!rec?.data) return null;
  const blob = new Blob([rec.data], { type: rec.mimeType });
  return new File([blob], rec.name, { type: rec.mimeType, lastModified: rec.savedAt || Date.now() });
}

async function applyHeader(id, opts = {}) {
  const { silent = false } = opts;
  const idx = await getHeadersIndex();
  const item = idx.items.find(i => i.id === id);
  if (!item) return false;

  idx.activeId = id;
  await saveHeadersIndex(idx);
  st.activeHeaderId = id;
  st.headersIndex = idx;

  if (item.hasFile && item.fileKind) {
    const file = await loadHeaderFileRecord(id, item);
    if (file) {
      st.templateFile = file;
      st.templateKind = item.fileKind;
      showTemplateUI(file, item.fileKind, { fromStorage: true });
    } else {
      resetTemplateUI();
      item.hasFile = false;
    }
  } else {
    resetTemplateUI();
  }

  if (item.cab && typeof item.cab === 'object') {
    applyCabToForm(item.cab);
    try { localStorage.setItem('pgcab', JSON.stringify(item.cab)); } catch {}
  }

  refreshHeaderSelect();
  renderHeadersList();
  if (!silent) toast('Cabeçalho «' + item.name + '» aplicado.', 'ok', 2800);
  scheduleExamPreview();
  return true;
}

async function loadHeadersLibrary(opts = {}) {
  const { silent = false } = opts;
  let idx = await getHeadersIndex();
  if (!idx.items?.length) await migrateLegacyHeaders();
  idx = await getHeadersIndex();
  st.headersIndex = idx;

  refreshHeaderSelect();
  renderHeadersList();

  if (!idx.items?.length) {
    const ok = await loadSavedTemplate();
    loadCab();
    return ok;
  }

  const targetId = idx.activeId && idx.items.some(i => i.id === idx.activeId)
    ? idx.activeId
    : idx.items[0].id;
  const ok = await applyHeader(targetId, { silent: true });
  if (ok && !silent) toast('Cabeçalhos carregados.', 'ok', 2200);
  return ok;
}

async function onHeaderSelectChange() {
  const id = document.getElementById('f-cabecalho-sel')?.value;
  if (!id) return;
  await applyHeader(id);
}

async function syncActiveHeaderCab() {
  if (!st.activeHeaderId || !st.headersIndex?.items?.length) return;
  const idx = await getHeadersIndex();
  const item = idx.items.find(i => i.id === st.activeHeaderId);
  if (!item) return;
  item.cab = getCab();
  if (st.templateFile && st.templateKind) {
    item.hasFile = true;
    item.kind = 'file';
    item.fileName = st.templateFile.name;
    item.fileKind = st.templateKind;
    if (cloudReady()) {
      try {
        item.storagePath = await saveHeaderFileToStorage(st.activeHeaderId, st.templateFile, st.templateKind);
      } catch (e) { console.warn('header file sync:', e); }
    }
  }
  item.savedAt = Date.now();
  await saveHeadersIndex(idx);
  refreshHeaderSelect();
  renderHeadersList();
}

async function saveHeaderToLibrary() {
  let name = (document.getElementById('hdr-save-name')?.value || '').trim();
  const cab = getCab();
  const hasFile = !!(st.templateFile && st.templateKind);
  if (!name) {
    name = cab.escola || (hasFile ? st.templateFile.name.replace(/\.(docx|pdf)$/i, '') : '');
  }
  if (!name) {
    toast('Dê um nome ao cabeçalho ou preencha a escola.', 'err');
    return;
  }
  if (!hasFile && !cab.escola && !cab.prof) {
    toast('Preencha os dados da escola ou envie um arquivo.', 'err');
    return;
  }

  const idx = await getHeadersIndex();
  const id = 'hdr_' + Date.now();
  const item = {
    id,
    name,
    kind: hasFile ? 'file' : 'manual',
    hasFile,
    fileName: st.templateFile?.name || '',
    fileKind: st.templateKind,
    cab: hasFile ? cab : cab,
    savedAt: Date.now(),
  };
  if (hasFile) {
    item.storagePath = await saveHeaderFileToStorage(id, st.templateFile, st.templateKind);
  }
  idx.items.push(item);
  idx.activeId = id;
  await saveHeadersIndex(idx);
  st.activeHeaderId = id;
  st.headersIndex = idx;

  const nameInp = document.getElementById('hdr-save-name');
  if (nameInp) nameInp.value = '';
  refreshHeaderSelect();
  renderHeadersList();
  toast('Cabeçalho «' + name + '» salvo.', 'ok', 3500);
}

async function deleteHeaderFromLibrary(id) {
  const idx = await getHeadersIndex();
  const item = idx.items.find(i => i.id === id);
  if (!item) return;
  if (!confirm('Excluir o cabeçalho «' + item.name + '»?')) return;

  idx.items = idx.items.filter(i => i.id !== id);
  await deleteHeaderFileFromStorage(id, item);
  if (idx.activeId === id) idx.activeId = idx.items[0]?.id || null;
  await saveHeadersIndex(idx);
  st.headersIndex = idx;

  if (idx.activeId) await applyHeader(idx.activeId, { silent: true });
  else {
    st.activeHeaderId = null;
    resetTemplateUI();
    refreshHeaderSelect();
    renderHeadersList();
  }
  toast('Cabeçalho excluído.', 'ok');
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════
// BUILDER — livro, capítulos e materiais salvos (IndexedDB)
// ══════════════════════════════════════════════
async function dbPut(store, key, value) {
  const db = await openAppDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function dbGet(store, key) {
  const db = await openAppDb();
  const rec = await new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rec;
}

async function dbDelete(store, key) {
  const db = await openAppDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function scheduleSaveBuilder() {
  clearTimeout(_builderSaveTimer);
  _builderSaveTimer = setTimeout(() => saveBuilderToStorage().catch(e => console.warn('Builder save:', e)), 700);
}

function serializeCatalogImage(img) {
  return {
    imageId: img.imageId,
    pageNumber: img.pageNumber || img.pageNum,
    pageNum: img.pageNum || img.pageNumber,
    previewUrl: img.previewUrl || img.dataUrl,
    dataUri: img.dataUri || img.previewUrl || img.dataUrl,
    base64: getImageB64(img),
    caption: img.caption || img.src || '',
    src: img.src || '',
    w: img.w,
    h: img.h,
    isFullPage: !!img.isFullPage,
    savedToBuilder: !!img.savedToBuilder,
    idx: img.idx,
  };
}

/** Estado do Montar (pool de questões revisadas) — texto puro, leve para a nuvem. */
function collectMontarState() {
  return {
    pagesConfirmed: !!st.builderPagesConfirmed,
    confirmedPageList: [...(st.builderConfirmedPageList || [])],
    wantAdapted: !!st.builderWantAdapted,
    adaptNotes: document.getElementById('bd-adapt-notas')?.value || '',
    numQ: st.numQ || 10,
    disc: v('bd-disc') || v('f-disc') || '',
    serie: v('bd-serie') || v('f-serie') || '',
    tipo: v('bd-tipo') || v('f-tipo') || '',
    valor: v('bd-valor') || v('f-valor') || '',
    topicos: v('bd-topicos') || '',
    pool: (st.builderPool || []).map((p) => ({
      id: p.id,
      source: p.source,
      variant: p.variant || 'turma',
      exerciseId: p.exerciseId,
      imageId: p.imageId,
      inProva: !!p.inProva,
      reviewStatus: p.reviewStatus || 'pending',
      type: p.type,
      title: p.title || '',
      statement: p.statement || '',
      alternatives: p.alternatives || [],
      correctAnswer: p.correctAnswer || '',
      justification: p.justification || '',
    })),
    mediaDrafts: Object.fromEntries(
      Object.entries(st.builderMediaDrafts || {})
        .filter(([, d]) => d && !d.loading)
        .map(([id, d]) => [
          id,
          { question: d.question, reviewStatus: d.reviewStatus, type: d.type, blockId: d.blockId },
        ]),
    ),
    selectedMedia: [...(st.builderSelectedMedia || [])],
    selectedExercises: [...(st.builderSelectedExercises || [])],
  };
}

function applyMontarState(m) {
  if (!m || typeof m !== 'object') return false;
  st.builderPagesConfirmed = !!m.pagesConfirmed;
  st.builderConfirmedPageList = Array.isArray(m.confirmedPageList) ? m.confirmedPageList : [];
  st.builderWantAdapted = !!m.wantAdapted;
  st.builderPool = Array.isArray(m.pool) ? m.pool : [];
  st.builderMediaDrafts = m.mediaDrafts && typeof m.mediaDrafts === 'object' ? m.mediaDrafts : {};
  st.builderSelectedMedia = new Set(m.selectedMedia || []);
  st.builderSelectedExercises = new Set(m.selectedExercises || []);
  if (m.numQ) st.numQ = m.numQ;
  if (m.pagesConfirmed && m.confirmedPageList?.length && !(st.selectedPages?.size)) {
    st.selectedPages = new Set(m.confirmedPageList);
  }

  const fields = [
    ['bd-disc', m.disc], ['f-disc', m.disc],
    ['bd-serie', m.serie], ['f-serie', m.serie],
    ['bd-tipo', m.tipo], ['f-tipo', m.tipo],
    ['bd-valor', m.valor], ['f-valor', m.valor],
    ['bd-topicos', m.topicos], ['bd-adapt-notas', m.adaptNotes],
  ];
  for (const [id, val] of fields) {
    const el = document.getElementById(id);
    if (el && val && !el.value) el.value = val;
  }
  const cb = document.getElementById('bd-adaptada');
  if (cb) cb.checked = st.builderWantAdapted;
  const bdN = document.getElementById('bd-numq');
  if (bdN) bdN.textContent = String(st.numQ || 10);
  return true;
}

function collectBuilderSnapshot() {
  const keepIds = new Set();
  for (const b of st.imageQuestionBlocks) keepIds.add(b.imageId);
  for (const img of st.imageCatalog) {
    if (img.savedToBuilder) keepIds.add(img.imageId);
  }

  return {
    montar: collectMontarState(),
    bookFileName: st.bookFileName,
    bookTotalPages: st.bookTotalPages,
    sumarioPage: parseInt(document.getElementById('pg')?.value, 10) || null,
    sumarioSkipped: !!st.sumarioSkipped,
    bookChapters: st.bookChapters || [],
    selectedChapterIdx: st.selectedChapterIdx,
    selectedPages: [...(st.selectedPages || [])],
    capManual: v('f-cap-manual'),
    imageCatalog: st.imageCatalog.filter(img => keepIds.has(img.imageId)).map(serializeCatalogImage),
    imageQuestionBlocks: st.imageQuestionBlocks.map(b => ({
      blockId: b.blockId,
      selected: !!b.selected,
      imageId: b.imageId,
      image: serializeCatalogImage(b.image || getImageCatalogEntry(b.imageId) || {}),
      question: b.question,
    })),
    examPlanOrder: st.examPlanOrder,
    bnccPrefs: getBnccPrefsFromUI(),
    savedAt: Date.now(),
  };
}

function cloudReady() {
  return typeof PedagiaCloud !== 'undefined' && PedagiaCloud.enabled();
}

function isCloudStorageSizeError(e) {
  if (PedagiaCloud?.isStorageSizeError?.(e)) return true;
  const msg = String(e?.message || e || '').toLowerCase();
  return msg.includes('maximum allowed size') || msg.includes('maximum size exceeded') || e?.code === 'STORAGE_SIZE_LIMIT';
}

async function saveBookToLocalDb(file) {
  if (!window.indexedDB) return false;
  const ab = await file.arrayBuffer();
  await dbPut(BOOK_STORE, bookStorageKey(), {
    name: file.name,
    mimeType: 'application/pdf',
    data: ab,
    savedAt: Date.now(),
  });
  return true;
}

/** @returns {{ cloud: boolean, localOnly: boolean, local: boolean }} */
async function saveBookToStorage(file) {
  const local = await saveBookToLocalDb(file);
  if (!cloudReady()) {
    return { cloud: false, localOnly: true, local };
  }
  const maxMb = Math.round((PedagiaCloud.STORAGE_MAX_BYTES || 50 * 1024 * 1024) / (1024 * 1024));
  try {
    const res = await PedagiaCloud.uploadBookFile(file, st.materialId);
    if (res?.path) {
      st.bookStoragePath = res.path;
      if (st.materialId) {
        try {
          await patchMaterialMeta({
            fileName: file.name,
            storagePath: res.path,
            totalPages: st.bookTotalPages,
          });
        } catch (e) {
          console.warn('patch material storage', e);
        }
      }
    }
    if (res?.localOnly) return { cloud: false, localOnly: true, local, maxMb };
    return { cloud: true, localOnly: false, local };
  } catch (e) {
    if (isCloudStorageSizeError(e) && local) {
      return { cloud: false, localOnly: true, local, maxMb, message: e.message };
    }
    throw e;
  }
}

async function saveBuilderToStorage() {
  if (!st.bookFileName && !st.builderPool?.length && !st.builderPagesConfirmed) return;
  const snap = collectBuilderSnapshot();
  if (window.indexedDB) {
    await dbPut(BUILDER_STORE, builderStorageKey(), snap);
  }
  if (cloudReady()) {
    try {
      await PedagiaCloud.saveBuilderState(snap, st.materialId);
    } catch (e) {
      if (e?.code === 'BUILDER_STATE_TOO_LARGE' || isCloudStorageSizeError(e)) {
        console.warn('Builder na nuvem (metadados):', e.message);
        return;
      }
      throw e;
    }
  }
  const hint = document.getElementById('livro-builder-hint');
  if (hint) hint.style.display = 'block';
}

function showBookLoadedUI(fromStorage = false) {
  document.getElementById('livro-empty').style.display = 'none';
  document.getElementById('livro-loaded').style.display = '';
  document.getElementById('livro-fname').textContent = st.bookFileName;
  const extra = fromStorage ? ' · na biblioteca' : '';
  document.getElementById('livro-pages').textContent =
    `${st.bookTotalPages} páginas${extra}`;
  const hint = document.getElementById('livro-builder-hint');
  if (hint) hint.style.display = fromStorage ? 'block' : 'none';
  document.getElementById('step2-item').style.display = 'flex';
  document.getElementById('pp1').className = 'pstep done';
  document.getElementById('pp1').querySelector('.pdot').textContent = '✓';
  document.getElementById('pp2').className = 'pstep act';
}

async function migrateLegacyMaterialStorage() {
  if (!window.indexedDB) return;
  const legacyBookKey = storageUserKey('book');
  const legacyBldKey = storageUserKey('bld');
  const targetBook = bookStorageKey();
  if (legacyBookKey === targetBook) return;
  try {
    const hasNew = await dbGet(BOOK_STORE, targetBook);
    if (!hasNew?.data) {
      const oldBook = await dbGet(BOOK_STORE, legacyBookKey);
      if (oldBook?.data) await dbPut(BOOK_STORE, targetBook, oldBook);
    }
    const hasBld = await dbGet(BUILDER_STORE, builderStorageKey());
    if (!hasBld) {
      const oldBld = await dbGet(BUILDER_STORE, legacyBldKey);
      if (oldBld) await dbPut(BUILDER_STORE, builderStorageKey(), oldBld);
    }
  } catch (e) {
    console.warn('migrate legacy material storage', e);
  }
}

async function loadBookFromStorage() {
  try {
    await migrateLegacyMaterialStorage();
    if (cloudReady()) {
      try {
        const ok = await PedagiaCloud.loadBookIntoState(st.materialId);
        if (ok) { showBookLoadedUI(true); return true; }
      } catch (e) {
        console.warn('Livro na nuvem:', e);
      }
    }
    if (!window.indexedDB) return false;
    const rec = await dbGet(BOOK_STORE, bookStorageKey());
    if (!rec?.data) return false;
    const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
    if (!pdfjsLib) return false;
    st.bookPdf = await pdfjsLib.getDocument({ data: rec.data }).promise;
    st.bookFileName = rec.name;
    st.bookTotalPages = st.bookPdf.numPages;
    st.bookFile = new File([rec.data], rec.name, { type: 'application/pdf', lastModified: rec.savedAt || Date.now() });
    showBookLoadedUI(true);
    return true;
  } catch (e) {
    console.warn('Livro salvo não carregado:', e);
    return false;
  }
}

function restoreGalleryFromBuilder(catalog, blocks) {
  st.imageCatalog = catalog.map((img, i) => ({ ...img, idx: i }));
  st.extractedImages = [...st.imageCatalog];
  st.imageQuestionBlocks = blocks.map(b => ({
    ...b,
    image: getImageCatalogEntry(b.imageId) || b.image,
  }));

  const gallery = document.getElementById('img-gallery');
  const imgSec = document.getElementById('img-section');
  if (!gallery || !imgSec) return;

  imgSec.style.display = '';
  if (!catalog.length) {
    gallery.innerHTML = '<div class="img-no-img" style="grid-column:1/-1">Nenhuma imagem guardada no builder para estas páginas.</div>';
    return;
  }

  gallery.innerHTML = catalog.map(entry => {
    const imageId = entry.imageId;
    const pageNum = entry.pageNumber || entry.pageNum;
    const isFullPg = !!entry.isFullPage;
    const srcHint = entry.caption || entry.src || '';
    const block = getBlockByImageId(imageId);
    const preview = block ? formatBlockPreview(block) : '';
    const sugHtml = block && preview
      ? escHtml(preview).replace(/\n/g, '<br>')
        + `<br><span class="img-suggest-gab">✓ Gabarito: ${escHtml(block.question.correctAnswer)}</span>`
      : '';
    return `
      <div class="img-thumb${entry.savedToBuilder || block ? ' block-ready' : ''}${block?.selected ? ' on' : ''}${isFullPg ? ' full-pg' : ''}"
           id="imgi-${imageId}" data-image-id="${imageId}" onclick="togImgBlockCard('${imageId}')"
           style="display:flex;flex-direction:column">
        ${isFullPg ? '<div style="position:absolute;top:4px;left:4px;background:#f59e0b;color:#000;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;z-index:2">PÁGINA</div>' : ''}
        <img src="${entry.previewUrl || entry.dataUri}" alt="p.${pageNum}" loading="lazy" style="flex:1">
        <div class="img-block-badge">${block ? 'No builder — toque para incluir na prova' : 'Guardada no builder'}</div>
        <div class="img-thumb-foot">
          <span class="img-thumb-pg">p.${pageNum}</span>
          <span class="img-thumb-src">${srcHint ? escHtml(srcHint.slice(0, 38)) : ''}</span>
          <span class="img-thumb-chk"></span>
        </div>
        <button class="img-save-builder-btn" onclick="event.stopPropagation();saveImageToBuilder('${imageId}')">💾 Builder</button>
        <button class="img-suggest-btn" id="sugbtn-${imageId}" onclick="event.stopPropagation();suggestQuestionForImage('${imageId}')">💡 Sugerir questão</button>
        <div class="img-suggest-box${sugHtml ? ' show' : ''}" id="sugbox-${imageId}" data-loaded="${sugHtml ? '1' : '0'}">${sugHtml}</div>
      </div>`;
  }).join('');

  catalog.forEach(img => syncBlockCardUI(img.imageId));
  updateBlockSelInfo();
  const status = document.getElementById('img-status');
  if (status) status.textContent = `${catalog.length} recorte(s) do builder (sem nova leitura)`;
  updateCropGalleryCount();
  scheduleExamPreview();
}

async function applyBuilderSnapshot(snap) {
  if (!snap || !st.bookPdf) return false;
  if (snap.bookFileName && snap.bookFileName !== st.bookFileName) return false;

  st.bookChapters = snap.bookChapters || [];
  st.selectedChapterIdx = snap.selectedChapterIdx ?? -1;
  st.selectedPages = new Set(snap.selectedPages || []);

  st.sumarioSkipped = !!snap.sumarioSkipped;
  if (snap.sumarioPage) {
    const pgEl = document.getElementById('pg');
    if (pgEl) pgEl.value = String(snap.sumarioPage);
  }
  if (snap.capManual) {
    const capEl = document.getElementById('f-cap-manual');
    if (capEl) capEl.value = snap.capManual;
  }

  if (st.bookChapters.length) {
    renderChapterList(st.bookChapters, 'chapter-list', selectChapter);
    document.getElementById('step3-item').style.display = 'flex';
    document.getElementById('pp2').className = 'pstep done';
    document.getElementById('pp2').querySelector('.pdot').textContent = '✓';
    const sumSt = document.getElementById('sum-status');
    if (sumSt) {
      sumSt.style.display = '';
      sumSt.textContent = `✅ ${st.bookChapters.length} capítulo(s) restaurados do builder (sem nova leitura da IA)`;
    }
  }

  if (st.selectedPages.size) {
    const pages = [...st.selectedPages].sort((a, b) => a - b);
    renderPageChips(pages);
    document.getElementById('step4-item').style.display = 'flex';
    document.getElementById('pp3').className = 'pstep done';
    document.getElementById('pp3').querySelector('.pdot').textContent = '✓';
    document.getElementById('pp4').className = 'pstep act';
    restoreGalleryFromBuilder(snap.imageCatalog || [], snap.imageQuestionBlocks || []);
  } else if (snap.sumarioSkipped && st.bookTotalPages) {
    selecionarTodasPaginasDoLivro();
    if (st.bookChapters.length) {
      document.getElementById('step3-item').style.display = 'flex';
      document.getElementById('pp2').className = 'pstep done';
      document.getElementById('pp2').querySelector('.pdot').textContent = '✓';
      document.getElementById('pp3').className = 'pstep done';
      document.getElementById('pp3').querySelector('.pdot').textContent = '✓';
    }
  }

  if (snap.montar) applyMontarState(snap.montar);
  if (snap.examPlanOrder) st.examPlanOrder = snap.examPlanOrder;
  if (snap.bnccPrefs) {
    const o = snap.bnccPrefs;
    const orient = document.getElementById('f-bncc-orient');
    const hab = document.getElementById('f-bncc-hab');
    const foco = document.getElementById('f-bncc-foco');
    if (orient && o.orientacoes) orient.value = o.orientacoes;
    if (hab && o.habilidades) hab.value = o.habilidades;
    if (foco && o.focoAvaliativo) foco.value = o.focoAvaliativo;
    onBnccPrefsChange();
  }
  renderExamVisualBuilder();

  return true;
}

async function migrateLocalBuilderToUser() {
  if (!currentSession?.user?.id) return;
  try {
    const localBook = await dbGet(BOOK_STORE, 'book_local');
    const userBook = await dbGet(BOOK_STORE, bookStorageKey());
    if (localBook?.data && !userBook?.data) {
      await dbPut(BOOK_STORE, bookStorageKey(), localBook);
      await dbDelete(BOOK_STORE, 'book_local');
    }
    const localBld = await dbGet(BUILDER_STORE, 'bld_local');
    const userBld = await dbGet(BUILDER_STORE, builderStorageKey());
    if (localBld && !userBld) {
      await dbPut(BUILDER_STORE, builderStorageKey(), localBld);
      await dbDelete(BUILDER_STORE, 'bld_local');
    }
  } catch {}
}

async function loadSavedBuilder(opts = {}) {
  try {
    await migrateLocalBuilderToUser();
    const hasBook = st.bookPdf ? true : await loadBookFromStorage();
    if (!hasBook) return false;

    let snap = null;
    if (cloudReady()) {
      snap = await PedagiaCloud.loadBuilderState(st.materialId);
      if (snap?.imageCatalog?.length) {
        snap.imageCatalog = await PedagiaCloud.hydrateCatalog(snap.imageCatalog);
      }
    } else if (window.indexedDB) {
      snap = await dbGet(BUILDER_STORE, builderStorageKey());
    }
    if (!snap) return hasBook;
    await applyBuilderSnapshot(snap);
    if (!opts.silent) {
      const nImg = (snap.imageCatalog || []).length;
      const nCh = (snap.bookChapters || []).length;
      toast(`Builder restaurado: ${nCh} capítulo(s), ${nImg} imagem(ns) salva(s).`, 'ok', 4500);
    }
    return true;
  } catch (e) {
    console.warn('Builder não restaurado:', e);
    return false;
  }
}

function saveImageToBuilder(imageId) {
  const img = getImageCatalogEntry(imageId);
  if (!img) return;
  img.savedToBuilder = true;
  const card = document.getElementById('imgi-' + imageId);
  if (card) card.classList.add('block-ready');
  toast('Imagem guardada no builder.', 'ok', 2500);
  scheduleSaveBuilder();
}

async function clearSavedBuilder() {
  if (cloudReady()) {
    try { await PedagiaCloud.clearWorkspace(); } catch (e) { console.warn(e); }
  }
  if (window.indexedDB) {
    await dbDelete(BOOK_STORE, bookStorageKey());
    await dbDelete(BUILDER_STORE, builderStorageKey());
  }
}

async function clearLocalMaterialCache(materialId) {
  if (!window.indexedDB || !materialId) return;
  const prev = st.materialId;
  st.materialId = materialId;
  try {
    await dbDelete(BOOK_STORE, bookStorageKey());
    await dbDelete(BUILDER_STORE, builderStorageKey());
  } finally {
    st.materialId = prev;
  }
}

function resetActiveMaterialPdfState() {
  st.bookPdf = null;
  st.bookFile = null;
  st.bookFileName = '';
  st.bookTotalPages = 0;
  st.bookStoragePath = null;
  st.materialChapters = [];
  st.bookChapters = [];
  st.selectedChapterIdx = -1;
  st.selectedPages = new Set();
  st.imageCatalog = [];
  st.imageQuestionBlocks = [];
  st.extractedImages = [];
}

async function clearMaterialWorkflowOnly() {
  const label = st.bookFileName ? ` "${st.bookFileName}"` : '';
  if (!confirm(`Limpar só recortes, capítulos e páginas selecionadas${label}? O PDF continua na biblioteca.`)) {
    return;
  }
  if (window.indexedDB) {
    await dbDelete(BUILDER_STORE, builderStorageKey());
  }
  if (cloudReady() && st.materialId) {
    try {
      await PedagiaCloud.saveBuilderState(
        {
          bookFileName: st.bookFileName,
          bookTotalPages: st.bookTotalPages,
          bookChapters: [],
          selectedChapterIdx: -1,
          selectedPages: [],
          imageCatalog: [],
          imageQuestionBlocks: [],
          savedAt: Date.now(),
        },
        st.materialId,
      );
    } catch (e) {
      console.warn(e);
    }
  }
  resetMaterialWorkflowUI();
  toast('Recortes e seleção limpos. O livro permanece na biblioteca.', 'ok');
  renderMaterialLibrary();
}

async function deleteMaterialFromLibrary(materialId) {
  const id = materialId || st.materialId;
  if (!id) {
    resetActiveMaterialPdfState();
    resetMaterialWorkflowUI();
    document.getElementById('f-livro').value = '';
    document.getElementById('livro-empty').style.display = '';
    document.getElementById('livro-loaded').style.display = 'none';
    toast('Nada selecionado para apagar.', 'err');
    return;
  }
  const mat = (st.materialsList || []).find((m) => m.id === id);
  const label = mat?.fileName || st.bookFileName || 'este livro';
  if (!confirm(`Apagar "${label}" da biblioteca? O PDF será removido da nuvem e não voltará ao recarregar.`)) {
    return;
  }
  const token = currentSession?.access_token;
  if (!token) {
    toast('Faça login.', 'err');
    return;
  }
  try {
    const r = await fetch(`/api/material?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    await clearLocalMaterialCache(id);
    st.materialsList = (st.materialsList || []).filter((m) => m.id !== id);
    if (st.materialId === id) {
      setStoredActiveMaterialId('');
      st.materialId = null;
      resetActiveMaterialPdfState();
      resetMaterialWorkflowUI();
      document.getElementById('f-livro').value = '';
      document.getElementById('livro-empty').style.display = '';
      document.getElementById('livro-loaded').style.display = 'none';
      const hint = document.getElementById('livro-builder-hint');
      if (hint) hint.style.display = 'none';
    }
    renderMaterialLibrary();
    renderMaterialPicker();
    builderRenderMaterialSelect();
    toast('Livro removido da biblioteca.', 'ok');
  } catch (e) {
    toast('Erro ao apagar: ' + (e.message || e), 'err', 6000);
  }
}

/** @deprecated use deleteMaterialFromLibrary */
async function clearBuilderData() {
  return deleteMaterialFromLibrary(st.materialId);
}

function renderMaterialLibrary() {
  const list = document.getElementById('material-library-list');
  const summary = document.getElementById('mat-lib-editor-summary');
  if (!list) return;
  const items = st.materialsList || [];
  if (!items.length) {
    list.innerHTML =
      '<div class="bd-empty">Nenhum PDF na biblioteca. Toque em <b>+ Adicionar PDF</b> abaixo.</div>';
    if (summary) summary.textContent = 'Recortes e capítulos (envie um PDF primeiro)';
    return;
  }
  list.innerHTML = items
    .map((m) => {
      const on = m.id === st.materialId;
      const pages = m.totalPages ? `${m.totalPages} pág.` : 'PDF pendente';
      const ch = m.chapters?.length ? ` · ${m.chapters.length} cap.` : '';
      return `<div class="mat-lib-item ${on ? 'on' : ''}" data-mid="${escHtml(m.id)}">
        <div class="mat-lib-item-body" onclick="selectMaterialLibraryItem('${escHtml(m.id)}')">
          <div class="mat-lib-item-title">${escHtml(m.fileName || 'Material')}</div>
          <div class="mat-lib-item-meta">${pages}${ch}</div>
        </div>
        <div class="mat-lib-item-actions">
          <button type="button" class="chip cy" onclick="event.stopPropagation();useMaterialInMontar('${escHtml(m.id)}')">Montar</button>
          <button type="button" class="chip" onclick="event.stopPropagation();selectMaterialLibraryItem('${escHtml(m.id)}')">Editar</button>
          <button type="button" class="chip" style="color:var(--R)" onclick="event.stopPropagation();deleteMaterialFromLibrary('${escHtml(m.id)}')">Apagar</button>
        </div>
      </div>`;
    })
    .join('');
  if (summary) {
    const cur = items.find((m) => m.id === st.materialId);
    summary.textContent = cur
      ? `Recortes e capítulos — ${cur.fileName}`
      : 'Recortes e capítulos (selecione um livro)';
  }
}

function materialLibraryAddNew() {
  startNewMaterial();
  const editor = document.getElementById('mat-lib-editor');
  if (editor) editor.open = true;
  setTimeout(() => document.getElementById('f-livro')?.click(), 200);
}

async function selectMaterialLibraryItem(materialId) {
  if (!materialId) return;
  const editor = document.getElementById('mat-lib-editor');
  if (editor) editor.open = true;
  await switchMaterial(materialId);
  renderMaterialLibrary();
}

async function useMaterialInMontar(materialId) {
  if (!materialId) return;
  await switchMaterial(materialId);
  builderSyncFields();
  goTo('builder');
}

// ══════════════════════════════════════════════
// BOOK PDF NAVIGATION
// ══════════════════════════════════════════════
async function handleBookFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.name.endsWith('.pdf') && file.type !== 'application/pdf') {
    toast('Envie o livro em formato PDF', 'err'); return;
  }
  if (file.size > BOOK_MAX_BYTES) {
    toast(`PDF muito grande (máx. ${BOOK_MAX_MB} MB).`, 'err');
    input.value = '';
    return;
  }
  const btn = document.getElementById('btn-ler');
  document.getElementById('livro-empty').style.display = 'none';
  document.getElementById('livro-loaded').style.display = '';
  document.getElementById('livro-fname').textContent = file.name;
  document.getElementById('livro-pages').textContent = 'Carregando...';
  if (btn) btn.disabled = true;

  const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
  if (!pdfjsLib) { toast('pdf.js não carregado.', 'err'); return; }

  try {
    const ab = await file.arrayBuffer();
    st.bookPdf = await pdfjsLib.getDocument({ data: ab }).promise;
    st.bookFile = file;
    st.bookFileName = file.name;
    st.bookTotalPages = st.bookPdf.numPages;
    st.bookChapters = [];
    st.selectedChapterIdx = -1;
    st.selectedPages = new Set();
    st.imageCatalog = [];
    st.imageQuestionBlocks = [];
    st.extractedImages = [];

    showBookLoadedUI(false);
    if (btn) btn.disabled = false;

    try {
      const saved = await saveBookToStorage(file);
      try {
        await ensureMaterialRecordForBook();
        if (st.materialId && !st.bookStoragePath && saved.cloud === false) {
          await patchMaterialMeta({
            fileName: file.name,
            totalPages: st.bookTotalPages,
          });
        }
      } catch (eMat) {
        console.warn('material record', eMat);
      }
      try {
        await saveBuilderToStorage();
      } catch (e2) {
        toast('Capítulos/imagens: nuvem indisponível — salvos neste navegador. ' + e2.message, 'ok', 6000);
      }
      if (!cloudReady()) {
        toast(`📕 ${file.name} salvo neste navegador (${st.bookTotalPages} págs.). Faça login para sincronizar na nuvem.`, 'ok', 5500);
      } else if (saved.localOnly) {
        const mb = saved.maxMb || 50;
        toast(
          `📕 ${file.name} (${st.bookTotalPages} págs.) — salvo neste navegador. O PDF passa de ${mb} MB (limite do Supabase Storage). Para nuvem: reduza o arquivo ou aumente o limite em Storage → Settings.`,
          'ok',
          9000,
        );
      } else if (saved.cloud) {
        toast(`📕 ${file.name} salvo na nuvem e neste navegador (${st.bookTotalPages} págs.)`, 'ok', 4500);
      } else {
        toast(`📕 ${file.name} salvo neste navegador (${st.bookTotalPages} págs.)`, 'ok', 4500);
      }
      renderMaterialLibrary();
      builderRenderMaterialSelect();
    } catch (e) {
      toast('Livro em uso, mas não foi possível salvar: ' + e.message, 'err', 5000);
    }
    setTimeout(() => document.getElementById('step2-item').scrollIntoView({behavior:'smooth',block:'nearest'}), 100);
  } catch(e) {
    document.getElementById('livro-pages').textContent = 'Erro ao carregar.';
    toast('Erro ao ler PDF: ' + e.message, 'err');
  }
}

// ── Extrai texto de uma faixa de páginas do PDF ──────────────────────
async function extractPagesRaw(pdf, fromPage, toPage) {
  let text = '';
  for (let p = fromPage; p <= Math.min(toPage, pdf.numPages); p++) {
    const page = await pdf.getPage(p);
    const ct   = await page.getTextContent();
    let pt = ''; let lx = null;
    for (const item of ct.items) {
      if (lx !== null && Math.abs(item.transform[4] - lx) > 8) pt += ' ';
      pt += item.str; lx = item.transform[4] + (item.width||0);
    }
    text += pt + '\n';
  }
  return text;
}

// ── Chama /api/sumario — IA interpreta o texto e retorna capítulos ────
async function callSumarioIA(rawText) {
  const token = currentSession?.access_token;
  if (!token) throw new Error('Não autenticado.');
  const r = await fetch('/api/sumario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: rawText }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Erro ao consultar IA.');
  return data.chapters || [];
}

function selecionarTodasPaginasDoLivro() {
  st.selectedPages = new Set();
  const total = st.bookTotalPages || st.bookPdf?.numPages || 0;
  if (!total) return;
  const pages = [];
  for (let p = 1; p <= total; p++) {
    pages.push(p);
    st.selectedPages.add(p);
  }
  renderPageChips(pages);
  renderPageThumbnails(pages).catch(() => {});
  updatePgCount();

  const step4 = document.getElementById('step4-item');
  if (step4) step4.style.display = 'flex';
  const pp3 = document.getElementById('pp3');
  const pp4 = document.getElementById('pp4');
  if (pp3) { pp3.className = 'pstep done'; pp3.querySelector('.pdot').textContent = '✓'; }
  if (pp4) pp4.className = 'pstep act';
  const imgSec = document.getElementById('img-section');
  if (imgSec) imgSec.style.display = '';
}

async function pularSumarioUsarTodasPaginas() {
  if (!st.bookPdf || !st.bookTotalPages) {
    toast('Carregue o PDF do livro primeiro.', 'err');
    return;
  }

  const btn = document.getElementById('btn-sem-sumario');
  const status = document.getElementById('sum-status');
  if (btn) btn.disabled = true;
  st.sumarioSkipped = true;

  const title = (st.bookFileName || 'Livro').replace(/\.pdf$/i, '') || 'Livro completo';
  const chapters = [{ title, pageNum: 1 }];
  st.bookChapters = chapters;

  const core = getCore();
  if (core) {
    st.materialChapters = core.normalizeChapters(
      [{ title, printedPageStart: 1, pdfPageStart: 1 }],
      st.bookTotalPages,
    );
    if (st.materialChapters[0]) {
      st.materialChapters[0].pdfPageEnd = st.bookTotalPages;
    }
    persistMaterialChapters().catch(() => {});
  }

  renderChapterList(chapters, 'chapter-list', selectChapter);
  document.getElementById('step3-item').style.display = 'flex';
  document.getElementById('pp2').className = 'pstep done';
  document.getElementById('pp2').querySelector('.pdot').textContent = '✓';
  document.getElementById('pp3').className = 'pstep act';

  st.selectedChapterIdx = 0;
  st.processedChapterId = st.materialChapters[0]?.id || null;
  document.querySelectorAll('#chapter-list .citem').forEach((c, i) => {
    c.classList.toggle('on', i === 0);
  });

  selecionarTodasPaginasDoLivro();

  if (status) {
    status.style.display = '';
    status.textContent = `✅ ${st.bookTotalPages} páginas do PDF disponíveis (sem sumário)`;
  }
  toast(`${st.bookTotalPages} páginas prontas para recorte.`, 'ok');
  if (btn) btn.disabled = false;
  scheduleSaveBuilder();
  setTimeout(() => document.getElementById('step4-item')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}

async function lerSum() {
  const pageNum = parseInt(document.getElementById('pg').value);
  if (!pageNum || !st.bookPdf) { toast('Insira o número da página do sumário.', 'err'); return; }

  const btn    = document.getElementById('btn-ler');
  const status = document.getElementById('sum-status');
  btn.disabled = true; btn.textContent = '⏳ IA lendo...';
  status.style.display = ''; status.textContent = '🤖 Enviando sumário para a IA...';
  st.sumarioSkipped = false;

  try {
    // Extrai 3 páginas a partir da página informada (cobre sumários de 2-3 páginas)
    const sumText = await extractPagesRaw(st.bookPdf, pageNum, pageNum + 2);

    status.textContent = '🔍 IA identificando capítulos...';
    const chapters = await callSumarioIA(sumText);
    st.bookChapters = chapters;
    const core = getCore();
    if (core && chapters.length) {
      st.materialChapters = core.normalizeChapters(
        chapters.map(c => ({
          title: c.title,
          printedPageStart: c.pageNum,
          pdfPageStart: c.pageNum || 1,
        })),
        st.bookTotalPages || 500,
      );
      persistMaterialChapters().catch(() => {});
    }

    if (!chapters.length) {
      status.textContent = '⚠️ IA não encontrou capítulos. Tente outra página ou use "Sem sumário — usar todas as páginas".';
      toast('Nenhum capítulo encontrado — use o botão sem sumário ou outra página.', 'err');
    } else {
      status.textContent = `✅ ${chapters.length} capítulo(s) identificado(s) pela IA`;
      toast(`${chapters.length} capítulos encontrados!`, 'ok');
    }

    renderChapterList(chapters, 'chapter-list', selectChapter);
    document.getElementById('step3-item').style.display = 'flex';

    // Progresso
    document.getElementById('pp2').className = 'pstep done';
    document.getElementById('pp2').querySelector('.pdot').textContent = '✓';
    document.getElementById('pp3').className = 'pstep act';

    setTimeout(() => document.getElementById('step3-item').scrollIntoView({behavior:'smooth',block:'nearest'}), 100);
    scheduleSaveBuilder();
  } catch(e) {
    status.textContent = '❌ Erro: ' + e.message;
    toast(e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Ler sumário →';
  }
}

function parseSumarioText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const isChap = s =>
    /^cap[ií]tulo\s+\d+/i.test(s) || /^unidade\s+\d+/i.test(s) ||
    /^módulo\s+\d+/i.test(s)       || /^tema\s+\d+/i.test(s)    ||
    /^\d{1,2}[\.\)]\s+[A-ZÁÀÃÉÊÍÓÔÕÚÇ]/u.test(s);
  const extractPg = s => { const m=s.match(/[\.\·\s]+(\d{1,4})\s*$/); return m?parseInt(m[1]):null; };
  const cleanT = s => s.replace(/[\.\·]{2,}\s*\d+\s*$/, '').replace(/\s{2,}\d{1,4}\s*$/, '').trim();

  const chapters = [];
  for (const l of lines) {
    if (!isChap(l) || l.length > 120) continue;
    const pg = extractPg(l);
    const title = cleanT(l);
    if (title.length > 4) chapters.push({ title, pageNum: pg });
  }
  return chapters;
}

function renderChapterList(chapters, listId, onPick) {
  const list = document.getElementById(listId);
  if (!list) return;
  if (!chapters.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--t3)">Capítulos não detectados — use o campo manual.</div>';
    return;
  }
  list.innerHTML = '';
  chapters.forEach((ch, idx) => {
    const el = document.createElement('div');
    el.className = 'citem';
    el.dataset.idx = idx;
    el.innerHTML = `<div class="cbox"><span class="ck">✓</span></div>
      <span class="cname">${ch.title.length>60?ch.title.slice(0,60)+'…':ch.title}</span>
      <span class="cpg">${ch.pageNum?'p.'+ch.pageNum:''}</span>`;
    el.onclick = () => onPick(el, idx);
    list.appendChild(el);
  });
}

function normalizeMaterialRecord(row) {
  if (!row) return null;
  const chapters = (row.chapters || []).map(ch => ({
    id: ch.id,
    title: ch.title,
    printedPageStart: ch.printed_page_start ?? ch.pdf_page_start,
    pdfPageStart: ch.pdf_page_start,
    pdfPageEnd: ch.pdf_page_end,
    indexed: !!ch.indexed,
  }));
  return {
    id: row.id,
    fileName: row.file_name || 'livro.pdf',
    storagePath: row.storage_path || null,
    totalPages: row.total_pages || 0,
    indexedAt: row.indexed_at,
    chapters,
  };
}

function chaptersToBookList(chapters) {
  return (chapters || []).map(ch => ({
    title: ch.title,
    pageNum: ch.printedPageStart ?? ch.pdfPageStart,
  }));
}

function applyMaterialChaptersToState(chapters) {
  const core = getCore();
  st.materialChapters = chapters || [];
  if (core && chapters?.length) {
    st.materialChapters = core.normalizeChapters(
      chapters.map(ch => ({
        id: ch.id,
        title: ch.title,
        printedPageStart: ch.printedPageStart,
        pdfPageStart: ch.pdfPageStart,
        pdfPageEnd: ch.pdfPageEnd,
      })),
      st.bookTotalPages || 500,
    );
  }
  st.bookChapters = chaptersToBookList(st.materialChapters);
}

function renderMaterialPicker() {
  const toolbar = document.getElementById('material-toolbar');
  const sel = document.getElementById('material-select');
  const hint = document.getElementById('material-toolbar-hint');
  if (!toolbar || !sel) return;

  toolbar.style.display = currentSession ? '' : 'none';
  const items = st.materialsList || [];
  const active = st.materialId || '';
  const opts = [
    '<option value="">— Novo material (upload) —</option>',
    ...items.map(m => {
      const label = escHtml((m.fileName || 'Material').slice(0, 56));
      const pages = m.totalPages ? ` · ${m.totalPages} págs.` : '';
      const ch = m.chapters?.length ? ` · ${m.chapters.length} cap.` : '';
      return `<option value="${escHtml(m.id)}"${m.id === active ? ' selected' : ''}>${label}${pages}${ch}</option>`;
    }),
  ];
  sel.innerHTML = opts.join('');
  if (hint) {
    if (!items.length) {
      hint.textContent = 'Envie o primeiro PDF ou escolha um material salvo.';
    } else if (active) {
      const cur = items.find(m => m.id === active);
      hint.textContent = cur
        ? `Trabalhando em: ${cur.fileName}`
        : 'Material ativo — faça upload do PDF se ainda não carregou.';
    } else {
      hint.textContent = 'Modo novo material: o próximo PDF enviado será cadastrado separadamente.';
    }
  }
}

async function fetchMaterialsList() {
  if (!currentSession?.access_token) {
    st.materialsList = [];
    return [];
  }
  const r = await fetch('/api/material', {
    headers: { Authorization: `Bearer ${currentSession.access_token}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erro ao listar materiais');
  st.materialsList = (data || []).map(normalizeMaterialRecord).filter(Boolean);
  renderMaterialLibrary();
  return st.materialsList;
}

function upsertMaterialInList(rec) {
  if (!rec?.id) return;
  const idx = st.materialsList.findIndex(m => m.id === rec.id);
  if (idx >= 0) st.materialsList[idx] = { ...st.materialsList[idx], ...rec };
  else st.materialsList.unshift(rec);
}

async function patchMaterialMeta(patch) {
  if (!currentSession?.access_token || !st.materialId) return;
  const r = await fetch('/api/material', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.access_token}`,
    },
    body: JSON.stringify({ materialId: st.materialId, ...patch }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erro ao atualizar material');
  const cur = st.materialsList.find(m => m.id === st.materialId);
  if (cur) {
    if (patch.fileName) cur.fileName = patch.fileName;
    if (patch.storagePath !== undefined) cur.storagePath = patch.storagePath;
    if (patch.totalPages != null) cur.totalPages = patch.totalPages;
  }
}

function resetMaterialWorkflowUI() {
  st.sumarioSkipped = false;
  st.bookChapters = [];
  st.selectedChapterIdx = -1;
  st.selectedPages = new Set();
  st.imageCatalog = [];
  st.imageQuestionBlocks = [];
  st.extractedImages = [];
  st.processedChapterId = null;

  const pg = document.getElementById('pg');
  if (pg) pg.value = '';
  const cap = document.getElementById('f-cap-manual');
  if (cap) cap.value = '';
  const sumSt = document.getElementById('sum-status');
  if (sumSt) { sumSt.style.display = 'none'; sumSt.textContent = ''; }

  ['step2-item', 'step3-item', 'step4-item'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  ['pp1', 'pp2', 'pp3', 'pp4'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = i === 0 ? 'pstep act' : 'pstep';
    const dot = el.querySelector('.pdot');
    if (dot) dot.textContent = String(i + 1);
  });

  const cl = document.getElementById('chapter-list');
  if (cl) cl.innerHTML = '';
  const chips = document.getElementById('page-chips');
  if (chips) chips.innerHTML = '';
  const pgCount = document.getElementById('pg-count');
  if (pgCount) pgCount.textContent = '0 páginas selecionadas';
  const gallery = document.getElementById('img-gallery');
  if (gallery) gallery.innerHTML = '';
  const imgSec = document.getElementById('img-section');
  if (imgSec) imgSec.style.display = 'none';
}

async function flushCurrentMaterialState() {
  if (st.bookFileName) {
    try { await saveBuilderToStorage(); } catch (e) { console.warn('flush builder', e); }
  }
}

async function loadMaterialWorkspace(mat, opts = {}) {
  if (!mat) return false;
  const { loadPdf = true, restoreBuilder = true } = opts;
  st.materialId = mat.id;
  st.bookFileName = mat.fileName || '';
  st.bookStoragePath = mat.storagePath || null;
  st.bookTotalPages = mat.totalPages || 0;
  applyMaterialChaptersToState(mat.chapters || []);
  setStoredActiveMaterialId(mat.id);

  if (!loadPdf) {
    renderMaterialPicker();
    renderMaterialLibrary();
    return !!mat.storagePath;
  }

  resetMaterialWorkflowUI();

  if (st.bookFileName) {
    document.getElementById('livro-empty').style.display = 'none';
    document.getElementById('livro-loaded').style.display = '';
    document.getElementById('livro-fname').textContent = st.bookFileName;
    document.getElementById('livro-pages').textContent = st.bookTotalPages
      ? `${st.bookTotalPages} páginas`
      : 'Carregando PDF...';
  } else {
    document.getElementById('livro-empty').style.display = '';
    document.getElementById('livro-loaded').style.display = 'none';
  }

  st.bookPdf = null;
  st.bookFile = null;
  const hasBook = await loadBookFromStorage();
  if (hasBook) {
    showBookLoadedUI(true);
    if (st.bookChapters.length) {
      renderChapterList(st.bookChapters, 'chapter-list', selectChapter);
      document.getElementById('step2-item').style.display = 'flex';
      document.getElementById('step3-item').style.display = 'flex';
      document.getElementById('pp1').className = 'pstep done';
      document.getElementById('pp1').querySelector('.pdot').textContent = '✓';
      document.getElementById('pp2').className = 'pstep done';
      document.getElementById('pp2').querySelector('.pdot').textContent = '✓';
      document.getElementById('pp3').className = 'pstep act';
    }
    if (restoreBuilder) await loadSavedBuilder({ silent: true });
  } else if (st.bookFileName) {
    document.getElementById('livro-pages').textContent =
      mat.storagePath
        ? 'PDF não encontrado — pode ter sido apagado da biblioteca.'
        : 'Envie o PDF novamente para este material.';
  }

  renderMaterialPicker();
  renderMaterialLibrary();
  return hasBook;
}

async function switchMaterial(materialId) {
  const nextId = materialId || '';
  if ((st.materialId || '') === nextId) {
    if (nextId && !st.bookPdf) {
      let mat = st.materialsList.find((m) => m.id === nextId);
      if (!mat) {
        try {
          await fetchMaterialsList();
          mat = st.materialsList.find((m) => m.id === nextId);
        } catch (_) {}
      }
      if (mat) {
        try {
          await loadMaterialWorkspace(mat, { loadPdf: true, restoreBuilder: false });
        } catch (e) {
          console.warn('reload pdf same material', e);
        }
      }
    }
    return;
  }

  await flushCurrentMaterialState();

  if (!nextId) {
    startNewMaterial({ skipFlush: true });
    return;
  }

  let mat = st.materialsList.find(m => m.id === nextId);
  if (!mat) {
    try {
      await fetchMaterialsList();
      mat = st.materialsList.find(m => m.id === nextId);
    } catch (e) {
      toast(e.message, 'err');
      renderMaterialPicker();
      return;
    }
  }
  if (!mat) {
    toast('Material não encontrado.', 'err');
    renderMaterialPicker();
    return;
  }

  await loadMaterialWorkspace(mat, { loadPdf: true, restoreBuilder: true });
  toast(`Material: ${mat.fileName}`, 'ok', 2800);
  renderMaterialLibrary();
}

function startNewMaterial(opts = {}) {
  if (!opts.skipFlush) flushCurrentMaterialState().catch(() => {});
  st.materialId = null;
  st.bookStoragePath = null;
  setStoredActiveMaterialId('');
  st.bookPdf = null;
  st.bookFile = null;
  st.bookFileName = '';
  st.bookTotalPages = 0;
  st.materialChapters = [];
  resetMaterialWorkflowUI();

  const input = document.getElementById('f-livro');
  if (input) input.value = '';
  document.getElementById('livro-empty').style.display = '';
  document.getElementById('livro-loaded').style.display = 'none';
  const hint = document.getElementById('livro-builder-hint');
  if (hint) hint.style.display = 'none';

  renderMaterialPicker();
  renderMaterialLibrary();
  toast('Novo material — envie o PDF.', 'ok', 3200);
}

async function initMaterialView() {
  const toolbar = document.getElementById('material-toolbar');
  if (toolbar) toolbar.style.display = 'none';
  if (!currentSession) return;
  try {
    await fetchMaterialsList();
  } catch (e) {
    toast(e.message, 'err');
  }
  renderMaterialLibrary();
  renderMaterialPicker();
  if (st.materialId) {
    const mat = st.materialsList.find((m) => m.id === st.materialId);
    if (mat) {
      st.bookFileName = mat.fileName || '';
      st.bookStoragePath = mat.storagePath || null;
      st.bookTotalPages = mat.totalPages || 0;
      applyMaterialChaptersToState(mat.chapters || []);
    }
  }
}

async function initMaterialsAfterLogin(opts = {}) {
  if (!currentSession) return;
  try {
    await fetchMaterialsList();
  } catch (e) {
    console.warn('materials list', e);
  }

  const stored = getStoredActiveMaterialId();
  if (stored && st.materialsList.some((m) => m.id === stored)) {
    const mat = st.materialsList.find((m) => m.id === stored);
    if (mat) {
      st.materialId = mat.id;
      st.bookFileName = mat.fileName || '';
      st.bookStoragePath = mat.storagePath || null;
      st.bookTotalPages = mat.totalPages || 0;
      applyMaterialChaptersToState(mat.chapters || []);
    }
  } else {
    st.materialId = null;
    resetActiveMaterialPdfState();
  }

  renderMaterialPicker();
  renderMaterialLibrary();
}

async function ensureMaterialRecordForBook() {
  if (st.materialId || !st.bookFileName || !currentSession?.access_token) return st.materialId;
  const token = currentSession.access_token;
  const r = await fetch('/api/material', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fileName: st.bookFileName,
      storagePath: st.bookStoragePath || null,
      totalPages: st.bookTotalPages || 0,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erro ao criar material');
  const rec = normalizeMaterialRecord(data);
  st.materialId = rec.id;
  setStoredActiveMaterialId(rec.id);
  upsertMaterialInList(rec);
  renderMaterialPicker();
  renderMaterialLibrary();
  return rec.id;
}

async function persistMaterialChapters() {
  if (!currentSession?.access_token || !st.materialChapters?.length) return;
  try {
    await ensureMaterialRecordForBook();
    const token = currentSession.access_token;
    const body = {
      fileName: st.bookFileName,
      storagePath: st.bookStoragePath,
      totalPages: st.bookTotalPages,
      materialId: st.materialId,
      chapters: st.materialChapters.map(ch => ({
        id: ch.id,
        title: ch.title,
        printed_page_start: ch.printedPageStart,
        pdf_page_start: ch.pdfPageStart,
        pdf_page_end: ch.pdfPageEnd,
      })),
    };
    const r = await fetch('/api/material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.id) {
      st.materialId = data.id;
      setStoredActiveMaterialId(data.id);
      upsertMaterialInList(normalizeMaterialRecord(data));
    } else if (r.ok && data.materialId) {
      st.materialId = data.materialId;
      setStoredActiveMaterialId(data.materialId);
    }
    if (r.ok && st.materialId) {
      const cur = st.materialsList.find(m => m.id === st.materialId);
      if (cur) cur.chapters = [...st.materialChapters];
      renderMaterialPicker();
    }
  } catch (e) { console.warn('persistMaterial', e); }
}

function midiasItemSearchText(item) {
  return [
    item.title,
    item.imageId,
    item.fileName,
    item.sourceText,
    item.caption,
    item.src,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getMidiasSelectedSet() {
  if (!st.midiasSelected) st.midiasSelected = new Set();
  return st.midiasSelected;
}

function getFilteredMidiasItems() {
  const q = (st.midiasFilterQuery || '').trim().toLowerCase();
  const items = st.cloudImageIndex || [];
  if (!q) return items;
  return items.filter((i) => midiasItemSearchText(i).includes(q));
}

function buildMidiaCardHtml(item) {
  const id = escHtml(item.imageId);
  const title = escHtml((item.title || item.imageId).slice(0, 48));
  const src = escHtml((item.sourceText || item.caption || '').slice(0, 42));
  const pg = item.pageNumber ? `p.${item.pageNumber}` : '';
  const inBuilder = st.imageCatalog.some(i => i.imageId === item.imageId);
  const url = escHtml(item.previewUrl || '');
  const checked = getMidiasSelectedSet().has(item.imageId);
  return `<div class="cloud-img-card midia-card img-thumb cloud-ok${inBuilder ? ' block-ready' : ''}${checked ? ' midia-selected' : ''}" data-cloud-id="${id}">
    <label class="midia-chk-wrap" onclick="event.stopPropagation()">
      <input type="checkbox" class="midia-chk" data-midia-id="${id}" ${checked ? 'checked' : ''} onchange="toggleMidiaSelection('${id}', this.checked)" aria-label="Selecionar">
    </label>
    <img src="${url}" alt="${title}" loading="lazy">
    <div class="img-thumb-foot">
      <span class="img-thumb-pg">${pg || '☁️'}</span>
      <span class="img-thumb-src" title="${src}">${src || 'Sem fonte'}</span>
    </div>
    <div class="cloud-img-title">${title}</div>
    <div class="cloud-img-actions">
      <button type="button" class="img-suggest-btn" id="sugbtn-${id}" onclick="event.stopPropagation();suggestQuestionForImage('${id}')">💡 Sugerir questão</button>
      <button type="button" class="img-name-btn ready" onclick="event.stopPropagation();openCloudImageModal('${id}')">✏️ Nomear</button>
      <button type="button" class="midias-del-btn" onclick="event.stopPropagation();deleteCloudImage('${id}')">🗑 Apagar</button>
    </div>
    <div class="img-suggest-box" id="sugbox-${id}"></div>
  </div>`;
}

function updateMidiasToolbarState() {
  const items = getFilteredMidiasItems();
  const total = (st.cloudImageIndex || []).length;
  const status = document.getElementById('midias-status') || document.getElementById('cloud-images-status');
  const selCount = document.getElementById('midias-sel-count');
  const btnAll = document.getElementById('midias-select-all');
  const delBtn = document.getElementById('midias-delete-selected');
  const nSel = getMidiasSelectedSet().size;

  if (status) {
    const q = (st.midiasFilterQuery || '').trim();
    if (q && items.length !== total) {
      status.textContent = `${items.length} de ${total} (filtro)`;
    } else {
      status.textContent = `${total} arquivo(s)`;
    }
  }
  if (selCount) selCount.textContent = nSel ? `${nSel} selecionada(s)` : '';
  if (btnAll) {
    if (!items.length) {
      btnAll.textContent = '☑ Selecionar tudo';
      btnAll.disabled = true;
    } else {
      btnAll.disabled = false;
      const allOn = items.every((i) => getMidiasSelectedSet().has(i.imageId));
      btnAll.textContent = allOn ? '☐ Desmarcar tudo' : '☑ Selecionar tudo';
    }
  }
  if (delBtn) delBtn.style.display = nSel ? '' : 'none';
}

function renderMidiasGrid() {
  const grid = document.getElementById('midias-grid') || document.getElementById('cloud-images-grid');
  if (!grid) return;

  const items = getFilteredMidiasItems();
  const total = (st.cloudImageIndex || []).length;

  if (!total) {
    grid.innerHTML =
      '<div class="img-no-img" style="grid-column:1/-1">Nenhuma imagem em <b>images/</b> ainda. Recorte uma figura, envie um arquivo ou use «Salvar na nuvem».</div>';
    updateMidiasToolbarState();
    return;
  }

  if (!items.length) {
    grid.innerHTML =
      '<div class="img-no-img" style="grid-column:1/-1">Nenhuma imagem encontrada com esse nome. Limpe o filtro ou tente outro termo.</div>';
    updateMidiasToolbarState();
    return;
  }

  grid.innerHTML = items.map(buildMidiaCardHtml).join('');
  updateMidiasToolbarState();
}

function filterMidiasByName(value) {
  st.midiasFilterQuery = value ?? document.getElementById('midias-search')?.value ?? '';
  renderMidiasGrid();
}

function toggleMidiaSelection(imageId, checked) {
  const set = getMidiasSelectedSet();
  if (checked) set.add(imageId);
  else set.delete(imageId);
  const card = document.querySelector(`[data-cloud-id="${imageId}"]`);
  if (card) card.classList.toggle('midia-selected', checked);
  updateMidiasToolbarState();
}

function selectAllMidiasVisible() {
  const items = getFilteredMidiasItems();
  if (!items.length) return;
  const set = getMidiasSelectedSet();
  const allOn = items.every((i) => set.has(i.imageId));
  if (allOn) items.forEach((i) => set.delete(i.imageId));
  else items.forEach((i) => set.add(i.imageId));
  renderMidiasGrid();
}

function clearMidiasSelection() {
  st.midiasSelected = new Set();
  renderMidiasGrid();
}

async function refreshCloudImagesDashboard() {
  const grid = document.getElementById('midias-grid') || document.getElementById('cloud-images-grid');
  const status = document.getElementById('midias-status') || document.getElementById('cloud-images-status');
  if (!grid) return;

  if (!currentSession) {
    if (status) status.textContent = 'Faça login';
    grid.innerHTML = '<div class="img-no-img" style="grid-column:1/-1">Entre na conta para ver imagens do Supabase Storage.</div>';
    return;
  }
  if (!cloudReady()) {
    if (status) status.textContent = 'Nuvem indisponível';
    grid.innerHTML = '<div class="img-no-img" style="grid-column:1/-1">Supabase não conectado.</div>';
    return;
  }

  if (status) status.textContent = 'Carregando...';
  grid.innerHTML = '<div class="img-spin" style="grid-column:1/-1;padding:24px;text-align:center"><span>⏳</span> Listando pasta images...</div>';

  try {
    const items = await PedagiaCloud.listStorageImages();
    st.cloudImageIndex = items;

    for (const item of items) {
      ensureCloudCatalogEntry(item);
    }
    scheduleMidiasSourceAnalysis();

    const searchEl = document.getElementById('midias-search');
    if (searchEl && searchEl.value !== (st.midiasFilterQuery || '')) {
      searchEl.value = st.midiasFilterQuery || '';
    }
    renderMidiasGrid();
  } catch (e) {
    console.warn('cloud gallery:', e);
    if (status) status.textContent = 'Erro';
    grid.innerHTML = `<div class="img-no-img" style="grid-column:1/-1">Não foi possível listar: ${escHtml(e.message || String(e))}</div>`;
  }
}

function getCloudImageEntry(imageId) {
  const fromCloud = (st.cloudImageIndex || []).find(i => i.imageId === imageId);
  const fromCat = getImageCatalogEntry(imageId);
  if (fromCat) {
    if (fromCloud) {
      fromCat.storagePath = fromCloud.storagePath;
      fromCat.previewUrl = fromCloud.previewUrl || fromCat.previewUrl;
      fromCat.cloudSaved = true;
    }
    return fromCat;
  }
  return fromCloud || null;
}

async function useCloudImageInBuilder(imageId, opts = {}) {
  const cloud = (st.cloudImageIndex || []).find(i => i.imageId === imageId);
  if (!cloud) {
    toast('Imagem não encontrada na nuvem.', 'err');
    return;
  }
  let entry = getImageCatalogEntry(imageId);
  if (!entry) {
    entry = {
      imageId: cloud.imageId,
      storagePath: cloud.storagePath,
      previewUrl: cloud.previewUrl,
      dataUri: cloud.previewUrl,
      dataUrl: cloud.previewUrl,
      title: cloud.title,
      src: cloud.sourceText || cloud.caption,
      caption: cloud.caption || cloud.sourceText,
      sourceText: cloud.sourceText,
      pageNumber: cloud.pageNumber,
      cloudSaved: true,
      savedToBuilder: true,
      recommendedForQuestion: true,
      type: 'figura',
      usefulnessScore: 1,
      manualCrop: true,
    };
    st.imageCatalog.push(entry);
    st.extractedImages.push(entry);
    scheduleImageSegmentation(entry);
    const imgSec = document.getElementById('img-section');
    const gallery = document.getElementById('img-gallery');
    if (imgSec) imgSec.style.display = '';
    if (gallery) appendCropCardToGallery(entry);
    updateCropGalleryCount();
  } else {
    entry.storagePath = cloud.storagePath;
    entry.previewUrl = cloud.previewUrl || entry.previewUrl;
    entry.cloudSaved = true;
    entry.savedToBuilder = true;
    syncImageThumbMeta(imageId);
    if (!entry.segmented && !(entry.sourceText || '').trim()) {
      scheduleImageSegmentation(entry);
    }
  }
  saveImageToBuilder(imageId);
  scheduleSaveBuilder();
  refreshMidiasPage();
  if (!opts.silent) toast('Figura adicionada ao builder. Use «Sugerir questão».', 'ok', 3500);
}

async function openCloudImageModal(imageId) {
  await useCloudImageInBuilder(imageId, { silent: true });
  openImageNameModal(imageId);
}

function refreshMidiasPage() {
  if (document.getElementById('midia-gen-cats') && !document.querySelector('.midia-gen-cat.on')) {
    setMidiaGenCategory(st.midiaGenCategory || 'mapa');
  }
  return refreshCloudImagesDashboard();
}

function removeImageFromLocalState(imageId) {
  st.imageCatalog = st.imageCatalog.filter(i => i.imageId !== imageId);
  st.extractedImages = st.extractedImages.filter(i => i.imageId !== imageId);
  st.imageQuestionBlocks = st.imageQuestionBlocks.filter(b => b.imageId !== imageId);
  st.cloudImageIndex = (st.cloudImageIndex || []).filter(i => i.imageId !== imageId);
  const card = document.getElementById('imgi-' + imageId);
  if (card) card.remove();
  const midiaCard = document.querySelector(`[data-cloud-id="${imageId}"]`);
  if (midiaCard) midiaCard.remove();
  updateCropGalleryCount();
  updateBlockSelInfo();
  scheduleSaveBuilder();
}

async function deleteCloudImage(imageId, opts = {}) {
  if (!opts.skipConfirm && !confirm('Apagar esta imagem da nuvem? Questões ligadas a ela serão removidas do builder.')) {
    return;
  }
  const cloud = (st.cloudImageIndex || []).find(i => i.imageId === imageId);
  const cat = getImageCatalogEntry(imageId);
  const storagePath = cloud?.storagePath || cat?.storagePath;
  try {
    if (cloudReady() && storagePath) {
      await PedagiaCloud.deleteStorageImage(storagePath, imageId);
    }
    removeImageFromLocalState(imageId);
    getMidiasSelectedSet().delete(imageId);
    if (!opts.skipRefresh) await refreshMidiasPage();
    if (!opts.skipConfirm) toast('Imagem apagada.', 'ok', 3000);
  } catch (e) {
    if (!opts.skipConfirm) toast('Erro ao apagar: ' + (e.message || e), 'err', 5000);
    throw e;
  }
}

async function deleteSelectedMidias() {
  const ids = [...getMidiasSelectedSet()];
  if (!ids.length) return;
  if (!confirm(`Apagar ${ids.length} imagem(ns) da nuvem?`)) return;
  let ok = 0;
  for (const id of ids) {
    try {
      await deleteCloudImage(id, { skipConfirm: true, skipRefresh: true });
      ok++;
    } catch (e) {
      console.warn('delete', id, e);
    }
  }
  st.midiasSelected = new Set();
  await refreshMidiasPage();
  toast(`${ok} imagem(ns) apagada(s).`, 'ok', 3500);
}

const MIDIA_GEN_PLACEHOLDERS = {
  mapa: 'Ex.: mapa do Brasil com biomas, legenda e escala',
  anatomia: 'Ex.: sistema digestório humano com rótulos em português',
  historia: 'Ex.: reconstrução de uma feira medieval no século XIII',
  arquitetura: 'Ex.: praça colonial com igreja e casarios',
  educativo: 'Ex.: ciclo da água com setas e legendas curtas',
};

function setMidiaGenCategory(cat) {
  st.midiaGenCategory = cat || 'educativo';
  document.querySelectorAll('.midia-gen-cat').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.cat === st.midiaGenCategory);
  });
  const ta = document.getElementById('midia-gen-prompt');
  if (ta) ta.placeholder = MIDIA_GEN_PLACEHOLDERS[st.midiaGenCategory] || MIDIA_GEN_PLACEHOLDERS.educativo;
}

function setMidiaGenStatus(text, isErr = false) {
  const el = document.getElementById('midia-gen-status');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isErr ? 'var(--R)' : 'var(--t3)';
}

function clearMidiaGenLog() {
  const el = document.getElementById('midia-gen-log');
  if (el) el.innerHTML = '';
}

function appendMidiaGenLog(message, level = 'info') {
  const el = document.getElementById('midia-gen-log');
  if (!el) return;
  const line = document.createElement('div');
  line.className = `midia-gen-log-line midia-gen-log-${level}`;
  const t = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  line.textContent = `[${t}] ${message}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function setMidiaGenLoading(active, title) {
  const overlay = document.getElementById('midia-gen-loading');
  const panel = document.getElementById('midia-gen-panel');
  const bar = document.getElementById('midia-gen-progress-bar');
  const titleEl = document.getElementById('midia-gen-loading-title');
  const btn = document.getElementById('btn-midia-gen');
  if (overlay) overlay.style.display = active ? 'flex' : 'none';
  if (panel) panel.classList.toggle('midia-gen-busy', active);
  if (btn) btn.disabled = !!active;
  if (titleEl && title) titleEl.textContent = title;
  if (bar && !active) bar.style.width = '0%';
}

function setMidiaGenProgress(percent) {
  const bar = document.getElementById('midia-gen-progress-bar');
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

async function consumeGerarImagemStream(resp) {
  if (!resp.body) throw new Error('Resposta sem stream do servidor.');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let donePayload = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      let ev;
      try {
        ev = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (ev.type === 'log' && ev.message) {
        appendMidiaGenLog(ev.message, ev.level || 'info');
        if (/Enviando POST/i.test(ev.message)) setMidiaGenProgress(25);
        if (/respondeu HTTP/i.test(ev.message)) setMidiaGenProgress(55);
        if (/Modelo cobrado/i.test(ev.message)) setMidiaGenProgress(75);
      }
      if (ev.type === 'progress' && ev.percent != null) setMidiaGenProgress(ev.percent);
      if (ev.type === 'error') throw new Error(ev.error || 'Erro ao gerar imagem');
      if (ev.type === 'done') donePayload = ev;
    }
  }

  if (!donePayload) throw new Error('Geração interrompida antes de concluir.');
  return donePayload;
}

async function generateMidiaVisual() {
  if (!(await ensureFreshSession())) {
    toast('Faça login para gerar imagens.', 'err');
    return;
  }
  const prompt = (document.getElementById('midia-gen-prompt')?.value || '').trim();
  if (prompt.length < 8) {
    toast('Descreva o que deseja gerar (mínimo 8 caracteres).', 'err');
    return;
  }

  const btn = document.getElementById('btn-midia-gen');
  const saveBtn = document.getElementById('btn-midia-gen-save');
  const preview = document.getElementById('midia-gen-preview');
  if (btn) btn.textContent = '⏳ Gerando…';
  if (saveBtn) saveBtn.style.display = 'none';
  st.pendingGeneratedImage = null;
  clearMidiaGenLog();
  setMidiaGenStatus('');
  setMidiaGenLoading(true, 'Gerando imagem com Kie AI…');
  setMidiaGenProgress(8);
  appendMidiaGenLog('Iniciando pedido ao servidor PedagIA…');

  try {
    let imageModelHint = '';
    try {
      const cfgRes = await fetch('/api/config');
      const cfg = await cfgRes.json().catch(() => ({}));
      const kieModel = cfg.kieImageModel || cfg.openRouterImageModel;
      if (kieModel) {
        imageModelHint = kieModel;
        appendMidiaGenLog(`Modelo Kie: ${kieModel}`);
      }
      const kieHint = cfg.kieImageHint || cfg.openRouterImageModelError;
      if (kieHint) appendMidiaGenLog(kieHint, 'warn');
      appendMidiaGenLog(`Provas (texto): ${cfg.openRouterTextModel || '—'}`, 'info');
    } catch {
      appendMidiaGenLog('Não foi possível ler /api/config', 'warn');
    }

    setMidiaGenProgress(15);
    appendMidiaGenLog('Enviando tarefa para Kie AI (GPT Image 2)…');

    const resp = await fetch('/api/gerar-imagem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        stream: true,
        category: st.midiaGenCategory || 'educativo',
        prompt,
        aspectRatio: document.getElementById('midia-gen-aspect')?.value || '4:3',
        title: document.getElementById('midia-gen-title')?.value?.trim() || '',
        disciplina: v('f-disc'),
        serie: v('f-serie'),
      }),
    });

    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || `Erro HTTP ${resp.status}`);
    }

    const contentType = resp.headers.get('content-type') || '';
    let data;
    if (contentType.includes('text/event-stream')) {
      data = await consumeGerarImagemStream(resp);
    } else {
      data = await resp.json();
      if (data.log) {
        for (const entry of data.log) {
          appendMidiaGenLog(entry.message, entry.level || 'info');
        }
      }
    }

    if (data.modelUsed && data.modelUsed !== data.modelRequested) {
      appendMidiaGenLog(
        `Pedido: ${data.modelRequested} → cobrado: ${data.modelUsed}`,
        'warn',
      );
    } else if (data.modelUsed) {
      appendMidiaGenLog(`Modelo confirmado na fatura: ${data.modelUsed}`, 'ok');
    }

    const img = data.images?.[0];
    if (!img?.base64 && !img?.dataUrl) throw new Error('Nenhuma imagem retornada.');

    st.pendingGeneratedImage = {
      ...img,
      category: data.category,
      title: data.title || prompt.slice(0, 60),
      sourceText: 'Fonte: ilustração gerada por IA (PedagIA / Kie AI).',
      modelUsed: data.modelUsed,
    };

    if (preview) {
      preview.src = img.dataUrl || `data:${img.mime || 'image/png'};base64,${img.base64}`;
      preview.style.display = 'block';
    }
    if (saveBtn) saveBtn.style.display = '';
    const titleInput = document.getElementById('midia-gen-title');
    if (titleInput && !titleInput.value.trim() && data.title) titleInput.value = data.title;

    setMidiaGenProgress(100);
    setMidiaGenStatus(
      `Pronto — ${data.modelUsed || imageModelHint || 'imagem'}. Salve na nuvem.`,
    );
    toast('Imagem gerada! Confira o log e salve na nuvem.', 'ok', 4500);
  } catch (e) {
    const friendly = humanizeIaApiError(e.message);
    appendMidiaGenLog(friendly, 'error');
    setMidiaGenStatus(friendly, true);
    toast(friendly, 'err', 8000);
    if (preview) preview.style.display = 'none';
  } finally {
    setMidiaGenLoading(false);
    if (btn) { btn.disabled = false; btn.textContent = '✨ Gerar imagem'; }
  }
}

async function saveGeneratedMidiaToCloud() {
  const pending = st.pendingGeneratedImage;
  if (!pending) {
    toast('Gere uma imagem antes de salvar.', 'err');
    return;
  }
  if (!cloudReady()) {
    toast('Faça login para salvar na nuvem.', 'err');
    return;
  }

  const saveBtn = document.getElementById('btn-midia-gen-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Salvando…'; }

  try {
    const mime = pending.mime || 'image/png';
    if (!cleanB64(pending.base64 || '') && pending.dataUrl) {
      const fetched = await fetchUrlToB64(pending.dataUrl);
      if (fetched) pending.base64 = fetched;
    }
    const raw = cleanB64(pending.base64 || '');
    if (!raw) throw new Error('Imagem sem dados para enviar.');

    const bin = atob(raw);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const title = (document.getElementById('midia-gen-title')?.value || pending.title || 'IA').trim();
    const file = new File([arr], `${title.slice(0, 40).replace(/[^\w\-]+/g, '_')}.${ext}`, { type: mime });

    const uploaded = await PedagiaCloud.uploadMediaImage(file);
    const entry = {
      ...uploaded,
      title: title.slice(0, 80),
      sourceText: pending.sourceText || 'Fonte: ilustração gerada por IA (PedagIA).',
      caption: title.slice(0, 80),
      savedToBuilder: true,
      recommendedForQuestion: true,
      type: 'figura',
      usefulnessScore: 1,
      manualCrop: false,
      aiGenerated: true,
    };
    const existing = getImageCatalogEntry(entry.imageId);
    if (!existing) {
      st.imageCatalog.push(entry);
      st.extractedImages.push(entry);
    } else {
      Object.assign(existing, entry);
    }

    entry.segmented = !!(entry.sourceText || '').trim();
    if (typeof PedagiaCloud.upsertImageMeta === 'function') {
      try { await PedagiaCloud.upsertImageMeta(entry); } catch (e) { console.warn('upsertImageMeta', e); }
    }
    scheduleSaveBuilder();
    await refreshMidiasPage();
    st.pendingGeneratedImage = null;
    setMidiaGenStatus('Salva na galeria. Use «Sugerir questão» no card.');
    toast('Imagem salva em Minhas mídias.', 'ok', 4000);
    const saveBtn2 = document.getElementById('btn-midia-gen-save');
    if (saveBtn2) saveBtn2.style.display = 'none';
  } catch (e) {
    toast(e.message || 'Erro ao salvar.', 'err', 6000);
    setMidiaGenStatus(e.message, true);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Salvar na nuvem'; }
  }
}

async function handleMidiasUpload(input) {
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length) return;
  if (!cloudReady()) {
    toast('Faça login para enviar imagens à nuvem.', 'err');
    return;
  }
  let ok = 0;
  for (const file of files) {
    try {
      const uploaded = await PedagiaCloud.uploadMediaImage(file);
      const entry = {
        ...uploaded,
        title: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
        savedToBuilder: true,
        recommendedForQuestion: true,
        type: 'figura',
        usefulnessScore: 1,
        manualCrop: true,
      };
      const existing = getImageCatalogEntry(entry.imageId);
      if (!existing) {
        st.imageCatalog.push(entry);
        st.extractedImages.push(entry);
      } else {
        Object.assign(existing, entry);
      }
      ok++;
    } catch (e) {
      toast(`Falha em ${file.name}: ${e.message}`, 'err', 5000);
    }
  }
  if (ok) {
    scheduleSaveBuilder();
    await refreshMidiasPage();
    toast(`${ok} imagem(ns) adicionada(s).`, 'ok', 3500);
  }
}

function showImageReviewPanel(filter = 'all') {
  const panel = document.getElementById('img-review-panel');
  if (!panel) return;
  const catalog = st.imageCatalog || [];
  const types = {
    all: () => true,
    useful: i => i.recommendedForQuestion && !i.isFullPage,
    grafico: i => i.type === 'grafico',
    tabela: i => i.type === 'tabela',
    fullpage: i => i.isFullPage,
    discarded: i => i.type === 'lixo' || (i.usefulnessScore != null && i.usefulnessScore < 0.35),
  };
  const fn = types[filter] || types.all;
  const list = catalog.filter(fn);
  panel.style.display = '';
  panel.innerHTML = `
    <div class="img-review-toolbar">
      <button type="button" class="chip on" data-f="all">Todas (${catalog.length})</button>
      <button type="button" class="chip" data-f="useful">Úteis</button>
      <button type="button" class="chip" data-f="grafico">Gráficos</button>
      <button type="button" class="chip" data-f="tabela">Tabelas</button>
      <button type="button" class="chip" data-f="fullpage">Página inteira</button>
      <button type="button" class="chip" data-f="discarded">Descartadas</button>
    </div>
    <div class="img-review-list">${list.length ? list.map(i => `
      <div class="img-review-item" data-id="${i.imageId}">
        <img src="${i.previewUrl || ''}" alt="">
        <div><b>${escHtml(i.title || i.type || '?')}</b> p.${i.pageNumber || '?'}${i.cloudSaved ? ' · ☁️' : ''}
        <br><small>${escHtml((i.sourceText || i.src || '').slice(0, 80))}</small>
        <br><small>${escHtml(i.description || '')}</small></div>
        <button type="button" class="img-name-btn" style="margin-top:6px" onclick="openImageNameModal('${i.imageId}')">${i.cloudSaved ? '✓ Nuvem' : '✏️ Nomear'}</button>
      </div>`).join('') : '<p>Nenhuma imagem neste filtro.</p>'}
    </div>`;
  panel.querySelectorAll('[data-f]').forEach(btn => {
    btn.onclick = () => showImageReviewPanel(btn.dataset.f);
  });
}

function selectChapter(el, idx) {
  document.querySelectorAll('#chapter-list .citem').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  st.selectedChapterIdx = idx;
  st.selectedPages      = new Set();
  const matCh = st.materialChapters[idx];
  if (matCh) st.processedChapterId = matCh.id;

  // Reseta galeria de forma segura (null-safe)
  st.extractedImages = [];
  st.imageCatalog = [];
  st.imageQuestionBlocks = [];
  st.selectedImageIdx = new Set();
  st.imgRendering = false;
  const _g = id => document.getElementById(id); // helper seguro
  if (_g('img-section'))  _g('img-section').style.display  = 'none';
  if (_g('img-gallery'))  _g('img-gallery').innerHTML      = '';
  if (_g('img-q-row'))    _g('img-q-row').style.display    = 'none';
  if (_g('img-sel-info')) { _g('img-sel-info').className = 'img-sel-info none'; _g('img-sel-info').textContent = 'Selecione imagens acima para usar nas questões'; }

  const ch   = st.bookChapters[idx];
  const next = st.bookChapters[idx + 1];
  const mat  = st.materialChapters[idx];

  const start = mat?.pdfPageStart || ch?.pageNum;
  const end = mat?.pdfPageEnd || (next?.pageNum ? next.pageNum - 1 : null);

  if (start) {
    const useAllInChapter = st.sumarioSkipped
      || (mat?.pdfPageEnd && mat.pdfPageEnd - start + 1 >= (st.bookTotalPages || 0) - 1);
    const endPg = useAllInChapter
      ? (mat?.pdfPageEnd || st.bookTotalPages)
      : (end || Math.min(start + 24, st.bookTotalPages));
    const maxPages = useAllInChapter ? (st.bookTotalPages || endPg) : Math.min(endPg, start + 29);
    const pages = [];
    for (let p = start; p <= maxPages; p++) {
      pages.push(p);
      st.selectedPages.add(p);
    }
    renderPageChips(pages);
    renderPageThumbnails(pages).catch(() => {});
  } else {
    // Capítulo sem número de página → mostra aviso e chips vazios
    const chips = _g('page-chips');
    if (chips) chips.innerHTML =
      '<div style="font-size:12px;color:var(--t3);padding:6px 2px">Número de página não detectado — use o campo manual acima para informar o intervalo de páginas.</div>';
    updatePgCount();
  }

  // Garante que step 4 apareça em qualquer caso
  if (_g('step4-item'))   _g('step4-item').style.display   = 'flex';
  if (_g('pp3')) { _g('pp3').className = 'pstep done'; _g('pp3').querySelector('.pdot').textContent = '✓'; }
  if (_g('pp4'))   _g('pp4').className = 'pstep act';

    setTimeout(() => _g('step4-item')?.scrollIntoView({behavior:'smooth', block:'nearest'}), 100);
  scheduleSaveBuilder();
}

function renderPageChips(pages) {
  const c = document.getElementById('page-chips');
  c.innerHTML = pages.map(p => `<div class="pc on" data-pg="${p}" onclick="togP(this)">${p}</div>`).join('');
  updatePgCount();
}
function togP(el) {
  const p = parseInt(el.dataset.pg);
  el.classList.toggle('on');
  const on = el.classList.contains('on');
  on ? st.selectedPages.add(p) : st.selectedPages.delete(p);
  if (!on) {
    const removedIds = [];
    st.imageQuestionBlocks = st.imageQuestionBlocks.filter(b => {
      const pg = b.image?.pageNumber || b.image?.pageNum;
      if (pg === p) { removedIds.push(b.imageId); return false; }
      return true;
    });
    st.imageCatalog = st.imageCatalog.filter(img => (img.pageNumber || img.pageNum) !== p);
    st.extractedImages = st.extractedImages.filter(img => (img.pageNumber || img.pageNum) !== p);
    removedIds.forEach(id => document.getElementById('imgi-' + id)?.remove());
    updateBlockSelInfo();
  }
  updatePgCount();
  scheduleSaveBuilder();
}
function updatePgCount() {
  const n  = st.selectedPages?.size ?? 0;
  const ni = st.extractedImages?.length ?? 0;
  const imgInfo = ni > 0 ? ` · ${ni} imagem${ni!==1?'ns':''}` : '';
  const el = document.getElementById('pg-count');
  if (el) el.textContent =
    n + ' página' + (n!==1?'s':'') + ' selecionada' + (n!==1?'s':'') + imgInfo + ' · texto + fontes';
}

function selecionarIntervaloPaginas() {
  const max = st.bookTotalPages || st.bookPdf?.numPages || 0;
  if (!st.bookPdf || !max) {
    toast('Carregue o PDF do livro primeiro.', 'err');
    return;
  }
  const from = parseInt(v('f-pag-from'), 10);
  const to = parseInt(v('f-pag-to'), 10);
  if (!from || !to) {
    toast('Informe página inicial e final.', 'err');
    return;
  }
  const lo = Math.max(1, Math.min(from, to, max));
  const hi = Math.max(1, Math.min(Math.max(from, to), max));
  if (hi - lo > 40) {
    toast('Selecione no máximo 40 páginas por vez.', 'err', 5000);
    return;
  }
  st.selectedPages = new Set();
  const pages = [];
  for (let p = lo; p <= hi; p++) {
    pages.push(p);
    st.selectedPages.add(p);
  }
  renderPageChips(pages);
  renderPageThumbnails(pages).catch(() => {});
  updatePgCount();
  const step4 = document.getElementById('step4-item');
  if (step4) step4.style.display = 'flex';
  const imgSec = document.getElementById('img-section');
  if (imgSec) imgSec.style.display = '';
  toast(`${pages.length} página(s) selecionada(s).`, 'ok');
  scheduleSaveBuilder();
}

function onManualCap() {
  st.selectedChapterIdx = -1;
  document.querySelectorAll('#chapter-list .citem').forEach(c => c.classList.remove('on'));
  scheduleSaveBuilder();
}

// ── Extract text from selected pages ─────────────────
async function extractSelectedPages() {
  if (!st.bookPdf || st.selectedPages.size === 0) return '';
  const pages = [...st.selectedPages].sort((a,b) => a-b);
  let text = '';
  for (const p of pages) {
    try {
      const page = await st.bookPdf.getPage(p);
      const ct   = await page.getTextContent();
      let pt = ''; let lx = null;
      for (const item of ct.items) {
        if (lx !== null && Math.abs(item.transform[4] - lx) > 8) pt += ' ';
        pt += item.str; lx = item.transform[4] + (item.width||0);
      }
      text += `[Página ${p}]\n${pt.trim()}\n\n`;
    } catch {}
  }
  const core = getCore();
  if (core?.cleanFullChapterText) return core.cleanFullChapterText(text);
  return text;
}

async function analyzeChapterForExam({ chapterTitle, pagesText, pages }) {
  const token = currentSession?.access_token;
  if (!token || !pagesText || pagesText.length < 200) return null;
  try {
    const r = await fetch('/api/analisar-capitulo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        chapterTitle: chapterTitle || '',
        serie: v('f-serie'),
        disciplina: v('f-disc'),
        pages: pages || [],
        pagesText,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.brief) return data.brief;
    console.warn('analisar-capitulo:', data.error || r.status);
  } catch (e) {
    console.warn('analisar capítulo', e);
  }
  return null;
}

// ══════════════════════════════════════════════
// BUILD PROMPT
// ══════════════════════════════════════════════
// ══ EXTRAÇÃO DE IMAGENS INDIVIDUAIS DO PDF ══════════════════════════

// Extrai fontes "Fonte: ..." do texto da página
function extractSources(text) {
  const found = [];
  const re = /[Ff]onte:\s*([^\n]{8,}(?:\n(?![A-ZÁÊÍÓÚÀÃÇ\d])[^\n]{4,}){0,3})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const s = m[1].replace(/\s+/g,' ').trim();
    if (s.length > 15 && s.length < 350 && !found.includes(s)) found.push(s);
  }
  return found;
}

// Extrai imagens individuais usando Proxy + getTransform() na renderização do PDF.js.
// Sempre retorna ao menos a página inteira (isFullPage:true) como fallback.
async function extractImagesFromPage(pdfPage, pageNum) {
  const SCALE = 2.0;
  const vp    = pdfPage.getViewport({ scale: SCALE });

  // Canvas principal — recebe a renderização completa da página
  const canvas  = document.createElement('canvas');
  canvas.width  = vp.width;
  canvas.height = vp.height;
  const realCtx = canvas.getContext('2d');

  const imgRects = [];

  function applyXf(xf, x, y) {
    return [xf.a * x + xf.c * y + xf.e,
            xf.b * x + xf.d * y + xf.f];
  }

  // Proxy que intercepta drawImage E putImageData para capturar posições de imagens
  const proxyCtx = new Proxy(realCtx, {
    get(target, prop) {

      if (prop === 'drawImage') {
        return function(src, ...args) {
          try {
            const xf = target.getTransform();
            let dx = 0, dy = 0, dw, dh;
            const nW = (src.width  || src.naturalWidth  || 0);
            const nH = (src.height || src.naturalHeight || 0);
            if (args.length === 0) {
              dw = nW || 1; dh = nH || 1;
            } else if (args.length === 2) {
              [dx, dy] = args; dw = nW || 1; dh = nH || 1;
            } else if (args.length === 4) {
              [dx, dy, dw, dh] = args;
            } else {
              dx = args[4]; dy = args[5]; dw = args[6]; dh = args[7];
            }
            const corners = [
              applyXf(xf, dx,    dy),   applyXf(xf, dx+dw, dy),
              applyXf(xf, dx,    dy+dh),applyXf(xf, dx+dw, dy+dh)
            ];
            const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
            const bx = Math.min(...xs), bW = Math.max(...xs) - Math.min(...xs);
            const by = Math.min(...ys), bH = Math.max(...ys) - Math.min(...ys);
            const asp = bW / bH;
            if (bW > 80 && bH > 80 && asp > 0.06 && asp < 16) {
              imgRects.push({ x: bx, y: by, w: bW, h: bH });
            }
          } catch {}
          return target.drawImage(src, ...args);
        };
      }

      if (prop === 'putImageData') {
        return function(imgData, dx, dy, ...rest) {
          try {
            // putImageData ignora o CTM — coordenadas já são de canvas
            const dw = rest.length >= 4 ? rest[2] : imgData.width;
            const dh = rest.length >= 4 ? rest[3] : imgData.height;
            const bx = rest.length >= 4 ? dx + rest[0] : dx;
            const by = rest.length >= 4 ? dy + rest[1] : dy;
            const asp = dw / dh;
            if (dw > 80 && dh > 80 && asp > 0.06 && asp < 16) {
              imgRects.push({ x: bx, y: by, w: dw, h: dh });
            }
          } catch {}
          return target.putImageData(imgData, dx, dy, ...rest);
        };
      }

      const val = target[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });

  // Renderiza a página (uma única vez) com o proxy
  await pdfPage.render({ canvasContext: proxyCtx, viewport: vp }).promise;

  // Remove duplicatas próximas
  const unique = [];
  for (const r of imgRects) {
    if (!unique.some(u =>
      Math.abs(u.x - r.x) < 15 && Math.abs(u.y - r.y) < 15 &&
      Math.abs(u.w - r.w) < 30 && Math.abs(u.h - r.h) < 30
    )) unique.push(r);
  }

  let textBoxes = [];
  const core = getCore();
  try {
    const ct = await pdfPage.getTextContent();
    if (core?.parsePdfTextBoxes) {
      textBoxes = core.parsePdfTextBoxes(ct.items, vp.height);
    }
  } catch {}

  const pageTextSummary = textBoxes.map(tb => tb.text).join(' ').slice(0, 2500);
  let cropRects = [];
  const USE_AI_FIGURE_DETECT = false;

  if (USE_AI_FIGURE_DETECT && cloudReady()) {
    const aiRects = await refinePageFiguresWithAI(canvas, pageNum, pageTextSummary, textBoxes);
    if (aiRects.length) cropRects = aiRects;
  }

  // 2) Sem login ou IA vazia → heurística PDF (sem página inteira automática)
  if (USE_AI_FIGURE_DETECT && !cropRects.length && unique.length) {
    let pdfRects = unique;
    if (core?.expandFigureRects) {
      pdfRects = core.expandFigureRects(pdfRects, textBoxes, canvas.width, canvas.height);
    }
    cropRects = pdfRects;
  }

  if (core?.refineFigureRectsWithText && cropRects.length) {
    cropRects = core.refineFigureRectsWithText(
      cropRects,
      textBoxes,
      canvas.width,
      canvas.height,
    );
  }

  if (core?.filterFigureRects) {
    cropRects = core.filterFigureRects(cropRects, canvas.width, canvas.height, textBoxes);
  }

  if (cropRects.length === 0) return [];

  // ── Recorta imagens individuais do canvas já renderizado ──────────────
  const results = [];
  for (let rect of cropRects) {
    if (core?.trimWhitespaceMargins) {
      try {
        const cx0 = Math.max(0, Math.round(rect.x));
        const cy0 = Math.max(0, Math.round(rect.y));
        const cw0 = Math.min(Math.round(rect.w), canvas.width - cx0);
        const ch0 = Math.min(Math.round(rect.h), canvas.height - cy0);
        if (cw0 > 40 && ch0 > 40) {
          const region = realCtx.getImageData(cx0, cy0, cw0, ch0);
          rect = core.trimWhitespaceMargins(rect, region);
        }
      } catch {}
    }
    const { x, y, w, h } = rect;
    const cx = Math.max(0, Math.round(x));
    const cy = Math.max(0, Math.round(y));
    const cw = Math.min(Math.round(w), canvas.width  - cx);
    const ch = Math.min(Math.round(h), canvas.height - cy);
    if (cw < 80 || ch < 80) continue;
    const crop = document.createElement('canvas');
    crop.width = cw; crop.height = ch;
    crop.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    const dataUrl = crop.toDataURL('image/jpeg', 0.85);
    let srcHint = rect._source || '';
    if (srcHint && !/^fonte:/i.test(srcHint)) srcHint = `Fonte: ${srcHint}`;
    results.push({
      pageNum,
      dataUrl,
      base64: dataUrl.split(',')[1],
      w: cw,
      h: ch,
      title: rect._title || '',
      caption: srcHint,
      src: srcHint,
    });
  }

  return results;
}

/** Lê a página inteira e devolve caixas de figuras didáticas (título + visual + Fonte). */
async function refinePageFiguresWithAI(canvas, pageNum, pageTextSummary = '', textBoxes = []) {
  if (!currentSession?.access_token) return [];
  try {
    const maxW = 1280;
    const scale = canvas.width > maxW ? maxW / canvas.width : 1;
    let b64;
    let cw;
    let ch;
    if (scale < 1) {
      const t = document.createElement('canvas');
      t.width = Math.round(canvas.width * scale);
      t.height = Math.round(canvas.height * scale);
      t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
      b64 = t.toDataURL('image/jpeg', 0.84).split(',')[1];
      cw = t.width;
      ch = t.height;
    } else {
      b64 = canvas.toDataURL('image/jpeg', 0.84).split(',')[1];
      cw = canvas.width;
      ch = canvas.height;
    }
    const resp = await fetch('/api/detectar-figuras', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + currentSession.access_token,
      },
      body: JSON.stringify({
        pageBase64: b64,
        canvasWidth: cw,
        canvasHeight: ch,
        pageNumber: pageNum,
        pageTextSummary: pageTextSummary || '',
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !Array.isArray(data.figures) || !data.figures.length) return [];
    const inv = 1 / scale;
    const core = getCore();
    const raw = data.figures.map(f => {
      let src = f.source_text || '';
      if (src && !/^fonte:/i.test(src)) src = `Fonte: ${src}`;
      return {
        x: Math.round(Number(f.x) * inv),
        y: Math.round(Number(f.y) * inv),
        w: Math.round(Number(f.w) * inv),
        h: Math.round(Number(f.h) * inv),
        _title: f.title || '',
        _source: src,
      };
    });
    let refined = raw;
    if (core?.refineFigureRectsWithText) {
      refined = core.refineFigureRectsWithText(
        refined,
        textBoxes,
        canvas.width,
        canvas.height,
      );
    }
    if (core?.filterFigureRects) {
      return core.filterFigureRects(refined, canvas.width, canvas.height, textBoxes);
    }
    return refined;
  } catch (e) {
    console.warn('refinePageFiguresWithAI', e);
    return [];
  }
}

// ── Catálogo de imagens e blocos imagem+questão ─────────────────────
function newImageId() {
  return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function registerCatalogImage(img, pageNum, srcHint) {
  const imageId = img.imageId || newImageId();
  const previewUrl = img.dataUrl || img.previewUrl || '';
  const dataUri = previewUrl;
  const base64 = img.base64 || (dataUri.includes(',') ? dataUri.split(',')[1] : '');
  let src = srcHint || img.caption || img.src || '';
  if (src && !/^fonte:/i.test(src)) src = `Fonte: ${src}`;
  let entry = {
    imageId,
    pageNumber: pageNum,
    pageNum,
    previewUrl,
    dataUri,
    dataUrl: previewUrl,
    base64,
    caption: src,
    title: img.title || '',
    description: img.description || '',
    sourceText: src,
    src,
    w: img.w,
    h: img.h,
    isFullPage: !!img.isFullPage,
    idx: st.extractedImages.length,
    materialId: st.materialId,
    chapterId: st.processedChapterId,
    cloudSaved: false,
    segmented: false,
  };
  const core = getCore();
  if (core) {
    const cls = core.classifyExtractedImage(entry, srcHint || '');
    entry = core.applyClassification(entry, cls);
  }
  if (img.manualCrop) {
    entry.manualCrop = true;
    entry.recommendedForQuestion = true;
    entry.type = entry.type || 'figura';
    entry.usefulnessScore = 1;
    entry.isFullPage = false;
  } else {
    scheduleImageSegmentation(entry);
  }
  st.imageCatalog.push(entry);
  st.extractedImages.push(entry);
  return entry;
}

let _modalImageId = null;
const _segmentPending = new Set();

function ensureCloudCatalogEntry(cloud) {
  if (!cloud?.imageId) return null;
  let entry = getImageCatalogEntry(cloud.imageId);
  if (!entry) {
    entry = {
      imageId: cloud.imageId,
      storagePath: cloud.storagePath,
      previewUrl: cloud.previewUrl,
      dataUri: cloud.previewUrl,
      dataUrl: cloud.previewUrl,
      title: cloud.title || '',
      src: cloud.sourceText || cloud.caption || '',
      caption: cloud.caption || cloud.sourceText || '',
      sourceText: cloud.sourceText || cloud.caption || '',
      pageNumber: cloud.pageNumber,
      cloudSaved: true,
      segmented: !!(cloud.sourceText || '').trim(),
      manualCrop: true,
      type: 'figura',
      usefulnessScore: 1,
    };
    st.imageCatalog.push(entry);
    st.extractedImages.push(entry);
  } else {
    entry.storagePath = cloud.storagePath || entry.storagePath;
    entry.previewUrl = cloud.previewUrl || entry.previewUrl;
    entry.dataUri = cloud.previewUrl || entry.dataUri;
    entry.cloudSaved = true;
    if (cloud.title) entry.title = cloud.title;
    if (cloud.sourceText) {
      entry.sourceText = cloud.sourceText;
      entry.src = cloud.sourceText;
      entry.caption = cloud.sourceText;
      entry.segmented = true;
    }
  }
  return entry;
}

function scheduleMidiasSourceAnalysis() {
  for (const item of st.cloudImageIndex || []) {
    const entry = ensureCloudCatalogEntry(item);
    if (!entry) continue;
    const hasSource = !!(entry.sourceText || entry.caption || entry.src || '').trim();
    if (hasSource && !entry.segmented) {
      entry.segmented = true;
      continue;
    }
    if (!hasSource && !entry.segmented) scheduleImageSegmentation(entry);
  }
}

function syncMidiaCardMeta(imageId) {
  const entry = getCloudImageEntry(imageId);
  if (!entry) return;
  const esc = (typeof CSS !== 'undefined' && CSS.escape)
    ? CSS.escape(imageId)
    : String(imageId).replace(/"/g, '\\"');
  const card = document.querySelector(`[data-cloud-id="${esc}"]`);
  if (!card) return;
  const srcEl = card.querySelector('.img-thumb-src');
  const src = (entry.sourceText || entry.caption || entry.src || '').trim();
  if (srcEl) {
    srcEl.textContent = src ? src.slice(0, 42) : (entry._segmentError ? 'Erro IA' : 'Analisando…');
    srcEl.title = entry._segmentError || src || 'Aguardando análise da fonte';
  }
  const titleEl = card.querySelector('.cloud-img-title');
  if (titleEl && entry.title) titleEl.textContent = entry.title.slice(0, 48);
}

function scheduleImageSegmentation(entry) {
  if (!entry?.imageId || _segmentPending.has(entry.imageId)) return;
  _segmentPending.add(entry.imageId);
  segmentImageWithAI(entry)
    .catch(e => console.warn('segmentar', entry.imageId, e))
    .finally(() => _segmentPending.delete(entry.imageId));
}

async function segmentImageWithAI(entry) {
  let b64 = getImageB64(entry);
  if (!b64) b64 = await ensureImageB64(entry);
  if (!b64) {
    entry._segmentError = 'Imagem sem dados para análise';
    syncMidiaCardMeta(entry.imageId);
    return entry;
  }
  const tok = currentSession?.access_token;
  if (!tok) return entry;

  syncMidiaCardMeta(entry.imageId);

  const resp = await fetch('/api/segmentar-imagem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
    body: JSON.stringify({
      imageBase64: b64,
      storagePath: entry.storagePath || '',
      pageNumber: entry.pageNumber || entry.pageNum,
      textSourceHint: entry.src || entry.caption || '',
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    entry._segmentError = data.error || `HTTP ${resp.status}`;
    syncMidiaCardMeta(entry.imageId);
    return entry;
  }
  delete entry._segmentError;
  if (data.title && !entry.title) entry.title = data.title;
  if (data.description) entry.description = data.description;
  if (data.source_text) {
    entry.sourceText = data.source_text;
    entry.src = data.source_text;
    entry.caption = data.source_text;
  }
  if (data.image_type) entry.type = data.image_type;
  entry.segmented = true;
  const core = getCore();
  if (core) {
    const cls = core.classifyExtractedImage(entry, entry.src || '');
    Object.assign(entry, core.applyClassification(entry, cls));
  }
  const cloudItem = (st.cloudImageIndex || []).find((i) => i.imageId === entry.imageId);
  if (cloudItem) {
    cloudItem.title = entry.title || cloudItem.title;
    cloudItem.sourceText = entry.sourceText || cloudItem.sourceText;
    cloudItem.caption = entry.caption || cloudItem.caption;
  }
  if (cloudReady() && typeof PedagiaCloud.upsertImageMeta === 'function') {
    try {
      await PedagiaCloud.upsertImageMeta(entry);
    } catch (e) {
      console.warn('upsertImageMeta', entry.imageId, e);
    }
  }
  syncImageThumbMeta(entry.imageId);
  syncMidiaCardMeta(entry.imageId);
  return entry;
}

function syncImageThumbMeta(imageId) {
  const entry = getImageCatalogEntry(imageId);
  const card = document.getElementById('imgi-' + imageId);
  if (!entry || !card) return;
  const srcEl = card.querySelector('.img-thumb-src');
  if (srcEl && entry.src) {
    srcEl.textContent = entry.src.slice(0, 38);
    srcEl.title = entry.src;
  }
  const nameBtn = card.querySelector('.img-name-btn');
  if (nameBtn) {
    nameBtn.textContent = entry.cloudSaved ? '✓ Na nuvem' : (entry.title ? '✏️ Renomear' : '✏️ Nomear');
    nameBtn.classList.toggle('ready', !!entry.cloudSaved);
  }
  if (entry.cloudSaved) card.classList.add('cloud-ok');
}

function openImageNameModal(imageId) {
  const entry = getCloudImageEntry(imageId) || getImageCatalogEntry(imageId);
  if (!entry) return;
  _modalImageId = imageId;
  const modal = document.getElementById('img-name-modal');
  const prev = document.getElementById('img-modal-preview');
  const titleIn = document.getElementById('img-modal-title');
  const srcIn = document.getElementById('img-modal-source');
  const desc = document.getElementById('img-modal-desc');
  if (!modal || !prev) return;
  prev.src = entry.previewUrl || entry.dataUri || '';
  if (titleIn) titleIn.value = entry.title || entry.description?.slice(0, 80) || '';
  if (srcIn) srcIn.value = entry.sourceText || entry.src || entry.caption || '';
  if (desc) {
    desc.textContent = entry.description
      ? entry.description
      : (entry.segmented ? '' : 'A IA está analisando a figura e a fonte…');
  }
  modal.style.display = '';
  modal.setAttribute('aria-hidden', 'false');
}

function closeImageNameModal() {
  _modalImageId = null;
  const modal = document.getElementById('img-name-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function confirmImageCatalogEntry() {
  const imageId = _modalImageId;
  if (!imageId) return;
  const entry = getImageCatalogEntry(imageId);
  if (!entry) return;
  const titleIn = document.getElementById('img-modal-title');
  const srcIn = document.getElementById('img-modal-source');
  entry.title = (titleIn?.value || '').trim() || entry.title || `Imagem p.${entry.pageNumber || '?'}`;
  let src = (srcIn?.value || '').trim();
  if (src && !/^fonte:/i.test(src)) src = `Fonte: ${src}`;
  entry.sourceText = src;
  entry.src = src;
  entry.caption = src;

  if (!getImageB64(entry) && !entry.storagePath) {
    toast('Imagem sem dados — extraia de novo ou atualize a galeria da nuvem.', 'err');
    return;
  }

  if (cloudReady()) {
    try {
      if (!entry.storagePath && getImageB64(entry)) {
        await PedagiaCloud.uploadCatalogImage(entry);
      }
      entry.cloudSaved = true;
    } catch (e) {
      toast('Falha ao enviar imagem: ' + e.message, 'err', 5000);
      return;
    }
  } else {
    toast('Faça login para salvar imagens na nuvem (Word/PDF).', 'err', 5000);
    return;
  }

  await persistChapterImageToApi(entry);
  syncImageThumbMeta(imageId);
  closeImageNameModal();
  scheduleSaveBuilder();
  refreshMidiasPage();
  toast('Imagem salva na nuvem — pronta para o Word.', 'ok', 4000);
}

async function persistChapterImageToApi(entry) {
  if (!entry?.chapterId || !currentSession?.access_token) return;
  try {
    await fetch('/api/material/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + currentSession.access_token,
      },
      body: JSON.stringify({
        chapterId: entry.chapterId,
        imageId: entry.imageId,
        pageNumber: entry.pageNumber || entry.pageNum,
        storagePath: entry.storagePath,
        title: entry.title,
        sourceText: entry.sourceText || entry.src,
        description: entry.description,
        imageType: entry.type,
        usefulnessScore: entry.usefulnessScore,
        recommendedForQuestion: entry.recommendedForQuestion,
        isFullPage: entry.isFullPage,
      }),
    });
  } catch (e) {
    console.warn('persistChapterImage', e);
  }
}

async function fetchUrlToB64(url) {
  if (!url) return '';
  if (String(url).startsWith('data:')) return cleanB64(url);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(cleanB64(fr.result));
      fr.onerror = () => reject(fr.error || new Error('Falha ao ler imagem'));
      fr.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('fetchUrlToB64:', e);
    return '';
  }
}

async function resolveImageB64ForExport(img) {
  if (!img) return '';
  let b64 = getImageB64(img);
  if (b64) return b64;
  if (cloudReady() && img.storagePath) {
    b64 = await PedagiaCloud.fetchImageB64(img);
    if (b64) { img.base64 = cleanB64(b64); return img.base64; }
  }
  const url = img.previewUrl || img.dataUri || img.dataUrl || '';
  if (url) {
    b64 = await fetchUrlToB64(url);
    if (b64) img.base64 = b64;
  }
  return b64 || '';
}

async function ensureExamImagesResolved() {
  const usedIds = new Set(
    getSelectedImageBlocks().map(b => b.imageId).filter(Boolean),
  );
  const toResolve = usedIds.size
    ? st.imageCatalog.filter(i => usedIds.has(i.imageId))
    : st.imageCatalog;

  if (cloudReady()) {
    for (const img of toResolve) {
      await PedagiaCloud.hydrateCatalogEntry(img);
      if (!getImageB64(img) && img.storagePath) {
        try { await PedagiaCloud.fetchImageB64(img); } catch (e) { console.warn('fetch', img.imageId, e); }
      }
      if (!img.storagePath && getImageB64(img)) {
        try {
          await PedagiaCloud.uploadCatalogImage(img);
          img.cloudSaved = true;
        } catch (e) {
          console.warn('upload export', img.imageId, e);
        }
      }
    }
  }
  for (const img of toResolve) await resolveImageB64ForExport(img);
  for (const block of st.imageQuestionBlocks) {
    if (!block.selected) continue;
    const img = resolveBlockImage(block);
    const b64 = await resolveImageB64ForExport(img);
    if (b64) {
      const uri = imgDataUriFromB64(b64);
      block.image = {
        ...(block.image || {}),
        ...img,
        base64: b64,
        dataUri: uri,
        previewUrl: uri,
        dataUrl: uri,
      };
      const ci = st.imageCatalog.findIndex(i => i.imageId === block.imageId);
      if (ci >= 0) {
        st.imageCatalog[ci] = { ...st.imageCatalog[ci], base64: b64, dataUri: uri, previewUrl: uri, dataUrl: uri };
      }
    }
  }
  const core = getCore();
  if (core?.embedCatalogDataUris) core.embedCatalogDataUris(st.imageCatalog);
}

function getImageCatalogEntry(imageId) {
  return st.imageCatalog.find(i => i.imageId === imageId)
    || st.extractedImages.find(i => i.imageId === imageId);
}

function getBlockByImageId(imageId) {
  return st.imageQuestionBlocks.find(b => b.imageId === imageId);
}

function upsertImageBlock(block) {
  const i = st.imageQuestionBlocks.findIndex(b => b.imageId === block.imageId);
  if (i >= 0) st.imageQuestionBlocks[i] = block;
  else st.imageQuestionBlocks.push(block);
}

function getSelectedImageBlocks() {
  return st.imageQuestionBlocks.filter(b => b.selected);
}

function imageHasBinary(img) {
  return !!(img?.base64 || img?.dataUri || img?.previewUrl || img?.dataUrl || img?.storagePath);
}

async function ensureImageB64(img) {
  if (!img) return '';
  let b64 = getImageB64(img);
  if (b64) return b64;
  if (cloudReady() && img.storagePath) {
    try {
      b64 = await PedagiaCloud.fetchImageB64(img);
      if (b64) {
        img.base64 = cleanB64(b64);
        return img.base64;
      }
    } catch (e) {
      console.warn('fetchImageB64', img.imageId, e);
    }
  }
  if (img.storagePath && currentSession?.access_token) {
    try {
      const resp = await fetch('/api/storage-image-b64', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + currentSession.access_token,
        },
        body: JSON.stringify({ storagePath: img.storagePath }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.base64) {
        img.base64 = cleanB64(data.base64);
        if (data.mime) img.mime = data.mime;
        return img.base64;
      }
    } catch (e) {
      console.warn('storage-image-b64', img.imageId, e);
    }
  }
  const url = img.previewUrl || img.dataUri || img.dataUrl || '';
  if (url) {
    try {
      b64 = await fetchUrlToB64(url);
      if (b64) {
        img.base64 = cleanB64(b64);
        return img.base64;
      }
    } catch (e) {
      console.warn('fetchUrlToB64', img.imageId, e);
    }
  }
  return '';
}

function getImageB64(img) {
  if (!img) return '';
  if (img.base64) return cleanB64(img.base64);
  const uri = img.dataUri || img.previewUrl || img.dataUrl || '';
  return uri.includes(',') ? uri.split(',')[1] : '';
}

function statementHasImgPlaceholder(text) {
  return /\[\s*imagem|imagem\s*\d+|^\[IMAGEM\]/i.test(String(text || ''));
}

function validateProvaTextNoImageMarkers() {
  const issues = [];
  for (const line of (st.provaText || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (isImgMarker(t) || isStandaloneImgMarker(t)) {
      issues.push('Remova marcadores [IMAGEM] do texto — use blocos imagem+questão na galeria.');
      break;
    }
    if (statementHasImgPlaceholder(t)) {
      issues.push('Texto da prova contém placeholder de imagem. Use os blocos da galeria.');
      break;
    }
  }
  return issues;
}

function validateSelectedImageBlocks(blocks) {
  const issues = [];
  for (const block of blocks) {
    if (!block.imageId) { issues.push('Bloco sem imageId.'); continue; }
    const img = block.image;
    const pg = img?.pageNumber || img?.pageNum || '?';
    if (!imageHasBinary(img)) issues.push(`Bloco p.${pg}: imagem ausente ou inválida.`);
    if (!block.question?.statement?.trim()) issues.push(`Bloco p.${pg}: sem questão.`);
    else if (statementHasImgPlaceholder(block.question.statement)) {
      issues.push(`Bloco p.${pg}: enunciado não pode conter placeholder de imagem.`);
    }
    const alts = block.question?.alternatives || [];
    if (alts.length !== 5) issues.push(`Bloco p.${pg}: precisa de 5 alternativas.`);
  }
  return issues;
}

function resolveBlockImage(block) {
  const cat = getImageCatalogEntry(block?.imageId);
  const blk = block?.image;
  if (!blk && !cat) return {};
  if (!blk) return { ...cat };
  if (!cat) return { ...blk };
  return { ...cat, ...blk, base64: getImageB64(blk) || getImageB64(cat) || blk.base64 || cat.base64 };
}

function blockToExamQuestion(block, number) {
  const img = resolveBlockImage(block);
  const b64 = getImageB64(img);
  return {
    number,
    statementParts: [block.question.statement.trim()],
    image: (b64 || imageHasBinary(img))
      ? { ...img, base64: b64 || img.base64, w: img.w, h: img.h }
      : null,
    imageRequired: true,
    alternatives: (block.question.alternatives || []).map(a => ({
      letter: String(a.letter).toLowerCase(),
      text: a.text,
    })),
    answerLines: 0,
    fromBlock: true,
    blockId: block.blockId,
  };
}

let _examPreviewTimer = null;

function syncProvaStateFromUI() {
  const pt = document.getElementById('prova-text');
  if (pt) st.provaText = pt.value;
  const gt = document.getElementById('gab-text');
  if (gt) st.gabText = gt.value;
}

function canPreviewExam() {
  syncProvaStateFromUI();
  if (st.provaText?.trim()) return true;
  return getSelectedImageBlocks().some(b => b.question?.statement?.trim());
}

function scheduleExamPreview() {
  clearTimeout(_examPreviewTimer);
  _examPreviewTimer = setTimeout(() => refreshExamPreview().catch(() => {}), 400);
}

function onProvaTextEdit() {
  syncProvaStateFromUI();
  scheduleExamPreview();
}

function updatePreviewStatus(issues, questionCount) {
  const msg = issues.length
    ? `⚠ ${issues.length} aviso(s)`
    : `${questionCount} questão(ões)`;
  for (const id of ['preview-status', 'form-preview-status']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = msg;
    el.style.color = issues.length ? 'var(--R)' : 'var(--G)';
  }
}

async function refreshExamPreview() {
  renderExamVisualBuilder();
  const hasPlan =
    st.imageQuestionBlocks.some((b) => b.question?.statement) || st.provaText?.trim() || st.numQ > 0;
  if (!hasPlan && !canPreviewExam()) return;

  syncProvaStateFromUI();
  if (canPreviewExam()) {
    await ensureExamImagesResolved();
  }
  const { exam, questions, issues } = getExamBuildResult();
  const core = getCore();
  let html = '<p style="padding:16px;font-family:sans-serif;color:#666">Monte questões com figuras ou gere a prova para ver o preview completo.</p>';
  if (core && exam && (exam.questions?.length || canPreviewExam())) {
    await core.resolveExamModelImages(exam, st.imageCatalog, resolveImageB64ForCore);
    if (core.embedCatalogDataUris) core.embedCatalogDataUris(st.imageCatalog);
    const headerImageUrl = await getTemplateHeaderPreviewDataUrl();
    html = core.renderExamHtml(exam, st.imageCatalog, { headerImageUrl });
  } else if (questions.length) {
    html = await buildExamPreviewHtml(questions);
  }
  for (const id of ['exam-preview-iframe', 'form-preview-iframe']) {
    const iframe = document.getElementById(id);
    if (iframe) iframe.srcdoc = html;
  }
  updatePreviewStatus(issues, questions.length);
}

function buildExamQuestions() {
  syncProvaStateFromUI();
  const core = getCore();
  if (core) {
    const exam = core.buildExamModel({
      provaText: st.provaText,
      gabText: st.gabText,
      metadata: getExamMetadata(),
      header: getCab(),
      imageCatalog: st.imageCatalog,
      imageQuestionBlocks: st.imageQuestionBlocks,
    });
    st.examModel = exam;
    const issues = core.validateExamModel(exam).map(i => i.message);
    issues.unshift(...validateProvaTextNoImageMarkers(), ...validateSelectedImageBlocks(getSelectedImageBlocks()));
    return { exam, questions: exam.questions, issues };
  }
  const textQs = parseProvaToStructured();
  const markerIssues = validateProvaTextNoImageMarkers();
  const selected = getSelectedImageBlocks();
  const blockIssues = validateSelectedImageBlocks(selected);
  const structIssues = validateExam(textQs);
  const blockQs = selected.map((b, i) => blockToExamQuestion(b, textQs.length + i + 1));
  const merged = [...textQs, ...blockQs].map((q, i) => ({ ...q, number: i + 1 }));
  return {
    questions: merged,
    issues: [...markerIssues, ...blockIssues, ...structIssues],
  };
}

function syncBlockCardUI(imageId) {
  const ui = typeof findSuggestUi === 'function' ? findSuggestUi(imageId) : null;
  const el = ui?.card
    || document.querySelector(`[data-cloud-id="${imageId}"]`)
    || document.querySelector(`[data-image-id="${imageId}"]`);
  const block = getBlockByImageId(imageId);
  if (!el) return;
  const ready = !!(block?.question?.statement);
  el.classList.toggle('block-ready', ready);
  el.classList.toggle('on', !!(block?.selected));
}

function formatBlockPreview(block) {
  const q = block.question;
  const alts = (q.alternatives || []).map(a => `${a.letter}) ${a.text}`).join('\n');
  return `${q.statement}\n\n${alts}\n\nGabarito: ${q.correctAnswer}`;
}

// ── Builder: recorte manual pelo professor (sem IA de detecção) ───────
let _cropPageNum = 0;
let _cropSourceCanvas = null;
let _cropScale = 1;
let _cropSel = { x: 0, y: 0, w: 0, h: 0, dragging: false, startX: 0, startY: 0 };
let _cropEventsBound = false;

function updateCropGalleryCount() {
  const n = st.imageCatalog.length;
  const label = n ? `(${n})` : '';
  for (const id of ['img-crop-count', 'bd-crop-count']) {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  }
}

function buildCropThumbCardHtml(entry) {
  const pageNum = entry.pageNumber || entry.pageNum || '?';
  const imageId = entry.imageId;
  const srcHint = entry.src || entry.caption || '';
  return `
        <div class="img-thumb" id="imgi-${imageId}" data-image-id="${imageId}" data-idx="${entry.idx}" onclick="togImgBlockCard('${imageId}')" style="display:flex;flex-direction:column">
          <img src="${entry.previewUrl}" alt="Recorte p.${pageNum}" loading="lazy" style="flex:1">
          <div class="img-block-badge">Recorte manual — toque para incluir na prova</div>
          <div class="img-thumb-foot">
            <span class="img-thumb-pg">p.${pageNum}</span>
            <span class="img-thumb-src" title="${escHtml(srcHint)}">${srcHint ? escHtml(srcHint.slice(0, 38)) : ''}</span>
            <span class="img-thumb-chk"></span>
          </div>
          <button type="button" class="img-name-btn" onclick="event.stopPropagation();openImageNameModal('${imageId}')">✏️ Nomear</button>
          <button class="img-save-builder-btn" onclick="event.stopPropagation();saveImageToBuilder('${imageId}')">💾 Builder</button>
          <button class="img-suggest-btn" id="sugbtn-${imageId}" onclick="event.stopPropagation();suggestQuestionForImage('${imageId}')">💡 Sugerir questão</button>
          <div class="img-suggest-box" id="sugbox-${imageId}"></div>
        </div>`;
}

function appendCropCardToGallery(entry, galleryIds) {
  if (!entry) return;
  const ids = galleryIds || ['img-gallery', 'bd-img-gallery'];
  for (const gid of ids) {
    const gallery = document.getElementById(gid);
    if (!gallery) continue;
    const empty = gallery.querySelector('.img-crops-empty');
    if (empty) empty.remove();
    gallery.insertAdjacentHTML('beforeend', buildCropThumbCardHtml(entry));
  }
  updateCropGalleryCount();
  updateBlockSelInfo();
  builderRenderBdCropGallery();
  scheduleSaveBuilder();
}

function cropCanvasPoint(ev) {
  const canvas = document.getElementById('crop-canvas');
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const cx = ((ev.clientX ?? ev.touches?.[0]?.clientX ?? 0) - rect.left) * (canvas.width / rect.width);
  const cy = ((ev.clientY ?? ev.touches?.[0]?.clientY ?? 0) - rect.top) * (canvas.height / rect.height);
  return {
    x: Math.max(0, Math.min(canvas.width, cx)),
    y: Math.max(0, Math.min(canvas.height, cy)),
  };
}

function redrawCropCanvas() {
  const canvas = document.getElementById('crop-canvas');
  if (!canvas || !_cropSourceCanvas) return;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(_cropSourceCanvas, 0, 0, canvas.width, canvas.height);
  const { x, y, w, h } = _cropSel;
  if (w < 6 || h < 6) return;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.clearRect(x, y, w, h);
  ctx.drawImage(
    _cropSourceCanvas,
    x / _cropScale, y / _cropScale, w / _cropScale, h / _cropScale,
    x, y, w, h,
  );
  ctx.strokeStyle = '#FFD200';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function bindCropCanvasEvents() {
  if (_cropEventsBound) return;
  const canvas = document.getElementById('crop-canvas');
  if (!canvas) return;
  _cropEventsBound = true;

  const start = (ev) => {
    ev.preventDefault();
    const p = cropCanvasPoint(ev);
    _cropSel.dragging = true;
    _cropSel.startX = p.x;
    _cropSel.startY = p.y;
    _cropSel.x = p.x;
    _cropSel.y = p.y;
    _cropSel.w = 0;
    _cropSel.h = 0;
    redrawCropCanvas();
  };
  const move = (ev) => {
    if (!_cropSel.dragging) return;
    ev.preventDefault();
    const p = cropCanvasPoint(ev);
    _cropSel.x = Math.min(_cropSel.startX, p.x);
    _cropSel.y = Math.min(_cropSel.startY, p.y);
    _cropSel.w = Math.abs(p.x - _cropSel.startX);
    _cropSel.h = Math.abs(p.y - _cropSel.startY);
    redrawCropCanvas();
  };
  const end = (ev) => {
    if (!_cropSel.dragging) return;
    ev.preventDefault();
    _cropSel.dragging = false;
    redrawCropCanvas();
  };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end);
}

function resetCropSelection() {
  _cropSel = { x: 0, y: 0, w: 0, h: 0, dragging: false, startX: 0, startY: 0 };
  redrawCropCanvas();
}

function closeCropBuilder() {
  const modal = document.getElementById('img-crop-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
  _cropSourceCanvas = null;
  resetCropSelection();
}

async function openCropBuilder(pageNum) {
  if (!st.bookPdf) { toast('PDF do livro não carregado.', 'err'); return; }
  const modal = document.getElementById('img-crop-modal');
  const canvas = document.getElementById('crop-canvas');
  const wrap = document.getElementById('crop-stage-wrap');
  const pageLbl = document.getElementById('crop-page-num');
  if (!modal || !canvas || !wrap) return;

  try {
    const pdfPage = await st.bookPdf.getPage(pageNum);
    const SCALE = 2;
    const vp = pdfPage.getViewport({ scale: SCALE });
    _cropSourceCanvas = document.createElement('canvas');
    _cropSourceCanvas.width = Math.round(vp.width);
    _cropSourceCanvas.height = Math.round(vp.height);
    await pdfPage.render({
      canvasContext: _cropSourceCanvas.getContext('2d'),
      viewport: vp,
    }).promise;

    _cropPageNum = pageNum;
    if (pageLbl) pageLbl.textContent = String(pageNum);

    const maxW = Math.min(520, wrap.clientWidth || 520);
    _cropScale = Math.min(1, maxW / _cropSourceCanvas.width);
    canvas.width = Math.round(_cropSourceCanvas.width * _cropScale);
    canvas.height = Math.round(_cropSourceCanvas.height * _cropScale);

    resetCropSelection();
    bindCropCanvasEvents();
    redrawCropCanvas();

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  } catch (e) {
    console.error(e);
    toast('Erro ao abrir página para recorte.', 'err');
  }
}

function confirmCropSelection() {
  if (!_cropSourceCanvas || _cropSel.w < 24 || _cropSel.h < 24) {
    toast('Arraste um retângulo maior sobre a figura.', 'err');
    return;
  }
  const fx = _cropSel.x / _cropScale;
  const fy = _cropSel.y / _cropScale;
  const fw = _cropSel.w / _cropScale;
  const fh = _cropSel.h / _cropScale;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(fw));
  out.height = Math.max(1, Math.round(fh));
  out.getContext('2d').drawImage(_cropSourceCanvas, fx, fy, fw, fh, 0, 0, out.width, out.height);
  const dataUrl = out.toDataURL('image/jpeg', 0.9);
  const pageSrcs = st._pageSources[_cropPageNum] || [];
  const entry = registerCatalogImage({
    dataUrl,
    base64: dataUrl.split(',')[1],
    w: out.width,
    h: out.height,
    manualCrop: true,
  }, _cropPageNum, pageSrcs[0] || '');
  appendCropCardToGallery(entry);
  closeCropBuilder();
  toast('Figura adicionada ao builder. Use «Sugerir questão».', 'ok', 4000);
}

// ── Galeria: páginas para recorte manual + figuras já recortadas ─────
async function renderPageThumbnails(pages, opts = {}) {
  if (!st.bookPdf || pages.length === 0) return;
  if (st.imgRendering) return;
  st.imgRendering = true;

  const pageGridId = opts.pageGridId || 'img-page-grid';
  const galleryId = opts.galleryId || 'img-gallery';
  const statusId = opts.statusId || 'img-status';
  const sectionId = opts.sectionId || 'img-section';
  const scrollTarget = opts.scroll !== false;

  const pageGrid = document.getElementById(pageGridId);
  const gallery = document.getElementById(galleryId);
  const imgSec = sectionId ? document.getElementById(sectionId) : null;
  const status = document.getElementById(statusId);

  if (!pageGrid) {
    st.imgRendering = false;
    return;
  }

  if (imgSec) imgSec.style.display = '';
  pageGrid.innerHTML = `<div class="img-spin" style="grid-column:1/-1;padding:20px;text-align:center">⏳ Carregando páginas...</div>`;
  if (gallery) {
    gallery.innerHTML = st.imageCatalog.length
      ? st.imageCatalog.map((e) => buildCropThumbCardHtml(e)).join('')
      : '<div class="img-crops-empty img-no-img" style="grid-column:1/-1">Nenhum recorte ainda — use «Recortar figura» em uma página.</div>';
  }
  updateCropGalleryCount();

  if (status) status.textContent = `Abrindo ${pages.length} página(s) para recorte manual...`;

  pageGrid.innerHTML = '';
  st._pageSources = st._pageSources || {};

  for (const pageNum of pages) {
    let pageThumb = '';
    try {
      const pdfPage = await st.bookPdf.getPage(pageNum);
      try {
        const ct = await pdfPage.getTextContent();
        st._pageSources[pageNum] = extractSources(ct.items.map((i) => i.str).join(' '));
      } catch {}
      const bVp = pdfPage.getViewport({ scale: 1.0 });
      const tVp = pdfPage.getViewport({ scale: Math.min(300 / bVp.width, 1.4) });
      const tC = document.createElement('canvas');
      tC.width = Math.round(tVp.width);
      tC.height = Math.round(tVp.height);
      await pdfPage.render({ canvasContext: tC.getContext('2d'), viewport: tVp }).promise;
      pageThumb = tC.toDataURL('image/jpeg', 0.72);
    } catch {}

    pageGrid.insertAdjacentHTML('beforeend', `
      <div class="page-crop-card" id="page-card-${pageNum}">
        <div class="page-crop-label">p.${pageNum}</div>
        <img src="${pageThumb || ''}" alt="Página ${pageNum}" class="page-crop-preview" loading="lazy">
        <button type="button" class="btn-crop-open" onclick="openCropBuilder(${pageNum})">✂ Recortar figura</button>
      </div>`);
  }

  if (status) {
    status.textContent = `${pages.length} página(s) — toque em Recortar figura em cada miniatura`;
  }

  const qRow = document.getElementById('img-q-row');
  if (qRow && !opts.builderMode) qRow.style.display = 'none';

  updateBlockSelInfo();
  st.imgRendering = false;
  if (scrollTarget && imgSec) {
    setTimeout(() => imgSec.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200);
  }
  scheduleSaveBuilder();
  scheduleExamPreview();
}

function builderRenderBdCropGallery() {
  const gallery = document.getElementById('bd-img-gallery');
  if (!gallery) return;
  const pages = new Set([...(st.selectedPages || []), ...(st.builderConfirmedPageList || [])]);
  const items = (st.imageCatalog || []).filter((e) => {
    const p = e.pageNumber || e.pageNum;
    return !pages.size || pages.has(p);
  });
  gallery.innerHTML = items.length
    ? items.map((e) => buildCropThumbCardHtml(e)).join('')
    : '<div class="img-crops-empty img-no-img" style="grid-column:1/-1">Nenhum recorte nestas páginas ainda.</div>';
}

async function builderLoadCropPages() {
  try {
    await ensureMaterialPdfLoaded();
  } catch (e) {
    toast(e.message || 'Erro ao carregar PDF', 'err', 6000);
    return;
  }
  const pages = [...(st.selectedPages || [])].sort((a, b) => a - b);
  if (!pages.length) {
    toast('Marque páginas (intervalo ou chips) antes de recortar.', 'err');
    return;
  }
  const sec = document.getElementById('bd-crop-section');
  if (sec) sec.style.display = '';
  await renderPageThumbnails(pages, {
    pageGridId: 'bd-img-page-grid',
    galleryId: 'bd-img-gallery',
    statusId: 'bd-crop-status',
    sectionId: 'bd-crop-section',
    scroll: false,
    builderMode: true,
  });
  builderRenderBdCropGallery();
}

function togImgBlockCard(imageId) {
  const block = getBlockByImageId(imageId);
  if (!block?.question?.statement) {
    toast('Clique em "Sugerir questão" nesta imagem antes de incluí-la na prova.', 'ok', 4500);
    return;
  }
  block.selected = !block.selected;
  syncBlockCardUI(imageId);
  updateBlockSelInfo();
  scheduleSaveBuilder();
  scheduleExamPreview();
}

function humanizeIaApiError(message) {
  const msg = String(message || '');
  if (/KIE_API_KEY|kie\.ai\/api-key/i.test(msg)) return msg;
  if (/Kie AI.*401|chave inválida.*Kie/i.test(msg)) {
    return 'Chave Kie AI inválida. Configure KIE_API_KEY no .env (kie.ai/api-key) e reinicie npm run dev.';
  }
  if (/Kie AI.*402|créditos insuficientes.*Kie/i.test(msg)) {
    return 'Sem créditos na Kie AI. Recarregue em kie.ai.';
  }
  if (/OPENROUTER_API_KEY|openrouter\.ai\/keys/i.test(msg)) return msg;
  if (/user not found/i.test(msg) || /OpenRouter.*401/i.test(msg)) {
    return (
      'Chave OpenRouter inválida no servidor. ' +
      'Configure OPENROUTER_API_KEY no .env (openrouter.ai/keys) e reinicie o npm run dev.'
    );
  }
  if (/insufficient|crédito|credit/i.test(msg)) {
    if (/Kie/i.test(msg)) return 'Sem créditos na Kie AI. Recarregue em kie.ai.';
    return 'Sem créditos na OpenRouter. Adicione saldo em openrouter.ai/settings/credits.';
  }
  return msg.replace(/^(OpenRouter|Kie AI):\s*/i, '').slice(0, 280) || 'Erro ao chamar a IA.';
}

function findSuggestUi(imageId) {
  const esc = (typeof CSS !== 'undefined' && CSS.escape)
    ? CSS.escape(imageId)
    : String(imageId).replace(/"/g, '\\"');
  const cards = document.querySelectorAll(
    `[data-cloud-id="${esc}"], [data-image-id="${esc}"], #imgi-${esc}`,
  );
  for (const card of cards) {
    const view = card.closest('[id^="view-"]');
    if (view && view.style.display === 'none') continue;
    const btn = card.querySelector('.img-suggest-btn');
    const box = card.querySelector('.img-suggest-box');
    if (btn && box) return { btn, box, card };
  }
  if (cards.length) {
    const card = cards[0];
    return {
      btn: card.querySelector('.img-suggest-btn'),
      box: card.querySelector('.img-suggest-box'),
      card,
    };
  }
  return {
    btn: document.getElementById('sugbtn-' + imageId),
    box: document.getElementById('sugbox-' + imageId),
    card: null,
  };
}

async function fetchAndBuildImageQuestion(imageId) {
  if (!(await ensureFreshSession())) {
    throw new Error('Faça login para usar a IA.');
  }
  let image = getCloudImageEntry(imageId);
  if (!image) {
    const cloud = (st.cloudImageIndex || []).find((i) => i.imageId === imageId);
    if (cloud) image = cloud;
  }
  if (!image) throw new Error('Imagem não encontrada. Atualize em Minhas mídias.');
  if (!getImageCatalogEntry(imageId)) {
    await useCloudImageInBuilder(imageId, { silent: true });
    image = getCloudImageEntry(imageId) || image;
  }
  if (!(image.sourceText || image.caption || image.src || '').trim()) {
    const entry = getCloudImageEntry(imageId) || image;
    if (entry && !entry.segmented) await segmentImageWithAI(entry);
    image = getCloudImageEntry(imageId) || image;
  }
  const b64 = await ensureImageB64(image);
  if (!b64) {
    throw new Error('Não foi possível carregar a imagem. Atualize a lista ou envie de novo.');
  }
  builderSyncFields();
  const tok = currentSession?.access_token || null;
  const resp = await fetch('/api/sugerir-questao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: JSON.stringify({
      imageId,
      imageBase64: b64,
      storagePath: image.storagePath || '',
      srcHint: image.sourceText || image.caption || image.src || '',
      caption: image.sourceText || image.caption || '',
      pageNumber: image.pageNumber || image.pageNum,
      disc: v('f-disc') || v('bd-disc'),
      serie: v('f-serie') || v('bd-serie'),
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.question) throw new Error(data.error || 'Erro ao gerar exercício');
  if (data.imageId !== imageId) throw new Error('A IA retornou uma questão para outra imagem');

  const block = {
    blockId: `block_${imageId}_${Date.now()}`,
    selected: false,
    imageId,
    image: {
      imageId,
      previewUrl: image.previewUrl,
      dataUri: image.dataUri,
      base64: b64,
      caption: image.caption,
      pageNumber: image.pageNumber || image.pageNum,
      w: image.w,
      h: image.h,
    },
    question: data.question,
  };
  upsertImageBlock(block);
  const imgEntry = getImageCatalogEntry(imageId);
  if (imgEntry) imgEntry.savedToBuilder = true;
  return { block, image, question: data.question };
}

async function suggestQuestionForImage(imageId) {
  const { btn, box } = findSuggestUi(imageId);
  if (!btn || !box) {
    toast('Não foi possível abrir o painel de sugestão nesta tela.', 'err', 5000);
    return;
  }
  if (box.classList.contains('show') && box.dataset.loaded === '1') {
    box.classList.toggle('show');
    return;
  }
  btn.disabled = true;
  btn.textContent = '⏳ Analisando...';
  box.innerHTML = '';
  box.classList.remove('show');
  try {
    const { block, image } = await fetchAndBuildImageQuestion(imageId);
    const preview = formatBlockPreview(block);
    box.innerHTML = escHtml(preview)
      .replace(/\n/g, '<br>')
      + `<br><span class="img-suggest-gab">✓ Gabarito: ${escHtml(block.question.correctAnswer)}</span>`
      + '<br><span style="font-size:9px;color:var(--t3)">Toque no card para marcar e incluir na prova</span>';
    box.dataset.loaded = '1';
    box.classList.add('show');
    btn.textContent = '💡 Esconder sugestão';
    syncBlockCardUI(imageId);
    updateBlockSelInfo();
    await persistSavedExercise(block, image);
    toast('Questão sugerida e salva em Exercícios.', 'ok', 4000);
    scheduleSaveBuilder();
    scheduleExamPreview();
  } catch (e) {
    const friendly = humanizeIaApiError(e.message);
    box.innerHTML = '<span style="color:var(--R)">Erro: ' + escHtml(friendly) + '</span>';
    box.classList.add('show');
    btn.textContent = '💡 Sugerir questão';
    toast(friendly, 'err', 8000);
  } finally {
    btn.disabled = false;
  }
}

function updateBlockSelInfo() {
  const blocks = getSelectedImageBlocks();
  const ready = st.imageQuestionBlocks.filter(b => b.question?.statement).length;
  const inf = document.getElementById('img-sel-info');
  if (!inf) return;
  if (blocks.length > 0) {
    inf.className = 'img-sel-info has';
    inf.textContent = `✓ ${blocks.length} bloco${blocks.length !== 1 ? 's' : ''} imagem+questão na prova (${ready} prontos na galeria)`;
  } else if (ready > 0) {
    inf.className = 'img-sel-info none';
    inf.textContent = `○ ${ready} bloco${ready !== 1 ? 's' : ''} pronto${ready !== 1 ? 's' : ''} — toque no card para incluir na prova`;
  } else {
    inf.className = 'img-sel-info none';
    inf.textContent = '○ Use Sugerir questão em cada imagem; só blocos marcados entram na prova';
  }
  renderExamVisualBuilder();
}

// Legado — geração principal não envia imagens soltas à IA
function extractPageImages() {
  return [];
}

// ── Prompt 4 blocos — padrão ENEM/vestibular (doc técnico v2) ────────
async function buildPrompt() {
  // Criador Inteligente usa prompt próprio
  if (st.ciMode && st.ciPromptOverride) return { prompt: st.ciPromptOverride, images: [] };

  const disc  = v('f-disc');
  const serie = v('f-serie');
  const tipo  = v('f-tipo') || 'Prova';
  const valor = v('f-valor');
  const bim   = v('f-bimestre') || '1º Bimestre';
  const dif   = { facil:'Fácil', medio:'Médio', dificil:'Difícil', mista:'Variada' }[st.dif];
  const cab   = getCab();
  const src   = document.getElementById('s-livro').classList.contains('on') ? 'livro' : 'desc';

  let contentBlock = '';
  let pageImages   = [];

  if (src === 'livro') {
    const chIdx   = st.selectedChapterIdx;
    const manCap  = v('f-cap-manual');
    const chTitle = chIdx >= 0 ? st.bookChapters[chIdx]?.title : manCap;
    const pages   = [...st.selectedPages].sort((a,b) => a-b);
    const pagesText = await extractSelectedPages();
    pageImages      = extractPageImages(); // síncrono — usa cache da galeria

    // Extrai fontes citadas no próprio texto do livro
    const bookSources = extractSources(pagesText);
    const sourceBlock = bookSources.length
      ? `\nFONTES ORIGINAIS DO MATERIAL (cite EXATAMENTE assim — NUNCA use o nome do arquivo):\n${bookSources.map(s=>'• '+s).join('\n')}\n`
      : '';

    if (!pagesText || pagesText.trim().length < 150) {
      throw new Error(
        'Pouco texto extraído do capítulo. No Material, selecione o capítulo na lista e confira se as páginas estão marcadas (chips verdes).',
      );
    }

    const selectedBlocks = getSelectedImageBlocks().length;
    const imgBlock = selectedBlocks > 0
      ? `Questões com imagem (${selectedBlocks}) já estão no builder — gere só ${Math.max(0, st.numQ - selectedBlocks)} questão(ões) textuais ancoradas no capítulo abaixo.`
      : 'Todas as questões desta geração são textuais (figuras vêm do builder do professor).';

    st.chapterBrief = await analyzeChapterForExam({
      chapterTitle: chTitle,
      pagesText,
      pages,
    });

    const core = getCore();
    if (core?.buildChapterContentBlock) {
      contentBlock = core.buildChapterContentBlock({
        bookFileName: st.bookFileName,
        chapterTitle: chTitle || manCap || 'Capítulo selecionado',
        pages,
        pagesText,
        bookSources,
        imageBlocksNote: imgBlock,
        brief: st.chapterBrief,
      });
    } else {
      contentBlock = `
CONTEÚDO DO CAPÍTULO — ÚNICA FONTE:
Livro: "${st.bookFileName}"
Capítulo: ${chTitle || manCap}
Páginas: ${pages.join(', ')}
${sourceBlock}
--- TEXTO ---
${pagesText.slice(0, 28000)}
--- FIM ---`;
    }
  } else {
    const topicos = v('f-topicos');
    contentBlock = `\nCONTEÚDO / TÓPICOS FORNECIDOS PELO PROFESSOR:\n${topicos}\n`;
  }

  const prompt = `BLOCO 1 — INSTRUÇÃO GERAL
Você é um elaborador especialista de provas no padrão ENEM/vestibular para escolas estaduais brasileiras.
Sua tarefa é gerar questões EXATAMENTE no formato dos exemplos abaixo.
NÃO gere questões com enunciado direto e seco — TODA questão de múltipla escolha precisa de contextualizador.

════════════════════════════════════════════════
BLOCO 2 — EXEMPLOS REAIS DE QUESTÕES CORRETAS
(Padrão da Escola Estadual Rui Barbosa, Cassilândia/MS)
════════════════════════════════════════════════

EXEMPLO 1 — Dado estatístico / tabela:
"Analise a tabela: BRASIL: NÚMERO DE CONFLITOS NO CAMPO (2019) [dado por estado — Pará lidera com 157 ocorrências]
Fonte: CPT, Conflitos no Campo Brasil 2020, p.12.
Com base nos dados, O que revelam sobre a distribuição dos conflitos? Quais as possíveis causas e os principais problemas decorrentes?"
→ Discursiva — resposta mínima 10 linhas. Dado real + fonte + comando com múltiplos eixos.

EXEMPLO 2 — Charge / imagem:
"Observe a charge a seguir: [descrição da crítica à Divisão Internacional do Trabalho]
A ilustração critica a Divisão Internacional do Trabalho. Além disso, é correto assinalar que ela retrata:
a) a igualdade de condições entre países desenvolvidos e em desenvolvimento
b) a inserção dos países periféricos como produtores de tecnologia de ponta
c) a dependência tecnológica dos países ricos em relação aos periféricos
d) a superação completa das relações coloniais na economia globalizada
e) dois mundos distintos: produtor de matéria-prima e fornecedor de tecnologia"
→ Origem citada + imagem descrita + comando + alternativas em MINÚSCULA.

EXEMPLO 3 — Gráfico / série histórica:
"Observe o gráfico: 'Evolução do rendimento médio mensal per capita por cor ou raça — 2012 a 2021'
Fonte: IBGE, Síntese de Indicadores Sociais, 2022, p.51.
Assinale a alternativa que apresenta interpretação CORRETA dos dados:
a) A desigualdade racial de renda foi completamente eliminada no período analisado
b) O rendimento de brancos e negros convergiu para a mesma faixa em 2021
c) A pandemia de 2020 ampliou as desigualdades já existentes entre os grupos raciais
d) O crescimento do rendimento negro superou o branco em todos os anos da série
e) Não há relação estatisticamente relevante entre cor/raça e rendimento no Brasil"
→ Título completo + fonte precisa + alternativa correta exige interpretação — distratores com erro sutil e plausível.

EXEMPLO 4 — Texto-base, interpretação crítica:
"O processo de descolonização na África e Ásia não significou apenas independência formal, mas a redefinição de relações políticas, econômicas e culturais em escala mundial.
Assinale a alternativa que melhor expressa uma INTERPRETAÇÃO CRÍTICA:
a) A descolonização foi pacífica e consensual em todos os países africanos
b) A independência formal garantiu plena soberania econômica aos ex-colonizados
c) As antigas metrópoles perderam completamente sua influência nos territórios independentes
d) A descolonização representou ruptura total com todas as estruturas coloniais de poder
e) A independência política coexistiu com formas renovadas de dependência econômica e cultural"
→ Texto-base + fonte + alternativa correta reconhece contradições — nunca simplifica.

EXEMPLO 5 — Discursiva com fonte dupla:
"[Trecho de artigo científico sobre urbanização] + [Charge descrita sobre migração campo-cidade]
Considerando os dois pontos de vista apresentados, produza um texto de pelo menos dez linhas analisando e comparando os aspectos do quadro apresentado.
Critérios: argumento central claro, citação das duas fontes, perspectiva crítica desenvolvida."
→ Duas fontes + comando de produção textual + critérios explícitos de avaliação.

════════════════════════════════════════════════
BLOCO 3 — REGRAS OBRIGATÓRIAS DO FORMATO
════════════════════════════════════════════════

REGRAS ABSOLUTAS — NUNCA VIOLAR:
0. FORMATAÇÃO: TEXTO SIMPLES APENAS — JAMAIS use markdown.
   Proibido: **, ***, *, ##, ---, >, aspas invertidas, _underline_, [links], traços triplos.
   O texto vai direto para o PDF — qualquer símbolo markdown aparece como lixo visual.

1. CONTEXTUALIZADOR: OBRIGATÓRIO em TODA questão de múltipla escolha.
   Tipos aceitos: trecho de texto, tabela, gráfico, charge descrita, mapa descrito, dado estatístico, citação.

2. FONTE: EXCLUSIVAMENTE o que está impresso no próprio material ou na imagem — NUNCA inventar.
   Com fonte impressa no material ou visível na imagem (ex: "Fonte: IBGE, 2022") → usar EXATAMENTE como está.
   Sem fonte visível/impressa → NÃO incluir linha de Fonte. JAMAIS citar nome de arquivo PDF ou inventar autor/editora/página.

3. COMANDO: em negrito, após o contextualizador.
   Verbos corretos: Assinale / Analise / Identifique / Considere / Com base em / De acordo com / Observe e responda.

4. ALTERNATIVAS: SEMPRE letras MINÚSCULAS — a) b) c) d) e)
   NUNCA usar A) B) C) D) E) — somente minúsculas.
   Distratores plausíveis, nunca absurdos.
   Tipos de distrator aceitos: inversão causa/consequência · generalização indevida (sempre/nunca/todos) · verdade parcial que omite contradição.

5. ALTERNATIVA CORRETA: aquela que reconhece complexidade e contradições — nunca a mais simples nem a mais radical.

6. VARIEDADE: não repetir o mesmo tipo de contextualizador.
   Distribuição recomendada (prova de 10 questões): 2 texto, 2 tabela/dado, 2 gráfico, 1 charge, 1 mapa descrito, 1 discursiva, 1 associação de colunas.

7. QUESTÕES DISCURSIVAS: sempre com fonte dupla (texto + imagem/dado). Indicar número mínimo de linhas e critérios de resposta.

8. NUMERAÇÃO: 1. 2. 3. etc. (com ponto, não parêntese).

9. FRASE MOTIVACIONAL: obrigatória no final da prova (antes do gabarito), em itálico entre asteriscos (*texto*).

10. IMAGENS: NUNCA escreva [IMAGEM], [Imagem 1] ou placeholder de imagem. Questões visuais do livro são inseridas pelo sistema a partir dos blocos do professor.

════════════════════════════════════════════════
BLOCO 4 — INSTRUÇÃO DE GERAÇÃO COM O MATERIAL
════════════════════════════════════════════════

AGORA GERE A PROVA:
Disciplina: ${disc}
Série/Ano: ${serie}
Bimestre: ${bim}
Tipo: ${tipo}${valor ? ` — Valor: ${valor} pontos` : ''}
Número de questões: ${st.numQ}
Dificuldade: ${dif}

DADOS DO PROFESSOR (perfil já salvo — não solicitar novamente):
Escola: ${cab.escola || '(não informado)'}
Cidade: ${cab.cidade || '(não informado)'}
Professor(a): ${cab.prof || '(não informado)'}
${contentBlock}
INSTRUÇÕES FINAIS:
- NÃO inclua cabeçalho — o sistema gera automaticamente.
- NUNCA use markdown: sem **, sem ##, sem ***, sem ---, sem >, sem backticks. Texto simples apenas.
- Após TODAS as questões, escreva EXATAMENTE: ---GABARITO---
- No gabarito: letra correta + justificativa de 2-3 linhas. Fonte APENAS se apareceu na questão — NUNCA inventar.
- Frase motivacional em texto simples (sem asteriscos) antes do ---GABARITO---.
${src === 'livro' ? '- Use SOMENTE o conteúdo extraído acima. Não busque informações externas.' : ''}
- PROIBIDO: [IMAGEM], [Imagem 1], "veja a imagem abaixo" sem imagem real — o sistema anexa blocos imagem+questão separadamente.`;

  const core = getCore();
  const numTextQ = Math.max(0, st.numQ - getSelectedImageBlocks().length);
  const tplTotal = numTextQ > 0 ? numTextQ : st.numQ;
  const template =
    st.examTemplate ||
    (core?.getAvBgeoTemplate ? core.getAvBgeoTemplate(tplTotal, serie) : null);
  if (core) {
    const textPrompt = core.buildTextExamPrompt({
      metadata: getExamMetadata(),
      contentBlock,
      numTextQuestions: numTextQ,
      template,
      headerHints: getCab(),
      bnccPrefs: getBnccPrefsFromUI(),
    });
    return { prompt: textPrompt, images: [] };
  }
  return { prompt, images: [] };
}

// ══════════════════════════════════════════════
// BUILDER FINAL — montar prova em uma página
// ══════════════════════════════════════════════
function builderSyncFields() {
  const map = [
    ['bd-disc', 'f-disc'],
    ['bd-serie', 'f-serie'],
    ['bd-tipo', 'f-tipo'],
    ['bd-valor', 'f-valor'],
  ];
  map.forEach(([from, to]) => {
    const src = document.getElementById(from);
    const dst = document.getElementById(to);
    if (src && dst) dst.value = src.value;
  });
  const bt = document.getElementById('bd-topicos');
  const ft = document.getElementById('f-topicos');
  if (bt && ft) ft.value = bt.value;
  const n = parseInt(document.getElementById('bd-numq')?.textContent || '10', 10);
  st.numQ = Math.min(30, Math.max(3, n || 10));
  const nv = document.getElementById('nv');
  if (nv) nv.textContent = st.numQ;
}

function builderLoadFields() {
  const map = [
    ['f-disc', 'bd-disc'],
    ['f-serie', 'bd-serie'],
    ['f-tipo', 'bd-tipo'],
    ['f-valor', 'bd-valor'],
  ];
  map.forEach(([from, to]) => {
    const src = document.getElementById(from);
    const dst = document.getElementById(to);
    if (src && dst) dst.value = src.value || dst.value;
  });
  const ft = document.getElementById('f-topicos');
  const bt = document.getElementById('bd-topicos');
  if (ft && bt) bt.value = ft.value || '';
  const bdN = document.getElementById('bd-numq');
  if (bdN) bdN.textContent = String(st.numQ || 10);
}

function builderChNumQ(d) {
  st.numQ = Math.min(30, Math.max(3, (st.numQ || 10) + d));
  const el = document.getElementById('bd-numq');
  if (el) el.textContent = String(st.numQ);
  const nv = document.getElementById('nv');
  if (nv) nv.textContent = st.numQ;
}

function builderInvalidatePagesConfirm() {
  if (!st.builderPagesConfirmed) return;
  st.builderPagesConfirmed = false;
  st.builderConfirmedPageList = [];
  st.builderPool = (st.builderPool || []).filter((p) => p.source !== 'ai');
  builderUpdateQuestoesUI();
  scheduleSaveBuilder();
}

function builderOnTopicosInput() {
  builderSyncFields();
  if (v('bd-topicos').trim()) builderInvalidatePagesConfirm();
}

function builderOnAdaptadaToggle() {
  const cb = document.getElementById('bd-adaptada');
  const notes = document.getElementById('bd-adapt-notas');
  st.builderWantAdapted = !!cb?.checked;
  if (notes) notes.style.display = st.builderWantAdapted ? '' : 'none';
  scheduleSaveBuilder();
}

function builderUpdateQuestoesUI() {
  const gate = document.getElementById('bd-questoes-gate');
  const block = document.getElementById('bd-questoes-block');
  const btnGerar = document.getElementById('bd-btn-gerar');
  const chips = document.getElementById('bd-page-chips');
  const status = document.getElementById('bd-pages-status');
  const btnConfirm = document.getElementById('bd-btn-confirm-pages');
  const btnChange = document.getElementById('bd-btn-change-pages');
  const topicos = v('bd-topicos').trim();
  const confirmed = st.builderPagesConfirmed;

  if (gate) gate.style.display = confirmed ? 'none' : '';
  if (block) block.style.display = confirmed ? '' : 'none';
  if (btnGerar) btnGerar.disabled = !confirmed;
  if (chips) chips.classList.toggle('bd-locked', confirmed && !topicos);
  if (btnConfirm) btnConfirm.style.display = confirmed ? 'none' : '';
  if (btnChange) btnChange.style.display = confirmed ? '' : 'none';

  if (status) {
    if (confirmed) {
      const label = topicos
        ? 'Conteúdo escrito confirmado para a IA.'
        : `Páginas confirmadas: ${(st.builderConfirmedPageList || []).join(', ')}`;
      status.textContent = `✓ ${label}`;
      status.className = 'bd-pages-status bd-pages-ok';
    } else {
      status.textContent = topicos
        ? 'Texto informado — confirme para liberar a geração.'
        : 'Selecione as páginas e toque em Confirmar para a IA gerar questões.';
      status.className = 'bd-pages-status bd-pages-pending';
    }
  }
  builderRenderPool();
}

async function ensureMaterialPdfLoaded() {
  if (st.bookPdf) return true;
  if (!st.materialId) {
    throw new Error('Selecione um material no passo ② (lista de livros).');
  }
  let mat = st.materialsList?.find((m) => m.id === st.materialId);
  if (!mat) {
    await fetchMaterialsList();
    mat = st.materialsList?.find((m) => m.id === st.materialId);
  }
  if (!mat) throw new Error('Material não encontrado. Escolha o livro na lista.');
  st.bookFileName = mat.fileName || st.bookFileName;
  st.bookStoragePath = mat.storagePath || st.bookStoragePath;
  if (mat.totalPages) st.bookTotalPages = mat.totalPages;
  const ok = await loadBookFromStorage();
  if (!ok) {
    throw new Error(
      'PDF do livro não disponível. Abra a aba Material, selecione o livro (ou envie o PDF de novo) e volte ao Montar.',
    );
  }
  return true;
}

async function builderConfirmPages() {
  builderSyncFields();
  const topicos = v('bd-topicos').trim();
  if (topicos) {
    st.builderPagesConfirmed = true;
    st.builderConfirmedPageList = [];
    builderUpdateQuestoesUI();
    toast('Conteúdo confirmado. Agora gere as questões.', 'ok');
    return;
  }
  if (!st.selectedPages?.size) {
    toast('Marque as páginas do livro ou escreva o conteúdo.', 'err', 5000);
    return;
  }
  if (!st.materialId) {
    toast('Selecione um material na lista de livros.', 'err');
    return;
  }
  const btn = document.getElementById('bd-btn-confirm-pages');
  if (btn) { btn.disabled = true; btn.textContent = 'Carregando PDF…'; }
  try {
    await ensureMaterialPdfLoaded();
  } catch (e) {
    toast(e.message || 'Erro ao carregar PDF', 'err', 6000);
    return;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✓ Confirmar páginas para a IA';
    }
  }
  st.builderPagesConfirmed = true;
  st.builderConfirmedPageList = [...st.selectedPages].sort((a, b) => a - b);
  const cropSec = document.getElementById('bd-crop-section');
  if (cropSec) cropSec.style.display = '';
  builderUpdateQuestoesUI();
  builderRenderBdCropGallery();
  scheduleSaveBuilder();
  toast(`${st.builderConfirmedPageList.length} página(s) confirmadas para extração.`, 'ok', 4000);
}

function builderResetPagesConfirm() {
  builderInvalidatePagesConfirm();
  builderUpdateQuestoesUI();
  toast('Altere as páginas e confirme novamente.', 'ok');
}

function builderSetPoolTab(tab) {
  st.builderPoolTab = tab || 'turma';
  document.querySelectorAll('.bd-pool-tab').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.bdPool === st.builderPoolTab);
  });
  builderRenderPool();
}

function builderRenderMaterialSelect() {
  const sel = document.getElementById('bd-material');
  const hint = document.getElementById('bd-material-hint');
  if (!sel) return;
  const items = st.materialsList || [];
  sel.innerHTML = [
    '<option value="">— Escolha um material —</option>',
    ...items.map((m) => {
      const label = escHtml((m.fileName || 'Material').slice(0, 48));
      const pages = m.totalPages ? ` · ${m.totalPages} pág.` : '';
      return `<option value="${escHtml(m.id)}"${m.id === st.materialId ? ' selected' : ''}>${label}${pages}</option>`;
    }),
  ].join('');
  if (hint) {
    if (!items.length) hint.textContent = 'Nenhum PDF na nuvem — envie em Material.';
    else if (st.materialId) {
      const cur = items.find((m) => m.id === st.materialId);
      hint.textContent = cur ? `${cur.fileName} · ${st.bookTotalPages || '?'} páginas` : 'Material ativo';
    } else hint.textContent = 'Selecione o livro para extrair páginas.';
  }
}

function builderRenderHeaderSelect() {
  const sel = document.getElementById('bd-header');
  if (!sel) return;
  const items = st.headersIndex?.items || [];
  if (!items.length) {
    sel.innerHTML = '<option value="">— Cadastre um cabeçalho —</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = items.map((it) => `<option value="${it.id}">${escapeHtml(it.name)}</option>`).join('');
  sel.value =
    st.activeHeaderId && items.some((i) => i.id === st.activeHeaderId)
      ? st.activeHeaderId
      : items[0].id;
}

function builderRenderPageChips() {
  const box = document.getElementById('bd-page-chips');
  const cnt = document.getElementById('bd-page-count');
  const pages = [...(st.selectedPages || [])].sort((a, b) => a - b);
  if (box) {
    box.innerHTML = pages.length
      ? pages.map((p) => `<div class="pc on" data-pg="${p}" onclick="builderTogglePage(this)">${p}</div>`).join('')
      : '';
  }
  if (cnt) cnt.textContent = pages.length ? `${pages.length} página(s) selecionada(s)` : '0 páginas — defina o intervalo';
}

function builderTogglePage(el) {
  if (st.builderPagesConfirmed) return;
  const p = parseInt(el.dataset.pg, 10);
  el.classList.toggle('on');
  if (el.classList.contains('on')) st.selectedPages.add(p);
  else st.selectedPages.delete(p);
  builderRenderPageChips();
}

async function builderOnMaterialChange(materialId) {
  if (!materialId) {
    startNewMaterial({ skipFlush: true });
    builderRenderMaterialSelect();
    return;
  }
  try {
    await switchMaterial(materialId);
    builderRenderMaterialSelect();
    builderRenderPageChips();
    const from = document.getElementById('bd-pag-from');
    const to = document.getElementById('bd-pag-to');
    if (from && !from.value && st.bookTotalPages) from.value = '1';
    if (to && !to.value && st.bookTotalPages) to.value = String(Math.min(st.bookTotalPages, 15));
    builderInvalidatePagesConfirm();
    builderUpdateQuestoesUI();
  } catch (e) {
    toast(e.message || 'Erro ao carregar material', 'err');
  }
}

async function builderApplyPages() {
  if (st.materialId && !st.bookPdf) {
    try {
      await ensureMaterialPdfLoaded();
    } catch (e) {
      toast(e.message || 'Erro ao carregar PDF', 'err', 6000);
      return;
    }
  }
  const max = st.bookTotalPages || st.bookPdf?.numPages || 0;
  if (!max) {
    toast('Selecione um material com PDF carregado.', 'err');
    return;
  }
  const from = parseInt(v('bd-pag-from'), 10);
  const to = parseInt(v('bd-pag-to'), 10);
  if (!from || !to) {
    toast('Informe página inicial e final.', 'err');
    return;
  }
  const lo = Math.max(1, Math.min(from, to, max));
  const hi = Math.max(1, Math.min(Math.max(from, to), max));
  if (hi - lo > 40) {
    toast('Máximo 40 páginas por vez.', 'err', 5000);
    return;
  }
  st.selectedPages = new Set();
  for (let p = lo; p <= hi; p++) st.selectedPages.add(p);
  builderInvalidatePagesConfirm();
  builderRenderPageChips();
  builderUpdateQuestoesUI();
  const cropSec = document.getElementById('bd-crop-section');
  if (cropSec && st.bookPdf) cropSec.style.display = '';
  toast(`${hi - lo + 1} página(s) marcadas — confirme para liberar a IA.`, 'ok');
}

async function builderOnHeaderChange(id) {
  if (!id) return;
  await applyHeader(id, { silent: true });
}

function builderPoolItemFromExercise(ex) {
  const q = ex.question;
  if (!q?.statement) return null;
  const type = q.type === 'discursive' ? 'discursive' : 'multiple_choice';
  return {
    id: `bex-${ex.id}`,
    source: 'exercise',
    variant: 'turma',
    exerciseId: ex.id,
    imageId: ex.image_id,
    inProva: false,
    reviewStatus: 'pending',
    type,
    title: ex.image_title || 'Exercício salvo',
    statement: q.statement,
    alternatives: q.alternatives || [],
    correctAnswer: q.correctAnswer || '',
    justification: '',
  };
}

function builderPoolItemFromMedia(img, draft) {
  const d = draft || st.builderMediaDrafts?.[img.imageId];
  const block = st.imageQuestionBlocks.find((b) => b.imageId === img.imageId);
  const q = d?.question || block?.question;
  const type =
    d?.type === 'discursive' || q?.type === 'discursive' ? 'discursive' : 'multiple_choice';
  if (!q?.statement) return null;
  return {
    id: `bmed-${img.imageId}`,
    source: 'media',
    variant: 'turma',
    imageId: img.imageId,
    inProva: false,
    reviewStatus: 'pending',
    type,
    title: img.title || img.caption || 'Mídia',
    statement: q.statement,
    alternatives: q.alternatives || [],
    correctAnswer: q.correctAnswer || '',
    justification: q.justification || '',
  };
}

function builderMediaDraftHtml(imageId, draft, img) {
  if (!draft || draft.loading) {
    return '<p class="bd-media-loading">Gerando exercício com a IA…</p>';
  }
  if (draft.reviewStatus === 'rejected') {
    return '<p class="bd-media-rejected">Exercício rejeitado. Gere outro ou escolha outra mídia.</p>';
  }
  if (!draft.question?.statement) return '';
  const q = draft.question;
  const isMc = draft.type !== 'discursive' && q.type !== 'discursive';
  const pid = escAttr(imageId);
  const alts =
    isMc && q.alternatives?.some((a) => a.text)
      ? `<ul class="rev-alts">${q.alternatives
          .filter((a) => a.text)
          .map(
            (a) =>
              `<li class="${a.letter === q.correctAnswer ? 'correct' : ''}"><b>${escHtml(a.letter)})</b> ${escHtml(a.text)}</li>`,
          )
          .join('')}</ul>`
      : '';
  const status = draft.reviewStatus || 'pending';
  const statusLabel =
    status === 'approved' ? 'Aprovado — na lista ⑥' : status === 'rejected' ? 'Rejeitado' : 'Aguardando sua revisão';
  return `
    <div class="bd-media-review rev-card rev-st-${status}">
      <p class="bd-media-review-status"><span class="rev-status ${status}">${statusLabel}</span></p>
      <div class="rev-card-body">${escHtml(q.statement)}${alts}</div>
      <div class="bd-pool-type-row">
        <label class="fl" style="margin:0;font-size:11px">Tipo</label>
        <select class="bd-pool-type-sel" onchange="builderSetMediaDraftType('${pid}', this.value)">
          <option value="multiple_choice"${isMc ? ' selected' : ''}>Múltipla escolha</option>
          <option value="discursive"${!isMc ? ' selected' : ''}>Discursiva</option>
        </select>
      </div>
      <div class="rev-card-actions">
        <button type="button" class="btn-ir" style="flex:1;background:var(--Ga);color:var(--G);border-color:rgba(24,160,60,.25)" onclick="builderApproveMediaExercise('${pid}')">✓ Aprovar exercício</button>
        <button type="button" class="chip" onclick="builderRejectMediaExercise('${pid}')">✕ Rejeitar</button>
        ${
          status === 'approved'
            ? `<button type="button" class="chip" onclick="builderRegenerateMediaExercise('${pid}')">↻ Gerar de novo</button>`
            : ''
        }
      </div>
    </div>`;
}

function builderSyncPoolFromSelections() {
  const prev = new Map(
    (st.builderPool || []).map((p) => [
      p.id,
      { inProva: p.inProva, reviewStatus: p.reviewStatus, type: p.type },
    ]),
  );
  const pool = (st.builderPool || []).filter((p) => p.source === 'ai');

  for (const exId of st.builderSelectedExercises) {
    const ex = (st.exerciciosData || []).find((x) => String(x.id) === String(exId));
    if (!ex) continue;
    const item = builderPoolItemFromExercise(ex);
    if (item && !pool.some((p) => p.id === item.id)) pool.push(item);
  }

  for (const imageId of Object.keys(st.builderMediaDrafts || {})) {
    const draft = st.builderMediaDrafts[imageId];
    if (draft?.reviewStatus !== 'approved') continue;
    const img = (st.cloudImageIndex || []).find((i) => i.imageId === imageId);
    if (!img) continue;
    const item = builderPoolItemFromMedia(img, draft);
    if (item && !pool.some((p) => p.id === item.id)) pool.push(item);
  }

  pool.forEach((p) => {
    const saved = prev.get(p.id);
    if (saved) {
      p.inProva = saved.inProva;
      if (saved.reviewStatus) p.reviewStatus = saved.reviewStatus;
      if (saved.type) p.type = saved.type;
    }
  });
  st.builderPool = pool;
}

function builderNormalizeApiQuestion(raw, index) {
  const q = raw && typeof raw === 'object' ? raw : {};
  let statement = String(q.statement || q.enunciado || q.questao || q.text || '').trim();
  statement = statement.replace(/^\[DISCURSIVA\]\s*/i, '').trim();
  const typeRaw = String(q.type || q.tipo || 'multiple_choice').toLowerCase();
  const isDisc =
    typeRaw.includes('disc') ||
    q.discursive === true ||
    (!q.alternatives && !q.alternativas && /\[discursiva\]/i.test(statement));
  const type = isDisc ? 'discursive' : 'multiple_choice';
  const rawAlts = q.alternatives || q.alternativas || [];
  const letters = ['a', 'b', 'c', 'd', 'e'];
  const alternatives = [];
  for (let i = 0; i < 5; i++) {
    const item = rawAlts[i];
    if (item && typeof item === 'object') {
      alternatives.push({
        letter: String(item.letter || item.letra || letters[i]).toLowerCase(),
        text: String(item.text || item.texto || '').trim(),
      });
    } else if (typeof item === 'string' && item.trim()) {
      alternatives.push({ letter: letters[i], text: item.trim() });
    } else {
      alternatives.push({ letter: letters[i], text: '' });
    }
  }
  let correctAnswer = String(q.correctAnswer || q.gabarito || q.resposta || 'a')
    .toLowerCase()
    .trim();
  const m = correctAnswer.match(/\b([a-e])\b/);
  correctAnswer = m ? m[1] : letters[0];
  return {
    statement: statement || `(Questão ${index + 1} — enunciado não retornado pela IA)`,
    type,
    alternatives,
    correctAnswer,
    justification: String(q.justification || q.justificativa || '').trim(),
  };
}

function builderPoolApproved(p) {
  return p.reviewStatus === 'approved' || (!p.reviewStatus && p.inProva);
}

function builderRenderMidias() {
  const grid = document.getElementById('bd-midias-grid');
  const badge = document.getElementById('bd-midias-count');
  if (!grid) return;
  const items = st.cloudImageIndex || [];
  const approvedN = Object.values(st.builderMediaDrafts || {}).filter((d) => d.reviewStatus === 'approved').length;
  if (badge) badge.textContent = items.length ? `${items.length} · ${approvedN} aprovada(s)` : '0';
  if (!items.length) {
    grid.innerHTML = '<div class="bd-empty">Nenhuma mídia na nuvem. Adicione em Minhas mídias.</div>';
    return;
  }
  grid.innerHTML = items
    .slice(0, 48)
    .map((img) => {
      const draft = st.builderMediaDrafts?.[img.imageId];
      const thumb = img.previewUrl || '';
      const pid = escAttr(img.imageId);
      const title = escHtml((img.title || img.caption || 'Figura').slice(0, 56));
      const review = builderMediaDraftHtml(img.imageId, draft, img);
      const genDisabled = draft?.loading ? ' disabled' : '';
      return `
      <article class="bd-media-card">
        <div class="bd-media-card-top">
          <div class="bd-media-thumb">${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : '<span>🖼</span>'}</div>
          <div class="bd-media-meta">
            <div class="bd-media-title">${title}</div>
            <button type="button" class="btn-ir bd-media-gen-btn"${genDisabled} onclick="builderGenerateMediaExercise('${pid}')">✦ Gerar exercício (IA)</button>
          </div>
        </div>
        ${review}
      </article>`;
    })
    .join('');
}

async function builderGenerateMediaExercise(imageId) {
  builderSyncFields();
  if (!v('bd-disc') && !v('f-disc')) {
    toast('Preencha disciplina no passo ①.', 'err');
    return;
  }
  st.builderMediaDrafts = st.builderMediaDrafts || {};
  st.builderMediaDrafts[imageId] = { loading: true, reviewStatus: 'pending' };
  builderRenderMidias();
  try {
    const { block, image, question } = await fetchAndBuildImageQuestion(imageId);
    const norm = builderNormalizeApiQuestion(question, 0);
    st.builderMediaDrafts[imageId] = {
      question: {
        statement: norm.statement,
        alternatives: norm.alternatives,
        correctAnswer: norm.correctAnswer,
        justification: norm.justification,
        type: norm.type,
      },
      reviewStatus: 'pending',
      type: norm.type,
      blockId: block.blockId,
    };
    toast('Exercício gerado — revise e aprove abaixo.', 'ok', 4500);
  } catch (e) {
    delete st.builderMediaDrafts[imageId];
    toast(humanizeIaApiError(e.message), 'err', 7000);
  }
  builderRenderMidias();
}

async function builderApproveMediaExercise(imageId) {
  const draft = st.builderMediaDrafts?.[imageId];
  if (!draft?.question?.statement) {
    toast('Gere o exercício antes de aprovar.', 'err');
    return;
  }
  draft.reviewStatus = 'approved';
  const block = st.imageQuestionBlocks.find((b) => b.imageId === imageId);
  const image =
    getCloudImageEntry(imageId) || (st.cloudImageIndex || []).find((i) => i.imageId === imageId);
  if (block && image) {
    block.question = {
      ...draft.question,
      type: draft.type === 'discursive' ? 'discursive' : 'multiple_choice',
    };
    await persistSavedExercise(block, image);
  }
  st.builderSelectedMedia.add(imageId);
  if (st.builderPagesConfirmed) {
    builderSyncPoolFromSelections();
    builderRenderPool();
  }
  builderRenderMidias();
  builderRenderExercises();
  scheduleSaveBuilder();
  toast('Exercício aprovado — revise na seção ⑥ para incluir na prova.', 'ok', 5000);
}

function builderRejectMediaExercise(imageId) {
  if (st.builderMediaDrafts?.[imageId]) {
    st.builderMediaDrafts[imageId].reviewStatus = 'rejected';
  }
  st.builderSelectedMedia.delete(imageId);
  st.builderPool = (st.builderPool || []).filter((p) => p.id !== `bmed-${imageId}`);
  const block = st.imageQuestionBlocks.find((b) => b.imageId === imageId);
  if (block) block.selected = false;
  builderRenderMidias();
  if (st.builderPagesConfirmed) builderRenderPool();
  scheduleSaveBuilder();
  toast('Exercício rejeitado.', 'ok');
}

async function builderRegenerateMediaExercise(imageId) {
  delete st.builderMediaDrafts[imageId];
  st.builderSelectedMedia.delete(imageId);
  st.builderPool = (st.builderPool || []).filter((p) => p.id !== `bmed-${imageId}`);
  builderRenderMidias();
  await builderGenerateMediaExercise(imageId);
}

function builderSetMediaDraftType(imageId, type) {
  const draft = st.builderMediaDrafts?.[imageId];
  if (!draft) return;
  draft.type = type === 'discursive' ? 'discursive' : 'multiple_choice';
  if (draft.question) draft.question.type = draft.type;
  const block = st.imageQuestionBlocks.find((b) => b.imageId === imageId);
  if (block?.question) block.question.type = draft.type;
  builderRenderMidias();
  scheduleSaveBuilder();
}

function builderRenderExercises() {
  const list = document.getElementById('bd-ex-list');
  const badge = document.getElementById('bd-ex-count');
  const items = st.exerciciosData || [];
  if (badge) badge.textContent = String(items.length);
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="bd-empty">Nenhum exercício salvo. Aprove exercícios gerados em ④ Mídias.</div>';
    return;
  }
  list.innerHTML = items
    .slice(0, 40)
    .map((ex) => {
      const on = st.builderSelectedExercises.has(ex.id);
      const preview = (ex.question?.statement || '').slice(0, 120);
      return `<div class="bd-pick-ex ${on ? 'on' : ''}" onclick="builderToggleExercise('${escHtml(ex.id)}')">
        <span class="bd-pick-check">${on ? '✓' : ''}</span>
        <div class="bd-pick-ex-body">
          <div class="bd-pick-ex-title">${escHtml(ex.image_title || 'Exercício')}</div>
          ${escHtml(preview)}${preview.length >= 120 ? '…' : ''}
        </div>
      </div>`;
    })
    .join('');
}

function builderToggleMedia(imageId) {
  const draft = st.builderMediaDrafts?.[imageId];
  if (draft?.reviewStatus === 'approved') {
    builderRejectMediaExercise(imageId);
    return;
  }
  void builderGenerateMediaExercise(imageId);
}

function builderToggleExercise(exId) {
  if (st.builderSelectedExercises.has(exId)) st.builderSelectedExercises.delete(exId);
  else st.builderSelectedExercises.add(exId);
  builderRenderExercises();
  builderSyncPoolFromSelections();
  builderRenderPool();
}

function builderMapAiQuestionsToPool(questions, variant) {
  const batch = Date.now();
  return (questions || []).map((raw, i) => {
    const q = builderNormalizeApiQuestion(raw, i);
    return {
      id: `bai-${variant}-${batch}-${i}`,
      source: 'ai',
      variant,
      inProva: false,
      reviewStatus: 'pending',
      type: q.type,
      title: variant === 'adaptada' ? 'IA · versão adaptada' : 'IA · turma',
      statement: q.statement,
      alternatives: q.alternatives,
      correctAnswer: q.correctAnswer,
      justification: q.justification,
    };
  });
}

function builderRenderPool() {
  const pool = document.getElementById('bd-pool');
  const summary = document.getElementById('bd-pool-summary');
  const btnTurma = document.getElementById('bd-montar-btn');
  const btnAdapt = document.getElementById('bd-montar-adapt-btn');
  if (!pool) return;
  if (!st.builderPagesConfirmed) return;
  builderSyncPoolFromSelections();
  const all = st.builderPool || [];
  const tab = st.builderPoolTab || 'turma';
  const items = all.filter((p) => {
    if (tab === 'all') return true;
    return (p.variant || 'turma') === tab;
  });
  const approvedTurma = all.filter(
    (p) => builderPoolApproved(p) && (p.variant || 'turma') === 'turma',
  ).length;
  const approvedAdapt = all.filter(
    (p) => builderPoolApproved(p) && p.variant === 'adaptada',
  ).length;
  const pending = all.filter((p) => (p.reviewStatus || 'pending') === 'pending').length;
  if (summary) {
    summary.textContent = all.length
      ? `${all.length} sugestões · ${pending} pendentes · turma: ${approvedTurma} aprovada(s) · adaptada: ${approvedAdapt}`
      : 'Gere questões com a IA e revise cada uma (aprovar ou rejeitar) antes de montar.';
  }
  if (btnTurma) {
    btnTurma.disabled = approvedTurma === 0;
    btnTurma.textContent = approvedTurma
      ? `Montar prova turma (${approvedTurma})`
      : 'Montar prova (turma)';
  }
  if (btnAdapt) {
    btnAdapt.disabled = approvedAdapt === 0;
    btnAdapt.style.display = st.builderWantAdapted || all.some((p) => p.variant === 'adaptada') ? '' : 'none';
    btnAdapt.textContent = approvedAdapt
      ? `Montar versão adaptada (${approvedAdapt})`
      : 'Montar versão adaptada (individual)';
  }
  if (!items.length) {
    pool.innerHTML =
      '<div class="bd-empty">Nenhuma questão nesta aba. Gere com a IA ou inclua mídias/exercícios.</div>';
    return;
  }
  const srcLabel = { ai: 'IA', exercise: 'Exercício', media: 'Mídia' };
  const varLabel = { turma: 'Turma', adaptada: 'Adaptada' };
  pool.innerHTML = items
    .map((q, idx) => {
      const status = q.reviewStatus || 'pending';
      const isMc = q.type !== 'discursive';
      const pid = escAttr(q.id);
      const stmt = String(q.statement || '').trim();
      const preview = stmt.length > 160 ? `${stmt.slice(0, 160)}…` : stmt;
      const alts =
        isMc && q.alternatives?.some((a) => a.text)
          ? `<ul class="rev-alts">${q.alternatives
              .filter((a) => a.text)
              .map(
                (a) =>
                  `<li class="${a.letter === q.correctAnswer ? 'correct' : ''}"><b>${escHtml(a.letter)})</b> ${escHtml(a.text)}</li>`,
              )
              .join('')}</ul>`
          : '';
      const just = q.justification
        ? `<div class="rev-just"><b>Gabarito / critérios:</b> ${escHtml(q.justification)}</div>`
        : '';
      const statusLabel =
        status === 'approved' ? 'Aprovada' : status === 'rejected' ? 'Rejeitada' : 'Pendente';
      return `
      <article class="bd-pool-item rev-card rev-st-${status} ${builderPoolApproved(q) ? 'in-prova approved' : ''}" data-pool-id="${pid}">
        <details class="bd-pool-details" open>
          <summary class="bd-pool-summary-row">
            <span class="rev-card-num">${idx + 1}</span>
            <span class="bd-pool-src">${srcLabel[q.source] || q.source} · ${varLabel[q.variant] || 'Turma'}</span>
            <span class="rev-badge ${isMc ? 'mc' : 'disc'}">${isMc ? 'Objetiva' : 'Discursiva'}</span>
            <span class="rev-status ${status}">${statusLabel}</span>
            <span class="bd-pool-expand-hint">Ver questão ▾</span>
            <p class="bd-pool-preview">${escHtml(preview || '(sem enunciado)')}</p>
          </summary>
          <div class="rev-card-body bd-pool-body">${escHtml(stmt || '(Enunciado vazio — rejeite ou gere de novo)')}${alts}${just}</div>
          <div class="bd-pool-type-row">
            <label class="fl" style="margin:0;font-size:11px">Tipo na prova</label>
            <select class="bd-pool-type-sel" onchange="builderSetPoolItemType('${pid}', this.value)">
              <option value="multiple_choice"${isMc ? ' selected' : ''}>Múltipla escolha</option>
              <option value="discursive"${!isMc ? ' selected' : ''}>Discursiva</option>
            </select>
          </div>
          <div class="rev-card-actions">
            <button type="button" class="btn-ir" style="flex:1;background:var(--Ga);color:var(--G);border-color:rgba(24,160,60,.25)" onclick="builderApprovePoolItem('${pid}')">✓ Aprovar</button>
            <button type="button" class="chip" onclick="builderRejectPoolItem('${pid}')">✕ Rejeitar</button>
            ${
              status !== 'pending'
                ? `<button type="button" class="chip" onclick="builderUndoPoolItem('${pid}')">↩ Desfazer</button>`
                : ''
            }
          </div>
        </details>
      </article>`;
    })
    .join('');
}

function builderApprovePoolItem(id) {
  const q = st.builderPool.find((p) => p.id === id);
  if (!q) return;
  q.reviewStatus = 'approved';
  q.inProva = true;
  builderRenderPool();
  scheduleSaveBuilder();
}

function builderRejectPoolItem(id) {
  const q = st.builderPool.find((p) => p.id === id);
  if (!q) return;
  q.reviewStatus = 'rejected';
  q.inProva = false;
  builderRenderPool();
  scheduleSaveBuilder();
}

function builderUndoPoolItem(id) {
  const q = st.builderPool.find((p) => p.id === id);
  if (!q) return;
  q.reviewStatus = 'pending';
  q.inProva = false;
  builderRenderPool();
  scheduleSaveBuilder();
}

function builderSetPoolItemType(id, type) {
  const q = st.builderPool.find((p) => p.id === id);
  if (!q) return;
  q.type = type === 'discursive' ? 'discursive' : 'multiple_choice';
  builderRenderPool();
  scheduleSaveBuilder();
}

function builderToggleInProva(id, checked) {
  const q = st.builderPool.find((p) => p.id === id);
  if (!q) return;
  q.inProva = !!checked;
  q.reviewStatus = checked ? 'approved' : 'pending';
  builderRenderPool();
  scheduleSaveBuilder();
}

async function builderGerarQuestoes() {
  if (!currentSession) { showView('auth'); return; }
  if (!st.builderPagesConfirmed) {
    toast('Confirme as páginas do livro (passo ②) antes de gerar questões.', 'err', 6000);
    return;
  }
  builderSyncFields();
  if (!v('bd-disc') || !v('bd-serie')) {
    toast('Preencha disciplina e série.', 'err');
    return;
  }
  if (!v('bd-topicos').trim()) {
    try {
      await ensureMaterialPdfLoaded();
    } catch (e) {
      toast(e.message || 'Erro ao carregar PDF', 'err', 6000);
      return;
    }
  }
  const count = builderQuestionCount();
  const adaptNotes = (document.getElementById('bd-adapt-notas')?.value || '').trim();
  const btn = document.getElementById('bd-btn-gerar');
  const poolEl = document.getElementById('bd-pool');
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
  if (poolEl) {
    poolEl.innerHTML =
      '<div class="bd-empty">Extraindo páginas e gerando questões com a IA… Aguarde nesta tela.</div>';
  }
  try {
    const keep = (st.builderPool || []).filter((p) => p.source !== 'ai');
    st.builderPool = keep;

    const turmaRes = await fetchQuestionSuggestions(count, false, {
      skipPendingStore: true,
      fromBuilder: true,
      adapted: false,
    });
    st.builderPool.push(...builderMapAiQuestionsToPool(turmaRes.questions, 'turma'));

    if (st.builderWantAdapted) {
      if (poolEl) {
        poolEl.innerHTML =
          '<div class="bd-empty">Gerando versão adaptada (PAEE)…</div>';
      }
      const adaptRes = await fetchQuestionSuggestions(count, false, {
        skipPendingStore: true,
        fromBuilder: true,
        adapted: true,
        adaptationNotes: adaptNotes,
      });
      st.builderPool.push(...builderMapAiQuestionsToPool(adaptRes.questions, 'adaptada'));
    }

    st.pendingQuestions = [];
    const nTurma = turmaRes.count;
    const nAdapt = st.builderWantAdapted
      ? st.builderPool.filter((p) => p.source === 'ai' && p.variant === 'adaptada').length
      : 0;
    toast(
      st.builderWantAdapted
        ? `${nTurma} (turma) + ${nAdapt} adaptadas — revise e aprove na lista abaixo.`
        : `${nTurma} questões geradas — abra cada uma, aprove ou rejeite.`,
      'ok',
      6000,
    );
    builderSetPoolTab('turma');
    builderUpdateQuestoesUI();
    scheduleSaveBuilder();
    document.getElementById('bd-questoes-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  } finally {
    if (btn) {
      btn.disabled = !st.builderPagesConfirmed;
      btn.textContent = '✦ Gerar questões do material';
    }
  }
}

async function builderMontarProva(variant) {
  const vnt = variant === 'adaptada' ? 'adaptada' : 'turma';
  builderSyncFields();
  builderSyncPoolFromSelections();
  const items = (st.builderPool || []).filter(
    (p) => builderPoolApproved(p) && (p.variant || 'turma') === vnt,
  );
  if (!items.length) {
    toast(
      vnt === 'adaptada'
        ? 'Aprove ao menos uma questão na aba Versão adaptada.'
        : 'Aprove ao menos uma questão na aba Turma.',
      'err',
    );
    return;
  }
  const btn = vnt === 'adaptada' ? document.getElementById('bd-montar-adapt-btn') : document.getElementById('bd-montar-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Montando…'; }
  try {
    if (vnt === 'turma') {
      st.imageQuestionBlocks = st.imageQuestionBlocks.map((b) => ({ ...b, selected: false }));
    }
    const provaLines = [];
    const gabLines = [];
    if (vnt === 'adaptada') {
      provaLines.push('AVALIAÇÃO ADAPTADA — USO INDIVIDUAL (PAEE / INCLUSÃO)');
      provaLines.push('(Mesmos objetivos da turma, com adaptações de acessibilidade.)');
      provaLines.push('');
    }
    let n = 1;
    for (const q of items) {
      if (vnt === 'turma' && q.imageId && (q.source === 'exercise' || q.source === 'media')) {
        const ex = q.source === 'exercise' ? (st.exerciciosData || []).find((x) => x.id === q.exerciseId) : null;
        if (ex) {
          const block = await exerciseToBlock(ex);
          block.selected = true;
          upsertImageBlock(block);
        } else {
          await useCloudImageInBuilder(q.imageId, { silent: true });
          let block = st.imageQuestionBlocks.find((b) => b.imageId === q.imageId);
          if (!block) {
            block = {
              blockId: `block_${q.imageId}_${Date.now()}`,
              selected: true,
              imageId: q.imageId,
              image: getImageCatalogEntry(q.imageId),
              question: q.alternatives?.length
                ? { statement: q.statement, alternatives: q.alternatives, correctAnswer: q.correctAnswer }
                : null,
            };
            upsertImageBlock(block);
          } else {
            block.selected = true;
            if (q.alternatives?.length) block.question = { statement: q.statement, alternatives: q.alternatives, correctAnswer: q.correctAnswer };
          }
        }
        if (q.statement && !/^\(Figura na prova/i.test(q.statement)) {
          provaLines.push(formatReviewQuestionProva(q, n));
          gabLines.push(formatReviewQuestionGabarito(q, n));
          n++;
        }
      } else {
        provaLines.push(formatReviewQuestionProva(q, n));
        gabLines.push(formatReviewQuestionGabarito(q, n));
        n++;
      }
    }
    st.provaText = provaLines.join('\n\n');
    st.gabText = gabLines.join('\n');
    document.getElementById('prova-text').value = st.provaText;
    document.getElementById('gab-text').value = st.gabText;
    document.getElementById('badge-saved').style.display = 'none';
    st.currentProvaId = null;
    st.numQ = n - 1;
    showView('result');
    rTab('preview');
    scheduleExamPreview();
    renderExamVisualBuilder();
    saveDraft();
    const tipoLabel = vnt === 'adaptada' ? ' (adaptada)' : '';
    const saved = await saveProva(v('f-disc'), v('f-serie') + tipoLabel);
    if (!saved.ok) toast('Prova montada, mas não salva: ' + saved.error, 'err', 6000);
    else toast(vnt === 'adaptada' ? 'Versão adaptada montada.' : 'Prova da turma montada.', 'ok', 4000);
  } catch (e) {
    toast('Erro ao montar: ' + (e.message || e), 'err', 6000);
  } finally {
    if (btn) builderRenderPool();
  }
}

async function restoreMontarStateIfEmpty() {
  if (st.builderPool?.length || st.builderPagesConfirmed) return false;
  try {
    let snap = null;
    if (cloudReady()) snap = await PedagiaCloud.loadBuilderState(st.materialId);
    if (!snap && window.indexedDB) snap = await dbGet(BUILDER_STORE, builderStorageKey());
    if (snap?.montar && (snap.montar.pool?.length || snap.montar.pagesConfirmed)) {
      applyMontarState(snap.montar);
      return true;
    }
  } catch (e) {
    console.warn('restore montar', e);
  }
  return false;
}

async function initBuilderView() {
  if (!currentSession) return;
  builderLoadFields();
  try {
    await fetchMaterialsList();
  } catch (e) {
    console.warn('materials', e);
  }
  if (st.materialId && !st.bookPdf) {
    try {
      await ensureMaterialPdfLoaded();
    } catch (e) {
      console.warn('builder preload pdf', e);
    }
  }
  const restored = await restoreMontarStateIfEmpty();
  if (restored) {
    const n = (st.builderPool || []).length;
    if (n) toast(`Montar restaurado: ${n} questão(ões) na lista.`, 'ok', 4000);
  }
  builderRenderMaterialSelect();
  builderRenderPageChips();
  await loadHeadersLibrary({ silent: true });
  builderRenderHeaderSelect();
  if (cloudReady()) {
    try {
      await refreshCloudImagesDashboard();
    } catch (e) {
      console.warn('midias builder', e);
    }
  }
  builderRenderMidias();
  if (!st.exerciciosData?.length) await loadExercicios();
  builderRenderExercises();
  builderOnAdaptadaToggle();
  builderUpdateQuestoesUI();
  builderRenderBdCropGallery();
  if (st.selectedPages?.size && st.bookPdf) {
    const cropSec = document.getElementById('bd-crop-section');
    if (cropSec) cropSec.style.display = '';
  }
}

// ══════════════════════════════════════════════
// CONTEÚDO + REVISÃO DE QUESTÕES
// ══════════════════════════════════════════════
async function buildBuilderExamContentBlock() {
  builderSyncFields();
  const topicos = v('bd-topicos').trim();
  if (topicos) {
    return `\nCONTEÚDO / TÓPICOS FORNECIDOS PELO PROFESSOR:\n${topicos}\n`;
  }
  const pages = [...(st.builderConfirmedPageList || [])].sort((a, b) => a - b);
  if (!pages.length) {
    throw new Error('Confirme as páginas do livro no passo ② antes de gerar questões.');
  }
  await ensureMaterialPdfLoaded();
  const savedPages = st.selectedPages;
  st.selectedPages = new Set(pages);
  let pagesText = '';
  try {
    pagesText = await extractSelectedPages();
  } finally {
    st.selectedPages = savedPages;
  }
  const bookSources = extractSources(pagesText);
  const sourceBlock = bookSources.length
    ? `\nFONTES ORIGINAIS DO MATERIAL (cite EXATAMENTE assim — NUNCA use o nome do arquivo):\n${bookSources.map((s) => '• ' + s).join('\n')}\n`
    : '';
  if (!pagesText || pagesText.trim().length < 80) {
    throw new Error(
      'Pouco texto nas páginas confirmadas. Escolha outras páginas ou use conteúdo escrito.',
    );
  }
  const chTitle =
    st.bookChapters?.[st.selectedChapterIdx]?.title ||
    v('f-cap-manual') ||
    'Páginas confirmadas';
  st.chapterBrief = await analyzeChapterForExam({
    chapterTitle: chTitle,
    pagesText,
    pages,
  });
  const core = getCore();
  if (core?.buildChapterContentBlock) {
    return core.buildChapterContentBlock({
      bookFileName: st.bookFileName,
      chapterTitle: chTitle,
      pages,
      pagesText,
      bookSources,
      imageBlocksNote: 'Questões textuais para o professor marcar no Montar.',
      brief: st.chapterBrief,
    });
  }
  return `
CONTEÚDO DO MATERIAL — ÚNICA FONTE (páginas confirmadas pelo professor):
Livro: "${st.bookFileName || 'Material'}"
Capítulo: ${chTitle}
Páginas: ${pages.join(', ')}
${sourceBlock}
--- TEXTO ---
${pagesText.slice(0, 28000)}
--- FIM ---`;
}

async function buildExamContentBlock() {
  const topicosFirst = v('f-topicos')?.trim();
  if (topicosFirst) {
    return `\nCONTEÚDO / TÓPICOS FORNECIDOS PELO PROFESSOR:\n${topicosFirst}\n`;
  }
  const src = document.getElementById('s-livro')?.classList.contains('on') ? 'livro' : 'desc';
  if (src === 'livro') {
    const chIdx = st.selectedChapterIdx;
    const manCap = v('f-cap-manual');
    const chTitle = chIdx >= 0 ? st.bookChapters[chIdx]?.title : manCap;
    const pages = [...st.selectedPages].sort((a, b) => a - b);
    const pagesText = await extractSelectedPages();
    const bookSources = extractSources(pagesText);
    const sourceBlock = bookSources.length
      ? `\nFONTES ORIGINAIS DO MATERIAL (cite EXATAMENTE assim — NUNCA use o nome do arquivo):\n${bookSources.map((s) => '• ' + s).join('\n')}\n`
      : '';
    if (!pagesText || pagesText.trim().length < 80) {
      throw new Error(
        'Pouco texto nas páginas selecionadas. Marque as páginas (chips verdes) ou use o intervalo manual.',
      );
    }
    const selectedBlocks = getSelectedImageBlocks().length;
    const imgBlock =
      selectedBlocks > 0
        ? `O professor já tem ${selectedBlocks} questão(ões) com figura no builder — as sugestões são só texto.`
        : 'Todas as sugestões são questões textuais (figuras vêm do builder do professor).';
    st.chapterBrief = await analyzeChapterForExam({
      chapterTitle: chTitle,
      pagesText,
      pages,
    });
    const core = getCore();
    if (core?.buildChapterContentBlock) {
      return core.buildChapterContentBlock({
        bookFileName: st.bookFileName,
        chapterTitle: chTitle || manCap || 'Material selecionado',
        pages,
        pagesText,
        bookSources,
        imageBlocksNote: imgBlock,
        brief: st.chapterBrief,
      });
    }
    return `
CONTEÚDO DO MATERIAL — ÚNICA FONTE:
Livro: "${st.bookFileName}"
Capítulo: ${chTitle || manCap || 'Páginas selecionadas'}
Páginas: ${pages.join(', ')}
${sourceBlock}
--- TEXTO ---
${pagesText.slice(0, 28000)}
--- FIM ---`;
  }
  const topicos = v('f-topicos').trim();
  if (!topicos) throw new Error('Escreva os tópicos ou conteúdo na aba Descrição.');
  return `\nCONTEÚDO / TÓPICOS FORNECIDOS PELO PROFESSOR:\n${topicos}\n`;
}

function reviewBatchCount(extra = 0) {
  return Math.min(28, Math.max((st.numQ || 10) + extra, 3));
}

function builderQuestionCount() {
  return Math.min(28, Math.max(3, st.numQ || 10));
}

function mapApiQuestionsToReview(items) {
  const base = st.pendingQuestions.length;
  return items.map((q, i) => ({
    id: `rq-${Date.now()}-${base + i}`,
    type: q.type === 'discursive' ? 'discursive' : 'multiple_choice',
    statement: q.statement,
    alternatives: q.alternatives || [],
    correctAnswer: q.correctAnswer || '',
    justification: q.justification || '',
    status: 'pending',
  }));
}

function getReviewCounts() {
  const all = st.pendingQuestions || [];
  return {
    total: all.length,
    pending: all.filter((q) => q.status === 'pending').length,
    approved: all.filter((q) => q.status === 'approved').length,
    rejected: all.filter((q) => q.status === 'rejected').length,
  };
}

function updateReviewMontarBtn() {
  const btn = document.getElementById('rev-montar-btn');
  const n = getReviewCounts().approved;
  if (!btn) return;
  btn.disabled = n === 0;
  btn.textContent = `Montar prova (${n} aprovada${n !== 1 ? 's' : ''})`;
}

function renderQuestionReview() {
  const list = document.getElementById('rev-list');
  const summary = document.getElementById('rev-summary');
  const ped = document.getElementById('rev-ped-note');
  if (!list) return;

  const counts = getReviewCounts();
  if (summary) {
    summary.textContent = `${counts.total} sugestões · ${counts.approved} aprovadas · ${counts.rejected} rejeitadas · ${counts.pending} pendentes`;
  }
  if (ped) {
    if (st.reviewPedNote) {
      ped.style.display = '';
      ped.textContent = st.reviewPedNote;
    } else {
      ped.style.display = 'none';
      ped.textContent = '';
    }
  }

  document.querySelectorAll('.rev-filter').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.revFilter === (st.reviewFilter || 'all'));
  });

  const f = st.reviewFilter || 'all';
  const items = (st.pendingQuestions || []).filter((q) => f === 'all' || q.status === f);

  if (!items.length) {
    list.innerHTML = `<div class="rev-empty" style="padding:24px;text-align:center;font-size:13px;color:var(--t3)">
      ${counts.total ? 'Nenhuma questão neste filtro.' : 'Nenhuma sugestão ainda. Volte ao formulário e gere com a IA.'}
    </div>`;
    updateReviewMontarBtn();
    return;
  }

  list.innerHTML = items
    .map((q, idx) => {
      const globalIdx = st.pendingQuestions.indexOf(q);
      const isMc = q.type !== 'discursive';
      const alts =
        isMc && q.alternatives?.length
          ? `<ul class="rev-alts">${q.alternatives
              .map((a) => {
                const ok = a.letter === q.correctAnswer;
                return `<li class="${ok ? 'correct' : ''}"><b>${escHtml(a.letter)})</b> ${escHtml(a.text)}</li>`;
              })
              .join('')}</ul>`
          : '';
      const just = q.justification
        ? `<div class="rev-just"><b>Gabarito / critérios:</b> ${escHtml(q.justification)}</div>`
        : '';
      const statusLabel =
        q.status === 'approved' ? 'Aprovada' : q.status === 'rejected' ? 'Rejeitada' : 'Pendente';
      return `
      <div class="rev-card ${q.status}" data-rev-id="${escHtml(q.id)}">
        <div class="rev-card-head">
          <span class="rev-card-num">${idx + 1}</span>
          <span class="rev-badge ${isMc ? 'mc' : 'disc'}">${isMc ? 'Objetiva' : 'Discursiva'}</span>
          <span class="rev-status ${q.status}">${statusLabel}</span>
        </div>
        <div class="rev-card-body">${escHtml(q.statement)}${alts}${just}</div>
        <div class="rev-card-actions">
          <button type="button" class="btn-ir" style="flex:1;background:var(--Ga);color:var(--G);border-color:rgba(24,160,60,.25)" onclick="approveReviewQuestion('${escHtml(q.id)}')">✓ Aprovar</button>
          <button type="button" class="chip" onclick="rejectReviewQuestion('${escHtml(q.id)}')">✕ Rejeitar</button>
          ${
            q.status !== 'pending'
              ? `<button type="button" class="chip" onclick="undoReviewQuestion('${escHtml(q.id)}')">↩ Desfazer</button>`
              : ''
          }
          <button type="button" class="chip evb-mini" title="Subir" onclick="moveReviewQuestion(${globalIdx},-1)">↑</button>
          <button type="button" class="chip evb-mini" title="Descer" onclick="moveReviewQuestion(${globalIdx},1)">↓</button>
        </div>
      </div>`;
    })
    .join('');

  updateReviewMontarBtn();
}

function setReviewFilter(f) {
  st.reviewFilter = f || 'all';
  renderQuestionReview();
}

function approveReviewQuestion(id) {
  const q = st.pendingQuestions.find((x) => x.id === id);
  if (q) q.status = 'approved';
  renderQuestionReview();
}

function rejectReviewQuestion(id) {
  const q = st.pendingQuestions.find((x) => x.id === id);
  if (q) q.status = 'rejected';
  renderQuestionReview();
}

function undoReviewQuestion(id) {
  const q = st.pendingQuestions.find((x) => x.id === id);
  if (q) q.status = 'pending';
  renderQuestionReview();
}

function moveReviewQuestion(globalIdx, dir) {
  const arr = st.pendingQuestions;
  const j = globalIdx + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[globalIdx], arr[j]] = [arr[j], arr[globalIdx]];
  renderQuestionReview();
}

function formatReviewQuestionProva(q, num) {
  const lines = [`${num}. ${q.statement}`];
  if (q.type !== 'discursive' && q.alternatives?.length) {
    q.alternatives.forEach((a) => {
      if (a.text?.trim()) lines.push(`${a.letter}) ${a.text.trim()}`);
    });
  } else if (q.type === 'discursive') {
    for (let i = 0; i < 8; i++) lines.push('______________________________________________');
  }
  return lines.join('\n');
}

function formatReviewQuestionGabarito(q, num) {
  if (q.type === 'discursive') {
    return `${num}. — ${q.justification || 'Critérios conforme enunciado.'}`;
  }
  const letter = (q.correctAnswer || 'a').toLowerCase();
  const just = q.justification ? ` — ${q.justification}` : '';
  return `${num}. ${letter}${just}`;
}

async function fetchQuestionSuggestions(count, append, opts = {}) {
  const token = currentSession?.access_token;
  if (!token) throw new Error('Faça login para usar a IA.');
  const contentBlock = opts.fromBuilder
    ? await buildBuilderExamContentBlock()
    : await buildExamContentBlock();
  const res = await fetch('/api/gerar-questoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      contentBlock,
      count,
      metadata: getExamMetadata(),
      bnccPrefs: getBnccPrefsFromUI(),
      adapted: !!opts.adapted,
      adaptationNotes: opts.adaptationNotes || '',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  const mapped = mapApiQuestionsToReview(data.questions || []);
  if (!mapped.length) throw new Error('Nenhuma questão retornada pela IA.');
  if (!opts.skipPendingStore) {
    if (append) st.pendingQuestions.push(...mapped);
    else st.pendingQuestions = mapped;
    if (data.pedagogicalNote) st.reviewPedNote = data.pedagogicalNote;
  }
  return { count: mapped.length, questions: data.questions || [], pedagogicalNote: data.pedagogicalNote };
}

async function gerarMaisQuestoes() {
  if (!currentSession) { showView('auth'); return; }
  showView('loading');
  document.getElementById('load-desc').textContent = 'Gerando mais sugestões…';
  try {
    const r = await fetchQuestionSuggestions(Math.min(10, reviewBatchCount(2)), true);
    const n = r.count;
    toast(`${n} nova(s) sugestão(ões).`, 'ok');
    showView('revisao');
    renderQuestionReview();
  } catch (e) {
    showView('revisao');
    toast('Erro: ' + e.message, 'err');
  }
}

async function montarProvaAprovadas() {
  const approved = (st.pendingQuestions || []).filter((q) => q.status === 'approved');
  if (!approved.length) {
    toast('Aprove ao menos uma questão.', 'err');
    return;
  }
  const provaLines = [];
  const gabLines = [];
  let n = 1;
  for (const q of approved) {
    provaLines.push(formatReviewQuestionProva(q, n));
    gabLines.push(formatReviewQuestionGabarito(q, n));
    n++;
  }
  st.provaText = provaLines.join('\n\n');
  st.gabText = gabLines.join('\n');
  document.getElementById('prova-text').value = st.provaText;
  document.getElementById('gab-text').value = st.gabText;
  document.getElementById('badge-saved').style.display = 'none';
  st.currentProvaId = null;
  st.numQ = approved.length;
  const nvEl = document.getElementById('nv');
  if (nvEl) nvEl.textContent = st.numQ;
  showView('result');
  rTab('preview');
  scheduleExamPreview();
  renderExamVisualBuilder();
  saveDraft();
  const disc = v('f-disc');
  const serie = v('f-serie');
  const saved = await saveProva(disc, serie);
  if (!saved.ok) toast('Prova montada, mas não foi salva: ' + saved.error, 'err', 6000);
  else toast(`${approved.length} questão(ões) na prova. Salva em Minhas provas.`, 'ok', 4000);
}

// ══════════════════════════════════════════════
// GENERATE — sugestões → revisão → montar prova
// ══════════════════════════════════════════════
async function gerarProva() {
  const disc = v('f-disc');
  const serie = v('f-serie');
  const src = document.getElementById('s-livro')?.classList.contains('on') ? 'livro' : 'desc';
  const hasContent =
    src === 'livro' ? st.selectedPages.size > 0 : v('f-topicos').trim().length > 0;

  if (src === 'livro' && !st.bookPdf) {
    toast('Envie o PDF do livro no Material ou use a aba Descrição com tópicos escritos.', 'err', 6000);
    return;
  }
  if (src === 'livro' && st.selectedPages.size === 0) {
    toast('Selecione as páginas do PDF (chips verdes ou intervalo manual).', 'err', 6000);
    return;
  }

  if (!disc || !serie || !hasContent) {
    document.getElementById('form-err').style.display = '';
    return;
  }
  document.getElementById('form-err').style.display = 'none';

  if (!currentSession) { showView('auth'); return; }

  showView('loading');
  const coreTpl = getCore();
  const tplHint = coreTpl?.describeBnccMix
    ? coreTpl.describeBnccMix(coreTpl.getBnccExamTemplate(st.numQ, serie))
    : '';
  document.getElementById('load-desc').textContent = tplHint
    ? `${disc} · ${serie} · ${tplHint}`
    : `${disc} · ${serie} · gerando sugestões para você revisar`;
  document.getElementById('stream-prev').innerHTML = '';

  if (st.imgRendering) {
    document.getElementById('load-desc').textContent = '⏳ Aguardando extração de imagens...';
    const timeout = Date.now() + 15000;
    await new Promise((resolve) => {
      const poll = setInterval(() => {
        if (!st.imgRendering || Date.now() > timeout) { clearInterval(poll); resolve(); }
      }, 300);
    });
  }

  try {
    if (st.ciMode && st.ciPromptOverride) {
      const token = currentSession.access_token;
      const res = await fetch('/api/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: st.ciPromptOverride, images: [] }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      let accumulated = '';
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          const p = JSON.parse(raw);
          if (p.error) throw new Error(p.error);
          if (p.text) accumulated += p.text;
        }
      }
      const parts = accumulated.split('---GABARITO---');
      st.provaText = parts[0]?.trim() || accumulated;
      st.gabText = parts[1]?.trim() || '';
      document.getElementById('prova-text').value = st.provaText;
      document.getElementById('gab-text').value = st.gabText;
      showView('result');
      rTab('preview');
      scheduleExamPreview();
      return;
    }

    document.getElementById('load-desc').textContent =
      `${disc} · ${serie} · IA lendo o material e criando sugestões…`;
    st.reviewFilter = 'all';
    const r = await fetchQuestionSuggestions(reviewBatchCount(), false);
    toast(`${r.count} sugestões prontas — aprove as questões que entrarão na prova.`, 'ok', 5000);
    showView('revisao');
    renderQuestionReview();
  } catch (e) {
    showView(st.ciMode ? 'inteligente' : 'form');
    toast('Erro: ' + e.message, 'err');
  } finally {
    st.ciMode = false;
    st.ciPromptOverride = '';
  }
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function stripMd(s) {
  return String(s)
    .replace(/\*\*\*(.+?)\*\*\*/g,'$1').replace(/\*\*(.+?)\*\*/g,'$1')
    .replace(/\*(.+?)\*/g,'$1').replace(/^#{1,6}\s*/,'').replace(/^>\s*/,'')
    .replace(/`([^`]+)`/g,'$1').trim();
}

function getProvaConteudo() {
  const topicos = v('f-topicos')?.trim();
  if (topicos) return topicos;
  const chIdx = st.selectedChapterIdx;
  if (chIdx >= 0 && st.bookChapters[chIdx]?.title) return st.bookChapters[chIdx].title;
  const manCap = v('f-cap-manual')?.trim();
  if (manCap) return manCap;
  if (st.bookFileName) return st.bookFileName.replace(/\.pdf$/i, '');
  return 'Prova gerada';
}

async function buildProvaPayload(disc, serie) {
  const cab = getCab();
  const provaText = (document.getElementById('prova-text')?.value || st.provaText || '').trim();
  const gabText   = (document.getElementById('gab-text')?.value || st.gabText || '').trim();
  st.provaText = provaText;
  st.gabText   = gabText;
  const qCount = (provaText.match(/^\d+\./gm) || []).length || st.numQ;

  let builder_snapshot = null;
  if (cloudReady() && st.bookFileName) {
    try {
      builder_snapshot = await PedagiaCloud.saveBuilderState(collectBuilderSnapshot());
    } catch (e) { console.warn('builder_snapshot:', e); }
  }

  const exam = buildStateExamModel();

  return {
    disciplina: disc || v('f-disc') || 'Sem disciplina',
    serie: serie || v('f-serie') || '—',
    conteudo: getProvaConteudo(),
    tipo: v('f-tipo') || 'Prova',
    dificuldade: st.dif || 'medio',
    num_questoes: qCount,
    prova_text: provaText,
    gabarito_text: gabText,
    escola: cab.escola || '',
    professor: cab.prof || '',
    cabecalho: cab,
    builder_snapshot,
    exam_model: exam || st.examModel,
  };
}

async function saveProva(disc, serie) {
  const token = currentSession?.access_token;
  if (!token) {
    return { ok: false, error: 'Faça login para salvar a prova.' };
  }
  const payload = await buildProvaPayload(disc, serie);
  if (!payload.prova_text) {
    return { ok: false, error: 'Não há texto da prova para salvar.' };
  }

  try {
    const isUpdate = !!st.currentProvaId;
    const url = isUpdate ? `/api/provas/${st.currentProvaId}` : '/api/provas';
    let body = payload;
    let r = await fetch(url, {
      method: isUpdate ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    let data = await r.json().catch(() => ({}));
    const errMsg = String(data.error || '');
    if (!r.ok && body.exam_model && /exam_model/i.test(errMsg)) {
      const { exam_model, ...rest } = body;
      body = rest;
      r = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      data = await r.json().catch(() => ({}));
      console.warn('exam_model: coluna ausente no Supabase — rode schema.sql (ALTER exam_model). Prova salva sem ExamModel.');
    }
    if (!r.ok) throw new Error(data.error || `Erro ao salvar (${r.status})`);

    st.currentProvaId = data.id || st.currentProvaId;
    document.getElementById('badge-saved').style.display = '';
    saveDraft();
    await loadHistory();
    return { ok: true };
  } catch (e) {
    console.error('saveProva:', e);
    document.getElementById('badge-saved').style.display = 'none';
    return { ok: false, error: e.message || 'Erro desconhecido' };
  }
}

async function saveProvaManual() {
  const btn = document.getElementById('btn-save-prova');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Salvando...'; }
  const res = await saveProva(v('f-disc'), v('f-serie'));
  if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar'; }
  if (res.ok) toast('Prova salva em Minhas provas.', 'ok');
  else toast(res.error || 'Não foi possível salvar.', 'err', 6000);
}

// ══════════════════════════════════════════════
// RESULT TABS
// ══════════════════════════════════════════════
function rTab(t) {
  const prova = document.getElementById('prova-text');
  const gab = document.getElementById('gab-text');
  const preview = document.getElementById('exam-preview-panel');
  if (prova) prova.style.display = t === 'prova' ? '' : 'none';
  if (gab) gab.style.display = t === 'gab' ? '' : 'none';
  if (preview) {
    preview.style.display = t === 'preview' ? '' : 'none';
    preview.classList.toggle('show', t === 'preview');
  }
  document.getElementById('rtab-prova')?.classList.toggle('on', t === 'prova');
  document.getElementById('rtab-preview')?.classList.toggle('on', t === 'preview');
  document.getElementById('rtab-gab')?.classList.toggle('on', t === 'gab');
  if (t === 'preview') refreshExamPreview();
}

// ══════════════════════════════════════════════
// EXERCÍCIOS SALVOS
// ══════════════════════════════════════════════
const EXERCISES_LS_KEY = 'pedagia_saved_exercises_v1';

function exercisesLocalKey() {
  return `${EXERCISES_LS_KEY}_${currentSession?.user?.id || 'anon'}`;
}

function loadExercisesFromLocal() {
  try {
    const raw = localStorage.getItem(exercisesLocalKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveExercisesToLocal(items) {
  try {
    localStorage.setItem(exercisesLocalKey(), JSON.stringify(items.slice(0, 200)));
  } catch {}
}

function formatExercisePreviewText(question) {
  if (!question) return '';
  const alts = (question.alternatives || []).map((a) => `${a.letter}) ${a.text}`).join('\n');
  return `${question.statement}\n\n${alts}\n\nGabarito: ${question.correctAnswer || '?'}`;
}

async function persistSavedExercise(block, image) {
  const token = currentSession?.access_token;
  if (!token) return;

  const body = {
    image_id: block.imageId,
    storage_path: image.storagePath || '',
    image_title: image.title || image.caption || image.sourceText || '',
    page_number: image.pageNumber || image.pageNum || null,
    disciplina: v('f-disc'),
    serie: v('f-serie'),
    question: block.question,
    block_id: block.blockId,
  };

  const localEntry = {
    id: `local_${Date.now()}_${block.imageId}`,
    ...body,
    created_at: new Date().toISOString(),
    _local: true,
  };

  try {
    const r = await fetch('/api/exercicios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 503) {
        const items = loadExercisesFromLocal();
        items.unshift(localEntry);
        saveExercisesToLocal(items);
        toast('Salvo localmente — execute schema-v2 no Supabase para sincronizar na nuvem.', 'ok', 5000);
      } else {
        console.warn('persistSavedExercise', data.error || r.status);
      }
      return;
    }
    if (st.exerciciosData && Array.isArray(st.exerciciosData)) {
      st.exerciciosData.unshift(data);
      renderExercicios(st.exerciciosData);
    }
  } catch (e) {
    console.warn('persistSavedExercise', e);
    const items = loadExercisesFromLocal();
    items.unshift(localEntry);
    saveExercisesToLocal(items);
  }
}

async function resolveExerciseThumbUrl(ex) {
  if (ex._thumbUrl) return ex._thumbUrl;
  const catalog = getImageCatalogEntry(ex.image_id);
  if (catalog?.previewUrl) {
    ex._thumbUrl = catalog.previewUrl;
    return ex._thumbUrl;
  }
  const cloud = typeof window !== 'undefined' ? window.PedagiaCloud : null;
  if (cloudReady() && ex.storage_path && cloud?.signedUrl) {
    try {
      ex._thumbUrl = await cloud.signedUrl(ex.storage_path);
      return ex._thumbUrl;
    } catch (e) {
      console.warn('exercise thumb', e);
    }
  }
  return '';
}

async function loadExercicios() {
  const token = currentSession?.access_token;
  const list = document.getElementById('exercicios-list');
  const status = document.getElementById('exercicios-status');
  if (!token) {
    if (list) list.innerHTML = '<div class="exercicios-empty">Faça login para ver exercícios salvos.</div>';
    return;
  }
  if (list) list.innerHTML = '<div class="exercicios-empty">Carregando...</div>';
  if (status) status.textContent = 'Carregando...';

  let items = [];
  let cloudOk = true;
  try {
    const r = await fetch('/api/exercicios', { headers: { Authorization: 'Bearer ' + token } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 503) {
        cloudOk = false;
        items = loadExercisesFromLocal();
      } else {
        throw new Error(data.error || `Erro ${r.status}`);
      }
    } else {
      items = Array.isArray(data) ? data : [];
      const local = loadExercisesFromLocal().filter((x) => x._local);
      if (local.length) items = [...local, ...items];
    }
  } catch (e) {
    if (list) list.innerHTML = `<div class="exercicios-empty" style="color:var(--R)">Erro: ${escHtml(e.message)}</div>`;
    if (status) status.textContent = 'Erro ao carregar';
    return;
  }

  st.exerciciosData = items;
  if (status) {
    status.textContent = cloudOk
      ? `${items.length} exercício(s) salvo(s)`
      : `${items.length} local(is) — rode schema-v2-material.sql no Supabase`;
  }
  renderExercicios(items);
}

function filterExercicios() {
  const q = (document.getElementById('exercicios-search')?.value || '').toLowerCase();
  const items = (st.exerciciosData || []).filter((ex) => {
    const stmt = ex.question?.statement || '';
    const title = ex.image_title || '';
    const disc = ex.disciplina || '';
    const serie = ex.serie || '';
    return [stmt, title, disc, serie, ex.image_id].some((s) => String(s).toLowerCase().includes(q));
  });
  renderExercicios(items);
}

function renderExercicios(items) {
  const list = document.getElementById('exercicios-list');
  if (!list) return;
  if (!items.length) {
    list.innerHTML =
      '<div class="exercicios-empty">Nenhum exercício salvo ainda. Use &quot;Sugerir questão&quot; em Minhas mídias ou no Material.</div>';
    return;
  }

  list.innerHTML = items
    .map(
      (ex) => `
    <article class="exercicio-card" data-id="${escHtml(ex.id)}">
      <div class="exercicio-card-head">
        <div class="exercicio-thumb-wrap" id="ex-thumb-${escHtml(ex.id)}">
          <span class="exercicio-thumb-ph">🖼</span>
        </div>
        <div class="exercicio-meta">
          <div class="exercicio-title">${escHtml(ex.image_title || ex.image_id || 'Figura')}</div>
          <div class="exercicio-sub">${escHtml(ex.disciplina || '—')} · ${escHtml(ex.serie || '')}${ex.page_number ? ` · p.${ex.page_number}` : ''}</div>
          <div class="exercicio-date">${new Date(ex.created_at).toLocaleString('pt-BR')}</div>
        </div>
        <button type="button" class="hist-del" title="Apagar" onclick="event.stopPropagation();delExercicio('${escHtml(ex.id)}', ${ex._local ? 'true' : 'false'})">🗑</button>
      </div>
      <div class="exercicio-body">${escHtml(formatExercisePreviewText(ex.question)).replace(/\n/g, '<br>')}</div>
      <div class="exercicio-actions">
        <button type="button" class="chip cy" onclick="includeExerciseInProva('${escHtml(ex.id)}')">✓ Incluir na prova</button>
        <button type="button" class="chip" onclick="copyExerciseText('${escHtml(ex.id)}')">📋 Copiar</button>
      </div>
    </article>`,
    )
    .join('');

  items.forEach((ex) => {
    resolveExerciseThumbUrl(ex).then((url) => {
      if (!url) return;
      const wrap = document.getElementById('ex-thumb-' + ex.id);
      if (!wrap) return;
      wrap.innerHTML = `<img src="${url}" alt="" loading="lazy" class="exercicio-thumb">`;
    });
  });
}

async function exerciseToBlock(ex) {
  let image = getCloudImageEntry(ex.image_id) || getImageCatalogEntry(ex.image_id);
  if (!image && ex.storage_path) {
    image = { imageId: ex.image_id, storagePath: ex.storage_path, title: ex.image_title };
  }
  if (image && !getImageCatalogEntry(ex.image_id)) {
    await useCloudImageInBuilder(ex.image_id, { silent: true });
    image = getCloudImageEntry(ex.image_id) || image;
  }
  const b64 = image ? await ensureImageB64(image) : '';
  const block = {
    blockId: ex.block_id || `block_${ex.image_id}_${Date.now()}`,
    selected: true,
    imageId: ex.image_id,
    image: {
      imageId: ex.image_id,
      previewUrl: image?.previewUrl,
      dataUri: image?.dataUri,
      base64: b64,
      caption: image?.caption || ex.image_title,
      pageNumber: ex.page_number || image?.pageNumber,
      w: image?.w,
      h: image?.h,
      storagePath: ex.storage_path || image?.storagePath,
    },
    question: ex.question,
  };
  return block;
}

async function includeExerciseInProva(id) {
  const ex = (st.exerciciosData || []).find((x) => String(x.id) === String(id));
  if (!ex) {
    toast('Exercício não encontrado.', 'err');
    return;
  }
  try {
    const block = await exerciseToBlock(ex);
    upsertImageBlock(block);
    const imgEntry = getImageCatalogEntry(ex.image_id);
    if (imgEntry) imgEntry.savedToBuilder = true;
    syncBlockCardUI(ex.image_id);
    updateBlockSelInfo();
    st.builderSelectedExercises.add(ex.id);
    scheduleSaveBuilder();
    scheduleExamPreview();
    goTo('builder');
    toast('Exercício adicionado ao Montar — revise na seção ⑥.', 'ok', 4500);
  } catch (e) {
    toast('Erro ao incluir: ' + (e.message || e), 'err', 5000);
  }
}

function copyExerciseText(id) {
  const ex = (st.exerciciosData || []).find((x) => String(x.id) === String(id));
  if (!ex?.question) return;
  const text = formatExercisePreviewText(ex.question);
  navigator.clipboard?.writeText(text).then(
    () => toast('Texto copiado.', 'ok'),
    () => toast('Não foi possível copiar.', 'err'),
  );
}

async function delExercicio(id, isLocal) {
  if (!confirm('Apagar este exercício salvo?')) return;
  if (isLocal || String(id).startsWith('local_')) {
    const items = loadExercisesFromLocal().filter((x) => String(x.id) !== String(id));
    saveExercisesToLocal(items);
    st.exerciciosData = (st.exerciciosData || []).filter((x) => String(x.id) !== String(id));
    renderExercicios(st.exerciciosData);
    toast('Exercício removido.', 'ok');
    return;
  }
  const token = currentSession?.access_token;
  if (!token) return;
  try {
    const r = await fetch(`/api/exercicios/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
    st.exerciciosData = (st.exerciciosData || []).filter((x) => String(x.id) !== String(id));
    renderExercicios(st.exerciciosData);
    const status = document.getElementById('exercicios-status');
    if (status) status.textContent = `${st.exerciciosData.length} exercício(s) salvo(s)`;
    toast('Exercício removido.', 'ok');
  } catch (e) {
    toast('Erro ao apagar: ' + e.message, 'err');
  }
}

// ══════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════
async function loadHistory() {
  const token = currentSession?.access_token;
  const list = document.getElementById('hist-list');
  if (!token) {
    if (list) list.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--t3)">Faça login para ver suas provas.</div>';
    return;
  }
  if (list) list.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--t3)">Carregando...</div>';
  try {
    const r = await fetch('/api/provas', { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
    st.historyData = Array.isArray(data) ? data : [];
    renderHistory(st.historyData);
  } catch (e) {
    if (list) list.innerHTML = `<div style="padding:20px;text-align:center;font-size:13px;color:var(--R)">Erro ao carregar: ${escHtml(e.message)}</div>`;
  }
}
function filterHist() {
  const q = document.getElementById('hist-search').value.toLowerCase();
  const items = (st.historyData || []).filter(p =>
    (p.disciplina||'').toLowerCase().includes(q) ||
    (p.serie||'').toLowerCase().includes(q) ||
    (p.conteudo||'').toLowerCase().includes(q)
  );
  renderHistory(items);
}
function renderHistory(items) {
  const list = document.getElementById('hist-list');
  if (!items.length) { list.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--t3)">Nenhuma prova salva ainda.</div>'; return; }
  list.innerHTML = items.map(p => `
    <div class="hist-item" onclick="openProva('${p.id}')">
      <div class="hist-icon">📝</div>
      <div class="hist-body">
        <div class="hist-t">${escHtml(p.disciplina||'Sem disciplina')} · ${escHtml(p.serie||'')}</div>
        <div class="hist-s">${escHtml(p.conteudo||'')} · ${p.num_questoes||'?'}q · ${new Date(p.created_at).toLocaleDateString('pt-BR')}</div>
      </div>
      <button class="hist-del" onclick="event.stopPropagation();delProva('${p.id}')">🗑</button>
    </div>`).join('');
}
async function openProva(id) {
  const token = currentSession?.access_token;
  if (!token) return;
  try {
    const r = await fetch(`/api/provas/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const p = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(p.error || 'Prova não encontrada');
    st.currentProvaId = p.id;
    st.provaText = p.prova_text || '';
    st.gabText   = p.gabarito_text || '';
    document.getElementById('prova-text').value = st.provaText;
    document.getElementById('gab-text').value   = st.gabText;
    document.getElementById('f-disc').value  = p.disciplina || '';
    document.getElementById('f-serie').value = p.serie || '';
    if (p.cabecalho && typeof p.cabecalho === 'object') {
      const c = p.cabecalho;
      ['governo','secretaria','escola','endereco','cidade','fone','prof'].forEach(k => {
        const el = document.getElementById('f-'+k);
        if (el && c[k]) el.value = c[k];
      });
      if (c.bimestre) { const el = document.getElementById('f-bimestre'); if (el) el.value = c.bimestre; }
      saveCab();
    }
    if (p.builder_snapshot && typeof p.builder_snapshot === 'object' && st.bookPdf) {
      try { await applyBuilderSnapshot(p.builder_snapshot); } catch (e) { console.warn('builder da prova:', e); }
    }
    showView('result');
    rTab('preview');
    scheduleExamPreview();
    syncNavPills('history');
    document.getElementById('badge-saved').style.display = '';
    saveDraft();
  } catch (e) {
    toast('Erro ao abrir prova: ' + e.message, 'err');
  }
}
async function delProva(id) {
  const token = currentSession?.access_token;
  if (!token) return;
  try {
    await fetch(`/api/provas/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    await loadHistory();
    toast('Prova removida.', 'ok');
  } catch {}
}

// ══════════════════════════════════════════════
// EXPORT WORD
// ══════════════════════════════════════════════
const DOCX_CDN = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
let _docxLoadPromise = null;

function ensureDocxLib() {
  if (window.docx?.Document && window.docx?.Packer) return Promise.resolve(window.docx);
  if (_docxLoadPromise) return _docxLoadPromise;
  _docxLoadPromise = new Promise((resolve, reject) => {
    const done = () => {
      if (window.docx?.Document) resolve(window.docx);
      else reject(new Error('Biblioteca Word não inicializou. Recarregue a página.'));
    };
    const fail = () => reject(new Error('Não foi possível carregar a biblioteca Word. Verifique sua internet.'));
    const tag = document.querySelector('script[data-docx-lib]');
    if (tag) {
      if (window.docx?.Document) { done(); return; }
      tag.addEventListener('load', done, { once: true });
      tag.addEventListener('error', fail, { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = DOCX_CDN;
    s.crossOrigin = 'anonymous';
    s.dataset.docxLib = '1';
    s.onload = done;
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return _docxLoadPromise;
}

// Converte base64 → Uint8Array para ImageRun do docx.js
function b64ToUint8(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function imgB64Type(b64) {
  const s = String(b64 || '');
  if (s.startsWith('iVBOR')) return 'png';
  if (s.startsWith('/9j/') || s.startsWith('data:image/jpeg')) return 'jpg';
  if (s.startsWith('data:image/png')) return 'png';
  return 'jpg';
}
function cleanB64(b64) {
  return String(b64 || '').replace(/^data:image\/\w+;base64,/, '');
}

function imgDataUriFromB64(b64) {
  const clean = cleanB64(b64);
  if (!clean) return '';
  const mime = imgB64Type(clean) === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${clean}`;
}

function getImageSrcForRender(img) {
  if (!img) return '';
  const b64 = getImageB64(img);
  if (b64) return imgDataUriFromB64(b64);
  const url = img.previewUrl || img.dataUri || img.dataUrl || '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return '';
}

async function resolveImageBytesForDocx(img) {
  const b64 = await resolveImageB64ForExport(img || {});
  if (!b64) return null;
  const clean = cleanB64(b64);
  return {
    data: b64ToUint8(clean),
    type: imgB64Type(clean),
    w: img?.w,
    h: img?.h,
  };
}

async function buildExamDocxBlob() {
  await ensureDocxLib();
  const core = getCore();
  if (core) {
    await ensureExamImagesResolved();
    const exam = buildStateExamModel();
    if (!exam?.questions?.length) throw new Error('Nenhuma questão para exportar.');
    await core.resolveExamModelImages(exam, st.imageCatalog, resolveImageB64ForCore);
    if (core.embedCatalogDataUris) core.embedCatalogDataUris(st.imageCatalog);
    const issues = core.validateExamModel(exam, { strictExport: true, catalog: st.imageCatalog });
    if (core.hasBlockingIssues(issues)) {
      const msgs = issues.filter(i => i.severity === 'error').map(i => i.message);
      throw new Error(msgs.slice(0, 3).join(' ') || 'Prova com erros de validação.');
    }
    const headerImage = await getTemplateHeaderImageBytes();
    return core.renderExamDocx(exam, st.imageCatalog, resolveImageB64ForCore, { headerImage });
  }
  const docxLib = await ensureDocxLib();
  const { Document, Packer, Paragraph, TextRun, ImageRun,
          Table, TableRow, TableCell, WidthType, BorderStyle,
          AlignmentType, ShadingType, VerticalAlign } = docxLib;

  await ensureExamImagesResolved();
  const { questions } = buildExamQuestions();
  if (!questions?.length) throw new Error('Nenhuma questão para exportar.');

  const disc  = v('f-disc');
  const serie = v('f-serie');
  const tipo  = v('f-tipo') || 'Prova';
  const valor = v('f-valor') || '10,0';
  const cab   = getCab();
  const sz = n => n * 2;
  const twip = mm => Math.round(mm * 56.7);

  const cellBorder = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const noBorder   = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
  const noBorders  = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  const mkCell = (children, opts = {}) => new TableCell({
    children,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    columnSpan: opts.span,
    verticalAlign: VerticalAlign.CENTER,
    borders: opts.noBorder ? noBorders : allBorders,
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade } : undefined,
  });

  const mkPara = (text, opts = {}) => new Paragraph({
    children: [new TextRun({
      text: text || '',
      bold: opts.bold,
      size: sz(opts.pt || 9),
      font: 'Times New Roman',
    })],
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 0 },
    indent: opts.indent ? { left: twip(opts.indent) } : undefined,
  });

  const centerLines = [];
  if (cab.governo)    centerLines.push(mkPara(cab.governo.toUpperCase(),    { bold: true, pt: 8, align: AlignmentType.CENTER }));
  if (cab.secretaria) centerLines.push(mkPara(cab.secretaria.toUpperCase(), { bold: true, pt: 8, align: AlignmentType.CENTER }));
  centerLines.push(mkPara((cab.escola || 'ESCOLA').toUpperCase(), { bold: true, pt: 9.5, align: AlignmentType.CENTER }));
  if (cab.endereco)   centerLines.push(mkPara(cab.endereco, { pt: 7, align: AlignmentType.CENTER }));
  if (cab.cidade || cab.fone) {
    const cLine = [cab.cidade, cab.fone ? 'Fone: ' + cab.fone : ''].filter(Boolean).join(' — ');
    centerLines.push(mkPara(cLine, { pt: 7, align: AlignmentType.CENTER }));
  }

  const COL_LOGO = twip(21), COL_MID = twip(142);
  const hdrTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [
      mkCell([mkPara('MS', { bold: true, pt: 10, align: AlignmentType.CENTER })], { width: COL_LOGO }),
      mkCell(centerLines, { width: COL_MID }),
      mkCell([mkPara('RB', { bold: true, pt: 12, align: AlignmentType.CENTER })], { width: COL_LOGO }),
    ] })],
  });

  const bimStr = (v('f-bimestre') || cab.bimestre || '1º Bimestre').replace(' Bimestre', ' BIMESTRE');
  const avTxt  = `"${tipo.toUpperCase()} ${bimStr}" (De 0 a ${valor} pontos)`;
  const mkLabelCell = (label, w) => mkCell([mkPara(label, { bold: true, pt: 9 })], { width: twip(w) });

  const fieldsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        mkCell([new Paragraph({ children: [
          new TextRun({ text: 'PROFESSOR(A): ', bold: true, size: sz(9), font: 'Times New Roman' }),
          new TextRun({ text: cab.prof || '', size: sz(9), font: 'Times New Roman' }),
        ] })], { width: twip(91) }),
        mkCell([new Paragraph({ children: [
          new TextRun({ text: 'DISCIPLINA: ', bold: true, size: sz(9), font: 'Times New Roman' }),
          new TextRun({ text: disc, size: sz(9), font: 'Times New Roman' }),
        ] })], { width: twip(91) }),
      ] }),
      new TableRow({ children: [
        mkLabelCell('ESTUDANTE:', twip(101)),
        mkLabelCell('Nº:', twip(28)),
        mkCell([new Paragraph({ children: [
          new TextRun({ text: 'ANO/ENSINO: ', bold: true, size: sz(9), font: 'Times New Roman' }),
          new TextRun({ text: serie, size: sz(9), font: 'Times New Roman' }),
        ] })], { width: twip(55) }),
      ] }),
      new TableRow({ children: [
        mkCell([mkPara(avTxt, { bold: true, pt: 9, align: AlignmentType.CENTER })], { width: twip(151) }),
        mkLabelCell('NOTA:', twip(33)),
      ] }),
    ],
  });

  const qParagraphs = [];
  const MAX_IMG_W = 270;

  for (const q of questions) {
    const stmt = (q.statementParts || []).join(' ').trim();
    if (!stmt) continue;

    const imgBytes = q.image ? await resolveImageBytesForDocx(q.image) : null;
    if (imgBytes) {
      const imgW = MAX_IMG_W;
      const imgH = imgBytes.h && imgBytes.w
        ? Math.round(imgW * (imgBytes.h / imgBytes.w))
        : Math.round(imgW * 0.65);
      const imgData = imgBytes.data instanceof Uint8Array
        ? imgBytes.data
        : new Uint8Array(imgBytes.data);
      qParagraphs.push(new Paragraph({
        children: [new ImageRun({
          data: imgData,
          transformation: { width: imgW, height: imgH },
          type: imgBytes.type === 'png' ? 'png' : 'jpg',
        })],
        spacing: { before: 160, after: 40 },
      }));
    } else if (q.fromBlock) {
      throw new Error(`Questão ${q.number}: imagem do bloco não está disponível.`);
    }

    qParagraphs.push(new Paragraph({
      children: [new TextRun({
        text: `${q.number}. ${stmt}`,
        bold: true,
        size: sz(10),
        font: 'Times New Roman',
      })],
      spacing: { before: imgBytes ? 0 : 160, after: 60 },
    }));

    for (const a of q.alternatives) {
      qParagraphs.push(new Paragraph({
        children: [new TextRun({
          text: `${a.letter}) ${a.text}`,
          size: sz(9),
          font: 'Times New Roman',
        })],
        spacing: { after: 40 },
        indent: { left: twip(4.5) },
      }));
    }

    const lines = q.answerLines || 0;
    for (let i = 0; i < lines; i++) {
      qParagraphs.push(mkPara('______________________________________________', { pt: 9, after: 80 }));
    }
  }

  const docObj = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: twip(11), bottom: twip(13), left: twip(13), right: twip(13) },
        },
        column: { space: twip(5), count: 2, equalWidth: true, separate: true },
      },
      children: [
        hdrTable,
        fieldsTable,
        new Paragraph({ spacing: { after: 80 } }),
        ...qParagraphs,
      ],
    }],
  });

  return Packer.toBlob(docObj);
}

function downloadBlob(blob, filename) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

function examDocxFilename() {
  const disc = v('f-disc') || 'prova';
  const serie = v('f-serie') || '';
  return `prova_${disc}_${serie}.docx`.replace(/\s/g, '_').replace(/[^\w.\-áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/gi, '');
}

function examPdfFilename() {
  const disc = v('f-disc') || 'prova';
  const serie = v('f-serie') || '';
  return `prova_${disc}_${serie}.pdf`.replace(/\s/g, '_').replace(/[^\w.\-áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/gi, '');
}

function provaTemImagensExport() {
  if (getSelectedImageBlocks().length) return true;
  const exam = buildStateExamModel();
  return !!(exam?.questions?.some(q => q.imageId));
}

async function exportarDocx(opts = {}) {
  const auto = opts.auto === true;
  if (st.templateFile && st.templateKind === 'docx') {
    await exportDocxFromTemplate(opts);
    return;
  }
  if (st.templateFile && st.templateKind === 'pdf') {
    toast('Com modelo PDF da escola, use o botão "PDF (.pdf)".', 'ok', 4000);
    return;
  }
  syncProvaStateFromUI();
  if (!st.provaText?.trim() && !getSelectedImageBlocks().length) {
    toast('Gere a prova ou inclua blocos imagem+questão.', 'err');
    return;
  }

  try {
    await ensureExamImagesResolved();
    const { questions, issues } = buildExamQuestions();
    if (!questions.length) { toast('Nenhuma questão para exportar.', 'err'); return; }
    if (issues.length && !auto) {
      const msg = 'A prova tem problemas:\n\n• ' +
        issues.slice(0, 10).join('\n• ') +
        (issues.length > 10 ? `\n\n…+${issues.length - 10} outro(s).` : '') +
        '\n\nBaixar o Word mesmo assim?';
      if (!confirm(msg)) return;
    } else if (issues.length && auto) {
      console.warn('Avisos na prova:', issues);
    }

    const core = getCore();
    if (core) {
      const exam = buildStateExamModel();
      const valIssues = core.validateExamModel(exam, { strictExport: true, catalog: st.imageCatalog });
      if (core.hasBlockingIssues(valIssues) && !auto) {
        const msgs = valIssues.filter(i => i.severity === 'error').map(i => i.message);
        const msg = 'Problemas na prova:\n\n• ' + msgs.slice(0, 8).join('\n• ') + '\n\nExportar mesmo assim?';
        if (!confirm(msg)) return;
      } else if (core.hasBlockingIssues(valIssues) && auto) {
        console.warn('Exportação automática ignorada — validação:', valIssues);
        return;
      }
    }
    const blob = await buildExamDocxBlob();
    downloadBlob(blob, examDocxFilename());
    toast(auto ? 'Word baixado com imagens.' : 'Arquivo .docx baixado com imagens.', 'ok', 4500);
  } catch (e) {
    console.error(e);
    toast('Erro ao gerar Word: ' + (e.message || e), 'err', 6000);
  }
}

async function exportDocxFromTemplate(opts = {}) {
  const auto = opts.auto === true;
  if (!st.templateFile || st.templateKind !== 'docx') {
    await exportDocxTemplateLegacy();
    return;
  }
  syncProvaStateFromUI();
  if (!st.provaText?.trim() && !getSelectedImageBlocks().length) {
    toast('Gere a prova ou inclua blocos imagem+questão.', 'err');
    return;
  }
  try {
    await ensureExamImagesResolved();
    const core = getCore();
    const exam = buildStateExamModel();
    if (!exam?.questions?.length) {
      toast('Nenhuma questão para exportar.', 'err');
      return;
    }
    if (core) {
      const valIssues = core.validateExamModel(exam, { strictExport: true, catalog: st.imageCatalog });
      if (core.hasBlockingIssues(valIssues) && !auto) {
        const msgs = valIssues.filter(i => i.severity === 'error').map(i => i.message);
        const msg = 'Problemas na prova:\n\n• ' + msgs.slice(0, 8).join('\n• ') + '\n\nExportar mesmo assim?';
        if (!confirm(msg)) return;
      } else if (core.hasBlockingIssues(valIssues) && auto) {
        console.warn('Exportação automática ignorada — validação:', valIssues);
        return;
      }
      await core.resolveExamModelImages(exam, st.imageCatalog, resolveImageB64ForCore);
      if (core.embedCatalogDataUris) core.embedCatalogDataUris(st.imageCatalog);
      if (core.mergeExamIntoDocxTemplate) {
        const blob = await core.mergeExamIntoDocxTemplate(
          await st.templateFile.arrayBuffer(),
          exam,
          st.imageCatalog,
          resolveImageB64ForCore,
          { fillFields: fillDocxFields, gabXml: buildGabXml(st.gabText) },
        );
        downloadBlob(blob, examDocxFilename());
        toast('Word baixado com o cabeçalho da escola.', 'ok', 4500);
        return;
      }
    }
    await exportDocxTemplateLegacy();
  } catch (e) {
    console.error(e);
    toast('Erro ao gerar Word: ' + (e.message || e), 'err', 6000);
  }
}

async function exportDocxTemplateLegacy() {
  if (!window.JSZip) { toast('JSZip não carregado.', 'err'); return; }
  try {
    const ab  = await st.templateFile.arrayBuffer();
    const zip = await JSZip.loadAsync(ab);
    let xml = await zip.file('word/document.xml').async('string');
    xml = fillDocxFields(xml);
    const qXml = buildQuestionsXml(st.provaText) + buildGabXml(st.gabText);
    const si = xml.lastIndexOf('<w:sectPr');
    xml = si !== -1 ? xml.slice(0,si)+qXml+xml.slice(si) : xml.replace('</w:body>',qXml+'</w:body>');
    zip.file('word/document.xml', xml);
    const blob = await zip.generateAsync({ type:'blob', mimeType: DOCX_MIME });
    downloadBlob(blob, examDocxFilename());
  } catch(e) { toast('Erro Word: '+e.message, 'err'); }
}

/** @deprecated use exportDocxFromTemplate */
async function exportDocxTemplate() {
  await exportDocxFromTemplate();
}

function escXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fillDocxFields(xml) {
  const cab = getCab();
  const disc = v('f-disc'), serie = v('f-serie');
  const map = [
    { pats:['professor(a)','professora','professor','prof.'], val: cab.prof },
    { pats:['disciplina','matéria'],                         val: disc },
    { pats:['série','turma','ano'],                          val: serie },
    { pats:['turno'],                                        val: '' },
    { pats:['bimestre','trimestre'],                         val: cab.bimestre },
    { pats:['data:'],                                        val: new Date().toLocaleDateString('pt-BR') },
  ];
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, para => {
    const pt = (para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g)||[]).map(m=>m.replace(/<[^>]+>/g,'')).join('').toLowerCase();
    if (!/_{2,}/.test(para)) return para;
    for (const {pats,val} of map) {
      if (!val) continue;
      if (pats.some(p => pt.includes(p))) {
        let done=false;
        return para.replace(/<w:t([^>]*)>([^<]*_{2,}[^<]*)<\/w:t>/g,(m,a,t)=>{
          if(done) return m; done=true; return `<w:t${a}>${t.replace(/_{2,}/,escXml(val))}</w:t>`;
        });
      }
    }
    return para;
  });
}
// Verifica se uma linha é o marcador [IMAGEM] em qualquer variação
function isImgMarker(t) {
  return t.length < 35 && /\[imagem\]/i.test(t);
}

function buildQuestionsXml(text) {
  return text.split('\n').map(l => {
    const t = l.trim();
    if (!t) return '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>';
    if (isImgMarker(t) || isStandaloneImgMarker(t)) return '';

    const isQ   = /^\d+\./.test(t);
    const isAlt = /^[a-eA-E]\)/.test(t);
    return `<w:p><w:pPr><w:spacing w:before="${isQ?200:0}" w:after="80"/>${isAlt?'<w:ind w:left="560"/>':''}</w:pPr><w:r><w:rPr>${isQ?'<w:b/><w:bCs/>':''}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${escXml(t)}</w:t></w:r></w:p>`;
  }).join('');
}
function buildGabXml(text) {
  if (!text.trim()) return '';
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>GABARITO — USO EXCLUSIVO DO PROFESSOR</w:t></w:r></w:p>${text.split('\n').map(l=>`<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escXml(l.trim())}</w:t></w:r></w:p>`).join('')}`;
}

// ══════════════════════════════════════════════
// PARSER: texto da IA → ExamData estruturado
// ══════════════════════════════════════════════

// Reconhece marcadores autônomos: "[IMAGEM]", "[Imagem 1]", "[Imagem 1 — p.166]",
// "[Imagem da página 5]", "[IMG]", "[FIGURA]", "[CHARGE]", etc.
function isStandaloneImgMarker(raw) {
  return /^\[\s*(imagem|img|figura|ilustra[çc][aã]o|charge|gr[áa]fico|mapa|tabela|foto(grafia)?)[^\]]{0,80}\]\.?$/i.test(raw);
}
// Remove placeholders inline tipo "(observe a imagem [Imagem 1 — p.166])"
function stripInlineImgPlaceholder(text) {
  return text
    .replace(/\[\s*(imagem|img|figura|ilustra[çc][aã]o|charge|gr[áa]fico|mapa|tabela|foto(grafia)?)[^\]]{0,80}\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
// Heurística: questão pede imagem se enunciado menciona observar/analisar imagem
function detectImageNeeded(stmt) {
  const re = /(observe|analise|veja|com base|de acordo com|interprete)[^.]{0,40}(a |o )?(imagem|charge|figura|gr[áa]fico|mapa|tabela|foto(grafia)?|ilustra[çc][aã]o)/i;
  return re.test(stmt);
}

function parseProvaToStructured() {
  const questions = [];
  let cur = null;

  for (const line of st.provaText.split('\n')) {
    const raw = line.trim();
    if (!raw || /^-{3,}$/.test(raw) || /^#{1,6}\s/.test(raw)) continue;
    if (isImgMarker(raw) || isStandaloneImgMarker(raw)) continue;

    let t = stripMd(raw);
    if (!t) continue;
    if (/\[[^\]]*(imagem|charge|figura|gr[áa]fico|mapa|tabela|foto|ilustra)/i.test(t)) {
      t = stripInlineImgPlaceholder(t);
      if (!t) continue;
    }

    const qm = t.match(/^(\d+)\.\s*([\s\S]*)/);
    if (qm) {
      if (cur) questions.push(cur);
      cur = {
        number: parseInt(qm[1]),
        statementParts: [qm[2]],
        image: null,
        imageRequired: false,
        alternatives: [],
        answerLines: 0,
      };
      continue;
    }

    if (!cur) continue;

    const am = t.match(/^([a-eA-E])\)\s*([\s\S]*)/);
    if (am) {
      cur.alternatives.push({ letter: am[1].toLowerCase(), text: am[2] });
      continue;
    }

    if (/^_{5,}/.test(t)) { cur.answerLines++; continue; }

    if (cur.alternatives.length === 0) {
      cur.statementParts.push(t);
    } else {
      cur.alternatives[cur.alternatives.length - 1].text += ' ' + t;
    }
  }
  if (cur) questions.push(cur);
  return questions;
}

// ══════════════════════════════════════════════
// VALIDAÇÃO (PDF exige imagens; Word permite corrigir no editor)
// ══════════════════════════════════════════════
function validateExam(questions, { forWord = false } = {}) {
  const issues = [];
  if (!questions.length) { issues.push('Nenhuma questão foi gerada.'); return issues; }

  for (const q of questions) {
    const stmt = (q.statementParts || []).join(' ').trim();
    if (!stmt) { issues.push(`Questão ${q.number}: enunciado vazio.`); continue; }

    const altCount = q.alternatives.length;
    const isDiscursive = altCount === 0 &&
      (q.answerLines > 0 || /produza|discorra|explique|disserte|elabore|escreva um texto|redija/i.test(stmt));

    if (!isDiscursive) {
      if (altCount === 0) {
        issues.push(`Questão ${q.number}: sem alternativas e não parece discursiva.`);
      } else if (altCount !== 5) {
        issues.push(`Questão ${q.number}: ${altCount} alternativas (esperado: 5).`);
      } else {
        const letters = q.alternatives.map(a => a.letter).join('');
        if (letters !== 'abcde') issues.push(`Questão ${q.number}: alternativas fora de ordem (${letters}).`);
        const emptyAlts = q.alternatives.filter(a => !a.text.trim()).length;
        if (emptyAlts) issues.push(`Questão ${q.number}: ${emptyAlts} alternativa(s) vazia(s).`);
      }
    }

    if (statementHasImgPlaceholder(stmt)) {
      issues.push(`Questão ${q.number}: enunciado contém placeholder de imagem — use blocos da galeria.`);
    }
    if (q.fromBlock && !getImageB64(q.image)) {
      issues.push(`Questão ${q.number}: bloco com imagem inválida.`);
    }
  }
  return issues;
}

// ══════════════════════════════════════════════
// TEMPLATE HTML INSTITUCIONAL
// ══════════════════════════════════════════════
async function renderDocxHeaderToDataUrl(file) {
  if (window.mammoth && window.html2canvas) {
    try {
      const ab = await file.arrayBuffer();
      const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer: ab });
      if (html?.trim()) {
        const wrap = document.createElement('div');
        wrap.style.cssText =
          'position:fixed;left:-12000px;top:0;width:794px;max-width:794px;background:#fff;padding:6px 10px;box-sizing:border-box';
        wrap.innerHTML =
          '<div class="docx-hdr-preview" style="font-family:\'Times New Roman\',Times,serif;font-size:11pt;line-height:1.15;color:#000">' +
          html +
          '</div>';
        document.body.appendChild(wrap);
        try {
          const clip = wrap.querySelector('.docx-hdr-preview') || wrap;
          const canvas = await window.html2canvas(clip, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
          });
          return canvas.toDataURL('image/jpeg', 0.9);
        } finally {
          wrap.remove();
        }
      }
    } catch (e) {
      console.warn('Preview cabeçalho DOCX (mammoth):', e);
    }
  }
  return extractDocxMediaCompositeDataUrl(file);
}

async function extractDocxMediaCompositeDataUrl(file) {
  if (!window.JSZip) return null;
  try {
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const names = Object.keys(zip.files).filter((n) =>
      /^word\/media\/.+\.(png|jpe?g|gif|webp)$/i.test(n),
    );
    if (!names.length) return null;
    const loaded = await Promise.all(
      names.map(async (n) => {
        const base64 = await zip.file(n).async('base64');
        const mime = /\.png$/i.test(n)
          ? 'image/png'
          : /\.gif$/i.test(n)
            ? 'image/gif'
            : 'image/jpeg';
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ img, mime });
          img.onerror = reject;
          img.src = `data:${mime};base64,${base64}`;
        });
      }),
    );
    const maxW = Math.max(...loaded.map((x) => x.img.naturalWidth), 1);
    const totalH = loaded.reduce(
      (s, x) => s + Math.round(x.img.naturalHeight * (maxW / x.img.naturalWidth)),
      0,
    );
    const canvas = document.createElement('canvas');
    canvas.width = maxW;
    canvas.height = Math.max(totalH, 1);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let y = 0;
    for (const { img } of loaded) {
      const h = Math.round(img.naturalHeight * (maxW / img.naturalWidth));
      ctx.drawImage(img, 0, y, maxW, h);
      y += h;
    }
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch (e) {
    console.warn('Preview cabeçalho DOCX (mídia):', e);
    return null;
  }
}

async function getTemplateHeaderPreviewDataUrl() {
  if (!st.templateFile) return null;
  if (st._tplPreviewUrl) return st._tplPreviewUrl;
  try {
    if (st.templateKind === 'pdf') {
      const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
      if (!pdfjsLib) return null;
      const ab = await st.templateFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: Math.min(1.4, 720 / page.getViewport({ scale: 1 }).width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      st._tplPreviewUrl = canvas.toDataURL('image/jpeg', 0.9);
      return st._tplPreviewUrl;
    }
    if (st.templateKind === 'docx') {
      st._tplPreviewUrl = await renderDocxHeaderToDataUrl(st.templateFile);
      return st._tplPreviewUrl;
    }
  } catch (e) {
    console.warn('Preview cabeçalho:', e);
  }
  return null;
}

async function getTemplateHeaderImageBytes() {
  const core = getCore();
  if (!core?.prepareHeaderImageFromDataUrl) return null;
  const url = await getTemplateHeaderPreviewDataUrl();
  if (!url) return null;
  try {
    return await core.prepareHeaderImageFromDataUrl(url);
  } catch (e) {
    console.warn('Cabeçalho para Word:', e);
    return null;
  }
}

async function buildExamPreviewHtml(questions) {
  const headerImageUrl = await getTemplateHeaderPreviewDataUrl();
  return renderExamHtml(questions, { headerImageUrl });
}

function renderExamHtml(questions, opts = {}) {
  const forWord = opts === true || opts?.forWord === true;
  const headerImageUrl = opts?.headerImageUrl || null;
  const cab  = getCab();
  const disc = v('f-disc'), serie = v('f-serie');
  const tipo = v('f-tipo') || 'Prova';
  const valor = v('f-valor') || '10,0';
  const bim  = (v('f-bimestre') || '1º Bimestre').replace(' Bimestre',' BIMESTRE');
  const eh   = s => escHtml(String(s || ''));

  const hdrLines = [
    cab.governo    ? `<div>${eh(cab.governo.toUpperCase())}</div>` : '',
    cab.secretaria ? `<div>${eh(cab.secretaria.toUpperCase())}</div>` : '',
    `<div><strong>${eh((cab.escola || 'ESCOLA').toUpperCase())}</strong></div>`,
    cab.endereco   ? `<div class="addr">${eh(cab.endereco)}</div>` : '',
    (cab.cidade || cab.fone)
      ? `<div class="addr">${eh([cab.cidade, cab.fone ? 'Fone: ' + cab.fone : ''].filter(Boolean).join(' – '))}</div>`
      : '',
  ].filter(Boolean).join('');

  const questionsHtml = questions.map(q => {
    const stmt = q.statementParts.join(' ').trim();
    const imgUri = q.image ? getImageSrcForRender(q.image) : '';
    const imgHtml = imgUri ? `<img class="q-img" src="${imgUri}" alt="">` : '';
    const altsHtml = q.alternatives.map(a =>
      `<div class="alt">${a.letter}) ${eh(a.text)}</div>`
    ).join('');
    const ansHtml = q.answerLines > 0
      ? Array(Math.max(q.answerLines, 5)).fill('<div class="ans-line"></div>').join('')
      : '';
    return `<section class="q">
  ${imgHtml}<div class="qs"><b>${q.number}.</b> ${eh(stmt)}</div>${altsHtml}${ansHtml}
</section>`;
  }).join('\n');

  const css = `
@page { size: A4 portrait; margin: 7mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body {
  font-family: "Times New Roman", Times, serif;
  color: #000;
  font-size: 10.5px;
  line-height: 1.1;
}
${forWord ? `
.exam-shell {
  width: 18.5cm;
  margin: 0 auto;
  border: 3px double #000;
  padding: 4mm;
}
` : `
.exam-shell {
  width: 100%;
  max-width: 18.5cm;
  margin: 0 auto;
  border: 3px double #000;
  padding: 4mm;
  background: #fff;
}
.exam-header-file {
  width: 100%;
  margin-bottom: 6px;
  text-align: center;
}
.exam-header-file img {
  width: 100%;
  max-height: 150px;
  object-fit: contain;
  display: block;
}
`}

/* Cabeçalho institucional — só na 1ª página */
.exam-header {
  display: grid;
  grid-template-columns: 70px 1fr 70px;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.logo-box {
  display: flex; align-items: center; justify-content: center;
  height: 60px;
}
.logo-ms {
  width: 56px; height: 56px; border-radius: 50%;
  border: 2.2px solid #185c22;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 900; color: #185c22;
  letter-spacing: .5px;
}
.logo-rb {
  width: 52px; height: 52px;
  border: 2.5px solid #00008b; border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 900; color: #00008b;
}
.itext {
  text-align: center;
  font-size: 9.5px; font-weight: 700;
  line-height: 1.2; text-transform: uppercase;
  padding: 0 4px;
}
.itext .addr {
  text-transform: none; font-weight: 400; font-size: 8.5px;
}

/* Tabela de identificação */
.id-table {
  width: 100%; border-collapse: collapse;
  font-family: Arial, sans-serif; font-size: 9.5px;
  margin-bottom: 3px;
}
.id-table td {
  border: 1px solid #000;
  padding: 2px 4px;
  height: 20px;
  vertical-align: middle;
}
.id-table .tc { text-align: center; font-weight: 700; }

/* Corpo em DUAS COLUNAS reais */
.questions {
  column-count: 2;
  column-gap: 8px;
  column-rule: 1px solid #000;
  margin-top: 4px;
  text-align: justify;
  font-size: 10.5px;
  line-height: 1.12;
  hyphens: auto;
}
.q {
  break-inside: avoid-column;
  page-break-inside: avoid;
  margin: 0 0 6px 0;
  display: block;
}
.qs { font-weight: bold; margin: 0; }
.qs b { font-weight: bold; }
.alt {
  margin: 0;
  padding-left: 8px;
  text-indent: -8px;
  font-weight: normal;
  text-align: left;
}
.q-img {
  display: block;
  max-width: 100%;
  max-height: 110px;
  width: auto; height: auto;
  object-fit: contain;
  margin: 2px auto;
}
.ans-line {
  border-bottom: 1px solid #000;
  margin: 3px 0;
  height: 11px;
}
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .exam-shell { border: 3px double #000 !important; }
  .q { break-inside: avoid-column !important; page-break-inside: avoid !important; }
  .q-img { max-height: 110px !important; }
}`;

  const fileHeaderHtml = headerImageUrl
    ? `<div class="exam-header-file"><img src="${headerImageUrl}" alt="Cabeçalho da escola"></div>`
    : '';
  const manualHeaderHtml = headerImageUrl ? '' : `
  <header class="exam-header">
    <div class="logo-box"><div class="logo-ms">MS</div></div>
    <div class="itext">${hdrLines}</div>
    <div class="logo-box"><div class="logo-rb">RB</div></div>
  </header>`;

  const bodyInner = `
  ${fileHeaderHtml}${manualHeaderHtml}
  <table class="id-table">
    <tr>
      <td colspan="3"><b>PROFESSOR(A):</b> ${eh(cab.prof)}</td>
      <td colspan="2"><b>DISCIPLINA:</b> ${eh(disc)}</td>
    </tr>
    <tr>
      <td colspan="3"><b>ESTUDANTE:</b></td>
      <td><b>Nº:</b></td>
      <td><b>ANO/ENSINO:</b> ${eh(serie)}</td>
    </tr>
    <tr>
      <td colspan="4" class="tc"><b>"${eh(tipo.toUpperCase())} ${eh(bim)}"</b> (De 0 a ${eh(valor)} pontos)</td>
      <td class="tc"><b>NOTA:</b></td>
    </tr>
  </table>
  <main class="questions">
${questionsHtml}
  </main>`;

  if (forWord) {
    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word" lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="PedagIA">
<title>Prova — ${eh(disc)} — ${eh(serie)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>${css}</style>
</head>
<body>
<div class="exam-shell">${bodyInner}
</div>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Prova — ${eh(disc)} — ${eh(serie)}</title>
<style>${css}</style>
</head>
<body>
<div class="exam-shell">${bodyInner}
</div>
</body>
</html>`;
}

// ══════════════════════════════════════════════
// TEMPLATE GABARITO (PDF separado)
// ══════════════════════════════════════════════
function renderGabaritoHtml() {
  const cab = getCab();
  const disc = v('f-disc'), serie = v('f-serie');
  const eh = s => escHtml(String(s || ''));
  const lines = (st.gabText || '').split('\n')
    .map(l => stripMd(l.trim()))
    .filter(l => l && !/^-{3,}$/.test(l) && !/^#{1,6}\s/.test(l))
    .map(l => `<div class="gl">${eh(l)}</div>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Gabarito — ${eh(disc)} — ${eh(serie)}</title>
<style>
@page { size: A4 portrait; margin: 12mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Times New Roman", Times, serif; font-size: 11px; line-height: 1.35; color: #000; }
h1 { font-size: 14px; margin-bottom: 4px; text-transform: uppercase; border-bottom: 2px solid #00008b; padding-bottom: 3px; }
.sub { color: #444; font-size: 10px; margin-bottom: 12px; }
.gl { margin: 3px 0; }
</style></head><body>
<h1>Gabarito — Uso exclusivo do professor</h1>
<div class="sub">${eh(cab.escola || '')} · ${eh(disc)} · ${eh(serie)}</div>
${lines}
</body></html>`;
}

// ══════════════════════════════════════════════
// EXPORT PDF — download direto (.pdf)
// ══════════════════════════════════════════════
async function waitIframeImages(doc) {
  const imgs = [...(doc?.querySelectorAll('img') || [])];
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 12000);
    });
  }));
}

async function downloadPdfFromExamHtml(html) {
  const h2p = window.html2pdf;
  if (!h2p) throw new Error('Biblioteca html2pdf não carregada. Recarregue a página.');

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  iframe.srcdoc = html;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tempo esgotado ao montar o PDF.')), 50000);
    iframe.onload = () => { clearTimeout(timer); resolve(); };
    iframe.onerror = () => { clearTimeout(timer); reject(new Error('Falha ao renderizar a prova.')); };
  });

  const doc = iframe.contentDocument;
  if (!doc) throw new Error('Não foi possível renderizar a prova.');
  const target = doc.querySelector('.exam-shell') || doc.body;
  await waitIframeImages(doc);

  await h2p().set({
    margin: [7, 7, 7, 7],
    filename: examPdfFilename(),
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  }).from(target).save();

  iframe.remove();
}

async function exportarPdfHtml() {
  syncProvaStateFromUI();
  if (!st.provaText?.trim() && !getSelectedImageBlocks().length) {
    toast('Gere a prova ou inclua blocos imagem+questão.', 'err');
    return;
  }

  await ensureExamImagesResolved();
  const { exam, questions, issues } = getExamBuildResult();
  if (!questions.length) { toast('Nenhuma questão para exportar.', 'err'); return; }

  const core = getCore();
  if (core && exam) {
    const valIssues = core.validateExamModel(exam, { strictExport: true, catalog: st.imageCatalog });
    if (core.hasBlockingIssues(valIssues)) {
      const msgs = valIssues.filter(i => i.severity === 'error').map(i => i.message);
      toast('Corrija antes de exportar: ' + msgs[0], 'err', 6000);
      return;
    }
  } else if (issues.length) {
    const msg = 'A prova tem problemas:\n\n• ' +
      issues.slice(0, 10).join('\n• ') +
      (issues.length > 10 ? `\n\n…+${issues.length - 10} outro(s).` : '') +
      '\n\nBaixar o PDF mesmo assim?';
    if (!confirm(msg)) return;
  }

  try {
    toast('Gerando PDF…', 'ok', 2500);
    let html;
    if (core && exam) {
      await core.resolveExamModelImages(exam, st.imageCatalog, resolveImageB64ForCore);
      if (core.embedCatalogDataUris) core.embedCatalogDataUris(st.imageCatalog);
      const headerImageUrl = await getTemplateHeaderPreviewDataUrl();
      html = core.renderExamHtml(exam, st.imageCatalog, { headerImageUrl });
    } else {
      html = await buildExamPreviewHtml(questions);
    }
    await downloadPdfFromExamHtml(html);
    toast('PDF baixado.', 'ok', 4000);
  } catch (e) {
    console.error(e);
    toast('Erro ao gerar PDF: ' + (e.message || e), 'err', 6000);
  }
}

// Gera gabarito como PDF separado (uso exclusivo do professor)
async function exportarGabaritoHtml() {
  if (!st.gabText?.trim()) { toast('Não há gabarito disponível.', 'err'); return; }
  const core = getCore();
  const html = core && st.examModel
    ? core.renderGabaritoHtml(st.examModel)
    : renderGabaritoHtml();
  const win = window.open('', '_blank');
  if (!win) { toast('Pop-up bloqueado.', 'err'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  const triggerPrint = () => { try { win.focus(); win.print(); } catch(e){} };
  if (win.document.readyState === 'complete') setTimeout(triggerPrint, 250);
  else win.addEventListener('load', () => setTimeout(triggerPrint, 250));
}

// ══════════════════════════════════════════════
// EXPORT PDF
// ══════════════════════════════════════════════
async function exportarPdf() {
  if (st.templateFile && st.templateKind === 'pdf') { await exportPdfTemplate(); return; }
  await exportarPdfHtml();
}

async function exportPdfTemplate() {
  if (!window.PDFLib) { toast('pdf-lib não carregado.', 'err'); return; }
  try {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const ab = await st.templateFile.arrayBuffer();
    const tpl = await PDFDocument.load(ab);
    const out = await PDFDocument.create();
    const cnt = tpl.getPageCount();
    const cp  = await out.copyPages(tpl, [...Array(cnt).keys()]);
    cp.forEach(p => out.addPage(p));

    const fn = await out.embedFont(StandardFonts.Helvetica);
    const fb = await out.embedFont(StandardFonts.HelveticaBold);
    const { width, height } = out.getPage(0).getSize();
    let page = out.addPage([width, height]), y = height - 40;
    const ml = 40, usable = width - 80;

    const wrap = (text, font, sz) => {
      const words = text.split(' '); const lines = []; let cur = '';
      for (const w of words) {
        const test = cur ? cur+' '+w : w;
        if (font.widthOfTextAtSize(test, sz) > usable && cur) { lines.push(cur); cur=w; } else cur=test;
      }
      if (cur) lines.push(cur); return lines;
    };
    const draw = (text, font, sz, extra=0) => {
      for (const ln of wrap(text, font, sz)) {
        if (y < 50) { page = out.addPage([width,height]); y = height-40; }
        page.drawText(ln, {x:ml, y, font, size:sz, color:rgb(0.05,0.05,0.12)});
        y -= sz+4;
      }
      y -= extra;
    };

    const tplStripMd = stripMd;

    for (const l of st.provaText.split('\n')) {
      const raw=l.trim();
      if (!raw || /^-{3,}$/.test(raw) || /^#{1,6}\s/.test(raw)) { y-=4; continue; }
      if (isImgMarker(raw) || isStandaloneImgMarker(raw)) continue;

      const t = tplStripMd(raw);
      if (!t) continue;
      const isQ=/^\d+\./.test(t), isAlt=/^[a-eA-E]\)/.test(t);
      if(isQ) y-=8;
      draw(t, isQ?fb:fn, isQ?12:11, isAlt?0:1);
    }
    if (st.gabText.trim()) {
      page = out.addPage([width,height]); y = height-40;
      draw('GABARITO — USO EXCLUSIVO DO PROFESSOR', fb, 13, 8);
      for (const l of st.gabText.split('\n')) { const t=l.trim(); if(!t){y-=6;continue;} draw(t,fn,11,1); }
    }

    const bytes = await out.save();
    const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),download:`prova_${v('f-disc')}.pdf`});
    a.click();
  } catch(e) { toast('Erro PDF: '+e.message,'err'); }
}

// ══════════════════════════════════════════════
// CRIADOR INTELIGENTE
// ══════════════════════════════════════════════
function ciStep(n) {
  st.ciStep = n;
  [1,2,3].forEach(i => {
    document.getElementById(`ci-s${i}`).style.display = i===n ? '' : 'none';
    const d = document.getElementById(`ci-d${i}`);
    d.className = 'ci-dot' + (i<n?' done':i===n?' act':'');
    d.textContent = i<n ? '✓' : i;
  });
  ['ci-l12','ci-l23'].forEach((id,i) => {
    const el = document.getElementById(id);
    if(el) el.classList.toggle('done', n > i+1);
  });
  if(n===3) renderCISummary();
  window.scrollTo({top:0,behavior:'smooth'});
}

async function handleCIExam(input) {
  const file = input.files?.[0];
  if (!file) return;
  const kind = getKind(file);
  if (!kind) { toast('Envie PDF ou Word.','err'); return; }

  document.getElementById('ci-exam-empty').style.display = 'none';
  document.getElementById('ci-exam-loaded').style.display = '';
  document.getElementById('ci-exam-icon').textContent = kind==='pdf'?'📄':'📝';
  document.getElementById('ci-exam-name').textContent = file.name;
  document.getElementById('ci-exam-status').textContent = 'Analisando...';
  st.ciExamFileName = file.name;

  try {
    let text = '';
    if (kind === 'pdf') {
      const pdfjsLib = window['pdfjs-dist/build/pdf']||window.pdfjsLib;
      if (!pdfjsLib) throw new Error('pdf.js não carregado');
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({data:ab}).promise;
      for (let p=1;p<=Math.min(pdf.numPages,15);p++) {
        const pg = await pdf.getPage(p);
        const ct = await pg.getTextContent();
        text += ct.items.map(i=>i.str).join(' ') + '\n';
      }
    } else {
      const ab = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const xml = await zip.file('word/document.xml').async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml,'application/xml');
      const wNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const paras = doc.getElementsByTagNameNS(wNS,'p');
      const lines = [];
      for (const p of paras) {
        let ln=''; for(const r of p.getElementsByTagNameNS(wNS,'t')) ln+=r.textContent;
        if(ln.trim()) lines.push(ln.trim());
      }
      text = lines.join('\n');
    }
    st.ciExamText = text;
    const an = analyzeFormat(text);
    st.ciExamAnalysis = an;
    document.getElementById('ci-exam-status').textContent = `${an.total} questão(ões) · formato aprendido`;
    document.getElementById('ci-analysis-txt').innerHTML =
      `📊 ${an.total}q total · ${an.mc} MC · ${an.vf} V/F · ${an.disc} discursivas · numeração "${an.num}"`;
    document.getElementById('ci-analysis').style.display = '';
    const btn = document.getElementById('ci-btn1');
    btn.disabled = false; btn.style.opacity='1';
    st.ciNumQ = Math.min(Math.max(an.total||10,5),20);
    document.getElementById('ci-nv').textContent = st.ciNumQ;
    toast('Formato da prova aprendido!','ok');
  } catch(e) {
    document.getElementById('ci-exam-status').textContent = 'Erro: '+e.message;
    toast(e.message,'err');
  }
}

function analyzeFormat(text) {
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  let total=0,mc=0,vf=0,num='1.',altStyle='a) b)';
  for(const l of lines) {
    if(/^\d+\.\s/.test(l)){total++;num='1.';}
    else if(/^\d+\)\s/.test(l)){total++;num='1)';}
    else if(/^questão\s+\d+/i.test(l)){total++;num='Questão N';}
    if(/^[a-eA-E]\)/.test(l)){mc++;altStyle='a) b) c) d) e)';}
    if(/^[a-eA-E]\./.test(l)){mc++;altStyle='a. b. c. d. e.';}
    if(/verdadeiro|falso/i.test(l)) vf++;
  }
  mc=Math.round(mc/5); vf=Math.round(vf/2);
  const disc=Math.max(0,total-mc-vf);
  return {total,mc,vf,disc,num,altStyle};
}

async function handleCIBook(input) {
  const file = input.files?.[0];
  if (!file) return;
  const kind = getKind(file);
  if (!kind) { toast('Envie PDF ou Word.','err'); return; }

  document.getElementById('ci-book-empty').style.display='none';
  document.getElementById('ci-book-loaded').style.display='';
  document.getElementById('ci-book-name').textContent=file.name;
  document.getElementById('ci-book-status').textContent='Carregando...';
  st.ciBookFileName=file.name;

  try {
    if (kind==='pdf') {
      const pdfjsLib = window['pdfjs-dist/build/pdf']||window.pdfjsLib;
      const ab = await file.arrayBuffer();
      st.ciBookPdf = await pdfjsLib.getDocument({data:ab}).promise;
      document.getElementById('ci-book-status').textContent=`${st.ciBookPdf.numPages} páginas`;
      document.getElementById('ci-sum-area').style.display='';
    } else {
      const ab = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const xml = await zip.file('word/document.xml').async('string');
      const parser=new DOMParser();
      const doc=parser.parseFromString(xml,'application/xml');
      const wNS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const paras=doc.getElementsByTagNameNS(wNS,'p');
      const lines=[];
      for(const p of paras){let ln='';for(const r of p.getElementsByTagNameNS(wNS,'t'))ln+=r.textContent;if(ln.trim())lines.push(ln.trim());}
      st.ciBookText=lines.join('\n');
      const chs=parseSumarioText(st.ciBookText);
      st.ciBookChapters=chs;
      document.getElementById('ci-book-status').textContent=`${chs.length} capítulo(s) detectado(s)`;
      renderChapterList(chs,'ci-chap-list',selectCIChapter);
      document.getElementById('ci-chaps').style.display='';
    }
    const btn=document.getElementById('ci-btn2');
    btn.disabled=false; btn.style.opacity='1';
    toast('Livro carregado!','ok');
  } catch(e){ document.getElementById('ci-book-status').textContent='Erro: '+e.message; }
}

async function ciLerSum() {
  const pg = parseInt(document.getElementById('ci-pg').value);
  if (!pg || !st.ciBookPdf) { toast('Informe o número da página do sumário.', 'err'); return; }

  const btn = document.querySelector('#ci-s2 .btn-ir');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ IA lendo...'; }
  toast('🤖 IA identificando capítulos...', 'ok', 8000);

  try {
    const txt = await extractPagesRaw(st.ciBookPdf, pg, pg + 2);
    const chs = await callSumarioIA(txt);
    st.ciBookChapters = chs;
    renderChapterList(chs, 'ci-chap-list', selectCIChapter);
    document.getElementById('ci-chaps').style.display = '';
    toast(`${chs.length} capítulo(s) identificado(s)!`, chs.length ? 'ok' : 'err');
  } catch(e) {
    toast('Erro: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Ler sumário →'; }
  }
}

function selectCIChapter(el, idx) {
  const sel=st.ciBookSelectedChapters;
  sel.has(idx)?sel.delete(idx):sel.add(idx);
  document.querySelectorAll('#ci-chap-list .citem').forEach(c=>{
    c.classList.toggle('on', sel.has(parseInt(c.dataset.idx)));
  });
}
function onCIManualCap(){
  st.ciBookChapterManual=document.getElementById('ci-cap-manual').value.trim();
  st.ciBookSelectedChapters.clear();
  document.querySelectorAll('#ci-chap-list .citem').forEach(c=>c.classList.remove('on'));
}
function ciChN(d){
  st.ciNumQ=Math.min(30,Math.max(3,st.ciNumQ+d));
  document.getElementById('ci-nv').textContent=st.ciNumQ;
}
function renderCISummary(){
  const sel=[...st.ciBookSelectedChapters].sort((a,b)=>a-b);
  const chRef=st.ciBookChapterManual||(sel.length?sel.map(i=>st.ciBookChapters[i]?.title).join(' + '):'—');
  const an=st.ciExamAnalysis;
  document.getElementById('ci-summary').innerHTML=
    `<strong style="color:var(--Y)">Resumo:</strong><br>
     📄 Modelo: <strong style="color:var(--t1)">${st.ciExamFileName||'—'}</strong><br>
     ${an?`📊 Formato: ${an.total}q · ${an.mc} MC · ${an.vf} V/F · "${an.num}"<br>`:''}
     📚 Livro: <strong style="color:var(--t1)">${st.ciBookFileName||'—'}</strong><br>
     📑 Capítulo(s): <strong style="color:var(--t1)">${chRef}</strong>`;
}

async function gerarClone() {
  const disc=document.getElementById('ci-disc').value.trim();
  const serie=document.getElementById('ci-serie').value.trim();
  if(!disc||!serie){document.getElementById('ci-err').style.display='';return;}
  document.getElementById('ci-err').style.display='none';
  if(!st.ciExamText){toast('Carregue a prova modelo.','err');return;}

  document.getElementById('f-disc').value=disc;
  document.getElementById('f-serie').value=serie;
  st.numQ=st.ciNumQ; st.dif=st.ciDif;

  // Build chapter content from CI book
  let chapText='', chRef='';
  const sel=[...st.ciBookSelectedChapters].sort((a,b)=>a-b);
  chRef=st.ciBookChapterManual||(sel.length?sel.map(i=>st.ciBookChapters[i]?.title).join(' + '):'—');

  if(st.ciBookPdf && sel.length>0) {
    // Extract pages from CI book PDF
    const ch0=st.ciBookChapters[sel[0]];
    const chlast=st.ciBookChapters[sel[sel.length-1]];
    const nxt=st.ciBookChapters[sel[sel.length-1]+1];
    const startPg=ch0?.pageNum||1;
    const endPg=nxt?.pageNum?nxt.pageNum-1:Math.min(startPg+29, st.ciBookPdf.numPages);
    for(let p=startPg;p<=endPg;p++){
      try{
        const page=await st.ciBookPdf.getPage(p);
        const ct=await page.getTextContent();
        chapText+=`[Pág ${p}]\n${ct.items.map(i=>i.str).join(' ')}\n\n`;
      }catch{}
    }
  } else if(st.ciBookText) {
    const body=st.ciBookText.slice(Math.floor(st.ciBookText.length*0.12));
    chapText=body.slice(0,10000);
  }

  const core = getCore();
  if (core && st.ciExamText) {
    st.examTemplate = core.extractExamTemplateFromText(st.ciExamText);
    st.ciNumQ = st.examTemplate.questionCount || st.ciNumQ;
  }
  const an=st.ciExamAnalysis;
  st.ciMode=true;
  st.ciPromptOverride=`BLOCO 1 — INSTRUÇÃO GERAL
Você é um elaborador especialista de provas no padrão ENEM/vestibular para escolas estaduais brasileiras.
Sua tarefa é CLONAR O FORMATO da prova modelo abaixo e gerar questões NOVAS com base no livro fornecido.
TODA questão de múltipla escolha precisa de contextualizador. Alternativas SEMPRE minúsculas: a) b) c) d) e)

════════════════════════════════════════════════
BLOCO 2 — PROVA MODELO (clone o formato, NÃO as questões)
════════════════════════════════════════════════
${st.ciExamText.slice(0,4500)}
${an?`\nFORMATO DETECTADO: ${an.total}q total · ${an.mc} MC · ${an.vf} V/F · ${an.disc} discursivas · numeração "${an.num}" · alternativas "${an.altStyle}"`:''}

════════════════════════════════════════════════
BLOCO 3 — REGRAS DO CLONE
════════════════════════════════════════════════
1. Clone a numeração ("${an?.num||'1.'}"), espaçamentos e estrutura visual do modelo.
2. Clone a proporção de tipos: ${an?`${an.mc} MC · ${an.vf} V/F · ${an.disc} discursivas`:'igual ao modelo'}.
3. Alternativas: SEMPRE minúsculas a) b) c) d) e) (obrigatório — padrão ENEM).
4. CONTEXTUALIZADOR obrigatório em toda MC (texto, dado, gráfico, charge, mapa).
5. Fontes das questões: EXCLUSIVAMENTE do livro — NUNCA inventar.
6. NÃO copie questões — crie questões totalmente novas sobre o conteúdo do livro.
7. Frase motivacional em itálico ao final da prova.

════════════════════════════════════════════════
BLOCO 4 — CONTEÚDO DO LIVRO (ÚNICA FONTE)
════════════════════════════════════════════════
Livro/Apostila: "${st.ciBookFileName}"
Capítulo(s): ${chRef}
Disciplina: ${disc} · Série: ${serie} · ${st.ciNumQ} questões

--- TEXTO EXTRAÍDO DO LIVRO ---
${chapText.slice(0,10000)}
--- FIM DO TEXTO ---

REGRA ABSOLUTA: Use SOMENTE o conteúdo acima. Não busque informações externas.
Após todas as questões escreva EXATAMENTE: ---GABARITO---
No gabarito: letra correta + justificativa + citação da página do livro.`;

  await gerarProva();
}

// ══════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════
let toastTimer;
function toast(msg, type='ok', ms=3000) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.className = 'toast ' + (type==='err'?'err':'ok') + ' show';
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ══════════════════════════════════════════════
// BOOT — expõe handlers do HTML (onclick/onchange) em window
// ══════════════════════════════════════════════
function attachPedagiaGlobals() {
  if (typeof window === 'undefined') return;
  const w = window;
  w.st = st;
  w.getImageB64 = getImageB64;
  w.cleanB64 = cleanB64;
  w.imgB64Type = imgB64Type;
  w.b64ToUint8 = b64ToUint8;
  Object.defineProperty(w, 'currentSession', {
    get: () => currentSession,
    set: (v) => { currentSession = v; },
    configurable: true,
  });
  Object.defineProperty(w, '_sb', {
    get: () => _sb,
    set: (v) => { _sb = v; },
    configurable: true,
  });
  Object.assign(w, {
    chImgQ, chN, ciChN, ciLerSum, ciStep,
    doAuth, doLogout, switchAuth,
    exportarPdf, exportarDocx, exportarGabaritoHtml, exportarPdfHtml,
    gerarProva, gerarClone, gerarMaisQuestoes, montarProvaAprovadas,
    setReviewFilter, approveReviewQuestion, rejectReviewQuestion, undoReviewQuestion,
    moveReviewQuestion, selecionarIntervaloPaginas,
    initBuilderView, builderSyncFields, builderChNumQ, builderOnMaterialChange,
    builderApplyPages, builderOnHeaderChange, builderToggleMedia, builderToggleExercise,
    builderGenerateMediaExercise, builderApproveMediaExercise, builderRejectMediaExercise,
    builderRegenerateMediaExercise, builderSetMediaDraftType,
    builderTogglePage, builderConfirmPages, builderResetPagesConfirm, builderOnTopicosInput,
    builderOnAdaptadaToggle, builderSetPoolTab, builderGerarQuestoes, builderMontarProva,
    builderApprovePoolItem, builderRejectPoolItem, builderUndoPoolItem, builderSetPoolItemType,
    builderLoadCropPages, builderToggleInProva,
    saveProvaManual,
    goTo, showView, rTab, saveCab,
    setHtab, setSrc, setDif, updateDist,
    handleTemplateFile, removeTemplate, handleBookFile,
    handleCIExam, handleCIBook, lerSum, pularSumarioUsarTodasPaginas,
    saveHeaderToLibrary, onHeaderSelectChange, deleteHeaderFromLibrary, applyHeader,
    exportDocxTemplate, clearBuilderData, clearMaterialWorkflowOnly,
    deleteMaterialFromLibrary, renderMaterialLibrary, materialLibraryAddNew,
    selectMaterialLibraryItem, useMaterialInMontar, clearSavedBuilder,
    onProvaTextEdit, scheduleExamPreview, refreshExamPreview,
    openProva, delProva, filterHist,
    togImgBlockCard, saveImageToBuilder, suggestQuestionForImage, togP,
    showImageReviewPanel, persistMaterialChapters,
    switchMaterial, startNewMaterial, fetchMaterialsList,
    openCropBuilder, closeCropBuilder, confirmCropSelection, resetCropSelection,
    openImageNameModal, closeImageNameModal, confirmImageCatalogEntry,
    refreshCloudImagesDashboard, refreshMidiasPage, filterMidiasByName, selectAllMidiasVisible,
    clearMidiasSelection, toggleMidiaSelection, deleteSelectedMidias,
    useCloudImageInBuilder, openCloudImageModal,
    deleteCloudImage, handleMidiasUpload,
    setMidiaGenCategory, generateMidiaVisual, saveGeneratedMidiaToCloud,
    loadExercicios, filterExercicios, includeExerciseInProva, copyExerciseText, delExercicio,
    onBnccPrefsChange, moveExamPlanItem, toggleExamPlanBlock,
    evbSetFilter, evbSelectAllBlocks, evbClearAllBlocks, evbSuggestOrder,
    toast,
  });
}

/** Reaplica barra/app após o React remontar o DOM (ex.: fim do overlay de carregamento). */
export function reconcilePedagiaSessionUi() {
  if (currentSession?.user) {
    onLogin(currentSession, { skipTplToast: true });
    return;
  }
  if (_authBootstrapSettled && _sb) {
    void recoverSessionWithRefresh().then((session) => {
      if (session?.user) onLogin(session, { skipTplToast: true });
      else if (_authBootstrapSettled) showLoggedOutShell();
    });
  }
}

let _bootPromise = null;

export async function bootPedagiaLegacy() {
  if (!_bootPromise) {
    _bootPromise = (async () => {
      attachPedagiaGlobals();
      await init();
    })();
  }
  return _bootPromise;
}

if (typeof window !== 'undefined') {
  attachPedagiaGlobals();
}
