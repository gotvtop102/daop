(function () {
  var statusEl = document.getElementById('verify-status');

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
    if (window.DAOP && window.DAOP.siteSettings) {
      return Promise.resolve(window.DAOP.siteSettings);
    }
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
      if (!url || !key) {
        setStatus('Thiếu cấu hình Supabase User (URL / Anon Key).', true);
        return null;
      }

      var cc = getCreateClient();
      if (!cc) {
        setStatus('Không load được Supabase JS client.', true);
        return null;
      }

      if (!window.DAOP._supabaseUser) {
        window.DAOP._supabaseUser = cc(url, key);
      }
      return window.DAOP._supabaseUser;
    });
  }

  function parseHashParams() {
    var h = window.location.hash || '';
    if (h.startsWith('#')) h = h.slice(1);
    var p = new URLSearchParams(h);
    return {
      access_token: p.get('access_token'),
      refresh_token: p.get('refresh_token'),
      type: p.get('type'),
      error: p.get('error'),
      error_description: p.get('error_description'),
    };
  }

  function handle(client) {
    if (!client) return;

    var url = new URL(window.location.href);
    var code = url.searchParams.get('code');
    var err = url.searchParams.get('error_description') || url.searchParams.get('error');

    if (err) {
      setStatus(decodeURIComponent(err), true);
      return;
    }

    // PKCE flow: /xac-thuc.html?code=...
    if (code && typeof client.auth.exchangeCodeForSession === 'function') {
      setStatus('Đang xác thực...');
      client.auth.exchangeCodeForSession(code).then(function (r) {
        if (r && r.error) {
          setStatus(r.error.message || 'Xác thực thất bại', true);
          return;
        }
        setStatus('Xác thực thành công. Bạn có thể đăng nhập.');
        if (window.DAOP && window.DAOP.userSync) window.DAOP.userSync.sync();
      });
      return;
    }

    // Implicit flow: tokens in hash
    var hp = parseHashParams();
    if (hp.error) {
      setStatus(hp.error_description || hp.error, true);
      return;
    }

    if (hp.access_token && hp.refresh_token && typeof client.auth.setSession === 'function') {
      setStatus('Đang hoàn tất xác thực...');
      client.auth.setSession({ access_token: hp.access_token, refresh_token: hp.refresh_token }).then(function (r) {
        if (r && r.error) {
          setStatus(r.error.message || 'Xác thực thất bại', true);
          return;
        }
        setStatus('Xác thực thành công. Bạn có thể đăng nhập.');
        if (window.DAOP && window.DAOP.userSync) window.DAOP.userSync.sync();
      });
      return;
    }

    // fallback
    setStatus('Link xác thực không hợp lệ hoặc đã hết hạn.');
  }

  function init() {
    initClient().then(function (client) {
      handle(client);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
