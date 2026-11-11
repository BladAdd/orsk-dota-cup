/* Спонсоры: генеральный спонсор крупно, партнёры ниже. */
(async function () {
  const { $, el } = window.UI;
  await window.Chrome.init();
  const host = $('#sponsors-host');
  if (!window.DB.ready) { host.append(el('div', { class: 'empty-state' }, [
    el('div', { class: 'big', text: 'КПРФ · Орск' }),
    el('p', { text: 'Генеральный спонсор турнира — Орское городское отделение КПРФ.' })])); return; }

  const { data } = await window.DB.sb.from('sponsors').select('*').order('sort_order', { ascending: true });
  const list = data || [];
  if (!list.length) { host.append(el('div', { class: 'empty-state' }, [el('div', { class: 'big', text: 'Спонсоров пока нет' })])); return; }

  const title = list.filter(s => s.tier === 'title');
  const others = list.filter(s => s.tier !== 'title');

  title.forEach(s => host.append(el('div', { class: 'panel', style: 'display:flex;gap:24px;align-items:center;flex-wrap:wrap' }, [
    s.logo_url ? el('img', { src: s.logo_url, alt: s.name, style: 'height:84px;width:auto' }) : null,
    el('div', { style: 'flex:1;min-width:240px' }, [
      el('div', { class: 'badge gold', text: 'генеральный спонсор', style: 'margin-bottom:10px' }),
      el('h3', { text: s.name }),
      el('p', { class: 'muted', style: 'margin:0', text: s.description })
    ].filter(Boolean))
  ].filter(Boolean))));

  if (others.length) {
    host.append(el('h3', { text: 'Партнёры', style: 'margin:30px 0 14px' }));
    const grid = el('div', { class: 'grid grid-3' });
    others.forEach(s => grid.append(el('div', { class: 'panel' }, [
      s.logo_url ? el('img', { src: s.logo_url, alt: s.name, style: 'height:48px;width:auto;margin-bottom:12px' }) : null,
      el('h4', { text: s.name }),
      el('p', { class: 'muted', style: 'font-size:13px;margin:0', text: s.description })
    ].filter(Boolean))));
    host.append(grid);
  }

  $('#become-sponsor').append(
    el('h3', { text: 'Стать партнёром турнира' }),
    el('p', { class: 'muted', style: 'font-size:14px;margin:0',
      text: 'Оргкомитет открыт к местному бизнесу и организациям: логотип на сайте и площадке, упоминание в анонсах и на награждении. Напишите оргкомитету через контакты в подвале сайта.' })
  );
})();
