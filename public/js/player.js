/**
 * Player: dùng đúng player do admin chọn (default_player). Mở overlay, pre-roll (nếu có), cảnh báo, lưu tiến trình.
 */
(function () {
  window.DAOP = window.DAOP || {};
  var overlay = null;

  function parseNum(v, def) {
    var n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  function isM3u8Url(url) {
    if (!url) return false;
    var u = String(url);
    var clean = u.split('#')[0];
    var qIndex = clean.indexOf('?');
    if (qIndex >= 0) clean = clean.slice(0, qIndex);
    return /\.m3u8$/i.test(clean) || /\/hls\//i.test(u) || /\/stream\//i.test(u);
  }

  function loadScriptOnce(src, key) {
    try {
      window.DAOP = window.DAOP || {};
      var k = key || ('__script__' + src);
      if (window.DAOP[k]) return window.DAOP[k];
      window.DAOP[k] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      return window.DAOP[k];
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function initHlsQuality(videoEl, link, playerConfig, mountEl) {
    try {
      if (!videoEl || !isM3u8Url(link)) return;
      if (!playerConfig || playerConfig.hls_quality_enabled === false) return;

      if (videoEl.__daop_hls && typeof videoEl.__daop_hls.destroy === 'function') {
        try { videoEl.__daop_hls.destroy(); } catch (e0) {}
        videoEl.__daop_hls = null;
      }

      var cdn = String(playerConfig.hls_js_cdn || 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js');
      return loadScriptOnce(cdn, '__hlsjs__').then(function () {
        var HlsCtor = window.Hls;
        if (!HlsCtor) return;

        if (HlsCtor.isSupported && HlsCtor.isSupported()) {
          var hls = new HlsCtor({
            startLevel: (playerConfig.hls_start_level != null ? playerConfig.hls_start_level : -1),
            capLevelToPlayerSize: playerConfig.hls_cap_level_to_player_size !== false
          });
          videoEl.__daop_hls = hls;

          hls.loadSource(String(link));
          hls.attachMedia(videoEl);

          var renderQuality = function () {
            if (!mountEl) return;
            if (!hls.levels || !hls.levels.length) return;

            var levels = (hls.levels || []).map(function (lv, idx) {
              return { idx: idx, height: lv && lv.height ? lv.height : 0, width: lv && lv.width ? lv.width : 0, bitrate: lv && lv.bitrate ? lv.bitrate : 0 };
            });
            levels.sort(function (a, b) {
              var ha = a.height || 0;
              var hb = b.height || 0;
              if (ha !== hb) return hb - ha;
              return (b.bitrate || 0) - (a.bitrate || 0);
            });

            var uniq = [];
            var seen = {};
            levels.forEach(function (lv) {
              var key = String(lv.height || 0);
              if (seen[key]) return;
              seen[key] = true;
              uniq.push(lv);
            });

            if (!uniq.length) return;

            mountEl.style.display = '';
            var options = '<option value="-1">Auto</option>';
            uniq.forEach(function (lv) {
              var label = lv.height ? (lv.height + 'p') : ('Level ' + lv.idx);
              options += '<option value="' + lv.idx + '">' + label + '</option>';
            });
            mountEl.innerHTML = '<label style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">' +
              '<span style="font-size:0.85rem;color:#8b949e;">Chất lượng</span>' +
              '<select data-role="hls-quality" style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#0d1117;color:#c9d1d9;">' + options + '</select>' +
              '</label>';

            var sel = mountEl.querySelector('[data-role="hls-quality"]');
            if (sel) {
              sel.value = String(hls.currentLevel != null ? hls.currentLevel : -1);
              sel.onchange = function () {
                var v = parseInt(sel.value || '-1', 10);
                if (!isFinite(v)) v = -1;
                try { hls.currentLevel = v; } catch (e3) {}
              };
            }
            var auxScope = (mountEl.closest && mountEl.closest('.player-overlay')) || (mountEl.closest && mountEl.closest('.watch-player-wrap')) || mountEl.parentElement;
            if (auxScope) attachPlayerAuxToPlyr(auxScope, videoEl);
          };

          hls.on(HlsCtor.Events.MANIFEST_PARSED, renderQuality);
          hls.on(HlsCtor.Events.LEVEL_SWITCHED, function () {
            try {
              if (!mountEl) return;
              var sel = mountEl.querySelector('[data-role="hls-quality"]');
              if (!sel) return;
              sel.value = String(hls.currentLevel != null ? hls.currentLevel : -1);
            } catch (e4) {}
          });
        } else {
          try { videoEl.src = String(link); } catch (e2) {}
        }
      }).catch(function () {});
    } catch (e) {}
  }

  function initPlaybackControls(hostEl, videoEl, chosenPlayer, playerConfig, jwInstance) {
    try {
      if (!hostEl || !videoEl) return;
      playerConfig = playerConfig || {};
      var enabled = playerConfig.playback_speed_enabled !== false;
      var step = parseInt(playerConfig.seek_step_seconds, 10);
      if (!isFinite(step) || step <= 0) step = 10;
      var speeds = Array.isArray(playerConfig.playback_speed_options) ? playerConfig.playback_speed_options : [0.5, 0.75, 1, 1.25, 1.5, 2];
      if (!speeds.length) speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
      var defaultSpeed = Number(playerConfig.playback_speed_default);
      if (!isFinite(defaultSpeed) || defaultSpeed <= 0) defaultSpeed = 1;
      if (speeds.indexOf(defaultSpeed) < 0) speeds = speeds.concat([defaultSpeed]).sort(function (a, b) { return a - b; });

      var bar = hostEl.querySelector('[data-role="playback"]');
      if (!bar) return;
      if (!enabled) {
        bar.style.display = 'none';
        return;
      }

      bar.style.display = '';
      var speedOptions = speeds.map(function (s) {
        var val = Number(s);
        if (!isFinite(val) || val <= 0) return '';
        var selected = val === defaultSpeed ? ' selected' : '';
        return '<option value="' + val + '"' + selected + '>' + val + 'x</option>';
      }).filter(Boolean).join('');

      bar.innerHTML =
        '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;">' +
        '  <div style="display:flex;gap:8px;align-items:center;">' +
        '    <span style="font-size:0.85rem;color:#8b949e;">Tua</span>' +
        '    <button type="button" data-role="seek-back" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#0d1117;color:#c9d1d9;">-' + step + 's</button>' +
        '    <button type="button" data-role="seek-fwd" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#0d1117;color:#c9d1d9;">+' + step + 's</button>' +
        '  </div>' +
        '  <label style="display:flex;gap:8px;align-items:center;">' +
        '    <span style="font-size:0.85rem;color:#8b949e;">Tốc độ</span>' +
        '    <select data-role="speed" style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#0d1117;color:#c9d1d9;">' + speedOptions + '</select>' +
        '  </label>' +
        '</div>';

      function getCurrentTime() {
        try {
          if (chosenPlayer === 'jwplayer' && jwInstance && typeof jwInstance.getPosition === 'function') {
            return Number(jwInstance.getPosition()) || 0;
          }
        } catch (e) {}
        return Number(videoEl.currentTime) || 0;
      }

      function seekTo(t) {
        try {
          if (!isFinite(t) || t < 0) t = 0;
          if (chosenPlayer === 'jwplayer' && jwInstance && typeof jwInstance.seek === 'function') {
            jwInstance.seek(t);
            return;
          }
        } catch (e) {}
        try { videoEl.currentTime = t; } catch (e2) {}
      }

      function setSpeed(rate) {
        rate = Number(rate);
        if (!isFinite(rate) || rate <= 0) rate = 1;
        try {
          if (chosenPlayer === 'jwplayer' && jwInstance && typeof jwInstance.setPlaybackRate === 'function') {
            jwInstance.setPlaybackRate(rate);
            return;
          }
        } catch (e) {}
        try { videoEl.playbackRate = rate; } catch (e2) {}
      }

      setSpeed(defaultSpeed);

      var btnBack = bar.querySelector('[data-role="seek-back"]');
      var btnFwd = bar.querySelector('[data-role="seek-fwd"]');
      var selSpeed = bar.querySelector('[data-role="speed"]');
      if (btnBack) btnBack.onclick = function () { seekTo(getCurrentTime() - step); };
      if (btnFwd) btnFwd.onclick = function () { seekTo(getCurrentTime() + step); };
      if (selSpeed) selSpeed.onchange = function () { setSpeed(selSpeed.value); };
    } catch (e) {}
  }

  /** Đưa playback + chất lượng HLS vào trong .plyr (trên .plyr__controls) để ẩn/hiện cùng thanh điều khiển */
  function attachPlayerAuxToPlyr(scopeEl, videoEl) {
    try {
      if (!scopeEl || !videoEl) return;
      var plyrRoot = videoEl.closest && videoEl.closest('.plyr');
      if (!plyrRoot) return;
      var ctrls = plyrRoot.querySelector('.plyr__controls');
      var quality = scopeEl.querySelector('[data-role="quality"]');
      var playback = scopeEl.querySelector('[data-role="playback"]');
      function move(node) {
        if (!node || node.parentNode === plyrRoot) return;
        if (ctrls) plyrRoot.insertBefore(node, ctrls);
        else plyrRoot.appendChild(node);
      }
      if (quality && quality.style.display !== 'none') move(quality);
      if (playback && playback.style.display !== 'none') move(playback);
    } catch (e) {}
  }

  function getPlayerConfig() {
    var playerSettings = window.DAOP?.playerSettings || {};
    return playerSettings.player_config || {};
  }

  function getAdsListByRoll(roll) {
    if (roll === 'mid') return window.DAOP?.midrollList || [];
    if (roll === 'post') return window.DAOP?.postrollList || [];
    return window.DAOP?.prerollList || [];
  }

  function getFirstActiveAdVideo(roll) {
    var list = getAdsListByRoll(roll);
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[0] || null;
  }

  function chooseVastTag(config, roll) {
    if (!config) return '';
    if (roll === 'pre') return String(config.preroll_vast || '');
    if (roll === 'mid') return String(config.midroll_vast || config.preroll_vast || '');
    if (roll === 'post') return String(config.postroll_vast || config.preroll_vast || '');
    return '';
  }

  function fetchVastMediaUrl(vastUrl) {
    vastUrl = String(vastUrl || '').trim();
    if (!vastUrl) return Promise.resolve('');
    return fetch(vastUrl, { method: 'GET' })
      .then(function (r) { return r.text(); })
      .then(function (xmlText) {
        try {
          var parser = new DOMParser();
          var xml = parser.parseFromString(xmlText, 'text/xml');
          var mediaFiles = xml.getElementsByTagName('MediaFile');
          if (!mediaFiles || !mediaFiles.length) return '';
          var best = '';
          for (var i = 0; i < mediaFiles.length; i++) {
            var node = mediaFiles[i];
            var type = (node.getAttribute('type') || '').toLowerCase();
            var url = (node.textContent || '').trim();
            if (!url) continue;
            if (/mp4|webm|ogg/.test(type)) return url;
            if (!best) best = url;
          }
          return best || '';
        } catch (e) {
          return '';
        }
      })
      .catch(function () { return ''; });
  }

  function resolveAdSource(config, roll) {
    var sourceKey = roll === 'pre' ? 'preroll_source' : (roll === 'mid' ? 'midroll_source' : 'postroll_source');
    var src = String(config && config[sourceKey] ? config[sourceKey] : 'video').toLowerCase();
    if (src !== 'vast') src = 'video';
    return src;
  }

  function buildAdRequest(config, roll) {
    var src = resolveAdSource(config, roll);
    if (src === 'vast') {
      var vastTag = chooseVastTag(config, roll);
      return fetchVastMediaUrl(vastTag).then(function (mediaUrl) {
        return { type: 'vast', vastTag: vastTag, url: mediaUrl || '' };
      });
    }
    var pr = getFirstActiveAdVideo(roll);
    return Promise.resolve({ type: 'video', url: pr && pr.video_url ? String(pr.video_url) : '', skip_after: pr && pr.skip_after != null ? pr.skip_after : null, image_url: pr && pr.image_url ? String(pr.image_url) : '' });
  }

  function playAdInOverlay(ad, onDone) {
    try {
      if (!overlay) return onDone && onDone(false);
      if (!ad || !ad.url) return onDone && onDone(false);
      var skipAfter = Math.max(0, parseInt(ad.skip_after, 10) || 0);
      var safeUrl = String(ad.url || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

      var norm = (window.DAOP && typeof window.DAOP.normalizeImgUrl === 'function')
        ? window.DAOP.normalizeImgUrl
        : function (x) { return x; };
      var normOphim = (window.DAOP && typeof window.DAOP.normalizeImgUrlOphim === 'function')
        ? window.DAOP.normalizeImgUrlOphim
        : function (x) { return x; };
      var baseUrl = (window.DAOP && window.DAOP.basePath) || '';
      var defaultPoster = baseUrl + '/images/default_poster.png';
      var posterRaw = (ad.image_url || '');
      var poster = norm(posterRaw).replace(/^\/\//, 'https://') || defaultPoster;
      var posterOphim = normOphim(posterRaw).replace(/^\/\//, 'https://') || '';
      var safePoster = String(poster || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

      overlay.innerHTML =
        '<button type="button" class="close-player" aria-label="Đóng">Đóng</button>' +
        '<div class="preroll-wrap">' +
        '<p class="preroll-label">Quảng cáo</p>' +
        '<video id="daop-ad-video" controls src="' + safeUrl + '" poster="' + safePoster + '"></video>' +
        '<div class="preroll-skip-wrap">' +
        '<button type="button" id="daop-ad-skip" class="preroll-skip-btn" disabled>Bỏ qua sau <span id="daop-ad-countdown">' + skipAfter + '</span>s</button>' +
        '</div></div>';

      var adVideo = document.getElementById('daop-ad-video');
      var skipBtn = document.getElementById('daop-ad-skip');
      var countEl = document.getElementById('daop-ad-countdown');
      var countdown = skipAfter;
      var countdownInterval = null;

      try {
        if (adVideo && poster && posterOphim && posterOphim !== poster) {
          var img = new Image();
          img.onload = function () {};
          img.onerror = function () {
            try {
              adVideo.poster = posterOphim;
              var img2 = new Image();
              img2.onerror = function () { try { adVideo.poster = defaultPoster; } catch (e3) {} };
              img2.src = posterOphim;
            } catch (e2) {}
          };
          img.src = poster;
        }
      } catch (e0) {}

      var finished = false;
      var finish = function (ok) {
        if (finished) return;
        finished = true;
        try { if (countdownInterval) clearInterval(countdownInterval); } catch (e) {}
        try {
          if (adVideo) {
            adVideo.pause();
            adVideo.src = '';
          }
        } catch (e2) {}
        if (onDone) onDone(ok !== false);
      };

      var onEnded = function () { finish(true); };
      if (adVideo) {
        adVideo.addEventListener('ended', onEnded);
        adVideo.play().catch(function () {});
      }
      if (skipAfter > 0 && skipBtn && countEl) {
        countdownInterval = setInterval(function () {
          countdown--;
          if (countEl) countEl.textContent = countdown;
          if (countdown <= 0) {
            clearInterval(countdownInterval);
            skipBtn.disabled = false;
            skipBtn.textContent = 'Bỏ qua';
          }
        }, 1000);
      } else if (skipBtn) {
        skipBtn.disabled = false;
        skipBtn.textContent = 'Bỏ qua';
      }
      if (skipBtn) skipBtn.addEventListener('click', function () { finish(true); });

      overlay.querySelector('.close-player').addEventListener('click', function () {
        finish(false);
        if (overlay) overlay.remove();
        overlay = null;
      });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          finish(false);
          overlay.remove();
          overlay = null;
        }
      });
    } catch (e) {
      if (onDone) onDone(false);
    }
  }

  function ensurePlayerSettings(done) {
    try {
      if (window.DAOP && window.DAOP.playerSettings) return done && done();
      if (!window.DAOP || typeof window.DAOP.loadConfig !== 'function') return done && done();
      window.DAOP.loadConfig('player-settings')
        .then(function (s) {
          if (s) window.DAOP.playerSettings = window.DAOP.playerSettings || s;
        })
        .catch(function () {})
        .finally(function () { if (done) done(); });
    } catch (e) {
      if (done) done();
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadStylesheet(href) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function isDirectVideoLink(url) {
    if (!url) return false;
    var u = String(url);
    // Heuristic an toàn: xem đuôi file, bỏ query + hash
    var clean = u.split('#')[0];
    var qIndex = clean.indexOf('?');
    if (qIndex >= 0) clean = clean.slice(0, qIndex);
    if (/\.(m3u8|mp4|webm|mkv|flv|mov|ogg|ogv)$/i.test(clean)) return true;
    // Giữ lại pattern HLS/stream cũ
    if (/\/stream\//i.test(u) || /\/hls\//i.test(u)) return true;
    return false;
  }

  function attachProgressAndInitPlayer(opts, videoEl, chosenPlayer) {
    if (!videoEl) return;
    var reportTime = function () {
      if (window.DAOP && window.DAOP.userSync && opts.slug && opts.episode && videoEl.currentTime != null) {
        window.DAOP.userSync.updateWatchProgress(opts.slug, opts.episode, Math.floor(videoEl.currentTime));
      }
    };
    videoEl.addEventListener('timeupdate', reportTime);
    if (chosenPlayer === 'plyr' && typeof window.Plyr !== 'undefined') {
      try {
        var plyrInstance = new window.Plyr(videoEl, { controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'] });
        plyrInstance.on('timeupdate', reportTime);
      } catch (e) {}
    } else if (chosenPlayer === 'videojs' && typeof window.videojs !== 'undefined') {
      try {
        window.videojs(videoEl).ready(function () {
          this.on('timeupdate', reportTime);
        });
      } catch (e) {}
    }
  }

  function showMainContent(opts) {
    var link = opts.link;
    var movie = opts.movie || {};
    var playerSettings = window.DAOP?.playerSettings || {};
    var playerConfig = playerSettings.player_config || {};
    var available = playerSettings.available_players && typeof playerSettings.available_players === 'object' ? playerSettings.available_players : {};
    var chosenPlayer = (playerSettings.default_player || 'plyr').toLowerCase();
    var chosenLabel = available[chosenPlayer] || chosenPlayer;
    var safeLink = (link || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    var isEmbed = !isDirectVideoLink(link);
    var playerHtml = !link
      ? '<p>Chưa có link phát.</p>'
      : isEmbed
        ? '<iframe id="daop-embed" src="' + safeLink + '" allowfullscreen allow="autoplay; fullscreen"></iframe>'
        : '<video id="daop-video" class="video-js" controls playsinline preload="metadata" src="' + safeLink + '"></video>';
    var playerLabelHtml = '<p class="player-label" style="margin:0 0 8px;font-size:0.85rem;color:#8b949e;">Đang dùng: ' + (chosenLabel || chosenPlayer) + '</p>';
    overlay.innerHTML =
      '<button type="button" class="close-player" aria-label="Đóng">Đóng</button>' +
      playerLabelHtml +
      '<div class="player-quality" data-role="quality" style="display:none;margin:0 0 8px;"></div>' +
      '<div class="player-playback" data-role="playback" style="display:none;margin:0 0 8px;"></div>' +
      playerHtml;
    var video = document.getElementById('daop-video');
    if (video && !isEmbed) {
      if (chosenPlayer !== 'jwplayer') {
        initHlsQuality(video, link, playerConfig, overlay.querySelector('[data-role="quality"]'));
      }
      initPlayerByType(chosenPlayer, video, opts, playerConfig, overlay);
      initPlaybackControls(overlay, video, chosenPlayer, playerConfig, null);
    }
    overlay.querySelector('.close-player').addEventListener('click', function () {
      if (overlay) overlay.remove();
      overlay = null;
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.remove();
        overlay = null;
      }
    });
  }

  function initPlayerByType(playerType, videoEl, opts, config, hostEl) {
    config = config || {};
    
    function reportTime() {
      if (window.DAOP && window.DAOP.userSync && opts.slug && opts.episode && videoEl.currentTime != null) {
        window.DAOP.userSync.updateWatchProgress(opts.slug, opts.episode, Math.floor(videoEl.currentTime));
      }
    }
    
    videoEl.addEventListener('timeupdate', reportTime);
    
    switch (playerType) {
      case 'plyr':
        loadStylesheet('https://cdn.plyr.io/3.7.8/plyr.css');
        loadScript('https://cdn.plyr.io/3.7.8/plyr.polyfilled.js').then(function () {
          try {
            var plyrInstance = new window.Plyr(videoEl, {
              controls: config.plyr_hideControls ? [] : ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'],
              clickToPlay: config.plyr_clickToPlay !== false,
              disableContextMenu: config.plyr_disableContextMenu !== false,
              resetOnEnd: config.plyr_resetOnEnd || false,
              tooltips: { controls: config.plyr_tooltips === 'controls', seek: config.plyr_tooltips === 'seek' }
            });
            plyrInstance.on('timeupdate', reportTime);
            function syncAux() {
              if (hostEl) attachPlayerAuxToPlyr(hostEl, videoEl);
            }
            plyrInstance.on('ready', syncAux);
            syncAux();
          } catch (e) {}
        }).catch(function () {
          attachProgressAndInitPlayer(opts, videoEl, 'native');
        });
        break;
        
      case 'videojs':
        loadStylesheet('https://vjs.zencdn.net/8.10.0/video-js.css');
        loadScript('https://vjs.zencdn.net/8.10.0/video.min.js').then(function () {
          try {
            var vjs = window.videojs(videoEl, {
              fluid: config.vjs_fluid !== false,
              responsive: config.vjs_responsive !== false,
              aspectRatio: config.vjs_aspectRatio || '16:9',
              bigPlayButton: config.vjs_bigPlayButton !== false,
              controlBar: config.vjs_controlBar !== false
            });
            vjs.ready(function () {
              this.on('timeupdate', reportTime);
            });
          } catch (e) {}
        }).catch(function () {
          attachProgressAndInitPlayer(opts, videoEl, 'native');
        });
        break;
        
      case 'jwplayer':
        if (!config.jwplayer_license_key) {
          console.error('JWPlayer license key required');
          attachProgressAndInitPlayer(opts, videoEl, 'native');
          return;
        }
        loadScript('https://cdn.jwplayer.com/libraries/' + config.jwplayer_license_key + '.js').then(function () {
          try {
            var jwp = window.jwplayer(videoEl);
            jwp.setup({
              file: videoEl.src,
              width: '100%',
              height: '100%',
              autostart: config.autoplay || false,
              mute: config.muted || false,
              controls: config.controls !== false
            });
            jwp.on('time', function (e) {
              reportTime();
            });
          } catch (e) {}
        }).catch(function () {
          attachProgressAndInitPlayer(opts, videoEl, 'native');
        });
        break;
        
      case 'vidstack':
        loadStylesheet('https://cdn.vidstack.io/player/theme.css');
        loadScript('https://cdn.vidstack.io/player/vidstack.js').then(function () {
          try {
            var player = document.createElement('media-player');
            player.setAttribute('src', videoEl.src);
            player.setAttribute('controls', '');
            if (config.vidstack_theme === 'minimal') player.setAttribute('data-theme', 'minimal');
            videoEl.parentNode.replaceChild(player, videoEl);
            player.addEventListener('time-update', reportTime);
          } catch (e) {}
        }).catch(function () {
          attachProgressAndInitPlayer(opts, videoEl, 'native');
        });
        break;
        
      case 'clappr':
        loadStylesheet('https://cdn.jsdelivr.net/npm/clappr@latest/dist/clappr.min.css');
        loadScript('https://cdn.jsdelivr.net/npm/clappr@latest/dist/clappr.min.js').then(function () {
          try {
            var clapprConfig = {
              parent: videoEl.parentNode,
              source: videoEl.src,
              autoPlay: config.clappr_autoPlay || false,
              mute: config.clappr_mute || false,
              hideMediaControl: config.clappr_hideMediaControl || false
            };
            if (config.clappr_watermark) {
              clapprConfig.watermark = config.clappr_watermark;
              clapprConfig.position = config.clappr_watermarkPosition || 'top-right';
            }
            var clapprPlayer = new window.Clappr.Player(clapprConfig);
            clapprPlayer.on(window.Clappr.Events.PLAYER_TIMEUPDATE, reportTime);
          } catch (e) {}
        }).catch(function () {
          attachProgressAndInitPlayer(opts, videoEl, 'native');
        });
        break;
        
      case 'mediaelement':
        loadStylesheet('https://cdn.jsdelivr.net/npm/mediaelement@latest/build/mediaelementplayer.min.css');
        loadScript('https://cdn.jsdelivr.net/npm/mediaelement@latest/build/mediaelement-and-player.min.js').then(function () {
          try {
            var meConfig = {
              alwaysShowControls: config.me_alwaysShowControls !== false,
              hideVideoControlsOnLoad: config.me_hideVideoControlsOnLoad || false,
              startVolume: config.me_startVolume || 0.8,
              stretching: config.me_stretching || 'responsive'
            };
            var mePlayer = new window.MediaElementPlayer(videoEl, meConfig);
            videoEl.addEventListener('timeupdate', reportTime);
          } catch (e) {}
        }).catch(function () {
          attachProgressAndInitPlayer(opts, videoEl, 'native');
        });
        break;
        
      case 'fluidplayer':
        loadStylesheet('https://cdn.fluidplayer.com/v3/current/fluidplayer.min.css');
        loadScript('https://cdn.fluidplayer.com/v3/current/fluidplayer.min.js').then(function () {
          try {
            var fluidConfig = {
              layoutControls: {
                controlBar: { display: config.fluid_controlBar !== false },
                miniProgressBar: { display: config.fluid_miniProgressBar !== false },
                playbackSpeed: { display: config.fluid_speed !== false },
                theatreMode: { display: config.fluid_theatreMode !== false },
                quality: { display: config.fluid_quality !== false }
              }
            };
            if (config.fluid_logo) {
              fluidConfig.layoutControls.logo = {
                imageUrl: config.fluid_logo,
                position: config.fluid_logoPosition || 'top right'
              };
            }
            var fluidPlayer = window.fluidPlayer(videoEl, fluidConfig);
            videoEl.addEventListener('timeupdate', reportTime);
          } catch (e) {}
        }).catch(function () {
          attachProgressAndInitPlayer(opts, videoEl, 'native');
        });
        break;
        
      default:
        attachProgressAndInitPlayer(opts, videoEl, 'native');
    }
  }

  window.DAOP.openPlayer = function (opts) {
    if (window.DAOP?.siteSettings?.player_visible === 'false') return;

    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.className = 'player-overlay';

    ensurePlayerSettings(function () {

      var config = getPlayerConfig();
      var prerollEnabled = config.preroll_enabled !== false;
      var preReq = prerollEnabled ? buildAdRequest(config, 'pre') : Promise.resolve({ url: '' });

      var startMain = function () {
        showMainContent(opts);
        var mainVideo = document.getElementById('daop-video');
        var mainIframe = document.getElementById('daop-embed');
        var isEmbed = !!mainIframe || !mainVideo;
        if (isEmbed) return;

        var midEnabled = !!config.midroll_enabled;
        var postEnabled = !!config.postroll_enabled;
        var interval = Math.max(0, parseInt(config.midroll_interval_seconds, 10) || 0);
        var minWatch = Math.max(0, parseInt(config.midroll_min_watch_seconds, 10) || 0);
        var maxPer = parseNum(config.midroll_max_per_video, 0);

        var midCount = 0;
        var nextAt = interval > 0 ? interval : 0;
        var playingAd = false;

        var tryMidroll = function () {
          try {
            if (!midEnabled || interval <= 0) return;
            if (playingAd) return;
            if (!mainVideo || mainVideo.currentTime == null) return;
            var t = mainVideo.currentTime;
            if (t < minWatch) return;
            if (nextAt > 0 && t < nextAt) return;
            if (maxPer > 0 && midCount >= maxPer) return;
            playingAd = true;
            var resumeAt = t;
            try { mainVideo.pause(); } catch (e0) {}
            buildAdRequest(config, 'mid').then(function (ad) {
              playAdInOverlay(ad, function (ok) {
                if (!overlay) return;
                showMainContent(opts);
                var v2 = document.getElementById('daop-video');
                if (v2) {
                  try { v2.currentTime = resumeAt; } catch (e2) {}
                  try { v2.play().catch(function () {}); } catch (e3) {}
                }
                midCount++;
                nextAt = resumeAt + interval;
                playingAd = false;
              });
            });
          } catch (e) {
            playingAd = false;
          }
        };

        if (midEnabled && interval > 0) {
          try { mainVideo.addEventListener('timeupdate', tryMidroll); } catch (e4) {}
        }

        if (postEnabled) {
          try {
            mainVideo.addEventListener('ended', function () {
              if (playingAd) return;
              playingAd = true;
              buildAdRequest(config, 'post').then(function (ad) {
                playAdInOverlay(ad, function () {
                  if (overlay) overlay.remove();
                  overlay = null;
                });
              });
            });
          } catch (e5) {}
        }
      };

      document.body.appendChild(overlay);
      preReq.then(function (ad) {
        if (ad && ad.url) {
          playAdInOverlay(ad, function (ok) {
            if (!overlay) return;
            startMain();
          });
        } else {
          startMain();
        }
      });
    });
  };
})();
