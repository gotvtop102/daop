(function () {
  function $(id) { return document.getElementById(id); }

  var emailEl = $('user-email');
  var btnLogout = $('btn-dashboard-logout');
  var logoutConfirm = $('logout-confirm');
  var btnLogoutConfirm = $('btn-dashboard-logout-confirm');
  var btnLogoutCancel = $('btn-dashboard-logout-cancel');
  var userMenuList = document.querySelector('.user-menu-list');

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
        if (window.DAOP && window.DAOP.updateAuthNav) window.DAOP.updateAuthNav();

        if (btnLogout && logoutConfirm) {
          btnLogout.addEventListener('click', function (e) {
            if (e && e.preventDefault) e.preventDefault();
            var nextOpen = logoutConfirm.style.display === 'none' || logoutConfirm.style.display === '' ? (logoutConfirm.style.display === 'none') : true;
            // Nếu inline style là 'none' thì mở, còn lại toggle.
            if (logoutConfirm.style.display === 'none') nextOpen = true;
            else nextOpen = false;
            logoutConfirm.style.display = nextOpen ? '' : 'none';
            try {
              if (nextOpen) {
                btnLogout.style.display = 'none';
                if (userMenuList && logoutConfirm.parentNode !== userMenuList) {
                  userMenuList.appendChild(logoutConfirm);
                }
                logoutConfirm.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              } else {
                btnLogout.style.display = '';
              }
            } catch (e2) {}
          });
        }
        if (btnLogoutCancel && logoutConfirm) {
          btnLogoutCancel.addEventListener('click', function () {
            logoutConfirm.style.display = 'none';
            if (btnLogout) btnLogout.style.display = '';
          });
        }
        if (btnLogoutConfirm) {
          btnLogoutConfirm.addEventListener('click', function () {
            client.auth.signOut().then(function () {
              if (window.DAOP && window.DAOP.updateAuthNav) window.DAOP.updateAuthNav();
              window.location.href = '/login.html';
            });
          });
        }

        function closeLogoutConfirm() {
          if (!logoutConfirm) return;
          logoutConfirm.style.display = 'none';
          if (btnLogout) btnLogout.style.display = '';
        }

        document.addEventListener('keydown', function (e) {
          if (e && e.key === 'Escape') closeLogoutConfirm();
        });

        document.addEventListener('click', function (e) {
          if (!logoutConfirm || logoutConfirm.style.display === 'none') return;
          var t = e && e.target;
          if (btnLogout && btnLogout.contains && btnLogout.contains(t)) return;
          if (logoutConfirm.contains && logoutConfirm.contains(t)) return;
          closeLogoutConfirm();
        }, true);
      }).catch(function () {
        window.location.href = '/login.html';
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
