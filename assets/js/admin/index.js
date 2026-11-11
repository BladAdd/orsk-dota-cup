/* Дашборд оргкомитета: сводка и журнал действий. */
(async function () {
  const { el, fmtFull } = window.UI;
  const ok = await window.AdminShell.init('Обзор');
  if (!ok) return;
  const main = window.AdminShell.main();
  const sb = window.DB.sb;

  const [teams, pending, matches, done, comments, news, audit] = await Promise.all([
    sb.from('teams').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    sb.from('teams').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('bracket_matches').select('id', { count: 'exact', head: true }),
    sb.from('bracket_matches').select('id', { count: 'exact', head: true }).eq('status', 'finished'),
    sb.from('comments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('news').select('id', { count: 'exact', head: true }).eq('is_published', true),
    sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(12)
  ]);

  main.append(el('div', { class: 'stat-row' }, [
    stat(teams.count, 'команд в сетке'),
    stat(pending.count, 'заявок на проверке'),
    stat(done.count + ' / ' + matches.count, 'матчей сыграно'),
    stat(comments.count, 'комментариев в очереди')
  ]));

  main.append(el('div', { class: 'toolbar' }, [
    el('a', { class: 'btn btn-primary btn-sm', href: 'applications.html', text: 'Разобрать заявки' }),
    el('a', { class: 'btn btn-gold btn-sm', href: 'matches.html', text: 'Внести результаты' }),
    el('a', { class: 'btn btn-ghost btn-sm', href: 'news.html', text: 'Написать новость' })
  ]));

  main.append(el('div', { class: 'panel', style: 'margin-top:24px' }, [
    el('div', { class: 'panel-title' }, [el('h3', { text: 'Журнал действий' })]),
    ...(audit.data || []).map(a => el('div', { class: 'audit-line' }, [
      el('span', { class: 't', text: fmtFull(a.created_at) }),
      el('span', {}, [
        el('strong', { text: a.action }),
        document.createTextNode(' · ' + a.entity + (a.entity_id ? ' ' + String(a.entity_id).slice(0, 8) : ''))
      ])
    ])),
    !(audit.data || []).length ? el('p', { class: 'faint', text: 'Действий пока не было.' }) : null
  ].filter(Boolean)));

  function stat(v, k) {
    return el('div', { class: 'stat' }, [el('div', { class: 'v', text: String(v) }), el('div', { class: 'k', text: k })]);
  }
})();
