(function () {
  var DEFAULT_LIMIT = 20;
  var RETRY_MS = [500, 1000, 2000];
  var mounted = new WeakSet();

  window.DAOP = window.DAOP || {};

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function gravatarByEmail(email) {
    if (!email || !window.crypto || !window.crypto.subtle) return Promise.resolve('');
    var input = String(email || '').trim().toLowerCase();
    var data = new TextEncoder().encode(input);
    return window.crypto.subtle.digest('SHA-256', data).then(function (buf) {
      var arr = Array.from(new Uint8Array(buf));
      var hex = arr.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      return 'https://www.gravatar.com/avatar/' + hex + '?d=identicon&s=80';
    }).catch(function () { return ''; });
  }

  function markdownToHtml(input) {
    var text = esc(String(input || ''));
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>');
    text = text.replace(/\n/g, '<br>');
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      return window.DOMPurify.sanitize(text, { USE_PROFILES: { html: true } });
    }
    return text;
  }

  function withRetry(factory) {
    var idx = 0;
    function run() {
      return factory().catch(function (err) {
        if (idx >= RETRY_MS.length) throw err;
        var wait = RETRY_MS[idx];
        idx += 1;
        return sleep(wait).then(run);
      });
    }
    return run();
  }

  function getApiBase() {
    var s = (window.DAOP && window.DAOP.siteSettings) || {};
    var base = String(s.comment_api_base || '').trim();
    if (!base) return '';
    if (base.charAt(0) === '/') return window.location.origin + base;
    return base.replace(/\/$/, '');
  }

  function api(path, options) {
    var base = getApiBase();
    var url = base ? (base + path) : path;
    return withRetry(function () {
      return fetch(url, options || {}).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var msg = data && data.error ? data.error : ('HTTP ' + res.status);
            throw new Error(msg);
          }
          return data;
        });
      });
    });
  }

  function getSupabaseClient() {
    if (window.DAOP && window.DAOP._supabaseUser) return Promise.resolve(window.DAOP._supabaseUser);
    var createClient = (typeof window.createClient === 'function')
      ? window.createClient
      : (window.supabase && typeof window.supabase.createClient === 'function' ? window.supabase.createClient : null);
    if (!createClient) return Promise.resolve(null);
    var url = (window.DAOP && window.DAOP.supabaseUserUrl) || '';
    var key = (window.DAOP && window.DAOP.supabaseUserAnonKey) || '';
    if (!url || !key) return Promise.resolve(null);
    window.DAOP._supabaseUser = createClient(url, key);
    return Promise.resolve(window.DAOP._supabaseUser);
  }

  function formatTime(s) {
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('vi-VN');
  }

  function renderComment(item) {
    var avatar = item.author_avatar ? esc(item.author_avatar) : '';
    var name = esc(item.author_name || 'Người dùng');
    var content = markdownToHtml(item.content || '');
    var time = formatTime(item.created_at || '');
    return (
      '<article class="cmt-item">' +
        '<div class="cmt-avatar-wrap">' +
          (avatar
            ? ('<img class="cmt-avatar" src="' + avatar + '" alt="' + name + '">')
            : ('<div class="cmt-avatar cmt-avatar--fallback">' + name.charAt(0).toUpperCase() + '</div>')) +
        '</div>' +
        '<div class="cmt-body">' +
          '<div class="cmt-meta"><strong>' + name + '</strong><span>' + esc(time) + '</span></div>' +
          '<div class="cmt-content">' + content + '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function initCommentWidget(root, opts) {
    if (!root || mounted.has(root)) return;
    mounted.add(root);
    opts = opts || {};
    var postSlug = String(opts.postSlug || root.getAttribute('data-post-slug') || '').trim();
    if (!postSlug) return;

    var state = {
      page: 1,
      hasMore: false,
      loading: false,
      session: null,
    };
    var draftKey = 'comments:draft:' + postSlug;

    root.innerHTML =
      '<section class="cmt-box">' +
        '<h3 class="cmt-title">Bình luận</h3>' +
        '<div class="cmt-form-wrap" data-role="form"></div>' +
        '<div class="cmt-list" data-role="list"></div>' +
        '<button type="button" class="cmt-load-more" data-role="more" style="display:none">Tải thêm</button>' +
        '<p class="cmt-msg" data-role="msg"></p>' +
      '</section>';

    var formWrap = root.querySelector('[data-role="form"]');
    var listEl = root.querySelector('[data-role="list"]');
    var moreBtn = root.querySelector('[data-role="more"]');
    var msgEl = root.querySelector('[data-role="msg"]');

    function setMsg(msg, isError) {
      if (!msgEl) return;
      msgEl.textContent = msg || '';
      msgEl.className = 'cmt-msg' + (isError ? ' cmt-msg--error' : '');
    }

    function fillAvatarFallback(items) {
      return Promise.all((items || []).map(function (it) {
        if (it.author_avatar || !it.author_email) return it;
        return gravatarByEmail(it.author_email).then(function (avatar) {
          it.author_avatar = avatar || '';
          return it;
        });
      }));
    }

    function renderForm() {
      if (!formWrap) return;
      var user = state.session && state.session.user;
      if (!user) {
        formWrap.innerHTML = '<button type="button" class="cmt-login-btn">Đăng nhập để bình luận</button>';
        var btn = formWrap.querySelector('.cmt-login-btn');
        if (btn) {
          btn.onclick = function () {
            var back = encodeURIComponent(window.location.href);
            window.location.href = '/login.html?redirect=' + back;
          };
        }
        return;
      }
      var meta = user.user_metadata || {};
      var name = meta.full_name || meta.name || 'Người dùng';
      var avatar = meta.avatar_url || '';
      var draft = localStorage.getItem(draftKey) || '';
      formWrap.innerHTML =
        '<form class="cmt-form">' +
          '<div class="cmt-current-user">' +
            (avatar
              ? ('<img class="cmt-avatar" src="' + esc(avatar) + '" alt="' + esc(name) + '">')
              : ('<div class="cmt-avatar cmt-avatar--fallback">' + esc(String(name).charAt(0).toUpperCase()) + '</div>')) +
            '<div><strong>' + esc(name) + '</strong><p>Bạn đang đăng nhập</p></div>' +
          '</div>' +
          '<input type="text" name="website" class="cmt-honeypot" tabindex="-1" autocomplete="off">' +
          '<textarea name="content" rows="4" maxlength="4000" placeholder="Viết bình luận...">' + esc(draft) + '</textarea>' +
          '<div class="cmt-form-actions"><button type="submit">Gửi bình luận</button></div>' +
        '</form>';
      var form = formWrap.querySelector('.cmt-form');
      var ta = formWrap.querySelector('textarea[name="content"]');
      if (ta) {
        ta.addEventListener('input', function () {
          try { localStorage.setItem(draftKey, ta.value || ''); } catch (e) {}
        });
      }
      if (form) {
        form.onsubmit = function (e) {
          e.preventDefault();
          submitComment(form);
        };
      }
    }

    function appendComments(items, reset) {
      if (!listEl) return;
      if (reset) listEl.innerHTML = '';
      (items || []).forEach(function (item) {
        listEl.insertAdjacentHTML('beforeend', renderComment(item));
      });
    }

    function fetchComments(page, reset) {
      if (state.loading) return Promise.resolve();
      state.loading = true;
      setMsg('Đang tải bình luận...');
      return api('/api/comment?postSlug=' + encodeURIComponent(postSlug) + '&page=' + page + '&limit=' + DEFAULT_LIMIT)
        .then(function (res) { return fillAvatarFallback(res.items || []).then(function (items) { return { res: res, items: items }; }); })
        .then(function (ctx) {
          appendComments(ctx.items, !!reset);
          state.page = ctx.res.page || page;
          state.hasMore = !!ctx.res.hasMore;
          if (moreBtn) moreBtn.style.display = state.hasMore ? '' : 'none';
          setMsg(ctx.items.length ? '' : 'Chưa có bình luận nào.');
        })
        .catch(function (err) {
          setMsg(err.message || 'Không thể tải bình luận', true);
        })
        .finally(function () { state.loading = false; });
    }

    function submitComment(form) {
      var ta = form.querySelector('textarea[name="content"]');
      var hp = form.querySelector('input[name="website"]');
      var content = ta ? String(ta.value || '').trim() : '';
      if (content.length < 2) {
        setMsg('Bình luận quá ngắn.', true);
        return;
      }
      var token = state.session && state.session.access_token;
      if (!token) {
        setMsg('Bạn cần đăng nhập lại để bình luận.', true);
        return;
      }
      setMsg('Đang gửi bình luận...');
      api('/api/comment', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          postSlug: postSlug,
          content: content,
          hp: hp ? hp.value : '',
        }),
      })
        .then(function (res) { return fillAvatarFallback([res.item || {}]); })
        .then(function (items) {
          appendComments(items, false);
          if (ta) ta.value = '';
          try { localStorage.removeItem(draftKey); } catch (e) {}
          setMsg('Đã gửi bình luận.');
        })
        .catch(function (err) {
          setMsg(err.message || 'Gửi bình luận thất bại', true);
        });
    }

    function initSessionAndForm() {
      return getSupabaseClient().then(function (client) {
        if (!client || !client.auth) {
          state.session = null;
          renderForm();
          return;
        }
        return client.auth.getSession().then(function (res) {
          state.session = res && res.data ? res.data.session : null;
          renderForm();
        }).catch(function () {
          state.session = null;
          renderForm();
        });
      });
    }

    function bootData() {
      return api('/api/comment/has?postSlug=' + encodeURIComponent(postSlug))
        .then(function (res) {
          if (res && res.has) return fetchComments(1, true);
          setMsg('Chưa có bình luận nào.');
          if (moreBtn) moreBtn.style.display = 'none';
        })
        .catch(function (err) {
          setMsg(err.message || 'Không thể tải trạng thái bình luận', true);
        });
    }

    if (moreBtn) {
      moreBtn.onclick = function () {
        if (!state.hasMore) return;
        fetchComments(state.page + 1, false);
      };
    }

    initSessionAndForm().then(function () {
      try {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            io.disconnect();
            bootData();
          });
        }, { rootMargin: '120px 0px' });
        io.observe(root);
      } catch (e) {
        bootData();
      }
    });
  }

  window.DAOP.mountComments = function (selectorOrEl, opts) {
    var el = selectorOrEl;
    if (typeof selectorOrEl === 'string') {
      el = document.querySelector(selectorOrEl);
    }
    if (!el) return;
    initCommentWidget(el, opts || {});
  };
})();

