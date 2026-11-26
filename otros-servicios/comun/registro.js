(function () {
  'use strict';
  const origin = 'https://dattaquest-consultacuit.sizedhatch64.chatgpt.site';
  let hints = {};
  let network = null;
  function detectNetwork() {
    if (!window.crypto?.randomUUID || typeof AbortSignal?.timeout !== 'function') return;
    if (network && Date.now() - network.started < 300000) return;
    const current = network = {id:window.crypto.randomUUID(),started:Date.now()};
    // A separate IPv4-only request also works when the collector connection uses IPv6.
    void fetch('https://api.ipify.org?format=json', {
      mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
      signal:AbortSignal.timeout(3000)
    }).then(response => response.ok ? response.json() : null).then(async data => {
      const ip = data?.ip;
      const ipv4 = typeof ip === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(n=>Number(n)<=255) ? ip : null;
      let providerLookup;
      if (ipv4) {
        for (const source of ['ipwho.is','ipapi.is']) {
          try {
            const url = source === 'ipwho.is'
              ? 'https://ipwho.is/'+ipv4+'?fields=ip,success,connection.isp,connection.org'
              : 'https://api.ipapi.is/?q='+ipv4;
            const response = await fetch(url, {
              mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
              signal:AbortSignal.timeout(4000)
            });
            const info = response.ok ? await response.json() : null;
            const isp = source === 'ipwho.is' ? info?.connection?.isp || info?.connection?.org
              : typeof info?.asn === 'string' ? info.asn.replace(/^AS[0-9]+\s+/, '') : info?.asn?.org;
            if (info?.ip === ipv4 && typeof isp === 'string' && isp.trim() && (source !== 'ipwho.is' || info.success === true)) {
              providerLookup = {ip:ipv4,isp:isp.slice(0,160),source};
              break;
            }
          } catch {}
        }
      }
      send({network:{id:current.id,ipv4,...(providerLookup ? {providerLookup} : {})}});
    }).catch(() => send({network:{id:current.id,ipv4:null}}));
  }
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
    detectNetwork();
    return {...hints, ...(network ? {networkId:network.id} : {}), width:window.screen?.width, height:window.screen?.height,
      tablet:navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1};
  }
  function headers(endpoint, entrada = document.getElementById?.('dqValue')?.value) {
    try {
      if (new URL(endpoint).origin === origin) return {'X-Datta-Client':encodeURIComponent(JSON.stringify({...client(), entrada}))};
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
  function begin(service, action, startedAt, entrada) {
    if (window.DATTA_LOGS_V2 === false || !['prefijos','dolar','imei','prestadores','cuil','radicacion'].includes(service)) {
      event(service, action);
      return () => {};
    }
    const now = () => window.performance?.now?.() ?? Date.now();
    const input = entrada !== undefined ? entrada : ['imei','prestadores','cuil','prefijos','radicacion'].includes(service) ? document.getElementById?.('dqValue')?.value : undefined;
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
  detectNetwork();
  const rejected=new WeakSet();
  document.addEventListener('invalid', e => {
    const form=e.target.form;
    if (!form?.dataset.dqServicio || rejected.has(form)) return;
    rejected.add(form);
    paid(form,'invalida');
    queueMicrotask(()=>rejected.delete(form));
  }, true);
})();
