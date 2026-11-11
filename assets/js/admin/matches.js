/* Админка матчей: счёт, победитель, статус, дата, карта, ссылки.
 * После сохранения победитель автоматически уезжает в следующий раунд. */
(async function () {
  const { el, toast, confirmBox, MATCH_STATUS } = window.UI;
  const ok = await window.AdminShell.init('Матчи и результаты');
  if (!ok) return;
  const main = window.AdminShell.main();
  const sb = window.DB.sb;

  let tournament = null, teams = [], matches = [];

  // Орск = UTC+5 без перехода на летнее время
  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
    const p = n => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
      'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }
  function fromLocalInput(v) { return v ? v + ':00+05:00' : null; }

  async function load() {
    const t = await sb.from('tournaments').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
    tournament = t.data;
    if (!tournament) { main.append(el('div', { class: 'empty-state' }, [el('div', { class: 'big', text: 'Турнир не создан' })])); return; }
    const [tm, mm] = await Promise.all([
      sb.from('teams').select('*').eq('status', 'approved'),
      sb.from('bracket_matches').select('*').eq('tournament_id', tournament.id)
        .order('round', { ascending: true }).order('match_index', { ascending: true })
    ]);
    teams = tm.data || [];
    matches = mm.data || [];
    draw();
  }

  function name(id) { const t = teams.find(x => x.id === id); return t ? t.name : '—'; }

  function draw() {
    main.querySelectorAll(':scope > *:not(.admin-top)').forEach(n => n.remove());
    if (!matches.length) {
      main.append(el('div', { class: 'empty-state' }, [
        el('div', { class: 'big', text: 'Сетка ещё не построена' }),
        el('p', {}, [el('a', { href: 'bracket.html', text: 'Перейти к генерации сетки' })])]));
      return;
    }
    main.append(el('p', { class: 'muted', style: 'font-size:13px',
      text: 'Кликните по матчу, чтобы внести счёт и победителя. Победитель автоматически перейдёт в следующий раунд; сброс результата очищает все зависимые раунды.' }));

    const total = window.Bracket.maxRound(matches);
    for (let r = 1; r <= total; r++) {
      const rows = matches.filter(m => m.round === r);
      if (!rows.length) continue;
      main.append(el('h3', { text: window.Bracket.roundLabel(r, total), style: 'margin:22px 0 10px' }));
      const table = el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Матч' }), el('th', { text: 'Команды' }), el('th', { text: 'Счёт' }),
          el('th', { text: 'Дата' }), el('th', { text: 'Статус' }), el('th', { text: '' })
        ])]),
        el('tbody', {}, rows.map(m => {
          const st = MATCH_STATUS[m.status] || ['', ''];
          const tr = el('tr', { style: 'cursor:pointer', onclick: () => edit(m) }, [
            el('td', { class: 'faint', text: m.label }),
            el('td', {}, [
              el('strong', { text: name(m.team_a), style: m.winner_id === m.team_a && m.team_a ? 'color:var(--gold)' : '' }),
              document.createTextNode(' — '),
              el('strong', { text: name(m.team_b), style: m.winner_id === m.team_b && m.team_b ? 'color:var(--gold)' : '' })
            ]),
            el('td', { class: 'mono', text: m.score_a + ':' + m.score_b }),
            el('td', { class: 'faint nowrap', text: m.scheduled_at ? toLocalInput(m.scheduled_at).replace('T', ' ') : '—' }),
            el('td', {}, [el('span', { class: 'badge ' + st[1], text: st[0] })]),
            el('td', {}, [el('button', { class: 'btn btn-ghost btn-sm', text: 'Изменить' })])
          ]);
          return tr;
        }))
      ]);
      main.append(table);
    }
  }

  function edit(m) {
    const teamOpts = [el('option', { value: '', text: '—' })];
    if (m.team_a) teamOpts.push(el('option', { value: m.team_a, text: name(m.team_a) }));
    if (m.team_b) teamOpts.push(el('option', { value: m.team_b, text: name(m.team_b) }));

    const status = el('select', {}, Object.entries(MATCH_STATUS).map(([k, v]) => el('option', { value: k, text: v[0] })));
    status.value = m.status;
    const scoreA = el('input', { type: 'number', min: '0', value: String(m.score_a), style: 'width:80px' });
    const scoreB = el('input', { type: 'number', min: '0', value: String(m.score_b), style: 'width:80px' });
    const winner = el('select', {}, teamOpts);
    winner.value = m.winner_id || '';
    const when = el('input', { type: 'datetime-local', value: toLocalInput(m.scheduled_at) });
    const bo = el('input', { type: 'number', min: '1', max: '5', value: String(m.best_of), style: 'width:80px' });
    const map = el('input', { type: 'text', value: m.map_name || '', placeholder: 'например, решающая карта' });
    const lobby = el('input', { type: 'url', value: m.lobby_url || '', placeholder: 'ссылка на лобби' });
    const vod = el('input', { type: 'url', value: m.vod_url || '', placeholder: 'ссылка на запись' });
    const note = el('textarea', { text: m.note || '' });

    const body = el('div', {}, [
      el('div', { class: 'grid grid-2' }, [
        el('div', { class: 'field' }, [el('label', { text: 'Статус' }), status]),
        el('div', { class: 'field' }, [el('label', { text: 'Победитель' }), winner]),
        el('div', { class: 'field' }, [el('label', { text: 'Счёт A : B' }), el('div', { style: 'display:flex;gap:8px;align-items:center' }, [scoreA, document.createTextNode(':'), scoreB])]),
        el('div', { class: 'field' }, [el('label', { text: 'Формат (BO)' }), bo]),
        el('div', { class: 'field', style: 'grid-column:1/-1' }, [el('label', { text: 'Дата и время (UTC+5)' }), when])
      ]),
      el('div', { class: 'field' }, [el('label', { text: 'Карта / примечание к карте' }), map]),
      el('div', { class: 'field' }, [el('label', { text: 'Лобби' }), lobby]),
      el('div', { class: 'field' }, [el('label', { text: 'Запись (VOD)' }), vod]),
      el('div', { class: 'field' }, [el('label', { text: 'Заметка судьи' }), note])
    ]);

    const save = el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить и провести дальше' });
    const reset = el('button', { class: 'btn btn-danger btn-sm', text: 'Сбросить результат' });
    const cancel = el('button', { class: 'btn btn-ghost btn-sm', text: 'Отмена' });
    const modal = window.UI.modal(m.label, body, [reset, cancel, save]);
    cancel.onclick = () => modal.close();

    reset.onclick = async () => {
      const yes = await confirmBox('Сбросить результат?', 'Победитель и все зависимые раунды будут очищены.');
      if (!yes) return;
      const before = matches.map(x => Object.assign({}, x));
      const t = matches.find(x => x.id === m.id);
      t.winner_id = null; t.score_a = 0; t.score_b = 0; t.status = 'pending';
      await persist(before);
      modal.close();
    };

    save.onclick = async () => {
      const w = winner.value || null;
      if (w && w !== m.team_a && w !== m.team_b) { toast('Победитель должен быть участником матча', 'error'); return; }
      const a = +scoreA.value || 0, b = +scoreB.value || 0;
      if (status.value === 'finished' && !w) { toast('Для завершённого матча укажите победителя', 'error'); return; }
      if (w && (status.value === 'pending' || status.value === 'live')) status.value = 'finished';

      const before = matches.map(x => Object.assign({}, x));
      const t = matches.find(x => x.id === m.id);
      Object.assign(t, {
        status: status.value, score_a: a, score_b: b, winner_id: w,
        best_of: +bo.value || 1, scheduled_at: fromLocalInput(when.value),
        map_name: map.value.trim(), lobby_url: lobby.value.trim(), vod_url: vod.value.trim(), note: note.value
      });
      await persist(before);
      modal.close();
    };
  }

  async function persist(before) {
    // сначала сохраняем поля самого матча, затем пересчитываем дерево
    for (const m of matches) {
      const o = before.find(x => x.id === m.id);
      if (!o) continue;
      const same = o.status === m.status && o.score_a === m.score_a && o.score_b === m.score_b &&
        o.best_of === m.best_of && o.scheduled_at === m.scheduled_at && o.map_name === m.map_name &&
        o.lobby_url === m.lobby_url && o.vod_url === m.vod_url && o.note === m.note && o.winner_id === m.winner_id;
      if (same) continue;
      const { error } = await sb.from('bracket_matches').update({
        status: m.status, score_a: m.score_a, score_b: m.score_b, best_of: m.best_of,
        scheduled_at: m.scheduled_at, map_name: m.map_name, lobby_url: m.lobby_url,
        vod_url: m.vod_url, note: m.note, winner_id: m.winner_id
      }).eq('id', m.id);
      if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
    }
    const next = window.Bracket.recompute(matches);
    try {
      const n = await window.Bracket.save(sb, before, next);
      matches = next;
      toast(n ? 'Сохранено, победители проведены (' + n + ' обновлений)' : 'Сохранено', 'ok');
      load();
    } catch (e) { toast('Ошибка проведения: ' + e.message, 'error'); }
  }

  load();
})();
