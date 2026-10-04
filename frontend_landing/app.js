/* ================================================================
   SABBALENS LANDING — Minimal intro page
   Shows a live photo count; all real work happens in /app/.
   ================================================================ */

async function loadPhotoStat() {
  var el = document.getElementById('photo-stat');
  try {
    var res = await fetch('/api/v1/photos?limit=500');
    if (!res.ok) return;
    var photos = await res.json();
    var scheduled = photos.filter(function (p) { return p.status === 'scheduled'; }).length;
    el.textContent = photos.length + (photos.length === 1 ? ' photo' : ' photos') +
      ' in library · ' + scheduled + ' scheduled';
  } catch (e) {
    // Stat is decorative; stay silent if the API is unreachable.
  }
}

document.addEventListener('DOMContentLoaded', loadPhotoStat);