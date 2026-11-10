/* Homepage appearance - CLC SR Portal */
(function () {
  'use strict';

  // 放寬至 50 MB
  const MAX_SIZE = 50 * 1024 * 1024;
  // 目標存放在 clc-assets 倉庫下的 videos/sr/home-background.mp4
  const GITHUB_OWNER = 'CLC-Darren';
  const GITHUB_REPO = 'clc-assets';
  const GITHUB_BRANCH = 'main';
  const ASSETS_RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/videos/sr/home-background.mp4`;

  const DEFAULT = Object.freeze({ enabled: false, videoUrl: '', storagePath: '', overlayOpacity: 0.79 });

  // 強化解析：可精準抓取各類 YouTube 網址中的 11 碼 Video ID（包含帶有 &list、&index、時間戳等參數）
  function parseYouTubeId(url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim();
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
    const match = cleanUrl.match(regExp);
    return match ? match[1] : null;
  }

  function start() {
    if (!document.querySelector('main') || document.getElementById('homeAppearanceBackground')) return;

    const settingsRef = (window.db && typeof window.db.collection === 'function')
      ? window.db.collection('system_config').doc('home_appearance')
      : null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let saved = { ...DEFAULT };
    let draft = { ...DEFAULT };
    let loaded = false;
    let editing = false;
    let busy = false;
    let committing = false;
    let validating = false;
    let pendingFile = null;
    let previewUrl = '';
    let selectionVersion = 0;
    let operationVersion = 0;
    let playbackVersion = 0;
    let currentSource = '';
    let activePlayer = null;
    let originalFocus = null;

    const background = document.createElement('div');
    background.id = 'homeAppearanceBackground';
    background.setAttribute('aria-hidden', 'true');
    background.dataset.playing = 'false';
    const shade = document.createElement('div');
    shade.className = 'home-appearance-shade';
    background.appendChild(shade);
    document.body.classList.add('home-appearance-host');
    document.body.prepend(background);

    const editButton = document.createElement('button');
    editButton.id = 'homeAppearanceEditButton';
    editButton.type = 'button';
    editButton.title = '首頁風格調整';
    editButton.setAttribute('aria-label', '首頁風格調整');
    editButton.setAttribute('aria-expanded', 'false');
    editButton.setAttribute('aria-controls', 'homeAppearancePanel');
    editButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/></svg>';
    document.body.appendChild(editButton);

    const panel = document.createElement('section');
    panel.id = 'homeAppearancePanel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'homeAppearanceTitle');
    panel.innerHTML = `
      <div class="home-appearance-panel-heading">
        <h2 id="homeAppearanceTitle">首頁風格調整</h2>
        <button type="button" data-home-action="close" aria-label="取消編輯並關閉">×</button>
      </div>
      <p class="home-appearance-hint">直接預覽首頁，儲存後才會套用給所有人。</p>
      
      <label class="home-appearance-field home-appearance-check">
        <input type="checkbox" data-home-enabled> 啟用背景影片
      </label>

      <!-- 方式一：上傳檔案 -->
      <label class="home-appearance-field">上傳背景影片檔案
        <input type="file" accept="video/mp4,.mp4" data-home-file>
        <span class="home-appearance-hint" data-home-filename>尚未選擇新影片檔案</span>
      </label>

      <!-- 方式二：網路串流或 YouTube 超連結 -->
      <label class="home-appearance-field">或輸入網路影片 / YouTube 網址
        <input type="url" data-home-url placeholder="支援 YouTube 連結或 MP4 網址" spellcheck="false">
        <span class="home-appearance-hint">
          支援 YouTube 網址、直連 MP4。
          <button type="button" data-home-action="copy-url" style="background:none;border:none;padding:0;margin:0;color:#38bdf8;font:inherit;cursor:pointer;text-decoration:underline;" hidden>複製目前背景連結</button>
        </span>
      </label>

      <p class="home-appearance-hint">檔案最多 50 MB；影片會靜音循環播放。</p>

      <label class="home-appearance-field" for="homeAppearanceOpacity">
        黑色遮罩深淺 <output id="homeAppearanceOpacityValue" for="homeAppearanceOpacity">79%</output>
        <input id="homeAppearanceOpacity" type="range" min="0" max="95" step="1" value="79" data-home-opacity>
      </label>

      <progress data-home-progress max="100" value="0" hidden aria-label="影片上傳進度"></progress>
      <div class="home-appearance-actions">
        <button type="button" data-home-action="reset">恢復預設</button>
        <button type="button" data-home-action="cancel">取消</button>
        <button type="button" data-home-action="save">儲存套用</button>
      </div>
      <p role="status" aria-live="polite" data-home-status></p>`;
    document.body.appendChild(panel);

    const enabledInput = panel.querySelector('[data-home-enabled]');
    const fileInput = panel.querySelector('[data-home-file]');
    const urlInput = panel.querySelector('[data-home-url]');
    const opacityInput = panel.querySelector('[data-home-opacity]');
    const opacityValue = panel.querySelector('output');
    const filename = panel.querySelector('[data-home-filename]');
    const copyBtn = panel.querySelector('[data-home-action="copy-url"]');
    const status = panel.querySelector('[data-home-status]');
    const saveButton = panel.querySelector('[data-home-action="save"]');

    function authorized() {
      return true;
    }

    function statusText(message, error = false) {
      status.textContent = message;
      status.dataset.error = String(error);
    }

    function normalize(value) {
      if (!value || typeof value !== 'object') return { ...DEFAULT };
      const opacity = typeof value.overlayOpacity === 'number' && Number.isFinite(value.overlayOpacity)
        ? Math.min(1, Math.max(0, value.overlayOpacity)) : DEFAULT.overlayOpacity;
      return {
        enabled: value.enabled === true,
        videoUrl: value.videoUrl || (value.enabled ? ASSETS_RAW_URL : ''),
        storagePath: '',
        overlayOpacity: opacity
      };
    }

    function hideBackground() {
      background.dataset.playing = 'false';
      document.body.classList.remove('home-appearance-playing');
    }

    function stopVideo() {
      playbackVersion++;
      hideBackground();
      if (activePlayer) {
        if (activePlayer.tagName && activePlayer.tagName.toLowerCase() === 'video') {
          activePlayer.pause();
          activePlayer.removeAttribute('src');
          activePlayer.load();
        }
        activePlayer.remove();
        activePlayer = null;
      }
      currentSource = '';
    }

    function applyAppearance(value, sourceOverride = '') {
      background.style.setProperty('--home-overlay-opacity', String(value.overlayOpacity));
      const source = (sourceOverride || value.videoUrl || '').trim();
      if (!value.enabled || !source || (reducedMotion.matches && !editing)) {
        stopVideo();
        return;
      }
      if (source === currentSource && activePlayer) return;
      stopVideo();
      currentSource = source;
      const version = playbackVersion;

      // 判斷是否為 YouTube 網址
      const ytId = parseYouTubeId(source);
      if (ytId) {
        const iframe = document.createElement('iframe');
        activePlayer = iframe;
        iframe.className = 'home-appearance-youtube-frame';
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        // 隱藏控制項 (controls=0)、隱藏 Logo 與資訊 (modestbranding=1, showinfo=0, rel=0)、完全靜音循環
        iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&playsinline=1&rel=0&showinfo=0&iv_load_policy=3&modestbranding=1&disablekb=1&fs=0`;
        iframe.allow = 'autoplay; encrypted-media';
        iframe.onload = () => {
          if (version !== playbackVersion) return;
          background.dataset.playing = 'true';
          document.body.classList.add('home-appearance-playing');
        };
        background.insertBefore(iframe, shade);
        return;
      }

      // 一般 MP4 / 直連影片檔案
      const video = document.createElement('video');
      activePlayer = video;
      video.muted = true;
      video.defaultMuted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.tabIndex = -1;
      video.addEventListener('playing', () => {
        if (version !== playbackVersion) return;
        background.dataset.playing = 'true';
        document.body.classList.add('home-appearance-playing');
      });
      video.addEventListener('error', () => {
        if (version !== playbackVersion) return;
        hideBackground();
        if (editing) statusText('無法播放此影片網址，請確認連結是否允許跨域或格式正確。', true);
      });
      video.src = source;
      background.insertBefore(video, shade);
      const playing = video.play();
      if (playing && typeof playing.catch === 'function') {
        playing.catch(() => hideBackground());
      }
    }

    function renderDraft() {
      applyAppearance(draft, previewUrl || draft.videoUrl || ASSETS_RAW_URL);
    }

    function updateControls() {
      enabledInput.checked = draft.enabled;
      opacityInput.value = String(Math.round(draft.overlayOpacity * 100));
      opacityValue.value = opacityInput.value + '%';
      opacityValue.textContent = opacityInput.value + '%';

      const isAssetRepo = draft.videoUrl && draft.videoUrl.includes('clc-assets');
      const isCustomUrl = draft.videoUrl && !isAssetRepo;

      if (pendingFile) {
        filename.textContent = pendingFile.name + '（儲存時自動上傳）';
      } else if (isAssetRepo) {
        filename.textContent = '目前設定：clc-assets/videos/sr';
      } else {
        filename.textContent = '尚未選擇新影片檔案';
      }

      // 控制複製按鈕顯示
      if (isCustomUrl) {
        copyBtn.hidden = false;
        copyBtn.dataset.url = draft.videoUrl;
      } else {
        copyBtn.hidden = true;
        copyBtn.removeAttribute('data-url');
      }

      panel.querySelectorAll('input, [data-home-action="reset"]').forEach(el => { el.disabled = busy; });
      saveButton.disabled = busy || validating;
    }

    function clearPreviewFile() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = '';
      pendingFile = null;
      fileInput.value = '';
    }

    function closeEditor(returnFocus = true) {
      if (committing) return;
      editing = false;
      operationVersion++;
      selectionVersion++;
      validating = false;
      busy = false;
      panel.hidden = true;
      editButton.setAttribute('aria-expanded', 'false');
      // 取消/關閉編輯時，完全還原回上次儲存的狀態
      applyAppearance(saved);
      clearPreviewFile();
      if (returnFocus) editButton.focus();
    }

    function openEditor() {
      originalFocus = document.activeElement;
      editing = true;
      draft = { ...saved };
      panel.hidden = false;
      editButton.setAttribute('aria-expanded', 'true');
      statusText('調整會立即預覽，按「儲存套用」才會發布。');
      
      // 打開面板時清空網址輸入框
      urlInput.value = '';
      clearPreviewFile();
      
      updateControls();
      renderDraft();
      enabledInput.focus();
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('讀取影片檔案失敗。'));
        reader.onload = () => {
          const value = String(reader.result || '');
          const marker = ';base64,';
          const offset = value.indexOf(marker);
          if (offset < 0) reject(new Error('無法準備 MP4 上傳資料。'));
          else resolve(value.slice(offset + marker.length));
        };
        reader.readAsDataURL(file);
      });
    }

    async function uploadVideoToGitHub(file) {
      const payload = await fileToBase64(file);
      const res = await fetch('/api/home-video-upload', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain; charset=US-ASCII',
          'x-home-video-size': String(file.size)
        },
        body: payload,
        cache: 'no-store'
      });
      let data = {};
      try { data = await res.json(); } catch (_) {}
      if (!res.ok || data.ok !== true) throw new Error(data.error || '上傳 GitHub 失敗，請稍後再試。');
    }

    async function saveAppearance() {
      if (!editing || busy || validating) return;
      const version = ++operationVersion;
      busy = true;
      committing = true;
      statusText(pendingFile ? '正在把影片上傳至 clc-assets/videos/sr…' : '正在儲存設定…');
      updateControls();
      try {
        const next = { ...draft };
        
        if (pendingFile) {
          await uploadVideoToGitHub(pendingFile);
          next.videoUrl = ASSETS_RAW_URL + '?v=' + Date.now();
          next.enabled = true;
        } else {
          const customUrl = (urlInput.value || '').trim();
          if (customUrl) {
            next.videoUrl = customUrl;
          }
        }

        if (settingsRef) {
          await settingsRef.set({
            enabled: next.enabled,
            videoUrl: next.videoUrl,
            storagePath: '',
            overlayOpacity: next.overlayOpacity,
            updatedAt: window.firebase ? window.firebase.firestore.FieldValue.serverTimestamp() : new Date()
          });
        }
        localStorage.setItem('clc_sr_home_appearance', JSON.stringify(next));
        saved = normalize(next);
        committing = false;
        closeEditor();
      } catch (error) {
        statusText(error.message || '儲存失敗，請重試。', true);
      } finally {
        busy = false;
        committing = false;
        updateControls();
      }
    }

    function chooseFile() {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > MAX_SIZE) {
        statusText('請選擇不超過 50 MB 的 MP4 影片。', true);
        fileInput.value = '';
        return;
      }
      pendingFile = file;
      urlInput.value = '';
      previewUrl = URL.createObjectURL(file);
      draft.enabled = true;
      renderDraft();
      updateControls();
    }

    // 即時偵測輸入（包含貼上整串帶有播放清單的 YouTube 網址）
    urlInput.addEventListener('input', () => {
      const val = urlInput.value.trim();
      clearPreviewFile();
      if (val) {
        draft.videoUrl = val;
        draft.enabled = true;
        enabledInput.checked = true;
      } else {
        draft.videoUrl = saved.videoUrl;
      }
      renderDraft();
      updateControls();
    });

    editButton.addEventListener('click', () => { if (editing) closeEditor(); else openEditor(); });
    fileInput.addEventListener('change', chooseFile);
    enabledInput.addEventListener('change', () => {
      draft.enabled = enabledInput.checked;
      renderDraft();
    });
    opacityInput.addEventListener('input', () => {
      draft.overlayOpacity = Number(opacityInput.value) / 100;
      updateControls();
      renderDraft();
    });
    panel.addEventListener('click', async event => {
      const action = event.target.closest('[data-home-action]')?.dataset.homeAction;
      if (action === 'cancel' || action === 'close') closeEditor();
      if (action === 'save') saveAppearance();
      if (action === 'reset') {
        draft = { ...DEFAULT };
        urlInput.value = '';
        renderDraft();
        clearPreviewFile();
        updateControls();
      }
      if (action === 'copy-url') {
        const link = copyBtn.dataset.url || '';
        if (!link) return;
        try {
          await navigator.clipboard.writeText(link);
          const original = copyBtn.textContent;
          copyBtn.textContent = '已複製！';
          setTimeout(() => { copyBtn.textContent = original; }, 2000);
        } catch (_) {
          statusText('複製失敗，請手動複製。', true);
        }
      }
    });

    // 載入初始設定
    const local = localStorage.getItem('clc_sr_home_appearance');
    if (local) {
      try { saved = normalize(JSON.parse(local)); applyAppearance(saved); } catch (_) {}
    }
    if (settingsRef) {
      settingsRef.get().then(snap => {
        if (snap.exists) {
          saved = normalize(snap.data());
          loaded = true;
          applyAppearance(saved);
        }
      }).catch(() => {});
    } else {
      loaded = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
