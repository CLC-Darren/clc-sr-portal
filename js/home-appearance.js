/* Homepage appearance - CLC SR Portal */
(function () {
  'use strict';

  const MAX_SIZE = 10 * 1024 * 1024;
  const VIDEO_PATH = '/home-background.mp4';
  const DEFAULT = Object.freeze({ enabled: false, videoUrl: '', storagePath: '', overlayOpacity: 0.79 });

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
    let activeVideo = null;
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
      <label class="home-appearance-field home-appearance-check"><input type="checkbox" data-home-enabled> 啟用背景影片</label>
      <label class="home-appearance-field">背景影片
        <input type="file" accept="video/mp4,.mp4" data-home-file>
        <span class="home-appearance-hint" data-home-filename>尚未設定影片</span>
      </label>
      <p class="home-appearance-hint">MP4，最多 10 MB、30 秒。影片會靜音循環播放；建議使用 720p 的短片。</p>
      <label class="home-appearance-field" for="homeAppearanceOpacity">黑色遮罩深淺 <output id="homeAppearanceOpacityValue" for="homeAppearanceOpacity">79%</output>
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
    const opacityInput = panel.querySelector('[data-home-opacity]');
    const opacityValue = panel.querySelector('output');
    const filename = panel.querySelector('[data-home-filename]');
    const status = panel.querySelector('[data-home-status]');
    const saveButton = panel.querySelector('[data-home-action="save"]');

    // 依需求：SR 權限尚未建立前，預設直接開放使用
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
        videoUrl: value.videoUrl || (value.enabled ? VIDEO_PATH : ''),
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
      if (activeVideo) {
        activeVideo.pause();
        activeVideo.removeAttribute('src');
        activeVideo.load();
        activeVideo.remove();
        activeVideo = null;
      }
      currentSource = '';
    }

    function applyAppearance(value, sourceOverride = '') {
      background.style.setProperty('--home-overlay-opacity', String(value.overlayOpacity));
      const source = sourceOverride || value.videoUrl;
      if (!value.enabled || !source || (reducedMotion.matches && !editing)) {
        stopVideo();
        return;
      }
      if (source === currentSource && activeVideo) return;
      stopVideo();
      currentSource = source;
      const version = playbackVersion;
      const video = document.createElement('video');
      activeVideo = video;
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
        if (editing) statusText('此裝置目前無法播放影片，首頁會保留原本背景。', true);
      });
      video.src = source;
      background.insertBefore(video, shade);
      const playing = video.play();
      if (playing && typeof playing.catch === 'function') {
        playing.catch(() => hideBackground());
      }
    }

    function renderDraft() { applyAppearance(draft, previewUrl || draft.videoUrl || VIDEO_PATH); }

    function updateControls() {
      enabledInput.checked = draft.enabled;
      opacityInput.value = String(Math.round(draft.overlayOpacity * 100));
      opacityValue.value = opacityInput.value + '%';
      opacityValue.textContent = opacityInput.value + '%';
      filename.textContent = pendingFile ? pendingFile.name + '（儲存時自動上傳）' : (draft.videoUrl ? '已設定背景影片' : '尚未設定影片');
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
      statusText(pendingFile ? '正在把影片上傳至 GitHub…' : '正在儲存設定…');
      updateControls();
      try {
        const next = { ...draft };
        if (pendingFile) {
          await uploadVideoToGitHub(pendingFile);
          next.videoUrl = VIDEO_PATH + '?v=' + Date.now();
          next.enabled = true;
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
        statusText('請選擇不超過 10 MB 的 MP4 影片。', true);
        fileInput.value = '';
        return;
      }
      pendingFile = file;
      previewUrl = URL.createObjectURL(file);
      draft.enabled = true;
      renderDraft();
      updateControls();
    }

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
    panel.addEventListener('click', event => {
      const action = event.target.closest('[data-home-action]')?.dataset.homeAction;
      if (action === 'cancel' || action === 'close') closeEditor();
      if (action === 'save') saveAppearance();
      if (action === 'reset') {
        draft = { ...DEFAULT };
        renderDraft();
        clearPreviewFile();
        updateControls();
      }
    });

    // 初始設定讀取
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