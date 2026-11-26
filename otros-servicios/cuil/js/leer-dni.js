(function () {
  'use strict';
  const origen = document.currentScript.src;
  const lectorUrl = new URL('./vendor/zxing-pdf417-0.21.3.js', origen).href;
  const formatoUrl = new URL('./dni-pdf417.mjs', origen).href;

  function crearLienzo(imagen, girado) {
    const escala = Math.min(1, 2400 / Math.max(imagen.naturalWidth, imagen.naturalHeight));
    const ancho = Math.max(1, Math.round(imagen.naturalWidth * escala));
    const alto = Math.max(1, Math.round(imagen.naturalHeight * escala));
    const lienzo = document.createElement('canvas');
    lienzo.width = girado ? alto : ancho;
    lienzo.height = girado ? ancho : alto;
    const contexto = lienzo.getContext('2d', {willReadFrequently: true});
    if (!contexto) throw new Error('Tu navegador no pudo abrir la foto.');
    if (girado) {
      contexto.translate(alto, 0);
      contexto.rotate(Math.PI / 2);
    }
    contexto.drawImage(imagen, 0, 0, ancho, alto);
    return lienzo;
  }

  async function leerArchivo(archivo, dni = '') {
    if (!archivo || !archivo.size || !['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) {
      throw new Error('Elegí una foto JPG, PNG o WebP del código de tu DNI.');
    }
    if (archivo.size > 20 * 1024 * 1024) throw new Error('La foto supera los 20 MB. Recortá la parte donde se ve el código.');
    let lector, formato;
    try {
      [lector, formato] = await Promise.all([import(lectorUrl), import(formatoUrl)]);
    } catch {
      throw new Error('No se pudo cargar el lector. Actualizá la página y volvé a intentarlo.');
    }
    const imagen = new Image();
    const fotoUrl = URL.createObjectURL(archivo);
    try {
      imagen.src = fotoUrl;
      try {
        await imagen.decode();
      } catch {
        throw new Error('No se pudo abrir la foto. Probá con una imagen JPG, PNG o WebP.');
      }
      for (const girado of [false, true]) {
        const lienzo = crearLienzo(imagen, girado);
        let texto;
        try {
          const luz = new lector.HTMLCanvasElementLuminanceSource(lienzo);
          const mapa = new lector.BinaryBitmap(new lector.HybridBinarizer(luz));
          texto = new lector.PDF417Reader().decode(mapa).getText();
        } catch {
          continue;
        } finally {
          lienzo.width = lienzo.height = 0;
        }
        return formato.extraerCuil(texto, dni);
      }
      throw new Error('No se pudo leer el código PDF417. Probá una foto de cerca, enfocada y sin reflejos.');
    } finally {
      imagen.removeAttribute('src');
      URL.revokeObjectURL(fotoUrl);
    }
  }

  window.DattaDni = {leerArchivo};
})();
