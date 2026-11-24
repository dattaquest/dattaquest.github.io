/* DattaQuest: desplegables con Bootstrap y alternativa nativa para GitHub Pages. */
(function () {
  'use strict';
  var servicesButton = document.getElementById('tumama');
  var otherButton = document.getElementById('dqBotonOtros');
  var servicesPanel = document.getElementById('collapseOne');
  var otherPanel = document.getElementById('dqCollapseOtros');
  if (!servicesButton || !servicesPanel || !otherButton || !otherPanel) return;
  var mobileToggle = document.querySelector('.navbar-toggler');
  var mobilePanel = document.getElementById('navbarSupportedContent');

  var $ = window.jQuery;
  var hasBootstrap = !!($ && $.fn && $.fn.collapse);
  if (hasBootstrap) {
    $(otherPanel).on('show.bs.collapse', function () { close(servicesPanel, servicesButton); });
    $(servicesPanel).on('show.bs.collapse', function () { close(otherPanel, otherButton); });
  } else {
    if (mobileToggle && mobilePanel) mobileToggle.addEventListener('click', function () {
      var expanded = !mobilePanel.classList.contains('show');
      mobilePanel.classList.toggle('show', expanded);
      mobileToggle.setAttribute('aria-expanded', String(expanded));
    });
    servicesButton.addEventListener('click', function () { toggle(servicesPanel, servicesButton, otherPanel, otherButton); });
    otherButton.addEventListener('click', function () { toggle(otherPanel, otherButton, servicesPanel, servicesButton); });
  }

  function close(panel, button) {
    if (button.getAttribute('aria-expanded') !== 'true') return;
    if (hasBootstrap) {
      var $panel = $(panel);
      if (panel.classList.contains('collapsing')) {
        // Bootstrap acepta el cierre cuando termina la animación de apertura.
        $panel.one('shown.bs.collapse', function () { $panel.collapse('hide'); });
      } else {
        $panel.collapse('hide');
      }
      return;
    }
    panel.classList.remove('show');
    panel.classList.remove('in');
    button.setAttribute('aria-expanded', 'false');
  }
  function toggle(panel, button, opposite, oppositeButton) {
    var opening = !panel.classList.contains('show');
    close(opposite, oppositeButton);
    panel.classList.toggle('show', opening);
    button.setAttribute('aria-expanded', String(opening));
  }
  function closeOutside(event) {
    if (!servicesButton.contains(event.target) && !servicesPanel.contains(event.target)) close(servicesPanel, servicesButton);
    if (!otherButton.contains(event.target) && !otherPanel.contains(event.target)) close(otherPanel, otherButton);
  }
  document.addEventListener('click', closeOutside);
  document.addEventListener('focusin', closeOutside);
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (servicesButton.getAttribute('aria-expanded') === 'true') {
      close(servicesPanel, servicesButton);
      servicesButton.focus();
    } else if (otherButton.getAttribute('aria-expanded') === 'true') {
      close(otherPanel, otherButton);
      otherButton.focus();
    }
  });
})();
