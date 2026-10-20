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
      var title = document.title;
      if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {});
      } else {
        function done() { toast(I18N.copied || 'Copied!'); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
        else done();
      }
    });
  });

  // Player loader & reload & keyboard shortcuts
  var frame = $("#game-frame");
  var loader = $("#player-loader");
  if (frame && loader) {
    frame.addEventListener("load", function () {
      loader.classList.add("loaded");
    });
    setTimeout(function () { if (loader) loader.classList.add("loaded"); }, 8000);
  }

  $$('[data-reload]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = $(btn.getAttribute("data-reload"));
      if (!target) return;
      if (loader) loader.classList.remove("loaded");
      var src = target.src;
      target.src = "";
      setTimeout(function () { target.src = src; }, 50);
    });
  });

  var pWrap = $(".player-wrap");
  var tBtn = $("#theater-btn");
  function toggleTheater() {
    if (!pWrap) return;
    pWrap.classList.toggle("theater");
    if (tBtn) tBtn.classList.toggle("on", pWrap.classList.contains("theater"));
  }
  if (tBtn) tBtn.addEventListener("click", toggleTheater);

  var pBox = $("#player-box");
  if (pBox) {
    document.addEventListener("keydown", function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement && document.activeElement.isContentEditable)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen();
        else if (pBox.requestFullscreen) pBox.requestFullscreen();
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        toggleTheater();
      }
    });
  }

  var btt = $("#back-to-top");
  if (btt) {
    window.addEventListener("scroll", function () {
      if (window.scrollY > 400) btt.classList.add("show");
      else btt.classList.remove("show");
    }, { passive: true });
    btt.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }


  // selects that submit their form on change (admin listing sort switch)
  $$('[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () { if (el.form) el.form.submit(); });
  });

  // Bulk selection. On the games list the row checkboxes live *outside* the bulk <form> and
  // are tied to it with the HTML5 form="..." attribute, so they must be resolved through the
  // form owner (querying inside the form element finds nothing there).
  function ownerForm(el) {
    var id = el.getAttribute && el.getAttribute('form');
    if (id) {
      var linked = document.getElementById(id);
      if (linked) return linked;
    }
    return el.form || el.closest('form');
  }
  function selectionBoxes(form) {
    return $$('input[name="sel"]').filter(function (cb) { return !form || ownerForm(cb) === form; });
  }
  function updateBulkCount(form) {
    var boxes = selectionBoxes(form);
    var el = $('#bulk-count');
    if (el) el.textContent = String(boxes.filter(function (cb) { return cb.checked; }).length);
    $$('[data-check-all]').forEach(function (master) {
      if (form && ownerForm(master) !== form) return;
      var rows = selectionBoxes(ownerForm(master)).filter(function (cb) { return !cb.disabled; });
      if (!rows.length) return;
      var checked = rows.filter(function (cb) { return cb.checked; }).length;
      master.checked = checked === rows.length;
      master.indeterminate = checked > 0 && checked < rows.length;
    });
  }
  $$('[data-check-all]').forEach(function (master) {
    master.addEventListener('change', function () {
      var form = ownerForm(master);
      selectionBoxes(form).forEach(function (cb) {
        if (!cb.disabled) cb.checked = master.checked;
      });
      updateBulkCount(form);
    });
  });
  $$('input[name="sel"]').forEach(function (cb) {
    cb.addEventListener('change', function () { updateBulkCount(ownerForm(cb)); });
  });
  // counter / master state on load (the import preview starts with every importable row checked)
  $$('[data-check-all]').forEach(function (master) { updateBulkCount(ownerForm(master)); });
  $$('.bulk-actions button').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var form = ownerForm(btn);
      var count = form ? selectionBoxes(form).filter(function (cb) { return cb.checked; }).length : 0;
      if (count === 0) {
        e.preventDefault();
        toast(I18N.bulkNone || 'Select at least one item first.');
      }
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

  // Close open dropdowns when clicking outside
  document.addEventListener('click', function (e) {
    if (!e.target.closest('details.dropdown')) {
      $$('details.dropdown[open]').forEach(function (d) { d.removeAttribute('open'); });
    }
  });

  // Third-party ad scripts can be blocked (mixed content, ad blockers) or simply
  // not fill. Hide slots that stayed empty so the page keeps no gap with just
  // the "Advertisement" label.
  (function () {
    var slots = $$('.ad-slot');
    if (!slots.length) return;
    setTimeout(function () {
      slots.forEach(function (slot) {
        var filled = false;
        Array.prototype.forEach.call(slot.children, function (child) {
          if (child.classList && child.classList.contains('ad-label')) return;
          var cs = window.getComputedStyle(child);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          if (child.getBoundingClientRect().height > 8) filled = true;
        });
        if (!filled) slot.style.display = 'none';
      });
    }, 10000);
  })();
})();
