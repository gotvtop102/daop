(function () {
  function $(id) { return document.getElementById(id); }

  var emailEl = $('user-email');
  var btnLogout = $('btn-user-logout');
  var newPassEl = $('new-password');
  var btnChangePass = $('btn-change-password');
  var passStatusEl = $('password-status');

  var favGrid = $('favorites-grid');
  var favEmpty = $('favorites-empty');
  var histList = $('history-list');
  var histEmpty = $('history-empty');

  function setPassStatus(msg, isError) {
    if (!passStatusEl) return;
    passStatusEl.textContent = msg || '';
    passStatusEl.style.color = isError ? '#f85149' : '#8b949e';
  }

  function getCreateClient() {
    if (typeof createClient !== 'undefined') return createClient;
    if (window.supabase && typeof window.supabase.createClient === 'function') return window.supabase.createClient;
    return null;
  }

  function loadSupabaseJs() {
    if (getCreateClient()) return Promise.resolve();
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = function () { resolve(); };
      s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    });
  }

  function loadSettings() {
    if (window.DAOP && window.DAOP.siteSettings) return Promise.resolve(window.DAOP.siteSettings);
    if (window.DAOP && typeof window.DAOP.ensureSiteSettingsLoaded === 'function') {
      return window.DAOP.ensureSiteSettingsLoaded().then(function (s) {
        window.DAOP = window.DAOP || {};
        window.DAOP.siteSettings = s || {};
        if (window.DAOP.applySiteSettings) window.DAOP.applySiteSettings(window.DAOP.siteSettings);
        return window.DAOP.siteSettings;
      });
    }
    if (window.DAOP && window.DAOP.loadConfig) {
      return window.DAOP.loadConfig('site-settings').then(function (s) {
        window.DAOP = window.DAOP || {};
        window.DAOP.siteSettings = s || {};
        if (window.DAOP.applySiteSettings) window.DAOP.applySiteSettings(window.DAOP.siteSettings);
        return window.DAOP.siteSettings;
      });
    }
    return fetch('/data/config/site-settings.json')
      .then(function (r) { return r.json(); })
      .catch(function () { return {}; })
      .then(function (s) {
        window.DAOP = window.DAOP || {};
        window.DAOP.siteSettings = s || {};
        if (window.DAOP.applySiteSettings) window.DAOP.applySiteSettings(window.DAOP.siteSettings);
        return window.DAOP.siteSettings;
      });
  }

  function initClient() {
    return Promise.all([loadSettings(), loadSupabaseJs()]).then(function (arr) {
      var s = arr[0] || {};
      window.DAOP = window.DAOP || {};
      if (!window.DAOP.supabaseUserUrl) window.DAOP.supabaseUserUrl = s.supabase_user_url || '';
      if (!window.DAOP.supabaseUserAnonKey) window.DAOP.supabaseUserAnonKey = s.supabase_user_anon_key || '';

      var url = window.DAOP.supabaseUserUrl;
      var key = window.DAOP.supabaseUserAnonKey;
      var cc = getCreateClient();
      if (!url || !key || !cc) return null;
      if (!window.DAOP._supabaseUser) window.DAOP._supabaseUser = cc(url, key);
      return window.DAOP._supabaseUser;
    });
  }

  function safeText(s) {
    return String(s || '').replace(/</g, '&lt;');
  }

  function renderFavorites() {
    if (!favGrid) return;
    favGrid.innerHTML = '';
    var us = window.DAOP && window.DAOP.userSync;
    if (!us) return;

    var base = (window.DAOP && window.DAOP.basePath) || '';
    var slugs = Array.from(us.getFavorites ? us.getFavorites() : []);

    if (!slugs.length) {
      if (favEmpty) favEmpty.style.display = '';
      return;
    }
    if (favEmpty) favEmpty.style.display = 'none';

    var getLight = (window.DAOP && typeof window.DAOP.getMovieBySlugAsync === 'function')
      ? window.DAOP.getMovieBySlugAsync
      : function (s) { return Promise.resolve(window.DAOP && window.DAOP.getMovieBySlug ? window.DAOP.getMovieBySlug(s) : null); };
    var render = window.DAOP && window.DAOP.renderMovieCard;
    if (!render) return;

    favGrid.innerHTML = '<p>Đang tải...</p>';
    Promise.all(slugs.map(function (slug) { return getLight(slug); }))
      .then(function (movies) {
        var list = (movies || []).filter(Boolean);
        favGrid.innerHTML = '';
        list.forEach(function (m) {
          favGrid.insertAdjacentHTML('beforeend', render(m, base, {}));
        });
      })
      .catch(function () {
        favGrid.innerHTML = '<p>Không thể tải dữ liệu phim.</p>';
      });
  }

  function renderHistory() {
    if (!histList) return;
    histList.innerHTML = '';
    var us = window.DAOP && window.DAOP.userSync;
    if (!us) return;

    var base = (window.DAOP && window.DAOP.basePath) || '';
    var list = (us.getWatchHistory ? us.getWatchHistory() : []).slice();

    list.sort(function (a, b) {
      var ta = Date.parse(a && a.lastWatched || '') || 0;
      var tb = Date.parse(b && b.lastWatched || '') || 0;
      return tb - ta;
    });

    if (!list.length) {
      if (histEmpty) histEmpty.style.display = '';
      return;
    }
    if (histEmpty) histEmpty.style.display = 'none';

    var getLight = (window.DAOP && typeof window.DAOP.getMovieBySlugAsync === 'function')
      ? window.DAOP.getMovieBySlugAsync
      : function (s) { return Promise.resolve(window.DAOP && window.DAOP.getMovieBySlug ? window.DAOP.getMovieBySlug(s) : null); };
    histList.innerHTML = '<p>Đang tải...</p>';
    Promise.all(list.map(function (h) {
      if (!h || !h.slug) return Promise.resolve({ h: h, m: null });
      return getLight(h.slug).then(function (m) { return { h: h, m: m }; });
    }))
      .then(function (rows) {
        histList.innerHTML = '';
        (rows || []).forEach(function (row) {
          var h = row && row.h;
          var m = row && row.m;
          if (!h || !h.slug || !m) return;

          var title = safeText(m.title || m.name || h.slug);
          var ep = safeText(h.episode || '');
          var href = base + '/phim/' + (m.slug || m.id || h.slug) + '.html';
          var last = h.lastWatched ? safeText(h.lastWatched) : '';

          var html = '' +
            '<div class="user-history-item">' +
            '  <div class="user-history-main">' +
            '    <a class="user-history-title" href="' + href + '">' + title + '</a>' +
            '    <div class="user-history-meta">Tập: <strong>' + ep + '</strong>' + (last ? ' • ' + last : '') + '</div>' +
            '  </div>' +
            '  <div class="user-history-actions">' +
            '    <button type="button" class="login-btn login-btn--primary btn-continue" data-slug="' + safeText(h.slug) + '" data-episode="' + ep + '">Xem tiếp</button>' +
            '  </div>' +
            '</div>';

          histList.insertAdjacentHTML('beforeend', html);
        });
      })
      .catch(function () {
        histList.innerHTML = '<p>Không thể tải dữ liệu phim.</p>';
      });

    histList.querySelectorAll('.btn-continue').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slug = btn.getAttribute('data-slug');
        var ep = btn.getAttribute('data-episode');
        if (window.DAOP && window.DAOP.openPlayer) {
          window.DAOP.openPlayer({ slug: slug, episode: ep, link: '', movie: { slug: slug } });
        } else {
          window.location.href = '/phim/' + encodeURIComponent(slug) + '.html';
        }
      });
    });
  }

  function init() {
    initClient().then(function (client) {
      if (!client) {
        window.location.href = '/login.html';
        return;
      }

      client.auth.getSession().then(function (res) {
        var user = res && res.data && res.data.session && res.data.session.user;
        if (!user) {
          window.location.href = '/login.html';
          return;
        }
        if (emailEl) emailEl.textContent = 'Email: ' + (user.email || user.id);

        if (btnLogout) {
          btnLogout.addEventListener('click', function () {
            client.auth.signOut().then(function () {
              window.location.href = '/login.html';
            });
          });
        }

        if (btnChangePass) {
          btnChangePass.addEventListener('click', function () {
            var p = (newPassEl && newPassEl.value) || '';
            if (!p || p.length < 6) {
              setPassStatus('Mật khẩu tối thiểu 6 ký tự.', true);
              return;
            }
            setPassStatus('Đang cập nhật...');
            client.auth.updateUser({ password: p }).then(function (r) {
              if (r && r.error) {
                setPassStatus(r.error.message || 'Cập nhật thất bại', true);
                return;
              }
              setPassStatus('Đã cập nhật mật khẩu.');
              if (newPassEl) newPassEl.value = '';
            });
          });
        }

        var us = window.DAOP && window.DAOP.userSync;
        if (us && typeof us.sync === 'function') {
          us.sync().then(function () {
            renderFavorites();
            renderHistory();
          });
        } else {
          renderFavorites();
          renderHistory();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
