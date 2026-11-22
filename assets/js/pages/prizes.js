/* Призовой фонд: забирает победитель, приз получает капитан команды.
 *
 * Схема одна: весь фонд — за первое место, второго и третьего приза нет.
 * Разбивка всё равно читается из настроек (settings.prize), поэтому если
 * оргкомитет когда-нибудь вернёт призы за второе-третье, страница подстроится
 * сама: строки с нулевой суммой просто не показываются.
 */
(async function () {
  const { $, el, fmtMoney } = window.UI;
  await window.Chrome.init();
  const host = $('#prize-host');
  if (!window.DB.ready) { host.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
    el('div', { class: 'big', text: '15 000 ₽' }), el('p', { text: 'Весь фонд забирает команда-победитель' })])); return; }

  const [{ data: prize }, { data: sponsors }] = await Promise.all([
    window.DB.sb.from('settings').select('value').eq('key', 'prize').maybeSingle(),
    window.DB.sb.from('sponsors').select('*').eq('tier', 'title').limit(1)
  ]);

  const split = ((prize && prize.value && prize.value.split) || [
    { place: 1, amount: 15000 }
  ]).filter(s => s && +s.amount > 0);
  const medals = ['I', 'II', 'III'];
  const titles = ['Первое место', 'Второе место', 'Третье место'];

  // Ноль в сумме места — это не «0 ₽ за второе место», а отсутствие приза:
  // такие строки не показываем.
  split.forEach((s, i) => {
    const place = +s.place || i + 1;
    host.append(el('div', { class: 'panel center', style: place === 1 ? 'border-color:#6b5220' : '' }, [
      el('div', { style: 'font-family:var(--font-display);font-size:26px;color:var(--red);letter-spacing:.1em', text: medals[place - 1] || '' }),
      el('div', { style: 'font-family:var(--font-display);font-size:30px;color:var(--gold);margin:8px 0', text: fmtMoney(s.amount) }),
      el('div', { class: 'muted', text: titles[place - 1] || (place + ' место') })
    ]));
  });

  const sponsor = sponsors && sponsors[0];
  $('#prize-note').append(
    el('h3', { text: 'Кто платит и как получить' }),
    el('p', { class: 'muted', style: 'font-size:14px',
      text: 'Призовой фонд сформирован ' + (sponsor ? sponsor.name.replace(' · ', ' ') : 'Орским городским отделением КПРФ') +
        '. Весь фонд забирает команда-победитель: приз получает её капитан на награждении после финала, при неявке — переводом на карту капитана в течение трёх дней.' }),
    el('p', { class: 'muted', style: 'font-size:14px;margin:0',
      text: 'Второго и третьего денежного приза в этом сезоне нет. Кубки и медали получают все команды, дошедшие до полуфиналов, а MVP финала — отдельный памятный приз от оргкомитета.' })
  );
})();
