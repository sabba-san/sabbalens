// Sabbalens Landing Page — Client Application

const sampleData = {
  sf: {
    title: 'DSC08921.ARW · 35mm f/2.8',
    caption: 'Sunset fog rolling through the Golden Gate Bridge at dusk.',
    loc: '📍 San Francisco, California, USA',
    cam: '📷 Sony A7 IV • FE 24-70mm F2.8 GM',
    exp: '⚙️ 35mm | f/2.8 | 1/250s | ISO 100',
  },
  tokyo: {
    title: 'DSC08925.ARW · 28mm f/1.7',
    caption: 'Rainy neon reflections in Shinjuku after midnight.',
    loc: '📍 Tokyo, Japan',
    cam: '📷 Leica Q2 • Summilux 28mm F1.7',
    exp: '⚙️ 28mm | f/1.7 | 1/60s | ISO 800',
  },
  kyoto: {
    title: 'DSC08926.ARW · 33mm f/1.4',
    caption: 'Morning light through the bamboo forest path.',
    loc: '📍 Kyoto, Japan',
    cam: '📷 Fujifilm X-T5 • XF 33mm F1.4 R LM WR',
    exp: '⚙️ 33mm | f/1.4 | 1/250s | ISO 160',
  }
};

let activeSample = 'sf';

function updateDemoBubble() {
  const data = sampleData[activeSample];
  const photoTitle = document.getElementById('demo-photo-title');
  const captionText = document.getElementById('demo-caption-text');
  const tagLoc = document.getElementById('tag-loc');
  const tagCam = document.getElementById('tag-cam');
  const tagExp = document.getElementById('tag-exp');

  if (photoTitle) photoTitle.textContent = data.title;
  if (captionText) captionText.textContent = data.caption;

  const showLoc = document.getElementById('check-loc')?.checked;
  const showCam = document.getElementById('check-cam')?.checked;
  const showExp = document.getElementById('check-exp')?.checked;

  if (tagLoc) {
    tagLoc.textContent = data.loc;
    tagLoc.style.display = showLoc ? 'block' : 'none';
  }
  if (tagCam) {
    tagCam.textContent = data.cam;
    tagCam.style.display = showCam ? 'block' : 'none';
  }
  if (tagExp) {
    tagExp.textContent = data.exp;
    tagExp.style.display = showExp ? 'block' : 'none';
  }
}

async function fetchLiveStats() {
  try {
    const res = await fetch('/api/v1/photos');
    if (res.ok) {
      const photos = await res.json();
      const total = photos.length;
      const drafts = photos.filter(p => p.status === 'draft').length;
      const scheduled = photos.filter(p => p.status === 'scheduled').length;
      const published = photos.filter(p => p.status === 'published').length;

      document.getElementById('stat-total').textContent = total;
      document.getElementById('stat-drafts').textContent = drafts;
      document.getElementById('stat-scheduled').textContent = scheduled;
      document.getElementById('stat-published').textContent = published;
    }
  } catch (err) {
    console.debug('Live stats poll failed (offline/sim):', err);
    // Graceful fallback values
    document.getElementById('stat-total').textContent = '24';
    document.getElementById('stat-drafts').textContent = '6';
    document.getElementById('stat-scheduled').textContent = '4';
    document.getElementById('stat-published').textContent = '14';
  }

  try {
    const tRes = await fetch('/api/v1/telegram/status');
    if (tRes.ok) {
      const tData = await tRes.json();
      if (tData.latency_ms) {
        document.getElementById('stat-latency').textContent = `${tData.latency_ms}ms`;
      }
    }
  } catch (err) {
    // Keep default latency
  }
}

function initReveals() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
  // Bind sample buttons
  document.querySelectorAll('.sample-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sample-btn').forEach(b => {
        b.classList.remove('border-accent', 'text-accent');
        b.classList.add('border-border', 'text-zinc-400');
      });
      btn.classList.add('border-accent', 'text-accent');
      btn.classList.remove('border-border', 'text-zinc-400');
      activeSample = btn.dataset.sample;
      updateDemoBubble();
    });
  });

  // Bind checkbox toggles
  ['check-loc', 'check-cam', 'check-exp'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateDemoBubble);
  });

  updateDemoBubble();
  fetchLiveStats();
  initReveals();
});
