/* =====================================================================
   ДЕМО-ДАННЫЕ И ДЕМО-КЛИЕНТ.
   
   Включается флагом SITE_CONFIG.demoMode = true в assets/js/config.js.
   В этом режиме сайт не обращается к Supabase вообще: db.js подставляет
   этот клиент, а он отвечает на те же запросы (from().select().eq()...)
   данными ниже. Набор придуман для показа сайта: турнир завершён, счёт
   матчей и сообщения — примерные, не отчёты о реальных играх.
   Поэтому в подвале на всех страницах висит пометка про демо-режим.
   
   Выключить: demoMode = false — и сайт снова работает с настоящей базой.
   ===================================================================== */
(function () {
  const now = '2026-11-22';
  const at = (h, m) => now + 'T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00+05:00';

  // --- команды (как в турнире) -----------------------------------------
  const teams = [
    ['t01', '322 Team', '322', 'Орск', 1],
    ['t02', 'ТОБОЛЬСКИЕ ПЕЛЬМЕНИ', 'ТБЛП', 'Тобольск', 2],
    ['t03', 'Barni team', 'BRNI', 'Санкт-Петербург', 3],
    ['t04', 'Team spivon', 'SPVN', 'Воронеж', 4],
    ['t05', 'Gubka Team', 'GUBK', 'Новотроицк', 5],
    ['t06', 'Одетые', 'ОДЕТ', 'Москва', 6],
    ['t07', 'ПИСТОЛЕТОВ Team', 'ПСТЛ', 'Рязань', 7],
    ['t08', 'Beton legions', 'BETN', 'Оренбург', 8],
    ['t09', 'Freaks team', 'FRKS', 'Ульяновск', 9],
    ['t10', 'Team иосип', 'ИОСП', 'Орск', 10],
    ['t11', 'Matvei Badyak', 'MTVB', 'Гай', 11],
    ['t12', 'The Beatles', 'BTLS', 'Краснодар', 12],
    ['t13', 'Бургер мопсы', 'БРГМ', 'Оренбург', 13],
    ['t14', 'Rapira team', 'RPR', 'Новотроицк', 14]
  ].map(([id, name, tag, city, seed_order]) => ({
    id, name, tag, city, seed_order, logo_url: null, status: 'approved'
  }));

  const name = id => (teams.find(t => t.id === id) || {}).name;

  // --- сетка: всё сыграно, чемпион — 322 Team --------------------------
  const matches = [
    // раунд 1 (BO1)
    ['m101', 1, 1, 'Раунд 1 · матч 1', 1, 't01', 't02', 1, 0, 't01', 'finished', at(11, 0)],
    ['m102', 1, 2, 'Раунд 1 · матч 2', 1, 't03', 't04', 1, 0, 't03', 'finished', at(11, 45)],
    ['m103', 1, 3, 'Раунд 1 · матч 3', 1, 't05', 't06', 1, 0, 't05', 'finished', at(12, 30)],
    ['m104', 1, 4, 'Раунд 1 · матч 4', 1, 't07', 't08', 1, 0, 't07', 'finished', at(13, 15)],
    ['m105', 1, 5, 'Раунд 1 · матч 5', 1, 't09', 't10', 1, 0, 't09', 'finished', at(14, 0)],
    ['m106', 1, 6, 'Раунд 1 · матч 6', 1, 't11', 't12', 1, 0, 't11', 'finished', at(14, 45)],
    ['m107', 1, 7, 'Раунд 1 · матч 7', 1, 't13', 't14', 1, 0, 't13', 'finished', at(15, 30)],
    // четвертьфиналы (BO1); четвёртый — бай для победителя 7-й пары
    ['m201', 2, 1, 'Четвертьфинал 1', 1, 't01', 't03', 1, 0, 't01', 'finished', at(16, 30)],
    ['m202', 2, 2, 'Четвертьфинал 2', 1, 't05', 't07', 1, 0, 't05', 'finished', at(17, 15)],
    ['m203', 2, 3, 'Четвертьфинал 3', 1, 't09', 't11', 0, 1, 't11', 'finished', at(18, 0)],
    ['m204', 2, 4, 'Бай', 1, 't13', null, 0, 0, 't13', 'bye', null],
    // полуфиналы (BO3)
    ['m301', 3, 1, 'Полуфинал 1', 3, 't01', 't05', 2, 1, 't01', 'finished', at(18, 45)],
    ['m302', 3, 2, 'Полуфинал 2', 3, 't11', 't13', 0, 2, 't13', 'finished', at(19, 45)],
    // финал (BO5)
    ['m401', 4, 1, 'Финал', 5, 't01', 't13', 3, 2, 't01', 'finished', at(20, 45)]
  ].map(([id, round, match_index, label, best_of, team_a, team_b, score_a, score_b, winner_id, status, scheduled_at]) => ({
    id, tournament_id: 'demo-tour', round, match_index, label, best_of,
    team_a, team_b, score_a, score_b, winner_id, status, scheduled_at,
    map_name: '', vod_url: '', note: ''
  }));

  // --- сообщения в обсуждении -----------------------------------------
  const comment = (id, page_key, who, body, likes, ts, staff, pinned) => ({
    id, page_key, parent_id: null, author_id: null, author_name: who, body,
    is_pinned: !!pinned, is_staff: !!staff, likes_count: likes,
    created_at: ts, author_nickname: who, author_avatar: null
  });

  const comments = [
    comment('c01', 'main', 'Оргкомитет', 'Спасибо Орскому городскому отделению КПРФ за призовой фонд. Весь фонд — 15 000 ₽ — забрала команда-победитель: приз получил капитан на награждении.', 24, at(9, 0), true, true),
    comment('c02', 'main', 'Дмитрий Ковалёв', 'Финал на пять карт — это было сильно. 322 Team вытащили решающую игру на последнем герое, до сих пор под впечатлением.', 18, at(21, 40)),
    comment('c03', 'main', 'Анастасия Гринёва', 'Смотрели финал всей командой на созвоне, кричали так, что соседи стучали. Спасибо за турнир, ждём следующий.', 14, at(21, 52)),
    comment('c04', 'main', 'Пётр Ефремов', 'Организация на уровне: лобби открывали заранее, судья отвечал моментально, расписание висело на сайте без задержек.', 11, at(22, 5)),
    comment('c05', 'main', 'Ильдар Сафин', 'Бургер мопсы — молодцы, прошли через бай и вытащили полуфинал. В финале чуть-чуть не хватило.', 9, at(22, 18)),
    comment('c06', 'main', 'Марина Долгова', 'Приехали из Новотроицка поболеть за своих. Атмосфера дружелюбная, чужие команды тоже поддерживали.', 8, at(22, 31)),
    comment('c07', 'main', 'Сергей Курочкин', 'Пятнадцать тысяч призовых для любительского турнира — серьёзно. Рад, что город получил такое событие.', 13, at(22, 44)),
    comment('c08', 'main', 'Ольга Тимофеева', 'Отдельный респект комментатору: объяснял драфты так, что даже те, кто не играет, всё поняли.', 10, at(22, 57)),
    comment('c09', 'main', 'Артём Белоусов', 'Регламент написан по-человечески: и паузы, и замены понятны. Спорить в лобби просто не о чем.', 7, at(23, 10)),
    comment('c10', 'main', 'Виктор Панкратов', 'Спасибо Орску и оргкомитету. Обычно такие турниры умирают на первом дне, а тут дошли до финала и без скандалов.', 12, at(23, 23)),
    comment('c11', 'main', 'Екатерина Лунёва', 'Площадку в центре дали — и это было правильное решение, публики на финале собралось прилично.', 6, at(23, 36)),
    comment('c12', 'main', 'Никита Сорокин', 'Вылетели в первом раунде, но зла не держим: организаторы не бросили, разобрали матч и объяснили ошибки.', 9, at(23, 49)),
    comment('c13', 'main', 'Алексей Чистяков', 'Результаты появлялись на сайте сразу после карт, спойлеры в чат не скидывали. Мелочь, а приятно.', 5, at(0, 2)),
    comment('c14', 'bracket', 'Татьяна Романова', 'Сетка читается легко: видно, кто через бай прошёл и как команды сходятся в полуфиналах.', 6, at(0, 15)),
    comment('c15', 'bracket', 'Роман Гладков', 'Готовы играть во втором сезоне, если оргкомитет соберётся. Такого формата в области не хватало.', 8, at(0, 28)),
    comment('c16', 'bracket', 'Оргкомитет', 'Итоги: 14 команд, 13 матчей, чемпион — 322 Team. Спасибо всем, кто пришёл и кто болел онлайн.', 16, at(0, 40), true, true),
    comment('c17', 'main', 'Полина Захарова', 'Болела за команду брата, и всё равно довольна: бай разыграли честно, никто не жаловался на судейство.', 7, at(0, 55)),
    comment('c18', 'main', 'Максим Терентьев', 'Пришёл посмотреть и остался до конца. Через год хочу играть сам, буду собирать состав.', 10, at(1, 10)),
    comment('c19', 'main', 'Кирилл Абрамов', 'Записи матчей выложили быстро, посмотрел финал в повторе ещё раз с блокнотом. По драфтам видно, кто готовился.', 12, at(1, 25)),
    comment('c20', 'main', 'Дарья Мельникова', 'Награждение сделали по-человечески: кубки и медали получили все команды, дошедшие до полуфиналов, а не только чемпион.', 9, at(1, 40)),
    comment('c21', 'bracket', 'Егор Панов', 'Сетка на сайте понятная: видно и бай, и кто с кем сходится. Не пришлось спрашивать в чате, когда играть.', 7, at(1, 52)),
    comment('c22', 'main', 'Владислав Носов', 'Судейство ровное: спорную паузу разобрали по регламенту и без криков. Редкость для любительского турнира.', 11, at(2, 5)),
    comment('c23', 'main', 'Ксения Белова', 'Привела друзей, которые в доту не играют, — и они досмотрели финал до конца. Значит, было интересно.', 8, at(2, 20)),
    comment('c24', 'main', 'Александр Жуков', 'Приз капитан чемпионов получил в тот же вечер, как и обещали. За это отдельное спасибо спонсору и оргкомитету.', 13, at(2, 35))
  ];

  // --- новости ---------------------------------------------------------
  const news = [
    {
      id: 'n1', slug: 'final-322-team', title: 'Финал: 322 Team — чемпион Красного кубка',
      excerpt: 'Финал BO5 закончился 3:2 в пользу 322 Team. Бургер мопсы довели пятую карту до поздней игры, но не удержали хайграунд.',
      body: 'Финал Красного кубка по Dota 2 получился таким, каким его и хотели видеть: пять карт, последняя — час с лишним, обе команды на хайграунде.\n\n322 Team забрали первую и третью карты, Бургер мопсы ответили на второй и четвёртой. На решающей карте команды разошлись на сорок минут, но ставка на поздний драфт у 322 Team сработала.\n\nИтог серии — 3:2. Чемпион турнира — 322 Team, серебро у Бургер мопсы, третье место разделили полуфиналисты.',
      tag: 'итоги', cover_url: null, published_at: at(21, 30), author_nickname: 'Оргкомитет'
    },
    {
      id: 'n2', slug: 'turnir-skoro-nachnetsya', title: 'Турнир скорее начался',
      excerpt: 'Полная сетка готова: четырнадцать команд, семь пар первого раунда и один бай.',
      body: 'Полный список команд опубликован, пары первого раунда зафиксированы. Матчи игрались один день, финал — на площадке в Орске.',
      tag: 'анонс', cover_url: null, published_at: at(10, 0), author_nickname: 'Оргкомитет'
    },
    {
      id: 'n3', slug: 'reglament-i-format', title: 'Регламент: формат, паузы и замены',
      excerpt: 'BO1 до полуфиналов, BO3 в полуфиналах, BO5 в финале, паузы и порядок замен.',
      body: 'Раунд 1 и четвертьфиналы — BO1, полуфиналы — BO3, финал — BO5. Тактическая пауза до 5 минут на карту, техническая до 10 при дисконнекте.',
      tag: 'регламент', cover_url: null, published_at: at(9, 30), author_nickname: 'Оргкомитет'
    }
  ];

  const settings = [
    {
      key: 'site', is_public: true, value: {
        title: 'Красный кубок по Dota 2', short_title: 'Красный кубок',
        tagline: '14 команд. Одна сетка. 15 000 ₽ победителю.', age_rating: '16+',
        timezone: 'Asia/Yekaterinburg', timezone_label: 'время екатеринбургское (UTC+5)'
      }
    },
    {
      key: 'contacts', is_public: true, value: {
        vk: '', telegram: '', discord: '', email: 'orsk.dota.cup@example.org',
        judge: 'Судейская бригада отвечает в Discord турнира в канале #судьи'
      }
    },
    {
      key: 'prize', is_public: true, value: {
        total: 15000,
        // Всё за первое место: второго и третьего денежного приза нет
        split: [{ place: 1, amount: 15000 }]
      }
    },
    { key: 'social', is_public: true, value: { og_image: 'assets/img/og-image.png' } }
  ];

  const sponsors = [{
    id: 's1', name: 'КПРФ · Орск', tier: 'title', logo_url: 'assets/img/kprf-lockup.svg', url: '',
    description: 'Орское городское отделение КПРФ — генеральный спонсор турнира: призовой фонд, площадка финала и награждение.',
    sort_order: 0
  }];

  const tournaments = [{
    id: 'demo-tour', title: 'Красный кубок по Dota 2',
    subtitle: 'Открытый любительский турнир при поддержке Орского городского отделения КПРФ',
    format: 'single_elimination', team_size: 5, max_teams: 14,
    registration_opens: '2026-11-11T19:00:00+05:00', registration_closes: '2026-11-21T23:59:00+05:00',
    starts_at: '2026-11-22T11:00:00+05:00', ends_at: '2026-11-22T23:30:00+05:00',
    prize_fund: 15000, venue: 'Онлайн (серверы EU West), финал — Орск', status: 'finished',
    created_at: '2026-11-11T21:32:00+05:00'
  }];

  const profile = { id: 'demo-user', nickname: 'Демо-гость', role: 'user', banned_until: null };

  const TABLES = {
    tournaments,
    teams,
    bracket_matches: matches,
    v_matches_public: matches,
    v_teams_public: teams,
    v_team_members_public: [],
    v_comments_public: comments,
    comments,
    v_news_public: news,
    news,
    sponsors,
    settings,
    profiles: [profile],
    comment_reports: []
  };

  // ---------------------------------------------------------------------
  // Мини-клиент с тем же интерфейсом, что у supabase-js: страницы вызывают
  // from().select().eq().order()... и rpc(), и не знают, что базы нет.
  // ---------------------------------------------------------------------
  function query(table) {
    let rows = (TABLES[table] || []).slice();
    const api = {
      select() { return api; },
      eq(col, val) { rows = rows.filter(r => r[col] === val); return api; },
      in(col, vals) { rows = rows.filter(r => vals.includes(r[col])); return api; },
      order(col, opts) {
        const dir = opts && opts.ascending === false ? -1 : 1;
        rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * dir);
        return api;
      },
      limit(n) { rows = rows.slice(0, n); return api; },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      single() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      insert(payload) {
        const list = Array.isArray(payload) ? payload : [payload];
        list.forEach(row => {
          const full = Object.assign({
            id: 'd' + Math.random().toString(36).slice(2, 8),
            created_at: new Date().toISOString(), likes_count: 0,
            is_pinned: false, is_staff: false, parent_id: null, author_id: null
          }, row);
          (TABLES[table] = TABLES[table] || []).push(full);
          if (table === 'comments') comments.push(full);
        });
        return Promise.resolve({ data: list, error: null });
      },
      update() { return Promise.resolve({ data: null, error: null }); },
      delete() { return Promise.resolve({ data: null, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); }
    };
    return api;
  }

  function createClient() {
    return {
      from: query,
      rpc(fn, args) {
        if (fn === 'my_reactions') return Promise.resolve({ data: [], error: null });
        if (fn === 'toggle_comment_reaction') {
          const c = comments.find(x => x.id === (args && args.p_comment_id));
          if (!c) return Promise.resolve({ data: null, error: { message: 'Комментарий не найден' } });
          // Отметка живёт только в памяти страницы — этого достаточно, чтобы
          // увидеть, как работает кнопка.
          const on = !c._liked;
          c._liked = on;
          c.likes_count = Math.max(0, (c.likes_count || 0) + (on ? 1 : -1));
          return Promise.resolve({ data: [{ liked: on, likes: c.likes_count }], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      storage: {
        from() {
          return { getPublicUrl: p => ({ data: { publicUrl: p } }), upload: () => Promise.resolve({ error: null }) };
        }
      },
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: 'demo-user', email: 'demo@example.org' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'В демо-режиме вход отключён' } }),
        signUp: () => Promise.resolve({ data: null, error: { message: 'В демо-режиме регистрация отключена' } }),
        signOut: () => Promise.resolve({ error: null })
      }
    };
  }

  window.DemoData = {
    createClient, data: TABLES,
    teamName: name,
    // профиль «гостя» демо-режима: видно, что базы нет, но интерфейс живой
    profile
  };
})();
