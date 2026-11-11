/* Заявки команд: очереди по статусам, составы, допуск, лого. */
(async function () {
  const { el, esc, toast, confirmBox, ROLE_LABEL, TEAM_STATUS } = window.UI;
  const ok = await window.AdminShell.init('Заявки команд');
  if (!ok) return;
  const main = window.AdminShell.main();
  const sb = window.DB.sb;

  let tab = 'pending';
  const tabsHost = el('div', { class: 'tabs' });
  const listHost = el('div', { id: 'apps-list' });
  main.append(tabsHost, listHost);

  const TABS = [['pending', 'На проверке'], ['approved', 'Допущены'], ['rejected', 'Отклонены'], ['withdrawn', 'Снялись'], ['all', 'Все']];
  TABS.forEach(([key, label]) => {
    const b = el('button', { text: label, class: key === tab ? 'active' : '', onclick: () => { tab = key; paintTabs(); load(); } });
    b.dataset.key = key;
    tabsHost.append(b);
  });
  function paintTabs() {
    tabsHost.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.key === tab));
  }

  async function load() {
    listHost.innerHTML = '';
    const q = sb.from('teams').select('*, profiles(nickname, full_name, phone, vk_url)').order('created_at', { ascending: false });
    if (tab !== 'all') q.eq('status', tab);
    const { data: teams } = await q;
    const { data: members } = await sb.from('team_members').select('*').order('sort_order', { ascending: true });
    const byTeam = {};
    (members || []).forEach(m => { (byTeam[m.team_id] = byTeam[m.team_id] || []).push(m); });

    if (!(teams || []).length) {
      listHost.append(el('div', { class: 'empty-state' }, [el('div', { class: 'big', text: 'Заявок в этой очереди нет' })]));
      return;
    }
    (teams || []).forEach(t => listHost.append(card(t, byTeam[t.id] || [])));
  }

  function card(t, roster) {
    const st = TEAM_STATUS[t.status] || ['', ''];
    const head = el('div', { class: 'head' }, [
      el('span', { class: 'nm', text: t.name + (t.tag ? ' [' + t.tag + ']' : '') }),
      el('span', { class: 'badge ' + st[1], text: st[0] }),
      el('span', { class: 'muted', style: 'font-size:12px', text: t.city }),
      el('span', { class: 'grow' }),
    ]);

    if (t.status === 'pending') {
      head.append(el('button', { class: 'btn btn-primary btn-sm', text: 'Допустить', onclick: () => setStatus(t, 'approved') }));
      head.append(el('button', { class: 'btn btn-danger btn-sm', text: 'Отклонить', onclick: () => setStatus(t, 'rejected') }));
    } else if (t.status === 'approved') {
      head.append(el('button', { class: 'btn btn-danger btn-sm', text: 'Снять с турнира', onclick: () => setStatus(t, 'withdrawn') }));
    } else {
      head.append(el('button', { class: 'btn btn-ghost btn-sm', text: 'Вернуть на проверку', onclick: () => setStatus(t, 'pending') }));
    }
    head.append(el('button', { class: 'btn btn-ghost btn-sm', text: 'Состав и лого', onclick: () => editModal(t, roster) }));

    const table = el('table', {}, [
      el('tbody', {}, roster.map(m => el('tr', {}, [
        el('td', {}, [
          el('strong', { text: m.nickname }),
          m.is_captain ? el('span', { class: 'badge gold', style: 'margin-left:8px', text: 'капитан' }) : null
        ].filter(Boolean)),
        el('td', { class: 'role', text: ROLE_LABEL[m.role] || m.role }),
        el('td', { class: 'mono faint', text: m.steam_id || '—' }),
        el('td', { class: 'faint', text: m.full_name || '—' }),
        el('td', { class: 'faint', text: m.phone || '—' })
      ])))
    ]);

    return el('div', { class: 'app-card' }, [head, el('div', { class: 'roster' }, [table])]);
  }

  async function setStatus(t, status) {
    if (status === 'rejected' || status === 'withdrawn') {
      const yes = await confirmBox('Подтвердите', 'Команда «' + t.name + '» будет помечена: ' + status + '. Продолжить?');
      if (!yes) return;
    }
    const { error } = await sb.from('teams').update({ status }).eq('id', t.id);
    if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
    toast('Статус обновлён', 'ok');
    window.AdminShell.refreshCounts();
    load();
  }

  function editModal(t, roster) {
    const nameIn = el('input', { type: 'text', value: t.name });
    const tagIn = el('input', { type: 'text', value: t.tag });
    const cityIn = el('input', { type: 'text', value: t.city });
    const noteIn = el('textarea', { text: t.admin_note });
    const fileIn = el('input', { type: 'file', accept: 'image/*' });

    const body = el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: 'Название' }), nameIn]),
      el('div', { class: 'field' }, [el('label', { text: 'Тег' }), tagIn]),
      el('div', { class: 'field' }, [el('label', { text: 'Город' }), cityIn]),
      el('div', { class: 'field' }, [el('label', { text: 'Логотип команды' }), fileIn,
        el('div', { class: 'hint', text: 'Загрузится в хранилище team-logos и появится на сайте.' })]),
      el('div', { class: 'field' }, [el('label', { text: 'Заметка оргкомитета' }), noteIn])
    ]);

    const save = el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить' });
    const cancel = el('button', { class: 'btn btn-ghost btn-sm', text: 'Закрыть' });
    const m = window.UI.modal('Команда: ' + t.name, body, [cancel, save]);
    cancel.onclick = () => m.close();
    save.onclick = async () => {
      let logo = t.logo_url;
      if (fileIn.files[0]) {
        const path = t.id + '/' + Date.now() + '-' + fileIn.files[0].name.replace(/[^\w.\-]/g, '_');
        const { error } = await sb.storage.from('team-logos').upload(path, fileIn.files[0], { upsert: true });
        if (error) { toast('Лого не загрузилось: ' + error.message, 'error'); return; }
        logo = sb.storage.from('team-logos').getPublicUrl(path).data.publicUrl;
      }
      const { error } = await sb.from('teams').update({
        name: nameIn.value.trim(), tag: tagIn.value.trim().toUpperCase(),
        city: cityIn.value.trim(), admin_note: noteIn.value, logo_url: logo
      }).eq('id', t.id);
      if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
      toast('Сохранено', 'ok');
      m.close(); load();
    };
  }

  load();
})();
