// SR PWA 安裝入口：只影響首頁，不快取 iframe 或登入資料。
(function () {
  let deferredPrompt = null;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const showInstallButton = () => {
    const btn = document.getElementById('installAppBtn');
    if (btn) {btn.classList.toggle('hidden', isStandalone()); btn.classList.toggle('inline-flex', !isStandalone());}
  };
  window.addEventListener('beforeinstallprompt', event => {event.preventDefault();deferredPrompt = event;showInstallButton();});
  window.addEventListener('appinstalled', () => {deferredPrompt = null;showInstallButton();});
  window.triggerPwaInstall = async () => {
    if (isStandalone()) return;
    if (deferredPrompt) {const prompt = deferredPrompt;deferredPrompt = null;prompt.prompt();await prompt.userChoice;return;}
    alert('請使用瀏覽器選單中的「安裝應用程式」或「加入主畫面」。');
  };
  document.addEventListener('DOMContentLoaded', showInstallButton);
  if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
})();
