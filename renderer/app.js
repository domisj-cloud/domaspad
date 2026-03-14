import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { xml } from '@codemirror/lang-xml';
import { openSearchPanel } from '@codemirror/search';

// --- State ---
let tabs = [];
let activeTabId = null;
let editorView = null;
let saveTimeout = null;
let currentTheme = 'dark';
const themeCompartment = new Compartment();

const LANG_MAP = {
  js: { ext: javascript, name: 'JavaScript' },
  mjs: { ext: javascript, name: 'JavaScript' },
  jsx: { ext: () => javascript({ jsx: true }), name: 'JSX' },
  ts: { ext: () => javascript({ typescript: true }), name: 'TypeScript' },
  tsx: { ext: () => javascript({ jsx: true, typescript: true }), name: 'TSX' },
  html: { ext: html, name: 'HTML' },
  htm: { ext: html, name: 'HTML' },
  css: { ext: css, name: 'CSS' },
  scss: { ext: css, name: 'SCSS' },
  json: { ext: json, name: 'JSON' },
  py: { ext: python, name: 'Python' },
  md: { ext: markdown, name: 'Markdown' },
  sql: { ext: sql, name: 'SQL' },
  java: { ext: java, name: 'Java' },
  c: { ext: cpp, name: 'C' },
  cpp: { ext: cpp, name: 'C++' },
  h: { ext: cpp, name: 'C/C++ Header' },
  xml: { ext: xml, name: 'XML' },
  svg: { ext: xml, name: 'SVG' },
  yaml: { ext: null, name: 'YAML' },
  yml: { ext: null, name: 'YAML' },
  txt: { ext: null, name: 'Plain Text' },
  sh: { ext: null, name: 'Shell' },
  bash: { ext: null, name: 'Bash' },
  zsh: { ext: null, name: 'Zsh' },
};

// --- DOM refs ---
const tabsEl = document.getElementById('tabs');
const editorContainer = document.getElementById('editor-container');
const statusPosition = document.getElementById('status-position');
const statusLanguage = document.getElementById('status-language');
const newTabBtn = document.getElementById('new-tab-btn');

// --- Tab helpers ---
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getExtension(name) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getLangInfo(filename) {
  const ext = getExtension(filename);
  return LANG_MAP[ext] || { ext: null, name: 'Plain Text' };
}

function getLanguageExtension(filename) {
  const info = getLangInfo(filename);
  if (!info.ext) return [];
  return [typeof info.ext === 'function' ? info.ext() : info.ext()];
}

// --- Editor ---
function createEditor(content, filename, cursorPos) {
  if (editorView) {
    editorView.destroy();
  }

  const langExts = getLanguageExtension(filename);

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.selectionSet || update.docChanged) {
      updateStatusBar(update.state);
    }
    if (update.docChanged) {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) {
        tab.content = update.state.doc.toString();
        scheduleSave();
      }
    }
  });

  const state = EditorState.create({
    doc: content,
    extensions: [
      basicSetup,
      themeCompartment.of(currentTheme === 'dark' ? oneDark : []),
      EditorView.lineWrapping,
      updateListener,
      ...langExts,
    ],
    selection: cursorPos != null ? { anchor: cursorPos } : undefined,
  });

  editorView = new EditorView({
    state,
    parent: editorContainer,
  });

  editorView.focus();
  updateStatusBar(editorView.state);
}

function updateStatusBar(state) {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const col = pos - line.from + 1;
  statusPosition.textContent = `Ln ${line.number}, Col ${col}`;

  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) {
    tab.cursorPos = pos;
    const info = getLangInfo(tab.name);
    statusLanguage.textContent = info.name;
  }
}

// --- Tab management ---
function createTab(name, content = '', filePath = null, cursorPos = 0) {
  const id = generateId();
  const tab = { id, name, content, filePath, cursorPos };
  tabs.push(tab);
  renderTabs();
  switchTab(id);
  scheduleSave();
  return tab;
}

function switchTab(id) {
  activeTabId = id;
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;

  renderTabs();
  createEditor(tab.content, tab.name, tab.cursorPos);
  scheduleSave();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    createTab('Untitled-1');
    return;
  }

  if (activeTabId === id) {
    const newIdx = Math.min(idx, tabs.length - 1);
    switchTab(tabs[newIdx].id);
  } else {
    renderTabs();
  }
  scheduleSave();
}

function renderTabs() {
  tabsEl.replaceChildren();
  tabs.forEach((tab, index) => {
    const el = document.createElement('div');
    el.className = `tab${tab.id === activeTabId ? ' active' : ''}`;
    el.draggable = true;
    el.dataset.tabId = tab.id;
    el.dataset.tabIndex = index;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tab.name;
    el.appendChild(titleSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Close';
    closeBtn.textContent = '\u2715';
    el.appendChild(closeBtn);

    // Click to switch
    el.addEventListener('click', () => switchTab(tab.id));

    // Close button
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    // Middle-click to close
    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    // Right-click context menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTabContextMenu(e.clientX, e.clientY, tab.id, index);
    });

    // Drag and drop reordering
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', tab.id);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.querySelectorAll('.tab.drag-over').forEach(t => t.classList.remove('drag-over'));
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('text/plain');
      reorderTab(draggedId, tab.id);
    });

    tabsEl.appendChild(el);
  });

  // Update scroll arrows and scroll active tab into view
  requestAnimationFrame(() => {
    updateScrollButtons();
    const activeEl = tabsEl.querySelector('.tab.active');
    if (activeEl) activeEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
}

// --- Tab reordering ---
function reorderTab(draggedId, targetId) {
  if (draggedId === targetId) return;
  const fromIdx = tabs.findIndex(t => t.id === draggedId);
  const toIdx = tabs.findIndex(t => t.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return;

  const [moved] = tabs.splice(fromIdx, 1);
  tabs.splice(toIdx, 0, moved);
  renderTabs();
  scheduleSave();
}

// --- Tab context menu ---
let contextMenuEl = null;

function showTabContextMenu(x, y, tabId, tabIndex) {
  hideTabContextMenu();

  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'tab-context-menu';

  const items = [
    { label: 'Close', action: () => closeTab(tabId) },
    { label: 'Close Others', action: () => closeOtherTabs(tabId) },
    { label: 'Close Tabs to the Right', action: () => closeTabsToRight(tabIndex) },
    { label: 'Close Tabs to the Left', action: () => closeTabsToLeft(tabIndex) },
    { label: 'separator' },
    { label: 'Close All', action: () => closeAllTabs() },
  ];

  items.forEach(item => {
    if (item.label === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      contextMenuEl.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = 'context-menu-item';
    el.textContent = item.label;
    el.addEventListener('click', () => {
      hideTabContextMenu();
      item.action();
    });
    contextMenuEl.appendChild(el);
  });

  document.body.appendChild(contextMenuEl);
  const rect = contextMenuEl.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  contextMenuEl.style.left = x + 'px';
  contextMenuEl.style.top = y + 'px';

  setTimeout(() => {
    document.addEventListener('mousedown', hideTabContextMenuOnOutsideClick);
  }, 0);
}

function hideTabContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
  document.removeEventListener('mousedown', hideTabContextMenuOnOutsideClick);
}

function hideTabContextMenuOnOutsideClick(e) {
  if (contextMenuEl && !contextMenuEl.contains(e.target)) {
    hideTabContextMenu();
  }
}

function closeOtherTabs(keepId) {
  tabs = tabs.filter(t => t.id === keepId);
  activeTabId = keepId;
  renderTabs();
  switchTab(keepId);
  scheduleSave();
}

function closeTabsToRight(index) {
  tabs = tabs.slice(0, index + 1);
  if (!tabs.find(t => t.id === activeTabId)) {
    switchTab(tabs[tabs.length - 1].id);
  } else {
    renderTabs();
  }
  scheduleSave();
}

function closeTabsToLeft(index) {
  tabs = tabs.slice(index);
  if (!tabs.find(t => t.id === activeTabId)) {
    switchTab(tabs[0].id);
  } else {
    renderTabs();
  }
  scheduleSave();
}

function closeAllTabs() {
  tabs = [];
  createTab('Untitled-1');
}

function getNextUntitledName() {
  let n = 1;
  const names = new Set(tabs.map(t => t.name));
  while (names.has(`Untitled-${n}`)) n++;
  return `Untitled-${n}`;
}

// --- Session persistence ---
function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveSession, 300);
}

async function saveSession() {
  const sessionData = {
    tabs: tabs.map(t => ({
      id: t.id,
      name: t.name,
      content: t.content,
      filePath: t.filePath,
      cursorPos: t.cursorPos,
    })),
    activeTabId,
    theme: currentTheme,
  };
  await window.api.saveSession(sessionData);
}

async function restoreSession() {
  const session = await window.api.loadSession();

  // Restore theme
  if (session.theme) {
    setTheme(session.theme);
  }

  if (session.tabs && session.tabs.length > 0) {
    tabs = session.tabs;
    activeTabId = session.activeTabId || tabs[0].id;

    for (const tab of tabs) {
      if (tab.filePath) {
        const diskContent = await window.api.readFile(tab.filePath);
        if (diskContent !== null) {
          tab.content = diskContent;
        }
      }
    }

    renderTabs();
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
    switchTab(activeTab.id);
  } else {
    createTab('Untitled-1');
  }
}

// --- Menu handlers ---
window.api.onNewTab(() => {
  createTab(getNextUntitledName());
});

window.api.onCloseTab(() => {
  if (activeTabId) closeTab(activeTabId);
});

window.api.onSaveAs(async () => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;

  const filePath = await window.api.saveAs(tab.name);
  if (filePath) {
    tab.filePath = filePath;
    tab.name = filePath.split('/').pop();
    await window.api.saveToDisk(filePath, tab.content);
    renderTabs();
    scheduleSave();
  }
});

window.api.onFind(() => {
  if (editorView) {
    openSearchPanel(editorView);
  }
});

window.api.onFileOpened(({ filePath, content }) => {
  const existing = tabs.find(t => t.filePath === filePath);
  if (existing) {
    switchTab(existing.id);
    return;
  }

  const name = filePath.split('/').pop();
  createTab(name, content, filePath, 0);
});

// --- New tab button ---
newTabBtn.addEventListener('click', () => {
  createTab(getNextUntitledName());
});

// Double-click on empty tab bar area or tail to create new tab
document.getElementById('tab-bar').addEventListener('dblclick', (e) => {
  if (e.target.closest('.tab') || e.target.closest('#new-tab-btn') || e.target.closest('.tab-scroll-btn')) return;
  createTab(getNextUntitledName());
});
document.getElementById('tab-bar-tail').addEventListener('dblclick', () => {
  createTab(getNextUntitledName());
});

// --- Tab scroll buttons ---
const scrollArea = document.getElementById('tab-scroll-area');
const scrollLeftBtn = document.getElementById('scroll-left-btn');
const scrollRightBtn = document.getElementById('scroll-right-btn');

function updateScrollButtons() {
  const { scrollLeft, scrollWidth, clientWidth } = scrollArea;
  const overflows = scrollWidth > clientWidth + 1;
  scrollLeftBtn.classList.toggle('visible', overflows && scrollLeft > 0);
  scrollRightBtn.classList.toggle('visible', overflows && scrollLeft + clientWidth < scrollWidth - 1);
}

scrollLeftBtn.addEventListener('click', () => {
  scrollArea.scrollBy({ left: -150, behavior: 'smooth' });
});
scrollRightBtn.addEventListener('click', () => {
  scrollArea.scrollBy({ left: 150, behavior: 'smooth' });
});
scrollArea.addEventListener('scroll', updateScrollButtons);

scrollArea.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
    scrollArea.scrollLeft += e.deltaY;
    e.preventDefault();
  }
}, { passive: false });

// --- Theme switching ---
function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);

  // Swap CodeMirror theme
  if (editorView) {
    editorView.dispatch({
      effects: themeCompartment.reconfigure(theme === 'dark' ? oneDark : []),
    });
  }

  scheduleSave();
}

window.api.onSetTheme((theme) => {
  setTheme(theme);
});

// --- Init ---
document.documentElement.setAttribute('data-theme', 'dark');
restoreSession();
