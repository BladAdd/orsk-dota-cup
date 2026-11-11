/* Админка сетки: генерация, порядок посева, ручная расстановка по слотам. */
(async function () {
  const { el, toast, confirmBox } = window.UI;
  const ok = await window.AdminShell.init('Сетка турнира');
  if (!ok) return;
  const main = window.AdminShell.main();
  const sb = window.DB.sb;

  let tournament = null, teams = [], matches = [];

  async function load() {
    const t = await sb.from('tournaments').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
    tournament = t.data;
    const [tm, mm] = await Promise.all([
      sb.from('teams').select('*').eq('status', 'approved').order('seed_order', { ascending: true }),
      tournament ? sb.from('bracket_matches').select('*').eq('tournament_id', tournament.id)
        .order('round', { ascending: true }).order('match_index', { ascending: true }) : { data: [] }
    ]);
    teams = tm.data || [];
    matches = mm.data || [];
    draw();
  }

  function draw() {
    // очищаем всё кроме шапки
    main.querySelectorAll(':scope > *:not(.admin-top)').forEach(n => n.remove());

    if (!tournament) { main.append(el('div', { class: 'empty-state' }, [el('div', { class: 'big', text: 'Турнир не создан' })])); return; }

    if (!matches.length) return drawGenerator();

    // Управление существующей сеткой
    main.append(el('div', { class: 'toolbar' }, [
      el('span', { class: 'muted', text: 'Матчей: ' + matches.length + ' · команд: ' + teams.length }),
      el('span', { class: 'grow' }),
      el('button', { class: 'btn btn-danger btn-sm', text: 'Пересоздать сетку', onclick: async () => {
        const yes = await confirmBox('Пересоздать сетку?', 'Все результаты матчей будут удалены. Действие необратимо.');
        if (!yes) return;
        const { error } = await sb.from('bracket_matches').delete().eq('tournament_id', tournament.id);
        if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
        toast('Сетка удалена', 'ok'); load();
      } })
    ]));

    main.append(el('p', { class: 'muted', style: 'font-size:13px',
      text: 'Кликните по матчу, чтобы вручную поставить команды в слоты (например, после снятия одной из команд). Результаты и продвижение победителей — в разделе «Матчи и результаты».' }));

    main.append(window.Bracket.render(matches, teams, { onMatch: editSlots }));
  }

  function drawGenerator() {
    const order = teams.slice();
    const box = el('div', { class: 'panel' });
    box.append(el('h3', { text: 'Генерация сетки' }));
    box.append(el('p', { class: 'muted', style: 'font-size:14px',
      text: 'Команд: ' + order.length + '. Сетка строится single elimination до ближайшей степени двух (' +
        Math.pow(2, Math.ceil(Math.log2(Math.max(order.length, 2)))) + '); недостающие пары первого раунда становятся бай-матчами.' }));

    const list = el('div', { style: 'margin:18px 0' });
    function paintList() {
      list.innerHTML = '';
      order.forEach((t, i) => {
        list.append(el('div', { style: 'display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line-soft)' }, [
          el('span', { class: 'mono faint', style: 'width:26px', text: String(i + 1) }),
          el('span', { style: 'flex:1', text: t.name }),
          el('button', { class: 'btn btn-ghost btn-sm', text: '↑', onclick: () => { if (i > 0) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; paintList(); } } }),
          el('button', { class: 'btn btn-ghost btn-sm', text: '↓', onclick: () => { if (i < order.length - 1) { [order[i + 1], order[i]] = [order[i], order[i + 1]]; paintList(); } } })
        ]));
      });
    }
    paintList();
    box.append(list);

    const boEarly = el('select', {}, [el('option', { value: '1', text: 'BO1' })]); boEarly.value = '1';
    const boSemi = el('select', {}, [el('option', { value: '3', text: 'BO3' })]); boSemi.value = '3';
    const boFinal = el('select', {}, [el('option', { value: '3', text: 'BO3' }), el('option', { value: '5', text: 'BO5' })]); boFinal.value = '5';
    box.append(el('div', { class: 'grid grid-3' }, [
      el('div', { class: 'field' }, [el('label', { text: 'Раунд 1 и 1/4' }), boEarly]),
      el('div', { class: 'field' }, [el('label', { text: 'Полуфиналы' }), boSemi]),
      el('div', { class: 'field' }, [el('label', { text: 'Финал' }), boFinal])
    ]));

    const gen = el('button', { class: 'btn btn-primary', text: 'Сгенерировать сетку' });
    gen.onclick = async () => {
      if (order.length < 2) { toast('Нужно минимум две команды', 'error'); return; }
      const { matches: genMatches } = window.Bracket.generate(tournament.id, order.map(t => t.id), {
        earlyBo: +boEarly.value, semiBo: +boSemi.value, finalBo: +boFinal.value
      });
      // проставляем порядок посева как в списке
      for (let i = 0; i < order.length; i++) await sb.from('teams').update({ seed_order: i + 1 }).eq('id', order[i].id);
      const { error } = await sb.from('bracket_matches').insert(genMatches);
      if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
      toast('Сетка построена', 'ok');
      load();
    };
    box.append(gen);
    main.append(box);
  }

  function editSlots(m) {
    const opts = [el('option', { value: '', text: '— пусто —' })]
      .concat(teams.map(t => el('option', { value: t.id, text: t.name })));
    const selA = el('select', {}, opts.map(o => o.cloneNode(true)));
    const selB = el('select', {}, opts.map(o => o.cloneNode(true)));
    selA.value = m.team_a || '';
    selB.value = m.team_b || '';

    const body = el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: 'Слот A' }), selA]),
      el('div', { class: 'field' }, [el('label', { text: 'Слот B' }), selB]),
      el('p', { class: 'faint', style: 'font-size:12px', text: 'Для раундов старше первого слоты обычно выводятся из результатов; ручная правка нужна при снятии команды.' })
    ]);
    const save = el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить' });
    const cancel = el('button', { class: 'btn btn-ghost btn-sm', text: 'Отмена' });
    const modal = window.UI.modal(m.label, body, [cancel, save]);
    cancel.onclick = () => modal.close();
    save.onclick = async () => {
      if (selA.value && selA.value === selB.value) { toast('Одна команда не может играть сама с собой', 'error'); return; }
      const before = matches.map(x => Object.assign({}, x));
      const target = matches.find(x => x.id === m.id);
      target.team_a = selA.value || null;
      target.team_b = selB.value || null;
      const next = window.Bracket.recompute(matches);
      try {
        await window.Bracket.save(sb, before, next);
        toast('Слоты обновлены', 'ok'); modal.close(); load();
      } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
    };
  }

  load();
})();
