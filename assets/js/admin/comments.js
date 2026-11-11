/* Модерация: очереди, approve/reject/pin, бан автора, ответ оргкомитета. */
(async function () {
  const { el, toast, confirmBox, fmtFull } = window.UI;
  const ok = await window.AdminShell.init('Модерация комментариев');
  if (!ok) return;
  const main = window.AdminShell.main();
  const sb = window.DB.sb;

  let tab = 'pending';
  const tabsHost = el('div', { class: 'tabs' });
  const list = el('div', { id: 'c-list' });
  main.append(tabsHost, list);

  const TABS = [['pending', 'Ожидают'], ['approved', 'Одобренные'], ['rejected', 'Отклонённые'], ['reported', 'Жалобы'], ['deleted', 'Удалённые']];
  TABS.forEach(([key, label]) => {
    const b = el('button', { text: label, class: key === tab ? 'active' : '', onclick: () => { tab = key; paint(); load(); } });
    b.dataset.key = key;
    tabsHost.append(b);
  });
  function paint() { tabsHost.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.key === tab)); }

  async function load() {
    list.innerHTML = '';
    let rows = [];
    if (tab === 'reported') {
      const { data } = await sb.from('comment_reports').select('*, comments(*, profiles(nickname))').eq('resolved', false).order('created_at', { ascending: false });
      rows = (data || []).map(r => Object.assign({}, r.comments, { _report: r }));
    } else {
      const { data } = await sb.from('comments').select('*, profiles(nickname, banned_until)').eq('status', tab).order('created_at', { ascending: false });
      rows = data || [];
    }
    if (!rows.length) { list.append(el('div', { class: 'empty-state' }, [el('div', { class: 'big', text: 'Пусто' })])); return; }
    rows.forEach(c => list.append(card(c)));
  }

  function card(c) {
    const banned = c.profiles && c.profiles.banned_until && new Date(c.profiles.banned_until) > new Date();
    const head = el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
      el('strong', { text: c.profiles?.nickname || c.author_name || 'Гость' }),
      c.is_staff ? el('span', { class: 'badge red', text: 'оргкомитет' }) : null,
      c.is_pinned ? el('span', { class: 'badge gold', text: 'закреп' }) : null,
      banned ? el('span', { class: 'badge red', text: 'забанен' }) : null,
      el('span', { class: 'faint', style: 'font-size:12px', text: fmtFull(c.created_at) + ' · ' + c.page_key + ' · ▲' + c.likes_count }),
      c._report ? el('span', { class: 'badge red', text: 'жалоба: ' + (c._report.reason || 'без причины') }) : null
    ].filter(Boolean));

    const actions = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px' });
    if (c.status !== 'approved') actions.append(btn('Одобрить', 'btn-primary', () => set(c, { status: 'approved' })));
    if (c.status !== 'rejected') actions.append(btn('Отклонить', 'btn-ghost', () => set(c, { status: 'rejected' })));
    actions.append(btn(c.is_pinned ? 'Открепить' : 'Закрепить', 'btn-gold', () => set(c, { is_pinned: !c.is_pinned })));
    actions.append(btn('Ответить', 'btn-ghost', () => reply(c)));
    actions.append(btn('Удалить', 'btn-danger', async () => {
      const yes = await confirmBox('Удалить комментарий?', 'Текст скрывается со всех страниц.');
      if (yes) set(c, { status: 'deleted' });
    }));
    if (c.author_id) {
      actions.append(btn('Бан 7 дней', 'btn-danger', () => ban(c, 7)));
      actions.append(btn('Бан навсегда', 'btn-danger', () => ban(c, null)));
    }
    if (c._report) actions.append(btn('Жалобу — в работу закрыто', 'btn-ghost', async () => {
      await sb.from('comment_reports').update({ resolved: true }).eq('id', c._report.id);
      toast('Жалоба закрыта', 'ok'); load(); window.AdminShell.refreshCounts();
    }));

    return el('div', { class: 'app-card' }, [
      el('div', { class: 'head' }, [head, el('span', { class: 'grow' })]),
      el('div', { style: 'padding:12px 18px' }, [
        el('p', { style: 'white-space:pre-wrap;margin:0', text: c.body }),
        actions
      ])
    ]);
  }

  function btn(label, cls, fn) { return el('button', { class: 'btn ' + cls + ' btn-sm', text: label, onclick: fn }); }

  async function set(c, patch) {
    const { error } = await sb.from('comments').update(patch).eq('id', c.id);
    if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
    toast('Готово', 'ok'); load(); window.AdminShell.refreshCounts();
  }

  async function ban(c, days) {
    const until = days ? new Date(Date.now() + days * 86400000).toISOString() : new Date('2099-01-01').toISOString();
    const { error } = await sb.from('profiles').update({ banned_until: until }).eq('id', c.author_id);
    if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
    toast('Автор забанен', 'ok'); load();
  }

  function reply(c) {
    const ta = el('textarea', { placeholder: 'Ответ от оргкомитета…' });
    const save = el('button', { class: 'btn btn-primary btn-sm', text: 'Опубликовать ответ' });
    const cancel = el('button', { class: 'btn btn-ghost btn-sm', text: 'Отмена' });
    const m = window.UI.modal('Ответ на комментарий', el('div', {}, [
      el('p', { class: 'muted', style: 'white-space:pre-wrap;font-size:13px', text: c.body }), ta
    ]), [cancel, save]);
    cancel.onclick = () => m.close();
    save.onclick = async () => {
      if (ta.value.trim().length < 2) return;
      const { error } = await sb.from('comments').insert({
        page_key: c.page_key, parent_id: c.id, author_id: window.Auth.user.id,
        author_name: window.Auth.profile?.nickname || 'Оргкомитет',
        body: ta.value.trim(), status: 'approved', is_staff: true
      });
      if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
      toast('Ответ опубликован', 'ok'); m.close(); load();
    };
  }

  load();
})();
