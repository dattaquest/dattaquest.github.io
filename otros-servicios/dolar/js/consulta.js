(function () {
  'use strict';
  const api = 'https://dolarapi.com/v1/dolares';
  const key = 'datta_dolar_v1';
  const ttl = 3 * 60 * 60 * 1000;
  const button = document.getElementById('dqRefresh');
  const updated = document.getElementById('dqUpdated');
  const grid = document.getElementById('dqQuotes');
  const names = {oficial: 'Dólar oficial', blue: 'Dólar blue', bolsa: 'Dólar MEP / bolsa',
    contadoconliqui: 'Contado con liquidación', mayorista: 'Dólar mayorista',
    cripto: 'Dólar cripto', tarjeta: 'Dólar tarjeta / turista'};
  function money(value) {
    return typeof value === 'number' && Number.isFinite(value)
      ? new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 2}).format(value)
      : 'Sin información';
  }
  function render(items) {
    grid.textContent = '';
    const quotes = items.filter(item => item && Object.hasOwn(names, item.casa));
    if (!quotes.length) {
      DattaUtil.result('dqResult', 'Sin cotizaciones', 'No se recibieron cotizaciones para mostrar.', 'error');
      return;
    }
    document.getElementById('dqResult').classList.remove('is-visible');
    quotes.forEach(quote => {
      const card = document.createElement('article');
      card.className = 'dq-quote';
      const heading = document.createElement('h3');
      heading.textContent = names[quote.casa];
      card.appendChild(heading);
      const rows = [['Compra', money(quote.compra)], ['Venta', money(quote.venta)]];
      if (quote.fechaActualizacion) {
        const date = new Date(quote.fechaActualizacion);
        if (!Number.isNaN(date.getTime())) rows.push(['Actualizado', new Intl.DateTimeFormat('es-AR', {
          dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires'
        }).format(date)]);
      }
      card.appendChild(DattaUtil.fieldList(rows));
      grid.appendChild(card);
    });
  }
  async function load(force) {
    button.disabled = true;
    updated.textContent = 'Consultando...';
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(key));
        if (cached && Array.isArray(cached.data) && Date.now() - cached.saved < ttl) {
          render(cached.data);
          updated.textContent = 'Últimas cotizaciones guardadas.';
          button.disabled = false;
          return;
        }
      } catch (ignore) {}
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(api, {signal: controller.signal, cache: 'no-store'});
      if (!response.ok) throw Error('HTTP_' + response.status);
      const data = await response.json();
      if (!Array.isArray(data)) throw Error('RESPUESTA_INVALIDA');
      render(data);
      try { localStorage.setItem(key, JSON.stringify({saved: Date.now(), data})); } catch (ignore) {}
      updated.textContent = 'Cotizaciones actualizadas.';
    } catch (error) {
      let cached;
      try { cached = JSON.parse(localStorage.getItem(key)); } catch (ignore) {}
      if (cached && Array.isArray(cached.data)) {
        render(cached.data);
        updated.textContent = 'Sin conexión: se muestran cotizaciones anteriores.';
      } else {
        DattaUtil.result('dqResult', 'Cotizaciones no disponibles', 'No se pudieron cargar los valores. Intentá nuevamente.', 'error');
        updated.textContent = 'No se pudo actualizar.';
      }
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
    }
  }
  button.addEventListener('click', () => load(true));
  load(false);
})();
