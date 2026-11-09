// SR PWA 安裝入口：只顯示在瀏覽器可安裝時，已安裝則隱藏。
// 不儲存永久 installed 旗標：解除安裝後，瀏覽器重新發出 beforeinstallprompt 時可再次顯示。
// iOS 不支援 beforeinstallprompt，在 Safari 瀏覽器中提供「加入主畫面」指引。
(function () {
  let deferredPrompt = null;
  let justInstalled = false;
  const isStandalone = () => {
    const displayModes = ['standalone', 'fullscreen', 'minimal-ui'];
    return displayModes.some(mode => window.matchMedia && window.matchMedia(`(display-mode: ${mode})`).matches) || navigator.standalone === true;
  };
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const updateInstallButton = () => {
    const btn = document.getElementById('installAppBtn');
    if (!btn) return;
    const canInstall = !isStandalone() && !justInstalled && (deferredPrompt !== null || isIOS());
    btn.classList.toggle('hidden', !canInstall);
    btn.classList.toggle('inline-flex', canInstall);
    btn.setAttribute('aria-hidden', canInstall ? 'false' : 'true');
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    justInstalled = false;
    updateInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    justInstalled = true;
    updateInstallButton();
  });
  window.triggerPwaInstall = async () => {
    if (isStandalone() || justInstalled) return;
    if (deferredPrompt) {
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      updateInstallButton();
      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch (err) {
        console.warn('PWA 安裝對話框未能開啟:', err);
      }
      return;
    }
    if (isIOS()) {
      alert('請在 Safari 的「分享」選單中選擇「加入主畫面」，即可安裝 CLC SR。');
    }
  };
  document.addEventListener('DOMContentLoaded', updateInstallButton);
  window.addEventListener('pageshow', updateInstallButton);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
