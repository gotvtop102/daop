(function () {
  function $(id) { return document.getElementById(id); }

  var emailEl = $('profile-email');
  var btnLogout = $('btn-profile-logout');
  var newPassEl = $('profile-new-password');
  var btnChange = $('btn-profile-change-password');
  var statusEl = $('profile-password-status');

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? '#f85149' : '#8b949e';
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

        var fallbackName = (user.user_metadata && user.user_metadata.full_name) || '';
        if (emailEl) emailEl.textContent = 'Tên: ' + (fallbackName || '...') + ' • Email: ' + (user.email || user.id);
        if (window.DAOP && window.DAOP.updateAuthNav) window.DAOP.updateAuthNav();

        client.from('profiles').select('full_name,email').eq('id', user.id).maybeSingle().then(function (r) {
          if (!emailEl) return;
          var name = (r && r.data && r.data.full_name) || fallbackName || '';
          var mail = (r && r.data && r.data.email) || user.email || user.id;
          emailEl.textContent = 'Tên: ' + (name || '-') + ' • Email: ' + (mail || '-');
        }).catch(function () {});

        if (btnLogout) {
          btnLogout.addEventListener('click', function () {
            client.auth.signOut().then(function () {
              if (window.DAOP && window.DAOP.updateAuthNav) window.DAOP.updateAuthNav();
              window.location.href = '/login.html';
            });
          });
        }

        if (btnChange) {
          btnChange.addEventListener('click', function () {
            var p = (newPassEl && newPassEl.value) || '';
            if (!p || p.length < 6) {
              setStatus('Mật khẩu tối thiểu 6 ký tự.', true);
              return;
            }
            setStatus('Đang cập nhật...');
            client.auth.updateUser({ password: p }).then(function (r) {
              if (r && r.error) {
                setStatus(r.error.message || 'Cập nhật thất bại', true);
                return;
              }
              setStatus('Đã cập nhật mật khẩu.');
              if (newPassEl) newPassEl.value = '';
            });
          });
        }
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
