/* ================================================================
   SABBALENS LANDING v2 - preview at /preview/, CTAs funnel to /v2/
   Live stats plus preview grid from /api/v1. No framework.
   Captions sit below images, never overlaid on them.
   ================================================================ */

const API_BASE = '/api/v1';
const PREVIEW_LIMIT = 6;

const BADGE_BASE = 'badge ';
const DOT_BASE = 'w-1.5 h-1.5 ';

function badgeClasses(status) {
  switch (status) {
    case 'scheduled': return BADGE_BASE + 'text-accent bg-[rgba(255,61,0,0.12)] border border-accent/40';
    case 'published': return BADGE_BASE + 'text-ok bg-[rgba(34,197,94,0.12)] border border-ok/30';
    case 'failed': return BADGE_BASE + 'text-err bg-[rgba(239,68,68,0.12)] border border-err/30';
    default: return BADGE_BASE + 'text-mutedFg border border-border';
  }
}

function dotClasses(status) {
  switch (status) {
    case 'scheduled': return DOT_BASE + 'bg-accent';
    case 'published': return DOT_BASE + 'bg-ok';
    case 'failed': return DOT_BASE + 'bg-err';
    default: return DOT_BASE + 'bg-mutedFg';
  }
}

function buildBadge(status, label) {
  var safe = ['draft', 'scheduled', 'published', 'failed'].indexOf(status) !== -1 ? status : 'draft';
  var badge = document.createElement('span');
  badge.className = badgeClasses(safe);
  var dot = document.createElement('span');
  dot.className = dotClasses(safe);
  dot.setAttribute('aria-hidden', 'true');
  var text = document.createElement('span');
  text.textContent = label || safe;
  badge.appendChild(dot);
  badge.appendChild(text);
  return badge;
}

function setBadge(el, status, label) {
  var fresh = buildBadge(status, label);
  el.className = fresh.className;
  el.replaceChildren.apply(el, Array.prototype.slice.call(fresh.childNodes));
}

function photoUrl(photo) {
  return '/uploads/' + encodeURIComponent(photo.file_path.split('/').pop());
}

function formatDate(value) {
  if (!value) return 'n/a';
  var d = new Date(value + (value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value) ? '' : 'Z'));
  return isNaN(d.getTime()) ? 'n/a' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadStats() {
  try {
    const res = await fetch(API_BASE + '/photos?limit=500');
    if (!res.ok) return;
    const photos = await res.json();
    const counts = { total: photos.length, draft: 0, scheduled: 0, published: 0, failed: 0 };
    photos.forEach(function (p) { if (counts[p.status] !== undefined) counts[p.status]++; });
    setText('stat-total', counts.total);
    setText('stat-draft', counts.draft);
    setText('stat-scheduled', counts.scheduled);
    setText('stat-published', counts.published);
    setText('stat-failed', counts.failed);
    setText('settings-count', String(counts.total));
    var sub = document.getElementById('preview-sub');
    if (sub) sub.textContent = counts.total === 0
      ? 'No uploads yet. Import one in the scheduler.'
      : 'Latest uploads with live status.';
  } catch (e) { /* decorative */ }
}

function setText(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function loadHealth() {
  var dot = document.getElementById('health-dot');
  var text = document.getElementById('health-text');
  var apiBadge = document.getElementById('settings-api');
  try {
    var res = await fetch('/health');
    var ok = res.ok && (await res.json()).status === 'ok';
    if (dot) dot.className = 'w-2 h-2 ' + (ok ? 'bg-ok' : 'bg-err');
    if (text) { text.textContent = ok ? 'online' : 'error'; text.className = 'font-mono text-xs uppercase tracking-widest ' + (ok ? 'text-ok' : 'text-err'); }
    if (apiBadge) setBadge(apiBadge, ok ? 'published' : 'failed', ok ? 'online' : 'error');
  } catch (e) {
    if (dot) dot.className = 'w-2 h-2 bg-err';
    if (text) { text.textContent = 'offline'; text.className = 'font-mono text-xs uppercase tracking-widest text-err'; }
    if (apiBadge) setBadge(apiBadge, 'failed', 'offline');
  }
}

/* Cards keep image and caption apart: photo on top, location plus
   status in a caption row below. Nothing floats over the photo. */
function buildPreviewCard(photo) {
  var a = document.createElement('a');
  a.href = '/v2/?id=' + encodeURIComponent(photo.id);
  a.className = 'group block overflow-hidden border border-border bg-transparent hover:border-mutedFg transition-colors duration-150';
  a.setAttribute('aria-label', photo.filename + ' (' + photo.status + ')');

  var imgWrap = document.createElement('div');
  imgWrap.className = 'overflow-hidden';
  var img = document.createElement('img');
  img.src = photoUrl(photo);
  img.alt = photo.filename || 'Uploaded photo';
  img.loading = 'lazy';
  img.className = 'w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-500 ease-[cubic-bezier(0.25,0,0,1)]';
  imgWrap.appendChild(img);
  a.appendChild(imgWrap);

  var caption = document.createElement('div');
  caption.className = 'flex items-center justify-between gap-2 px-4 py-3 border-t border-border';
  var meta = document.createElement('span');
  meta.className = 'truncate font-mono text-xs text-mutedFg';
  meta.textContent = (photo.location_name || 'Unknown location') + ', ' + formatDate(photo.created_at);
  caption.appendChild(meta);
  caption.appendChild(buildBadge(photo.status, photo.status));
  a.appendChild(caption);
  return a;
}

async function loadPreviewGrid() {
  var grid = document.getElementById('preview-grid');
  if (!grid) return;
  grid.replaceChildren();
  for (var i = 0; i < PREVIEW_LIMIT; i++) {
    var sk = document.createElement('div');
    sk.className = 'skeleton aspect-[4/3] w-full';
    sk.setAttribute('aria-hidden', 'true');
    grid.appendChild(sk);
  }
  try {
    var res = await fetch(API_BASE + '/photos?limit=' + PREVIEW_LIMIT);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var photos = await res.json();
    grid.replaceChildren();
    if (photos.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'col-span-full border border-dashed border-border p-12 text-center grid gap-3 place-items-center';
      var t = document.createElement('p');
      t.className = 'font-bold tracking-tight text-2xl';
      t.textContent = 'No photos yet.';
      var s = document.createElement('p');
      s.className = 'text-base text-mutedFg';
      s.textContent = 'Import one in the scheduler to start the pipeline.';
      var link = document.createElement('a');
      link.href = '/v2/';
      link.className = 'btn-secondary mt-2';
      link.textContent = 'Open Scheduler';
      empty.appendChild(t);
      empty.appendChild(s);
      empty.appendChild(link);
      grid.appendChild(empty);
      return;
    }
    photos.forEach(function (photo) { grid.appendChild(buildPreviewCard(photo)); });
  } catch (e) {
    grid.replaceChildren();
    var err = document.createElement('p');
    err.className = 'col-span-full text-center text-sm text-err py-8';
    err.textContent = 'Could not load previews. Check that the API is running.';
    grid.appendChild(err);
  }
}

/* Reveal on scroll: fade plus 20px rise over 500ms, once only,
   15% threshold with -50px margin, 100ms base plus 80ms stagger.
   Skipped when the user prefers reduced motion. Uses
   IntersectionObserver, never a scroll listener. */
function setupReveal() {
  document.body.classList.add('has-reveal');
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry, i) {
      if (entry.isIntersecting) {
        entry.target.style.transitionDelay = Math.min(100 + i * 80, 500) + 'ms';
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
  items.forEach(function (el) { io.observe(el); });
}

document.addEventListener('DOMContentLoaded', function () {
  setupReveal();
  loadStats();
  loadHealth();
  loadPreviewGrid();
});
