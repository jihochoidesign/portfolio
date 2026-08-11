// Whichever real photo (not a gradient placeholder) the visitor last centred
// in the tracklist carousel — reused as that project's cover image.
const COVER_IMAGE_KEY = 'tl_selectedCoverImage';


// ===========================================================
// TRACKLIST — preloader (decode images before revealing the page)
// ===========================================================
// The carousel thumbnails are large; if they stream in while you're already
// interacting, the first drag/click stutters. This opaque cover stays up until
// every thumbnail is fully DECODED (not just downloaded), then fades out — so by
// the time the page is visible, everything the first view needs is ready to
// paint. A safety timeout guarantees the cover never traps the page.
function initPreloader() {
  const loader = document.getElementById('tlPreloader');
  if (!loader) return; // only the tracklist has it

  // Pull the image URLs straight from the carousel cards' data-bg.
  const urls = [];
  document.querySelectorAll('[data-carousel-card]').forEach(card => {
    const m = (card.dataset.bg || '').match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
    if (m) urls.push(m[1]);
  });

  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    loader.classList.add('is-done');
    setTimeout(() => loader.remove(), 450); // remove after the fade-out finishes
  }

  let remaining = urls.length;
  if (!remaining) { reveal(); return; }
  const tick = () => { if (--remaining <= 0) reveal(); };

  urls.forEach(src => {
    const img = new Image();
    img.src = src;
    // decode() resolves only once the image is ready to paint without jank;
    // fall back to load/error so a broken image or old browser never hangs.
    const ready = img.decode ? img.decode() : new Promise((res, rej) => {
      img.onload = res; img.onerror = rej;
    });
    ready.then(tick, tick);
  });

  setTimeout(reveal, 5000); // safety net — never keep the page hidden too long
}

initPreloader();


// ===========================================================
// TRACKLIST — cover image (single static card)
// ===========================================================
// Just the project's first image, painted onto one static card — no
// coverflow, no dragging, no dots. Domicile's video and Metro's map are
// separate elements handled in initTrackPlayer, untouched by this. Called on
// load AND from the http swap path so a seamless navigation re-wires the
// fresh card too.
function initGallery(root = document) {
  const carousel = root.querySelector('[data-carousel]');
  if (!carousel) return; // only the tracklist (and the Arc 2 chapter body) has one
  const card = carousel.querySelector('[data-carousel-card]');
  if (!card) return;

  if (card.dataset.bg) card.style.backgroundImage = card.dataset.bg;

  return {
    setImages(imgs) {
      if (!imgs || !imgs.length) return;
      card.dataset.bg = imgs[0];
      card.style.backgroundImage = imgs[0];
    }
  };
}


// ===========================================================
// TRACKLIST — now-playing player (skip forward/back between projects)
// ===========================================================
// The left panel is one reusable "now playing" view. Each project supplies its
// carousel images, meta text and a play-through link; the prev/next buttons
// cycle through them (wrapping past either end) and move the highlighted row in
// the list to match. Track 01 has the real capstone thumbnails; the rest use
// gradient placeholders and share the same placeholder copy for now — fill in
// each project's images / text / href in the `projects` list below.

// Set by initTimelineSlider so the track player can restart the timeline sweep
// whenever a different track is selected.
let timelineSlider = null;

function initTrackPlayer() {
  const player = document.querySelector('.np-player');
  // Only the full tracklist panel drives the carousel/now-playing logic. The
  // project pages reuse .np-player as a bare nav panel (button + tag, no
  // carousel), so require the carousel before running any of this.
  if (!player || !document.querySelector('[data-carousel]')) return;
  const gallery = initGallery();     // build the carousel, keep its controller
  const carouselEl = document.querySelector('[data-carousel]');
  const carouselVideo = carouselEl && carouselEl.querySelector('[data-carousel-video]');
  const carouselImage = carouselEl && carouselEl.querySelector('[data-carousel-image]');

  const IMG1 = [1, 2, 3, 4, 5, 6].map(n => `url('capstonecollection/thumbnails/${n}.png')`);

  // Shared placeholder copy. To give a project its own now-playing text later,
  // replace `...TEXT` on its entry with its own from/subtitle/pills/title/desc.
  const TEXT = {
    from: 'Album',
    subtitle: 'CAPSTONE PROJECT',
    pills: ['Narrative Adventure', 'Stealth & Survival'],
    title: 'Domicile',
    desc: [
      'What do you do when the world stops making sense overnight?'
    ]
  };

  const projects = [
    { num: '01', href: 'pixel-quest.html',         images: IMG1,                              ...TEXT },
    { num: '02', href: 'metro-rerouted.html',      images: [`url('metro/mfinal2.png')`], ...TEXT,
      subtitle: 'WAYFINDING',
      pills: ['Information Design', 'UI/UX Design'],
      title: 'Metro Rerouted',
      titleAlt: true, // renders in the tag font (bold) instead of the pixel display font
      desc: ['Designing a metro map for Abu Dhabi\'s newly established transit system.'],
      timeline: 'metro'
    },
    { num: '03', href: 'cardboard-companion.html', images: [`url('robot/pr1.JPG')`, `url('robot/2.jpg')`, `url('robot/3.jpg')`, `url('robot/pr2.jpg')`], ...TEXT,
      title: 'Malibu-Baddie',
      titleAlt: true, // renders in the tag font (bold) instead of the pixel display font
      subtitle: 'PERFORMING ROBOTS',
      pills: ['Physical Computing', 'Hardware Prototyping'],
      desc: ['Building a stage robot for a high-drama divorce court play.'],
      timeline: 'cardboard'
    }
  ];

  const nowPlaying = player.querySelector('.np-player__nowplaying');
  const fromEl     = player.querySelector('.np-player__from');
  const subtitleEl = player.querySelector('.np-player__subtitle');
  const titleEl    = player.querySelector('.np-player__title');
  const descEls    = player.querySelectorAll('.np-player__desc');
  const playLink   = player.querySelector('.np-controls__play');
  const rows       = Array.from(document.querySelectorAll('.np-list .track'));

  // The project tags used to sit in the left panel; they now live on the track
  // rows themselves, revealed when a row is hovered (see .track__tags). Built
  // from the same `projects` data the player reads, so the labels stay in one
  // place rather than being duplicated into the markup. Appended to the row
  // (<li class="track">) as a SIBLING after .track__main, not inside
  // .track__text — so expanding it only adds height below the row instead of
  // growing .track__main from the inside, which used to re-center everything
  // in it (icon, number, title, subtitle, runtime all rely on .track__main's
  // align-items: center, keyed off whichever child is currently tallest).
  rows.forEach((row, i) => {
    const p = projects[i];
    const main = row.querySelector('.track__main');
    if (!p || !p.pills || !main) return;
    const tags = document.createElement('div');
    tags.className = 'track__tags';
    tags.setAttribute('aria-hidden', 'true'); // decorative here; the row's link already names the project
    p.pills.forEach(label => {
      const tag = document.createElement('span');
      tag.className = 'track__pill';
      tag.textContent = label;
      tags.appendChild(tag);
    });
    row.appendChild(tags);
  });

  const n = projects.length;
  let current = 0;

  function show(i, resetTimeline) {
    current = (i % n + n) % n; // wrap past either end
    const p = projects[current];
    if (nowPlaying) nowPlaying.textContent = `NOW PLAYING · TRACK ${p.num}`;
    if (fromEl)     fromEl.textContent = p.from;
    if (subtitleEl) subtitleEl.textContent = p.subtitle;
    if (titleEl) {
      titleEl.textContent = p.title;
      titleEl.classList.toggle('np-player__title--tagfont', !!p.titleAlt);
      titleEl.classList.toggle('np-player__title--sm', !!p.titleSmall);
    }
    descEls.forEach((el, k) => { if (p.desc[k] != null) el.textContent = p.desc[k]; });
    if (playLink)   playLink.setAttribute('href', p.href);
    // Domicile (track 01) shows its gameplay demo and Metro (track 02) shows
    // its map at native aspect ratio, both instead of the image coverflow;
    // every other track keeps the normal carousel.
    const showVideo = p.num === '01';
    const showImage = p.num === '02';
    // Malibu-Baddie (track 03) uses the normal coverflow but its cards are
    // sized taller to match Metro's map height.
    const isMalibu = p.num === '03';
    if (carouselEl) {
      carouselEl.classList.toggle('is-video', showVideo);
      carouselEl.classList.toggle('is-image', showImage);
      carouselEl.classList.toggle('is-malibu', isMalibu);
    }
    if (carouselVideo) {
      if (showVideo) { carouselVideo.currentTime = 0; carouselVideo.play(); }
      else carouselVideo.pause();
    }
    if (gallery)    gallery.setImages(p.images);
    rows.forEach((row, k) => row.classList.toggle('track--active', k === current));
    // Switching tracks restarts the "song": the timeline knob resets to
    // kickoff and the 3-minute sweep begins again, using whichever project's
    // own date range + stages apply. (Not on the initial sync.)
    if (resetTimeline && timelineSlider) timelineSlider.setProject(p.timeline);
  }

  const prev = player.querySelector('[aria-label="Previous track"]');
  const next = player.querySelector('[aria-label="Next track"]');
  if (prev) prev.addEventListener('click', () => show(current - 1, true));
  if (next) next.addEventListener('click', () => show(current + 1, true));

  // Clicking a row loads that project into the player instead of navigating —
  // only the play button opens the project page. Modifier-clicks fall through,
  // so cmd/ctrl-click can still open the row's link in a new tab, and the link
  // works as a normal link if JS never runs.
  rows.forEach((row, k) => {
    row.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      show(k, true);
    });
  });

  show(0); // sync the panel + highlight to the first project (no timeline reset)
}

initTrackPlayer();

// ===========================================================
// TRACKLIST — vertically center the right column on the player panel
// ===========================================================
// The left player panel is flex-centered in the viewport (.np-player-col),
// but its own height varies per project (video vs. image vs. carousel,
// description length) — there's no fixed number to center the right column
// against. Nudge .np-list's own margin so its vertical center matches
// .np-player's actual rendered center — measured live, so it still holds
// after a resize, a late web-font swap, or switching tracks (which changes
// both the player's height and which tracklist row is expanded).
//
// The margin goes on .np-list itself, not a child inside it: .np-list is a
// grid item aligned to its row's start, so margin-top on the ITEM just
// repositions its whole box (its own height is unaffected, since margin
// isn't part of the border box getBoundingClientRect measures). Margin-top
// on a child inside it instead would stretch .np-list's own height by that
// same amount (flex items don't collapse margins), moving the very center
// being solved for — a self-referential result that never converges.
function initTracklistAlign() {
  const list   = document.querySelector('.np-list');
  const player = document.querySelector('.np-player');
  if (!list || !player) return;

  const baseMarginTop = parseFloat(getComputedStyle(list).marginTop) || 0;
  // Matches the .np breakpoint that stacks the two columns — centering only
  // makes sense side by side. Once the player sits above the list entirely,
  // centering the list against it would just misplace the list arbitrarily.
  const stackQuery = window.matchMedia('(max-width: 860px)');

  const align = () => {
    list.style.marginTop = baseMarginTop + 'px'; // reset before measuring
    if (stackQuery.matches) return;
    const playerRect = player.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const delta = (playerRect.top + playerRect.height / 2) - (listRect.top + listRect.height / 2);
    list.style.marginTop = (baseMarginTop + delta) + 'px';
  };

  align();
  window.addEventListener('resize', align);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(align);
  // Re-measure whenever the player's own height changes (switching tracks
  // swaps its image/video/description) or the tracklist's does (the active
  // row's expanded tags) — observing .np-tracks rather than .np-list itself
  // avoids the same feedback loop: align() adjusts .np-list's position, and
  // once content inside it (the tracks) is what's watched instead, that's
  // unaffected by the margin change.
  if (window.ResizeObserver) {
    const tracks = document.querySelector('.np-tracks');
    const ro = new ResizeObserver(align);
    ro.observe(player);
    if (tracks) ro.observe(tracks);
  }
}
initTracklistAlign();


// ===========================================================
// PROJECT CHAPTERS — click a chapter to make it the active one
// ===========================================================
// The project-page left panel lists the chapters (see .np-chapters). Only one
// is "playing" at a time. Selecting a chapter — by clicking its row, or hitting
// "up next" in the body — moves the .np-chapter--active highlight AND swaps the
// right-hand "now playing" readout (num/title/time), the pixel heading and the
// placeholder copy to that chapter, exactly like the tracklist's now-playing.
// Teardown for the scroll/resize listeners the chapter scrollspy installs on
// window, so a re-entrant initChapters() call drops the previous set first
// instead of stacking duplicates.
let chapterScrollTeardown = null;

function initChapters() {
  // Runs again on every seamless arrival, so clear the previous page's window
  // listeners first — otherwise they stack up, each still pointing at nodes
  // that have since been removed. Deliberately before the early return, so
  // navigating to a page with no chapters (the tracklist) also unhooks them.
  if (chapterScrollTeardown) { chapterScrollTeardown(); chapterScrollTeardown = null; }

  const chapters = Array.from(document.querySelectorAll('.np-chapter'));
  if (!chapters.length) return;

  // Which project page this is (body data-project). Every project page runs
  // this same chapter machinery, but only Domicile has written chapter bodies
  // so far — see the lookups in setActive().
  const isDomicile = document.body.dataset.project === 'domicile';
  // Metro's first chapter gets ONE placeholder version of Domicile's label +
  // pull-quote + paragraph pattern (see chapterBodyHtml) — everything else
  // on this project page still falls through to the generic placeholderText.
  const isMetro = document.body.dataset.project === 'metro';
  const isCardboard = document.body.dataset.project === 'cardboard';

  const upnext  = document.querySelector('[data-upnext]');
  const upNum   = upnext && upnext.querySelector('[data-upnext-num]');
  const upTitle = upnext && upnext.querySelector('[data-upnext-title]');
  const prevA   = document.querySelector('[data-prev]');
  const prevNum = prevA && prevA.querySelector('[data-prev-num]');
  const prevTitle = prevA && prevA.querySelector('[data-prev-title]');


  // Captured before the first render overwrites the href: where the last
  // chapter's "up next" / first chapter's "previous" roll on to (the adjacent
  // project's page + title).
  const nextProject = upnext
    ? { href: upnext.getAttribute('href'), title: upnext.dataset.nextProject || '' }
    : null;
  const prevProject = prevA
    ? { href: prevA.getAttribute('href'), title: prevA.dataset.prevProject || '' }
    : null;

  // Read each chapter's num / title / time straight from its left-panel row, so
  // the body stays in sync with the list without duplicating the copy.
  const data = chapters.map(ch => ({
    num:   (ch.querySelector('.np-chapter__num')   || {}).textContent?.trim() || '',
    title: (ch.querySelector('.np-chapter__title') || {}).textContent?.trim() || '',
    time:  (ch.querySelector('.np-chapter__time')  || {}).textContent?.trim() || ''
  }));

  // Inline check / cross icons for pro-con lists (e.g. chapter 1, tag 01-4).
  const tickSvg = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>`;
  const crossSvg = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

  // Play + pause glyphs stacked in one button; CSS swaps which shows by state.
  const playPauseSvg =
    `<svg class="vtrack__ic vtrack__ic--play" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>` +
    `<svg class="vtrack__ic vtrack__ic--pause" viewBox="0 0 24 24" width="15.5" height="15.5" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.4" height="14" rx="1.7"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.7"/></svg>`;

  // Chapter title → image to show above the placeholder copy in the body.
  const chapterImages = {};

  // Chapter title → pill tag to show below the chapter heading.
  const chapterTags = {
    'Character Design': 'Interact to reveal casting logic.'
  };

  // Chapter title → the card fan below tag 1 (see initCardFan). Card 0 is the
  // framing statement and is front-only — it has no reverse artwork, so it's the
  // one card that never turns over. Cards 1-8 are the characters, frontN / backN
  // being the two faces of card N.
  const cd = 'capstonecollection/characterdesign/cards';
  const chapterDecks = {
    'Character Design': [
      { front: `${cd}/front0.png` },
      ...Array.from({ length: 8 }, (_, i) => ({
        front: `${cd}/front${i + 1}.png`,
        back:  `${cd}/back${i + 1}.png`
      }))
    ]
  };

  // Chapter title → pill tag to show below the gallery.
  const chapterGalleryTags = {
    'Character Design': 'VISUAL DEVELOPMENT &amp; CHARACTER SPRITES'
  };

  // Chapter title → pill tag to show below the image2 description.
  const chapterImage2Tags = {
    'Character Design': 'CREATING CHARACTER SPRITES'
  };

  // Builds one chapter's body markup. Every chapter is rendered up front and
  // stacked into one continuous scroll (see below), so this runs once per
  // chapter at load rather than on each selection.
  function chapterBodyHtml(c) {
    {
      const placeholderText =
        `${c.title.toUpperCase()} — chapter placeholder. Replace with the writing for ` +
        `this chapter: what it covers, the decisions behind it, and what it led to.`;
      // All the chapter bodies below are Domicile's, and they're looked up by
      // chapter TITLE alone. Every project page reuses this same structure, so
      // the lookups are scoped to Domicile — otherwise another project's
      // chapter that happened to share a title (say "Project Overview") would
      // render Domicile's copy. Other projects fall through to placeholderText.
      const image = isDomicile ? chapterImages[c.title] : undefined;
      const tag = isDomicile ? chapterTags[c.title] : undefined;
      const deck = isDomicile ? chapterDecks[c.title] : undefined;
      const galleryTag = isDomicile ? chapterGalleryTags[c.title] : undefined;
      const image2Tag = isDomicile ? chapterImage2Tags[c.title] : undefined;
      const deckHtml = deck
        ? `<div class="card-fan" data-card-fan>` +
          deck.map((card, idx) =>
            // A card with no back never turns over — the flip would show nothing.
            `<div class="fan-card${card.back ? '' : ' fan-card--noflip'}">` +
              `<div class="fan-card__inner">` +
                `<img src="${card.front}" alt="${c.title} card ${idx + 1}" class="fan-card__face fan-card__face--front" draggable="false">` +
                (card.back
                  ? `<img src="${card.back}" alt="${c.title} card ${idx + 1} reverse" class="fan-card__face fan-card__face--back" draggable="false">`
                  : '') +
              `</div>` +
            `</div>`
          ).join('') +
          `</div>`
        : '';

      const voiceHtml = c.title === 'Character Design'
        ? [
            'DEFINING CHARACTER VOICE',
            'SOUND CASTING',
            'SPEECH-TO-SOUND TRANSLATION'
          ].map((label, idx) =>
            `<span class="project__chapter-tag project__chapter-tag--below-gallery"${idx === 0 ? ' style="margin-top: 140px; margin-bottom: 8px;"' : idx === 1 ? ' style="margin-top: 140px; margin-bottom: 8px;"' : ' style="margin-top: 140px; margin-bottom: 8px;"'}>${label}</span>` +
            (idx === 0
              ? `<p class="project__chapter-description">I assessed multiple approaches to character dialogue against scope constraints and production trade-offs:</p>` +
                `<div class="voice-eval" style="margin-top: 36px;">` +
                [
                  {
                    name: 'Voice Acting',
                    pros: [
                      'Deepens emotional resonance and character empathy.',
                      'Elevates production value when executed well.'
                    ],
                    cons: [
                      'Amateur delivery may break player immersion, which is difficult to recover.',
                      'Hard to source quality talent within strict time and budget limits.'
                    ]
                  },
                  {
                    name: 'Typewrite SFX / Rhythmic Beeps',
                    pros: [
                      'Low production effort and is straightforward to implement.',
                      'Creates satisfying audio feedback.'
                    ],
                    cons: [
                      'High risk of audio fatigue during dialogue-heavy scenes.',
                      'Lacks emotional range.'
                    ]
                  },
                  {
                    name: 'Abstract Speech Mimicry',
                    pros: [
                      'Gives characters a distinct voice identity.',
                      'Complements animal characters better than human speech.',
                      'Highly scalable for large dialogue volumes.'
                    ],
                    cons: [
                      'Difficult to match emotional tone during grounded moments.'
                    ]
                  }
                ].map(item =>
                  `<div class="voice-eval__card">` +
                    `<p class="voice-eval__name">${item.name}</p>` +
                    `<div class="voice-eval__cols">` +
                      `<div class="voice-eval__col voice-eval__col--pro">` +
                        `<ul class="voice-eval__list">` +
                        item.pros.map(text =>
                          `<li class="voice-eval__item">` +
                            `<span class="voice-eval__icon voice-eval__icon--pro">${tickSvg}</span>` +
                            `<span class="voice-eval__text">${text}</span>` +
                          `</li>`
                        ).join('') +
                        `</ul>` +
                      `</div>` +
                      `<div class="voice-eval__col voice-eval__col--con">` +
                        `<ul class="voice-eval__list">` +
                        item.cons.map(text =>
                          `<li class="voice-eval__item">` +
                            `<span class="voice-eval__icon voice-eval__icon--con">${crossSvg}</span>` +
                            `<span class="voice-eval__text">${text}</span>` +
                          `</li>`
                        ).join('') +
                        `</ul>` +
                      `</div>` +
                    `</div>` +
                  `</div>`
                ).join('') +
                `</div>` +
                `<p class="project__chapter-description" style="margin-top: 70px;"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">I chose the 4th approach.</span> This approach was inspired by two audio design successes: Animal Crossing&rsquo;s "Animalese," which builds character charm, and Inscryption&rsquo;s synth-driven character voices, which use tonal blips and chords to illustrate different personalities.</p>`
              : idx === 1
              ? `<p class="project__chapter-description" style="margin-top: 8px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">1</span>Sourcing Samples in Logic Pro</span> Rather than searching with characters in mind, I scoured sample libraries for compelling, unique audio, prioritizing raw sounds with strong potential and flexibility for pitch-shifting and modulation.</p>` +
                `<div class="vtrack" data-vtrack style="margin-top: 36px;">` +
                  `<ul class="vtrack__list">` +
                  [
                    ['Cosmonaut Space Capsule', 'CSC'],
                    ['Chill Vocal Sequence',    'CVS'],
                    ['Deharmonizer',            'D'],
                    ['Fm Builder',              'FB'],
                    ['Glacial Pressure',        'GP']
                  ].map(([name, id], i) =>
                    `<li class="vtrack__row${i === 0 ? ' vtrack__row--active' : ''}" data-vtrack-row data-src="capstonecollection/sounds/${id}.mp3" data-name="${name}">` +
                      `<button type="button" class="vtrack__play" aria-label="Play ${name}">${playPauseSvg}</button>` +
                      `<div class="vtrack__text">` +
                        `<span class="vtrack__name">${name}</span>` +
                      `</div>` +
                      `<span class="vtrack__dur" data-vtrack-rowdur>0:00</span>` +
                    `</li>`
                  ).join('') +
                  `</ul>` +
                  `<audio data-vtrack-audio preload="metadata"></audio>` +
                `</div>` +
                `<p class="project__chapter-caption">Sample Examples</p>` +
                `<p class="project__chapter-description project__chapter-description--below-vtrack-caption"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">2</span>Mapping audio samples to their corresponding characters:</span></p>` +
                `<div class="project__chapter-placeholders-block project__chapter-placeholders-block--tight-top">` +
                  // Row layout: image(s) on the left, heading + paragraph on the
                  // right. The last row pairs p + pb side by side under one shared
                  // heading/paragraph, each image carrying its own small range label.
                  `<div class="sound-combos">` +
                    `<div class="sound-combos__row">` +
                      `<div class="sound-combos__imgs">` +
                        `<div class="sound-combos__imgwrap">` +
                          `<img src="capstonecollection/sounds/p.png" alt="Vintage Vox" class="sound-combos__img">` +
                          `<span class="sound-combos__range">C4&ndash;C5 Range</span>` +
                        `</div>` +
                        `<div class="sound-combos__imgwrap">` +
                          `<img src="capstonecollection/sounds/pb.png" alt="Vintage Vox (low)" class="sound-combos__img">` +
                          `<span class="sound-combos__range">C3 Range</span>` +
                        `</div>` +
                      `</div>` +
                      `<div class="sound-combos__text">` +
                        `<h3 class="sound-combos__heading">Vintage Vox</h3>` +
                        `<p class="sound-combos__desc"><strong class="sound-combos__lead">Choosing "Vintage Vox" for Emotional Expressiveness</strong> Initial samples lacked a human feel. After further exploration, I chose "Vintage Vox" for its distinct human-like whine, which helps players connect with the character.</p>` +
                      `</div>` +
                    `</div>` +
                    `<div class="sound-combos__row">` +
                      `<img src="capstonecollection/sounds/b.png" alt="Glacial Pressure" class="sound-combos__img">` +
                      `<div class="sound-combos__text">` +
                        `<h3 class="sound-combos__heading">Glacial Pressure (C2&ndash;C3 Range)</h3>` +
                        `<p class="sound-combos__desc"><strong class="sound-combos__lead">Balancing compatibility with player comfort.</strong> While "Motorizer" had an authentic pig-like quality, it was too harsh for repeated listening. "Glacial Pressure" offered a more balanced frequency, conveying an imposing presence without irritating the player.</p>` +
                      `</div>` +
                    `</div>` +
                    `<div class="sound-combos__row">` +
                      `<img src="capstonecollection/sounds/ba.png" alt="Chill Vocal Sequence" class="sound-combos__img">` +
                      `<div class="sound-combos__text">` +
                        `<h3 class="sound-combos__heading">Chill Vocal Sequence (C6 Range)</h3>` +
                        `<p class="sound-combos__desc"><strong class="sound-combos__lead">Matching pitch to personality.</strong> I chose "Chill Vocal Sequence" over the alternative, which felt uncharacteristically eerie. Since Orion is an intentional nuisance, high-pitch fatigue wasn't a concern.</p>` +
                      `</div>` +
                    `</div>` +
                  `</div>` +
                `</div>`
              : idx === 2
              ? `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">1</span>Speech into Sound</span> Instead of trying to replicate every spoken syllable, I had to deconstruct speech into its core  patterns, breaking down sentences  into simple tonal sequences to depict feeling purely through pitch and rhythm.</p>` +
                `<div class="project__chapter-placeholders-block" style="margin-top: 36px;">` +
                  `<div class="project__chapter-placeholders project__chapter-placeholders--translate">` +
                  [
                    ['p',  'Vintage Vox',           'capstonecollection/sounds/N7.wav'],
                    ['pb', 'Vintage Vox (low)',     'capstonecollection/sounds/K1.wav'],
                    ['b',  'Glacial Pressure',     'capstonecollection/sounds/R1.wav'],
                    ['ba', 'Chill Vocal Sequence', 'capstonecollection/sounds/Y1.wav']
                  ].map(([id, label, src]) =>
                    `<figure class="project__chapter-placeholder-figure">` +
                      `<div class="project__chapter-placeholder-imgwrap">` +
                        `<img src="capstonecollection/sounds/${id}.png" alt="${label}" class="project__chapter-placeholder-box project__chapter-placeholder-box--translate${id === 'p' || id === 'pb' ? ' project__chapter-placeholder-box--translate-small' : ''}">` +
                      `</div>` +
                      `<p class="project__chapter-placeholder-name">${
                        id === 'p' ? 'Neas' : id === 'pb' ? 'Kairo' : id === 'b' ? 'Tusker' : 'Orion'
                      }</p>` +
                      (src
                        ? `<button type="button" class="translate-play" data-translate-play data-src="${src}" aria-label="Play ${label} sample">${playPauseSvg}</button>` +
                          `<audio data-translate-audio preload="none"></audio>`
                        : `<button type="button" class="translate-play" disabled aria-label="No sample available">${playPauseSvg}</button>`) +
                      `<figcaption class="project__chapter-placeholder-caption project__chapter-placeholder-caption--translate-${id}">${
                        id === 'b'
                          ? '"It ain’t opening. No one is in the house you said?"'
                          : id === 'ba'
                          ? '"I saw a little’un leave moments ago. Parents are gone, little’un gone… It should be empty."'
                          : id === 'pb'
                          ? '"Neas… Stop stalling by the window. It won’t make them come faster."'
                          : id === 'p'
                          ? '"Oh no! My journal!"'
                          : 'Caption placeholder'
                      }</figcaption>` +
                    `</figure>`
                  ).join('') +
                  `</div>` +
                `</div>` +
                `<p class="project__chapter-description project__chapter-description--below-translate-gallery"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">2</span>How do you scale audio design across 60 dialogue lines?</span> To handle 60 dialogue lines without making it sound repetitive, I focused on efficient iteration. I reused existing audio assets where appropriate, and whenever a scene called for a specific emotion, I adjusted the source MIDI notes, re-pitching and shuffling keys into new variations.</p>` +
                `<div class="project__chapter-placeholders-block" style="margin-top: 36px;">` +
                  `<div class="translate-row-split">` +
                    `<div class="project__chapter-placeholders project__chapter-placeholders--translate">` +
                    [
                      ['p',  'Vintage Vox',       'capstonecollection/sounds/N5.wav'],
                      ['pb', 'Vintage Vox (low)', 'capstonecollection/sounds/K6.wav']
                    ].map(([id, label, src]) =>
                      `<figure class="project__chapter-placeholder-figure">` +
                        `<div class="project__chapter-placeholder-imgwrap">` +
                          `<img src="capstonecollection/sounds/${id}.png" alt="${label}" class="project__chapter-placeholder-box project__chapter-placeholder-box--translate project__chapter-placeholder-box--translate-small">` +
                        `</div>` +
                        `<p class="project__chapter-placeholder-name">${id === 'p' ? 'Neas' : 'Kairo'}</p>` +
                        `<button type="button" class="translate-play" data-translate-play data-src="${src}" aria-label="Play ${label} sample">${playPauseSvg}</button>` +
                        `<audio data-translate-audio preload="none"></audio>` +
                        `<figcaption class="project__chapter-placeholder-caption project__chapter-placeholder-caption--translate-${id}">${
                          id === 'p'
                            ? '"… Okay, yeah. Because we’re telling the truth right?"'
                            : '"Even still, it’s too dangerous… We should… We need to think things through."'
                        }</figcaption>` +
                      `</figure>`
                    ).join('') +
                    `</div>` +
                    `<div class="translate-row-split__divider"></div>` +
                    `<div class="project__chapter-placeholders project__chapter-placeholders--translate">` +
                    [
                      ['p',  'Vintage Vox',       'capstonecollection/sounds/N3.wav'],
                      ['pb', 'Vintage Vox (low)', 'capstonecollection/sounds/K4.wav']
                    ].map(([id, label, src]) =>
                      `<figure class="project__chapter-placeholder-figure">` +
                        `<div class="project__chapter-placeholder-imgwrap">` +
                          `<img src="capstonecollection/sounds/${id}.png" alt="${label}" class="project__chapter-placeholder-box project__chapter-placeholder-box--translate project__chapter-placeholder-box--translate-small">` +
                        `</div>` +
                        `<p class="project__chapter-placeholder-name">${id === 'p' ? 'Neas' : 'Kairo'}</p>` +
                        `<button type="button" class="translate-play" data-translate-play data-src="${src}" aria-label="Play ${label} sample">${playPauseSvg}</button>` +
                        `<audio data-translate-audio preload="none"></audio>` +
                        `<figcaption class="project__chapter-placeholder-caption project__chapter-placeholder-caption--translate-${id}">${
                          id === 'p'
                            ? '"? But they took away daddy… And daddy is not a bad person. He’s good!"'
                            : '"It means only a short while! That must mean dad’s on his way back!"'
                        }</figcaption>` +
                      `</figure>`
                    ).join('') +
                    `</div>` +
                  `</div>` +
                `</div>`
              : `<p class="project__chapter-description">${label} — placeholder text. Replace with the writing for this section: what it covers, the decisions behind it, and what it led to.</p>`)
          ).join('')
        : '';
      const tagDescription = (isCardboard && c.title === 'Project Brief')
        ? `<p class="project__chapter-description">Design, fabricate, and program an animatronic robot for a live stage production. The play was an over-the-top drama centered on a scandalous divorce court trial. Our team was assigned the role of the &ldquo;<strong>Best Friend</strong>&rdquo;, a double-crosser who betrays the wife by engaging in a secret affair with the husband.</p>` +
          `<video src="robot/introvid.mp4" class="project__chapter-a2demo-video" controls playsinline style="margin-top: 70px;"></video>` +
          `<div style="margin-top: 140px;">` +
            `<p class="project__chapter-description" style="margin-bottom: 15px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">2</span>Defining the Character Concept</span></p>` +
            `<p class="project__chapter-description">We envisioned an exaggerated <strong>&ldquo;Malibu girl&rdquo; trope</strong>&mdash;complete with dramatic body proportions, long acrylics, fluttering eyelashes, and big, puffed-up hair. We chose a simpler design that reflected her shallow, air-headed personality.</p>` +
            `<p class="project__chapter-description" style="margin-top: 27px;"><strong style="color: #0caaa2;">CHARACTER'S SIGNATURE MANNERISMS</strong><br>&bull; Sassy Hip Twists<br>&bull; Head Shakes/ Hair Flips<br>&bull; T-Rex Arm, with Acrylics Clacking</p>` +
          `</div>`
        : (isCardboard && c.title === 'Challenges')
        ? `<p class="project__chapter-description" style="margin-bottom: 15px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">1</span>Keeping track of all wiring and components</span></p>` +
          `<p class="project__chapter-description">With multiple components: 4 joint motors, a waist motor, 2 wheel motors, a receiver, and 4 LED strips, our cable management quickly became overwhelming. Tracing loose or broken connections during hardware debugging was extremely tedious, forcing us to manually trace every wire to isolate the issue.</p>` +
          `<div style="display: flex; align-items: flex-start; gap: 12px; margin-top: 34px;">` +
          [
            ['c1.png', 0.565],
            ['c2.png', 0.562],
            ['c3.png', 0.607],
            ['c4.jpg', 0.75],
            ['c5.jpg', 0.5625]
          ].map(([file, grow]) =>
            `<figure style="flex-grow:${grow}; flex-shrink: 1; flex-basis: 0; min-width: 0; margin: 0;">` +
              `<img src="robot/${file}" alt="Challenges ${file}" style="display: block; width: 100%; height: auto; border-radius: 5px;">` +
            `</figure>`
          ).join('') +
          `</div>` +
          `<p class="project__chapter-description" style="margin-top: 140px; margin-bottom: 15px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">2</span>Building a complete mechatronic system as  amateurs</span></p>` +
          `<p class="project__chapter-description">At times, our linear workflow created unnecessary friction. For example, closing off the lower body before mounting the waist motor forced us to  install components physically inside the robot (which with all the gussets was a difficult feat). However, these mistakes ultimately refined how I approach complex assembly workflows.</p>` +
          `<div style="display: flex; align-items: flex-start; gap: 12px; margin-top: 36px;">` +
          [
            ['m3.jpg', 1.778],
            ['m1.png', 0.5635],
            ['m2.png', 0.5877]
          ].map(([file, grow]) =>
            `<figure style="flex-grow:${grow}; flex-shrink: 1; flex-basis: 0; min-width: 0; margin: 0;">` +
              `<img src="robot/${file}" alt="Challenges ${file}" style="display: block; width: 100%; height: auto; border-radius: 5px;">` +
            `</figure>`
          ).join('') +
          `</div>`
        : (isMetro && c.title === 'Project Overview')
        ? `<p class="project__chapter-description" style="margin-bottom: 70px;"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">The Project Prompt as Follows...</span>Redesigning Abu Dhabi&rsquo;s transit map to communicate a <strong>weekend-only</strong> line and an <strong>express route</strong> skipping select stations.</p>` +
          `<p class="project__chapter-description project__chapter-description--label">PROBLEM STATEMENT</p>` +
          `<p class="project__chapter-description" style="color: #000000; font-size: 24px; margin-bottom: 20px;">"How might we design route-specific behaviors so they are legible to an international base?"</p>` +
          `<p class="project__chapter-description">Abu Dhabi's metro launches with no established rider literacy and an exceptionally international passenger base. So, the transit map must clearly communicate complex route behaviors, regardless of language.</p>`
        : (isMetro && c.title === 'Benchmarking')
        ? `<p class="project__chapter-description" style="margin-bottom: 120px;"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">Benchmarking One Metro World</span>I analyzed <strong>Jug Cerovi&#263;'s One Metro World project</strong>, focusing on three components: station node treatment, pictogram systems, and bilingual conventions in Arabic-language networks.</p>` +
          `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="text-transform: uppercase; color: #0caaa2; font-size: 19px;">Node Treatment</span>While interchange node treatments vary, white capsule nodes proved most effective for this network design. Passengers tracing a route require clear, easily parsable transfer points, and the white capsule against line colors creates the strongest contrast.</p>` +
          `<div class="project__chapter-nt-row" style="margin-top: 36px;">` +
          [
            ['1', 'Ringed Circles', 'Marseille Metro Map'],
            ['2', 'Capsules', 'S&atilde;o Paulo, Metropolitan Transport Network'],
            ['3', 'Connector Bars', 'Stockholm Rail Network Map'],
            ['4', 'Split Disks', 'Saint Petersburg Subway Map']
          ].map(([n, cap1, cap2]) =>
            `<figure class="project__chapter-nt-figure" style="flex-grow: 1;">` +
              `<img src="metro/nt${n}.png" alt="Node treatment ${n}" class="project__chapter-nt-img">` +
              `<figcaption class="project__chapter-caption" style="color: #0caaa2;">${cap1}</figcaption>` +
              `<p class="project__chapter-caption">${cap2}</p>` +
            `</figure>`
          ).join('') +
          `</div>` +
          `<p class="project__chapter-description" style="margin-top: 120px; margin-bottom: 8px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: uppercase; color: #0caaa2; font-size: 19px;">Pictograms &amp; Symbols</span></p>` +
          `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">How to Communicate Time-Defined Service?</span>Cerovi&#263;'s maps revealed a clear pattern: pictograms represent physical concepts, while letter badges designate systems (schedules and services).</p>` +
          `<div class="project__chapter-nt-row" style="margin-top: 36px; gap: 27px; justify-content: center;">` +
          [
            ['1', 'Seoul Metro Map'],
            ['2', 'S&atilde;o Paulo, Metropolitan Transport Network'],
            ['3', 'Marseille Metro Map']
          ].map(([n, cap]) =>
            `<figure class="project__chapter-nt-figure" style="flex: 0 0 auto; width: calc(25% - 15px);">` +
              `<img src="metro/p${n}.png" alt="Pictogram ${n}" class="project__chapter-nt-img">` +
              `<figcaption class="project__chapter-caption">${cap}</figcaption>` +
            `</figure>`
          ).join('') +
          `</div>` +
          `<p class="project__chapter-description" style="margin-top: 70px;"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">Pictogram VS. Letter Badge</span>A calendar pictogram was rejected for being too ambiguous, while "SS" (Saturday&ndash;Sunday) failed because weekend days vary globally. The "W" badge represents a weekend regardless of specific days.</p>` +
          `<p class="project__chapter-description" style="margin-top: 120px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: uppercase; color: #0caaa2; font-size: 19px;">Bilingual Conventions &mdash; Arabic networks</span>Across Arabic and Persian networks, station labels follow one rule: native script above, Latin below, to provide clear separation. I carried this convention into the map.</p>`
        : (isMetro && c.title === 'Iteration Process')
        ? `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">Untangling the Network</span>The first step was dissecting the network by mapping terminal-to-terminal lines (e.g., Dalma Mall to Presidential Palace, Zayed Intl Airport to Museum Island, and Zayed Intl Airport to Ferrari World) to use as the foundation.</p>` +
          `<figure class="project__chapter-prompt project__chapter-prompt--orimap" style="margin-top: 34px;">` +
            `<div class="project__chapter-promptcar">` +
              `<div class="simplecar" data-simplecar>` +
                `<img src="metro/orimap.png" alt="Original source map" class="project__chapter-tsplan-img simplecar__slide is-active" data-simplecar-slide data-caption="Original Source Map" draggable="false">` +
                `<img src="metro/rp1.JPG" alt="Redrawn routes" class="project__chapter-tsplan-img simplecar__slide" data-simplecar-slide data-caption="Redrawn Routes" draggable="false">` +
                `<img src="metro/rp2.JPG" alt="Rough iteration of network map" class="project__chapter-tsplan-img simplecar__slide" data-simplecar-slide data-caption="Rough Iteration of Network Map" draggable="false">` +
              `</div>` +
            `</div>` +
            `<figcaption class="project__chapter-caption" data-simplecar-caption>Original Source Map</figcaption>` +
            `<div class="simplecar__dots" data-simplecar-dots>` +
              `<button type="button" class="simplecar__dot is-active" data-simplecar-dot aria-label="Slide 1"></button>` +
              `<button type="button" class="simplecar__dot" data-simplecar-dot aria-label="Slide 2"></button>` +
              `<button type="button" class="simplecar__dot" data-simplecar-dot aria-label="Slide 3"></button>` +
            `</div>` +
          `</figure>` +
          `<p class="project__chapter-description" style="margin-top: 120px;"><span class="project__chapter-description--flaw-subtitle"><span class="project__chapter-step-badge">2</span>Route Representations</span></p>` +
          `<div class="project__chapter-nt-row" style="margin-top: 26px; gap: 50px;">` +
          [
            ['2', 'Version A'],
            ['1', 'Version B'],
            ['3', 'Version C']
          ].map(([n, cap], idx) =>
            `<figure class="project__chapter-nt-figure" style="flex-grow: 1;">` +
              `<img src="metro/mp${n}.png" alt="Iteration ${n}" class="project__chapter-nt-img">` +
              `<figcaption class="project__chapter-caption" style="color: #0caaa2;">${cap}</figcaption>` +
              (idx === 0
                ? `<ul class="voice-eval__list" style="margin-top: 11.5px;">` +
                    `<li class="voice-eval__item">` +
                      `<span class="voice-eval__icon voice-eval__icon--pro">${tickSvg}</span>` +
                      `<span class="voice-eval__text">Truer to geography</span>` +
                    `</li>` +
                    `<li class="voice-eval__item">` +
                      `<span class="voice-eval__icon voice-eval__icon--con">${crossSvg}</span>` +
                      `<span class="voice-eval__text">Irregular, non-parallel runs slow scanning.</span>` +
                    `</li>` +
                    `<li class="voice-eval__item">` +
                      `<span class="voice-eval__icon voice-eval__icon--con">${crossSvg}</span>` +
                      `<span class="voice-eval__text">Gaps between lines read as noise &mdash; competes with station labels.</span>` +
                    `</li>` +
                  `</ul>`
                : idx === 2
                ? `<ul class="voice-eval__list" style="margin-top: 11.5px;">` +
                    `<li class="voice-eval__item">` +
                      `<span class="voice-eval__icon voice-eval__icon--pro">${tickSvg}</span>` +
                      `<span class="voice-eval__text">Parallel runs for the southeast corridor &mdash; scans faster and reads more evenly.</span>` +
                    `</li>` +
                    `<li class="voice-eval__item">` +
                      `<span class="voice-eval__icon voice-eval__icon--con">${crossSvg}</span>` +
                      `<span class="voice-eval__text">Adjacent lines are harder to differentiate &mdash; color must do all the separating work.</span>` +
                    `</li>` +
                  `</ul>`
                : idx === 1
                ? `<ul class="voice-eval__list" style="margin-top: 11.5px;">` +
                    `<li class="voice-eval__item">` +
                      `<span class="voice-eval__icon voice-eval__icon--con">${crossSvg}</span>` +
                      `<span class="voice-eval__text">Parallel angles across distant segments (blue &amp; orange) creates false visual links.</span>` +
                    `</li>` +
                  `</ul>`
                : '') +
            `</figure>`
          ).join('') +
          `</div>` +
          `<p class="project__chapter-description" style="margin-top: 70px;"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">Color Pairing</span>Primary colors are paired by region &mdash; blue and green north, red and orange south &mdash; so adjacent lines stay distinguishable while reading as complementary, not clashing.</p>` +
          `<p class="project__chapter-description" style="margin-top: 120px; margin-bottom: 8px;"><span class="project__chapter-description--flaw-subtitle"><span class="project__chapter-step-badge">3</span>First Iteration Design</span></p>` +
          `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">Information Clarity Over Redundancy</span>The first iteration removed any visual redundancies to make route tracing faster for passengers. They could easily trace among the network's 4 lines.</p>` +
          `<img src="metro/mfinal1.png" alt="Refined network layout" class="project__chapter-a2demo-video" style="margin-top: 34px;">` +
          `<p class="project__chapter-caption">First Map Iteration</p>` +
          `<p class="project__chapter-description" style="margin-top: 70px;"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">The Over-Simplification Trade-off...</span>However, 4 lines implied that inter-line travel required transfers. To fix this, I added line redundancies to better reflect real rider journeys.</p>` +
          `<p class="project__chapter-description" style="margin-top: 120px; margin-bottom: 8px;"><span class="project__chapter-description--flaw-subtitle"><span class="project__chapter-step-badge">5</span>Second Iteration Design</span></p>` +
          `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">So, where does the network benefit from redundancy?</span>The initial iteration had travel heavily concentrated along the Blue and Green lines, where many stations were key city hubs. To balance network load, I added two additional lines to integrate the previously isolated Red line. This expansion distributes traffic more evenly across the system.</p>` +
          `<img src="metro/mfinal2.png" alt="Refined network layout 2" class="project__chapter-a2demo-video" style="margin-top: 34px;">` +
          `<p class="project__chapter-caption">Final Map Design</p>`
        : !isDomicile
        ? ''
        : c.title === 'Character Design'
        ? ''
        : c.title === 'Project Overview'
        ? [
            '00-01 PROBLEM STATEMENT',
            '00-02 DESIGN INTERVENTION'
          ].map((label, idx) =>
            (idx === 0
              ? `<p class="project__chapter-description project__chapter-description--label">PROBLEM STATEMENT</p>` +
                `<p class="project__chapter-description" style="color: #000000; font-size: 24px; margin-bottom: 10px;">"How might we design experiences that break through passive media consumption to foster empathy?"</p>`
              : `<p class="project__chapter-description" style="margin-bottom: 140px;">Passive media consumption of displacement and suffering has left us desensitized to human tragedy. Our project doesn't demand activism, but rather creates space for personal confrontation with the real cost of conflict.</p>` +
                `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">1</span>How can we make people care?</span></p>` +
                `<div class="project__chapter-quotecallout-group">` +
                [
                  [
                    'Digital games put players in positions where mechanics force moral choices and value judgments, allowing players to experience the conflicts, dilemmas, and systemic pressures faced by refugee communities... facilitating empathy and critical literacy.',
                    'M. Santos &amp; A. R. L. da Silva (2024)',
                    '&ldquo;Papers, Please&rdquo;: Transpositions Between the Real and the Imaginary of Refugee Communities'
                  ],
                  [
                    'When players experience narrative engagement and identify with characters facing severe adversity, social cognitive processes&mdash;such as perspective-taking and emotional understanding&mdash;are amplified, resulting in significantly higher post-game prosocial intentions.',
                    'R. Wei et al. (2022)',
                    'Virtuous Virtual Worlds: How Character Identification and Narrative Transportation Drive Post-Play Prosociality'
                  ],
                  [
                    'Individual-level perspective-taking is more strongly linked to a feeling of empathy compared to group-level perspective-taking. Video games provide such an opportunity for players...',
                    'Sweeney Jing Li &amp; Zeph M. C. van Berlo (2025)',
                    'Video games for good: Active perspective-taking fosters empathy and reduces implicit bias toward gendered violence victims'
                  ]
                ].map(([quote, author, research]) =>
                  `<figure class="project__chapter-quotecallout">` +
                    `<span class="project__chapter-quotecallout-mark" aria-hidden="true">&ldquo;</span>` +
                    `<blockquote class="project__chapter-quotecallout-text">${quote}</blockquote>` +
                    `<figcaption class="project__chapter-quotecallout-attribution">` +
                      `<span class="project__chapter-quotecallout-author">${author}</span>` +
                      `<span class="project__chapter-quotecallout-research">${research}</span>` +
                    `</figcaption>` +
                  `</figure>`
                ).join('') +
                `</div>` +
                `<p class="project__chapter-description" style="margin-top: 70px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">2</span>Domicile is our approach to tackling this empathy crisis.</span>Domicile is a narrative game following two siblings left entirely alone to fend for themselves in a sudden environment of violence. When players take on perspectives of vulnerable children, every experience becomes intimate.</p>` +
                `<figure class="project__chapter-prompt" style="margin-top: 36px;">` +
                  `<div class="project__chapter-promptcar">` +
                    `<div class="simplecar" data-simplecar>` +
                      `<video src="capstonecollection/tsdemo.mp4" class="project__chapter-tsplan-img simplecar__slide is-active" data-simplecar-slide data-caption="Domicile Title Screen" autoplay loop muted playsinline></video>` +
                      `<video src="capstonecollection/a2demo.mp4" class="project__chapter-tsplan-img simplecar__slide" data-simplecar-slide data-caption="Arc 2 Preview" autoplay loop muted playsinline></video>` +
                    `</div>` +
                  `</div>` +
                  `<figcaption class="project__chapter-caption" data-simplecar-caption>Domicile Title Screen</figcaption>` +
                  `<div class="simplecar__dots" data-simplecar-dots>` +
                    `<button type="button" class="simplecar__dot is-active" data-simplecar-dot aria-label="Slide 1"></button>` +
                    `<button type="button" class="simplecar__dot" data-simplecar-dot aria-label="Slide 2"></button>` +
                  `</div>` +
                `</figure>`)
          ).join('')
        : c.title === 'Journal Mechanics & Animation'
        ? [
            'PART ONE: JOURNAL',
            'PART TWO: ANIMATION'
          ].map((label, idx) =>
            `<span class="project__chapter-tag${idx > 0 ? ' project__chapter-tag--below-gallery' : ''}"${idx === 0 ? ' style="margin-bottom: 8px;"' : idx === 1 ? ' style="margin-top: 140px; margin-bottom: 8px;"' : ''}>${label}</span>` +
            (idx === 0
              ? `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">1</span>Building a false sense of security through music and pacing.</span>I paired the sequence with a gentle, lullaby-themed soundtrack to emphasize childhood innocence, putting players at complete ease right before the jarring climax disrupts it.</p>` +
                `<video src="capstonecollection/prologue/introcr.mp4" class="project__chapter-a2demo-video project__chapter-introcr" controls playsinline></video>` +
                `<p class="project__chapter-description project__chapter-description--below-carousel project__chapter-description--group-gap" style="margin-top: 160px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">2</span>Engaging players early through simple, tactile micro-interactions.</span>To combat player fatigue during a text-heavy opening sequence, we added low-scope micro-interactions, like dragging and dropping polaroids to advance the page.</p>` +
                `<img src="capstonecollection/prologue/print.png" alt="${c.title} print" class="project__chapter-a2demo-video" style="margin-top: 36px;">` +
                `<div class="project__chapter-prentries project__chapter-prentries--wide-top">` +
                [1, 2, 3, 4].map(n =>
                  `<figure class="project__chapter-prentry">` +
                    `<img src="capstonecollection/prologue/e${n}.png" alt="${c.title} entry ${n}" class="project__chapter-prentry-img">` +
                    `<figcaption class="project__chapter-caption">Entry ${n}</figcaption>` +
                  `</figure>`
                ).join('') +
                `</div>` +
                `<p class="project__chapter-description project__chapter-description--below-carousel"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">3</span>Analyzing TikTok posts to model authentic children's speech.</span>Analyzing tiktoks of childhood journals, letters to Santa, and teacher-shared worksheets, revealed three distinct writing patterns: phonetic spelling, hyper-literal reasoning, and sudden subject transitions. These were implemented across all journal entries and in-game dialogue.</p>` +
                `<p class="project__chapter-description project__chapter-description--subtitle-pair" style="margin-top: 70px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">4</span>Editing for UX: Prioritizing Player Engagement and Game Momentum.</span>Playtesters flagged that four consecutive text-heavy entries slowed game momentum. Re-evaluating the writing from a UX perspective, I cut down text, preserving the core narrative without slowing player progression.</p>`
              : idx === 1
              ? `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">How abrupt shifts in tone immerse players in character panic.</span>Part 2 was deliberately designed to juxtapose Part 1&rsquo;s slow pacing, reflecting a traumatic memory response: fragmented, spotty, and rapidly shifting. I removed the soundtrack entirely, using sudden silence to jar the player into high tension.</p>` +
                `<div class="project__chapter-square-placeholders-block" style="margin-top: 36px;">` +
                  `<video src="capstonecollection/prologue/animation/aniclimax.mp4" class="project__chapter-a2demo-video" controls playsinline></video>` +
                `</div>`
              : `<p class="project__chapter-description">${label} — placeholder text. Replace with the writing for this section: what it covers, the decisions behind it, and what it led to.</p>`)
          ).join('')
        : c.title === 'Interaction Design'
        ? [
            'PROLOGUE JOURNAL MECHANICS',
            'SPATIAL UI: ARC 1',
            'ARC 2 EXPLORATION UX'
          ].map((label, idx) =>
            `<span class="project__chapter-tag${idx > 0 ? ' project__chapter-tag--below-gallery' : ''}"${idx === 0 ? ' style="margin-bottom: 8px;"' : idx === 1 ? ' style="margin-top: 140px; margin-bottom: 8px;"' : idx === 2 ? ' style="margin-top: 140px; margin-bottom: 8px;"' : ''}>${label}</span>` +
            // 04-03: previous vs. current proximity prompt comparison (pr1, s1).
            // Group: subtitle/paragraph, then the 2 videos below it, at the
            // same 27px internal gap the other groups use (--tight-top).
            (idx === 2
              ? `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">1</span>Replacing awkward proximity prompts and fixing the "phantom limb" cursor limitation.</span> Disabled mouse controls gave playtesters a frustrating "phantom limb" experience. In addition, the magnifying glass prompt felt visually out of place. I designed a high-contrast 'F' key prompt and added dual keyboard-and-mouse support, to allow total input freedom.</p>` +
                `<div class="project__chapter-prompts project__chapter-prompts--tight-top">` +
                [['pr1', 'Previous Proximity Prompt'], ['s1', 'Current Proximity Prompt']].map(([id, cap]) =>
                  `<figure class="project__chapter-prompt">` +
                    `<video src="capstonecollection/uiux/arc2/${id}.mp4" class="project__chapter-prompt-img" autoplay loop muted playsinline></video>` +
                    `<figcaption class="project__chapter-caption">${cap}</figcaption>` +
                  `</figure>`
                ).join('') +
                `</div>` +
                // Group 2: subtitle/paragraph, then the pr3/pr4 + s2/s3 row,
                // then a closing subtitle/paragraph below it — same internal
                // gap (--tight-top) and group-to-group gap (--group-gap) as
                // the other groups.
                `<p class="project__chapter-description project__chapter-description--below-carousel project__chapter-description--group-gap" style="margin-top: 140px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">2</span>Reusing the same arrow icon for both player locations and secondary inspection created severe UI inconsistency.</span> Secondary inspection for nested views relied on the same arrow icon used for player location tracking. To resolve this conflict, I consolidated all interaction triggers under the circular 'F' key prompt to reinforce a unified and intuitive UX pattern.</p>` +
                `<p class="project__chapter-description project__chapter-description--subtitle-pair" style="margin-top: 70px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">3</span>Mini-window close-ups created too much visual noise.</span> Restricting close-ups to small pop-up frames broke exploration flow and overwhelmed the display with stacked UI layers. By shifting close-up views to full-screen, I eliminated this clutter and reinforced an intimate first-person perspective.</p>` +
                `<div class="project__chapter-prompts project__chapter-prompts--tight-top">` +
                  `<figure class="project__chapter-prompt">` +
                    `<div class="project__chapter-promptcar">` +
                      `<div class="simplecar" data-simplecar>` +
                        `<img src="capstonecollection/uiux/arc2/pr3.png" alt="${c.title} Arc 2 interaction" class="project__chapter-tsplan-img simplecar__slide is-active" data-simplecar-slide data-caption="Ineffective UI Stacking" draggable="false">` +
                        `<img src="capstonecollection/uiux/arc2/pr4.png" alt="${c.title} Arc 2 interaction" class="project__chapter-tsplan-img simplecar__slide" data-simplecar-slide data-caption="Inconsistent Interaction Cues" draggable="false">` +
                      `</div>` +
                    `</div>` +
                    `<figcaption class="project__chapter-caption" data-simplecar-caption>Ineffective UI Stacking</figcaption>` +
                    `<div class="simplecar__dots" data-simplecar-dots>` +
                      `<button type="button" class="simplecar__dot is-active" data-simplecar-dot aria-label="Image 1"></button>` +
                      `<button type="button" class="simplecar__dot" data-simplecar-dot aria-label="Image 2"></button>` +
                    `</div>` +
                  `</figure>` +
                  `<figure class="project__chapter-prompt">` +
                    `<div class="project__chapter-promptcar">` +
                      `<div class="simplecar" data-simplecar>` +
                        `<img src="capstonecollection/uiux/arc2/s2.png" alt="${c.title} current interaction" class="project__chapter-tsplan-img simplecar__slide is-active" data-simplecar-slide data-caption="Standardizing Interaction Triggers with a Unified 'F' Prompt" draggable="false">` +
                        `<img src="capstonecollection/uiux/arc2/s3.png" alt="${c.title} current interaction" class="project__chapter-tsplan-img simplecar__slide" data-simplecar-slide data-caption="Standardizing Interaction Triggers with a Unified 'F' Prompt" draggable="false">` +
                      `</div>` +
                    `</div>` +
                    `<figcaption class="project__chapter-caption" data-simplecar-caption>Standardizing Interaction Triggers with a Unified 'F' Prompt</figcaption>` +
                    `<div class="simplecar__dots" data-simplecar-dots>` +
                      `<button type="button" class="simplecar__dot is-active" data-simplecar-dot aria-label="Image 1"></button>` +
                      `<button type="button" class="simplecar__dot" data-simplecar-dot aria-label="Image 2"></button>` +
                    `</div>` +
                  `</figure>` +
                `</div>` +
                // Group 4: subtitle/paragraph, then the pr2 + s4–s6 row below
                // it — same shape and spacing as the earlier groups
                // (--tight-top internal gap, --group-gap between the groups).
                `<p class="project__chapter-description project__chapter-description--below-carousel project__chapter-description--group-gap" style="margin-top: 140px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">4</span>Oversized dialogue boxes crowded close-up assets, reducing text readability.</span> Oversized dialogue boxes and rigid layout frames cramped objects making text difficult to read. I resolved this spatial conflict by layering narration over the full-screen close-up and hiding the top-right HUD during inspection to give assets more room.</p>` +
                `<p class="project__chapter-description project__chapter-description--subtitle-pair" style="margin-top: 70px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">5</span>Premature dialogue triggers outpaced object inspection, causing player confusion.</span> Triggering dialogue prior to inspection left players processing conversations without object context. So, I restructured the event logic into an intuitive, step-by-step sequence: Inspect Asset &rarr; Read/View Content &rarr; Exit View &rarr; Trigger Dialogue.</p>` +
                // Third comparison row: pr2 image beside an s4–s6 carousel.
                `<div class="project__chapter-prompts project__chapter-prompts--tight-top">` +
                  `<figure class="project__chapter-prompt">` +
                    `<img src="capstonecollection/uiux/arc2/pr2.png" alt="${c.title} Arc 2 interaction" class="project__chapter-prompt-img">` +
                    `<figcaption class="project__chapter-caption">Poor Readability of Assets</figcaption>` +
                  `</figure>` +
                  `<figure class="project__chapter-prompt">` +
                    `<div class="project__chapter-promptcar">` +
                      `<div class="simplecar" data-simplecar>` +
                        [4, 6, 5].map((n, i) =>
                          `<img src="capstonecollection/uiux/arc2/s${n}.png" alt="${c.title} current interaction" class="project__chapter-tsplan-img simplecar__slide${i === 0 ? ' is-active' : ''}" data-simplecar-slide data-caption="Stacking Temporary Overlays for Full-Screen Close-Ups" draggable="false">`
                        ).join('') +
                      `</div>` +
                    `</div>` +
                    `<figcaption class="project__chapter-caption" data-simplecar-caption>Stacking Temporary Overlays for Full-Screen Close-Ups</figcaption>` +
                    `<div class="simplecar__dots" data-simplecar-dots>` +
                      [4, 5, 6].map((n, i) =>
                        `<button type="button" class="simplecar__dot${i === 0 ? ' is-active' : ''}" data-simplecar-dot aria-label="Image ${i + 1}"></button>`
                      ).join('') +
                    `</div>` +
                  `</figure>` +
                `</div>`
              : '') +
            // 04-01: prologue journal mechanics — two images side by side.
            (idx === 0
              ? // Group 1: subtitle/paragraph, then its own carousel, at the
                // group's internal 27px paragraph→carousel gap (--tight-top).
                `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">1</span>Inverted visual hierarchy overscaled polaroid assets, reducing journal readability.</span> I reorganized the layout by proportionately scaling assets to restore readability. To fix the erratic size jumps of polaroids during interactions, I stabilized default, hover, and release transitions using a continuous scale curve.</p>` +
                `<div class="project__chapter-prompts project__chapter-prompts--tight-top">` +
                  `<figure class="project__chapter-prompt">` +
                    `<video src="capstonecollection/uiux/prologue/jpr1.mp4" class="project__chapter-prompt-img" autoplay loop muted playsinline></video>` +
                    `<figcaption class="project__chapter-caption">Disproportionate Assets &amp; Layout Clutter</figcaption>` +
                  `</figure>` +
                  `<figure class="project__chapter-prompt">` +
                    `<video src="capstonecollection/uiux/prologue/js1.mp4" class="project__chapter-prompt-img" autoplay loop muted playsinline></video>` +
                    `<figcaption class="project__chapter-caption">Stabilized Interaction Sequence</figcaption>` +
                  `</figure>` +
                `</div>` +
                // Group 2: same shape as group 1 — subtitle/paragraph (badge 2 +
                // placeholder body copy) then its own carousel (ppr2 + ps4/ps5),
                // at the SAME 27px internal gap via the same --tight-top class.
                // The group-to-group gap above this subtitle is --below-carousel
                // (34px), unchanged from when it sat directly after group 1's
                // carousel — it still does.
                `<p class="project__chapter-description project__chapter-description--below-carousel project__chapter-description--group-gap" style="margin-top: 140px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">2</span>Competing feedback loops prompted impulse clicking over reading.</span> The simultaneous cues encouraged players to bypass the narrative text. I resolved this by enforcing a linear event sequence (Left Text Animation &rarr; Prompt &rarr; Drag &amp; Drop &rarr; Right Text Animation &rarr; Continue). Gating player input ensured time to process text before acting.</p>` +
                `<div class="project__chapter-prompts project__chapter-prompts--tight-top">` +
                  `<figure class="project__chapter-prompt">` +
                    `<video src="capstonecollection/uiux/prologue/jpr2.mp4" class="project__chapter-prompt-img" autoplay loop muted playsinline></video>` +
                    `<figcaption class="project__chapter-caption">Simultaneous Trigger Overlap</figcaption>` +
                  `</figure>` +
                  `<figure class="project__chapter-prompt">` +
                    `<div class="project__chapter-promptcar project__chapter-promptcar--tall">` +
                      `<div class="simplecar" data-simplecar>` +
                        `<img src="capstonecollection/uiux/prologue/ps4.png" alt="${c.title} prologue journal" class="project__chapter-tsplan-img simplecar__slide is-active" data-simplecar-slide data-caption="Linear Event Sequencing" draggable="false">` +
                        `<img src="capstonecollection/uiux/prologue/ps5.png" alt="${c.title} prologue journal" class="project__chapter-tsplan-img simplecar__slide" data-simplecar-slide data-caption="Linear Event Sequencing" draggable="false">` +
                      `</div>` +
                    `</div>` +
                    `<figcaption class="project__chapter-caption" data-simplecar-caption>Linear Event Sequencing</figcaption>` +
                    `<div class="simplecar__dots" data-simplecar-dots>` +
                      `<button type="button" class="simplecar__dot is-active" data-simplecar-dot aria-label="Image 1"></button>` +
                      `<button type="button" class="simplecar__dot" data-simplecar-dot aria-label="Image 2"></button>` +
                    `</div>` +
                  `</figure>` +
                `</div>`
              : '') +
            // 04-02: Arc 1 spatial UI — one centred carousel: appr1 (first
            // iteration) then apr1/apr2 (second), each with its own caption.
            (idx === 1
              ? // 16:9 box + cover trims apr2's baked-in black letterbox bars and
                // keeps all three the same height (appr1/apr1 are already ~16:9).
                `<p class="shelf__title shelf__title--prentries" style="font-size: 17px;">Previous Interaction Design</p>` +
                `<div class="project__chapter-prentries project__chapter-prentries--crop16">` +
                  [['appr1', 'First Iteration of Arc 1'], ['apr1', 'Second Iteration of Arc 1 &ndash; Ground Floor'], ['apr2', 'Second Iteration of Arc 1 &ndash; First Floor']].map(([id, cap]) =>
                    `<figure class="project__chapter-prentry">` +
                      `<img src="capstonecollection/uiux/arc1/${id}.png" alt="${c.title} Arc 1 spatial UI" class="project__chapter-prentry-img">` +
                      `<figcaption class="project__chapter-caption">${cap}</figcaption>` +
                    `</figure>`
                  ).join('') +
                `</div>` +
                // Group: the 3 images above, this subtitle/paragraph, and the
                // video below are one group.
                `<p class="project__chapter-description project__chapter-description--below-carousel" style="margin-top: 70px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">1</span>How might we refine raw stealth UI cues without cluttering the gameplay view?</span> Sound rings, off-center vision cones, and z-index bugs made early stealth visuals feel unrefined. Benchmarking industry standards, I removed the sound ring, anchored the vision cone to a sleek origin point, and replaced the static player icon with an animated marker for instant visual clarity.</p>` +
                `<div class="project__chapter-square-placeholders-block" style="margin-top: 70px;">` +
                  `<p class="shelf__title" style="font-size: 17px;">Revised Interaction</p>` +
                  `<video src="capstonecollection/uiux/arc1/raidemo.mp4" class="project__chapter-a2demo-video" autoplay loop muted playsinline></video>` +
                `</div>`
              : '')
          ).join('')
        : c.title === 'Worldbuilding & Design'
        ? `<span class="project__chapter-tag">SPATIAL MAPPING &amp; LAYOUT</span>` +
          // Static spatial-plan image (formerly one card of the coverflow
          // carousel) — same width/border/ratio it always rendered at. Image
          // leads, text follows.
          `<div class="project__chapter-nplan">` +
            `<img src="capstonecollection/arc2/nplan1.png" alt="${c.title} spatial plan" class="project__chapter-nplan-img">` +
            `<p class="project__chapter-caption project__chapter-nplan-caption">Spatial Mapping &amp; Room Layout</p>` +
            `<p class="project__chapter-caption project__chapter-nplan-caption--note">(Yellow marks assets completed at the time of this snapshot.)</p>` +
          `</div>` +
          `<p class="project__chapter-description project__chapter-description--below-carousel" style="margin-top: 60px;"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">Delivering narrative through purposeful environment exploration.</span>Arc 2 relies entirely on environmental storytelling. As the sole asset artist, I scoped the neighbor's house to a single-floor layout. A two-story structure would have spread our limited assets across dead space, whereas one floor allowed for more purposeful object placement.</p>` +
          `<span class="project__chapter-tag project__chapter-tag--below-gallery" style="margin-top: 140px; margin-bottom: 8px;">ENVIRONMENTAL ASSETS</span>` +
          `<p class="project__chapter-description"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">1</span>Expressing character personality through visual contrast.</span>Taking over Arc 2 led to an unavoidable change in art style. Instead of recycling Arc 1 assets, I redesigned the neighbor's home with a vibrant palette to reflect his eccentric personality. Grounding this aesthetic shift in character lore made the artist handoff feel organic and intentional.</p>` +
          `<div class="project__chapter-furniture-frame">` +
            `<img src="capstonecollection/arc2/furniture/furniture.png" alt="${c.title} furniture" class="project__chapter-furniture-img">` +
          `</div>` +
          `<p class="project__chapter-caption project__chapter-description--below-furniture">Environment Assets</p>` +
          `<div class="project__chapter-wgallery">` +
          [
            ['wakit', 'Kitchen Tiles'],
            ['watoi', 'Bathroom Tiles'],
            ['wliv', 'Living Room Tiles'],
            ['wbed', 'Bedroom Tiles']
          ].map(([n, caption]) =>
            `<figure class="project__chapter-wgallery-figure">` +
              `<img src="capstonecollection/arc2/furniture/${n}.png" alt="${c.title} ${n}" class="project__chapter-wgallery-img">` +
              `<figcaption class="project__chapter-caption">${caption}</figcaption>` +
            `</figure>`
          ).join('') +
          `</div>` +
          `<p class="project__chapter-description project__chapter-description--below-wgallery project__chapter-description--group-gap" style="margin-top: 60px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">2</span>Depicting post-raid disarray through weathered textures and damage.</span>Creating a post-raid state required more than weathered textures. However, randomly angled furniture proved too geometrically complex for a top-down view. To work within this constraint, I pivoted to portraying grid-aligned assets that appeared to be knocked over, looted, or broken.</p>` +
          `<div class="project__chapter-mapgallery" style="margin-top: 60px;">` +
          [
            ['kit', 'Kitchen', 0.875],
            ['toi', 'Bathroom', 0.863],
            ['liv', 'Living Room', 0.875],
            ['bed', 'Bedroom', 0.872]
          ].map(([n, caption, ratio]) =>
            `<figure class="project__chapter-mapgallery-figure" style="flex-grow:${ratio}">` +
              `<img src="capstonecollection/arc2/maps/${n}.png" alt="${c.title} ${n}" class="project__chapter-mapgallery-img">` +
              `<figcaption class="project__chapter-caption">${caption}</figcaption>` +
            `</figure>`
          ).join('') +
          `</div>` +
          `<div class="project__chapter-nhouse-frame">` +
            `<img src="capstonecollection/arc2/maps/finalmap/nhouse.png" alt="${c.title} final environment layout" class="project__chapter-nhouse-img">` +
          `</div>` +
          `<p class="project__chapter-caption project__chapter-description--below-nhouse">Final Environment Layout</p>` +
          `<span class="project__chapter-tag project__chapter-tag--below-gallery" style="margin-top: 140px;">OBJECT ARCHITECTURE</span>` +
          `<div class="project__chapter-objgallery">` +
            `<img src="capstonecollection/arc2/nplan2.png" alt="${c.title} asset distribution" class="project__chapter-objgallery-img">` +
            `<p class="project__chapter-caption project__chapter-objgallery-caption">Spatial Interaction Map</p>` +
          `</div>` +
          `<p class="project__chapter-description project__chapter-description--below-objgallery"><span class="project__chapter-description--flaw-subtitle" style="line-height: 41.8px;">Item Scoping &amp; Prop Distribution</span>I finalized the object list, keeping asset scope tight and zero-filler. Placement followed two rules: room-contextual relevance and tiered discoverability (rewarding thorough exploration with hidden lore). Designing props to be self-contained meant the narrative landed, regardless of the player's exploration order.</p>` +
          // Object shelf: every object shot in one horizontally-scrolling row,
          // all sharing a bottom baseline (align-items:flex-end). Each item has a
          // caption placeholder; native overflow-x gives the horizontal scrollbar.
          `<div class="shelf-block" style="margin-top: 60px;">` +
          `<p class="shelf__title">Object Closeup: Storytelling Through Design</p>` +
          `<div class="shelf">` +
          `<div class="shelf__scroll">` +
          `<div class="shelf__track">` +
          [
            // newspapers
            ['3', 'KitchenTableNewspaper@3x.png', 'Kitchen, Dining Table', 'Newspaper Clipping#1 – Father detained under the National Security Act'],
            ['3', 'KitchenBinNewspaper@3x.png', 'Kitchen, Trash Bin', 'Newspaper Clipping#2 – Detainees executed under the National Security Act. Resistance moves underground.'],
            ['2', 'LivingRoomTableNewspaper@3x.png', 'Living Room, Table', 'Newspaper Clipping#3 – Civic Hall defaced overnight, removed before dawn. Patrols tighten.']
          ].map(([folder, file, cap1, cap2]) =>
            `<figure class="shelf__item">` +
              `<img src="capstonecollection/arc2/objects/${folder}/${file}" alt="${c.title} object" class="shelf__img" draggable="false">` +
              `<figcaption class="shelf__caption">${cap1 || 'Caption placeholder'}</figcaption>` +
              `<p class="shelf__caption shelf__caption--sub">${cap2 || 'Caption placeholder'}</p>` +
            `</figure>`
          ).join('') +
          // posters: a 2-col grid — each image keeps its own 1st caption, and
          // the shared 2nd caption spans both columns (see .shelf__item--pair).
          `<figure class="shelf__item shelf__item--pair">` +
            `<img src="capstonecollection/arc2/objects/3/KitchenBinPoster@3x.png" alt="${c.title} object" class="shelf__img" draggable="false">` +
            `<img src="capstonecollection/arc2/objects/7/BBedPoster@3x.png" alt="${c.title} object" class="shelf__img" draggable="false">` +
            `<p class="shelf__caption">Kitchen, Trash Bin</p>` +
            `<p class="shelf__caption">Bedroom, Bed</p>` +
            `<figcaption class="shelf__caption shelf__caption--sub">State propaganda uses title phrase to justify informing on neighbors, framing surveillance as loyalty. Poster uses watching eyes as a visual threat to invoke paranoia. The resistance poster reuses headline for solidarity. The color and imagery highlight the ideological split.</figcaption>` +
          `</figure>` +
          [
            // flags
            ['7', 'ClosetDrawerFlag@3x.png', 'Bedroom, Closet', 'The flag continues the abrasive palette, with colors separated by white borders to visually enforce segregation. Its emblem, a vulture, inverts the usual symbolism of national birds, replacing aspiration and power with an animal that feeds on others\' ruin and misfortune.'],
            ['7', 'BBedFlag@3x.png', 'Bedroom, Bed', 'The resistance flag, by contrast, uses the ironwood sapling — the former national emblem — as its central motif, in memory of the peace that existed before the regime burned the forests down. Its palette reflects that shift: colors blend and embrace rather than separate.'],
            // wide pair
            ['2', 'LPinkTableSapling@3x.png', 'Living Room, Side Table', 'An ironwood sapling, hiding in plain sight — a symbol of resistance, yet its condition is widely unknown. In juvenile form, it maintains a mystical, fantastical look; only at maturity does it shed skin to assume the appearance of an ordinary tree.'],
            ['7', 'BedsideTablePictureFrame@3x.png', 'Bedroom, Bedside Table', 'The protagonist\'s parents alongside a neighbor wearing an ironwood seed emblem t-shirt.'],
            // remaining
            ['7', 'BedroomDeskDrawerBadgeCloseup@3x.png', 'Bedroom, Desk Drawer', 'Badge is designed around the ironwood seed motif— a symbol for growth and the hope of a better future.'],
            ['7', 'BedroomPictureFrame@3x.png', 'Bedroom, Desk', 'A picture frame showing Stix and the neighbor posing, both wearing matching resistance badges.'],
            ['7', 'NeighborJournal@3x.png', 'Bedroom, Desk', 'The neighbor\'s journal, recounting the days before the regime\'s indiscriminate raids.']
          ].map(([folder, file, cap1, cap2]) =>
            `<figure class="shelf__item">` +
              `<img src="capstonecollection/arc2/objects/${folder}/${file}" alt="${c.title} object" class="shelf__img" draggable="false">` +
              `<figcaption class="shelf__caption">${cap1 || 'Caption placeholder'}</figcaption>` +
              `<p class="shelf__caption shelf__caption--sub">${cap2 || 'Caption placeholder'}</p>` +
            `</figure>`
          ).join('') +
          `</div>` +
          `</div>` +
          `</div>` +
          `</div>`
        : '';

      // Malibu-Baddie chapter 01 — the fabrication photo wall (robot/collage).
      // Pinned polaroid cards, but sized the same way the old collage was:
      // justified rows where each figure's flex-grow is its own image's w/h
      // ratio, so every photo in a row renders at the SAME height, full-bleed
      // and UNCROPPED (no object-fit crop — width 100%, height auto), with the
      // row filling edge to edge and only a hairline gap between cards, so the
      // wall reads as touching tiles rather than a gapped grid. Each card still
      // gets its pin + cream paper mat + a slight rotation, and its title/
      // caption fade in as a small overlay chip on hover (see .robotwall__caption).
      const robotWallRows = [
        [[14, 508, 890, -2], [9, 1004, 1342, 1],  [3, 856, 1498, -2],  [20, 594, 1022, 1]],
        [[11, 666, 888, -1], [6, 668, 1192, 2],   [19, 504, 856, -1],  [2, 546, 966, 1]],
        [[5, 672, 1190, -2], [16, 502, 828, 1],   [13, 500, 652, -1],  [8, 498, 898, 2]],
        [[21, 664, 1188, -1], [12, 502, 892, 1],  [4, 670, 1186, -2],  [10, 668, 894, 1]],
        [[18, 510, 856, 2],  [1, 780, 1032, -1],  [15, 520, 926, 1],   [7, 504, 892, -2]]
      ];
      // Real captions, keyed by photo number — everything else still gets the
      // generic placeholder until its own caption is written.
      const robotWallCaptions = {
        1: 'Putting together reinforced cardboard panels to make the lower body.',
        2: 'Adding right-angled gussets from scrap cardboard to strengthen internal structure of lower body.',
        3: 'Fiddling with the waist motor, trying to mark screw positions...',
        4: 'Adding  support beams onto the wheel base, all the while, cleaning up wires with cable ties.',
        5: 'Securing the lower body onto the wheel base using an L-bridge.',
        6: 'Inside of the lower body where the waist motor is attached.',
        7: 'Gluing shoulders onto the upper torso.',
        8: 'Building the forearms. Unsure where and how to attach the elbow motor but onwards we go!',
        9: 'Getting the receiver and transmitter to communicate. Turns out the problem was backwards wiring—an easy fix that has us floundering with code for many hours.',
        10: 'Adjusting angles on code to achieve more natural movement.',
        11: 'Testing code on the newly added elbow motor. Yay, it moved!',
        12: 'Milestone pic ❤️ Appreciating our handiwork. We’ve come a long way!',
        13: 'Day ??? of testing movement to soothe our anxieties about sudden malfunctioning of code —our greatest fear.',
        14: 'Multiple different lip size swatches to avoid back-and-forth trips to the printer.',
        15: 'Hand flap kept falling so made upgrades to secure these in place. Also testing movement to check if anymore changes needed to be made.',
        16: 'Adding in LED strips to the head for eyebrows! (lower strips: default eyebrow; upper strips: raised eyebrows)',
        18: 'Playing around with the costume. Very fancy~',
        19: 'Soldering loose wire onto back of LED strips. A very finicky process requiring multiple redos...',
        20: 'Final Performance Complete!',
        21: 'Arm falls off during rehearsal, 20 mins before the performance.'
      };
      const robotWallHtml = (isCardboard && c.title === 'Fabrication Overview')
        ? `<div class="robotwall" style="margin-top: 27px;">` +
          robotWallRows.map(row =>
            `<div class="robotwall__row">` +
            row.map(([n, w, h, rot]) =>
              `<div class="robotwall__card" style="flex-grow:${(w / h).toFixed(4)}; transform: rotate(${rot}deg);">` +
                `<span class="robotwall__pin" aria-hidden="true"></span>` +
                `<div class="robotwall__paper">` +
                  `<img src="robot/collage/${n}.png" alt="Malibu-Baddie fabrication photo ${n}" class="robotwall__photo" loading="lazy" draggable="false">` +
                  `<div class="robotwall__caption">` +
                    `<p class="robotwall__desc">${robotWallCaptions[n] || 'Malibu-Baddie fabrication.'}</p>` +
                  `</div>` +
                `</div>` +
              `</div>`
            ).join('') +
            `</div>`
          ).join('') +
          `</div>` +
          `<p class="project__chapter-description" style="margin-top: 140px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;">All completed with 22 dialogue lines and accompanying actions!</span></p>` +
          `<p class="project__chapter-description">To avoid repetitive motion (dino-arm lifts, hand clacking, and waist twists), we varied actions for each line. For instance, a waist twist to express needy demeanor, or a one arm lift to accent key dialogue points. We also introduced slight staggers to certain movements to give the robot a more human cadence.</p>`
        : '';

      // Scrubber carousel: SCRUB_STOPS discrete stops on a draggable rail; each
      // stop shows one slide. Each slide is a CONTAINER meant to hold 3 images
      // (placeholder boxes for now — swap them for <img>s later). initScrubCarousel
      // wires up the drag/snap behaviour after this HTML is inserted.
      const SCRUB_STOPS = 3;
      const gifDir = 'capstonecollection/characterdesign/gifs';
      // Images shown per stop. Stop 0 holds the "p" turnaround gifs, stop 1
      // holds the "pre" turnaround gifs, stop 2 holds the plain turnaround gifs.
      const scrubSlides = [
        [`${gifDir}/pfront.gif`, `${gifDir}/pback.gif`, `${gifDir}/pleft.gif`],
        [`${gifDir}/prefront.gif`, `${gifDir}/preback.gif`, `${gifDir}/preleft.gif`],
        [`${gifDir}/front.gif`, `${gifDir}/back.gif`, `${gifDir}/left.gif`]
      ];
      // Each gif's own width/height ratio (real pixel dims), used as flex-grow
      // so every slide's 3 gifs scale up to fill the full row width at equal
      // height, instead of staying at a fixed size with the leftover space
      // pushed into the gaps between them.
      const scrubAspects = [
        [405, 405, 439],
        [405, 405, 439],
        [405, 778, 433]
      ];
      const scrubCarouselHtml = image2Tag
        ? `<div class="scrubcar-group">` +
          `<p class="shelf__title shelf__title--scrubcar hover-title">Slide to view walk cycle evolution.</p>` +
          `<div class="scrubcar" data-scrubcar>` +
            `<div class="scrubcar__stage">` +
            Array.from({ length: SCRUB_STOPS }, (_, s) => {
              const imgs = scrubSlides[s];
              const inner = imgs
                ? imgs.map((src, k) =>
                    `<img src="${src}" alt="${c.title} pre ${k + 1}" class="scrubcar__img" style="flex-grow:${scrubAspects[s][k]}">`
                  ).join('')
                : `<div class="scrubcar__img-box"></div>`.repeat(3);
              const captions = [
                'Movement works upfront but fails in sideview...',
                'Much more fluid, but movement feels too mechanical.',
                'Success!'
              ];
              const imgsClass = s < 2 ? 'scrubcar__imgs scrubcar__imgs--wide-gap' : 'scrubcar__imgs';
              return `<div class="scrubcar__slide${s === 0 ? ' is-active' : ''}">` +
                `<div class="${imgsClass}">` + inner + `</div>` +
                `<p class="scrubcar__caption">${captions[s]}</p>` +
              `</div>`;
            }).join('') +
            `</div>` +
            `<div class="scrubcar__scrubber">` +
              `<div class="scrubcar__track" data-scrubcar-track>` +
                `<div class="scrubcar__line"></div>` +
                `<div class="scrubcar__fill" data-scrubcar-fill></div>` +
                Array.from({ length: SCRUB_STOPS }, (_, s) =>
                  `<span class="scrubcar__tick" style="left:${(s / (SCRUB_STOPS - 1)) * 100}%"></span>`
                ).join('') +
                `<button type="button" class="scrubcar__knob" data-scrubcar-knob role="slider" aria-label="Carousel position" aria-valuemin="1" aria-valuemax="${SCRUB_STOPS}" aria-valuenow="1"></button>` +
              `</div>` +
            `</div>` +
          `</div>` +
          `</div>`
        : '';

      return (
        (tag ? `<span class="project__chapter-tag">${tag}</span>` : '') +
        tagDescription +
        robotWallHtml +
        (image ? `<img src="${image}" alt="${c.title}" class="project__chapter-image">` : '') +
        deckHtml +
        (galleryTag ? `<span class="project__chapter-tag project__chapter-tag--below-gallery" style="margin-top: 140px;">${galleryTag}</span>` : '') +
        (galleryTag ? `<img src="capstonecollection/characterdesign/2.png" alt="${c.title} 2" class="project__chapter-image2" style="margin-top: 36px;">` : '') +
        (galleryTag ? `<p class="project__chapter-description project__chapter-description--below-image2img"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">1</span>Pivoting from 2D to Pixel Art</span> Initial lo-fi sketches and illustrations helped define our core visual concept, but stylistic differences between artists would impact visual consistency. So, we pivoted to pixel art, which enforced a more cohesive aesthetic.</p>` : '') +
        (image2Tag ? `<p class="project__chapter-description project__chapter-description--below-tag3 project__chapter-description--group-gap" style="margin-top: 70px;"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">2</span>Manual Pixelation &amp; Tool Selection</span> Automated pixelation led to blurry conversions, forcing me to pivot to manual creation. Illustrator&rsquo;s Live Paint tool was most ideal as it allowed cell-based grid filling, providing precise control over pixel placement.</p>` : '') +
        (image2Tag
          ? `<div class="project__chapter-placeholders-block" style="margin-top: 140px;">` +
            `<p class="project__chapter-placeholders-subtitle hover-title">Asset Evolution Pipeline</p>` +
            `<div class="project__chapter-placeholders">` +
            [
              'Concept Illustration',
              'AI-Generated Asset Reference',
              'Final Production Sprite Sheet'
            ].map((caption, idx) => {
              const n = idx + 1;
              // Natural widths of 3_1/3_2/3_3.png (all share one height), used
              // as flex-grow so the row fills 100% at equal height.
              const grow = [2331, 8119, 8119][idx];
              return `<figure class="project__chapter-placeholder-figure project__chapter-placeholder-figure--fill" style="flex-grow:${grow}">` +
                `<img src="capstonecollection/characterdesign/3_${n}.png" alt="${c.title} 3 ${n}" class="project__chapter-placeholder-box project__chapter-placeholder-box--fill">` +
                `<figcaption class="project__chapter-placeholder-caption">${caption}</figcaption>` +
              `</figure>`;
            }).join('') +
            `</div>` +
            `</div>`
          : '') +
        // Group: subtitle 2 (above) + the 3 images + this closing
        // subtitle/paragraph are one group.
        (image2Tag ? `<p class="project__chapter-description project__chapter-description--below-placeholders"><span class="project__chapter-description--flaw-subtitle" style="text-transform: none; color: #000000; font-size: 28px; line-height: 41.8px;"><span class="project__chapter-step-badge">3</span>Leveraging Gemini for 2D-to-Pixel Style Translation</span> Sprite references generated by Gemini provided a useful template. The biggest challenge, however, was creating sprites for walk cycles. To ensure animation quality, I reviewed frames in sequence to catch continuity breaks, polishing these across multiple iterations.</p>` : '') +
        scrubCarouselHtml +
        (image2Tag ? `<p class="project__chapter-description project__chapter-description--below-scrubcar">With those edits applied across the board, a full set of sprites was completed!</p>` : '') +
        (image2Tag ? `<div class="project__chapter-sprites-frame"><img src="capstonecollection/characterdesign/sprites.png" alt="${c.title} sprites" class="project__chapter-sprites"></div>` : '') +
        (tag || tagDescription || robotWallHtml ? '' : `<p class="placeholder-text">${placeholderText}</p>`) +
        voiceHtml);
    }
  }

  // ---- Render every chapter, stacked, into one continuous scroll ----
  // Each chapter is its own <section> led by a "NUM Title" heading, so the
  // sections read as one document instead of swapping in and out.
  const host = document.querySelector('[data-chapters]');
  if (host) {
    host.innerHTML = data.map((c, i) =>
      `<section class="project__chapter-section" data-chapter-section id="chapter-${i}">` +
        `<h2 class="project__chapter-heading">` +
          `<span class="project__chapter-heading-num">${c.num}</span>` +
          `<span class="project__chapter-heading-title">${c.title}</span>` +
        `</h2>` +
        chapterBodyHtml(c) +
      `</section>`
    ).join('') +
      // Closing heading only — not its own [data-chapter-section], so it
      // doesn't get a sidebar entry, a scroll-active state, or a slot in
      // initChapterDurations' 1:1 section↔sidebar-row matching. The
      // heading+paragraph render on every project page except Metro and
      // Malibu-Baddie (see isMetro/isCardboard); the 3-image row underneath
      // is Domicile-only — its images are Domicile assets, so other project
      // pages skip just that row.
      (isMetro || isCardboard
        ? ''
        : `<h2 class="project__chapter-heading" style="margin-top: 129px;">` +
            `<span class="project__chapter-heading-title" style="color: #0caaa2;">TAKEAWAY</span>` +
          `</h2>` +
          `<p class="project__chapter-description">This shifted my focus from purely visual design to human-centered problem solving. It taught me to evaluate design decisions through the user's experience and ground every choice in real-world usability.</p>` +
          (isDomicile
            ? `<div class="project__chapter-takeaway-row" style="margin-top: 34px;">` +
                `<img src="capstonecollection/18.png" alt="Takeaway 18" class="project__chapter-takeaway-img" style="flex-grow: 1.369; z-index: 1;">` +
                `<img src="capstonecollection/chpo.png" alt="Takeaway chpo" class="project__chapter-takeaway-img" style="flex-grow: 1.738; z-index: 2;">` +
                `<img src="capstonecollection/tslp.png" alt="Takeaway tslp" class="project__chapter-takeaway-img" style="flex-grow: 2.07; aspect-ratio: 2.07; height: auto; object-fit: cover; z-index: 3;">` +
              `</div>`
            : ''));
    // Widgets live across every section now, not just the visible one.
    initScrubCarousel(host);
    initCardFan(host);
    initSimpleCarousels(host);
    initVoiceTracklist(host);
    initTranslateSamples(host);
    initQuoteCallouts(host);
    initTakeawayReveal(host);
    initChapterDurations(host, chapters);
    initHoverTitleTooltips(host);
  }

  const sections = Array.from(document.querySelectorAll('[data-chapter-section]'));

  // ---- Footer: project-level only ----
  // The arrows no longer step chapters — the scroll does that — so they point
  // at the neighbouring projects and the block simply sits at the very end.
  if (upnext && nextProject) {
    upnext.setAttribute('href', nextProject.href);
    if (upNum)   upNum.style.display = 'none';
    if (upTitle) upTitle.textContent = nextProject.title;
  }
  if (prevA && prevProject) {
    prevA.setAttribute('href', prevProject.href);
    if (prevNum)   prevNum.style.display = 'none';
    if (prevTitle) prevTitle.textContent = prevProject.title;
  }

  // ---- Left-panel highlight follows the scroll ----
  let activeIndex = -1;
  function setActive(i) {
    if (i === activeIndex) return;
    activeIndex = i;
    chapters.forEach((ch, k) => ch.classList.toggle('np-chapter--active', k === i));
  }

  // A section counts as "current" once its top crosses this line (px below the
  // top of the viewport); the last one scrolled past wins.
  const SPY_LINE = 96;

  function currentIndex() {
    let idx = 0;
    sections.forEach((sec, i) => {
      if (sec.getBoundingClientRect().top <= SPY_LINE) idx = i;
    });
    // At the very bottom the last section may be too short to reach the line —
    // credit it anyway so the final chapter can always become active.
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    return atBottom ? sections.length - 1 : idx;
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (sections.length) setActive(currentIndex());
    });
  }

  if (sections.length) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    chapterScrollTeardown = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    setActive(currentIndex());
  }

  // ---- Left-panel click → jump straight to that section ----
  // Leaves a gap above the heading. MUST stay smaller than SPY_LINE: the
  // section lands exactly this far below the viewport top, and if that were
  // past the spy line the scrollspy would credit the PREVIOUS section and the
  // panel would highlight the wrong chapter the moment the scroll settled.
  const SCROLL_OFFSET = 40;

  chapters.forEach((ch, i) => ch.addEventListener('click', e => {
    const sec = sections[i];
    if (!sec) return;
    e.preventDefault();
    const y = sec.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }));
}


// Wire up the character card fan inside `root` (if present). Five cards sit on
// screen in an arc — the centred one upright, largest and in front, the pairs
// either side rotated out, dropped and shrunk by their distance from the middle
// — over a deck that loops in both directions. Each slot is an inline transform
// whose offsets are PERCENTAGES of the card's own box, so the whole arc scales
// with the card and nothing has to be measured or recomputed on resize. Cards
// outside the visible five wait one slot further out at zero opacity, so moving
// the fan slides the next one in from the edge instead of popping it into place.
//
// Input: drag anywhere on the fan to spin it 1:1 with the pointer (it snaps to
// the nearest card on release), or click a visible side card to bring it
// straight to the middle. The centre card turns over after a beat of hover, and
// any change of centre puts it back face-front.
// Pointer events cover mouse and touch. Re-initialising on each chapter
// re-render is safe: listeners bind to freshly created elements, and the only
// window listeners (move/up) live just for the duration of a drag.
// Same reasoning as initScrubCarousel: wire every fan, not just the first.
function initCardFan(root) {
  Array.from(root.querySelectorAll('[data-card-fan]')).forEach(initOneCardFan);
}

function initOneCardFan(fanEl) {
  if (!fanEl) return;
  const cards = Array.from(fanEl.querySelectorAll('.fan-card'));
  const n = cards.length;
  if (!n) return;

  // A shallow arc: the cards step sideways much further than they drop, so the
  // bottom edges stay close to level instead of stair-stepping away.
  const DROP = 5.8;        // % of the card's HEIGHT each slot drops (≈8% of its width)
  const ANGLE = 6;         // degrees of fan rotation per slot
  const SHRINK = 0.06;     // scale lost per slot, so the fan recedes from the centre
  const FLIP_MS = 500;     // hover dwell before the centre card turns over
  const SLOP = 6;          // px of travel under which a press counts as a click

  // No hover on mobile, so the flip has to be tap/drag-triggered instead —
  // easy to land on by accident and awkward to hold. More useful there to
  // just skip the front (character silhouette) and leave the descriptive
  // back always showing.
  const noFlipQuery = window.matchMedia('(max-width: 860px)');

  // Slots either side of centre that are on screen, and how far apart they sit.
  // Retracting the chapter panel widens the body column by ~176px, which is room
  // for two more cards — so the fan runs five wide there and three while the
  // panel is out, each sized to fill the column it actually has (the widths live
  // on .fan-card, keyed off the same body class). Three cards can sit further
  // apart than five, so SPREAD is per-state too: in both cases it's as wide as
  // that column allows once the outermost card's rotated box is accounted for.
  // A deck too short for five would have to show the same card twice, so the
  // count also narrows to whatever the deck actually supports.
  const MAX_SIDE = Math.floor((n - 1) / 2);
  let SIDE = 0;
  let PARK = 0;            // the off-screen slot where the rest of the deck waits
  let SPREAD = 0;          // % of the card's WIDTH each slot steps sideways

  // Returns true when the layout actually changed, so callers know to re-render.
  function syncSide() {
    const wide = document.body.classList.contains('is-panel-collapsed');
    const next = Math.min(wide ? 2 : 1, MAX_SIDE);
    if (next === SIDE) return false;
    SIDE = next;
    PARK = SIDE + 1;
    SPREAD = SIDE > 1 ? 42 : 49.5;
    return true;
  }
  syncSide();

  let index = 0;           // logical centre card
  let centre = 0;          // rendered centre — fractional mid-drag
  let drag = null;
  let hovered = null;
  let flipTimer = null;
  const shown = new Map();  // card element → its current opacity, for hit-testing
  const slots = new Map();  // card index → the slot it was last rendered in

  // Signed distance from the centre the short way round, so the deck has no
  // seam: with 9 cards, card 8 sits one slot LEFT of card 0, not eight to the
  // right. Fractional while a drag is in progress.
  function slotOf(i) {
    let d = ((i - centre) % n + n) % n;   // 0 … n
    if (d > n / 2) d -= n;                // −n/2 … n/2
    return d;
  }

  const transformFor = (d) => {
    const a = Math.abs(d);
    return `translate(${(d * SPREAD).toFixed(2)}%, ${(a * DROP).toFixed(2)}%) ` +
           `rotate(${(d * ANGLE).toFixed(2)}deg) scale(${(1 - a * SHRINK).toFixed(4)})`;
  };

  // Lay every card out from its distance to the current centre.
  function render() {
    cards.forEach((el, i) => {
      const raw = slotOf(i);
      const a = Math.abs(raw);
      const slot = Math.max(-PARK, Math.min(PARK, raw));   // the rest queue up at the park slot
      // Solid across the visible fan, fading out over the last slot — mid-drag
      // that reads as the next card sliding into view rather than blinking on.
      const o = Math.min(1, Math.max(0, 1 - (a - SIDE)));
      const prev = slots.get(i);
      // A card leaving one end of the queue re-enters at the other. It's
      // invisible out there, but a transition would still drag it back across
      // the whole fan, so that one hop is made without animating.
      const wrapped = prev !== undefined &&
                      Math.abs(prev) >= PARK && Math.abs(slot) >= PARK &&
                      (prev < 0) !== (slot < 0);
      if (wrapped) el.style.transition = 'none';
      el.style.transform = transformFor(slot);
      el.style.opacity = String(o);
      el.style.zIndex = String(n - Math.round(a));
      el.style.pointerEvents = o > 0.05 ? '' : 'none';
      el.classList.toggle('is-centre', a < 0.5);
      if (wrapped) { void el.offsetWidth; el.style.transition = ''; }
      shown.set(el, o);
      slots.set(i, slot);
    });
  }

  // Mobile: set every card with a back to it before the first paint, so
  // there's no front-to-back flip animation on load — it's just there.
  if (noFlipQuery.matches) {
    cards.forEach(el => { if (!el.classList.contains('fan-card--noflip')) el.classList.add('is-flipped'); });
  }

  // First paint lands in place rather than fanning out of a pile.
  cards.forEach(el => el.classList.add('fan-card--noanim'));
  render();
  void fanEl.offsetWidth;                                    // commit that frame
  cards.forEach(el => el.classList.remove('fan-card--noanim'));

  // Toggling the chapter panel resizes the body column, so the fan has to widen
  // or narrow with it. The card SIZE is pure CSS (percentages of a column that
  // has already changed), but how many cards are on screen lives here — the
  // extra pair fades in or out as the column grows or shrinks. Watching the body
  // class keeps this independent of initPanelToggle; the fan is rebuilt on every
  // chapter re-render, so a stale observer drops itself once its fan is gone.
  const panelWatch = new MutationObserver(() => {
    if (!fanEl.isConnected) { panelWatch.disconnect(); return; }
    if (syncSide()) render();
  });
  panelWatch.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  function unflip() {
    clearTimeout(flipTimer);
    flipTimer = null;
    if (noFlipQuery.matches) return;   // mobile: back stays showing, permanently
    cards.forEach(el => el.classList.remove('is-flipped'));
  }

  // The centre card turns over only once the pointer has settled on it, so
  // sweeping across the fan on the way somewhere else doesn't set it spinning.
  function armFlip() {
    clearTimeout(flipTimer);
    flipTimer = null;
    const el = cards[index];
    if (drag || !el || hovered !== el) return;
    if (el.classList.contains('fan-card--noflip')) return;   // front-only card
    if (el.classList.contains('is-flipped')) return;
    flipTimer = setTimeout(() => {
      flipTimer = null;
      if (!drag && hovered === cards[index]) cards[index].classList.add('is-flipped');
    }, FLIP_MS);
  }

  // Settle on a card: it becomes the centre and whatever was turned over goes
  // back face-front. Hover is dropped so the next real pointer move re-arms the
  // flip — otherwise letting go of a drag would spin the card just landed on.
  function commit(i) {
    index = ((Math.round(i) % n) + n) % n;
    centre = index;
    unflip();
    hovered = null;
    render();
  }

  function onDragMove(e) {
    if (!drag) return;
    drag.travel = Math.max(drag.travel, Math.abs(e.clientX - drag.originX));
    // One card per drag, however far the pointer travels: the fan follows 1:1
    // up to a single slot either way of where the drag started and then holds
    // there, so a long sweep can't spin through the deck. drag.anchor is always
    // a whole slot (every release commits to one), so this is exactly ±1 card.
    const to = drag.from - (e.clientX - drag.startX) / drag.step;
    const next = Math.max(drag.anchor - 1, Math.min(drag.anchor + 1, to));
    // Once the stop bites, re-anchor tracking to where the pointer is NOW.
    // Without this the overshoot keeps accumulating against the original origin,
    // and reversing does nothing until the pointer has retraced every pixel of
    // it — drag a long way one way and the fan stops answering the other way.
    // The limit stays measured from drag.anchor, so re-anchoring can't ratchet
    // the fan past one card.
    if (next !== to) {
      drag.from = next;
      drag.startX = e.clientX;
    }
    centre = next;
    render();
  }

  function onDragEnd() {
    if (!drag) return;
    const { travel, card } = drag;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
    drag = null;
    fanEl.classList.remove('is-dragging');
    cards.forEach(el => el.classList.remove('fan-card--noanim'));
    void fanEl.offsetWidth;                       // let the restored transitions take hold
    // A press that never really moved is a click: that card comes to the middle.
    commit(travel <= SLOP ? cards.indexOf(card) : centre);
  }

  fanEl.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('.fan-card');
    if (!el || (shown.get(el) || 0) <= 0.05) return;         // only a card that's on screen
    e.preventDefault();
    // Layout width, NOT the bounding rect — the rect is the rotated/scaled box.
    const w = el.offsetWidth || fanEl.offsetWidth * (SIDE > 1 ? 0.352 : 0.477);  // fallback = the CSS card width
    drag = {
      originX: e.clientX,   // fixed — measures total travel, for click detection
      startX: e.clientX,    // tracking origin — re-anchored when the ±1 stop bites
      anchor: centre,       // the slot the drag began on; the stop is measured from here
      from: centre,         // slot that startX maps to
      travel: 0,
      card: el,
      step: Math.max(1, w * SPREAD / 100)                    // px of drag that equals one slot
    };
    unflip();
    hovered = null;
    fanEl.classList.add('is-dragging');
    cards.forEach(c => c.classList.add('fan-card--noanim'));  // the drag drives transforms directly
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
  });

  // Hover is tracked off pointermove rather than per-card enter/leave: cards
  // slide under a still cursor as the fan turns, and a move is what re-syncs it.
  fanEl.addEventListener('pointermove', (e) => {
    if (drag) return;
    const el = e.target.closest && e.target.closest('.fan-card');
    const next = el && (shown.get(el) || 0) > 0.05 ? el : null;
    if (next === hovered) return;
    hovered = next;
    if (hovered !== cards[index]) unflip();                   // left the centre → turn it back
    armFlip();
  });

  fanEl.addEventListener('pointerleave', () => {
    hovered = null;
    unflip();
  });
}

// Wire up the simple carousels inside `root`. Each [data-simplecar] shows one
// slide at a time (no peeking neighbours); the dots below both indicate and
// select the active slide, and the caption swaps to match (read from each
// slide's data-caption). Re-init on each chapter re-render is safe: listeners
// attach to the freshly-built dots only.
function initSimpleCarousels(root) {
  const cars = Array.from(root.querySelectorAll('[data-simplecar]'));
  cars.forEach(car => {
    const slides = Array.from(car.querySelectorAll('[data-simplecar-slide]'));
    // Dots + caption live as siblings of the carousel's own wrapping frame
    // (both children of the outer <figure>), not as direct siblings of `car`.
    const scope = car.closest('figure') || car.parentElement;
    const dotsWrap = scope.querySelector('[data-simplecar-dots]');
    const dots = dotsWrap ? Array.from(dotsWrap.querySelectorAll('[data-simplecar-dot]')) : [];
    const caption = scope.querySelector('[data-simplecar-caption]');
    // Optional per-slide content panels: the dots switch these too, so each slide
    // can carry its own block of content below the carousel.
    const panelsWrap = scope.querySelector('[data-simplecar-panels]');
    const panels = panelsWrap ? Array.from(panelsWrap.querySelectorAll('[data-simplecar-panel]')) : [];
    if (!slides.length) return;
    let active = Math.max(0, slides.findIndex(s => s.classList.contains('is-active')));

    // Lay every slide out at translateX((index − active)·100%): the active one
    // is centred, earlier slides sit off to the left, later ones off to the
    // right — so changing `active` swipes them horizontally (the frame clips
    // the off-stage slides). `animate:false` positions without a transition,
    // used once on init so nothing slides in on first paint.
    function layout(animate) {
      slides.forEach((s, k) => {
        s.style.transition = animate ? '' : 'none';
        s.style.transform = `translateX(${(k - active) * 100}%)`;
        s.classList.toggle('is-active', k === active);
      });
      dots.forEach((d, k) => d.classList.toggle('is-active', k === active));
      panels.forEach((p, k) => p.classList.toggle('is-active', k === active));
      if (caption) caption.textContent = slides[active].dataset.caption || caption.textContent;
    }

    layout(false);
    void car.offsetWidth;                       // commit the initial (unanimated) frame
    slides.forEach(s => (s.style.transition = '')); // hand transitions back to CSS

    dots.forEach((dot, i) => dot.addEventListener('click', () => {
      if (i === active) return;
      active = i;
      layout(true);
      // If the newly-shown slide is a video, restart it from the beginning.
      const cur = slides[active];
      if (cur && cur.tagName === 'VIDEO') {
        try { cur.currentTime = 0; cur.play().catch(() => {}); } catch (e) { /* ignore */ }
      }
    }));
  });
}

// Wire up the character-voice tracklist (chapter 1, tag 01-5). One shared
// <audio> plays whichever row is selected; the footer bar mirrors the current
// track's name/species, elapsed/total time, and a click-to-seek progress bar.
// Audio files are expected at capstonecollection/sounds/<id>.mp3.
function initVoiceTracklist(root) {
  // A chapter could hold more than one player, so each [data-vtrack] is wired
  // independently rather than assuming there's only ever one.
  Array.from(root.querySelectorAll('[data-vtrack]')).forEach(initOneVtracklist);
}

function initOneVtracklist(wrap) {
  if (!wrap) return;

  const audio      = wrap.querySelector('[data-vtrack-audio]');
  const rows       = Array.from(wrap.querySelectorAll('[data-vtrack-row]'));
  const footerBtn  = wrap.querySelector('[data-vtrack-footer-toggle]');
  const curName    = wrap.querySelector('[data-vtrack-cur-name]');
  const curTime    = wrap.querySelector('[data-vtrack-cur]');
  const durTime    = wrap.querySelector('[data-vtrack-dur]');
  const bar        = wrap.querySelector('[data-vtrack-bar]');
  const fill       = wrap.querySelector('[data-vtrack-fill]');
  if (!audio || !rows.length) return;

  const fmt = s => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  let current = rows.findIndex(r => r.classList.contains('vtrack__row--active'));
  if (current < 0) current = 0;

  // Play the samples much louder than the source files. HTMLMedia volume caps
  // at 1.0, so route the shared element through a Web Audio chain: a big gain
  // stage (4×) lifts the quiet source, then a limiter (fast compressor pinned
  // near 0 dB) catches the peaks so the boost stays clean instead of clipping.
  // The AudioContext is a lazily-created singleton and starts suspended until a
  // user gesture, so resume it on the first play. Guarded — if the API is
  // unavailable the element just plays at its normal level.
  // Base Web Audio boost; a row's optional data-gain multiplies it (e.g. 1.5 =
  // +50%). Hoisted so load() can retune it per track. Null if Web Audio is off.
  let boostGain = null;
  const BASE_GAIN = 4;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      if (!window.__vtrackCtx) window.__vtrackCtx = new AC();
      const ctx = window.__vtrackCtx;
      const gain = ctx.createGain();
      gain.gain.value = BASE_GAIN;
      boostGain = gain;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      ctx.createMediaElementSource(audio).connect(gain).connect(limiter).connect(ctx.destination);
      audio.addEventListener('play', () => { if (ctx.state === 'suspended') ctx.resume(); });
    }
  } catch (e) { /* Web Audio unavailable — fall back to un-boosted playback */ }

  // Fill each row's right-hand duration by probing that file's metadata. A
  // throwaway Audio per row loads just the header (preload=metadata), so we
  // don't disturb the shared playback element.
  rows.forEach(row => {
    const durEl = row.querySelector('[data-vtrack-rowdur]');
    if (!durEl) return;
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.addEventListener('loadedmetadata', () => { durEl.textContent = fmt(probe.duration); });
    probe.src = row.dataset.src;
  });

  // Point the shared <audio> at row `i` and reflect it in the footer meta.
  // `play` starts playback (used on click); on init we only load for metadata.
  function load(i, play) {
    current = i;
    const row = rows[i];
    rows.forEach((r, k) => r.classList.toggle('vtrack__row--active', k === i));
    audio.src = row.dataset.src;
    if (boostGain) boostGain.gain.value = BASE_GAIN * (parseFloat(row.dataset.gain) || 1);
    if (curName) curName.textContent = row.dataset.name;
    if (fill) fill.style.width = '0%';
    if (curTime) curTime.textContent = '0:00';
    if (durTime) durTime.textContent = '0:00';
    if (play) audio.play().catch(() => {});
  }

  function toggle(i) {
    if (i === current && audio.src) {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    } else {
      load(i, true);
    }
  }

  rows.forEach((row, i) => row.addEventListener('click', () => toggle(i)));
  if (footerBtn) footerBtn.addEventListener('click', () => toggle(current));

  audio.addEventListener('play',  () => wrap.classList.add('is-playing'));
  audio.addEventListener('pause', () => wrap.classList.remove('is-playing'));
  audio.addEventListener('ended', () => {
    wrap.classList.remove('is-playing');
    if (fill) fill.style.width = '0%';
    if (curTime) curTime.textContent = '0:00';
  });
  audio.addEventListener('loadedmetadata', () => {
    if (durTime) durTime.textContent = fmt(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    if (curTime) curTime.textContent = fmt(audio.currentTime);
    if (fill && audio.duration) fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
  });

  if (bar) bar.addEventListener('click', e => {
    if (!audio.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  });

  // Load the default row so the footer shows its duration (once the mp3 exists)
  // without starting playback.
  load(current, false);
}

// Each speech-to-sound sample image (tag 01-6) gets its own independent play
// button + <audio>, unlike the shared-player vtrack list above. Buttons with
// no data-src (no matching sample yet) are left `disabled` in the markup and
// simply never picked up here.
function initTranslateSamples(root) {
  const buttons = Array.from(root.querySelectorAll('[data-translate-play]'));
  if (!buttons.length) return;

  buttons.forEach(btn => {
    const audio = btn.nextElementSibling;
    if (!audio || audio.tagName !== 'AUDIO') return;

    // Same gain-boost + limiter chain as the vtrack player, so these samples
    // play back at a matching volume. Built lazily on first click since the
    // AudioContext must start from a user gesture.
    let boosted = false;
    function boost() {
      if (boosted) return;
      boosted = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!window.__vtrackCtx) window.__vtrackCtx = new AC();
        const ctx = window.__vtrackCtx;
        const gain = ctx.createGain();
        gain.gain.value = 4;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -2;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.25;
        ctx.createMediaElementSource(audio).connect(gain).connect(limiter).connect(ctx.destination);
        audio.addEventListener('play', () => { if (ctx.state === 'suspended') ctx.resume(); });
      } catch (e) { /* Web Audio unavailable — fall back to un-boosted playback */ }
    }

    btn.addEventListener('click', () => {
      boost();
      if (!audio.src) audio.src = btn.dataset.src;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });

    audio.addEventListener('play',  () => btn.classList.add('is-playing'));
    audio.addEventListener('pause', () => btn.classList.remove('is-playing'));
    audio.addEventListener('ended', () => btn.classList.remove('is-playing'));
  });
}

// Staggered scroll-reveal for the research quote callouts. Every chapter is
// rendered up front into one continuous scroll, so a plain on-load animation
// would already be finished by the time a reader scrolls this far — instead
// each card gets .is-visible (CSS handles the fade-up + per-card delay) the
// first time it crosses into the viewport.
function initQuoteCallouts(root) {
  const cards = Array.from(root.querySelectorAll('.project__chapter-quotecallout'));
  if (!cards.length) return;

  if (!('IntersectionObserver' in window)) {
    cards.forEach(card => card.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });

  cards.forEach(card => observer.observe(card));
}

// Section titles marked .hover-title (e.g. "Slide to view walk cycle
// evolution.", "Asset Evolution Pipeline") are hidden by CSS; instead their
// text follows the cursor as a small floating label while hovering the
// gallery immediately below them. One shared tooltip element is reused
// across every .hover-title on the page rather than creating one per source.
//
// Driven by elementFromPoint at the last known cursor position, re-evaluated
// on both mousemove AND scroll — a plain mouseenter/mouseleave pair would go
// stale the moment the page scrolls under a still cursor (an image sliding
// under the pointer, or out from under it, fires neither event).
function initHoverTitleTooltips(root) {
  const sources = Array.from(root.querySelectorAll('.hover-title'));
  if (!sources.length) return;

  let tip = document.querySelector('.hover-title-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'hover-title-tooltip';
    document.body.appendChild(tip);
  }

  // Registry shared across every call (each chapter section calls this once
  // on render) so scroll/mousemove only ever need one pair of listeners.
  if (!window.__hoverTitleMedia) window.__hoverTitleMedia = new Map();
  const media = window.__hoverTitleMedia;

  sources.forEach(src => {
    const target = src.nextElementSibling;
    if (!target) return;
    // Map the images/videos themselves, not the whole container — so the
    // tooltip only shows over actual artwork, not the surrounding row
    // (captions, gaps, scrubber controls, etc.).
    Array.from(target.querySelectorAll('img, video')).forEach(el => {
      media.set(el, src.textContent);
    });
  });

  if (document.body.dataset.hoverTitleGlobalWired) return;
  document.body.dataset.hoverTitleGlobalWired = 'true';

  let lastX = -1;
  let lastY = -1;

  function update() {
    if (lastX < 0) return;
    const el = document.elementFromPoint(lastX, lastY);
    const text = el && media.get(el);
    if (text) {
      tip.textContent = text;
      tip.style.left = `${lastX}px`;
      tip.style.top = `${lastY}px`;
      tip.classList.add('is-visible');
    } else {
      tip.classList.remove('is-visible');
    }
  }

  window.addEventListener('mousemove', e => {
    lastX = e.clientX;
    lastY = e.clientY;
    update();
  });
  window.addEventListener('scroll', update, { passive: true, capture: true });
}

// Staggered scroll-reveal for the takeaway image row: the 2nd and 3rd cards
// swipe in from the right one after another (CSS handles the stagger via
// transition-delay on the 3rd), while the 1st stays put with no animation —
// this just adds .is-visible to the row the first time it scrolls into view.
function initTakeawayReveal(root) {
  const rows = Array.from(root.querySelectorAll('.project__chapter-takeaway-row'));
  if (!rows.length) return;

  if (!('IntersectionObserver' in window)) {
    rows.forEach(row => row.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });

  rows.forEach(row => observer.observe(row));
}

// Recomputes each chapter's "IN THIS CHAPTER" sidebar duration from what's
// actually rendered, instead of a hand-typed guess that goes stale the next
// time a paragraph, image, or video gets added or edited. Three components,
// summed per chapter:
//   - reading time: word count ÷ 200 wpm. Captions, figcaptions, chapter
//     tags/pills, and anything aria-hidden (e.g. the quote callouts'
//     decorative quotation mark) are excluded from the word count — caption
//     reading time is already folded into the image time below, so counting
//     it twice would double it.
//   - image time: 3s per image, or 5.5s if it has a caption/label to read
//     (looked for on the image's parent and its nearest <figure> ancestor).
//   - video time: each <video>'s real duration, read from the element once
//     its metadata has loaded (falls back to 0 if a clip fails to load).
// `sections` and `sidebarChapters` are matched by index — both are built
// from the same chapter list, in the same order (see the render loop above).
function initChapterDurations(root, sidebarChapters) {
  const sections = Array.from(root.querySelectorAll('[data-chapter-section]'));
  if (!sections.length || !sidebarChapters.length) return;

  const READING_WPM = 200;
  const IMAGE_PLAIN_SECONDS = 3;
  const IMAGE_CAPTIONED_SECONDS = 5.5;
  const EXCLUDED_TAGS = new Set(['H2', 'IMG', 'VIDEO', 'SVG', 'BUTTON', 'SCRIPT', 'STYLE', 'FIGCAPTION']);

  function isExcluded(el) {
    if (EXCLUDED_TAGS.has(el.tagName)) return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    if (/(^|\s)project__chapter-tag(\s|$|--)/.test(el.className)) return true;
    if (/caption/i.test(el.className)) return true;
    return false;
  }

  function countReadingWords(section) {
    let words = 0;
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let el = node.parentElement;
        while (el && el !== section) {
          if (isExcluded(el)) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const trimmed = node.textContent.trim();
      if (trimmed) words += trimmed.split(/\s+/).length;
    }
    return words;
  }

  function isCaptioned(img) {
    const scopes = [img.parentElement, img.closest('figure')].filter(Boolean);
    return scopes.some(scope => scope.querySelector('[class*="caption" i]'));
  }

  function sumImageSeconds(section) {
    return Array.from(section.querySelectorAll('img')).reduce((total, img) =>
      total + (isCaptioned(img) ? IMAGE_CAPTIONED_SECONDS : IMAGE_PLAIN_SECONDS), 0);
  }

  function getVideoSeconds(video) {
    return new Promise(resolve => {
      if (video.readyState >= 1 && isFinite(video.duration)) {
        resolve(video.duration);
        return;
      }
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      const onLoaded = () => { cleanup(); resolve(isFinite(video.duration) ? video.duration : 0); };
      const onError = () => { cleanup(); resolve(0); };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
    });
  }

  function formatMinutesSeconds(seconds) {
    const total = Math.round(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  sections.forEach((section, i) => {
    const timeEl = sidebarChapters[i] && sidebarChapters[i].querySelector('.np-chapter__time');
    if (!timeEl) return;

    const readingSeconds = (countReadingWords(section) / READING_WPM) * 60;
    const imageSeconds = sumImageSeconds(section);
    const videos = Array.from(section.querySelectorAll('video'));

    Promise.all(videos.map(getVideoSeconds)).then(videoDurations => {
      const videoSeconds = videoDurations.reduce((a, b) => a + b, 0);
      timeEl.textContent = formatMinutesSeconds(readingSeconds + imageSeconds + videoSeconds);
    });
  });
}

// Wire up a scrubber carousel inside `root` (if present). The rail has N stops
// (one per slide); dragging the knob snaps to the nearest stop and shows that
// slide. Clicking the rail jumps to the nearest stop; arrow keys step between
// stops. Drag listeners live on window only for the duration of a drag, so
// re-initialising on each chapter re-render doesn't accumulate listeners.
// Every chapter is on the page at once now, so wire each carousel — a single
// root.querySelector would silently leave later ones dead.
function initScrubCarousel(root) {
  Array.from(root.querySelectorAll('[data-scrubcar]')).forEach(initOneScrubCarousel);
}

function initOneScrubCarousel(car) {
  if (!car) return;
  const track = car.querySelector('[data-scrubcar-track]');
  const knob = car.querySelector('[data-scrubcar-knob]');
  const slides = Array.from(car.querySelectorAll('.scrubcar__slide'));
  const n = slides.length;
  if (!track || !knob || n === 0) return;

  // The scrubber used to be sized in JS to match the image row's width, back
  // when that row shrank to fit its 3 images. The row now spans the full text
  // column instead, so matching it would make the scrubber full-width too —
  // the scrubber keeps its own fixed width from CSS (.scrubcar__scrubber) now.

  const fill = car.querySelector('[data-scrubcar-fill]');
  const ticks = Array.from(car.querySelectorAll('.scrubcar__tick'));
  let index = 0;
  const posFor = (i) => (n === 1 ? 0 : (i / (n - 1)) * 100);        // % along the rail
  const ratioAt = (e) => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const nearest = (ratio) => Math.round(ratio * (n - 1));

  // Move the knob + the mint fill (filled from the rail start up to the knob),
  // and mark every stop the knob has reached as "passed".
  function place(percent) {
    knob.style.left = percent + '%';
    if (fill) fill.style.width = percent + '%';
    ticks.forEach((t, k) => t.classList.toggle('is-passed', posFor(k) <= percent + 0.5));
  }

  function showIndex(i) {
    index = Math.max(0, Math.min(n - 1, i));
    slides.forEach((s, k) => s.classList.toggle('is-active', k === index));
    knob.setAttribute('aria-valuenow', String(index + 1));
  }
  function snapTo(i) {
    showIndex(i);
    knob.style.transition = '';                                    // animate the snap
    if (fill) fill.style.transition = '';
    place(posFor(index));
  }

  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const ratio = ratioAt(e);
    place(ratio * 100);                                            // free-follow the cursor
    showIndex(nearest(ratio));                                     // live-preview the nearest slide
    e.preventDefault();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    snapTo(index);
  };
  knob.addEventListener('pointerdown', (e) => {
    dragging = true;
    knob.style.transition = 'none';                                // 1:1 with the cursor while dragging
    if (fill) fill.style.transition = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    onMove(e);
  });

  // Click anywhere on the rail (but not the knob) → nearest stop.
  track.addEventListener('pointerdown', (e) => {
    if (e.target === knob) return;
    snapTo(nearest(ratioAt(e)));
  });

  // Arrow keys step between stops when the knob is focused.
  knob.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  { snapTo(index - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { snapTo(index + 1); e.preventDefault(); }
  });

  snapTo(0);
}

initChapters();


// ===========================================================
// PROJECT PAGE — retractable left panel
// ===========================================================
// Collapsed, the panel narrows to a rail of chapter ticks (all the visual work
// is in the .is-panel-collapsed rules). The choice is remembered so it carries
// across project pages instead of resetting on every navigation.
const PANEL_KEY = 'projectPanelCollapsed';

function applyPanelState(collapsed) {
  document.body.classList.toggle('is-panel-collapsed', collapsed);
  const btn = document.querySelector('[data-panel-toggle]');
  if (!btn) return;
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Expand chapter panel' : 'Collapse chapter panel');
}

// ---- Scroll anchoring across a panel toggle --------------------------------
// Toggling the panel changes the body column's width, so every paragraph
// re-wraps and every image re-scales. All that height change happens ABOVE the
// reader as well as below, which slides whatever they were looking at up or off
// the screen — metres of jump on a long chapter. The fix is to pin one element
// that's currently on screen and hold it at a fixed viewport offset while the
// layout settles.

// Whatever the reader is most likely looking at: the deepest element under a
// line near the top of the body column. Deepest matters — pinning a leaf
// paragraph tracks the text far more closely than pinning the whole section.
function pickScrollAnchor() {
  const page = document.querySelector('.project-shell .page');
  if (!page) return null;
  const r = page.getBoundingClientRect();
  const y = Math.round(window.innerHeight * 0.2);
  let el = document.elementFromPoint(Math.round(r.left + r.width / 2), y);
  if (el && page.contains(el)) {
    // Climb out of anything the toggle repositions for its OWN reasons rather
    // than because the column reflowed: the card fan's cards are absolutely
    // positioned and re-laid-out on toggle, so pinning one would track the fan
    // instead of the page.
    while (el && el !== page && getComputedStyle(el).position === 'absolute') {
      el = el.parentElement;
    }
    if (el && el !== page) return el;
  }
  // Nothing usable under that point (a gap between blocks, say) — fall back to
  // the first chapter section still on screen.
  const secs = page.querySelectorAll('[data-chapter-section]');
  for (const s of secs) {
    if (s.getBoundingClientRect().bottom > y) return s;
  }
  return null;
}

// The hold currently in flight, so a second toggle can cancel it. Two loops
// running at once would BOTH apply the same reflow, moving the page twice as
// far as it should — the creep you get from toggling repeatedly.
let panelAnchorHold = null;

// Hold `el` at the viewport offset `wantTop` for `ms`, re-checking every frame.
// The width transition reflows progressively over its whole 0.28s, so a single
// correction up front would be undone by the very next frame; and part of the
// change (the card fan's own width/aspect-ratio swap) isn't transitioned at all
// and lands instantly, which is why the first correction runs synchronously.
function holdScrollAnchor(el, wantTop, ms) {
  if (panelAnchorHold) panelAnchorHold();      // cancel any in-flight hold
  if (!el) return;

  const body = document.body;
  const prevAnchor = body.style.overflowAnchor;
  // The browser runs its OWN scroll anchoring over the same reflow. Left on,
  // its correction lands on top of this one and the page overshoots — the other
  // half of the creep. Off only for the duration of the toggle, so ordinary
  // shifts (a late-loading image) keep the native treatment.
  body.style.overflowAnchor = 'none';

  let raf = 0;
  const stop = () => {
    if (panelAnchorHold !== stop) return;      // already stopped
    panelAnchorHold = null;
    cancelAnimationFrame(raf);
    body.style.overflowAnchor = prevAnchor;
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
  };
  panelAnchorHold = stop;

  // Hand control straight back the moment the reader scrolls for themselves —
  // the correction below is absolute, so without this it would drag them back.
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', stop);

  const until = performance.now() + ms;
  // ABSOLUTE, not a running delta: every frame independently drives the anchor
  // back to the offset it started at. A frame that lands a fraction of a pixel
  // off is simply re-corrected by the next one, whereas carrying a delta folds
  // that error in permanently and accumulates it across repeated toggles.
  const step = () => {
    const shift = el.getBoundingClientRect().top - wantTop;
    if (shift) window.scrollBy(0, shift);
  };
  step();
  const loop = () => {
    if (panelAnchorHold !== stop) return;      // superseded or cancelled
    step();
    if (performance.now() < until) raf = requestAnimationFrame(loop);
    else stop();
  };
  raf = requestAnimationFrame(loop);
}

// Below this, .project-shell's expanded left track (minmax(350px, 430px))
// leaves the article column at 0 width (see the grid-template-columns
// comment on .project-shell) — there's no usable expanded state on a phone,
// so the panel always starts collapsed there regardless of whatever
// preference was remembered from a wider screen.
const PANEL_STACK_QUERY = window.matchMedia('(max-width: 860px)');

function readStoredPanelCollapsed() {
  try { return localStorage.getItem(PANEL_KEY) === '1'; } catch (e) { return false; }
}

function initPanelToggle() {
  const btn = document.querySelector('[data-panel-toggle]');
  if (!btn) return;                       // not a project page
  // Re-read the stored state on every arrival: a seamless navigation replaces
  // the <body> (and its class) with the incoming page's, which would otherwise
  // silently spring the panel back open.
  const collapsed = PANEL_STACK_QUERY.matches ? true : readStoredPanelCollapsed();
  applyPanelState(collapsed);

  // Keeps the panel correct if the window is resized across the breakpoint
  // (rather than only on the next full page load) — forced collapsed going
  // narrow, restored to the remembered preference coming back out.
  PANEL_STACK_QUERY.addEventListener('change', (e) => {
    applyPanelState(e.matches ? true : readStoredPanelCollapsed());
  });

  // The button is replaced along with the DOM on each arrival, so this listener
  // goes with it — no teardown needed.
  btn.addEventListener('click', () => {
    const next = !document.body.classList.contains('is-panel-collapsed');

    // Captured BEFORE the class lands: part of the reflow (the card fan's
    // width and aspect-ratio) isn't transitioned and applies the instant the
    // class changes, so a reading taken afterwards would already be stale.
    const anchor = pickScrollAnchor();
    const anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;

    // Promote the shell to its own compositor layer just for the transition —
    // gives the browser a running start on the grid-template-columns tween
    // instead of discovering mid-frame that it needs one. Dropped again once
    // the transition ends so an idle page doesn't keep an unnecessary layer
    // around: persistent will-change is itself a (smaller) perf cost.
    const shell = document.querySelector('.project-shell');
    if (shell) {
      shell.style.willChange = 'grid-template-columns';
      shell.addEventListener('transitionend', function clear(e) {
        if (e.propertyName !== 'grid-template-columns') return;
        shell.style.willChange = '';
        shell.removeEventListener('transitionend', clear);
      });
    }

    applyPanelState(next);
    // Runs a comfortable margin past the 0.28s width transition, so the last
    // frames of the tween are corrected too rather than left as a small settle.
    holdScrollAnchor(anchor, anchorTop, 450);
    try { localStorage.setItem(PANEL_KEY, next ? '1' : '0'); } catch (e) {}
    // Collapsing changes the content column's width, so every chapter section
    // moves. Nudge the scrollspy to re-measure rather than leaving the panel
    // highlighting whatever was current at the old layout.
    window.dispatchEvent(new Event('resize'));
  });
}

initPanelToggle();


// ===========================================================
// PANEL HEIGHT SYNC — project page's left panel matches the tracklist's
// ===========================================================
// The tracklist panel's height is content-driven (carousel/title scale with
// the viewport), so it can't be replicated in static CSS. Instead: on the
// tracklist page, store the panel's real rendered height (per viewport size);
// on a project page, apply that stored height so both panels are pixel-equal —
// the chapters stay top-flowing and the extra space extends the bottom. If the
// stored value came from a different window size, fall back to content height.
function syncPanelHeight() {
  const KEY = 'npPanelHeight';
  const panel = document.querySelector('.np-player');
  if (!panel) return;

  if (document.body.classList.contains('page-tracklist')) {
    const save = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(
          { h: panel.offsetHeight, vw: window.innerWidth, vh: window.innerHeight }
        ));
      } catch (e) {}
    };
    save();
    // Re-measure once webfonts/layout settle, and track window resizes.
    window.addEventListener('load', () => { save(); setTimeout(save, 600); });
    window.addEventListener('resize', save);
  } else if (panel.classList.contains('np-player--project')) {
    const apply = () => {
      // Below the stacking breakpoint the two pages' panels are deliberately
      // different shapes — the tracklist's carousel card vs. this page's
      // compact bar — so there's nothing to match heights against; syncing
      // anyway would stretch the compact bar back out to carousel height.
      if (window.matchMedia('(max-width: 860px)').matches) {
        panel.style.height = '';
        return;
      }
      let d = null;
      try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
      const sameViewport = d &&
        Math.abs(d.vw - window.innerWidth) <= 1 &&
        Math.abs(d.vh - window.innerHeight) <= 1;
      panel.style.height = sameViewport
        ? Math.min(d.h, window.innerHeight - 24) + 'px'
        : '';                              // unknown viewport → content height
    };
    apply();
    window.addEventListener('resize', apply);
  }
}
syncPanelHeight();


// ===========================================================
// TIMELINE SLIDER — draggable knob maps to a project date + phase
// ===========================================================
// The knob rides the progress rail. The track splits into three equal phases
// (Kickoff / Design / Build), flipping to Shipped only once the knob reaches
// the very end, and in parallel into the calendar span Sept 1 2025 → Apr 28
// 2026. Dragging updates the top-left readout with the interpolated date and
// the phase for wherever the knob lands.
function initTimelineSlider() {
  const track = document.querySelector('.np-timeline__track');
  const fill  = document.querySelector('.np-timeline__fill');
  const readout = document.querySelector('.np-timeline__readout');
  const endLabel = document.querySelector('.np-timeline__date--end');
  if (!track || !fill) return;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

  // Each project maps the knob to its own calendar span and named stages.
  // A stage's `from` is where it starts as a fraction of the scrubber (its
  // width is implied by the next stage's `from`, or the end for the last one).
  const CONFIGS = {
    default: {
      start: new Date(2025, 8, 1),   // Sept 1 2025
      end:   new Date(2026, 3, 28),  // Apr 28 2026
      endLabel: 'Apr 2026',
      phases: [
        { name: 'Kickoff', from: 0,   color: '#8C857A' },
        { name: 'Design',  from: 1/3, color: '#C9922E' },
        { name: 'Build',   from: 2/3, color: '#3E7FA6' }
      ],
      shipped: { color: '#4B8A5A' }, // held once the knob reaches the very end
      duration: 1 * 60 * 1000 // 1 minute sweep
    },
    // Metro Rerouted's own sprint: two stages, Research taking the first
    // third of the scrubber and Design taking the remaining two-thirds.
    // Its sweep also runs 20% faster than every other track's.
    metro: {
      start: new Date(2026, 3, 27), // Apr 27 2026
      end:   new Date(2026, 4, 10), // May 10 2026
      endLabel: 'May 2026',
      phases: [
        { name: 'Research', from: 0,   color: '#8C857A' },
        { name: 'Design',   from: 1/3, color: '#C9922E' }
      ],
      shipped: null, // no separate end state — holds on Design at 100%
      duration: 20 * 1000 // flat 20-second sweep
    },
    // Malibu-Baddie's build window — one phase (Build) the whole way, then
    // Shipped. Sweep runs 40% faster than the default track's 1-minute pace.
    cardboard: {
      start: new Date(2025, 7, 28),  // Aug 28 2025
      end:   new Date(2025, 11, 13), // Dec 13 2025
      endLabel: 'Dec 2025',
      phases: [
        { name: 'Build', from: 0, color: '#3E7FA6' }
      ],
      shipped: { color: '#4B8A5A' },
      duration: 36 * 1000 // 1 minute × 0.6, 40% faster
    }
  };

  let config = CONFIGS.default;
  let START = config.start, END = config.end, SPAN = END - START;

  let currentP = 0;
  function render(p) {
    p = Math.max(0, Math.min(1, p));
    currentP = p;
    fill.style.width = (p * 100) + '%';
    if (!readout) return;
    const d = new Date(START.getTime() + p * SPAN);
    const dateStr = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    let phaseName, phaseColor;
    if (p >= 1 && config.shipped) {
      phaseName = 'Shipped';
      phaseColor = config.shipped.color;
    } else {
      let active = config.phases[0];
      for (const ph of config.phases) if (p >= ph.from) active = ph;
      phaseName = active.name;
      phaseColor = active.color;
    }
    readout.textContent = '';
    readout.append(`${dateStr} · `);
    const phaseSpan = document.createElement('span');
    phaseSpan.className = 'np-timeline__phase';
    phaseSpan.style.color = phaseColor;
    phaseSpan.textContent = phaseName;
    readout.append(phaseSpan);
  }

  const positionOf = e => {
    const rect = track.getBoundingClientRect();
    return (e.clientX - rect.left) / rect.width;
  };

  // Auto-play: on load, sweep the knob from kickoff to shipped over the
  // current project's duration, then hold at the end. Any user drag cancels
  // the auto-play and takes over.
  let DURATION = config.duration;
  let rafId = null;
  let autoStart = null;
  function autoplay(ts) {
    // Anchor the clock to the knob's current spot, so the sweep resumes from
    // wherever it was left off — kickoff on load, or the drop point after a drag.
    if (autoStart === null) autoStart = ts - currentP * DURATION;
    const p = Math.min(1, (ts - autoStart) / DURATION);
    render(p);
    if (p < 1) rafId = requestAnimationFrame(autoplay);
    else rafId = null;
  }
  function playFromHere() {
    autoStart = null;                 // re-anchor from currentP on the next frame
    if (rafId === null) rafId = requestAnimationFrame(autoplay);
  }
  function pause() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  let dragging = false;
  track.addEventListener('pointerdown', e => {
    pause();
    dragging = true;
    track.setPointerCapture(e.pointerId);
    render(positionOf(e));
  });
  track.addEventListener('pointermove', e => {
    if (dragging) render(positionOf(e));
  });
  const stop = e => {
    if (!dragging) return;
    dragging = false;
    try { track.releasePointerCapture(e.pointerId); } catch (err) {}
    playFromHere();                   // resume the sweep from the drop point
  };
  track.addEventListener('pointerup', stop);
  track.addEventListener('pointercancel', stop);

  render(0);                          // kickoff, before the sweep begins
  playFromHere();                     // begin the 3-minute sweep

  // Expose a reset so selecting a different track restarts the sweep from
  // kickoff, as if a new song began playing.
  timelineSlider = {
    resetAndPlay() {
      pause();
      render(0);
      playFromHere();
    },
    // Switches to another project's date range + stages, then restarts the
    // sweep from the beginning of that project's timeline.
    setProject(key) {
      config = CONFIGS[key] || CONFIGS.default;
      START = config.start;
      END = config.end;
      SPAN = END - START;
      DURATION = config.duration;
      if (endLabel) endLabel.textContent = config.endLabel;
      pause();
      render(0);
      playFromHere();
    }
  };
}

initTimelineSlider();


// "Off the Clock" accordion (about page). Clicking a collapsed .clock-tab
// opens it and closes whichever one was open — only one is-open at a time.
// Clicks/scrolling inside an already-open tab do nothing, so scrolling its
// image list never accidentally collapses it.
function initClockTabs() {
  const row = document.querySelector('[data-clock-tabs]');
  const tabs = document.querySelectorAll('[data-clock-tabs] [data-clock-tab]');
  if (!tabs.length) return;

  const COLLAPSED_WIDTH = 64; // matches .clock-tab's collapsed flex-basis

  // Below this, .about-layout has already stacked to one column (see the
  // matching CSS breakpoint) — three collapsed vertical strips don't fit
  // side by side there, so the accordion is dropped entirely in favor of
  // all three tabs open at once, each its own full-width row.
  const stackQuery = window.matchMedia('(max-width: 860px)');

  // CSS alone (flex:0 0 84px → flex:1 1 0%) can't transition this smoothly:
  // flex-grow (0→1) isn't covered by a flex-basis transition and just jumps,
  // and 84px→0% can't interpolate since the two states are different units.
  // Setting every tab's flex-basis to an explicit px value — collapsed ones
  // at 84px, the open one at exactly the row's remaining width — makes it a
  // plain px→px transition, which animates smoothly.
  function open(tab) {
    let openWidth = 0;
    if (row) {
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      openWidth = row.clientWidth - (tabs.length - 1) * (COLLAPSED_WIDTH + gap);
    }
    tabs.forEach((t) => {
      const isTarget = t === tab;
      t.classList.toggle('is-open', isTarget);
      t.setAttribute('aria-expanded', isTarget ? 'true' : 'false');
      t.style.flexBasis = (isTarget ? Math.max(openWidth, 0) : COLLAPSED_WIDTH) + 'px';
    });
    // Always land back on the first photo, fully in view, rather than
    // wherever the gallery happened to be scrolled to last time it was open.
    const gallery = tab.querySelector('.clock-tab__gallery');
    if (gallery) gallery.scrollLeft = 0;
  }

  // Stacked layout: every tab open, sized entirely by CSS (clear the inline
  // px flex-basis the row layout relies on so it doesn't fight the column).
  function openAllStacked() {
    tabs.forEach((t) => {
      t.classList.add('is-open');
      t.setAttribute('aria-expanded', 'true');
      t.style.flexBasis = '';
    });
  }

  function applyLayout() {
    if (stackQuery.matches) {
      openAllStacked();
    } else {
      // Lock in the initial layout's widths too, so the very first open tab
      // (marked is-open in the HTML) is already using explicit px, not the
      // flex:1 1 0% CSS fallback — keeps behavior consistent from page load.
      open(document.querySelector('[data-clock-tabs] .clock-tab.is-open') || tabs[0]);
    }
  }

  applyLayout();
  // Re-applied on resize so dragging the window across the breakpoint (the
  // way this was tested) doesn't leave stale inline widths from one mode
  // fighting the other mode's CSS.
  window.addEventListener('resize', applyLayout);

  // Hover-capable pointer (mouse/trackpad) gets hover-to-open; touch always
  // gets tap-to-open via the click listener below instead — checking this
  // once up front avoids relying on mouseenter simply never firing on touch,
  // which isn't reliably true across all mobile browsers.
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  tabs.forEach((tab) => {
    if (canHover) {
      tab.addEventListener('mouseenter', () => {
        if (stackQuery.matches) return; // all open, nothing to toggle
        if (!tab.classList.contains('is-open')) open(tab);
      });
    }
    tab.addEventListener('click', () => {
      if (stackQuery.matches) return;
      if (!tab.classList.contains('is-open')) open(tab);
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (stackQuery.matches) return;
        if (!tab.classList.contains('is-open')) open(tab);
      }
    });
  });
}

initClockTabs();

// About page: .about-rail is position:sticky inside .about-layout (a flex
// row), so it can only stay pinned for as much extra scroll distance as
// .about-layout is taller than the rail itself. A static CSS min-height
// guess either falls short (rail drifts loose for the last stretch of
// scroll — the bug being fixed here) or overshoots (dead blank space below
// the card when the right column's real content is shorter than the guess).
// Measuring the rail's actual rendered height at runtime and adding just
// .page's own bottom padding as slack keeps it pinned for the entire scroll
// with no leftover space either way.
function initAboutStickyFix() {
  const layout = document.querySelector('.about-layout');
  const rail = document.querySelector('.about-rail');
  const page = document.querySelector('.page');
  if (!layout || !rail || !page) return;

  function apply() {
    const bottomPad = parseFloat(getComputedStyle(page).paddingBottom) || 0;
    layout.style.minHeight = `${rail.getBoundingClientRect().height + bottomPad}px`;
  }

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('load', apply);
  // The profile photo loading can change the rail's height after first paint.
  rail.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', apply, { once: true });
  });
}

initAboutStickyFix();


// ===========================================================
// TRACKLIST — rotating project icon (the "pixel quest" track)
// ===========================================================
// The pixel-quest track shows one square from tracklistimages/capstoneicon/,
// advancing to the NEXT image on every refresh / re-entry. We keep a shuffled
// "deck" of all the images in localStorage and step through it one per visit,
// so every image appears once before any repeat — then reshuffle for a fresh
// pass. Like album shuffle. Called both on normal load (below) and from the
// http swap path in setupEqWipe, so every arrival counts exactly once.
const ICON_DIR = 'tracklistimages/capstoneicon/';
// Hardcoded because a static site (often opened over file://) can't reliably
// list a folder at runtime. Add/remove images here too — the set-mismatch
// check below reshuffles safely instead of breaking when this changes.
const ICONS = ['m1.png', 'bo1.png', 'ot2.png', 'ot1.png', 'c1.png', 'o1.png', 'b2.png', 'b1.png'];

// Fisher-Yates shuffle into a NEW array. `avoid`, when given, is kept out of
// slot 0 so a fresh pass never repeats the image that was just shown.
function shuffledDeck(avoid) {
  const deck = ICONS.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  if (avoid && deck.length > 1 && deck[0] === avoid) {
    [deck[0], deck[1]] = [deck[1], deck[0]];
  }
  return deck;
}

function setRotatingIcon() {
  const el = document.querySelector('[data-rotating-icon]');
  if (!el) return; // no-op on pages without it (cover, project pages)

  let chosen;
  try {
    let order = JSON.parse(localStorage.getItem('tl_iconOrder'));
    let idx = parseInt(localStorage.getItem('tl_iconIdx'), 10);

    // Is the stored deck still valid AND for the current image set? (If images
    // were added/removed, the stored order won't match ICONS — rebuild it.)
    const sameSet = Array.isArray(order) &&
      order.length === ICONS.length &&
      order.slice().sort().join() === ICONS.slice().sort().join();

    if (!sameSet) {
      order = shuffledDeck();
      idx = 0;                                   // first visit / changed set → start of a fresh deck
    } else {
      idx = (Number.isInteger(idx) ? idx : -1) + 1; // advance one per visit
      if (idx >= order.length) {                 // ran off the end → new shuffled pass
        order = shuffledDeck(order[order.length - 1]); // …without an immediate repeat
        idx = 0;
      }
    }

    chosen = order[idx];
    localStorage.setItem('tl_iconOrder', JSON.stringify(order));
    localStorage.setItem('tl_iconIdx', String(idx));
  } catch (e) {
    // localStorage blocked (private mode / some file:// setups) → plain random pick
    chosen = ICONS[Math.floor(Math.random() * ICONS.length)];
  }

  el.style.backgroundImage = `url("${ICON_DIR}${chosen}")`;
  el.classList.add('is-photo');

  // Remember exactly which icon is now showing so the Domicile project page
  // can reuse this same file as its album cover (see applySelectedCoverImage).
  try { localStorage.setItem(COVER_IMAGE_KEY, ICON_DIR + chosen); } catch (e) {}
}

setRotatingIcon();


// ===========================================================
// PROJECT COVER — reuse the tracklist's currently-shown rotating icon
// ===========================================================
// setRotatingIcon() (above) records whichever icon it just painted into the
// tracklist row. Here we paint that exact same file onto the Domicile
// project page's cover box, so the cover always matches what was showing in
// the tracklist right before the visitor opened the project.
function applySelectedCoverImage() {
  if (!document.body.classList.contains('page-domicile')) return;
  const cover = document.querySelector('.project__cover');
  if (!cover) return;
  let src;
  try { src = localStorage.getItem(COVER_IMAGE_KEY); } catch (e) {}
  if (!src) return;
  cover.style.backgroundImage = `url('${src}')`;
  cover.classList.add('is-photo');
}

applySelectedCoverImage();


