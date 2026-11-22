/* Мелкие DOM-помощники, форматирование дат, тосты и модалки. */
(function () {
  const TZ = window.SITE_CONFIG.timezone;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v);
    }
    (children || []).forEach(c => node.append(c && c.nodeType ? c : document.createTextNode(c)));
    return node;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const dtfDate = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
  const dtfShort = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit' });
  const dtfTime = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const dtfFull = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const fmtDate = iso => iso ? dtfDate.format(new Date(iso)) : '—';
  const fmtShort = iso => iso ? dtfShort.format(new Date(iso)) : '—';
  const fmtTime = iso => iso ? dtfTime.format(new Date(iso)) : '—';
  const fmtFull = iso => iso ? dtfFull.format(new Date(iso)) : '—';
  const fmtMoney = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';

  // --- Время турнира ↔ <input type="datetime-local"> -------------------
  // Поля в админке подписаны «UTC+5», а браузер отдаёт локальное время
  // пользователя, поэтому переводим явно. Без этого сохранение сдвигало
  // время на разницу поясов при каждом открытии формы.
  const dtfParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  function tzParts(date) {
    const out = {};
    dtfParts.formatToParts(date).forEach(p => { if (p.type !== 'literal') out[p.type] = p.value; });
    return out;
  }

  function tzOffsetMs(date) {
    const p = tzParts(date);
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUTC - date.getTime();
  }

  // ISO из базы -> строка для datetime-local во времени турнира
  function toLocalInput(iso) {
    if (!iso) return '';
    const p = tzParts(new Date(iso));
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
  }

  // Строка datetime-local (время турнира) -> ISO UTC для базы
  function fromLocalInput(v) {
    if (!v) return null;
    const [d, t] = String(v).split('T');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, mi] = (t || '00:00').split(':').map(Number);
    const guess = Date.UTC(Y, M - 1, D, h, mi);
    return new Date(guess - tzOffsetMs(new Date(guess))).toISOString();
  }

  function plural(n, forms) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  // Отпечаток браузера для лайков без входа
  function voterKey() {
    let k = localStorage.getItem('voter_key');
    if (!k) {
      k = 'a-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('voter_key', k);
    }
    return k;
  }

  function toast(msg, kind) {
    let host = $('#toasts');
    if (!host) { host = el('div', { id: 'toasts' }); document.body.append(host); }
    const t = el('div', { class: 'toast ' + (kind || ''), text: msg });
    host.append(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3600);
    setTimeout(() => t.remove(), 4000);
  }

  function modal(title, bodyNode, actions) {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const box = el('div', { class: 'modal' }, [
      el('h3', { text: title }),
      bodyNode,
      el('div', { class: 'modal-actions' }, actions || [])
    ]);
    backdrop.append(box);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    function close() { backdrop.remove(); }
    document.body.append(backdrop);
    return { close, box };
  }

  function confirmBox(title, text) {
    return new Promise(resolve => {
      const ok = el('button', { class: 'btn btn-primary btn-sm', text: 'Подтвердить' });
      const no = el('button', { class: 'btn btn-ghost btn-sm', text: 'Отмена' });
      const m = modal(title, el('p', { text }), [no, ok]);
      ok.onclick = () => { m.close(); resolve(true); };
      no.onclick = () => { m.close(); resolve(false); };
    });
  }

  const ROLE_LABEL = {
    carry: 'Керри', mid: 'Мид', offlane: 'Оффлейн',
    soft_support: 'Саппорт 4', hard_support: 'Саппорт 5',
    coach: 'Тренер', standin: 'Запасной'
  };
  const TEAM_STATUS = {
    pending: ['На проверке', 'gold'], approved: ['В сетке', 'green'],
    rejected: ['Отклонена', 'red'], withdrawn: ['Снялась', '']
  };
  const MATCH_STATUS = {
    pending: ['Ожидает', ''], live: ['Идёт', 'live'], finished: ['Сыгран', 'green'],
    walkover: ['Тех. поражение', 'red'], bye: ['Бай', 'gold'], cancelled: ['Отменён', 'red']
  };

  function setStatus(field, value) {
    const wrap = field.closest('.field');
    if (!wrap) return;
    wrap.classList.toggle('invalid', !!value);
    const err = wrap.querySelector('.error');
    if (err) err.textContent = value || '';
  }

  window.UI = { $, $$, el, esc, fmtDate, fmtShort, fmtTime, fmtFull, fmtMoney, plural, voterKey, toast, modal, confirmBox, toLocalInput, fromLocalInput, ROLE_LABEL, TEAM_STATUS, MATCH_STATUS, setStatus };
})();
