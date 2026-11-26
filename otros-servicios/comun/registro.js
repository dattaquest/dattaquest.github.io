(function () {
  'use strict';
  const origin = 'https://dattaquest-consultacuit.sizedhatch64.chatgpt.site';
  let hints = {};
  const uaData = navigator.userAgentData;
  if (uaData && typeof uaData.getHighEntropyValues === 'function') {
    uaData.getHighEntropyValues(['platformVersion', 'model', 'fullVersionList']).then(data => {
      const list = data.fullVersionList || [];
      const brand = list.find(b => ['Microsoft Edge', 'Opera', 'Brave', 'Samsung Internet', 'Google Chrome'].includes(b.brand))
        || list.find(b => b.brand === 'Chromium');
      hints = {platformVersion:data.platformVersion, model:data.model, brand:brand?.brand, browserVersion:brand?.version};
    }).catch(() => {});
  }
  function client() {
    return {...hints, width:window.screen?.width, height:window.screen?.height,
      tablet:navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1};
  }
  function headers(endpoint) {
    try {
      if (new URL(endpoint).origin === origin) return {'X-Datta-Client':encodeURIComponent(JSON.stringify(client()))};
    } catch {}
    return {};
  }
  function event(service, action) {
    try {
      // Simple cross-origin POST can outlive the current page during paid-form navigation.
      // Never include form values, URL, referrer, session IDs or payment data.
      void fetch(origin+'/api/eventos', {method:'POST', mode:'cors', credentials:'omit', keepalive:true,
        cache:'no-store', redirect:'error', referrerPolicy:'no-referrer',
        headers:{'Content-Type':'text/plain;charset=UTF-8'}, body:JSON.stringify({service, action, client:client()})}).catch(() => {});
    } catch {}
  }
  window.DattaRegistro = {headers, event};
  document.addEventListener('submit', e => {
    const form = e.target;
    if (form.dataset.dqServicio) event(form.dataset.dqServicio, form.dataset.dqAccion);
  }, true);
})();
