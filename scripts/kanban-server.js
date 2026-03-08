#!/usr/bin/env node
/**
 * Minimal Kanban board server for NanoClaw.
 * Serves a self-contained HTML UI and reads/writes kanban.json.
 *
 * Usage: node scripts/kanban-server.js [path-to-kanban.json] [port]
 */

import fs from 'fs';
import http from 'http';
import path from 'path';

const DATA_FILE = process.argv[2] || path.join(process.cwd(), 'groups/telegram_main/kanban.json');
const PORT = parseInt(process.argv[3] || '9870', 10);

function readBoard() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { columns: ['Backlog', 'In Progress', 'In Review', 'Done'], wipLimit: 3, categories: [], cards: [] };
  }
}

function writeBoard(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kanban Board</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; }
  h1 { padding: 20px 24px 12px; font-size: 1.4em; font-weight: 600; color: #f0f6fc; }
  .board { display: flex; gap: 16px; padding: 12px 24px 24px; overflow-x: auto; min-height: calc(100vh - 70px); }
  .column { background: #161b22; border-radius: 12px; min-width: 280px; max-width: 320px; flex: 1; display: flex; flex-direction: column; }
  .column-header { padding: 14px 16px 10px; font-weight: 600; font-size: 0.9em; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; display: flex; justify-content: space-between; align-items: center; }
  .column-header .count { background: #30363d; border-radius: 10px; padding: 2px 8px; font-size: 0.85em; }
  .column-header .wip-warn { background: #da3633; color: #fff; }
  .cards { padding: 4px 12px 12px; flex: 1; overflow-y: auto; }
  .card { background: #1c2128; border: 1px solid #30363d; border-radius: 8px; padding: 12px; margin-bottom: 10px; cursor: pointer; transition: border-color 0.15s, transform 0.1s; }
  .card:hover { border-color: #58a6ff; transform: translateY(-1px); }
  .card-title { font-weight: 500; font-size: 0.95em; margin-bottom: 6px; }
  .card-category { font-size: 0.8em; color: #8b949e; margin-bottom: 4px; }
  .card-notes { font-size: 0.8em; color: #7d8590; margin-top: 6px; white-space: pre-wrap; }
  .card-priority { display: inline-block; font-size: 0.7em; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
  .priority-high { background: #da363322; color: #f85149; border: 1px solid #da363344; }
  .priority-medium { background: #d2992222; color: #d29922; border: 1px solid #d2992244; }
  .priority-low { background: #23863622; color: #3fb950; border: 1px solid #23863644; }
  .add-btn { margin: 8px 12px 12px; padding: 8px; background: transparent; border: 1px dashed #30363d; border-radius: 8px; color: #484f58; cursor: pointer; font-size: 0.85em; transition: all 0.15s; }
  .add-btn:hover { border-color: #58a6ff; color: #58a6ff; }
  /* Modal */
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; justify-content: center; align-items: center; }
  .modal-overlay.active { display: flex; }
  .modal { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 24px; width: 400px; max-width: 90vw; }
  .modal h2 { font-size: 1.1em; margin-bottom: 16px; color: #f0f6fc; }
  .modal label { display: block; font-size: 0.85em; color: #8b949e; margin-bottom: 4px; margin-top: 12px; }
  .modal input, .modal select, .modal textarea { width: 100%; padding: 8px 10px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; font-size: 0.9em; font-family: inherit; }
  .modal textarea { resize: vertical; min-height: 60px; }
  .modal-buttons { display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end; }
  .modal-buttons button { padding: 8px 16px; border-radius: 6px; border: 1px solid #30363d; background: #21262d; color: #e6edf3; cursor: pointer; font-size: 0.85em; }
  .modal-buttons .primary { background: #238636; border-color: #238636; }
  .modal-buttons .danger { background: #da3633; border-color: #da3633; }
  .modal-buttons button:hover { filter: brightness(1.1); }
</style>
</head>
<body>
<h1>Kanban Board</h1>
<div class="board" id="board"></div>

<div class="modal-overlay" id="modal">
  <div class="modal">
    <h2 id="modal-title">Add Card</h2>
    <label>Title</label>
    <input id="f-title" placeholder="What needs to be done?">
    <label>Category</label>
    <select id="f-category"></select>
    <label>Priority</label>
    <select id="f-priority">
      <option value="high">High</option>
      <option value="medium" selected>Medium</option>
      <option value="low">Low</option>
    </select>
    <label>Notes</label>
    <textarea id="f-notes" placeholder="Optional details..."></textarea>
    <label>Column</label>
    <select id="f-column"></select>
    <div class="modal-buttons">
      <button class="danger" id="btn-delete" style="display:none;margin-right:auto">Delete</button>
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" id="btn-save">Save</button>
    </div>
  </div>
</div>

<script>
let board = { columns: [], wipLimit: 3, categories: [], cards: [] };
let editingId = null;

async function load() {
  const res = await fetch('/api/board');
  board = await res.json();
  render();
}

async function save() {
  await fetch('/api/board', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(board) });
}

function render() {
  const el = document.getElementById('board');
  el.innerHTML = '';
  for (const col of board.columns) {
    const cards = board.cards.filter(c => c.column === col);
    const isWip = col === 'In Progress' && cards.length >= board.wipLimit;
    const div = document.createElement('div');
    div.className = 'column';
    div.innerHTML =
      '<div class="column-header">' + col +
        ' <span class="count ' + (isWip ? 'wip-warn' : '') + '">' + cards.length + '</span>' +
      '</div>' +
      '<div class="cards">' +
        cards.map(c =>
          '<div class="card" onclick="editCard(\\'' + c.id + '\\')">' +
            '<div class="card-category">' + esc(c.category) + '</div>' +
            '<div class="card-title">' + esc(c.title) + '</div>' +
            '<span class="card-priority priority-' + c.priority + '">' + c.priority + '</span>' +
            (c.notes ? '<div class="card-notes">' + esc(c.notes) + '</div>' : '') +
          '</div>'
        ).join('') +
      '</div>' +
      '<button class="add-btn" onclick="addCard(\\'' + col + '\\')">+ Add card</button>';
    el.appendChild(div);
  }
}

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function openModal() { document.getElementById('modal').classList.add('active'); }
function closeModal() { document.getElementById('modal').classList.remove('active'); editingId = null; }

function populateSelects() {
  const cat = document.getElementById('f-category');
  cat.innerHTML = board.categories.map(c => '<option>' + esc(c) + '</option>').join('');
  const colSel = document.getElementById('f-column');
  colSel.innerHTML = board.columns.map(c => '<option>' + esc(c) + '</option>').join('');
}

function addCard(col) {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Add Card';
  document.getElementById('f-title').value = '';
  document.getElementById('f-notes').value = '';
  document.getElementById('f-priority').value = 'medium';
  document.getElementById('btn-delete').style.display = 'none';
  populateSelects();
  document.getElementById('f-column').value = col;
  openModal();
}

function editCard(id) {
  const card = board.cards.find(c => c.id === id);
  if (!card) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Edit Card';
  document.getElementById('f-title').value = card.title;
  document.getElementById('f-notes').value = card.notes || '';
  document.getElementById('f-priority').value = card.priority;
  document.getElementById('btn-delete').style.display = 'block';
  populateSelects();
  document.getElementById('f-category').value = card.category;
  document.getElementById('f-column').value = card.column;
  openModal();
}

document.getElementById('btn-save').onclick = async () => {
  const title = document.getElementById('f-title').value.trim();
  if (!title) return;
  const data = {
    title,
    category: document.getElementById('f-category').value,
    priority: document.getElementById('f-priority').value,
    notes: document.getElementById('f-notes').value.trim(),
    column: document.getElementById('f-column').value,
  };
  if (editingId) {
    const card = board.cards.find(c => c.id === editingId);
    if (card) Object.assign(card, data);
  } else {
    board.cards.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data, created: new Date().toISOString() });
  }
  await save();
  closeModal();
  render();
};

document.getElementById('btn-delete').onclick = async () => {
  if (!editingId) return;
  board.cards = board.cards.filter(c => c.id !== editingId);
  await save();
  closeModal();
  render();
};

document.getElementById('modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

load();
setInterval(load, 5000);
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/board' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readBoard()));
    return;
  }

  if (req.url === '/api/board' && req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        writeBoard(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
    return;
  }

  // Serve HTML for everything else
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kanban board: http://localhost:${PORT}`);
});
