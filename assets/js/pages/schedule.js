/* Расписание: матчи, сгруппированные по дням. */
(async function () {
  const { $, el, fmtDate, fmtTime, MATCH_STATUS } = window.UI;
  await window.Chrome.init();
  const host = $('#schedule-host');
  if (!window.DB.ready) { host.append(el('div', { class: 'empty-state' }, [
    el('div', { class: 'big', text: 'Расписание появится после подключения базы' })])); return; }

  const { data: tour } = await window.DB.sb.from('tournaments')
    .select('id').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!tour) { host.append(el('div', { class: 'empty-state' }, [el('div', { class: 'big', text: 'Турнир ещё не создан' })])); return; }

  const { matches, teams } = await window.Bracket.load(window.DB.sb, tour.id);
  const tmap = window.Bracket.teamMap(teams);
  const scheduled = matches.filter(m => m.scheduled_at).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  if (!scheduled.length) {
    host.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'big', text: 'Расписание формируется' }),
      el('p', { text: 'Даты матчей появятся после жеребьёвки.' })]));
    return;
  }

  const byDay = {};
  scheduled.forEach(m => {
    const day = fmtDate(m.scheduled_at);
    (byDay[day] = byDay[day] || []).push(m);
  });

  Object.entries(byDay).forEach(([day, list]) => {
    host.append(el('h3', { text: day, style: 'margin:26px 0 12px' }));
    const table = el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Время' }), el('th', { text: 'Раунд' }), el('th', { text: 'Матч' }),
        el('th', { text: 'Формат' }), el('th', { text: 'Статус' })
      ])]),
      el('tbody', {}, list.map(m => {
        const st = MATCH_STATUS[m.status] || ['', ''];
        const a = m.team_a ? tmap[m.team_a] : null;
        const b = m.team_b ? tmap[m.team_b] : null;
        return el('tr', {}, [
          el('td', { class: 'nowrap mono', text: fmtTime(m.scheduled_at) }),
          el('td', { text: m.label.split(' · ')[0] }),
          el('td', {}, [
            el('strong', { text: a ? a.name : '—' }),
            document.createTextNode('  —  '),
            el('strong', { text: b ? b.name : '—' }),
            m.winner_id ? el('span', { class: 'muted', text: '  (' + (m.score_a) + ':' + (m.score_b) + ')' }) : null
          ].filter(Boolean)),
          el('td', { text: 'BO' + m.best_of }),
          el('td', {}, [el('span', { class: 'badge ' + st[1], text: st[0] })])
        ]);
      }))
    ]);
    host.append(table);
  });
})();
