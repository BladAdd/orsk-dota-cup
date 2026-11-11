/* Шапка и подвал: рисуются на каждой странице, чтобы не дублировать разметку. */
(function () {
  const { $, el, esc } = window.UI;
  const ROOT = document.documentElement.dataset.root || '';

  const NAV = [
    ['index.html', 'Главная'],
    ['teams.html', 'Команды'],
    ['bracket.html', 'Сетка'],
    ['schedule.html', 'Расписание'],
    ['rules.html', 'Регламент'],
    ['prizes.html', 'Призовые'],
    ['news.html', 'Новости']
  ];

  const EMBLEM = `
    <svg class="mark" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 2 L44 9 V25 C44 36 35 43 24 46 C13 43 4 36 4 25 V9 Z"
            fill="#8d1119" stroke="#d9a441" stroke-width="2"/>
      <path d="M24 6 L40 11.5 V25 C40 33.5 33 39.5 24 42 C15 39.5 8 33.5 8 25 V11.5 Z"
            fill="#d21f2b"/>
      <path d="M24 12 l3.1 6.6 7.2 .9 -5.3 5 1.4 7.1 -6.4 -3.5 -6.4 3.5 1.4 -7.1 -5.3 -5 7.2 -.9 Z"
            fill="#d9a441"/>
      <rect x="14" y="34" width="20" height="2.4" fill="#d9a441"/>
    </svg>`;

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
    const burger = el('button', { class: 'burger', 'aria-label': 'Меню', text: '☰',
      onclick: () => nav.classList.toggle('open') });

    const brand = el('a', { class: 'brand', href: ROOT + 'index.html', html: EMBLEM });
    const nameBox = el('span', { class: 'name' });
    nameBox.append(document.createTextNode(settings?.site?.short_title || 'Кубок Орска'));
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
          el('h4', { text: 'Кубок Орска по Dota 2' }),
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
            ? social.map(([k, href, label]) => el('a', { href, target: k === 'mail' ? '' : '_blank', rel: 'noopener', text: label }))
            : [el('span', { class: 'faint', text: 'Контакты появятся после открытия регистрации' })]),
          el('a', { href: ROOT + 'privacy.html', text: 'Обработка персональных данных' })
        ])
      ]),
      el('div', { class: 'legal' }, [
        el('span', { class: 'age-mark', text: window.SITE_CONFIG.ageRating }),
        el('span', { text: '© ' + year + ' Оргкомитет Кубка Орска по Dota 2' }),
        el('span', { text: 'Dota 2 — товарный знак Valve Corporation. Сайт не аффилирован с Valve и не спонсируется ею.' }),
        el('span', { class: 'mono faint', text: window.SITE_CONFIG.timezoneLabel })
      ])
    ]));
  }

  window.Chrome = {
    get settings() { return settings; },
    async init() {
      settings = await loadSettings();
      renderHeader();
      renderFooter();
      // плашку о неподключённой базе показываем только оргкомитету, не посетителям
      if (!window.DB.ready && /\/admin(\/|$)/.test(location.pathname)) window.DB.setupBanner();
    }
  };
})();
