/* Оболочка админки: боковое меню, защита по роли, счётчики очередей. */
(function () {
  const { $, el } = window.UI;

  const NAV = [
    ['index.html', 'Обзор'],
    ['applications.html', 'Заявки', 'apps'],
    ['bracket.html', 'Сетка'],
    ['matches.html', 'Матчи и результаты'],
    ['news.html', 'Новости'],
    ['comments.html', 'Комментарии', 'comments'],
    ['settings.html', 'Настройки']
  ];

  async function init(title) {
    document.body.classList.add('admin');
    if (!window.DB.ready) {
      document.body.prepend(el('div', { class: 'setup-banner',
        text: 'База не подключена: заполните assets/js/config.js (см. supabase/SETUP.md).' }));
      return false;
    }
    // ждём сессию
    await window.Auth.refresh();
    if (!window.Auth.user) { toLogin(); return false; }
    if (!window.Auth.isAdmin) {
      document.body.append(el('div', { class: 'section container' }, [
        el('div', { class: 'empty-state' }, [
          el('div', { class: 'big', text: 'Недостаточно прав' }),
          el('p', { text: 'Раздел доступен только оргкомитету с ролью администратора.' }),
          el('a', { class: 'btn btn-ghost btn-sm', href: '../index.html', text: 'На сайт' })
        ])
      ]));
      return false;
    }

    renderShell(title);
    loadCounts();
    return true;
  }

  function toLogin() {
    const here = 'admin/' + (location.pathname.split('/').pop() || 'index.html');
    location.href = '../login.html?next=' + encodeURIComponent(here);
  }

  function renderShell(title) {
    const here = location.pathname.split('/').pop() || 'index.html';
    const side = el('aside', { class: 'admin-side' }, [
      el('div', { class: 'side-brand' }, [
        document.createTextNode('Кубок Орска'),
        el('small', { text: 'панель оргкомитета' })
      ])
    ]);
    NAV.forEach(([file, label, counterKey]) => {
      const a = el('a', { href: file, class: here === file ? 'active' : '', text: label });
      if (counterKey) a.dataset.counter = counterKey;
      side.append(a);
    });
    side.append(el('div', { class: 'spacer' }));
    side.append(el('a', { href: '../index.html', text: '← На сайт' }));
    side.append(el('a', { href: '#', text: 'Выйти', onclick: async e => { e.preventDefault(); await window.Auth.logout(); location.href = '../index.html'; } }));

    const top = el('div', { class: 'admin-top' }, [
      el('h1', { text: title }),
      el('div', { class: 'who', text: 'Вы вошли как ' + (window.Auth.profile?.nickname || window.Auth.user.email) + ' · роль: администратор' })
    ]);

    const main = el('main', { class: 'admin-main', id: 'admin-main' }, [top]);
    const shell = el('div', { class: 'admin-shell' }, [side, main]);
    document.body.prepend(shell);
  }

  async function loadCounts() {
    const [apps, comments] = await Promise.all([
      window.DB.sb.from('teams').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      window.DB.sb.from('comments').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    ]);
    setCount('apps', apps.count);
    setCount('comments', comments.count);
  }

  function setCount(key, n) {
    const link = document.querySelector('.admin-side a[data-counter="' + key + '"]');
    if (!link) return;
    link.querySelector('.cnt')?.remove();
    if (n > 0) link.append(el('span', { class: 'cnt', text: String(n) }));
  }

  window.AdminShell = { init, main: () => $('#admin-main'), refreshCounts: loadCounts };
})();
