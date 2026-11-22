/* Публичная сетка: читает матчи и команды, рисует дерево, обновляется по таймеру. */
(async function () {
  const { $, el } = window.UI;
  await window.Chrome.init();
  const host = $('#bracket-host');
  if (!window.DB.ready) { host.append(el('div', { class: 'empty-state' }, [
    el('div', { class: 'big', text: 'Сетка появится после подключения базы' })])); return; }

  async function draw() {
    const { data: tour } = await window.DB.sb.from('tournaments')
      .select('id').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!tour) { host.innerHTML = ''; host.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'big', text: 'Турнир ещё не создан' })])); return; }

    let data;
    try {
      data = await window.Bracket.load(window.DB.sb, tour.id);
    } catch (e) {
      // Показываем понятную причину вместо пустой страницы: чаще всего это
      // неприменённая миграция представления v_matches_public.
      host.innerHTML = '';
      host.append(el('div', { class: 'empty-state' }, [
        el('div', { class: 'big', text: 'Не удалось загрузить сетку' }),
        el('p', { text: 'Техническая ошибка чтения матчей. Обновите страницу позже.' })
      ]));
      return;
    }
    const { matches, teams } = data;
    host.innerHTML = '';
    if (!matches.length) { host.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'big', text: 'Сетка ещё не сгенерирована' }),
      el('p', { text: 'Оргкомитет построит сетку после закрытия регистрации.' })])); return; }

    // Сохраняем горизонтальную прокрутку: автообновление раз в 30 секунд
    // иначе возвращало длинную сетку к левому краю.
    const prev = $('.bracket-wrap', host);
    const scrollLeft = prev ? prev.scrollLeft : 0;
    host.append(window.Bracket.render(matches, teams));
    const wrap = $('.bracket-wrap', host);
    if (wrap) wrap.scrollLeft = scrollLeft;
  }

  await draw();
  setInterval(draw, 30000); // результаты подтягиваются без перезагрузки страницы
  window.Comments.mount($('#comments-host'), 'bracket');
})();
