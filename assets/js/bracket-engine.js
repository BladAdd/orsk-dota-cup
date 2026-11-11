/* Сетка: детерминированный пересчёт слотов от победителей + отрисовка.
 *
 * Идея: слоты любого раунда старше первого полностью выводятся из
 * next_match_id/next_slot нижестоящих матчей, поэтому после любого
 * изменения результата мы просто пересчитываем всё дерево заново.
 * Это делает «отмену результата» и правки победителя безопасными:
 * команды и победители в следующих раундах очищаются сами.
 */
(function () {
  const { el, esc, fmtFull, MATCH_STATUS } = window.UI;

  async function load(sb, tournamentId) {
    const [m, t] = await Promise.all([
      sb.from('bracket_matches').select('*')
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true }).order('match_index', { ascending: true }),
      sb.from('v_teams_public').select('*')
    ]);
    return { matches: m.data || [], teams: t.data || [] };
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

  // Пересчёт дерева. Мутирует копии и возвращает новый массив.
  function recompute(matches) {
    const sorted = matches.slice().sort((a, b) => (a.round - b.round) || (a.match_index - b.match_index));
    const byId = {};
    sorted.forEach(m => { byId[m.id] = Object.assign({}, m); });
    const feed = {}; // next_match_id -> { slot: winnerId }

    for (const m of sorted) {
      if (m.round > 1) {
        m.team_a = (feed[m.id] && feed[m.id][0]) || null;
        m.team_b = (feed[m.id] && feed[m.id][1]) || null;
      }
      if (m.status === 'bye') {
        // бай-матч проводит единственного участника дальше автоматически
        m.winner_id = m.team_a || null;
        if (m.team_a && m.status === 'bye') m.winner_id = m.team_a;
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
          m.team_a = firstRoundTeams[i * 2];
          m.team_b = firstRoundTeams[i * 2 + 1];
          // неполная пара первого раунда = бай для единственного участника
          if (m.team_a && !m.team_b) m.status = 'bye';
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

  function render(matches, teams, opts) {
    opts = opts || {};
    const tmap = teamMap(teams);
    const total = maxRound(matches);
    const wrap = el('div', { class: 'bracket-wrap' });
    const board = el('div', { class: 'bracket' });

    for (let r = 1; r <= total; r++) {
      const col = el('div', { class: 'round' }, [
        el('div', { class: 'round-title', text: roundLabel(r, total) })
      ]);
      matches.filter(m => m.round === r).forEach(m => col.append(matchNode(m, tmap, opts)));
      board.append(col);
    }
    wrap.append(board);
    return wrap;
  }

  function slotNode(teamId, score, isWin, tmap) {
    const t = teamId ? tmap[teamId] : null;
    return el('div', { class: 'slot ' + (isWin ? 'win ' : '') + (t ? '' : 'empty') }, [
      el('span', { class: 'nm', text: t ? t.name : 'ожидает победителя' }),
      el('span', { class: 'sc', text: teamId ? String(score) : '' })
    ]);
  }

  function matchNode(m, tmap, opts) {
    const st = MATCH_STATUS[m.status] || ['', ''];
    const cls = 'match' + (m.status === 'live' ? ' is-live' : '') + (m.winner_id ? ' is-done' : '');
    const head = el('div', { class: 'm-head' }, [
      el('span', { text: 'BO' + m.best_of }),
      m.status === 'live' ? el('span', { class: 'badge live', text: 'live' }) : el('span', { text: st[0] })
    ]);
    const node = el('div', { class: cls, dataset: { matchId: m.id } }, [
      head,
      slotNode(m.team_a, m.score_a, m.winner_id === m.team_a && !!m.team_a, tmap),
      slotNode(m.team_b, m.score_b, m.winner_id === m.team_b && !!m.team_b, tmap)
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
