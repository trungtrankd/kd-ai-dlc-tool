const vscode = acquireVsCodeApi();
const TYPE_ICON = {
  start: '🚀', plan: '🗺️', dispatch: '📤', read: '👁️',
  decision: '💡', progress: '🔨', finding: '🔍', fix: '🔧',
  done: '✅', unblock: '🔓', handoff: '🤝', complete: '🎉', error: '❌'
};

function agentClass(n) {
  if (!n) return '';
  if (n.includes('tech-lead')) return 'agent-tech-lead';
  if (n.includes('frontend')) return 'agent-frontend';
  if (n.includes('backend')) return 'agent-backend';
  if (n.includes('database')) return 'agent-database';
  if (n.includes('devops')) return 'agent-devops';
  if (n.includes('security')) return 'agent-security';
  if (n.includes('qa')) return 'agent-qa';
  return 'agent-tech-lead';
}

function shortTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts || '';
  }
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderEntry(e) {
  const icon = TYPE_ICON[e.type] || '•';
  const div = document.createElement('div');
  div.className = `log-entry type-${e.type}`;
  div.innerHTML = `
    <span class="log-time">${shortTime(e.ts)}</span>
    <span class="log-agent ${agentClass(e.agent)}">${escHtml(e.agent) || 'system'}</span>
    <span class="log-icon">${icon}</span>
    <span class="log-msg">${escHtml(e.msg)}</span>`;
  return div;
}

const list = document.getElementById('log-list');

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.command === 'setEntries') {
    list.innerHTML = '';
    if (!msg.entries.length) {
      list.innerHTML = '<div class="empty-state">No activity yet. Start a pipeline to see logs here.</div>';
      return;
    }
    msg.entries.forEach(entry => list.appendChild(renderEntry(entry)));
    if (list.lastElementChild) {
      list.lastElementChild.scrollIntoView({ behavior: 'smooth' });
    }
  }
  if (msg.command === 'appendEntries') {
    if (list.querySelector('.empty-state')) {
      list.innerHTML = '';
    }
    msg.entries.forEach(entry => list.appendChild(renderEntry(entry)));
    if (list.lastElementChild) {
      list.lastElementChild.scrollIntoView({ behavior: 'smooth' });
    }
  }
});
