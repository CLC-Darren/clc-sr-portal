// Service worker 僅提供安裝相容性，不快取登入／管理／跨站歌詞資料。
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
