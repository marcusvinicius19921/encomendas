const CACHE_NAME = 'encomendas-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function diasParaEntrega(dataStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const entrega = new Date(dataStr + 'T00:00:00');
  return Math.ceil((entrega - hoje) / 86400000);
}

async function verificarEncomendas() {
  try {
    const clientsList = await self.clients.matchAll();
    let enc = [];

    if (clientsList.length > 0) {
      enc = await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => resolve(e.data);
        clientsList[0].postMessage({ type: 'GET_DATA' }, [channel.port2]);
        setTimeout(() => resolve([]), 2000);
      });
    }

    const hojeStr = new Date().toISOString().slice(0, 10);
    const ultimaCheck = await getUltimaCheck();
    if (ultimaCheck === hojeStr) return;

    const alertas = enc.filter(e => {
      if (e.entregue) return false;
      const d = diasParaEntrega(e.data);
      return d >= 0 && d <= 3;
    });

    for (const e of alertas) {
      const d = diasParaEntrega(e.data);
      const texto = d === 0 ? 'Entrega HOJE!' : d === 1 ? 'Entrega amanhã!' : `Entrega em ${d} dias`;
      await self.registration.showNotification('🎂 ' + e.nome, {
        body: `${e.tipo} · ${texto}`,
        icon: 'https://cdn-icons-png.flaticon.com/512/3578/3578882.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/3578/3578882.png',
        tag: 'encomenda-' + e.nome + e.data,
        vibrate: [200, 100, 200]
      });
    }

    await setUltimaCheck(hojeStr);
  } catch (err) {
    console.error('Erro ao verificar encomendas:', err);
  }
}

function getUltimaCheck() {
  return new Promise((resolve) => {
    const req = indexedDB.open('sw-encomendas', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('meta');
    req.onsuccess = () => {
      const tx = req.result.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const get = store.get('ultimaCheck');
      get.onsuccess = () => resolve(get.result || '');
      get.onerror = () => resolve('');
    };
    req.onerror = () => resolve('');
  });
}

function setUltimaCheck(valor) {
  return new Promise((resolve) => {
    const req = indexedDB.open('sw-encomendas', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('meta');
    req.onsuccess = () => {
      const tx = req.result.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(valor, 'ultimaCheck');
      tx.oncomplete = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'verificar-encomendas') {
    event.waitUntil(verificarEncomendas());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'verificar-encomendas') {
    event.waitUntil(verificarEncomendas());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsList) => {
      if (clientsList.length > 0) {
        return clientsList[0].focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_NOW') {
    verificarEncomendas();
  }
});
