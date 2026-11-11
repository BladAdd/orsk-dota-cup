/* Настройки: турнир, реквизиты сайта, контакты, призовые, спонсоры. */
(async function () {
  const { el, toast } = window.UI;
  const ok = await window.AdminShell.init('Настройки');
  if (!ok) return;
  const main = window.AdminShell.main();
  const sb = window.DB.sb;

  const [tour, site, contacts, prize, sponsors] = await Promise.all([
    sb.from('tournaments').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('settings').select('value').eq('key', 'site').maybeSingle(),
    sb.from('settings').select('value').eq('key', 'contacts').maybeSingle(),
    sb.from('settings').select('value').eq('key', 'prize').maybeSingle(),
    sb.from('sponsors').select('*').order('sort_order', { ascending: true })
  ]);
  const T = tour.data || {};
  const S = site.data?.value || {};
  const C = contacts.data?.value || {};
  const P = prize.data?.value || { total: 15000, split: [{ place: 1, amount: 9000 }, { place: 2, amount: 4000 }, { place: 3, amount: 2000 }] };

  const dt = iso => iso ? iso.slice(0, 16) : '';
  const f = {};
  function field(key, label, value, type) {
    const i = el('input', { type: type || 'text', value: value == null ? '' : value });
    f[key] = i;
    return el('div', { class: 'field' }, [el('label', { text: label }), i]);
  }

  // --- Турнир ---
  const tBox = el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, [el('h3', { text: 'Турнир' })])]);
  tBox.append(
    field('title', 'Название', T.title),
    field('subtitle', 'Подзаголовок', T.subtitle),
    el('div', { class: 'grid grid-3' }, [
      field('max_teams', 'Лимит команд', T.max_teams, 'number'),
      field('team_size', 'Игроков в составе', T.team_size, 'number'),
      field('prize_fund', 'Призовой фонд, ₽', T.prize_fund, 'number')
    ]),
    el('div', { class: 'grid grid-2' }, [
      field('reg_opens', 'Регистрация с', dt(T.registration_opens), 'datetime-local'),
      field('reg_closes', 'Регистрация до', dt(T.registration_closes), 'datetime-local'),
      field('starts', 'Старт', dt(T.starts_at), 'datetime-local'),
      field('ends', 'Финал', dt(T.ends_at), 'datetime-local')
    ]),
    field('venue', 'Площадка / серверы', T.venue),
    el('div', { class: 'field' }, [
      el('label', { text: 'Статус' }),
      (f.status = el('select', {}, ['registration', 'bracket', 'live', 'finished'].map(s => el('option', { value: s, text: s }))))
    ])
  );
  f.status.value = T.status || 'registration';
  const saveT = el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить турнир' });
  saveT.onclick = async () => {
    const payload = {
      title: f.title.value.trim(), subtitle: f.subtitle.value.trim(),
      max_teams: +f.max_teams.value || 16, team_size: +f.team_size.value || 5,
      prize_fund: +f.prize_fund.value || 0,
      registration_opens: f.reg_opens.value ? f.reg_opens.value + ':00+05:00' : null,
      registration_closes: f.reg_closes.value ? f.reg_closes.value + ':00+05:00' : null,
      starts_at: f.starts.value ? f.starts.value + ':00+05:00' : null,
      ends_at: f.ends.value ? f.ends.value + ':00+05:00' : null,
      venue: f.venue.value.trim(), status: f.status.value
    };
    const q = T.id ? sb.from('tournaments').update(payload).eq('id', T.id) : sb.from('tournaments').insert(payload);
    const { error } = await q;
    if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
    toast('Турнир сохранён', 'ok');
  };
  tBox.append(saveT);
  main.append(tBox);

  // --- Сайт и контакты ---
  const sBox = el('div', { class: 'panel', style: 'margin-top:22px' }, [el('div', { class: 'panel-title' }, [el('h3', { text: 'Сайт и контакты' })])]);
  const g = {};
  function gfield(key, label, value) {
    const i = el('input', { type: 'text', value: value || '' });
    g[key] = i;
    return el('div', { class: 'field' }, [el('label', { text: label }), i]);
  }
  sBox.append(
    el('div', { class: 'grid grid-2' }, [
      gfield('title', 'Полное название сайта', S.title),
      gfield('short_title', 'Короткое название (шапка)', S.short_title),
      gfield('tagline', 'Слоган', S.tagline),
      gfield('age_rating', 'Возрастная маркировка', S.age_rating)
    ]),
    el('div', { class: 'grid grid-2' }, [
      gfield('vk', 'VK (ссылка)', C.vk),
      gfield('telegram', 'Telegram (ссылка)', C.telegram),
      gfield('discord', 'Discord (ссылка)', C.discord),
      gfield('email', 'E-mail оргкомитета', C.email)
    ]),
    el('div', { class: 'field' }, [el('label', { text: 'Подпись о судействе' }), (g.judge = el('input', { type: 'text', value: C.judge || '' }))])
  );
  const saveS = el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить сайт и контакты' });
  saveS.onclick = async () => {
    const up = (key, value) => sb.from('settings').upsert({ key, value, is_public: true, updated_at: new Date().toISOString() });
    await up('site', { title: g.title.value, short_title: g.short_title.value, tagline: g.tagline.value, age_rating: g.age_rating.value, timezone: 'Asia/Yekaterinburg', timezone_label: 'время екатеринбургское (UTC+5)' });
    await up('contacts', { vk: g.vk.value, telegram: g.telegram.value, discord: g.discord.value, email: g.email.value, judge: g.judge.value });
    toast('Сохранено', 'ok');
  };
  sBox.append(saveS);
  main.append(sBox);

  // --- Призовые ---
  const pBox = el('div', { class: 'panel', style: 'margin-top:22px' }, [el('div', { class: 'panel-title' }, [el('h3', { text: 'Призовой фонд' })])]);
  const total = el('input', { type: 'number', value: String(P.total) });
  const amounts = (P.split || []).map(s => el('input', { type: 'number', value: String(s.amount), style: 'width:120px' }));
  pBox.append(
    el('div', { class: 'field' }, [el('label', { text: 'Всего, ₽' }), total]),
    el('div', { class: 'field' }, [el('label', { text: '1 / 2 / 3 место, ₽' }),
      el('div', { style: 'display:flex;gap:10px' }, amounts)])
  );
  const saveP = el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить призовые' });
  saveP.onclick = async () => {
    const split = amounts.map((a, i) => ({ place: i + 1, amount: +a.value || 0 }));
    const { error } = await sb.from('settings').upsert({ key: 'prize', value: { total: +total.value || 0, split }, is_public: true, updated_at: new Date().toISOString() });
    if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
    toast('Сохранено', 'ok');
  };
  pBox.append(saveP);
  main.append(pBox);

  // --- Спонсоры ---
  const spBox = el('div', { class: 'panel', style: 'margin-top:22px' }, [el('div', { class: 'panel-title' }, [
    el('h3', { text: 'Спонсоры' }),
    el('button', { class: 'btn btn-gold btn-sm', text: '+ Добавить', onclick: () => sponsorEditor(null) })
  ])]);
  const spList = el('div');
  spBox.append(spList);
  main.append(spBox);

  function paintSponsors() {
    spList.innerHTML = '';
    (sponsors.data || []).forEach(s => spList.append(el('div', { style: 'display:flex;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-soft)' }, [
      s.logo_url ? el('img', { src: s.logo_url, alt: '', style: 'height:34px' }) : null,
      el('span', { style: 'flex:1', text: s.name }),
      el('span', { class: 'badge', text: s.tier }),
      el('button', { class: 'btn btn-ghost btn-sm', text: 'Изменить', onclick: () => sponsorEditor(s) }),
      el('button', { class: 'btn btn-danger btn-sm', text: 'Удалить', onclick: async () => {
        await sb.from('sponsors').delete().eq('id', s.id);
        sponsors.data = sponsors.data.filter(x => x.id !== s.id);
        paintSponsors(); toast('Удалено', 'ok');
      } })
    ].filter(Boolean))));
  }
  paintSponsors();

  function sponsorEditor(s) {
    const name = el('input', { type: 'text', value: s ? s.name : '' });
    const tier = el('select', {}, ['title', 'partner', 'info'].map(t => el('option', { value: t, text: t })));
    tier.value = s ? s.tier : 'partner';
    const url = el('input', { type: 'url', value: s ? s.url : '' });
    const desc = el('textarea', { text: s ? s.description : '' });
    const logo = el('input', { type: 'file', accept: 'image/*' });
    const save = el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить' });
    const cancel = el('button', { class: 'btn btn-ghost btn-sm', text: 'Отмена' });
    const m = window.UI.modal(s ? 'Спонсор' : 'Новый спонсор', el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: 'Название' }), name]),
      el('div', { class: 'field' }, [el('label', { text: 'Уровень' }), tier]),
      el('div', { class: 'field' }, [el('label', { text: 'Ссылка' }), url]),
      el('div', { class: 'field' }, [el('label', { text: 'Описание' }), desc]),
      el('div', { class: 'field' }, [el('label', { text: 'Логотип' }), logo])
    ]), [cancel, save]);
    cancel.onclick = () => m.close();
    save.onclick = async () => {
      let logoUrl = s ? s.logo_url : null;
      if (logo.files[0]) {
        const path = 'sponsors/' + Date.now() + '-' + logo.files[0].name.replace(/[^\w.\-]/g, '_');
        const { error } = await sb.storage.from('photos').upload(path, logo.files[0], { upsert: true });
        if (error) { toast('Лого не загрузилось: ' + error.message, 'error'); return; }
        logoUrl = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
      }
      const payload = { name: name.value.trim(), tier: tier.value, url: url.value.trim(), description: desc.value.trim(), logo_url: logoUrl };
      const q = s ? sb.from('sponsors').update(payload).eq('id', s.id) : sb.from('sponsors').insert(payload);
      const { error } = await q;
      if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
      toast('Сохранено', 'ok'); m.close();
      const fresh = await sb.from('sponsors').select('*').order('sort_order', { ascending: true });
      sponsors.data = fresh.data; paintSponsors();
    };
  }
})();
