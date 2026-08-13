(function () {
  const PROFILE_MIX = [
    { videoId: "1oLeRWAZ3RE", title: "Secret Tape", artist: "Hidden Channel", duration: "3:24" },
    { videoId: "dQw4w9WgXcQ", title: "Signal Bloom", artist: "Glass Receiver", duration: "3:33" },
    { videoId: "kxopViU98Xo", title: "Night Relay", artist: "Aero Static", duration: "3:53" }
  ];

  /* Links from external platforms — rendered by the main app's initMusicEmbeds().
     embedSrc: optional pre-built iframe src (used for Bandcamp where the numeric
     track/album ID isn't derivable from the public URL alone). */
  const PROFILE_LINKS = [
    {
      url: 'https://soundcloud.com/forss/flickermood',
      platform: 'sc',
      title: 'Flickermood — Forss'
    },
    {
      url: 'https://www.mixcloud.com/boilerroom/honey-dijon-boiler-room-sugar-mountain-melbourne-dj-set/',
      platform: 'mc',
      title: 'Honey Dijon — Boiler Room'
    },
    {
      url: 'https://theorchid.bandcamp.com/track/the-astronaut-escape-velocity',
      platform: 'bc',
      title: 'The Astronaut — The Orchid',
      embedSrc: 'https://bandcamp.com/EmbeddedPlayer/track=3220102216/size=large/bgcol=e8f4ff/linkcol=1565C0/transparent=true/'
    },
    {
      url: 'https://www.youtube.com/watch?v=1oLeRWAZ3RE',
      platform: 'yt',
      title: 'Secret Tape — Hidden Channel'
    }
  ];

  function profileAvatarMarkup(canvasClass) {
    return `
      <div class="profile-native__avatar-system av-wrap size-60">
        <div class="av-canvas-wrap profile-native__avatar-canvas-wrap">
          <canvas class="${canvasClass}" width="60" height="60"></canvas>
          <div class="av-inner xp-av profile-native__avatar-inner">R</div>
        </div>
        <div class="av-online-pip profile-native__avatar-online"></div>
        <div class="av-badge-corner profile-native__avatar-badge">💎</div>
      </div>
    `;
  }

  function postCard() {
    return `
      <article class="profile-native__post">
        <div class="profile-native__post-head">
          <div class="profile-native__post-avatar">R</div>
          <div>
            <div class="profile-native__post-title">Repair log from the communal oven</div>
            <div class="profile-native__post-sub">@river.oak · yesterday · Repair</div>
          </div>
        </div>
        <div class="profile-native__post-copy">
          Replaced the heating element, tuned the thermostat, and got the old bread oven back online.
          The nicest part is watching something broken become everyone’s again.
        </div>
        <div class="profile-native__post-media"></div>
        <div class="profile-native__post-tags">
          <span class="profile-native__post-chip">#repairculture</span>
          <span class="profile-native__post-chip">#commons</span>
          <span class="profile-native__post-chip">#mutualcare</span>
        </div>
        <div class="profile-native__post-actions">
          <span class="profile-native__post-action">341 likes</span>
          <span class="profile-native__post-action">27 reposts</span>
          <span class="profile-native__post-action">14 replies</span>
        </div>
      </article>
    `;
  }

  function connectionMap() {
    return `
      <div class="profile-native__conn-mini">
        <svg class="profile-native__conn-svg" viewBox="0 0 220 140" aria-label="Connection map">
          <line x1="110" y1="70" x2="40" y2="22" />
          <line x1="110" y1="70" x2="18" y2="82" />
          <line x1="110" y1="70" x2="48" y2="124" />
          <line x1="110" y1="70" x2="168" y2="20" />
          <line x1="110" y1="70" x2="196" y2="78" />
          <line x1="110" y1="70" x2="162" y2="126" />

          <circle cx="110" cy="70" r="15" class="profile-native__conn-node profile-native__conn-node--core" />
          <text x="110" y="75" text-anchor="middle">R</text>

          <circle cx="40" cy="22" r="12" class="profile-native__conn-node profile-native__conn-node--green" />
          <text x="40" y="26" text-anchor="middle">K</text>

          <circle cx="18" cy="82" r="10" class="profile-native__conn-node profile-native__conn-node--blue" />
          <text x="18" y="86" text-anchor="middle">R</text>

          <circle cx="48" cy="124" r="10" class="profile-native__conn-node profile-native__conn-node--clay" />
          <text x="48" y="128" text-anchor="middle">L</text>

          <circle cx="168" cy="20" r="11" class="profile-native__conn-node profile-native__conn-node--leaf" />
          <text x="168" y="24" text-anchor="middle">P</text>

          <circle cx="196" cy="78" r="10" class="profile-native__conn-node profile-native__conn-node--blue" />
          <text x="196" y="82" text-anchor="middle">T</text>

          <circle cx="162" cy="126" r="10" class="profile-native__conn-node profile-native__conn-node--teal" />
          <text x="162" y="130" text-anchor="middle">N</text>
        </svg>
      </div>
    `;
  }

  function musicPlayer(playerId) {
    return `
      <div class="profile-native__music-player-shell">
        <div class="profile-native__music-player-top">
          <div class="profile-native__music-player-art">
            <div class="profile-native__music-player-art-badge">music</div>
          </div>
          <div class="profile-native__yt-player profile-native__yt-player--music" data-profile-player="${playerId}">
            <div class="profile-native__yt-hidden" id="${playerId}-yt-player"></div>
            <div class="profile-native__music-controls-row">
              <button class="profile-native__yt-btn" type="button" data-profile-prev><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg></button>
              <button class="profile-native__yt-btn profile-native__yt-btn--main" type="button" data-profile-toggle><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="8 5 19 12 8 19 8 5"></polygon></svg></button>
              <button class="profile-native__yt-btn" type="button" data-profile-next><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg></button>
            </div>
            <div class="profile-native__music-track-panel">
              <div class="profile-native__yt-title" data-profile-title>${PROFILE_MIX[0].title}</div>
              <div class="profile-native__yt-artist" data-profile-artist>${PROFILE_MIX[0].artist}</div>
              <div class="profile-native__yt-status" data-profile-status>ready to play</div>
              <div class="profile-native__yt-progress"><div class="profile-native__yt-progress-fill" data-profile-progress></div></div>
              <div class="profile-native__yt-time"><span data-profile-current>0:00</span><span data-profile-total>${PROFILE_MIX[0].duration}</span></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function musicPlaylist(playerId) {
    const plays = ["28 plays", "14 plays", "9 plays"];
    return `
      <div class="profile-native__music-playlist">
        ${PROFILE_MIX.map((track, index) => `
          <button class="profile-native__music-row ${index === 0 ? "is-active" : ""}" type="button" data-profile-track="${index}" data-profile-player-target="${playerId}">
            <div class="profile-native__music-row-copy">
              <div class="profile-native__music-row-title">${track.title}</div>
              <div class="profile-native__music-row-artist">by ${track.artist}</div>
            </div>
            <div class="profile-native__music-row-plays">${plays[index] || "0 plays"}</div>
          </button>
        `).join("")}
      </div>
    `;
  }

  function musicLinks() {
    const LABELS = { sc: 'SoundCloud', mc: 'Mixcloud', bc: 'Bandcamp', yt: 'YouTube' };
    const CLASSES = { sc: 'meb--sc', mc: 'meb--mc', bc: 'meb--bc', yt: 'meb--yt' };
    return `
      <div class="music-links-grid">
        <div class="music-links-label">Listen on</div>
        ${PROFILE_LINKS.map(l => `
          <div class="music-embed-card"
               data-music-url="${l.url}"
               data-music-platform="${l.platform}"
               data-music-title="${l.title}"
               ${l.embedSrc ? `data-music-embed-src="${l.embedSrc}"` : ''}>
          </div>
        `).join('')}
      </div>`;
  }

  function musicView() {
    return `
      <div class="profile-native__music-shell">
        <div class="profile-native__music-brandbar">
          <div class="profile-native__music-brand">music</div>
        </div>

        <div class="profile-native__music-grid">
          <aside class="profile-native__music-left">
            <section class="profile-native__music-card profile-native__music-card--profile">
              <div class="profile-native__music-avatar">
                ${profileAvatarMarkup("profile-native__music-avatar-frame-canvas")}
              </div>
              <div class="profile-native__music-name">River Oak</div>
              <div class="profile-native__music-genre">Ambient / Repair Pop / Field Archive</div>
              <div class="profile-native__music-meta">
                <span>Seattle, WA</span>
                <span aria-hidden="true">·</span>
                <span class="profile-native__music-online">Online</span>
              </div>
              <div class="p-actions" style="width:100%">
                <button class="btn-primary" type="button"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Follow</button>
                <button class="btn-secondary" type="button" data-profile-action="message"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>DM</button>
              </div>
            </section>

            <section class="profile-native__music-card">
              <div class="profile-native__music-head">River Oak: Info</div>
              <div class="profile-native__music-table">
                <div class="profile-native__music-row-label">Member Since</div>
                <div>3/1/2024</div>
                <div class="profile-native__music-row-label">Collaborators</div>
                <div>River Oak, Fern Studio, Sol Varga</div>
                <div class="profile-native__music-row-label">Influences</div>
                <div>Field recordings, basement shows, neighborhood radio, soft electronics, and old web sincerity.</div>
              </div>
            </section>

          </aside>

          <div class="profile-native__music-right">
            <section class="profile-native__music-card">
              <div class="profile-native__music-head">About River Oak</div>
              <div class="profile-native__music-about">
                Making music is one of my lifelong hobbies. I have been collecting soft tones, room noise,
                and neighborhood fragments for years. This page is for mixes, notes, and tracks that feel a
                little handmade and a little communal.
                <br><br>
                Lately I have been turning that archive into small songs and repair-session recordings.
                The goal is simple: something warm, human, and worth replaying.
              </div>
            </section>

            <section class="profile-native__music-card">
              <div class="profile-native__music-head">music</div>
              <div class="profile-native__music-player-wrap">
                ${musicPlayer("profile-music-mix")}
                ${musicPlaylist("profile-music-mix")}
                <div class="profile-native__music-tabs">
                  <span class="profile-native__music-tab--active">playlists (1)</span>
                </div>
              </div>
              ${musicLinks()}
            </section>

            <section class="profile-native__music-card" style="overflow:visible">
              <div class="profile-native__music-head">Posts</div>
              <div style="padding:12px;display:flex;flex-direction:column;gap:12px">
                ${postCard()}
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
  }

  function mountProfileNative(root) {
    if (!root) return;

    root.innerHTML = `<section class="profile-native">${musicView()}</section>`;

    root.querySelectorAll("[data-profile-action='message']").forEach((button) => {
      button.addEventListener("click", () => {
        if (window.navigate) window.navigate("chat");
      });
    });

    const activeBadgeId =
      document.querySelector(".badge-pick.active")?.id?.replace("bp_", "") || "b01";
    const badgeCorner = document.getElementById("profile-badge-corner");
    const badgeIcon = badgeCorner?.textContent?.trim() || "💎";
    const badgeBg = badgeCorner?.style.background || "#003a5a";
    const badgeBorder = badgeCorner?.style.borderColor || "#00ccff";
    const badgeShadow = badgeCorner?.style.boxShadow || "0 0 8px rgba(0,204,255,0.45)";

    root.querySelectorAll(".profile-native__avatar-badge").forEach((el) => {
      el.textContent = badgeIcon;
      el.style.background = badgeBg;
      el.style.borderColor = badgeBorder;
      el.style.boxShadow = badgeShadow;
    });

    if (window.initCanvas) {
      root.querySelectorAll(".profile-native__music-avatar-frame-canvas").forEach((canvas) => {
        window.initCanvas(canvas, activeBadgeId, 60);
      });
    }

    initProfilePlayers(root);
  }

  function formatTime(total) {
    const seconds = Math.max(0, Math.floor(total || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function ensureYouTubeApi(callback) {
    if (window.YT && window.YT.Player) {
      callback();
      return;
    }
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function wrappedYouTubeReady() {
      if (typeof previousReady === "function") previousReady();
      callback();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  }

  function initProfilePlayers(root) {
    const cards = Array.from(root.querySelectorAll("[data-profile-player]"));
    if (!cards.length) return;
    ensureYouTubeApi(() => {
      cards.forEach((card) => mountProfilePlayer(card, root));
    });
  }

  function mountProfilePlayer(card, root) {
    if (card.dataset.playerMounted === "true") return;
    card.dataset.playerMounted = "true";
    let currentIndex = 0;
    let progressTimer = null;
    const playerId = card.dataset.profilePlayer;
    const titleEl = card.querySelector("[data-profile-title]");
    const artistEl = card.querySelector("[data-profile-artist]");
    const statusEl = card.querySelector("[data-profile-status]");
    const currentEl = card.querySelector("[data-profile-current]");
    const totalEl = card.querySelector("[data-profile-total]");
    const progressEl = card.querySelector("[data-profile-progress]");
    const toggleBtn = card.querySelector("[data-profile-toggle]");

    function syncRows() {
      root.querySelectorAll(`[data-profile-player-target="${playerId}"]`).forEach((row) => {
        row.classList.toggle("is-active", Number(row.dataset.profileTrack) === currentIndex);
      });
    }

    function setMeta() {
      const track = PROFILE_MIX[currentIndex];
      titleEl.textContent = track.title;
      artistEl.textContent = track.artist;
      totalEl.textContent = track.duration;
      syncRows();
    }

    function setStatus(label, isPlaying) {
      statusEl.textContent = label;
      toggleBtn.innerHTML = isPlaying
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="8 5 19 12 8 19 8 5"></polygon></svg>';
    }

    const player = new window.YT.Player(`${playerId}-yt-player`, {
      height: "0",
      width: "0",
      videoId: PROFILE_MIX[0].videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0
      },
      events: {
        onReady: () => {
          setMeta();
          player.cueVideoById(PROFILE_MIX[0].videoId, 0);
          setStatus("ready to play", false);
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            setStatus("playing hidden youtube audio", true);
            window.clearInterval(progressTimer);
            progressTimer = window.setInterval(() => {
              const current = player.getCurrentTime() || 0;
              const duration = player.getDuration() || 0;
              currentEl.textContent = formatTime(current);
              progressEl.style.width = duration ? `${(current / duration) * 100}%` : "0%";
            }, 500);
          } else if (event.data === window.YT.PlayerState.PAUSED) {
            setStatus("paused", false);
          } else if (event.data === window.YT.PlayerState.CUED) {
            currentEl.textContent = "0:00";
            progressEl.style.width = "0%";
          } else if (event.data === window.YT.PlayerState.ENDED) {
            loadTrack(currentIndex + 1, true);
          }
        }
      }
    });

    function loadTrack(index, shouldPlay) {
      currentIndex = (index + PROFILE_MIX.length) % PROFILE_MIX.length;
      const track = PROFILE_MIX[currentIndex];
      setMeta();
      if (shouldPlay) {
        player.loadVideoById(track.videoId, 0);
        setStatus("buffering stream", true);
      } else {
        player.cueVideoById(track.videoId, 0);
        setStatus("ready to play", false);
      }
    }

    card.querySelector("[data-profile-prev]").addEventListener("click", () => loadTrack(currentIndex - 1, true));
    card.querySelector("[data-profile-next]").addEventListener("click", () => loadTrack(currentIndex + 1, true));
    toggleBtn.addEventListener("click", () => {
      const state = player.getPlayerState();
      if (state === window.YT.PlayerState.PLAYING) player.pauseVideo();
      else if (state === window.YT.PlayerState.PAUSED || state === window.YT.PlayerState.CUED) player.playVideo();
      else loadTrack(currentIndex, true);
    });
    root.querySelectorAll(`[data-profile-player-target="${playerId}"]`).forEach((row) => {
      row.addEventListener("click", () => loadTrack(Number(row.dataset.profileTrack), true));
    });
  }

  window.mountProfileNative = mountProfileNative;
})();
