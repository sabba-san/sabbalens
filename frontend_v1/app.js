const API_BASE = '/api/v1';

let currentPhotoId = null;
const DEFAULT_HASHTAGS = ['#landscape', '#photography', '#nature', '#travel', '#shotonsony'];

function getPhotoIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function fetchPhoto(id) {
  try {
    const res = await fetch(`${API_BASE}/photos/${id}`);
    if (!res.ok) throw new Error('Photo not found');
    return await res.json();
  } catch (e) {
    console.error('Failed to fetch photo:', e);
    return null;
  }
}

function renderPhoto(photo) {
  currentPhotoId = photo.id;
  document.title = `Sabbalens — ${photo.filename}`;

  document.getElementById('photo-location-name').textContent = photo.location_name || 'Unknown Location';
  document.getElementById('photo-coords').textContent = 
    photo.latitude && photo.longitude 
      ? `${photo.latitude.toFixed(4)}°, ${photo.longitude.toFixed(4)}°`
      : 'No GPS data';

  document.getElementById('photo-camera').textContent = photo.camera_model || '—';
  document.getElementById('photo-lens').textContent = photo.lens_model || '—';
  document.getElementById('photo-settings').textContent = 
    photo.aperture && photo.shutter_speed && photo.iso 
      ? `ƒ/${photo.aperture} | ${photo.shutter_speed}s | ISO ${photo.iso}`
      : '—';

  const img = document.getElementById('photo-img');
  img.src = `/uploads/${photo.file_path.split('/').pop()}`;
  img.alt = photo.filename;

  if (photo.caption) {
    document.getElementById('caption').value = photo.caption;
    updateCharCount();
  }

  if (photo.status === 'scheduled' && photo.scheduled_at) {
    const dt = new Date(photo.scheduled_at);
    document.getElementById('schedule-date').value = dt.toISOString().split('T')[0];
    document.getElementById('schedule-time').value = dt.toTimeString().slice(0,5);
  }
}

function updateCharCount() {
  const caption = document.getElementById('caption');
  const count = caption.value.length;
  document.getElementById('char-count').textContent = count;
  if (count > 2200) {
    document.getElementById('char-count').style.color = 'var(--color-error)';
  } else {
    document.getElementById('char-count').style.color = '';
  }
}

function generateHashtags(photo) {
  const tags = new Set(DEFAULT_HASHTAGS);
  if (photo.location_name) {
    const loc = photo.location_name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (loc) tags.add(`#${loc}`);
  }
  if (photo.camera_make) {
    const make = photo.camera_make.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (make) tags.add(`#${make}`);
  }
  return Array.from(tags).slice(0, 10);
}

function renderHashtags(photo) {
  const container = document.getElementById('hashtag-suggestions');
  container.innerHTML = '';
  generateHashtags(photo).forEach(tag => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hashtag-chip';
    el.textContent = tag;
    el.addEventListener('click', () => {
      const caption = document.getElementById('caption');
      const val = caption.value.trim();
      caption.value = val ? `${val} ${tag}` : tag;
      updateCharCount();
    });
    container.appendChild(el);
  });
}

async function updatePhoto(patch) {
  if (!currentPhotoId) return false;
  try {
    const res = await fetch(`${API_BASE}/photos/${currentPhotoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error('Update failed');
    const updated = await res.json();
    renderPhoto(updated);
    return true;
  } catch (e) {
    console.error('Failed to update photo:', e);
    alert('Failed to update: ' + e.message);
    return false;
  }
}

function getSelectedDestinations() {
  return Array.from(document.querySelectorAll('input[name="destination"]:checked'))
    .map(cb => cb.value);
}

async function handleSchedule() {
  const date = document.getElementById('schedule-date').value;
  const time = document.getElementById('schedule-time').value;
  if (!date || !time) {
    alert('Please select both date and time');
    return;
  }
  const scheduledAt = new Date(`${date}T${time}:00Z`).toISOString();
  const caption = document.getElementById('caption').value.trim();
  const destinations = getSelectedDestinations();

  const ok = await updatePhoto({
    caption: caption || null,
    status: 'scheduled',
    scheduled_at: scheduledAt,
    destinations: destinations.join(',')
  });
  if (ok) alert('Post scheduled!');
}

async function handlePublishNow() {
  const caption = document.getElementById('caption').value.trim();
  const destinations = getSelectedDestinations();

  const ok = await updatePhoto({
    caption: caption || null,
    status: 'published',
    published_at: new Date().toISOString(),
    destinations: destinations.join(',')
  });
  if (ok) alert('Published!');
}

function openImportDialog() {
  document.getElementById('import-dialog').showModal();
}

async function handleImport(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/photos/upload`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    const photo = await res.json();
    window.location.href = `/?id=${photo.id}`;
  } catch (e) {
    console.error('Upload failed:', e);
    alert('Upload failed: ' + e.message);
  }
}

function init() {
  const photoId = getPhotoIdFromUrl();
  if (photoId) {
    fetchPhoto(photoId).then(photo => {
      if (photo) {
        renderPhoto(photo);
        renderHashtags(photo);
      }
    });
  }

  document.getElementById('caption').addEventListener('input', updateCharCount);

  document.getElementById('schedule-btn').addEventListener('click', handleSchedule);
  document.getElementById('publish-now-btn').addEventListener('click', handlePublishNow);

  document.getElementById('import-btn').addEventListener('click', openImportDialog);
  document.getElementById('import-dialog').addEventListener('close', () => {
    if (document.getElementById('import-dialog').returnValue === 'import') {
      const file = document.getElementById('import-file').files[0];
      if (file) handleImport(file);
    }
  });
  document.getElementById('import-submit').addEventListener('click', () => {
    const file = document.getElementById('import-file').files[0];
    if (!file) return;
    document.getElementById('import-dialog').close('import');
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      document.getElementById('import-submit').disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', init);