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
  function send(payload) {
    try {
      // Simple cross-origin POST can outlive the current page during paid-form navigation.
      // Never include form values, URL, referrer, session IDs or payment data.
      void fetch(origin+'/api/eventos', {method:'POST', mode:'cors', credentials:'omit', keepalive:true,
        cache:'no-store', redirect:'error', referrerPolicy:'no-referrer',
        headers:{'Content-Type':'text/plain;charset=UTF-8'}, body:JSON.stringify(payload)}).catch(() => {});
    } catch {}
  }
function formatoInvalido(value) {
  if (typeof value !== 'string') return undefined;
  const sample = value.slice(0, 96);
  const hideLetters = (sample.match(/\p{L}/gu) || []).length > 3 || value.length > 96;
  const hideDigits = (sample.match(/\p{N}/gu) || []).length > 2 || value.length > 96;
  return Array.from(sample, ch => {
    if (/\p{L}/u.test(ch)) return hideLetters ? '•' : ch;
    if (/\p{N}/u.test(ch)) return hideDigits ? '•' : ch;
    return /^[\p{P}\p{S} \t]$/u.test(ch) ? ch : '•';
  }).join('');
}
  function event(service, action) {
    send({service, action, client:client()});
  }
  // Keep the legacy format available for rollback.
  // The legacy event format stays unchanged while the feature is disabled.
  function begin(service, action, startedAt) {
    if (window.DATTA_LOGS_V2 === false || !['prefijos','dolar','imei','prestadores','cuil','radicacion'].includes(service)) {
      event(service, action);
      return () => {};
    }
    const now = () => window.performance?.now?.() ?? Date.now();
    const input = ['imei','prestadores','cuil','prefijos','radicacion'].includes(service) ? document.getElementById?.('dqValue')?.value : undefined;
    const invalidSample = formatoInvalido(input);
    const started = startedAt ?? now();
    let completed = false;
    return (outcome, detail, providerHttp) => {
      if (completed) return;
      completed = true;
      const durationMs = Math.max(0, Math.round(now() - started));
      const status = ['ok','cache','fallback','invalida','sin_coincidencias','error'].includes(outcome) ? outcome : 'error';
      const payload = {service, action, client:client(), version:2, outcome:status, durationMs};
      // Only callers producing public catalog data may pass detail.
      // Never read a form, query string, cookies or user identifiers here.
      if (detail && typeof detail === 'object') payload.detail = detail;
      if (status === 'invalida' && invalidSample !== undefined) payload.detail = {...payload.detail, entrada:invalidSample};
      if (service === 'dolar' && Number.isInteger(providerHttp) && providerHttp >= 100 && providerHttp <= 599) {
        payload.providerHttp = providerHttp;
      }
      send(payload);
    };
  }
  window.DattaRegistro = {headers, event, begin};
  document.addEventListener('submit', e => {
    const form = e.target;
    if (form.dataset.dqServicio) event(form.dataset.dqServicio, form.dataset.dqAccion);
  }, true);
})();
