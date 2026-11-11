/* Страница одной новости + обсуждение под ней. */
(async function () {
  const { $, el, esc, fmtDate } = window.UI;
  await window.Chrome.init();
  const host = $('#article-host');
  const slug = new URLSearchParams(location.search).get('slug');
  if (!window.DB.ready || !slug) { host.append(el('div', { class: 'empty-state' }, [
    el('div', { class: 'big', text: 'Новость не найдена' })])); return; }

  const { data } = await window.DB.sb.from('v_news_public').select('*').eq('slug', slug).maybeSingle();
  if (!data) { host.append(el('div', { class: 'empty-state' }, [
    el('div', { class: 'big', text: 'Новость не найдена' }),
    el('p', {}, [el('a', { href: 'news.html', text: 'Ко всем новостям' })])])); return; }

  document.title = data.title + ' — Кубок Орска по Dota 2';

  host.append(
    el('div', { class: 'eyebrow', text: data.tag }),
    el('h1', { text: data.title }),
    el('p', { class: 'muted', style: 'font-size:13px',
      text: fmtDate(data.published_at) + (data.author_nickname ? ' · ' + data.author_nickname : ' · оргкомитет') }),
    data.cover_url ? el('img', { src: data.cover_url, alt: '', style: 'border-radius:6px;margin:18px 0' }) : document.createTextNode('')
  );

  // Текст новости: абзацы через пустую строку
  data.body.split(/\n{2,}/).forEach(par => {
    const p = par.trim();
    if (!p) return;
    host.append(el('p', { text: p, style: 'font-size:16px;line-height:1.75' }));
  });

  window.Comments.mount($('#comments-host'), 'news:' + data.slug);
})();
