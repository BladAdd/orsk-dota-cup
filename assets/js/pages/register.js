/* Регистрация: учётная запись капитана -> заявка команды с составом. */
(async function () {
  const { $, el, esc, setStatus, toast, ROLE_LABEL, TEAM_STATUS } = window.UI;
  await window.Chrome.init();
  const host = $('#reg-host');
  if (!window.DB.ready) { host.append(el('div', { class: 'empty-state' }, [
    el('div', { class: 'big', text: 'Регистрация откроется после подключения базы' })])); return; }

  window.Auth.onChange(() => render());

  async function render() {
    host.innerHTML = '';
    if (!window.Auth.user) return authPanel();
    const { data: mine } = await window.DB.sb.from('teams').select('*')
      .eq('captain_id', window.Auth.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (mine) return existingPanel(mine);
    return teamForm();
  }

  // ---------- Шаг 1: учётная запись ----------
  function authPanel() {
    const box = el('div', { class: 'panel' });
    box.append(el('h3', { text: 'Шаг 1. Учётная запись капитана' }));
    box.append(el('p', { class: 'muted', style: 'font-size:14px',
      text: 'Уже есть аккаунт? ' }));
    box.lastChild.append(el('a', { href: 'login.html?next=register.html', text: 'Войдите' }));

    const f = el('form', { novalidate: 'true' });
    const fields = {
      nickname: input('text', 'Никнейм (как в Dota 2)', true),
      fullName: input('text', 'ФИО капитана', true),
      email: input('email', 'E-mail', true),
      password: input('password', 'Пароль (минимум 6 символов)', true)
    };
    Object.entries(fields).forEach(([k, node]) => f.append(wrap(k, node.label, node.input)));
    const btn = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Создать аккаунт' });
    f.append(btn);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      let bad = false;
      const v = k => fields[k].input.value.trim();
      setStatus(fields.nickname.input, v('nickname').length >= 2 ? '' : (bad = true, 'Укажите никнейм'));
      setStatus(fields.fullName.input, v('fullName').length >= 5 ? '' : (bad = true, 'Укажите ФИО'));
      setStatus(fields.email.input, /.+@.+\..+/.test(v('email')) ? '' : (bad = true, 'Некорректный e-mail'));
      setStatus(fields.password.input, v('password').length >= 6 ? '' : (bad = true, 'Минимум 6 символов'));
      if (bad) return;
      btn.disabled = true;
      try {
        await window.Auth.signup({ email: v('email'), password: v('password'), nickname: v('nickname'), fullName: v('fullName') });
        toast('Аккаунт создан', 'ok');
      } catch (err) { toast('Ошибка регистрации: ' + err.message, 'error'); btn.disabled = false; }
    });
    box.append(f);
    host.append(box);
  }

  // ---------- Уже есть заявка ----------
  function existingPanel(team) {
    const st = TEAM_STATUS[team.status] || ['', ''];
    host.append(el('div', { class: 'panel' }, [
      el('h3', { text: 'Ваша заявка: ' + team.name }),
      el('p', {}, [el('span', { class: 'badge ' + st[1], text: st[0] })]),
      el('p', { class: 'muted', style: 'font-size:14px',
        text: team.status === 'pending'
          ? 'Заявка на проверке у оргкомитета. Мы сверяем Steam-аккаунты и подтвердим команду в течение суток.'
          : team.status === 'approved'
            ? 'Команда допущена и находится в сетке. Следите за расписанием в разделе «Сетка».'
            : 'Заявка отклонена. Свяжитесь с оргкомитетом, чтобы уточнить причину.' }),
      el('a', { class: 'btn btn-ghost btn-sm', href: 'bracket.html', text: 'К сетке' })
    ]));
  }

  // ---------- Шаг 2: заявка команды ----------
  function teamForm() {
    const box = el('div', { class: 'panel' });
    box.append(el('h3', { text: 'Шаг 2. Команда и состав' }));

    const teamName = input('text', 'Название команды', true);
    const teamTag = input('text', 'Тег (до 4 символов)');
    const city = input('text', 'Город', true); city.input.value = 'Орск';
    const vk = input('url', 'VK или Telegram капитана для связи');
    box.append(wrap('teamName', teamName.label, teamName.input),
      wrap('teamTag', teamTag.label, teamTag.input),
      wrap('city', city.label, city.input),
      wrap('vk', vk.label, vk.input));

    box.append(el('h4', { text: 'Состав (5 игроков + запасной)', style: 'margin-top:22px' }));
    const rows = [];
    const roles = Object.keys(ROLE_LABEL);
    for (let i = 0; i < 6; i++) {
      const nick = input('text', '', true);
      const role = el('select', {}, roles.map(r => el('option', { value: r, text: ROLE_LABEL[r] })));
      if (roles[i]) role.value = roles[i];
      const steam = input('text', '', false); steam.input.placeholder = 'Steam ID (например 105698964)';
      const phone = input('tel', '', false); phone.input.placeholder = 'Телефон (только для оргкомитета)';
      const cap = el('input', { type: 'radio', name: 'captain', value: String(i) });
      if (i === 0) cap.checked = true;

      const grid = el('div', { class: 'grid', style: 'grid-template-columns:2fr 1.2fr 1.4fr 1.2fr auto;gap:10px;align-items:end;margin-bottom:10px' });
      grid.append(
        fieldCell('Ник в Dota 2', nick.input),
        fieldCell('Позиция', role),
        fieldCell('Steam ID', steam.input),
        fieldCell('Телефон', phone.input),
        fieldCell('Капитан', cap)
      );
      rows.push({ nick, role, steam, phone, cap, grid });
      box.append(grid);
    }

    const agreeRules = el('input', { type: 'checkbox', id: 'agree-rules' });
    const agreePd = el('input', { type: 'checkbox', id: 'agree-pd' });
    box.append(
      el('label', { style: 'display:flex;gap:10px;align-items:flex-start;margin:18px 0 8px;font-size:13px' }, [
        agreeRules,
        el('span', { html: 'Согласен с <a href="rules.html" target="_blank">регламентом турнира</a> и обязуюсь обеспечить явку состава к началу матчей.' })
      ]),
      el('label', { style: 'display:flex;gap:10px;align-items:flex-start;margin-bottom:18px;font-size:13px' }, [
        agreePd,
        el('span', { html: 'Даю согласие на обработку персональных данных (ФИО, контакт) в целях организации турнира согласно <a href="privacy.html" target="_blank">политике</a>.' })
      ])
    );

    const btn = el('button', { class: 'btn btn-primary', text: 'Отправить заявку' });
    btn.onclick = submit;
    box.append(btn);
    host.append(box);

    function fieldCell(labelText, control) {
      return el('div', {}, [el('label', { text: labelText }), control]);
    }

    async function submit() {
      let bad = false;
      const name = teamName.input.value.trim();
      setStatus(teamName.input, name.length >= 2 ? '' : (bad = true, 'Укажите название команды'));
      setStatus(city.input, city.input.value.trim() ? '' : (bad = true, 'Укажите город'));

      const roster = [];
      rows.forEach((r, i) => {
        const n = r.nick.input.value.trim();
        if (i < 5 && !n) { setStatus(r.nick.input, 'Обязательно'); bad = true; }
        else setStatus(r.nick.input, '');
        if (n) roster.push({ nickname: n, role: r.role.value, steam_id: r.steam.input.value.trim(), phone: r.phone.input.value.trim(), is_captain: r.cap.checked, sort_order: i });
      });
      const caps = roster.filter(r => r.is_captain).length;
      if (caps !== 1) { toast('Отметьте ровно одного капитана', 'error'); bad = true; }
      const names = roster.map(r => r.nickname.toLowerCase());
      if (new Set(names).size !== names.length) { toast('Ники в составе не должны повторяться', 'error'); bad = true; }
      if (!agreeRules.checked || !agreePd.checked) { toast('Нужны оба согласия', 'error'); bad = true; }
      if (bad) return;

      btn.disabled = true;
      try {
        const { data: team, error } = await window.DB.sb.from('teams').insert({
          name, tag: teamTag.input.value.trim().toUpperCase(), city: city.input.value.trim(),
          contact_vk: vk.input.value.trim(), captain_id: window.Auth.user.id, status: 'pending'
        }).select().single();
        if (error) throw error;
        const members = roster.map(r => Object.assign({}, r, { team_id: team.id, profile_id: null }));
        const { error: merr } = await window.DB.sb.from('team_members').insert(members);
        if (merr) throw merr;
        toast('Заявка отправлена на проверку', 'ok');
        render();
      } catch (err) {
        toast('Не удалось отправить: ' + err.message, 'error');
        btn.disabled = false;
      }
    }
  }

  function input(type, placeholder, required) {
    const i = el('input', { type, placeholder: placeholder || '' });
    if (required) i.required = true;
    return { input: i, label: placeholder };
  }
  function wrap(key, labelText, control) {
    return el('div', { class: 'field' }, [
      el('label', { text: labelText }), control, el('div', { class: 'error' })
    ]);
  }
})();
