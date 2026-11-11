/* Живые комментарии с премодерацией: дерево, лайки, ответы, жалобы. */
(function () {
  const { $, el, esc, fmtFull, toast, voterKey } = window.UI;

  async function mount(host, pageKey) {
    host.innerHTML = '';
    if (!window.DB.ready) {
      host.append(el('div', { class: 'empty-state' }, [
        el('div', { class: 'big', text: 'Комментарии скоро откроются' }),
        el('p', { text: 'Обсуждение появится после подключения базы данных турнира.' })
      ]));
      return;
    }

    const sb = window.DB.sb;
    const [{ data: rows }, { data: myReactions }] = await Promise.all([
      sb.from('v_comments_public').select('*').eq('page_key', pageKey).order('created_at', { ascending: true }),
      sb.from('comment_reactions').select('comment_id').eq('voter_key', window.Auth.user ? window.Auth.user.id : voterKey())
    ]);
    const liked = new Set((myReactions || []).map(r => r.comment_id));
    const all = rows || [];

    host.append(el('h3', { text: 'Обсуждение' }));

    // Форма нового комментария
    if (window.Auth.user && !window.Auth.isBanned) {
      host.append(form(null, pageKey, () => mount(host, pageKey)));
    } else if (!window.Auth.user) {
      host.append(el('p', { class: 'muted', html:
        'Чтобы оставить комментарий, <a href="' + (document.documentElement.dataset.root || '') + 'login.html">войдите</a>. Все сообщения проходят премодерацию оргкомитета.' }));
    } else {
      host.append(el('p', { class: 'muted', text: 'Комментирование для вашей учётной записи временно ограничено.' }));
    }

    const roots = all.filter(c => !c.parent_id);
    const pinned = roots.filter(c => c.is_pinned);
    const rest = roots.filter(c => !c.is_pinned).reverse();

    if (!all.length) {
      host.append(el('div', { class: 'empty-state', style: 'margin-top:18px' }, [
        el('div', { class: 'big', text: 'Пока тихо' }),
        el('p', { text: 'Станьте первым, кто напишет о турнире.' })
      ]));
      return;
    }

    const list = el('div', { class: 'comments', style: 'margin-top:22px' });
    [...pinned, ...rest].forEach(c => list.append(node(c, all, liked, pageKey, () => mount(host, pageKey))));
    host.append(list);
  }

  function form(parentId, pageKey, onDone) {
    const ta = el('textarea', { placeholder: parentId ? 'Ваш ответ…' : 'Ваше сообщение…', maxlength: '2000' });
    const btn = el('button', { class: 'btn btn-primary btn-sm', text: parentId ? 'Ответить' : 'Отправить' });
    const wrap = el('div', { class: 'c-form' }, [
      el('label', { text: parentId ? 'Ответ' : 'Комментарий (появится после проверки оргкомитетом)' }),
      ta,
      el('div', { style: 'margin-top:10px' }, [btn])
    ]);
    btn.onclick = async () => {
      const body = ta.value.trim();
      if (body.length < 2) { toast('Слишком короткое сообщение', 'error'); return; }
      btn.disabled = true;
      const { error } = await window.DB.sb.from('comments').insert({
        page_key: pageKey, parent_id: parentId, author_id: window.Auth.user.id,
        author_name: window.Auth.profile?.nickname || window.Auth.user.email, body
      });
      btn.disabled = false;
      if (error) { toast('Не удалось отправить: ' + error.message, 'error'); return; }
      toast('Отправлено на премодерацию');
      onDone && onDone();
    };
    return wrap;
  }

  function node(c, all, liked, pageKey, reload) {
    const kids = all.filter(x => x.parent_id === c.id);
    const isMine = window.Auth.user && window.Auth.user.id === c.author_id;

    const likeBtn = el('button', { class: liked.has(c.id) ? 'liked' : '', onclick: toggleLike }, [
      document.createTextNode('▲ '), el('span', { text: String(c.likes_count) })
    ]);
    async function toggleLike() {
      const key = window.Auth.user ? window.Auth.user.id : voterKey();
      if (liked.has(c.id)) {
        await window.DB.sb.from('comment_reactions').delete().eq('comment_id', c.id).eq('voter_key', key);
      } else {
        const { error } = await window.DB.sb.from('comment_reactions').insert({ comment_id: c.id, voter_key: key });
        if (error) { toast('Не удалось поставить отметку', 'error'); return; }
      }
      reload();
    }

    const actions = [likeBtn];
    if (window.Auth.user && !window.Auth.isBanned) {
      actions.push(el('button', { text: 'Ответить', onclick: () => {
        const existing = box.querySelector(':scope > .c-form');
        if (existing) { existing.remove(); return; }
        box.append(form(c.id, pageKey, reload));
      } }));
    }
    actions.push(el('button', { text: 'Пожаловаться', onclick: async () => {
      const reason = prompt('Причина жалобы (оскорбление, спам, слив личных данных…):');
      if (!reason) return;
      const { error } = await window.DB.sb.from('comment_reports').insert({
        comment_id: c.id, reporter_id: window.Auth.user ? window.Auth.user.id : null, reason
      });
      toast(error ? 'Не удалось: ' + error.message : 'Жалоба отправлена оргкомитету', error ? 'error' : 'ok');
    } }));

    const head = el('div', { class: 'c-head' }, [
      el('span', { class: 'who' + (c.is_staff ? ' staff' : ''), text: c.author_nickname || c.author_name || 'Гость' }),
      c.is_staff ? el('span', { class: 'badge red', text: 'оргкомитет' }) : null,
      c.is_pinned ? el('span', { class: 'badge gold', text: 'закреплено' }) : null,
      el('span', { class: 'when', text: fmtFull(c.created_at) })
    ].filter(Boolean));

    const box = el('div', { class: 'comment' + (c.is_pinned ? ' pinned' : '') }, [
      head,
      el('div', { class: 'c-body', text: c.body }),
      el('div', { class: 'c-actions' }, actions)
    ]);

    if (kids.length) {
      const replies = el('div', { class: 'replies' });
      kids.forEach(k => replies.append(node(k, all, liked, pageKey, reload)));
      box.append(replies);
    }
    return box;
  }

  window.Comments = { mount };
})();
