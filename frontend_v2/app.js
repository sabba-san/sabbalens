/* ================================================================
   SABBALENS v2.0 - Frontend Application (Tailwind preview at /v2/)
   Vanilla JS, no framework dependencies. Same API as v1 (/api/v1).
   Security: Uses textContent / createElement for DOM, no innerHTML.
   DESIGN.md tokens expressed as Tailwind utilities; dynamic badges
   are injected via badgeClasses() (Vercel-style 1px borders,
   Linear dark contrast, Shadcn-dark defaults).
   ================================================================ */

const API_BASE = '/api/v1';

let currentPhotoId = null;
const DEFAULT_HASHTAGS = ['#landscape', '#photography', '#nature', '#travel', '#shotonsony'];
const CAPTION_MAX = 2200;
const TOAST_DURATION_MS = 4000;


/* ================================================================
   TAILWIND BADGE HELPERS (replaces status-badge CSS classes)
   ================================================================ */

const BADGE_BASE = 'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ';
const DOT_BASE = 'w-1.5 h-1.5 rounded-full ';

function badgeClasses(status) {
  switch (status) {
    case 'scheduled':
      return BADGE_BASE + 'text-accent bg-[rgba(255,43,43,0.15)]';
    case 'published':
      return BADGE_BASE + 'text-ok bg-[rgba(34,197,94,0.15)]';
    case 'failed':
      return BADGE_BASE + 'text-err bg-[rgba(239,68,68,0.15)]';
    case 'draft':
    default:
      return BADGE_BASE + 'text-muted border border-line';
  }
}

function dotClasses(status) {
  switch (status) {
    case 'scheduled': return DOT_BASE + 'bg-accent';
    case 'published': return DOT_BASE + 'bg-ok';
    case 'failed': return DOT_BASE + 'bg-err';
    case 'draft':
    default: return DOT_BASE + 'bg-muted';
  }
}

/** Apply a status badge to an existing pill element (keeps dot span). */
function setBadge(el, status, label) {
  var safe = ['draft', 'scheduled', 'published', 'failed'].indexOf(status) !== -1 ? status : 'draft';
  el.className = badgeClasses(safe);
  el.replaceChildren();
  var dot = document.createElement('span');
  dot.className = dotClasses(safe);
  dot.setAttribute('aria-hidden', 'true');
  var text = document.createElement('span');
  text.textContent = label || safe;
  el.appendChild(dot);
  el.appendChild(text);
}


/* ================================================================
   TOAST NOTIFICATION SYSTEM
   Replaces native alert() per security guidelines.
   ================================================================ */

/**
 * Shows a toast notification.
 * @param {string} message - The text message to display.
 * @param {'success'|'error'|'info'} type - Toast variant.
 */
function showToast(message, type) {
  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');
  toast.className = 'toast toast--' + type;

  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined toast__icon';
  const iconMap = { success: 'check_circle', error: 'error', info: 'info' };
  icon.textContent = iconMap[type] || 'info';

  const text = document.createElement('span');
  text.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);

  // Auto-dismiss
  const timer = setTimeout(function () {
    dismissToast(toast);
  }, TOAST_DURATION_MS);

  // Click to dismiss early
  toast.addEventListener('click', function () {
    clearTimeout(timer);
    dismissToast(toast);
  });
}

function dismissToast(el) {
  el.classList.add('toast--exiting');
  el.addEventListener('animationend', function () {
    el.remove();
  }, { once: true });
}


/* ================================================================
   URL & FETCH HELPERS
   ================================================================ */

function getPhotoIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function fetchPhoto(id) {
  try {
    const res = await fetch(API_BASE + '/photos/' + encodeURIComponent(id));
    if (!res.ok) throw new Error('Photo not found');
    return await res.json();
  } catch (e) {
    console.error('Failed to fetch photo');
    showToast('Could not load photo', 'error');
    return null;
  }
}

/**
 * The API returns naive UTC timestamps (no "Z"). Treat them as UTC so the
 * browser doesn't misread them as local time.
 */
function parseServerDate(value) {
  if (!value) return null;
  var hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  var d = new Date(hasTz ? value : value + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  var d = parseServerDate(value);
  if (!d) return '\u2014';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function photoUrl(photo) {
  return '/uploads/' + encodeURIComponent(photo.file_path.split('/').pop());
}


/* ================================================================
   RENDER PHOTO
   ================================================================ */

function renderPhoto(photo) {
  currentPhotoId = photo.id;
  document.title = 'Sabbalens \u2014 ' + photo.filename;

  // Show the image, hide the empty state
  const preview = document.getElementById('photo-preview');
  preview.classList.remove('photo-preview--empty');
  var emptyBlock = preview.querySelector('.grid.place-items-center');
  if (emptyBlock) emptyBlock.style.display = 'none';

  const img = document.getElementById('photo-img');
  img.src = photoUrl(photo);
  img.alt = photo.filename;
  img.style.display = 'block';

  // Location
  document.getElementById('photo-location-name').textContent =
    photo.location_name || 'Unknown Location';

  // GPS
  document.getElementById('photo-coords').textContent =
    photo.latitude && photo.longitude
      ? photo.latitude.toFixed(4) + '\u00B0, ' + photo.longitude.toFixed(4) + '\u00B0'
      : 'No GPS data';

  // Camera + Lens
  document.getElementById('photo-camera').textContent = photo.camera || '\u2014';
  document.getElementById('photo-lens').textContent = photo.lens || '\u2014';

  // Exposure
  document.getElementById('photo-settings').textContent =
    photo.aperture && photo.exposure_time && photo.iso
      ? photo.aperture + '  \u2022  ' + photo.exposure_time + '  \u2022  ISO ' + photo.iso
      : '\u2014';

  // Status badge (Tailwind utilities via helper)
  setBadge(document.getElementById('photo-status'), photo.status);

  // Caption (reset when switching between photos)
  document.getElementById('caption').value = photo.caption || '';
  updateCharCount();

  // Schedule (stored and shown in UTC, matching the "Time (UTC)" label)
  var dt = parseServerDate(photo.scheduled_at);
  if (dt) {
    var iso = dt.toISOString();
    document.getElementById('schedule-date').value = iso.slice(0, 10);
    document.getElementById('schedule-time').value = iso.slice(11, 16);
  }
}


/* ================================================================
   CHAR COUNT
   ================================================================ */

function updateCharCount() {
  var caption = document.getElementById('caption');
  var count = caption.value.length;
  var el = document.getElementById('char-count');
  el.textContent = count;

  // Remove previous state classes
  el.classList.remove('char-count--warn', 'char-count--over');

  if (count > CAPTION_MAX) {
    el.classList.add('char-count--over');
  } else if (count > CAPTION_MAX * 0.9) {
    el.classList.add('char-count--warn');
  }
}


/* ================================================================
   HASHTAGS
   ================================================================ */

function generateHashtags(photo) {
  var tags = new Set(DEFAULT_HASHTAGS);
  if (photo.location_name) {
    var loc = photo.location_name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (loc) tags.add('#' + loc);
  }
  if (photo.camera_make) {
    var make = photo.camera_make.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (make) tags.add('#' + make);
  }
  return Array.from(tags).slice(0, 10);
}

function renderHashtags(photo) {
  var container = document.getElementById('hashtag-suggestions');
  // Security: clear with replaceChildren, not innerHTML
  container.replaceChildren();

  generateHashtags(photo).forEach(function (tag) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'hashtag-chip';
    el.textContent = tag;
    el.addEventListener('click', function () {
      var caption = document.getElementById('caption');
      var val = caption.value.trim();
      caption.value = val ? val + ' ' + tag : tag;
      updateCharCount();
    });
    container.appendChild(el);
  });
}


/* ================================================================
   API UPDATE
   ================================================================ */

async function updatePhoto(patch) {
  if (!currentPhotoId) {
    showToast('Import or open a photo first', 'error');
    return false;
  }
  try {
    var res = await fetch(API_BASE + '/photos/' + encodeURIComponent(currentPhotoId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error('Update failed');
    var updated = await res.json();
    renderPhoto(updated);
    return true;
  } catch (e) {
    console.error('Failed to update photo');
    showToast('Failed to update: ' + e.message, 'error');
    return false;
  }
}


/* ================================================================
   DESTINATIONS
   ================================================================ */

function getSelectedDestinations() {
  return Array.from(document.querySelectorAll('input[name="destination"]:checked'))
    .map(function (cb) { return cb.value; });
}


/* ================================================================
   SCHEDULE / PUBLISH
   ================================================================ */

async function handleSchedule() {
  var date = document.getElementById('schedule-date').value;
  var time = document.getElementById('schedule-time').value;
  if (!date || !time) {
    showToast('Please select both date and time', 'error');
    return;
  }

  var scheduledAt = new Date(date + 'T' + time + ':00Z').toISOString();
  var caption = document.getElementById('caption').value.trim();
  var destinations = getSelectedDestinations();

  if (destinations.length === 0) {
    showToast('Select at least one destination', 'error');
    return;
  }

  var ok = await updatePhoto({
    caption: caption || null,
    status: 'scheduled',
    scheduled_at: scheduledAt,
    destinations: destinations.join(',')
  });
  if (ok) showToast('Post scheduled successfully', 'success');
}

async function handlePublishNow() {
  if (!currentPhotoId) {
    showToast('Import or open a photo first', 'error');
    return;
  }

  var caption = document.getElementById('caption').value.trim();
  var destinations = getSelectedDestinations();

  if (destinations.length === 0) {
    showToast('Select at least one destination', 'error');
    return;
  }

  var btn = document.getElementById('publish-now-btn');
  btn.disabled = true;
  var originalHTML = btn.innerHTML;
  btn.textContent = 'Publishing...';

  try {
    var res = await fetch(API_BASE + '/photos/' + encodeURIComponent(currentPhotoId) + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: caption || null,
        destinations: destinations.join(',')
      })
    });

    if (res.status === 409) {
      showToast('This photo is already published', 'error');
      return;
    }

    var data = await res.json();

    if (!res.ok) {
      showToast('Publish failed: ' + (data.detail || 'Unknown error'), 'error');
      return;
    }

    renderPhoto(data);
    showToast('Published successfully!', 'success');
  } catch (e) {
    console.error('Failed to publish', e);
    showToast('Network error during publish', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}


/* ================================================================
   IMPORT / UPLOAD
   ================================================================ */

function openImportDialog() {
  document.getElementById('import-dialog').showModal();
}

async function handleImport(file) {
  var formData = new FormData();
  formData.append('file', file);

  showToast('Uploading ' + file.name + '...', 'info');

  try {
    var res = await fetch(API_BASE + '/photos/upload', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    var photo = await res.json();
    showToast('Photo imported!', 'success');
    // Navigate to the new photo after a short delay for the toast to show
    setTimeout(function () {
      window.location.href = '/v2/?id=' + encodeURIComponent(photo.id);
    }, 800);
  } catch (e) {
    console.error('Upload failed');
    showToast('Upload failed: ' + e.message, 'error');
  }
}


/* ================================================================
   DRAG & DROP
   ================================================================ */

function setupDragDrop() {
  // Prevent default on the whole document to avoid browser file-open
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) { e.preventDefault(); });

  // Main preview dropzone
  attachDropzone('photo-preview');

  // Import dialog dropzone
  attachDropzone('import-dropzone');
}

function attachDropzone(id) {
  var el = document.getElementById(id);
  if (!el) return;

  var dragCounter = 0;

  el.addEventListener('dragenter', function (e) {
    e.preventDefault();
    dragCounter++;
    el.classList.add('drag-over');
  });

  el.addEventListener('dragleave', function (e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      el.classList.remove('drag-over');
    }
  });

  el.addEventListener('dragover', function (e) {
    e.preventDefault();
  });

  el.addEventListener('drop', function (e) {
    e.preventDefault();
    dragCounter = 0;
    el.classList.remove('drag-over');

    var files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      handleImport(files[0]);
    } else {
      showToast('Please drop an image file', 'error');
    }
  });

  // Click on dropzone triggers file input
  el.addEventListener('click', function () {
    var fileInput = el.querySelector('input[type="file"]');
    if (fileInput) fileInput.click();
  });

  // Keyboard: Enter/Space triggers file input
  el.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      var fileInput = el.querySelector('input[type="file"]');
      if (fileInput) fileInput.click();
    }
  });
}


/* ================================================================
   VIEWS / NAV TABS
   Hash-based so views are linkable: /v2/#library, /v2/#settings
   ================================================================ */

var VIEWS = ['scheduler', 'library', 'settings'];

function showView(name) {
  if (VIEWS.indexOf(name) === -1) name = 'scheduler';

  document.querySelectorAll('.tab').forEach(function (t) {
    var active = t.dataset.view === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  VIEWS.forEach(function (v) {
    document.getElementById('view-' + v).hidden = v !== name;
  });

  if (name === 'library') loadLibrary();
  if (name === 'settings') loadSettings();
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      // Updating the hash triggers showView via the hashchange listener
      if (window.location.hash === '#' + tab.dataset.view) {
        showView(tab.dataset.view);
      } else {
        window.location.hash = tab.dataset.view;
      }
    });
  });
  window.addEventListener('hashchange', function () {
    showView(window.location.hash.slice(1));
  });
}


/* ================================================================
   LIBRARY (Tailwind cards - same data flow as v1)
   ================================================================ */

var libraryPhotos = [];
var libraryFilter = 'all';
var STATUS_LABELS = { draft: 'draft', scheduled: 'scheduled', published: 'published', failed: 'failed' };

async function loadLibrary() {
  var summary = document.getElementById('library-summary');
  summary.textContent = 'Loading\u2026';
  try {
    var res = await fetch(API_BASE + '/photos?limit=500');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    libraryPhotos = await res.json();
  } catch (e) {
    console.error('Failed to load library');
    summary.textContent = 'Could not load photos from the server.';
    showToast('Could not load library', 'error');
    return;
  }
  updateFilterCounts();
  renderLibrary();
}

function updateFilterCounts() {
  var counts = { all: libraryPhotos.length, draft: 0, scheduled: 0, published: 0, failed: 0 };
  libraryPhotos.forEach(function (p) {
    if (counts[p.status] !== undefined) counts[p.status]++;
  });
  document.querySelectorAll('[data-count]').forEach(function (el) {
    el.textContent = counts[el.dataset.count] || 0;
  });
  var summary = document.getElementById('library-summary');
  summary.textContent = counts.all === 1
    ? '1 photo uploaded'
    : counts.all + ' photos uploaded';
}

function renderLibrary() {
  var grid = document.getElementById('photo-grid');
  var empty = document.getElementById('library-empty');
  var emptyText = document.getElementById('library-empty-text');
  grid.replaceChildren();

  var photos = libraryFilter === 'all'
    ? libraryPhotos
    : libraryPhotos.filter(function (p) { return p.status === libraryFilter; });

  if (photos.length === 0) {
    emptyText.textContent = libraryFilter === 'all'
      ? 'No photos yet.'
      : 'No ' + libraryFilter + ' photos.';
    empty.hidden = false;
    empty.classList.remove('hidden');
    return;
  }
  empty.hidden = true;
  empty.classList.add('hidden');

  photos.forEach(function (photo, i) {
    grid.appendChild(buildPhotoCard(photo, i));
  });
}

function buildMetaRow(icon, text, mono) {
  var row = document.createElement('div');
  row.className = 'flex items-center gap-2 text-xs text-muted' + (mono ? ' font-mono' : '');
  var ic = document.createElement('span');
  ic.className = 'material-symbols-outlined text-[16px]';
  ic.setAttribute('aria-hidden', 'true');
  ic.textContent = icon;
  var tx = document.createElement('span');
  tx.className = 'truncate';
  tx.textContent = text;
  row.appendChild(ic);
  row.appendChild(tx);
  return row;
}

function buildPhotoCard(photo, index) {
  var card = document.createElement('button');
  card.type = 'button';
  card.className = 'v2-card-enter text-left rounded-md border border-line bg-surface p-4 grid gap-3 hover:border-muted transition shadow-[0_1px_2px_rgba(0,0,0,0.3)] focus-visible:shadow-focus';
  card.id = 'photo-card-' + photo.id;
  card.style.animationDelay = Math.min(index * 40, 400) + 'ms';
  card.setAttribute('aria-label', 'Open ' + photo.filename + ' (' + photo.status + ')');

  var thumb = document.createElement('div');
  thumb.className = 'overflow-hidden rounded-sm aspect-[4/3] bg-bg';
  var img = document.createElement('img');
  img.src = photoUrl(photo);
  img.alt = '';
  img.loading = 'lazy';
  img.className = 'w-full h-full object-cover';
  thumb.appendChild(img);

  // Badge lives in the caption row below the photo, never overlaid on it.
  var badge = document.createElement('span');
  var status = STATUS_LABELS[photo.status] ? photo.status : 'draft';
  badge.className = badgeClasses(status) + ' shrink-0';
  var dot = document.createElement('span');
  dot.className = dotClasses(status);
  dot.setAttribute('aria-hidden', 'true');
  var label = document.createElement('span');
  label.textContent = photo.status;
  badge.replaceChildren();
  badge.appendChild(dot);
  badge.appendChild(label);

  var body = document.createElement('div');
  body.className = 'grid gap-1.5 min-w-0';
  var topline = document.createElement('div');
  topline.className = 'flex items-center justify-between gap-2 min-w-0';
  var title = document.createElement('div');
  title.className = 'text-sm font-medium truncate';
  title.textContent = photo.filename;
  topline.appendChild(title);
  topline.appendChild(badge);
  body.appendChild(topline);
  body.appendChild(buildMetaRow('location_on', photo.location_name || 'Unknown location'));
  body.appendChild(buildMetaRow('upload', 'Uploaded ' + formatDate(photo.created_at), true));
  // Monospaced GPS coordinates (dashboard requirement)
  var gps = (photo.latitude != null && photo.longitude != null)
    ? photo.latitude.toFixed(4) + '\u00B0, ' + photo.longitude.toFixed(4) + '\u00B0'
    : 'No GPS data';
  body.appendChild(buildMetaRow('gps_fixed', gps, true));
  if (photo.status === 'scheduled' && photo.scheduled_at) {
    body.appendChild(buildMetaRow('schedule', 'Scheduled ' + formatDate(photo.scheduled_at), true));
  }
  if (photo.status === 'published' && photo.published_at) {
    body.appendChild(buildMetaRow('send', 'Published ' + formatDate(photo.published_at), true));
  }

  card.appendChild(thumb);
  card.appendChild(body);
  card.addEventListener('click', function () { openPhoto(photo.id); });
  return card;
}

function setupLibraryFilters() {
  document.querySelectorAll('.filter-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      libraryFilter = chip.dataset.status;
      document.querySelectorAll('.filter-chip').forEach(function (c) {
        c.classList.toggle('active', c === chip);
        c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
      });
      renderLibrary();
    });
  });
}

/** Open a photo from the library in the scheduler view. */
async function openPhoto(id) {
  var photo = await fetchPhoto(id);
  if (!photo) return;
  renderPhoto(photo);
  renderHashtags(photo);
  history.replaceState(null, '', '/v2/?id=' + encodeURIComponent(id) + '#scheduler');
  showView('scheduler');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ================================================================
   SETTINGS (includes Instagram connect state for OAuth)
   ================================================================ */

async function loadSettings() {
  var apiEl = document.getElementById('settings-api');
  var countEl = document.getElementById('settings-count');
  try {
    var res = await fetch('/health');
    var ok = res.ok && (await res.json()).status === 'ok';
    setBadge(apiEl, ok ? 'published' : 'failed', ok ? 'online' : 'error');
  } catch (e) {
    setBadge(apiEl, 'failed', 'offline');
  }
  try {
    var r = await fetch(API_BASE + '/photos?limit=500');
    countEl.textContent = r.ok ? String((await r.json()).length) : '\u2014';
  } catch (e) {
    countEl.textContent = '\u2014';
  }

  // OAuth redirect lands at /v2/#settings?ig=connected (or ?ig=connected).
  // Flip the Instagram badge without a backend call.
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('ig') === 'connected') {
      var igEl = document.getElementById('settings-ig');
      if (igEl) setBadge(igEl, 'published', 'connected');
    }
  } catch (e) { /* ignore */ }
}


/* ================================================================
   INIT
   ================================================================ */

function init() {
  setupTabs();
  setupLibraryFilters();
  setupDragDrop();

  document.getElementById('library-refresh').addEventListener('click', loadLibrary);
  document.getElementById('library-import-btn').addEventListener('click', openImportDialog);

  // Initial view from URL hash (e.g. /v2/#library)
  showView(window.location.hash.slice(1) || 'scheduler');

  var photoId = getPhotoIdFromUrl();
  if (photoId) {
    fetchPhoto(photoId).then(function (photo) {
      if (photo) {
        renderPhoto(photo);
        renderHashtags(photo);
      }
    });
  }

  // Caption char count
  document.getElementById('caption').addEventListener('input', updateCharCount);

  // Schedule / Publish buttons
  document.getElementById('schedule-btn').addEventListener('click', handleSchedule);
  document.getElementById('publish-now-btn').addEventListener('click', handlePublishNow);

  // Import dialog
  document.getElementById('import-btn').addEventListener('click', openImportDialog);

  // Also allow clicking the empty preview area to trigger import
  document.getElementById('photo-preview').addEventListener('click', function () {
    if (document.getElementById('photo-preview').classList.contains('photo-preview--empty')) {
      openImportDialog();
    }
  });

  // Dialog cancel button
  document.getElementById('import-cancel').addEventListener('click', function () {
    document.getElementById('import-dialog').close('cancel');
  });

  // File input change - enable/disable import button
  document.getElementById('import-file').addEventListener('change', function (e) {
    var submit = document.getElementById('import-submit');
    submit.disabled = !e.target.files[0];
  });

  // Dialog import button
  document.getElementById('import-submit').addEventListener('click', function () {
    var file = document.getElementById('import-file').files[0];
    if (!file) {
      showToast('Please select a file first', 'error');
      return;
    }
    document.getElementById('import-dialog').close('import');
  });

  // Handle dialog close
  document.getElementById('import-dialog').addEventListener('close', function () {
    if (document.getElementById('import-dialog').returnValue === 'import') {
      var file = document.getElementById('import-file').files[0];
      if (file) handleImport(file);
    }
  });

  // Set default date to today
  var today = new Date().toISOString().split('T')[0];
  document.getElementById('schedule-date').value = today;
}

document.addEventListener('DOMContentLoaded', init);
