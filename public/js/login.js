(function () {
  var form = document.getElementById('login-form');
  var emailEl = document.getElementById('login-email');
  var passEl = document.getElementById('login-password');
  var statusEl = document.getElementById('login-status');
  var btnLogin = document.getElementById('btn-login');
  var btnSignup = document.getElementById('btn-signup');
  var btnLogout = document.getElementById('btn-logout');
  var agreeEl = document.getElementById('agree-terms');
  var displayNameWrap = document.getElementById('signup-display-name-wrap');
  var displayNameEl = document.getElementById('signup-display-name');
  var titleEl = document.querySelector('.auth-center h1');
  var _signupMode = false;

  function setAuthMode(signupMode) {
    _signupMode = !!signupMode;
    if (displayNameWrap) displayNameWrap.style.display = _signupMode ? '' : 'none';
    if (titleEl) titleEl.textContent = _signupMode ? 'Đăng ký' : 'Đăng nhập';
  }

  function getSafeRedirectUrl() {
    try {
      var url = new URL(window.location.href);
      var raw = (url.searchParams.get('redirect') || '').trim();
      if (!raw) return '/nguoi-dung.html';
      var decoded = decodeURIComponent(raw);
      var target = new URL(decoded, window.location.origin);
      if (target.origin !== window.location.origin) return '/nguoi-dung.html';
      var p = target.pathname || '/';
      if (!p.startsWith('/')) return '/nguoi-dung.html';
      return p + (target.search || '') + (target.hash || '');
    } catch (e) {
      return '/nguoi-dung.html';
    }
  }

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
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    });
  }

  function loadSettings() {
    if (window.DAOP && window.DAOP.siteSettings) {
      return Promise.resolve(window.DAOP.siteSettings);
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
        setStatus('Thiếu cấu hình Supabase User (URL / Anon Key) trong Site Settings.', true);
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

  var _clientPromise = null;
  function ensureClient() {
    if (window.DAOP && window.DAOP._supabaseUser) return Promise.resolve(window.DAOP._supabaseUser);
    if (_clientPromise) return _clientPromise;
    _clientPromise = initClient().then(function (c) {
      if (!c) {
        _clientPromise = null;
        return null;
      }
      return c;
    });
    return _clientPromise;
  }

  function refreshUi(client) {
    if (!client) return;
    client.auth.getSession().then(function (res) {
      var user = res && res.data && res.data.session && res.data.session.user;
      if (user) {
        setStatus('Đã đăng nhập: ' + (user.email || user.id));
        if (btnLogout) btnLogout.style.display = '';
      } else {
        setStatus('Chưa đăng nhập');
        if (btnLogout) btnLogout.style.display = 'none';
      }
    });
  }

  function bindActions() {
    function getCreds() {
      return {
        email: (emailEl && emailEl.value || '').trim(),
        password: passEl && passEl.value || '',
      };
    }

    function ensureAgreed() {
      if (!agreeEl) return true;
      if (agreeEl.checked) return true;
      setStatus('Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật.', true);
      return false;
    }

    if (btnLogin) {
      btnLogin.addEventListener('click', function () {
        // When user is currently in signup mode, clicking "Đăng nhập" should go back UI state.
        if (_signupMode) {
          setAuthMode(false);
          setStatus('Chuyển sang đăng nhập.', false);
          return;
        }
        if (!ensureAgreed()) return;
        var c = getCreds();
        if (!c.email || !c.password) {
          setStatus('Nhập email và mật khẩu.', true);
          return;
        }
        setStatus('Đang đăng nhập...');
        ensureClient().then(function (client) {
          if (!client) return;
          refreshUi(client);
          client.auth.signInWithPassword(c).then(function (r) {
            if (r.error) {
              setStatus(r.error.message || 'Đăng nhập thất bại', true);
              return;
            }
            setStatus('Đăng nhập thành công.');
            if (window.DAOP && window.DAOP.userSync) window.DAOP.userSync.sync();
            setTimeout(function () {
              window.location.href = getSafeRedirectUrl();
            }, 300);
          });
        });
      });
    }

    if (btnSignup) {
      btnSignup.addEventListener('click', function () {
        if (!_signupMode) {
          setAuthMode(true);
          if (displayNameEl) displayNameEl.focus();
          setStatus('Nhập Tên hiển thị, Email và Mật khẩu để đăng ký.');
          return;
        }
        if (!ensureAgreed()) return;
        var c = getCreds();
        if (!c.email || !c.password) {
          setStatus('Nhập email và mật khẩu.', true);
          return;
        }
        var fullName = (displayNameEl && displayNameEl.value || '').trim();
        if (!fullName) {
          setStatus('Nhập Tên hiển thị.', true);
          return;
        }
        setStatus('Đang tạo tài khoản...');
        var redirectTo = window.location.origin + '/xac-thuc.html';
        ensureClient().then(function (client) {
          if (!client) return;
          refreshUi(client);
          client.auth.signUp({
            email: c.email,
            password: c.password,
            options: { emailRedirectTo: redirectTo, data: { full_name: fullName } },
          }).then(function (r) {
            if (r.error) {
              setStatus(r.error.message || 'Đăng ký thất bại', true);
              return;
            }
            setStatus('Đăng ký thành công. Kiểm tra email để xác nhận.');
          });
        });
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener('click', function () {
        setStatus('Đang đăng xuất...');
        ensureClient().then(function (client) {
          if (!client) return;
          client.auth.signOut().then(function () {
            setStatus('Đã đăng xuất.');
            refreshUi(client);
          });
        });
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (_signupMode) {
          if (btnSignup) btnSignup.click();
        } else {
          if (btnLogin) btnLogin.click();
        }
      });
    }
  }

  function init() {
    bindActions();
    // Ensure title matches initial mode (login).
    setAuthMode(false);
    ensureClient().then(function (client) {
      if (!client) return;
      refreshUi(client);
      client.auth.onAuthStateChange(function () {
        refreshUi(client);
        if (window.DAOP && window.DAOP.userSync) {
          window.DAOP.userSync.sync();
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
