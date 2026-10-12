(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var I18N = window.I18N || {};

  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300); }, 2200);
  }
  window.toast = toast;

  var input = $('#nav-search');
  var box = $('#search-suggest');
  if (input && box) {
    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { box.classList.remove('open'); box.innerHTML = ''; return; }
      timer = setTimeout(function () {
        fetch('/api/games?limit=6&q=' + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j.games.length) {
              box.innerHTML = '<div class="suggest-empty">-</div>';
            } else {
              box.innerHTML = j.games.map(function (g) {
                return '<a href="/game/' + g.slug + '"><img src="' + g.thumb + '" alt=""><span>' + g.title + '</span></a>';
              }).join('');
            }
            box.classList.add('open');
          })
          .catch(function () {});
      }, 200);
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.searchbox')) box.classList.remove('open');
    });
  }

  function toggleBtn(btn, id, kind) {
    fetch('/api/' + kind + '/' + id, { method: 'POST', headers: { 'x-csrf-token': window.CSRF || '' } })
      .then(function (r) {
        if (r.status === 401) { window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname); return null; }
        return r.json();
      })
      .then(function (j) {
        if (!j) return;
        if (kind === 'like') {
          btn.classList.toggle('on', !!j.liked);
          var n = btn.querySelector('.n');
          if (n) n.textContent = j.likes;
          var cnt = $('#like-count');
          if (cnt) cnt.textContent = j.likes;
        } else {
          btn.classList.toggle('on', !!j.favorited);
        }
      })
      .catch(function () { toast('Network error'); });
  }
  $$('[data-like]').forEach(function (btn) {
    btn.addEventListener('click', function () { toggleBtn(btn, btn.getAttribute('data-like'), 'like'); });
  });
  $$('[data-fav]').forEach(function (btn) {
    btn.addEventListener('click', function () { toggleBtn(btn, btn.getAttribute('data-fav'), 'favorite'); });
  });

  $$('[data-fs]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = $(btn.getAttribute('data-fs'));
      if (!el) return;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen();
    });
  });

  $$('[data-share]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = window.location.href;
      function done() { toast(I18N.copied || 'Copied!'); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else done();
    });
  });

  $$('[data-check-all]').forEach(function (master) {
    master.addEventListener('change', function () {
      var form = master.closest('form');
      if (!form) return;
      $$('input[name="sel"]', form).forEach(function (cb) { if (!cb.disabled) cb.checked = master.checked; });
    });
  });
  // password visibility toggle
  $$('.btn-toggle-pw').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wrap = btn.closest('.input-wrap');
      if (!wrap) return;
      var inp = wrap.querySelector('input');
      if (!inp) return;
      var isPw = inp.type === 'password';
      inp.type = isPw ? 'text' : 'password';
      var eye = btn.querySelector('.ic-eye');
      var eyeOff = btn.querySelector('.ic-eye-off');
      if (eye && eyeOff) {
        eye.style.display = isPw ? 'none' : 'block';
        eyeOff.style.display = isPw ? 'block' : 'none';
      }
    });
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.matches && f.matches('[data-confirm-form]') && !f.getAttribute('data-confirmed')) {
      if (!window.confirm(I18N.confirmDelete || 'Are you sure?')) { e.preventDefault(); }
      else { f.setAttribute('data-confirmed', '1'); }
    }
  });
  $$('[data-confirm]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (!window.confirm(I18N.confirmDelete || 'Are you sure?')) { e.preventDefault(); e.stopPropagation(); }
    });
  });
})();
