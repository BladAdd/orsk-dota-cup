/* Лента новостей оргкомитета. */
(async function () {
  const { $, el, fmtDate } = window.UI;
  await window.Chrome.init();
  const host = $('#news-host');
  if (!window.DB.ready) { host.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
    el('div', { class: 'big', text: 'Новости появятся после подключения базы' })])); return; }

  const { data } = await window.DB.sb.from('v_news_public').select('*')
    .order('published_at', { ascending: false });
  const list = data || [];
  if (!list.length) {
    host.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
      el('div', { class: 'big', text: 'Новостей пока нет' })]));
    return;
  }
  list.forEach(n => host.append(el('a', { class: 'news-card', href: 'news-item.html?slug=' + encodeURIComponent(n.slug) }, [
    el('div', { class: 'cover' }, [
      el('img', { src: n.cover_url || 'assets/img/heroes/crystal_maiden.png', alt: '' }),
      el('span', { class: 'badge gold tag', text: n.tag })
    ]),
    el('div', { class: 'body' }, [
      el('h3', { text: n.title }),
      el('p', { class: 'excerpt', text: n.excerpt }),
      el('div', { class: 'date', text: fmtDate(n.published_at) + (n.author_nickname ? ' · ' + n.author_nickname : '') })
    ])
  ])));
})();
