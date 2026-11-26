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
      if (new URL(endpoint).origin === origin) return {'X-Datta-Client':encodeURIComponent(JSON.stringify({...client(), entrada:document.getElementById?.('dqValue')?.value}))};
    } catch {}
    return {};
  }
  function send(payload) {
    try {
      // Simple cross-origin POST can outlive the current page during paid-form navigation.
      void fetch(origin+'/api/eventos', {method:'POST', mode:'cors', credentials:'omit', keepalive:true,
        cache:'no-store', redirect:'error', referrerPolicy:'no-referrer',
        headers:{'Content-Type':'text/plain;charset=UTF-8'}, body:JSON.stringify(payload)}).catch(() => {});
    } catch {}
  }
  function event(service, action) {
    const input = service === 'radicacion' ? document.getElementById?.('dqValue')?.value : undefined;
    if (typeof input === 'string') send({service,action,client:client(),version:2,outcome:'invalida',durationMs:0,detail:{entrada:input}});
    else send({service, action, client:client()});
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
    const started = startedAt ?? now();
    let completed = false;
    return (outcome, detail, providerHttp) => {
      if (completed) return;
      completed = true;
      const durationMs = Math.max(0, Math.round(now() - started));
      const status = ['ok','cache','fallback','invalida','sin_coincidencias','error'].includes(outcome) ? outcome : 'error';
      const payload = {service, action, client:client(), version:2, outcome:status, durationMs};
      if (detail && typeof detail === 'object') payload.detail = detail;
      if (typeof input === 'string') payload.detail = {...payload.detail, entrada:input};
      if (service === 'dolar' && Number.isInteger(providerHttp) && providerHttp >= 100 && providerHttp <= 599) {
        payload.providerHttp = providerHttp;
      }
      send(payload);
    };
  }
  window.DattaRegistro = {headers, event, begin};
  document.addEventListener('submit', e => {
    const form = e.target;
    if (form.dataset.dqServicio) paid(form,form.dataset.dqAccion);
  }, true);
  const paidFields = {celulares:['area','numero','select','compania','email'], guia:['PHONE_prefix','PHONE_number'],patentes:['PHONE_number']};
  function paid(form,action) {
    const service=form.dataset.dqServicio;
    const campos={};
    for (const name of paidFields[service] || []) {
      const field=form.elements.namedItem?.(name);
      if (typeof field?.value === 'string') campos[name]=field.value;
    }
    send({service,action,client:client(),version:2,outcome:action==='invalida'?'invalida':'ok',durationMs:0,detail:{campos}});
  }
  const rejected=new WeakSet();
  document.addEventListener('invalid', e => {
    const form=e.target.form;
    if (!form?.dataset.dqServicio || rejected.has(form)) return;
    rejected.add(form);
    paid(form,'invalida');
    queueMicrotask(()=>rejected.delete(form));
  }, true);
})();
