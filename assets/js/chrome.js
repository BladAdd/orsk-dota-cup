/* Шапка и подвал: рисуются на каждой странице, чтобы не дублировать разметку.
 * Название турнира берётся из настроек базы (settings.site), поэтому шапка,
 * подвал и заголовок вкладки не расходятся с тем, что ввёл оргкомитет. */
(function () {
  const { $, el, esc } = window.UI;
  const ROOT = document.documentElement.dataset.root || '';
  const FALLBACK_TITLE = 'Красный кубок по Dota 2';

  const NAV = [
    ['index.html', 'Главная'],
    ['teams.html', 'Команды'],
    ['bracket.html', 'Сетка'],
    ['schedule.html', 'Расписание'],
    ['rules.html', 'Регламент'],
    ['prizes.html', 'Призовые'],
    ['news.html', 'Новости']
  ];

  let settings = null;

  async function loadSettings() {
    if (!window.DB.ready) return null;
    const { data } = await window.DB.sb.from('settings')
      .select('key, value').in('key', ['site', 'contacts', 'social']);
    if (!data) return null;
    const out = {};
    data.forEach(r => { out[r.key] = r.value; });
    return out;
  }

  const siteTitle = () => (settings && settings.site && settings.site.title) || FALLBACK_TITLE;

  // Заголовок вкладки: «<страница> — <название турнира>». Название турнира
  // берём из настроек, название страницы — из data-page-title в <html>,
  // поэтому в статических тегах <title> оно не дублируется.
  function applyTitle() {
    const page = document.documentElement.dataset.pageTitle;
    document.title = page ? page + ' — ' + siteTitle() : siteTitle();
  }

  // ---- Плашка «турнир идёт» ------------------------------------------
  // Показываем только когда турнир действительно идёт (status = 'live' и
  // время финала не прошло) — ничего не выдумываем: ближайший матч, счёт
  // сыгранных и ссылки берутся из базы.
  async function loadLive() {
    if (!window.DB.ready) return null;
    const sb = window.DB.sb;
    let tour;
    try {
      const r = await sb.from('tournaments').select('id,status,ends_at')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      tour = r.data;
    } catch (e) { return null; }
    if (!tour) return null;
    // Показываем плашку только в живом состоянии или сразу после финала
    const finished = tour.status === 'finished' || tour.status === 'bracket';
    if (tour.status !== 'live' && !finished) return null;
    if (tour.status === 'live' && tour.ends_at && new Date(tour.ends_at).getTime() < Date.now()) return null;

    // Представление матчей, а если база ещё до миграции 008 — таблица
    // явным списком колонок (внутренние поля не трогаем).
    let matches = [];
    try {
      const v = await sb.from('v_matches_public')
        .select('id,round,match_index,best_of,team_a,team_b,status,scheduled_at')
        .eq('tournament_id', tour.id);
      if (v.error) throw v.error;
      matches = v.data || [];
    } catch (e) {
      const t = await sb.from('bracket_matches')
        .select('id,round,match_index,best_of,team_a,team_b,status,scheduled_at')
        .eq('tournament_id', tour.id);
      matches = t.data || [];
    }

    const { data: teams } = await sb.from('v_teams_public').select('id,name');
    const names = {};
    (teams || []).forEach(t => { names[t.id] = t.name; });

    const played = matches.filter(m => m.status === 'finished' || m.status === 'walkover').length;
    const inGame = matches.find(m => m.status === 'live');
    const now = Date.now();
    const next = matches
      .filter(m => m.status === 'pending' && m.scheduled_at)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .find(m => new Date(m.scheduled_at).getTime() >= now - 20 * 60 * 1000);

    const pair = m => (names[m.team_a] || '—') + ' — ' + (names[m.team_b] || '—');

    if (finished) {
      // Итог турнира: победитель финала, ссылка на сетку
      const last = matches.reduce((a, m) => (!a || m.round > a.round) ? m : a, null);
      const champ = last && last.winner_id ? names[last.winner_id] : null;
      return {
        kind: 'done',
        text: champ ? 'турнир завершён · победитель: ' + champ : 'турнир завершён'
      };
    }
    if (inGame && inGame.team_a && inGame.team_b) {
      return { kind: 'live', text: pair(inGame) + ' · BO' + inGame.best_of };
    }
    if (next && next.team_a && next.team_b) {
      return { kind: 'next', text: 'ближайший матч ' + window.UI.fmtFull(next.scheduled_at) + ' · ' + pair(next) };
    }
    return { kind: 'stat', text: 'сыграно матчей: ' + played + ' из ' + matches.length + '. Сетка обновляется по ходу турнира.' };
  }

  async function renderLiveBar() {
    const host = $('#site-header');
    if (!host) return;
    let live = null;
    try { live = await loadLive(); } catch (e) { live = null; }
    if (!live) return;
    host.append(el('div', { class: 'live-bar' }, [
      el('div', { class: 'container inner' }, [
        el('span', { class: 'dot', 'aria-hidden': 'true' }),
        el('span', { class: 'lbl', text: live.kind === 'live' ? 'идёт матч' : (live.kind === 'done' ? 'финал сыгран' : 'турнир идёт') }),
        el('span', { class: 'txt', text: live.text }),
        el('span', { class: 'grow' }),
        el('a', { class: 'btn btn-gold btn-sm', href: ROOT + 'bracket.html', text: 'К сетке' }),
        el('a', { class: 'btn btn-ghost btn-sm', href: ROOT + 'schedule.html', text: 'Расписание' })
      ])
    ]));
  }

  function currentFile() {
    const p = location.pathname.split('/').pop() || 'index.html';
    return p;
  }

  function renderHeader() {
    const host = $('#site-header');
    if (!host) return;
    const here = currentFile();
    const nav = el('nav', { class: 'main-nav', id: 'main-nav' },
      NAV.map(([file, label]) => el('a', {
        href: ROOT + file, class: (file === here ? 'active' : ''), text: label
      })));

    const actions = el('div', { class: 'header-actions' });
    const burger = el('button', {
      class: 'burger', type: 'button', 'aria-label': 'Меню', 'aria-expanded': 'false', 'aria-controls': 'main-nav',
      text: '☰'
    });
    function toggleNav(open) {
      const isOpen = open == null ? !nav.classList.contains('open') : open;
      nav.classList.toggle('open', isOpen);
      burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
    burger.addEventListener('click', e => { e.stopPropagation(); toggleNav(); });
    // Закрываем меню по клику вне него и по переходу — иначе на телефоне
    // оно остаётся открытым поверх страницы.
    document.addEventListener('click', e => {
      if (nav.classList.contains('open') && !nav.contains(e.target) && e.target !== burger) toggleNav(false);
    });
    nav.addEventListener('click', e => { if (e.target.closest('a')) toggleNav(false); });

    const brand = el('a', { class: 'brand', href: ROOT + 'index.html' });
    const marks = el('span', { class: 'brand-marks' }, [
      el('img', { src: ROOT + 'assets/img/kprf.png', alt: 'КПРФ' }),
      el('img', { class: 'dota', src: ROOT + 'assets/img/dota2.png', alt: 'Dota 2' })
    ]);
    brand.append(marks);
    const nameBox = el('span', { class: 'name' });
    nameBox.append(document.createTextNode((settings && settings.site && settings.site.short_title) || 'Красный кубок'));
    nameBox.append(el('small', { text: 'Dota 2 · Орск' }));
    brand.append(nameBox);

    function paintAuth() {
      actions.innerHTML = '';
      if (window.Auth.isAdmin) {
        actions.append(el('a', { class: 'btn btn-gold btn-sm', href: ROOT + 'admin/index.html', text: 'Админка' }));
      }
      if (window.Auth.user) {
        actions.append(el('span', { class: 'muted', style: 'font-size:13px', text: window.Auth.profile?.nickname || window.Auth.user.email }));
        actions.append(el('button', { class: 'btn btn-ghost btn-sm', text: 'Выйти',
          onclick: async () => { await window.Auth.logout(); location.reload(); } }));
      } else {
        actions.append(el('a', { class: 'btn btn-ghost btn-sm', href: ROOT + 'login.html', text: 'Войти' }));
        actions.append(el('a', { class: 'btn btn-primary btn-sm', href: ROOT + 'register.html', text: 'Заявка' }));
      }
    }
    window.Auth.onChange(paintAuth);

    const bar = el('div', { class: 'container bar' }, [brand, nav, burger, actions]);
    host.className = 'site-header';
    host.append(el('div', { class: 'stripe' }), bar);
  }

  function renderFooter() {
    const host = $('#site-footer');
    if (!host) return;
    const c = settings?.contacts || {};
    const year = new Date().getFullYear();

    const social = [];
    if (c.vk) social.push(['vk', c.vk, 'Группа ВКонтакте']);
    if (c.telegram) social.push(['tg', c.telegram, 'Telegram-канал']);
    if (c.discord) social.push(['ds', c.discord, 'Discord турнира']);
    if (c.email) social.push(['mail', 'mailto:' + c.email, c.email]);

    host.className = 'site-footer';
    host.append(el('div', { class: 'container' }, [
      el('div', { class: 'cols' }, [
        el('div', {}, [
          el('h4', { text: siteTitle() }),
          el('p', { class: 'muted', text: 'Открытый любительский турнир Оренбуржья. Призовой фонд 15 000 ₽ предоставлен Орским городским отделением КПРФ.' }),
          el('p', { class: 'faint', style: 'font-size:12px', text: 'Оргкомитет: ' + (c.judge || 'судейская бригада турнира') })
        ]),
        el('div', {}, [
          el('h4', { text: 'Разделы' }),
          ...NAV.map(([f, l]) => el('a', { href: ROOT + f, text: l })),
          el('a', { href: ROOT + 'sponsors.html', text: 'Спонсоры' })
        ]),
        el('div', {}, [
          el('h4', { text: 'Оргкомитет' }),
          ...(social.length
            ? social.map(([k, href, label]) => {
                const a = el('a', { href, text: label });
                if (k !== 'mail') { a.target = '_blank'; a.rel = 'noopener'; }
                return a;
              })
            : [el('span', { class: 'faint', text: 'Контакты появятся после открытия регистрации' })]),
          el('a', { href: ROOT + 'privacy.html', text: 'Обработка персональных данных' })
        ])
      ]),
      el('div', { class: 'legal' }, [
        el('span', { class: 'age-mark', text: window.SITE_CONFIG.ageRating }),
        window.SITE_CONFIG.demoMode
          ? el('span', { class: 'badge', text: 'макет: данные и сообщения показаны для примера' })
          : null,
        el('span', { text: '© ' + year + ' Оргкомитет «' + siteTitle() + '»' }),
        el('span', { text: 'Dota 2 — товарный знак Valve Corporation. Сайт не аффилирован с Valve и не спонсируется ею.' }),
        el('span', { class: 'mono faint', text: window.SITE_CONFIG.timezoneLabel })
      ].filter(Boolean))
    ]));
  }

  window.Chrome = {
    get settings() { return settings; },
    async init() {
      // Ждём первую проверку сессии: иначе уже вошедший капитан видит
      // «Войти», а комментарии предлагают войти повторно.
      await window.Auth.ready;
      settings = await loadSettings();
      applyTitle();
      renderHeader();
      renderFooter();
      renderLiveBar();
      // плашку о неподключённой базе показываем только оргкомитету, не посетителям
      if (!window.DB.ready && /\/admin(\/|$)/.test(location.pathname)) window.DB.setupBanner();
    }
  };
})();
