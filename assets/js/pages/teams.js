/* Список допущенных команд с составами. */
(async function () {
  const { $, el, ROLE_LABEL } = window.UI;
  await window.Chrome.init();
  const host = $('#teams-host');
  if (!window.DB.ready) { host.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
    el('div', { class: 'big', text: 'Список появится после подключения базы' })])); return; }

  const [t, m] = await Promise.all([
    window.DB.sb.from('v_teams_public').select('*').order('seed_order', { ascending: true }),
    window.DB.sb.from('v_team_members_public').select('*').order('sort_order', { ascending: true })
  ]);
  const teams = t.data || [];
  const members = m.data || [];

  if (!teams.length) {
    host.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
      el('div', { class: 'big', text: 'Команд пока нет' }),
      el('p', { text: 'Станьте первым: подайте заявку на главной.' })
    ]));
    return;
  }

  teams.forEach(team => {
    const roster = members.filter(x => x.team_id === team.id);
    const initials = (team.tag || team.name).slice(0, 4).toUpperCase();
    const card = el('div', { class: 'panel', style: 'padding:18px' }, [
      el('div', { style: 'display:flex;gap:14px;align-items:center;margin-bottom:14px' }, [
        el('div', { class: 'logo', style: 'width:52px;height:52px' },
          team.logo_url ? [el('img', { src: team.logo_url, alt: '' })] : [document.createTextNode(initials)]),
        el('div', {}, [
          el('div', { style: 'font-family:var(--font-display);font-size:18px', text: team.name }),
          el('div', { class: 't-meta', text: team.city + (team.tag ? ' · [' + team.tag + ']' : '') })
        ])
      ]),
      el('table', { class: 'data' }, [
        el('tbody', {}, roster.map(r => el('tr', {}, [
          el('td', {}, [
            el('strong', { text: r.nickname }),
            r.is_captain ? el('span', { class: 'badge gold', style: 'margin-left:8px', text: 'капитан' }) : null
          ].filter(Boolean)),
          el('td', { class: 'role', text: ROLE_LABEL[r.role] || r.role }),
          el('td', { class: 'right' }, r.steam_url
            ? [el('a', { href: r.steam_url, target: '_blank', rel: 'noopener', text: 'Steam' })]
            : [el('span', { class: 'faint', text: '—' })])
        ])))
      ])
    ]);
    if (!roster.length) card.append(el('p', { class: 'faint', style: 'font-size:13px', text: 'Состав уточняется.' }));
    host.append(card);
  });
})();
