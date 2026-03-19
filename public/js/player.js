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
      playerHtml;
    var video = document.getElementById('daop-video');
    if (video && !isEmbed) {
      initPlayerByType(chosenPlayer, video, opts, playerConfig);
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

  function initPlayerByType(playerType, videoEl, opts, config) {
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
