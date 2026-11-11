/* Призовой фонд: распределение по местам из настроек. */
(async function () {
  const { $, el, fmtMoney } = window.UI;
  await window.Chrome.init();
  const host = $('#prize-host');
  if (!window.DB.ready) { host.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
    el('div', { class: 'big', text: '15 000 ₽' }), el('p', { text: '9 000 / 4 000 / 2 000 за первое, второе и третье место' })])); return; }

  const [{ data: prize }, { data: sponsors }] = await Promise.all([
    window.DB.sb.from('settings').select('value').eq('key', 'prize').maybeSingle(),
    window.DB.sb.from('sponsors').select('*').eq('tier', 'title').limit(1)
  ]);

  const split = (prize && prize.value && prize.value.split) || [
    { place: 1, amount: 9000 }, { place: 2, amount: 4000 }, { place: 3, amount: 2000 }
  ];
  const medals = ['I', 'II', 'III'];
  const titles = ['Первое место', 'Второе место', 'Третье место'];

  split.forEach((s, i) => {
    host.append(el('div', { class: 'panel center', style: i === 0 ? 'border-color:#6b5220' : '' }, [
      el('div', { style: 'font-family:var(--font-display);font-size:26px;color:var(--red);letter-spacing:.1em', text: medals[i] || '' }),
      el('div', { style: 'font-family:var(--font-display);font-size:30px;color:var(--gold);margin:8px 0', text: fmtMoney(s.amount) }),
      el('div', { class: 'muted', text: titles[i] || (s.place + ' место') })
    ]));
  });

  const sponsor = sponsors && sponsors[0];
  $('#prize-note').append(
    el('h3', { text: 'Кто платит и как получить' }),
    el('p', { class: 'muted', style: 'font-size:14px',
      text: 'Призовой фонд сформирован ' + (sponsor ? sponsor.name.replace(' · ', ' ') : 'Орским городским отделением КПРФ') +
        '. Команда-призёр подтверждает состав на награждении; при неявке капитана сумма передаётся через представителя команды или переводом на карту в течение трёх дней после финала.' }),
    el('p', { class: 'muted', style: 'font-size:14px;margin:0',
      text: 'Помимо денег, призёры получают кубки и медали турнира, а MVP финала — отдельный памятный приз от оргкомитета.' })
  );
})();
