/* Сетка: детерминированный пересчёт слотов от победителей + отрисовка.
 *
 * Идея: слоты любого раунда старше первого полностью выводятся из
 * next_match_id/next_slot нижестоящих матчей, поэтому после любого
 * изменения результата мы просто пересчитываем всё дерево заново.
 * Это делает «отмену результата» и правки победителя безопасными:
 * команды и победители в следующих раундах очищаются сами.
 *
 * Чтение: публичные страницы ходят в public.v_matches_public — там нет
 * внутренних полей (заметка судьи, ссылка на лобби, судья), и аноним
 * не имеет прямого доступа к таблице (008_security_and_likes.sql).
 * Админка передаёт в load() опцию admin: true и читает таблицу целиком,
 * потому что ей нужны next_match_id/next_slot для пересчёта дерева.
 */
(function () {
  const { el, esc, fmtFull, MATCH_STATUS } = window.UI;

  // Публичный набор колонок матча: без заметки судьи, ссылки на лобби
  // и судьи — это внутренние поля (см. 008_security_and_likes.sql).
  const PUBLIC_COLS = 'id,tournament_id,round,match_index,label,best_of,team_a,team_b,' +
    'score_a,score_b,winner_id,status,scheduled_at,map_name,vod_url';

  // Публичное чтение матчей: сначала представление v_matches_public, а если
  // оно ещё старой версии (без tournament_id — база до миграции 008), читаем
  // таблицу явным списком колонок. Так страница не ломается в переходный
  // момент, когда код уже обновлён, а SQL ещё не применён.
  async function loadPublic(sb, tournamentId) {
    const order = q => q.order('round', { ascending: true }).order('match_index', { ascending: true });
    const view = await order(sb.from('v_matches_public').select('*').eq('tournament_id', tournamentId));
    if (!view.error) return view.data || [];
    const table = await order(sb.from('bracket_matches').select(PUBLIC_COLS).eq('tournament_id', tournamentId));
    if (table.error) throw table.error;
    return table.data || [];
  }

  async function load(sb, tournamentId, opts) {
    opts = opts || {};
    const teamsReq = sb.from('v_teams_public').select('*');
    if (opts.admin) {
      // Админке нужны next_match_id/next_slot и внутренние поля матча
      const [m, t] = await Promise.all([
        sb.from('bracket_matches').select('*')
          .eq('tournament_id', tournamentId)
          .order('round', { ascending: true }).order('match_index', { ascending: true }),
        teamsReq
      ]);
      if (m.error) throw m.error;
      return { matches: m.data || [], teams: t.data || [] };
    }
    const [matches, teams] = await Promise.all([loadPublic(sb, tournamentId), teamsReq]);
    return { matches, teams: teams.data || [] };
  }

  function teamMap(teams) {
    const map = {};
    teams.forEach(t => { map[t.id] = t; });
    return map;
  }

  function maxRound(matches) {
    return matches.reduce((a, m) => Math.max(a, m.round), 0);
  }

  function roundLabel(round, total) {
    if (round === total) return 'Финал';
    if (round === total - 1) return 'Полуфинал';
    if (round === total - 2) return 'Четвертьфинал';
    return 'Раунд ' + round;
  }

  // Есть ли результат, который можно показывать счётом
  function hasScore(m) {
    return m.status === 'finished' || m.status === 'walkover' || m.status === 'live';
  }

  // Пересчёт дерева. Работает с копиями и возвращает новый массив,
  // поэтому исходный список (и то, что уже сохранено в базе) не меняется.
  function recompute(matches) {
    const sorted = matches.slice()
      .sort((a, b) => (a.round - b.round) || (a.match_index - b.match_index))
      .map(m => Object.assign({}, m));
    const byId = {};
    sorted.forEach(m => { byId[m.id] = m; });
    const feed = {}; // next_match_id -> { next_slot: winner }

    for (const m of sorted) {
      const parent = m.next_match_id ? byId[m.next_match_id] : null;

      // Слоты раундов старше первого всегда выводим из победителей ниже.
      // Если связи нет (матч-сирота после ручной правки), оставляем как есть.
      if (m.round > 1 && parent) {
        const slot = feed[m.id] || {};
        m.team_a = slot[0] || null;
        m.team_b = slot[1] || null;
      }

      // бай-матч проводит единственного участника дальше автоматически
      if (m.status === 'bye') {
        m.winner_id = m.team_a || m.team_b || null;
      }

      // победитель обязан быть одним из участников слота
      if (m.winner_id && m.winner_id !== m.team_a && m.winner_id !== m.team_b) {
        m.winner_id = null;
        if (m.status === 'finished' || m.status === 'walkover') m.status = 'pending';
      }

      if (m.next_match_id && m.next_slot != null) {
        feed[m.next_match_id] = feed[m.next_match_id] || {};
        feed[m.next_match_id][m.next_slot] = m.winner_id || null;
      }
    }
    return sorted;
  }

  // Сохраняет только изменившиеся строки (team_a/b, winner, status).
  async function save(sb, original, next) {
    const before = {};
    original.forEach(m => { before[m.id] = m; });
    const changed = next.filter(m => {
      const o = before[m.id];
      if (!o) return true;
      return o.team_a !== m.team_a || o.team_b !== m.team_b ||
             o.winner_id !== m.winner_id || o.status !== m.status;
    });
    for (const m of changed) {
      const { error } = await sb.from('bracket_matches').update({
        team_a: m.team_a, team_b: m.team_b, winner_id: m.winner_id, status: m.status
      }).eq('id', m.id);
      if (error) throw error;
    }
    return changed.length;
  }

  // Генерация пустой сетки single elimination под n команд.
  function generate(tournamentId, teamIds, opts) {
    opts = opts || {};
    const size = Math.pow(2, Math.ceil(Math.log2(Math.max(teamIds.length, 2))));
    const rounds = Math.log2(size);
    // стандартная расстановка сидов, чтобы первые номера не встретились рано
    const order = seedOrder(size);
    const firstRoundTeams = order.map(i => teamIds[i] || null);

    const matches = [];
    let prevRound = null;
    for (let r = 1; r <= rounds; r++) {
      const count = size / Math.pow(2, r);
      const roundMatches = [];
      for (let i = 0; i < count; i++) {
        const m = {
          id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
            : 'gen-' + r + '-' + i + '-' + Math.random().toString(36).slice(2),
          tournament_id: tournamentId, round: r, match_index: i + 1,
          label: roundLabel(r, rounds) + (count > 1 ? ' · матч ' + (i + 1) : ''),
          best_of: r === rounds ? (opts.finalBo || 5) : (r >= rounds - 1 ? (opts.semiBo || 3) : (opts.earlyBo || 1)),
          team_a: null, team_b: null, score_a: 0, score_b: 0, winner_id: null,
          status: 'pending', scheduled_at: null, map_name: '', lobby_url: '', vod_url: '',
          note: '', next_match_id: null, next_slot: null
        };
        if (r === 1) {
          // Единственного участника пары всегда ставим в слот A: тогда бай
          // остаётся бай-матчем и не зависит от того, как лёг посев.
          const pair = [firstRoundTeams[i * 2], firstRoundTeams[i * 2 + 1]];
          const present = pair.filter(Boolean);
          m.team_a = present.length === 1 ? present[0] : pair[0];
          m.team_b = present.length === 1 ? null : pair[1];
          if (present.length === 1) m.status = 'bye';
        }
        roundMatches.push(m);
      }
      // связываем предыдущий раунд с текущим: пара матчей -> один слот
      if (prevRound) {
        prevRound.forEach((pm, idx) => {
          pm.next_match_id = roundMatches[Math.floor(idx / 2)].id;
          pm.next_slot = idx % 2;
        });
      }
      matches.push(...roundMatches);
      prevRound = roundMatches;
    }
    return { matches, rounds, size };
  }

  // Порядок сидов для сетки размера size (1-based индексы -> 0-based)
  function seedOrder(size) {
    let arr = [0, 1];
    while (arr.length < size) {
      const n = arr.length * 2;
      const next = [];
      arr.forEach(x => { next.push(x, n - 1 - x); });
      arr = next;
    }
    return arr;
  }

  /* Отрисовка. Колонки выравниваются по дереву: матч раунда r занимает
   * 2^(r-1) строк базовой сетки, поэтому пара матчей первого раунда
   * сходится ровно в середине своего матча следующего раунда. Пустая
   * строка (неполная пара из-за бая) остаётся пустой и держит выравнивание. */
  function render(matches, teams, opts) {
    opts = opts || {};
    const tmap = teamMap(teams);
    const total = maxRound(matches);
    const wrap = el('div', { class: 'bracket-wrap' });
    const board = el('div', { class: 'bracket' });
    if (!total) { wrap.append(board); return wrap; }
    const gridRows = Math.pow(2, total - 1);

    for (let r = 1; r <= total; r++) {
      const inRound = matches.filter(m => m.round === r)
        .sort((a, b) => a.match_index - b.match_index);
      const span = Math.pow(2, r - 1);
      const rows = Math.max(gridRows / span, inRound.length);

      const col = el('div', { class: 'round' }, [
        el('div', { class: 'round-title', text: roundLabel(r, total) })
      ]);
      const body = el('div', { class: 'round-body' });
      for (let i = 0; i < rows; i++) {
        const row = el('div', { class: 'pow' + (inRound[i] ? '' : ' pow-empty') });
        row.style.flexGrow = String(span);
        row.style.flexBasis = '0';
        if (inRound[i]) row.append(matchNode(inRound[i], tmap, opts));
        body.append(row);
      }
      col.append(body);
      board.append(col);
    }
    wrap.append(board);
    return wrap;
  }

  function slotNode(teamId, m, slot, tmap) {
    const t = teamId ? tmap[teamId] : null;
    const isWin = !!teamId && m.winner_id === teamId;
    const showScore = hasScore(m);
    // В бай-матче пустой слот — это не «ждём победителя», а пропуск
    const placeholder = (m.status === 'bye' ? 'пропуск' : 'ожидает победителя');
    return el('div', { class: 'slot ' + (isWin ? 'win ' : '') + (t ? '' : 'empty') }, [
      el('span', { class: 'nm', text: t ? t.name : placeholder }),
      el('span', { class: 'sc', text: (teamId && showScore) ? String(slot === 'a' ? m.score_a : m.score_b) : '' })
    ]);
  }

  function matchNode(m, tmap, opts) {
    const st = MATCH_STATUS[m.status] || ['', ''];
    const cls = 'match' + (m.status === 'live' ? ' is-live' : '') + (m.winner_id ? ' is-done' : '');
    const head = el('div', { class: 'm-head' }, [
      el('span', { text: 'BO' + m.best_of }),
      // Статус информативнее метки: название раунда уже стоит в заголовке
      // колонки, а «Ожидает» / «Сыгран» / «Бай» нужны прямо на карточке.
      m.status === 'live' ? el('span', { class: 'badge live', text: 'live' }) : el('span', { text: st[0] })
    ]);
    const node = el('div', { class: cls, dataset: { matchId: m.id } }, [
      head,
      slotNode(m.team_a, m, 'a', tmap),
      slotNode(m.team_b, m, 'b', tmap)
    ]);
    const footBits = [];
    if (m.scheduled_at) footBits.push(fmtFull(m.scheduled_at));
    if (m.map_name) footBits.push(m.map_name);
    if (footBits.length) node.append(el('div', { class: 'm-foot', text: footBits.join(' · ') }));
    if (opts.onMatch) {
      node.style.cursor = 'pointer';
      node.addEventListener('click', () => opts.onMatch(m));
    }
    return node;
  }

  window.Bracket = { load, teamMap, maxRound, roundLabel, recompute, save, generate, render, seedOrder };
})();
