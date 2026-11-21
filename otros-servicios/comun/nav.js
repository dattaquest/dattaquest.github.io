/* DattaQuest: desplegables con Bootstrap y alternativa nativa para GitHub Pages. */
(function () {
  'use strict';
  var oldButton = document.getElementById('tumama');
  var otherButton = document.getElementById('dqBotonOtros');
  var oldPanel = document.getElementById('collapseOne');
  var otherPanel = document.getElementById('dqCollapseOtros');
  if (!oldPanel || !otherPanel) return;
  var mobileToggle = document.querySelector('.navbar-toggler');
  var mobilePanel = document.getElementById('navbarSupportedContent');

  if (window.jQuery && window.jQuery.fn && window.jQuery.fn.collapse) {
    var $ = window.jQuery;
    $('#dqCollapseOtros').on('show.bs.collapse', function () { $('#collapseOne').collapse('hide'); });
    $('#collapseOne').on('show.bs.collapse', function () { $('#dqCollapseOtros').collapse('hide'); });
    return;
  }

  function close(panel, button) {
    panel.classList.remove('show');
    panel.classList.remove('in');
    if (button) button.setAttribute('aria-expanded', 'false');
  }
  function toggle(panel, button, opposite, oppositeButton) {
    var opening = !panel.classList.contains('show');
    close(opposite, oppositeButton);
    panel.classList.toggle('show', opening);
    button.setAttribute('aria-expanded', String(opening));
  }
  if (mobileToggle && mobilePanel) mobileToggle.addEventListener('click', function () {
    var expanded = !mobilePanel.classList.contains('show');
    mobilePanel.classList.toggle('show', expanded);
    mobileToggle.setAttribute('aria-expanded', String(expanded));
  });
  if (oldButton) oldButton.addEventListener('click', function () { toggle(oldPanel, oldButton, otherPanel, otherButton); });
  if (otherButton) otherButton.addEventListener('click', function () { toggle(otherPanel, otherButton, oldPanel, oldButton); });
  document.addEventListener('click', function (event) {
    if (oldButton && !oldButton.contains(event.target) && !oldPanel.contains(event.target)) close(oldPanel, oldButton);
    if (otherButton && !otherButton.contains(event.target) && !otherPanel.contains(event.target)) close(otherPanel, otherButton);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { close(oldPanel, oldButton); close(otherPanel, otherButton); }
  });
})();
