/* Главная: факты, отсчёт, новости, превью команд, комментарии. */
(async function () {
  const { $, el, esc, fmtDate, fmtMoney } = window.UI;
  await window.Chrome.init();

  if (!window.DB.ready) {
    $('#news-list').append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
      el('div', { class: 'big', text: 'Новости появятся после подключения базы' })
    ]));
    return;
  }
  const sb = window.DB.sb;

  const [t, news, teams, prize] = await Promise.all([
    sb.from('tournaments').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('v_news_public').select('*').order('published_at', { ascending: false }).limit(2),
    sb.from('v_teams_public').select('*').order('seed_order', { ascending: true }),
    sb.from('settings').select('value').eq('key', 'prize').maybeSingle()
  ]);

  const tour = t.data;
  const teamList = teams.data || [];

  if (tour) {
    $('#fact-start').textContent = fmtDate(tour.starts_at).replace(/ \d{4} г\.$/, '');
    $('#fact-teams').textContent = teamList.length + ' / ' + tour.max_teams;
    // Для завершённого турнира отсчёт не нужен: показываем итог
    if (tour.status === 'finished') {
      const label = $('#cd-label');
      if (label) label.textContent = 'турнир завершён';
      setChampion(tour);
    } else {
      startCountdown(tour);
    }
  }

  // Победитель финала — в подписи hero, чтобы главная сразу отвечала
  // на вопрос «чем закончилось».
  async function setChampion(t) {
    try {
      const { data } = await sb.from('v_matches_public').select('round,best_of,team_a,team_b,winner_id,status,scheduled_at')
        .eq('tournament_id', t.id);
      const list = data || [];
      const last = list.reduce((a, m) => (!a || m.round > a.round) ? m : a, null);
      if (!last || !last.winner_id) return;
      const { data: teamsAll } = await sb.from('v_teams_public').select('id,name');
      const champ = (teamsAll || []).find(x => x.id === last.winner_id);
      if (!champ) return;
      const host = $('#champion-line');
      if (host) host.textContent = 'Чемпион: ' + champ.name + ' — финал BO' + last.best_of;
    } catch (e) { /* подпись не критична для страницы */ }
  }
  // Название в hero берём из настроек: шапка уже показывает короткое
  // название из базы, и h1 не должен с ней расходиться.
  const shortTitle = window.Chrome.settings?.site?.short_title;
  const heroTitle = $('#hero-title');
  if (shortTitle && heroTitle) heroTitle.textContent = shortTitle;
  if (prize.data) {
    $('#fact-prize').textContent = fmtMoney(prize.data.value.total);
  }

  // Новости
  const nl = $('#news-list');
  (news.data || []).forEach(n => nl.append(newsCard(n)));
  if (!(news.data || []).length) nl.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
    el('div', { class: 'big', text: 'Новостей пока нет' })]));

  // Превью команд
  const tp = $('#teams-preview');
  teamList.slice(0, 6).forEach(tm => tp.append(teamCard(tm)));
  if (!teamList.length) tp.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
    el('div', { class: 'big', text: 'Команды появятся после одобрения заявок' })]));

  window.Comments.mount($('#comments-host'), 'main');

  function newsCard(n) {
    return el('a', { class: 'news-card', href: 'news-item.html?slug=' + encodeURIComponent(n.slug) }, [
      el('div', { class: 'cover' }, [
        n.cover_url ? el('img', { src: n.cover_url, alt: '' }) : el('img', { src: 'assets/img/heroes/juggernaut.png', alt: '' }),
        el('span', { class: 'badge gold tag', text: n.tag })
      ]),
      el('div', { class: 'body' }, [
        el('h3', { text: n.title }),
        el('p', { class: 'excerpt', text: n.excerpt }),
        el('div', { class: 'date', text: fmtDate(n.published_at) })
      ])
    ]);
  }

  function teamCard(tm) {
    const initials = (tm.tag || tm.name).slice(0, 4).toUpperCase();
    return el('div', { class: 'team-card' }, [
      el('div', { class: 'logo' }, tm.logo_url ? [el('img', { src: tm.logo_url, alt: '' })] : [document.createTextNode(initials)]),
      el('div', {}, [
        el('div', { class: 't-name', text: tm.name }),
        el('div', { class: 't-meta', text: tm.city })
      ])
    ]);
  }

  function startCountdown(tour) {
    const iso = tour.starts_at;
    if (!iso) return;
    const target = new Date(iso).getTime();
    const ends = tour.ends_at ? new Date(tour.ends_at).getTime() : null;
    const host = $('#countdown');
    const label = $('#cd-label');
    function tick() {
      const d = target - Date.now();
      if (d <= 0) {
        // Отсчёт закончился: показываем состояние турнира, а не «идёт» вечно.
        host.innerHTML = '';
        label.textContent = (ends && Date.now() > ends) ? 'турнир завершён' : 'турнир идёт';
        return;
      }
      const days = Math.floor(d / 86400000);
      const hrs = Math.floor(d % 86400000 / 3600000);
      const min = Math.floor(d % 3600000 / 60000);
      const sec = Math.floor(d % 60000 / 1000);
      host.innerHTML = '';
      [['дн', days], ['час', hrs], ['мин', min], ['сек', sec]].forEach(([l, v]) => {
        host.append(el('div', { class: 'cell' }, [
          el('div', { class: 'n', text: String(v).padStart(2, '0') }),
          el('div', { class: 'l', text: l })
        ]));
      });
    }
    tick();
    setInterval(tick, 1000);
  }
})();
