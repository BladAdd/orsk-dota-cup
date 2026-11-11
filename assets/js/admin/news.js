/* Админка новостей: список, редактор, публикация, обложка. */
(async function () {
  const { el, toast, confirmBox, fmtFull } = window.UI;
  const ok = await window.AdminShell.init('Новости');
  if (!ok) return;
  const main = window.AdminShell.main();
  const sb = window.DB.sb;

  main.append(el('div', { class: 'toolbar' }, [
    el('span', { class: 'grow' }),
    el('button', { class: 'btn btn-primary btn-sm', text: '+ Новая новость', onclick: () => editor(null) })
  ]));
  const list = el('div', { id: 'news-list' });
  main.append(list);

  function slugify(s) {
    const map = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
    return s.toLowerCase().split('').map(ch => map[ch] !== undefined ? map[ch] : ch)
      .join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  async function load() {
    list.innerHTML = '';
    const { data } = await sb.from('news').select('*').order('created_at', { ascending: false });
    if (!(data || []).length) { list.append(el('div', { class: 'empty-state' }, [el('div', { class: 'big', text: 'Новостей нет' })])); return; }
    const table = el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Заголовок' }), el('th', { text: 'Тег' }), el('th', { text: 'Опубликовано' }), el('th', { text: '' })
      ])]),
      el('tbody', {}, (data || []).map(n => el('tr', {}, [
        el('td', {}, [el('strong', { text: n.title }), el('div', { class: 'faint mono', style: 'font-size:11px', text: '/' + n.slug })]),
        el('td', {}, [el('span', { class: 'badge', text: n.tag })]),
        el('td', {}, n.is_published
          ? [el('span', { class: 'badge green', text: fmtFull(n.published_at) })]
          : [el('span', { class: 'badge gold', text: 'черновик' })]),
        el('td', { class: 'right nowrap' }, [
          el('button', { class: 'btn btn-ghost btn-sm', text: 'Изменить', onclick: () => editor(n) }),
          ' ',
          el('button', { class: 'btn btn-danger btn-sm', text: 'Удалить', onclick: async () => {
            const yes = await confirmBox('Удалить новость?', '«' + n.title + '» будет удалена безвозвратно.');
            if (!yes) return;
            const { error } = await sb.from('news').delete().eq('id', n.id);
            if (error) toast('Ошибка: ' + error.message, 'error'); else { toast('Удалено', 'ok'); load(); }
          } })
        ])
      ])))
    ]);
    list.append(table);
  }

  function editor(n) {
    const title = el('input', { type: 'text', value: n ? n.title : '' });
    const slug = el('input', { type: 'text', value: n ? n.slug : '' });
    const tag = el('input', { type: 'text', value: n ? n.tag : 'анонс' });
    const excerpt = el('textarea', { text: n ? n.excerpt : '', style: 'min-height:70px' });
    const body = el('textarea', { text: n ? n.body : '', style: 'min-height:260px' });
    const cover = el('input', { type: 'file', accept: 'image/*' });
    const published = el('input', { type: 'checkbox' }); published.checked = n ? n.is_published : false;

    title.addEventListener('input', () => { if (!n) slug.value = slugify(title.value); });

    const modalBody = el('div', {}, [
      el('div', { class: 'field' }, [el('label', { text: 'Заголовок' }), title]),
      el('div', { class: 'field' }, [el('label', { text: 'Slug (адрес)' }), slug]),
      el('div', { class: 'field' }, [el('label', { text: 'Тег' }), tag]),
      el('div', { class: 'field' }, [el('label', { text: 'Кратко (для ленты)' }), excerpt]),
      el('div', { class: 'field' }, [el('label', { text: 'Текст (абзацы через пустую строку)' }), body]),
      el('div', { class: 'field' }, [el('label', { text: 'Обложка' }), cover]),
      el('label', { style: 'display:flex;gap:10px;align-items:center', }, [published, el('span', { text: 'Опубликовать сразу' })])
    ]);

    const save = el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить' });
    const cancel = el('button', { class: 'btn btn-ghost btn-sm', text: 'Отмена' });
    const modal = window.UI.modal(n ? 'Редактирование' : 'Новая новость', modalBody, [cancel, save]);
    cancel.onclick = () => modal.close();

    save.onclick = async () => {
      if (!title.value.trim() || !body.value.trim()) { toast('Заголовок и текст обязательны', 'error'); return; }
      let coverUrl = n ? n.cover_url : null;
      if (cover.files[0]) {
        const path = Date.now() + '-' + cover.files[0].name.replace(/[^\w.\-]/g, '_');
        const { error } = await sb.storage.from('news-covers').upload(path, cover.files[0], { upsert: true });
        if (error) { toast('Обложка не загрузилась: ' + error.message, 'error'); return; }
        coverUrl = sb.storage.from('news-covers').getPublicUrl(path).data.publicUrl;
      }
      const payload = {
        title: title.value.trim(), slug: slug.value.trim() || slugify(title.value),
        tag: tag.value.trim() || 'анонс', excerpt: excerpt.value.trim(), body: body.value,
        cover_url: coverUrl, is_published: published.checked,
        published_at: published.checked ? (n && n.published_at ? n.published_at : new Date().toISOString()) : null,
        author_id: window.Auth.user.id
      };
      const q = n ? sb.from('news').update(payload).eq('id', n.id) : sb.from('news').insert(payload);
      const { error } = await q;
      if (error) { toast('Ошибка: ' + error.message, 'error'); return; }
      toast('Сохранено', 'ok'); modal.close(); load();
    };
  }

  load();
})();
