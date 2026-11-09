/* ================================================================
   SABBALENS v2.1 - Studio Staging & Telegram Publisher Frontend
   Vanilla JS, zero build steps.
   Features:
   - Interactive OpenStreetMap (Leaflet.js)
   - Real-time Telegram WYSIWYG Message Simulator
   - Multi-file Filmstrip Batch Upload
   - Bulk Staggered Scheduling
   - Keyboard Navigation (J/K, Arrows, Cmd+Enter)
   ================================================================ */

const API_BASE = '/api/v1';

let currentPhotoId = null;
let currentPhoto = null;
let allPhotos = [];
let selectedPhotoIds = new Set();
let mapInstance = null;
let mapMarker = null;
let showPublishedInFilmstrip = false;

const CAPTION_MAX = 1024;
const TOAST_DURATION_MS = 4000;

/* ================================================================
   BADGES & STATUS
   ================================================================ */

const BADGE_BASE = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-medium ';
const DOT_BASE = 'w-1.5 h-1.5 rounded-full ';

function badgeClasses(status) {
  switch (status) {
    case 'scheduled':
      return BADGE_BASE + 'text-warn bg-[rgba(245,158,11,0.15)] border border-warn/30';
    case 'published':
      return BADGE_BASE + 'text-ok bg-[rgba(34,197,94,0.15)] border border-ok/30';
    case 'failed':
      return BADGE_BASE + 'text-err bg-[rgba(239,68,68,0.15)] border border-err/30';
    case 'draft':
    default:
      return BADGE_BASE + 'text-muted border border-line bg-bg/80';
  }
}

function dotClasses(status) {
  switch (status) {
    case 'scheduled': return DOT_BASE + 'bg-warn';
    case 'published': return DOT_BASE + 'bg-ok';
    case 'failed': return DOT_BASE + 'bg-err';
    case 'draft':
    default: return DOT_BASE + 'bg-muted';
  }
}

function setBadge(el, status, label) {
  if (!el) return;
  const safe = ['draft', 'scheduled', 'published', 'failed'].includes(status) ? status : 'draft';
  el.className = badgeClasses(safe);
  el.replaceChildren();
  const dot = document.createElement('span');
  dot.className = dotClasses(safe);
  const text = document.createElement('span');
  text.textContent = label || safe;
  el.appendChild(dot);
  el.appendChild(text);
}

/* ================================================================
   TOAST NOTIFICATIONS
   ================================================================ */

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

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

  const timer = setTimeout(() => dismissToast(toast), TOAST_DURATION_MS);
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    dismissToast(toast);
  });
}

function dismissToast(el) {
  el.classList.add('toast--exiting');
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

/* ================================================================
   DATE & URL HELPERS
   ================================================================ */

function parseServerDate(value) {
  if (!value) return null;
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  const d = new Date(hasTz ? value : value + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = parseServerDate(value);
  if (!d) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function photoUrl(photo) {
  if (!photo || !photo.file_path) return '';
  return '/uploads/' + encodeURIComponent(photo.file_path.split('/').pop());
}

/* ================================================================
   OPENSTREETMAP (LEAFLET INTEGRATION)
   ================================================================ */

function renderMap(lat, lon) {
  const mapContainer = document.getElementById('photo-map');
  const emptyPlaceholder = document.getElementById('map-empty-placeholder');
  if (!mapContainer) return;

  if (lat != null && lon != null && typeof L !== 'undefined') {
    mapContainer.classList.remove('hidden');
    if (emptyPlaceholder) emptyPlaceholder.classList.add('hidden');

    if (!mapInstance) {
      mapInstance = L.map('photo-map', {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      }).setView([lat, lon], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(mapInstance);

      // Custom focus reticle pin icon
      const reticleIcon = L.divIcon({
        className: 'custom-reticle-marker',
        html: '<div style="width:20px;height:20px;border:2px solid #FF2B2B;border-radius:50%;background:rgba(255,43,43,0.3);display:flex;align-items:center;justify-content:center;"><div style="width:6px;height:6px;background:#FAFAFA;border-radius:50%;"></div></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      mapMarker = L.marker([lat, lon], { icon: reticleIcon }).addTo(mapInstance);
    } else {
      mapInstance.setView([lat, lon], 12);
      if (mapMarker) mapMarker.setLatLng([lat, lon]);
    }

    setTimeout(() => {
      if (mapInstance) mapInstance.invalidateSize();
    }, 200);
  } else {
    mapContainer.classList.add('hidden');
    if (emptyPlaceholder) emptyPlaceholder.classList.remove('hidden');
  }
}

/* ================================================================
   TELEGRAM CAPTION COMPOSITION & LIVE SIMULATOR
   ================================================================ */

function assembleTelegramCaption(photo) {
  if (!photo) return document.getElementById('caption')?.value || '';
  const userText = (document.getElementById('caption')?.value || '').trim();
  const includeLoc = document.getElementById('toggle-location')?.checked;
  const includeCam = document.getElementById('toggle-camera')?.checked;
  const includeExp = document.getElementById('toggle-settings')?.checked;

  const sections = [];
  if (userText) sections.push(userText);

  const metaLines = [];
  if (includeLoc && photo.location_name) {
    metaLines.push('📍 ' + photo.location_name);
  }

  if (includeCam && (photo.camera || photo.lens)) {
    const parts = [];
    if (photo.camera) parts.push(photo.camera);
    if (photo.lens) parts.push(photo.lens);
    metaLines.push('📷 ' + parts.join(' • '));
  }

  if (includeExp) {
    const specs = [];
    if (photo.focal_length) specs.push(photo.focal_length);
    if (photo.aperture) specs.push('f/' + photo.aperture);
    if (photo.exposure_time) specs.push(photo.exposure_time + 's');
    if (photo.iso) specs.push('ISO ' + photo.iso);
    if (specs.length) metaLines.push('⚙️ ' + specs.join(' | '));
  }

  if (metaLines.length) {
    sections.push(metaLines.join('\n'));
  }

  return sections.join('\n\n');
}

function updateTelegramSimulator() {
  const photo = currentPhoto;
  const fullCaption = assembleTelegramCaption(photo);

  // Update simulator elements
  const captionEl = document.getElementById('tele-bubble-caption');
  if (captionEl) {
    captionEl.textContent = fullCaption || 'Your post caption and telemetry will appear here...';
  }

  const bubbleImg = document.getElementById('tele-bubble-img');
  const noImg = document.getElementById('tele-bubble-noimg');
  if (photo && photo.file_path) {
    if (bubbleImg) {
      bubbleImg.src = photoUrl(photo);
      bubbleImg.style.display = 'block';
    }
    if (noImg) noImg.style.display = 'none';
  } else {
    if (bubbleImg) bubbleImg.style.display = 'none';
    if (noImg) noImg.style.display = 'block';
  }

  // Update character count
  const count = fullCaption.length;
  const charEl = document.getElementById('char-count');
  const wrapEl = document.getElementById('char-count-wrap');
  if (charEl) charEl.textContent = count;
  if (wrapEl) {
    wrapEl.classList.remove('char-count--warn', 'char-count--over');
    if (count > CAPTION_MAX) wrapEl.classList.add('char-count--over');
    else if (count > CAPTION_MAX * 0.9) wrapEl.classList.add('char-count--warn');
  }

  const timeEl = document.getElementById('tele-bubble-time');
  if (timeEl) {
    const now = new Date();
    timeEl.textContent = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  }
}

/* ================================================================
   RENDER ACTIVE PHOTO IN STUDIO
   ================================================================ */

function renderPhoto(photo) {
  if (!photo) return;
  currentPhotoId = photo.id;
  currentPhoto = photo;
  document.title = 'Sabbalens — ' + photo.filename;

  // Viewport
  const preview = document.getElementById('photo-preview');
  const emptyState = document.getElementById('stage-empty-state');
  const img = document.getElementById('photo-img');
  const fileInfo = document.getElementById('stage-file-info');
  const filenameEl = document.getElementById('stage-filename');

  if (emptyState) emptyState.style.display = 'none';
  if (img) {
    img.src = photoUrl(photo);
    img.alt = photo.filename;
    img.style.display = 'block';
  }
  if (fileInfo) fileInfo.classList.remove('hidden');
  document.getElementById('stage-actions')?.classList.remove('hidden');
  if (filenameEl) filenameEl.textContent = photo.filename;

  // Status Badge
  setBadge(document.getElementById('photo-status'), photo.status);

  // Location & Coords
  const locEl = document.getElementById('photo-location-name');
  if (locEl) locEl.textContent = photo.location_name || 'No location resolved';
  const coordsEl = document.getElementById('photo-coords');
  if (coordsEl) {
    coordsEl.textContent = (photo.latitude && photo.longitude)
      ? `${photo.latitude.toFixed(4)}°, ${photo.longitude.toFixed(4)}°`
      : 'No GPS data in EXIF';
  }

  // Map
  renderMap(photo.latitude, photo.longitude);

  // EXIF Telemetry
  const camEl = document.getElementById('photo-camera');
  if (camEl) camEl.textContent = photo.camera || '—';
  const lensEl = document.getElementById('photo-lens');
  if (lensEl) lensEl.textContent = photo.lens || '—';

  const focalApertureEl = document.getElementById('photo-focal-aperture');
  if (focalApertureEl) {
    const f = photo.focal_length ? photo.focal_length : '';
    const a = photo.aperture ? `f/${photo.aperture}` : '';
    focalApertureEl.textContent = [f, a].filter(Boolean).join(' • ') || '—';
  }

  const shutterIsoEl = document.getElementById('photo-shutter-iso');
  if (shutterIsoEl) {
    const s = photo.exposure_time ? `${photo.exposure_time}s` : '';
    const i = photo.iso ? `ISO ${photo.iso}` : '';
    shutterIsoEl.textContent = [s, i].filter(Boolean).join(' • ') || '—';
  }

  // Banners
  const schedBanner = document.getElementById('scheduled-banner');
  const schedText = document.getElementById('scheduled-banner-text');
  const pubBanner = document.getElementById('published-banner');
  const pubText = document.getElementById('published-banner-text');
  const pubMediaId = document.getElementById('published-media-id');

  if (photo.status === 'scheduled') {
    if (schedBanner) schedBanner.classList.remove('hidden');
    if (schedText) {
      schedText.textContent = `Scheduled for ${formatDate(photo.scheduled_at)} (UTC).`;
    }
    if (pubBanner) pubBanner.classList.add('hidden');
  } else if (photo.status === 'published') {
    if (pubBanner) pubBanner.classList.remove('hidden');
    if (pubText) pubText.textContent = `Published on ${formatDate(photo.published_at)}`;
    if (pubMediaId) {
      pubMediaId.textContent = photo.telegram_message_id ? `Msg #${photo.telegram_message_id}` : '';
    }
    if (schedBanner) schedBanner.classList.add('hidden');
  } else {
    if (schedBanner) schedBanner.classList.add('hidden');
    if (pubBanner) pubBanner.classList.add('hidden');
  }

  // Caption input
  const captionInput = document.getElementById('caption');
  if (captionInput) {
    captionInput.value = photo.caption || '';
  }

  // Schedule date/time
  const dt = parseServerDate(photo.scheduled_at);
  if (dt) {
    const iso = dt.toISOString();
    document.getElementById('schedule-date').value = iso.slice(0, 10);
    document.getElementById('schedule-time').value = iso.slice(11, 16);
  } else {
    document.getElementById('schedule-date').value = '';
    document.getElementById('schedule-time').value = '';
  }

  // Update Telegram Simulator
  updateTelegramSimulator();

  // Highlight in filmstrip
  updateFilmstripActive(photo.id);
}

/* ================================================================
   FILMSTRIP COMPONENT (QUEUE & BATCH UPLOAD)
   ================================================================ */

function renderFilmstrip() {
  const container = document.getElementById('photo-filmstrip');
  const countEl = document.getElementById('filmstrip-count');
  if (!container) return;

  container.replaceChildren();

  // Add "+ Upload" Tile
  const addTile = document.createElement('div');
  addTile.id = 'filmstrip-dropzone';
  addTile.className = 'flex-shrink-0 w-20 h-20 rounded-md border border-dashed border-line hover:border-accent flex flex-col items-center justify-center text-xs text-muted cursor-pointer transition select-none bg-bg/50';
  addTile.innerHTML = `
    <span class="material-symbols-outlined text-[20px] text-accent">add_photo_alternate</span>
    <span class="text-[10px] mt-0.5">+ Add</span>
  `;
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.className = 'sr-only';
  fileInput.addEventListener('change', (e) => handleFilesUpload(e.target.files));
  addTile.appendChild(fileInput);
  addTile.addEventListener('click', () => fileInput.click());
  container.appendChild(addTile);

  const visible = filmstripPhotos();
  const postedCount = allPhotos.filter(p => p.status === 'published').length;
  if (countEl) {
    countEl.textContent = showPublishedInFilmstrip
      ? `${visible.length} photos`
      : `${visible.length} pending`;
  }
  const toggleBtn = document.getElementById('filmstrip-toggle-published');
  if (toggleBtn) {
    toggleBtn.textContent = showPublishedInFilmstrip ? `Hide posted (${postedCount})` : `Show posted (${postedCount})`;
    toggleBtn.setAttribute('aria-pressed', String(showPublishedInFilmstrip));
  }

  // Render thumbnails
  visible.forEach((photo) => {
    const card = document.createElement('div');
    card.dataset.id = photo.id;
    const isActive = photo.id === currentPhotoId;
    card.className = `flex-shrink-0 w-20 h-20 rounded-md border overflow-hidden relative cursor-pointer group transition ${
      isActive ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-muted'
    }`;

    const thumb = document.createElement('img');
    thumb.src = photoUrl(photo);
    thumb.alt = photo.filename;
    thumb.className = 'w-full h-full object-cover';
    card.appendChild(thumb);

    // Status dot overlay
    const dot = document.createElement('span');
    dot.className = `absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${dotClasses(photo.status)} shadow`;
    card.appendChild(dot);

    card.addEventListener('click', () => {
      renderPhoto(photo);
    });

    container.appendChild(card);
  });
}

function filmstripPhotos() {
  return showPublishedInFilmstrip ? allPhotos : allPhotos.filter(p => p.status !== 'published');
}

// After the photo list changes, select the photo at the same filmstrip position
// as `prevId` was (or the last one), or reset the stage if the queue is empty.
function selectAdjacent(prevIndex) {
  const list = filmstripPhotos();
  if (!list.length) {
    resetStage();
    return;
  }
  const idx = Math.min(Math.max(prevIndex, 0), list.length - 1);
  renderPhoto(list[idx]);
}

function resetStage() {
  currentPhotoId = null;
  currentPhoto = null;
  document.title = 'Sabbalens - Scheduler';
  const img = document.getElementById('photo-img');
  if (img) { img.style.display = 'none'; img.src = ''; }
  const emptyState = document.getElementById('stage-empty-state');
  if (emptyState) emptyState.style.display = '';
  document.getElementById('stage-file-info')?.classList.add('hidden');
  document.getElementById('stage-actions')?.classList.add('hidden');
  document.getElementById('scheduled-banner')?.classList.add('hidden');
  document.getElementById('published-banner')?.classList.add('hidden');
  setBadge(document.getElementById('photo-status'), 'draft');
  const captionInput = document.getElementById('caption');
  if (captionInput) captionInput.value = '';
  updateTelegramSimulator();
}

function updateFilmstripActive(activeId) {
  const container = document.getElementById('photo-filmstrip');
  if (!container) return;
  container.querySelectorAll('div[data-id]').forEach((el) => {
    if (el.dataset.id === String(activeId)) {
      el.className = 'flex-shrink-0 w-20 h-20 rounded-md border border-accent ring-2 ring-accent/30 overflow-hidden relative cursor-pointer transition';
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      el.className = 'flex-shrink-0 w-20 h-20 rounded-md border border-line hover:border-muted overflow-hidden relative cursor-pointer transition';
    }
  });
}

/* ================================================================
   BATCH UPLOAD HANDLER
   ================================================================ */

async function handleFilesUpload(files) {
  if (!files || !files.length) return;
  showToast(`Uploading ${files.length} photo(s)...`, 'info');

  let successCount = 0;
  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/photos/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        successCount++;
        const newPhoto = await res.json();
        allPhotos.unshift(newPhoto);
      }
    } catch (e) {
      console.error('Failed to upload file:', file.name, e);
    }
  }

  showToast(`Uploaded ${successCount} of ${files.length} photo(s).`, successCount > 0 ? 'success' : 'error');
  await loadPhotos();
  if (filmstripPhotos().length > 0) {
    renderPhoto(filmstripPhotos()[0]);
  }
}

/* ================================================================
   LOAD & MANAGE PHOTOS
   ================================================================ */

async function loadPhotos() {
  try {
    const res = await fetch(`${API_BASE}/photos?limit=200`);
    if (!res.ok) return;
    allPhotos = await res.json();
    renderFilmstrip();
    renderLibraryGrid();
  } catch (e) {
    console.error('Failed to load photos', e);
  }
}

/* ================================================================
   LIBRARY VIEW & BULK ACTIONS
   ================================================================ */

function renderLibraryGrid() {
  const grid = document.getElementById('photo-grid');
  const empty = document.getElementById('library-empty');
  const summary = document.getElementById('library-summary');
  if (!grid) return;

  grid.replaceChildren();

  // Apply filters
  const activeFilter = document.querySelector('#library-filters .filter-chip.active')?.dataset.status || 'all';
  const searchTerm = (document.getElementById('library-search')?.value || '').toLowerCase().trim();

  let filtered = allPhotos;
  if (activeFilter !== 'all') {
    filtered = filtered.filter(p => p.status === activeFilter);
  }
  if (searchTerm) {
    filtered = filtered.filter(p =>
      (p.filename && p.filename.toLowerCase().includes(searchTerm)) ||
      (p.location_name && p.location_name.toLowerCase().includes(searchTerm)) ||
      (p.camera && p.camera.toLowerCase().includes(searchTerm)) ||
      (p.caption && p.caption.toLowerCase().includes(searchTerm))
    );
  }

  if (summary) {
    summary.textContent = `Showing ${filtered.length} of ${allPhotos.length} total photos`;
  }

  // Counts
  const counts = { all: allPhotos.length, draft: 0, scheduled: 0, published: 0, failed: 0 };
  allPhotos.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
  Object.keys(counts).forEach(k => {
    const el = document.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = counts[k];
  });

  if (!filtered.length) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  filtered.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'group relative rounded-lg border border-line bg-surface overflow-hidden flex flex-col hover:border-muted transition';

    const isSelected = selectedPhotoIds.has(photo.id);

    // Image container
    const imgWrap = document.createElement('div');
    imgWrap.className = 'relative h-44 bg-bg overflow-hidden cursor-pointer';
    const img = document.createElement('img');
    img.src = photoUrl(photo);
    img.alt = photo.filename;
    img.className = 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-200';
    imgWrap.appendChild(img);

    // Multi-select checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isSelected;
    cb.className = 'absolute top-2.5 left-2.5 w-4 h-4 accent-accent rounded z-10 cursor-pointer shadow';
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', (e) => {
      if (e.target.checked) selectedPhotoIds.add(photo.id);
      else selectedPhotoIds.delete(photo.id);
      updateBulkActionBar();
    });
    imgWrap.appendChild(cb);

    // Status pill
    const statusPill = document.createElement('span');
    statusPill.className = `absolute top-2.5 right-2.5 ${badgeClasses(photo.status)} shadow`;
    statusPill.textContent = photo.status;
    imgWrap.appendChild(statusPill);

    imgWrap.addEventListener('click', () => {
      renderPhoto(photo);
      switchView('scheduler');
    });

    card.appendChild(imgWrap);

    // Meta details footer
    const info = document.createElement('div');
    info.className = 'p-3 flex-1 flex flex-col justify-between text-xs space-y-1.5';
    info.innerHTML = `
      <div class="flex items-center justify-between font-mono text-[11px] text-muted">
        <span class="truncate max-w-[140px] text-fg">${photo.filename}</span>
        <span>${formatDate(photo.created_at)}</span>
      </div>
      <div class="flex items-center gap-1 text-muted text-[11px] truncate">
        <span class="material-symbols-outlined text-[13px] text-accent">pin_drop</span>
        <span>${photo.location_name || 'No location'}</span>
      </div>
    `;

    card.appendChild(info);
    grid.appendChild(card);
  });
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulk-action-bar');
  const countEl = document.getElementById('bulk-selected-count');
  if (!bar) return;

  const count = selectedPhotoIds.size;
  if (count > 0) {
    bar.classList.remove('hidden');
    if (countEl) countEl.textContent = count;
  } else {
    bar.classList.add('hidden');
  }
}

/* ================================================================
   PUBLISHING & SCHEDULING LOGIC
   ================================================================ */

async function publishNow() {
  if (!currentPhotoId) {
    showToast('Select a photo first', 'error');
    return;
  }

  const btn = document.getElementById('publish-now-btn');
  if (btn) btn.disabled = true;

  const finalCaption = assembleTelegramCaption(currentPhoto);

  try {
    const res = await fetch(`${API_BASE}/photos/${currentPhotoId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: finalCaption,
        destinations: 'telegram',
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(`Publish failed: ${err.detail || 'Error'}`, 'error');
      return;
    }

    const data = await res.json();
    const prevIndex = filmstripPhotos().findIndex(p => p.id === currentPhotoId);
    await loadPhotos();
    if (showPublishedInFilmstrip) {
      renderPhoto(data);
    } else {
      selectAdjacent(prevIndex);
    }

    const isSim = (data.telegram_message_id && data.telegram_message_id.startsWith('sim_tele_'));
    const mid = data.telegram_message_id ? `#${data.telegram_message_id}` : '';
    showToast(isSim ? `Published! (Simulation: ${mid})` : `Published successfully to Telegram! ${mid}`, 'success');
  } catch (e) {
    console.error('Publish error', e);
    showToast('Network error during publish', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function schedulePost() {
  if (!currentPhotoId) {
    showToast('Select a photo first', 'error');
    return;
  }

  const dateVal = document.getElementById('schedule-date').value;
  const timeVal = document.getElementById('schedule-time').value;

  if (!dateVal || !timeVal) {
    showToast('Please set both date and time (UTC)', 'error');
    return;
  }

  const isoString = `${dateVal}T${timeVal}:00Z`;
  const finalCaption = assembleTelegramCaption(currentPhoto);

  try {
    const res = await fetch(`${API_BASE}/photos/${currentPhotoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: finalCaption,
        destinations: 'telegram',
        status: 'scheduled',
        scheduled_at: isoString,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(`Schedule failed: ${err.detail || 'Error'}`, 'error');
      return;
    }

    const data = await res.json();
    renderPhoto(data);
    await loadPhotos();
    showToast(`Post scheduled for ${formatDate(data.scheduled_at)} (UTC)`, 'success');
  } catch (e) {
    console.error('Schedule error', e);
    showToast('Network error while scheduling', 'error');
  }
}

async function cancelSchedule() {
  if (!currentPhotoId) return;
  try {
    const res = await fetch(`${API_BASE}/photos/${currentPhotoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft', scheduled_at: null }),
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(`Cancel failed: ${err.detail || 'Error'}`, 'error');
      return;
    }
    const data = await res.json();
    await loadPhotos();
    renderPhoto(data);
    showToast('Schedule cancelled. Photo reverted to draft.', 'success');
  } catch (e) {
    console.error('Cancel schedule error', e);
    showToast('Network error while cancelling schedule', 'error');
  }
}

async function deleteCurrentPhoto() {
  if (!currentPhoto) return;
  if (!confirm(`Delete "${currentPhoto.filename}" permanently? This removes the photo and its stored file.`)) return;
  const prevIndex = filmstripPhotos().findIndex(p => p.id === currentPhotoId);
  try {
    const res = await fetch(`${API_BASE}/photos/${currentPhotoId}`, { method: 'DELETE' });
    if (!res.ok) {
      showToast('Delete failed', 'error');
      return;
    }
    selectedPhotoIds.delete(currentPhotoId);
    await loadPhotos();
    selectAdjacent(prevIndex);
    showToast('Photo deleted successfully.', 'info');
  } catch (e) {
    console.error('Delete error', e);
    showToast('Network error while deleting', 'error');
  }
}

/* ================================================================
   PRESET SCHEDULER BUTTONS
   ================================================================ */

function applyPreset(preset) {
  const now = new Date();
  let target = new Date();

  if (preset === '1h') {
    target.setHours(target.getHours() + 1);
  } else if (preset === 'tonight') {
    target.setUTCHours(20, 0, 0, 0);
    if (target < now) target.setUTCDate(target.getUTCDate() + 1);
  } else if (preset === 'tomorrow') {
    target.setUTCDate(target.getUTCDate() + 1);
    target.setUTCHours(9, 0, 0, 0);
  }

  const iso = target.toISOString();
  document.getElementById('schedule-date').value = iso.slice(0, 10);
  document.getElementById('schedule-time').value = iso.slice(11, 16);
  showToast(`Preset applied: ${target.toUTCString().slice(0, 22)} UTC`, 'info');
}

/* ================================================================
   TELEGRAM BOT STATUS & SETTINGS
   ================================================================ */

async function loadSocialStatus() {
  const headerPill = document.getElementById('header-bot-pill');
  const headerLabel = document.getElementById('header-bot-label');
  const headerDot = document.getElementById('header-bot-dot');
  const settingsTele = document.getElementById('settings-telegram');
  const targetEl = document.getElementById('settings-telegram-target');
  const composerTag = document.getElementById('composer-chat-tag');

  try {
    const res = await fetch(`${API_BASE}/telegram/status`);
    if (!res.ok) return;
    const tele = await res.json();

    if (tele.mode === 'live') {
      if (headerPill) headerPill.classList.remove('hidden');
      if (headerLabel) headerLabel.textContent = `@${tele.bot_username || 'bot'}`;
      if (headerDot) headerDot.className = 'w-2 h-2 rounded-full bg-ok animate-pulse';

      if (composerTag) {
        composerTag.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-ok"></span><span>${tele.chat_id || 'post pic dazz'}</span>`;
      }

      if (targetEl && tele.chat_id) {
        targetEl.textContent = `Target: ${tele.chat_id}`;
      }

      if (settingsTele) {
        settingsTele.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-ok bg-ok/10 border border-ok/30';
        settingsTele.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-ok"></span><span>connected (@${tele.bot_username || 'live'})</span>`;
      }
    } else if (tele.mode === 'simulation') {
      if (headerPill) headerPill.classList.remove('hidden');
      if (headerLabel) headerLabel.textContent = 'Simulation Mode';
      if (headerDot) headerDot.className = 'w-2 h-2 rounded-full bg-warn';

      if (settingsTele) {
        settingsTele.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-warn bg-warn/10 border border-warn/30';
        settingsTele.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-warn"></span><span>simulation mode (testing ready)</span>';
      }
    } else {
      if (settingsTele) {
        settingsTele.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-err bg-err/10 border border-err/30';
        settingsTele.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-err"></span><span>not connected</span>';
      }
    }
  } catch (e) {
    console.error('Failed to load telegram status', e);
  }
}

async function loadSettings() {
  const apiEl = document.getElementById('settings-api');
  const countEl = document.getElementById('settings-count');

  try {
    const res = await fetch('/health');
    const ok = res.ok && (await res.json()).status === 'ok';
    setBadge(apiEl, ok ? 'published' : 'failed', ok ? 'online' : 'error');
  } catch (e) {
    setBadge(apiEl, 'failed', 'offline');
  }

  if (countEl) countEl.textContent = allPhotos.length ? String(allPhotos.length) : '0';

  await loadSocialStatus();

  // Test ping button handler
  const testBtn = document.getElementById('settings-telegram-test');
  if (testBtn && !testBtn.dataset.bound) {
    testBtn.dataset.bound = 'true';
    testBtn.onclick = async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Pinging...';
      const start = Date.now();
      try {
        const r = await fetch(`${API_BASE}/telegram/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: '🔔 Sabbalens studio connection ping: healthy!' }),
        });
        const resData = await r.json();
        const latency = Date.now() - start;
        if (r.ok) {
          showToast(resData.simulated ? 'Test ping simulated (OK)!' : `Test message sent to Telegram! (${latency}ms)`, 'success');
        } else {
          showToast(`Ping failed: ${resData.detail || 'Error'}`, 'error');
        }
      } catch (err) {
        showToast('Network error sending test ping', 'error');
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Send Test Ping';
      }
    };
  }
}

/* ================================================================
   VIEW NAVIGATION TABS
   ================================================================ */

function switchView(viewName) {
  document.querySelectorAll('header nav button').forEach(btn => {
    const isActive = btn.dataset.view === viewName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('main .view').forEach(panel => {
    panel.hidden = panel.id !== `view-${viewName}`;
  });

  if (viewName === 'scheduler') {
    setTimeout(() => {
      if (mapInstance) mapInstance.invalidateSize();
    }, 200);
  } else if (viewName === 'library') {
    renderLibraryGrid();
  } else if (viewName === 'settings') {
    loadSettings();
  }
}

/* ================================================================
   EVENT LISTENERS & INITIALIZATION
   ================================================================ */

function setupEventListeners() {
  // Navigation tabs
  document.querySelectorAll('header nav button').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Header and Stage Import buttons
  const importDialog = document.getElementById('import-dialog');
  const importSubmit = document.getElementById('import-submit');
  const importFile = document.getElementById('import-file');
  const importCancel = document.getElementById('import-cancel');

  ['header-import-btn', 'import-btn', 'library-import-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => importDialog?.showModal());
  });

  if (importFile) {
    importFile.addEventListener('change', () => {
      if (importSubmit) importSubmit.disabled = !importFile.files.length;
    });
  }

  if (importSubmit) {
    importSubmit.addEventListener('click', async () => {
      importDialog.close();
      await handleFilesUpload(importFile.files);
      importFile.value = '';
    });
  }

  if (importCancel) {
    importCancel.addEventListener('click', () => importDialog.close());
  }

  // Drag & drop onto main stage
  const previewStage = document.getElementById('photo-preview');
  if (previewStage) {
    previewStage.addEventListener('dragover', (e) => {
      e.preventDefault();
      previewStage.classList.add('drag-over');
    });
    previewStage.addEventListener('dragleave', () => previewStage.classList.remove('drag-over'));
    previewStage.addEventListener('drop', async (e) => {
      e.preventDefault();
      previewStage.classList.remove('drag-over');
      if (e.dataTransfer.files?.length) {
        await handleFilesUpload(e.dataTransfer.files);
      }
    });
  }

  // Caption inputs & metadata toggles
  const captionInput = document.getElementById('caption');
  if (captionInput) {
    captionInput.addEventListener('input', () => updateTelegramSimulator());
  }

  ['toggle-location', 'toggle-camera', 'toggle-settings'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => updateTelegramSimulator());
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  // Actions
  document.getElementById('publish-now-btn')?.addEventListener('click', publishNow);
  document.getElementById('schedule-btn')?.addEventListener('click', schedulePost);
  document.getElementById('cancel-schedule-btn')?.addEventListener('click', cancelSchedule);
  document.getElementById('delete-photo-btn')?.addEventListener('click', deleteCurrentPhoto);
  document.getElementById('filmstrip-toggle-published')?.addEventListener('click', () => {
    showPublishedInFilmstrip = !showPublishedInFilmstrip;
    renderFilmstrip();
  });

  // Library Search & Filter chips
  document.getElementById('library-search')?.addEventListener('input', () => renderLibraryGrid());
  document.getElementById('library-refresh')?.addEventListener('click', () => loadPhotos());

  document.querySelectorAll('#library-filters .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#library-filters .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderLibraryGrid();
    });
  });

  // Bulk Actions
  const bulkDialog = document.getElementById('bulk-schedule-dialog');
  const bulkSchedBtn = document.getElementById('bulk-schedule-btn');
  const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
  const bulkClearBtn = document.getElementById('bulk-clear-btn');
  const bulkConfirm = document.getElementById('bulk-dialog-confirm');
  const bulkCancel = document.getElementById('bulk-dialog-cancel');

  if (bulkClearBtn) {
    bulkClearBtn.addEventListener('click', () => {
      selectedPhotoIds.clear();
      updateBulkActionBar();
      renderLibraryGrid();
    });
  }

  if (bulkSchedBtn) {
    bulkSchedBtn.addEventListener('click', () => {
      const countEl = document.getElementById('bulk-dialog-count');
      if (countEl) countEl.textContent = selectedPhotoIds.size;

      // Default start time: current time + 1 hour
      const nextHour = new Date();
      nextHour.setHours(nextHour.getHours() + 1);
      const iso = nextHour.toISOString();
      document.getElementById('bulk-start-date').value = iso.slice(0, 10);
      document.getElementById('bulk-start-time').value = iso.slice(11, 16);

      bulkDialog?.showModal();
    });
  }

  if (bulkCancel) bulkCancel.addEventListener('click', () => bulkDialog?.close());

  if (bulkConfirm) {
    bulkConfirm.addEventListener('click', async () => {
      const dateVal = document.getElementById('bulk-start-date').value;
      const timeVal = document.getElementById('bulk-start-time').value;
      const intervalVal = parseInt(document.getElementById('bulk-interval').value, 10) || 60;

      if (!dateVal || !timeVal) {
        showToast('Please set start date and time', 'error');
        return;
      }

      const isoStart = `${dateVal}T${timeVal}:00Z`;
      bulkDialog.close();

      try {
        const res = await fetch(`${API_BASE}/photos/bulk-schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photo_ids: Array.from(selectedPhotoIds),
            start_time: isoStart,
            interval_minutes: intervalVal,
            destinations: 'telegram',
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          showToast(`Bulk schedule failed: ${err.detail || 'Error'}`, 'error');
          return;
        }

        showToast(`Scheduled ${selectedPhotoIds.size} photos spaced ${intervalVal} mins apart!`, 'success');
        selectedPhotoIds.clear();
        updateBulkActionBar();
        await loadPhotos();
      } catch (e) {
        console.error('Bulk schedule error', e);
        showToast('Network error during bulk schedule', 'error');
      }
    });
  }

  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete ${selectedPhotoIds.size} selected photo(s)? This cannot be undone.`)) return;
      let count = 0;
      for (const id of Array.from(selectedPhotoIds)) {
        try {
          const r = await fetch(`${API_BASE}/photos/${id}`, { method: 'DELETE' });
          if (r.ok) count++;
        } catch (e) { /* ignore */ }
      }
      showToast(`Deleted ${count} photo(s).`, 'info');
      selectedPhotoIds.clear();
      updateBulkActionBar();
      await loadPhotos();
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    // If typing in input or textarea, don't trigger navigation
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        publishNow();
      }
      return;
    }

    if (e.key === 'j' || e.key === 'ArrowRight') {
      stepPhoto(1);
    } else if (e.key === 'k' || e.key === 'ArrowLeft') {
      stepPhoto(-1);
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      publishNow();
    }
  });

  // Metadata Edit Dialog
  const editMetaBtn = document.getElementById('edit-meta-btn');
  const editDialog = document.getElementById('edit-meta-dialog');
  const editCancel = document.getElementById('edit-meta-cancel');
  const editSave = document.getElementById('edit-meta-save');

  if (editMetaBtn) {
    editMetaBtn.addEventListener('click', () => {
      if (!currentPhoto) return;
      document.getElementById('edit-meta-location').value = currentPhoto.location_name || '';
      document.getElementById('edit-meta-lat').value = currentPhoto.latitude || '';
      document.getElementById('edit-meta-lon').value = currentPhoto.longitude || '';
      document.getElementById('edit-meta-camera').value = currentPhoto.camera || '';
      document.getElementById('edit-meta-lens').value = currentPhoto.lens || '';
      editDialog?.showModal();
    });
  }

  if (editCancel) editCancel.addEventListener('click', () => editDialog?.close());

  if (editSave) {
    editSave.addEventListener('click', async () => {
      if (!currentPhotoId) return;
      const latRaw = document.getElementById('edit-meta-lat').value;
      const lonRaw = document.getElementById('edit-meta-lon').value;

      const payload = {
        location_name: document.getElementById('edit-meta-location').value || null,
        latitude: latRaw ? parseFloat(latRaw) : null,
        longitude: lonRaw ? parseFloat(lonRaw) : null,
        camera: document.getElementById('edit-meta-camera').value || null,
        lens: document.getElementById('edit-meta-lens').value || null,
      };

      editDialog?.close();
      try {
        const res = await fetch(`${API_BASE}/photos/${currentPhotoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          renderPhoto(updated);
          await loadPhotos();
          showToast('Metadata updated!', 'success');
        }
      } catch (e) {
        showToast('Failed to update metadata', 'error');
      }
    });
  }
}

function stepPhoto(direction) {
  const list = filmstripPhotos();
  if (!list.length) return;
  const currentIndex = list.findIndex(p => p.id === currentPhotoId);
  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = list.length - 1;
  if (nextIndex >= list.length) nextIndex = 0;
  renderPhoto(list[nextIndex]);
}

/* ================================================================
   INITIALIZATION
   ================================================================ */

async function init() {
  setupEventListeners();
  await loadPhotos();
  await loadSocialStatus();

  if (filmstripPhotos().length > 0) {
    renderPhoto(filmstripPhotos()[0]);
  }
}

document.addEventListener('DOMContentLoaded', init);
