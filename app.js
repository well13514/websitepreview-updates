const form = document.getElementById('url-form');
const input = document.getElementById('url-input');
const frame = document.getElementById('preview-frame');
const videoWrap = document.getElementById('video-wrap');
const videoPlayer = document.getElementById('video-player');
const viewport = document.getElementById('preview-viewport');
const emptyState = document.getElementById('empty-state');
const status = document.getElementById('status');
const address = document.getElementById('preview-address');
const widthLabel = document.getElementById('width-label');
const fullscreenButton = document.getElementById('fullscreen-button');
const openButton = document.getElementById('open-button');
let currentUrl = '';
let previewUrl = '';
let playerKind = '';
let streamApi = null;

function setStatus(message, state = 'ready') {
  status.dataset.state = state;
  status.lastElementChild.textContent = message;
}

function normaliseUrl(value) {
  const text = value.trim();
  if (!text) throw new Error('Enter a website address to preview.');
  const hasProtocol = /^https?:\/\//i.test(text);
  const localAddress = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(text);
  const candidate = hasProtocol ? text : `${localAddress ? 'http' : 'https'}://${text}`;
  let url;
  try { url = new URL(candidate); }
  catch { throw new Error('That address is not a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error('Use an http:// or https:// website address.');
  }
  return url.href;
}

function youtubeTarget(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const isYoutube = host === 'youtube.com' || host === 'youtube-nocookie.com';
  const isShortLink = host === 'youtu.be';
  if (!isYoutube && !isShortLink) return null;

  let videoId = '';
  if (isShortLink) videoId = url.pathname.split('/')[1] || '';
  else if (url.pathname === '/watch') videoId = url.searchParams.get('v') || '';
  else if (/^\/(shorts|live|embed)\//.test(url.pathname)) videoId = url.pathname.split('/')[2] || '';

  if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return { kind: 'video', player: 'YouTube', embedUrl: `https://www.youtube.com/embed/${videoId}` };
  }
  const playlistId = url.searchParams.get('list');
  if (isYoutube && url.pathname === '/playlist' && playlistId && /^[A-Za-z0-9_-]+$/.test(playlistId)) {
    return { kind: 'playlist', player: 'YouTube', embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(playlistId)}` };
  }
  return { kind: 'site' };
}

function vimeoTarget(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let videoId = '';
  if (host === 'vimeo.com') videoId = (url.pathname.match(/^\/(\d+)/) || [])[1] || '';
  else if (host === 'player.vimeo.com') videoId = (url.pathname.match(/^\/video\/(\d+)/) || [])[1] || '';
  else return null;
  if (!videoId) return null;
  return { kind: 'video', player: 'Vimeo', embedUrl: `https://player.vimeo.com/video/${videoId}` };
}

function dailymotionTarget(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let videoId = '';
  if (host === 'dailymotion.com') videoId = (url.pathname.match(/^\/video\/([A-Za-z0-9]+)/) || [])[1] || '';
  else if (host === 'dai.ly') videoId = url.pathname.split('/')[1] || '';
  else if (host === 'geo.dailymotion.com') {
    const player = (url.pathname.match(/^\/player\/[^/]+\/video\/([A-Za-z0-9]+)/) || [])[1];
    if (player) return { kind: 'video', player: 'Dailymotion', embedUrl: value };
    return null;
  }
  else return null;
  if (!videoId) return null;
  return { kind: 'video', player: 'Dailymotion', embedUrl: `https://www.dailymotion.com/embed/video/${videoId}` };
}

function twitchTarget(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parent = encodeURIComponent(window.location.hostname || 'localhost');
  if (host === 'twitch.tv' || host === 'player.twitch.tv') {
    const videoMatch = url.pathname.match(/^\/videos\/(\d+)/);
    if (videoMatch) return { kind: 'video', player: 'Twitch', embedUrl: `https://player.twitch.tv/?video=v${videoMatch[1]}&parent=${parent}` };
    const channelMatch = url.pathname.match(/^\/([A-Za-z0-9_]{4,25})\/?$/);
    if (channelMatch) return { kind: 'live', player: 'Twitch', embedUrl: `https://player.twitch.tv/?channel=${channelMatch[1]}&parent=${parent}` };
    return null;
  }
  if (host === 'clips.twitch.tv') {
    const slug = url.pathname.split('/').filter(Boolean)[0] || '';
    if (!slug) return null;
    return { kind: 'clip', player: 'Twitch', embedUrl: `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${parent}` };
  }
  return null;
}

function tiktokTarget(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'tiktok.com' && host !== 'vm.tiktok.com' && host !== 'vt.tiktok.com') return null;
  const match = url.pathname.match(/\/video\/(\d+)/);
  if (!match) return null;
  return { kind: 'video', player: 'TikTok', embedUrl: `https://www.tiktok.com/embed/v2/${match[1]}` };
}

function loomTarget(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'loom.com') return null;
  const match = url.pathname.match(/^\/(?:share|embed)\/([A-Za-z0-9]+)/);
  if (!match) return null;
  return { kind: 'video', player: 'Loom', embedUrl: `https://www.loom.com/embed/${match[1]}` };
}

function streamableTarget(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'streamable.com') return null;
  const clipId = url.pathname.split('/').filter(Boolean)[0] || '';
  if (!clipId || clipId === 'e') return null;
  return { kind: 'video', player: 'Streamable', embedUrl: `https://streamable.com/e/${clipId}` };
}

function wistiaTarget(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^fast\./, '');
  if (host === 'wistia.com' || host.endsWith('.wistia.com')) {
    const match = url.pathname.match(/\/medias\/([A-Za-z0-9]+)/);
    if (match) return { kind: 'video', player: 'Wistia', embedUrl: `https://fast.wistia.net/embed/iframe/${match[1]}` };
    return null;
  }
  if (host === 'wistia.net') {
    const match = url.pathname.match(/\/embed\/iframe\/([A-Za-z0-9]+)/);
    if (match) return { kind: 'video', player: 'Wistia', embedUrl: value };
  }
  else if (host === 'wi.st') {
    return { kind: 'video', player: 'Wistia', embedUrl: value };
  }
  return null;
}

function directFileTarget(value) {
  const url = new URL(value);
  const path = url.pathname.toLowerCase();
  if (/\.m3u8($|\?|#)/.test(path)) return { kind: 'stream', player: 'HLS' };
  if (/\.mpd($|\?|#)/.test(path)) return { kind: 'stream', player: 'DASH' };
  if (/\.(mp4|m4v|mov|webm|ogv|ogg)($|\?|#)/.test(path)) return { kind: 'file', player: 'Direct' };
  return null;
}

function resolveMedia(value) {
  const direct = directFileTarget(value);
  if (direct) return direct;
  const providers = [youtubeTarget, vimeoTarget, dailymotionTarget, twitchTarget, tiktokTarget, loomTarget, streamableTarget, wistiaTarget];
  for (const detect of providers) {
    try {
      const hit = detect(value);
      if (hit) return hit;
    } catch { /* not a URL this provider understands — try the next */ }
  }
  return null;
}

const scriptCache = {};
function loadScript(src) {
  if (!scriptCache[src]) {
    scriptCache[src] = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = src;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error(`Could not load the streaming library (${src}). Check your connection.`));
      document.head.appendChild(tag);
    });
  }
  return scriptCache[src];
}

function stopVideo() {
  try {
    if (streamApi && typeof streamApi.destroy === 'function') streamApi.destroy();
    if (streamApi && typeof streamApi.reset === 'function') streamApi.reset();
  } catch { /* player already gone */ }
  streamApi = null;
  videoPlayer.removeAttribute('src');
  videoPlayer.load();
  videoWrap.hidden = true;
}

async function playStream(url, player) {
  previewUrl = url;
  playerKind = player;
  frame.removeAttribute('src');
  emptyState.hidden = true;
  viewport.classList.add('has-site');
  videoWrap.hidden = false;
  setStatus(`Loading ${player} video…`, 'loading');
  try {
    if (player === 'Direct' || (player === 'HLS' && videoPlayer.canPlayType('application/vnd.apple.mpegurl'))) {
      videoPlayer.src = url;
    } else if (player === 'HLS') {
      await loadScript('https://cdn.jsdelivr.net/npm/hls.js@1');
      const hls = new Hls();
      streamApi = hls;
      hls.loadSource(url);
      hls.attachMedia(videoPlayer);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setStatus('This stream could not be played. The host may block outside players — try Open site.', 'error');
      });
    } else if (player === 'DASH') {
      await loadScript('https://cdn.jsdelivr.net/npm/dashjs@4/dist/dash.all.min.js');
      streamApi = dashjs.MediaPlayer().create();
      streamApi.initialize(videoPlayer, url, false);
    }
    await videoPlayer.play().catch(() => {});
    setStatus(`${player} video ready · Press play if it does not start automatically.`, 'ready');
  } catch (error) {
    setStatus(error.message || 'This video could not be loaded.', 'error');
  }
}

function showMessage(title, description) {
  previewUrl = '';
  playerKind = '';
  stopVideo();
  frame.removeAttribute('src');
  viewport.classList.remove('has-site');
  document.getElementById('empty-title').textContent = title;
  document.getElementById('empty-description').textContent = description;
  emptyState.hidden = false;
}

function loadUrl(url) {
  currentUrl = url;
  input.value = url;
  address.textContent = url;
  openButton.href = url;
  stopVideo();
  const media = resolveMedia(url);
  const page = new URL(window.location.href);
  page.searchParams.set('url', url);
  window.history.replaceState(null, '', page);

  if (media && media.embedUrl && window.location.protocol === 'file:') {
    showMessage('Start the local server for embedded players.', 'Run run.command in the WebsitePreviewCPP folder, then open the local address printed in Terminal.');
    setStatus('Embedded players need an http:// page so they receive a Referer.', 'error');
    return;
  }
  if (media?.kind === 'site') {
    showMessage('YouTube needs a video link.', 'The YouTube homepage cannot be embedded here. Paste a video, Shorts, or playlist link, or use the open button to visit YouTube directly.');
    setStatus('YouTube does not allow its full website in this preview.', 'error');
    return;
  }

  if (media && (media.kind === 'file' || media.kind === 'stream')) {
    playStream(url, media.player);
    return;
  }

  previewUrl = media?.embedUrl || url;
  playerKind = media?.player || 'site';
  const isEmbed = Boolean(media?.embedUrl);
  document.getElementById('empty-title').textContent = 'Your next view starts here.';
  document.getElementById('empty-description').textContent = 'Paste a link above to see how a website looks across screen sizes.';
  emptyState.hidden = true;
  viewport.classList.add('has-site');
  setStatus(isEmbed ? `Loading ${media.player} player…` : 'Loading preview…', 'loading');
  frame.src = previewUrl;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  try { loadUrl(normaliseUrl(input.value)); }
  catch (error) { setStatus(error.message, 'error'); input.focus(); }
});

frame.addEventListener('load', () => {
  if (!previewUrl || !videoWrap.hidden) return;
  if (playerKind && playerKind !== 'site') setStatus(`${playerKind} player requested · Some videos cannot be embedded by their owner.`, 'ready');
  else setStatus('Preview requested · If it looks blank, this website may block embedding.', 'ready');
});

videoPlayer.addEventListener('error', () => {
  if (!previewUrl || videoWrap.hidden) return;
  setStatus('This video could not be loaded. The host may block outside players — try Open site.', 'error');
});

document.querySelectorAll('[data-device]').forEach(button => {
  button.addEventListener('click', () => {
    const device = button.dataset.device;
    viewport.dataset.device = device;
    document.querySelectorAll('[data-device]').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    widthLabel.textContent = ({ desktop: 'Responsive width', tablet: '768 px wide', mobile: '390 px wide' })[device];
  });
});

document.getElementById('reload-button').addEventListener('click', () => {
  if (currentUrl) loadUrl(currentUrl);
  else setStatus('Enter a website address first.', 'error');
});

openButton.addEventListener('click', event => {
  if (!currentUrl) {
    event.preventDefault();
    setStatus('Enter a website address first.', 'error');
  }
});

function syncFullscreenControls() {
  const active = Boolean(document.fullscreenElement) || viewport.classList.contains('pseudo-fullscreen');
  fullscreenButton.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
  fullscreenButton.title = active ? 'Exit full screen' : 'Enter full screen';
  fullscreenButton.querySelector('.fullscreen-label').textContent = active ? 'Exit full screen' : 'Full screen';
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else if (viewport.classList.contains('pseudo-fullscreen')) {
    viewport.classList.remove('pseudo-fullscreen');
  } else {
    try {
      await viewport.requestFullscreen();
    } catch {
      viewport.classList.add('pseudo-fullscreen');
      setStatus('Preview expanded. Use Exit full screen to leave.', 'ready');
    }
  }
  syncFullscreenControls();
}

fullscreenButton.addEventListener('click', toggleFullscreen);
document.getElementById('exit-fullscreen-button').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', syncFullscreenControls);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && viewport.classList.contains('pseudo-fullscreen')) {
    viewport.classList.remove('pseudo-fullscreen');
    syncFullscreenControls();
  }
});

const initialUrl = new URL(window.location.href).searchParams.get('url');
if (initialUrl) {
  try { loadUrl(normaliseUrl(initialUrl)); }
  catch { setStatus('The saved URL is invalid.', 'error'); }
} else if (window.location.protocol === 'file:') {
  setStatus('For embedded players, run run.command and use the printed local http:// address.', 'error');
}
