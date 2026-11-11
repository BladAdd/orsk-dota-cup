/* Вход: проверка полей, редирект по роли или ?next=. */
(async function () {
  const { $, setStatus, toast } = window.UI;
  await window.Chrome.init();
  if (!window.DB.ready) return;

  const form = $('#login-form');
  const next = new URLSearchParams(location.search).get('next');

  if (window.Auth.user) { redirect(); }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#email').value.trim();
    const password = $('#password').value;
    let bad = false;
    setStatus($('#email'), /.+@.+\..+/.test(email) ? '' : (bad = true, 'Введите корректный e-mail'));
    setStatus($('#password'), password.length >= 6 ? '' : (bad = true, 'Минимум 6 символов'));
    if (bad) return;

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await window.Auth.login(email, password);
      toast('Вы вошли', 'ok');
      redirect();
    } catch (err) {
      toast('Не удалось войти: ' + (err.message || err), 'error');
      btn.disabled = false;
    }
  });

  function redirect() {
    if (next) { location.href = next; return; }
    location.href = window.Auth.isAdmin ? 'admin/index.html' : 'index.html';
  }
})();
