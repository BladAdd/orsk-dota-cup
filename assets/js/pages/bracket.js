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
    const { matches, teams } = await window.Bracket.load(window.DB.sb, tour.id);
    host.innerHTML = '';
    if (!matches.length) { host.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'big', text: 'Сетка ещё не сгенерирована' }),
      el('p', { text: 'Оргкомитет построит сетку после закрытия регистрации.' })])); return; }
    host.append(window.Bracket.render(matches, teams));
  }

  await draw();
  setInterval(draw, 30000); // результаты подтягиваются без перезагрузки страницы
  window.Comments.mount($('#comments-host'), 'bracket');
})();
