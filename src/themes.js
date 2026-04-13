/**
 * themes.js - Custom CSS theme management
 *
 * Provides built-in themes (Rosé Pine, Tokyo Night, Nord, Midnight Emerald)
 * and allows users to import custom CSS. Themes are injected into
 * the YouTube Music page via insertCSS.
 *
 * FIX v29: Player bar buttons theming — added ytSpecIconShapeHost and .yt-icon-shape
 *   selectors to override SVG icon colors that use fill:currentcolor. YTM's new
 *   icon system wraps SVGs in span.yt-icon-shape.ytSpecIconShapeHost with an inner
 *   div using fill:currentcolor; these elements were not targeted by previous rules.
 *   Also added .sign-in-link selectors for the nav bar sign-in <a> tag which was
 *   completely missing from theme CSS (only #sign-in-button was targeted before).
 * FIX v28: Player bar buttons theming — added CSS var overrides on ytmusic-player-bar
 *   element for --yt-spec-text-primary, --yt-spec-icon-inactive, --yt-spec-call-to-action.
 *   Sign-in button theming — added CSS var overrides on #sign-in-button and
 *   ytmusic-sign-in-button-renderer elements to override YTM's element-level vars.
 *   Added --yt-spec-call-to-action and --yt-spec-call-to-action-inverse to :root.
 * FIX v27: Search bar uniform color (icon button + input = one color), Save button
 *   aggressive override with gradient-box + CSS var + shadow DOM injection.
 * FIX v26: Sign-in button 2-color conflict fix, 3-dots menu popup theming,
 *   ytmusic-chip-cloud-chip-renderer (Save button), search bar collapsed state.
 * FIX v25: Reworked all themes — kept only the most beautiful and popular.
 *   Rosé Pine — elegant dark with warm iris accent (official rosepinetheme.com)
 *   Tokyo Night — sleek blues inspired by Tokyo nightscape (official palette)
 *   Nord — clean arctic blues (official nordtheme.com)
 *   Midnight Emerald — deep dark with vibrant emerald green accent
 *
 * FIX v24: Sign-in button, Save button, player bar icon buttons theming.
 *          Search bar darker/transparent when not focused.
 * FIX v23: yt-spec-button-shape-next button system overrides.
 * FIX v22: Search overlay, black bars fix.
 * FIX v20: Theme colors shared with title bar and mini player via IPC.
 */

const log = require('./logger');
const fs = require('fs');
const path = require('path');

// Global key used to store/retrieve the MutationObserver so we can
// properly disconnect the old observer when switching themes.
const SHADOW_STYLE_OBSERVER_ID = '__ytMusicShadowStyleObserver__';

// ── Shared selector groups (used by all themes) ──

// Backgrounds — main content areas
const BG_SELECTORS = `
  ytmusic-app,
  ytmusic-app-layout,
  ytmusic-browse-response,
  ytmusic-player-page,
  ytmusic-immersive-header-renderer,
  ytmusic-list-item-renderer,
  ytmusic-responsive-list-item-renderer,
  ytmusic-shelf-renderer,
  ytmusic-carousel-shelf-renderer,
  ytmusic-message-page,
  ytmusic-search-page,
  ytmusic-card-shelf-renderer,
  ytmusic-message-renderer,
  ytmusic-detail-header-renderer,
  ytmusic-data-bound-header-renderer,
  ytmusic-item-section-renderer,
  ytmusic-grid-renderer,
  ytmusic-two-column-item-section-renderer
`;

// Backgrounds — nav, player bar, sidebar
const NAV_SELECTORS = `
  ytmusic-nav-bar,
  ytmusic-player-bar,
  ytmusic-app-layout > [slot="nav-bar"]
`;

const SIDEBAR_SELECTORS = `
  ytmusic-guide-renderer,
  #guide-wrapper,
  #items.ytmusic-guide-renderer,
  ytmusic-guide-entry-renderer,
  ytmusic-guide-section-renderer
`;

// Text — primary content
// FIX v32: Added yt-core-attributed-string (YTM now uses this for most
//   title/album text instead of yt-formatted-string). Added explicit player bar
//   title/subtitle selectors, detail header title selectors, and song list title
//   selectors to ensure album & song title text is themed across all views.
const TEXT_SELECTORS = `
  .title, .byline, .subtitle, .text,
  ytmusic-responsive-list-item-renderer .title-column,
  tp-yt-paper-tabs .tab-title,
  yt-formatted-string.title,
  yt-formatted-string.byline,
  .content.ytmusic-data-bound-header-renderer,
  .description.ytmusic-detail-header-renderer,
  .flex-column .subtitle,
  .second-subtitle,
  .title.ytmusic-card-shelf-renderer,
  .subtitle.ytmusic-card-shelf-renderer,
  .title.ytmusic-message-renderer,
  .text.ytmusic-message-renderer,
  yt-formatted-string:not([id="video-title"]),
  yt-core-attributed-string,
  ytmusic-player-bar .title,
  ytmusic-player-bar .subtitle,
  ytmusic-player-bar .byline,
  ytmusic-player-bar yt-core-attributed-string,
  ytmusic-player-bar yt-formatted-string,
  .title.ytmusic-detail-header-renderer,
  .subtitle.ytmusic-detail-header-renderer,
  ytmusic-detail-header-renderer .title,
  ytmusic-detail-header-renderer .subtitle,
  ytmusic-detail-header-renderer yt-core-attributed-string,
  ytmusic-detail-header-renderer yt-formatted-string,
  ytmusic-responsive-list-item-renderer .title,
  ytmusic-responsive-list-item-renderer yt-core-attributed-string,
  ytmusic-list-item-renderer .title,
  ytmusic-list-item-renderer yt-core-attributed-string,
  ytmusic-item-section-renderer .title,
  ytmusic-item-section-renderer yt-core-attributed-string,
  ytmusic-card-shelf-renderer yt-core-attributed-string,
  ytmusic-shelf-renderer .title,
  ytmusic-shelf-renderer yt-core-attributed-string,
  ytmusic-player-queue .title,
  ytmusic-player-queue .subtitle,
  ytmusic-player-queue yt-core-attributed-string,
  ytmusic-player-queue yt-formatted-string,
  #side-view .title,
  #side-view .subtitle,
  #side-view yt-core-attributed-string
`;

// Search — input, suggestions, results, corrections, dropdown
const SEARCH_SELECTORS = `
  ytmusic-search-box input,
  ytmusic-search-box input[type="text"],
  input.ytmusic-search-box,
  #input.ytmusic-search-box,
  ytmusic-search-suggestion,
  .search-box.suggestion,
  ytmusic-search-correction,
  ytmusic-search-box-renderer,
  yt-search-box,
  .suggestion.ytmusic-search-box,
  .search-box input
`;

// Chips / filter buttons
const CHIP_SELECTORS = `
  yt-chip-cloud-chip-renderer,
  ytmusic-chip-cloud-chip-renderer,
  .chip.ytmusic-chip-cloud-renderer,
  yt-chip-cloud-chip-renderer[selected],
  tp-yt-paper-tab,
  tp-yt-paper-tabs
`;

// Icons
const ICON_SELECTORS = `
  iron-icon,
  .icon.ytmusic-toggle-button-renderer,
  yt-icon,
  .icon.ytmusic-menu-navigation-item-renderer,
  .icon.ytmusic-menu-service-item-renderer
`;

// Buttons
const BUTTON_SELECTORS = `
  ytmusic-toggle-button-renderer #button.ytmusic-toggle-button-renderer,
  .yt-spec-button-shape-with-label__label,
  yt-button-renderer button,
  ytmusic-button-renderer button,
  .yt-spec-button-shape-next--button-text-content,
  .yt-spec-button-shape-next__button-text-content
`;

// Scrollbar
const SCROLLBAR_CSS = `
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { border-radius: 4px; }
`;

// Player bar controls
const PLAYER_CONTROLS = `
  .middle-controls-buttons button,
  .right-controls-buttons button,
  .left-controls-buttons button,
  .player-controls button,
  .control-button
`;

// Menu / popup / dropdown
const MENU_SELECTORS = `
  yt-contextual-sheet-renderer,
  ytmusic-menu-popup-renderer,
  tp-yt-paper-listbox,
  ytmusic-menu-navigation-item-renderer,
  ytmusic-menu-service-item-renderer,
  ytmusic-menu-item-renderer,
  .menu-container,
  tp-yt-paper-dialog,
  tp-yt-paper-dialog-scrollable,
  yt-confirm-dialog-renderer,
  ytmusic-add-to-playlist-renderer,
  ytmusic-playlist-add-to-option-renderer,
  ytmusic-unified-share-panel,
  ytmusic-share-panel,
  yt-tooltip-renderer,
  tp-yt-paper-tooltip > #tooltip,
  .dropdown-content,
  tp-yt-paper-dropdown-menu-light,
  tp-yt-paper-listbox,
  ytd-menu-popup-renderer,
  ytd-menu-service-item-renderer,
  .yt-contextual-sheet-renderer,
  .ytmusic-menu-popup-renderer,
  ytmusic-multi-page-menu-renderer,
  ytmusic-multi-page-menu
`;

// FIX v26: Account / 3-dots dropdown menu (profile menu, settings menu)
const ACCOUNT_MENU_SELECTORS = `
  ytmusic-multi-page-menu-renderer,
  ytmusic-multi-page-menu,
  ytd-compact-link-renderer,
  tp-yt-iron-dropdown,
  ytmusic-popup-container tp-yt-iron-dropdown
`;

// Progress bar / timeline
const PROGRESS_SELECTORS = `
  #progress-bar yt-formatted-string,
  #slider-bar,
  #progress-bar,
  .time-info,
  .song-progress,
  #left-controls .time-info
`;

// Playlist / queue
const QUEUE_SELECTORS = `
  ytmusic-player-queue,
  #autoplay,
  ytmusic-queue-item-renderer,
  .queue-bar
`;

// Comments
const COMMENT_SELECTORS = `
  ytmusic-comment-thread-renderer,
  ytmusic-comment-renderer,
  yt-comment-renderer,
  #comments
`;

// ── Build theme CSS from color values ──

function buildThemeCSS(colors) {
  return `
    /* === Backgrounds === */
    ${BG_SELECTORS} { background: ${colors.bg} !important; }
    ${NAV_SELECTORS} { background: ${colors.bgNav} !important; }
    ${SIDEBAR_SELECTORS} { background: ${colors.bgNav} !important; }

    /* === Text === */
    ${TEXT_SELECTORS} { color: ${colors.text} !important; }
    .second-byline, .detail { color: ${colors.accent} !important; }

    /* FIX v32: Links inside title elements (album/artist links in titles,
       bylines, etc.) — YTM renders these as <a> tags inside yt-core-attributed-string
       or yt-formatted-string. They inherit color from --yt-endpoint-color which
       may not match the theme. Force theme text color on these link elements. */
    .title a, .subtitle a, .byline a,
    yt-core-attributed-string a, yt-formatted-string a,
    ytmusic-player-bar a,
    ytmusic-detail-header-renderer a,
    ytmusic-responsive-list-item-renderer a,
    ytmusic-list-item-renderer a,
    ytmusic-player-queue a,
    #side-view a {
      color: ${colors.text} !important;
    }
    .subtitle a, .byline a, .second-byline a,
    ytmusic-player-bar .subtitle a,
    ytmusic-player-bar .byline a,
    ytmusic-detail-header-renderer .subtitle a,
    ytmusic-responsive-list-item-renderer .subtitle a,
    ytmusic-responsive-list-item-renderer .byline a {
      color: ${colors.textMuted} !important;
    }
    .title a:hover, .byline a:hover,
    yt-core-attributed-string a:hover,
    yt-formatted-string a:hover {
      color: ${colors.accent} !important;
    }

    /* === Search === */
    /* FIX v27: Search bar — ONE uniform color for the entire search bar.
       The search icon button, input, placeholder — all must look like a single
       unified element with no visible boundaries between sub-elements.
       When CLOSED: subtle darker shade blending with nav bar.
       When OPENED: one solid themed background color. */

    /* ytmusic-search-box removed from BG_SELECTORS — we control it entirely here */
    ytmusic-search-box {
      background: transparent !important;
    }

    /* Search input text — always themed text color */
    ytmusic-search-box input,
    ytmusic-search-box input[type="text"],
    input.ytmusic-search-box,
    #input.ytmusic-search-box,
    .search-box input {
      color: ${colors.text} !important;
    }

    /* ===== COLLAPSED search bar (not opened, not focused) ===== */
    /* The entire search bar is one subtle darker box blending with the nav bar.
       All sub-elements share the same background with no visible boundaries. */
    ytmusic-search-box:not([opened]):not(.has-focus) .search-box {
      background: ${colors.bgInput} !important;
      border-color: ${colors.bgInput} !important;
      border-radius: 8px !important;
    }
    ytmusic-search-box:not([opened]):not(.has-focus) .search-container {
      background: transparent !important;
    }
    ytmusic-search-box:not([opened]):not(.has-focus) input,
    ytmusic-search-box:not([opened]):not(.has-focus) #input {
      background: transparent !important;
      border-color: transparent !important;
    }
    /* Search icon button — SAME background as search-box, no visible boundary */
    ytmusic-search-box:not([opened]):not(.has-focus) .search-button,
    ytmusic-search-box:not([opened]):not(.has-focus) .search-button #button,
    ytmusic-search-box:not([opened]):not(.has-focus) yt-icon-button.search-button,
    ytmusic-search-box:not([opened]):not(.has-focus) yt-icon-button.search-button #button {
      background: transparent !important;
      border-color: transparent !important;
    }
    /* Search icon in collapsed state */
    ytmusic-search-box:not([opened]):not(.has-focus) .search-button yt-icon,
    ytmusic-search-box:not([opened]):not(.has-focus) .search-button iron-icon {
      fill: ${colors.textMuted} !important;
      color: ${colors.textMuted} !important;
    }
    /* Placeholder text */
    ytmusic-search-box:not([opened]):not(.has-focus) #placeholder {
      color: ${colors.textMuted} !important;
    }

    /* ===== OPENED / FOCUSED search bar ===== */
    /* The entire search bar is one solid themed background — all sub-elements
       blend into a single unified colored bar. */
    ytmusic-search-box[opened] .search-box,
    ytmusic-search-box.has-focus .search-box {
      background: ${colors.bgInput} !important;
      border-color: ${colors.bgInput} !important;
      border-radius: 8px !important;
    }
    ytmusic-search-box[opened] .search-container,
    ytmusic-search-box.has-focus .search-container {
      background: transparent !important;
    }
    /* Input field when opened — transparent so the .search-box bg shows through */
    ytmusic-search-box[opened] input,
    ytmusic-search-box.has-focus input,
    ytmusic-search-box[opened] #input,
    ytmusic-search-box.has-focus #input {
      background: transparent !important;
      border-color: transparent !important;
      color: ${colors.text} !important;
    }
    /* Search icon button when opened — SAME transparent bg as input area */
    ytmusic-search-box[opened] .search-button,
    ytmusic-search-box.has-focus .search-button,
    ytmusic-search-box[opened] .search-button #button,
    ytmusic-search-box.has-focus .search-button #button,
    ytmusic-search-box[opened] yt-icon-button.search-button,
    ytmusic-search-box.has-focus yt-icon-button.search-button,
    ytmusic-search-box[opened] yt-icon-button.search-button #button,
    ytmusic-search-box.has-focus yt-icon-button.search-button #button {
      background: transparent !important;
      border-color: transparent !important;
    }
    /* Search icon when opened */
    ytmusic-search-box[opened] .search-button yt-icon,
    ytmusic-search-box.has-focus .search-button yt-icon,
    ytmusic-search-box[opened] .search-button iron-icon,
    ytmusic-search-box.has-focus .search-button iron-icon {
      fill: ${colors.textMuted} !important;
      color: ${colors.textMuted} !important;
    }

    /* Clear button in search bar */
    ytmusic-search-box #clear-button,
    ytmusic-search-box #clear-button #button {
      background: transparent !important;
      border-color: transparent !important;
    }
    ytmusic-search-box #clear-button yt-icon,
    ytmusic-search-box #clear-button iron-icon {
      fill: ${colors.textMuted} !important;
      color: ${colors.textMuted} !important;
    }
    /* Override YTM's element-level CSS variable overrides for search theming.
       YTM sets --ytmusic-search-background to #030303 ON ytmusic-search-box itself,
       which overrides any :root value. We must set it here too. */
    ytmusic-search-box {
      --ytmusic-search-background: ${colors.bgNav} !important;
      --ytmusic-search-border: ${colors.bgInput} !important;
      --ytmusic-search-box-text-color: ${colors.text} !important;
      --ytmusic-overlay-text-secondary: ${colors.text} !important;
      --yt-endpoint-color: ${colors.text} !important;
    }

    /* Search input focus / active states */
    ytmusic-search-box input:focus,
    ytmusic-search-box input[type="text"]:focus,
    input.ytmusic-search-box:focus,
    #input.ytmusic-search-box:focus,
    .search-box input:focus {
      color: ${colors.text} !important;
      background: ${colors.bgInput} !important;
      border-color: ${colors.accent} !important;
      outline-color: ${colors.accent} !important;
    }

    /* tp-yt-paper-input focused underline (used in some YTM dialogs) */
    tp-yt-paper-input .underline .focused-line {
      background: ${colors.accent} !important;
      border-color: ${colors.accent} !important;
    }
    tp-yt-paper-input .underline .unfocused-line {
      background: ${colors.bgInput} !important;
      border-color: ${colors.bgInput} !important;
    }

    /* Search suggestions dropdown — the container that appears below the input.
       Using direct selectors in addition to the CSS variable overrides above. */
    ytmusic-search-box #suggestion-list,
    #suggestion-list.ytmusic-search-box,
    ytmusic-search-suggestions-section,
    ytmusic-search-suggestions-section.ytmusic-search-box,
    ytmusic-search-box .search-box.suggestions,
    ytmusic-search-box .suggestions {
      background: ${colors.bgNav} !important;
      border-color: ${colors.bgInput} !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
    }

    /* Individual search suggestion items.
       YTM sets --yt-endpoint-color and --ytmusic-overlay-text-secondary
       for text color; we override both on ytmusic-search-suggestion. */
    ytmusic-search-suggestion,
    ytmusic-search-suggestion.ytmusic-search-suggestions-section,
    .suggestion.ytmusic-search-box,
    .left-content.ytmusic-search-suggestion {
      background: ${colors.bgNav} !important;
      color: ${colors.text} !important;
      --yt-endpoint-color: ${colors.text} !important;
      --ytmusic-overlay-text-secondary: ${colors.text} !important;
      border: none !important;
    }
    .title.ytmusic-search-suggestion,
    yt-formatted-string.ytmusic-search-suggestion,
    .subtitle.ytmusic-search-suggestion,
    .search-suggestion-icon.ytmusic-search-suggestion,
    yt-icon.search-suggestion-icon {
      color: ${colors.text} !important;
      fill: ${colors.textMuted} !important;
    }
    /* Hover / selected / focus states for suggestion items.
       YTM uses hardcoded rgba(255,255,255,0.1) for hover. */
    ytmusic-search-suggestion:hover,
    ytmusic-search-suggestion.ytmusic-search-suggestions-section:hover,
    .suggestion.ytmusic-search-box:hover,
    .hover.ytmusic-search-suggestions-section,
    .selected-suggestion.ytmusic-search-suggestions-section,
    #suggestions.ytmusic-search-suggestions-section > .hover.ytmusic-search-suggestions-section,
    #suggestions.ytmusic-search-suggestions-section > .selected-suggestion.ytmusic-search-suggestions-section {
      background: ${colors.bgHover} !important;
      color: ${colors.text} !important;
    }

    /* FIX v27: Search box containers when opened — already handled by the
       .search-box rules above (bgInput). These additional containers also need
       to be transparent so the .search-box background shows through uniformly. */
    ytmusic-search-box[opened] .search-box-container,
    ytmusic-search-box.has-focus .search-box-container,
    ytmusic-search-box[opened] #container,
    ytmusic-search-box.has-focus #container,
    ytmusic-search-box[opened] .container,
    ytmusic-search-box.has-focus .container {
      background: transparent !important;
      border-color: transparent !important;
    }
    /* tp-yt-paper-input-container — transparent so the .search-box bg shows through */
    tp-yt-paper-input-container,
    tp-yt-paper-input-container .input-content {
      background: transparent !important;
      border-color: transparent !important;
    }
    tp-yt-paper-input-container .underline,
    tp-yt-paper-input-container .focused-line,
    tp-yt-paper-input-container .unfocused-line {
      background: transparent !important;
      border-color: transparent !important;
    }

    /* Search box outer element when opened/expanded.
       The ytmusic-search-box element itself stays transparent,
       while the inner containers get the themed background. */
    ytmusic-search-box[opened],
    ytmusic-search-box.has-focus,
    ytmusic-search-box.opened {
      background: transparent !important;
      border-color: ${colors.bgInput} !important;
    }

    /* FIX v22: Search overlay / backdrop (the dark area behind suggestions) */
    .search-box-backdrop,
    ytmusic-search-box .backdrop,
    ytmusic-search-box .scrim,
    ytmusic-search-box .overlay {
      background: rgba(0, 0, 0, 0.5) !important;
    }

    /* FIX v22: tp-yt-paper-input-container inner elements */
    tp-yt-paper-input-container {
      --paper-input-container-focus-color: ${colors.accent} !important;
      --paper-input-container-color: ${colors.bgInput} !important;
      --paper-input-container-input-color: ${colors.text} !important;
      --paper-input-container-label-color: ${colors.textMuted} !important;
      --paper-input-container-underline-color: ${colors.bgInput} !important;
      --paper-input-container-underline-focus-color: ${colors.accent} !important;
    }
    tp-yt-paper-input-container .focused-line {
      background: ${colors.accent} !important;
      border-color: ${colors.accent} !important;
    }
    tp-yt-paper-input-container .unfocused-line {
      background: ${colors.bgInput} !important;
      border-color: ${colors.bgInput} !important;
    }

    /* FIX v22: Search box input container wrapper — the two horizontal lines
       that appear as black bars when the search bar is open */
    ytmusic-search-box tp-yt-paper-input-container,
    ytmusic-search-box .underline {
      background: transparent !important;
      border: none !important;
    }

    /* Search container — the wrapper that holds .search-box and #suggestion-list.
       YTM adds box-shadow on opened state. */
    ytmusic-search-box .search-container {
      background: transparent !important;
    }

    /* Search box icon colors */
    ytmusic-search-box iron-icon,
    ytmusic-search-box yt-icon,
    ytmusic-search-box .search-icon {
      fill: ${colors.textMuted} !important;
      color: ${colors.textMuted} !important;
    }

    /* Search box clear button */
    ytmusic-search-box .clear-button,
    ytmusic-search-box #clear-button {
      color: ${colors.textMuted} !important;
    }

    /* Search correction ("Showing results for...") */
    ytmusic-search-correction,
    ytmusic-search-correction-renderer {
      color: ${colors.text} !important;
      background: ${colors.bg} !important;
    }

    /* Search results — non-music items (artist cards, album cards, etc.) */
    ytmusic-search-box-renderer,
    ytmusic-item-section-renderer .header,
    ytmusic-search-page {
      background: ${colors.bg} !important;
      color: ${colors.text} !important;
    }

    /* Search result "See all" and category header links */
    .header.ytmusic-item-section-renderer a,
    .title.ytmusic-item-section-renderer a,
    ytmusic-item-section-renderer .header a {
      color: ${colors.text} !important;
    }
    .header.ytmusic-item-section-renderer a:hover,
    .title.ytmusic-item-section-renderer a:hover {
      color: ${colors.accent} !important;
    }

    /* === Chips / filter tabs === */
    ${CHIP_SELECTORS} { background: ${colors.bgInput} !important; color: ${colors.text} !important; }
    yt-chip-cloud-chip-renderer[selected] { background: ${colors.accent} !important; color: ${colors.bg} !important; }
    tp-yt-paper-tab.iron-selected { color: ${colors.accent} !important; }

    /* FIX v27: ytmusic-chip-cloud-chip-renderer — the Save/Bookmark chip button
       in the player queue header ("UP NEXT" panel). YTM uses this YTMusic-specific
       chip variant with chip-style="STYLE_TRANSPARENT". The .gradient-box has a
       background gradient that must be aggressively overridden. We must also
       override CSS custom properties on the host element since YTM uses var()
       for the chip background internally. */
    ytmusic-chip-cloud-chip-renderer {
      background: transparent !important;
      color: ${colors.text} !important;
      border-color: transparent !important;
      --ytmusic-chip-background: transparent !important;
      --ytmusic-chip-background-hover: ${colors.bgHover} !important;
      --ytmusic-chip-active-background: ${colors.bgHover} !important;
      --yt-spec-10-percent-layer: transparent !important;
      --yt-spec-touch-feedback: ${colors.bgHover} !important;
    }
    ytmusic-chip-cloud-chip-renderer .gradient-box {
      background: transparent !important;
      background-image: none !important;
      background-color: transparent !important;
    }
    ytmusic-chip-cloud-chip-renderer a.yt-simple-endpoint {
      color: ${colors.text} !important;
      background: transparent !important;
    }
    ytmusic-chip-cloud-chip-renderer yt-formatted-string.text,
    ytmusic-chip-cloud-chip-renderer .text,
    ytmusic-chip-cloud-chip-renderer yt-icon,
    ytmusic-chip-cloud-chip-renderer .yt-icon-shape {
      color: ${colors.text} !important;
      fill: ${colors.text} !important;
    }
    ytmusic-chip-cloud-chip-renderer:hover {
      background: ${colors.bgHover} !important;
    }
    ytmusic-chip-cloud-chip-renderer:hover .gradient-box {
      background: transparent !important;
      background-image: none !important;
    }
    /* Active/selected state for ytmusic chips */
    ytmusic-chip-cloud-chip-renderer[aria-selected="true"],
    ytmusic-chip-cloud-chip-renderer[selected] {
      background: ${colors.accent} !important;
      color: ${colors.bg} !important;
    }
    ytmusic-chip-cloud-chip-renderer[aria-selected="true"] yt-formatted-string.text,
    ytmusic-chip-cloud-chip-renderer[aria-selected="true"] .text,
    ytmusic-chip-cloud-chip-renderer[aria-selected="true"] yt-icon,
    ytmusic-chip-cloud-chip-renderer[selected] yt-formatted-string.text,
    ytmusic-chip-cloud-chip-renderer[selected] .text,
    ytmusic-chip-cloud-chip-renderer[selected] yt-icon {
      color: ${colors.bg} !important;
      fill: ${colors.bg} !important;
    }
    /* FIX v27: Force the chip button container background to be transparent */
    #buttons.ytmusic-queue-header-renderer {
      background: transparent !important;
    }

    /* === Icons === */
    ${ICON_SELECTORS} { fill: ${colors.accent} !important; color: ${colors.accent} !important; }

    /* === Buttons === */
    ${BUTTON_SELECTORS} { color: ${colors.accent} !important; }
    .yt-spec-button-shape-with-label__label { color: ${colors.textMuted} !important; }

    /* FIX v23: yt-spec-button-shape-next — YTM's new button system.
       These buttons use hardcoded rgba backgrounds (not CSS variables),
       so we must override them directly with selectors. */
    .yt-spec-button-shape-next {
      --yt-spec-call-to-action: ${colors.accent} !important;
      --yt-spec-call-to-action-inverse: ${colors.bg} !important;
      --yt-spec-10-percent-layer: rgba(255,255,255,0.1) !important;
      --yt-spec-20-percent-layer: rgba(255,255,255,0.2) !important;
      color: ${colors.text} !important;
    }

    /* Tonal buttons (Sign in variant, Save button, secondary actions) */
    .yt-spec-button-shape-next--tonal {
      background: ${colors.bgInput} !important;
      color: ${colors.text} !important;
      border-color: ${colors.bgInput} !important;
    }
    .yt-spec-button-shape-next--tonal:hover {
      background: ${colors.bgHover} !important;
    }
    .yt-spec-button-shape-next--tonal .yt-spec-button-shape-next__button-text-content,
    .yt-spec-button-shape-next--tonal .yt-spec-button-shape-next--button-text-content,
    .yt-spec-button-shape-next--tonal .yt-spec-button-shape-next__icon,
    .yt-spec-button-shape-next--tonal yt-icon,
    .yt-spec-button-shape-next--tonal iron-icon {
      color: ${colors.text} !important;
      fill: ${colors.text} !important;
    }
    /* FIX v24: Save button in player queue / sidebar — YTM uses tonal/outline
       variant for the Save/Bookmark button in the "UP NEXT" panel. */
    ytmusic-player-queue .yt-spec-button-shape-next--tonal,
    ytmusic-player-queue .yt-spec-button-shape-next--outline,
    ytmusic-player-bar .yt-spec-button-shape-next--tonal,
    #side-view .yt-spec-button-shape-next--tonal {
      background: ${colors.bgInput} !important;
      color: ${colors.text} !important;
      border-color: ${colors.bgInput} !important;
    }
    ytmusic-player-queue .yt-spec-button-shape-next--tonal:hover,
    ytmusic-player-queue .yt-spec-button-shape-next--outline:hover,
    ytmusic-player-bar .yt-spec-button-shape-next--tonal:hover,
    #side-view .yt-spec-button-shape-next--tonal:hover {
      background: ${colors.bgHover} !important;
    }

    /* Filled buttons (Let's go, primary actions) */
    .yt-spec-button-shape-next--filled {
      background: ${colors.accent} !important;
      color: ${colors.bg} !important;
    }
    .yt-spec-button-shape-next--filled:hover {
      opacity: 0.9 !important;
    }
    .yt-spec-button-shape-next--filled .yt-spec-button-shape-next__button-text-content,
    .yt-spec-button-shape-next--filled .yt-spec-button-shape-next--button-text-content {
      color: ${colors.bg} !important;
    }

    /* Text/Icon buttons on cards (play button, action menu dots) */
    .yt-spec-button-shape-next--text {
      background: rgba(255,255,255,0.06) !important;
      color: ${colors.text} !important;
    }
    .yt-spec-button-shape-next--text:hover {
      background: rgba(255,255,255,0.12) !important;
    }
    .yt-spec-button-shape-next--text .yt-spec-button-shape-next__icon,
    .yt-spec-button-shape-next--text yt-icon,
    .yt-spec-button-shape-next--text iron-icon {
      fill: ${colors.text} !important;
      color: ${colors.text} !important;
    }
    .yt-spec-button-shape-next--text .yt-spec-button-shape-next__button-text-content,
    .yt-spec-button-shape-next--text .yt-spec-button-shape-next--button-text-content {
      color: ${colors.text} !important;
    }

    /* Outline/Call-to-action buttons */
    .yt-spec-button-shape-next--outline {
      background: transparent !important;
      color: ${colors.accent} !important;
      border-color: ${colors.accent} !important;
    }
    .yt-spec-button-shape-next--outline:hover {
      background: rgba(255,255,255,0.08) !important;
    }

    /* Button icon-only sizing on cards */
    .yt-spec-button-shape-next--icon-button {
      color: ${colors.text} !important;
    }
    .yt-spec-button-shape-next--icon-button .yt-spec-button-shape-next__icon {
      fill: ${colors.text} !important;
    }

    /* === Scrollbar === */
    ${SCROLLBAR_CSS}
    ::-webkit-scrollbar { background: ${colors.bg} !important; }
    ::-webkit-scrollbar-thumb { background: ${colors.bgInput} !important; }
    ::-webkit-scrollbar-thumb:hover { background: ${colors.hover} !important; }

    /* === Player controls === */
    /* FIX v30: Use accent color for all player bar buttons — text colors are
       near-white like the YTM default, so only accent makes theming visible. */
    ${PLAYER_CONTROLS} { color: ${colors.accent} !important; }

    ytmusic-player-bar yt-icon-button,
    ytmusic-player-bar .player-controls button,
    ytmusic-player-bar button yt-icon-button,
    ytmusic-player-bar .yt-spec-button-shape-next,
    ytmusic-player-bar .control-button,
    ytmusic-player-bar .middle-controls-buttons yt-icon-button,
    ytmusic-player-bar .right-controls-buttons yt-icon-button,
    ytmusic-player-bar .left-controls-buttons yt-icon-button,
    ytmusic-player-bar ytmusic-toggle-button-renderer {
      color: ${colors.accent} !important;
    }
    ytmusic-player-bar yt-icon-button yt-icon,
    ytmusic-player-bar yt-icon-button iron-icon,
    ytmusic-player-bar .player-controls button yt-icon,
    ytmusic-player-bar .player-controls button iron-icon,
    ytmusic-player-bar button yt-icon,
    ytmusic-player-bar button iron-icon,
    ytmusic-player-bar .yt-spec-button-shape-next yt-icon,
    ytmusic-player-bar .yt-spec-button-shape-next iron-icon,
    ytmusic-player-bar .yt-spec-button-shape-next__icon,
    ytmusic-player-bar .control-button yt-icon,
    ytmusic-player-bar .control-button iron-icon,
    ytmusic-player-bar ytmusic-toggle-button-renderer yt-icon,
    ytmusic-player-bar ytmusic-toggle-button-renderer iron-icon {
      fill: ${colors.accent} !important;
      color: ${colors.accent} !important;
    }

    /* 1. button#button — the source of "currentcolor" inheritance chain */
    ytmusic-player-bar yt-icon-button button#button.style-scope.yt-icon-button,
    ytmusic-player-bar .volume > button,
    ytmusic-player-bar .previous-button > button,
    ytmusic-player-bar .play-pause-button > button,
    ytmusic-player-bar .next-button > button,
    ytmusic-player-bar .repeat > button,
    ytmusic-player-bar .shuffle > button,
    ytmusic-player-bar .captions > button,
    ytmusic-player-bar .expand-button > button,
    ytmusic-player-bar .toggle-player-page-button > button,
    ytmusic-player-bar .exit-fullscreen-button > button {
      color: ${colors.accent} !important;
    }

    /* 1b. yt-icon — must also have color set so currentcolor inheritance works */
    ytmusic-player-bar yt-icon-button button yt-icon.style-scope.ytmusic-player-bar,
    ytmusic-player-bar .volume yt-icon,
    ytmusic-player-bar .previous-button yt-icon,
    ytmusic-player-bar .play-pause-button yt-icon,
    ytmusic-player-bar .next-button yt-icon,
    ytmusic-player-bar .repeat yt-icon,
    ytmusic-player-bar .shuffle yt-icon,
    ytmusic-player-bar .captions yt-icon,
    ytmusic-player-bar .expand-button yt-icon,
    ytmusic-player-bar .toggle-player-page-button yt-icon,
    ytmusic-player-bar .exit-fullscreen-button yt-icon {
      color: ${colors.accent} !important;
      fill: ${colors.accent} !important;
    }

    /* 2. span.yt-icon-shape.ytSpecIconShapeHost — the SVG wrapper span */
    ytmusic-player-bar .yt-icon-shape.style-scope.yt-icon.ytSpecIconShapeHost,
    ytmusic-player-bar span.yt-icon-shape.ytSpecIconShapeHost {
      color: ${colors.accent} !important;
    }

    /* 3. Inner div with inline "fill: currentcolor" — override fill directly */
    ytmusic-player-bar .yt-icon-shape div[style*="fill"],
    ytmusic-player-bar .ytSpecIconShapeHost div[style*="fill"],
    ytmusic-player-bar .yt-icon-shape.style-scope.yt-icon div,
    ytmusic-player-bar .ytSpecIconShapeHost.style-scope.yt-icon div {
      fill: ${colors.accent} !important;
      color: ${colors.accent} !important;
    }

    /* 4. SVG + path — ultimate fallback */
    ytmusic-player-bar .yt-icon-shape svg,
    ytmusic-player-bar .ytSpecIconShapeHost svg,
    ytmusic-player-bar .yt-icon-shape svg path,
    ytmusic-player-bar .ytSpecIconShapeHost svg path {
      fill: currentcolor !important;
      color: ${colors.accent} !important;
    }
    /* Active/pressed player bar buttons (repeat on, shuffle on, like) */
    ytmusic-player-bar yt-icon-button[aria-pressed="true"],
    ytmusic-player-bar .toggle-button-active,
    ytmusic-player-bar ytmusic-toggle-button-renderer[like-status="LIKE"],
    ytmusic-player-bar .yt-spec-button-shape-next[aria-pressed="true"] {
      color: ${colors.accent} !important;
    }
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] yt-icon,
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] iron-icon,
    ytmusic-player-bar .toggle-button-active yt-icon,
    ytmusic-player-bar .toggle-button-active iron-icon,
    ytmusic-player-bar ytmusic-toggle-button-renderer[like-status="LIKE"] yt-icon,
    ytmusic-player-bar .yt-spec-button-shape-next[aria-pressed="true"] yt-icon,
    ytmusic-player-bar .yt-spec-button-shape-next[aria-pressed="true"] iron-icon {
      fill: ${colors.accent} !important;
      color: ${colors.accent} !important;
    }
    /* FIX v29: Active state for player bar buttons — nuclear approach.
       When repeat/shuffle/like is active (aria-pressed="true"), use accent color.
       Target the same elements as the inactive state but with accent color. */
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] button#button.style-scope.yt-icon-button,
    ytmusic-player-bar .repeat[aria-pressed="true"] > button,
    ytmusic-player-bar .shuffle[aria-pressed="true"] > button {
      color: ${colors.accent} !important;
    }
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] .yt-icon-shape.style-scope.yt-icon.ytSpecIconShapeHost,
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] span.yt-icon-shape.ytSpecIconShapeHost {
      color: ${colors.accent} !important;
    }
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] .yt-icon-shape div[style*="fill"],
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] .ytSpecIconShapeHost div[style*="fill"],
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] .yt-icon-shape.style-scope.yt-icon div,
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] .ytSpecIconShapeHost.style-scope.yt-icon div {
      fill: ${colors.accent} !important;
      color: ${colors.accent} !important;
    }
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] .yt-icon-shape svg,
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] .ytSpecIconShapeHost svg,
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] .yt-icon-shape svg path,
    ytmusic-player-bar yt-icon-button[aria-pressed="true"] .ytSpecIconShapeHost svg path {
      fill: currentcolor !important;
      color: ${colors.accent} !important;
    }
    /* FIX v24: Player bar button backgrounds — make icon buttons transparent */
    ytmusic-player-bar .yt-spec-button-shape-next--icon-button,
    ytmusic-player-bar .yt-spec-button-shape-next--text {
      background: transparent !important;
    }
    ytmusic-player-bar .yt-spec-button-shape-next--icon-button:hover,
    ytmusic-player-bar .yt-spec-button-shape-next--text:hover {
      background: rgba(255,255,255,0.1) !important;
    }

    /* FIX v28: Player bar CSS variable overrides — YTM sets CSS custom properties
       at the ytmusic-player-bar element level (e.g., --yt-spec-text-primary,
       --yt-spec-icon-inactive) which take precedence over :root values.
       Without these overrides, player bar icons and buttons show YTM's default
       grey/white colors instead of the theme colors.
       Also override on .player-controls and middle/right/left-controls containers
       since YTM may set variables at multiple nesting levels. */
    ytmusic-player-bar,
    ytmusic-player-bar .player-controls,
    ytmusic-player-bar .middle-controls-buttons,
    ytmusic-player-bar .right-controls-buttons,
    ytmusic-player-bar .left-controls-buttons {
      --yt-spec-text-primary: ${colors.text} !important;
      --yt-spec-text-secondary: ${colors.textMuted} !important;
      --yt-spec-icon-inactive: ${colors.accent} !important;
      --yt-spec-icon-disabled: ${colors.textMuted} !important;
      --yt-spec-call-to-action: ${colors.accent} !important;
      --yt-spec-call-to-action-inverse: ${colors.bg} !important;
      --yt-spec-10-percent-layer: transparent !important;
      --yt-spec-20-percent-layer: transparent !important;
      --yt-spec-touch-feedback: rgba(255,255,255,0.1) !important;
      --ytmusic-player-bar-text: ${colors.text} !important;
      --ytmusic-player-bar-icon: ${colors.accent} !important;
      --ytmusic-player-bar-background: ${colors.bgNav} !important;
    }

    /* FIX v32: Player bar song & album title text — YTM uses yt-core-attributed-string
       and yt-formatted-string for the currently-playing title, album, and artist.
       These elements can have inline color styles or element-level CSS variable
       overrides that beat the :root values, so we target them directly. */
    ytmusic-player-bar .title,
    ytmusic-player-bar .subtitle,
    ytmusic-player-bar .byline,
    ytmusic-player-bar .content-info,
    ytmusic-player-bar .song-title,
    ytmusic-player-bar .track-title,
    ytmusic-player-bar yt-core-attributed-string,
    ytmusic-player-bar yt-formatted-string.title,
    ytmusic-player-bar yt-formatted-string.byline,
    ytmusic-player-bar yt-formatted-string.subtitle,
    ytmusic-player-bar yt-formatted-string {
      color: ${colors.text} !important;
    }
    ytmusic-player-bar .subtitle,
    ytmusic-player-bar .byline,
    ytmusic-player-bar .second-subtitle,
    ytmusic-player-bar .content-info,
    ytmusic-player-bar yt-formatted-string.byline,
    ytmusic-player-bar yt-formatted-string.subtitle {
      color: ${colors.textMuted} !important;
    }
    /* Player bar time-info (current time / duration) */
    ytmusic-player-bar .time-info,
    ytmusic-player-bar #left-controls .time-info,
    ytmusic-player-bar #progress-bar yt-formatted-string {
      color: ${colors.textMuted} !important;
    }

    /* FIX v32: Detail header (album/playlist/artist page) title & subtitle —
       YTM renders the large header with album/playlist title, artist name, etc.
       These use both yt-core-attributed-string and yt-formatted-string, and
       YTM sets --yt-spec-text-primary at the element level which overrides :root. */
    ytmusic-detail-header-renderer,
    ytmusic-data-bound-header-renderer {
      --yt-spec-text-primary: ${colors.text} !important;
      --yt-spec-text-secondary: ${colors.textMuted} !important;
    }
    ytmusic-detail-header-renderer .title,
    ytmusic-detail-header-renderer .subtitle,
    ytmusic-detail-header-renderer .description,
    ytmusic-detail-header-renderer yt-core-attributed-string,
    ytmusic-detail-header-renderer yt-formatted-string,
    ytmusic-data-bound-header-renderer .title,
    ytmusic-data-bound-header-renderer .content,
    ytmusic-data-bound-header-renderer yt-core-attributed-string,
    ytmusic-data-bound-header-renderer yt-formatted-string {
      color: ${colors.text} !important;
    }
    ytmusic-detail-header-renderer .subtitle,
    ytmusic-detail-header-renderer .second-subtitle,
    ytmusic-detail-header-renderer .description,
    ytmusic-data-bound-header-renderer .subtitle {
      color: ${colors.textMuted} !important;
    }

    /* FIX v32: Song list item titles — track titles in album/playlist views.
       YTM may set element-level CSS vars on these renderers. */
    ytmusic-responsive-list-item-renderer,
    ytmusic-list-item-renderer {
      --yt-spec-text-primary: ${colors.text} !important;
      --yt-spec-text-secondary: ${colors.textMuted} !important;
    }
    ytmusic-responsive-list-item-renderer .title,
    ytmusic-responsive-list-item-renderer .title-column,
    ytmusic-responsive-list-item-renderer yt-core-attributed-string,
    ytmusic-responsive-list-item-renderer yt-formatted-string,
    ytmusic-list-item-renderer .title,
    ytmusic-list-item-renderer yt-core-attributed-string,
    ytmusic-list-item-renderer yt-formatted-string {
      color: ${colors.text} !important;
    }
    ytmusic-responsive-list-item-renderer .subtitle,
    ytmusic-responsive-list-item-renderer .byline,
    ytmusic-responsive-list-item-renderer .second-byline {
      color: ${colors.textMuted} !important;
    }

    /* FIX v32: Player queue / side panel titles */
    ytmusic-player-queue {
      --yt-spec-text-primary: ${colors.text} !important;
      --yt-spec-text-secondary: ${colors.textMuted} !important;
    }
    ytmusic-player-queue .title,
    ytmusic-player-queue .subtitle,
    ytmusic-player-queue yt-core-attributed-string,
    ytmusic-player-queue yt-formatted-string,
    #side-view .title,
    #side-view .subtitle,
    #side-view yt-core-attributed-string,
    #side-view yt-formatted-string {
      color: ${colors.text} !important;
    }
    ytmusic-player-queue .subtitle,
    ytmusic-player-queue .byline,
    #side-view .subtitle,
    #side-view .byline {
      color: ${colors.textMuted} !important;
    }

    /* FIX v32: Shelf / section titles ("Recommended", "Quick picks", etc.) */
    ytmusic-shelf-renderer,
    ytmusic-item-section-renderer {
      --yt-spec-text-primary: ${colors.text} !important;
      --yt-spec-text-secondary: ${colors.textMuted} !important;
    }
    ytmusic-shelf-renderer .title,
    ytmusic-shelf-renderer yt-core-attributed-string,
    ytmusic-shelf-renderer yt-formatted-string,
    ytmusic-item-section-renderer .title,
    ytmusic-item-section-renderer .header,
    ytmusic-item-section-renderer yt-core-attributed-string,
    ytmusic-item-section-renderer yt-formatted-string {
      color: ${colors.text} !important;
    }

    /* FIX v32: Card shelf renderer title & subtitle */
    ytmusic-card-shelf-renderer {
      --yt-spec-text-primary: ${colors.text} !important;
      --yt-spec-text-secondary: ${colors.textMuted} !important;
    }
    ytmusic-card-shelf-renderer .title,
    ytmusic-card-shelf-renderer .subtitle,
    ytmusic-card-shelf-renderer yt-core-attributed-string,
    ytmusic-card-shelf-renderer yt-formatted-string {
      color: ${colors.text} !important;
    }
    ytmusic-card-shelf-renderer .subtitle {
      color: ${colors.textMuted} !important;
    }

    ytmusic-nav-bar {
      --yt-spec-call-to-action: ${colors.accent} !important;
      --yt-spec-call-to-action-inverse: ${colors.bg} !important;
      --yt-spec-text-primary: ${colors.text} !important;
      --yt-spec-text-secondary: ${colors.textMuted} !important;
      --yt-spec-icon-inactive: ${colors.textMuted} !important;
      --yt-spec-10-percent-layer: ${colors.bgInput} !important;
      --yt-spec-suggested-action: ${colors.bgInput} !important;
      --yt-spec-suggested-action-inverse: ${colors.text} !important;
    }
    ytmusic-player-bar yt-icon-button #button,
    ytmusic-player-bar .yt-spec-button-shape-next button,
    ytmusic-player-bar button.yt-spec-button-shape-next {
      color: ${colors.accent} !important;
      fill: ${colors.accent} !important;
    }
    ytmusic-player-bar yt-icon-button #button yt-icon,
    ytmusic-player-bar yt-icon-button #button iron-icon,
    ytmusic-player-bar .yt-spec-button-shape-next button yt-icon,
    ytmusic-player-bar .yt-spec-button-shape-next button iron-icon {
      fill: ${colors.accent} !important;
      color: ${colors.accent} !important;
    }
    ytmusic-player-bar .yt-spec-button-shape-view-model,
    ytmusic-player-bar yt-button-shape-view-model {
      color: ${colors.accent} !important;
    }
    ytmusic-player-bar .yt-spec-button-shape-view-model yt-icon,
    ytmusic-player-bar .yt-spec-button-shape-view-model iron-icon,
    ytmusic-player-bar yt-button-shape-view-model yt-icon,
    ytmusic-player-bar yt-button-shape-view-model iron-icon {
      fill: ${colors.accent} !important;
      color: ${colors.accent} !important;
    }

    /* === Menus / Popups / Dialogs / Overlays === */
    ${MENU_SELECTORS} { background: ${colors.bgNav} !important; }
    ytmusic-menu-navigation-item-renderer,
    ytmusic-menu-service-item-renderer,
    ytmusic-menu-item-renderer,
    ytmusic-toggle-menu-service-item-renderer,
    ytd-menu-service-item-renderer,
    yt-confirm-dialog-renderer { color: ${colors.text} !important; }

    /* FIX v26: Account / 3-dots dropdown menu — the popup from profile/avatar button.
       Uses tp-yt-iron-dropdown as the positioning wrapper (must stay transparent),
       and ytmusic-multi-page-menu-renderer as the actual content panel.
       Items are ytd-compact-link-renderer with tp-yt-paper-item inside. */
    tp-yt-iron-dropdown {
      background: transparent !important;
    }
    ytmusic-multi-page-menu-renderer {
      background: ${colors.bgNav} !important;
      border: 1px solid ${colors.bgInput} !important;
      border-radius: 8px !important;
    }
    ytmusic-multi-page-menu-renderer .ytmusicMultiPageMenuRendererSpinner {
      border-color: ${colors.bgInput} !important;
    }
    ytd-compact-link-renderer {
      background: transparent !important;
      color: ${colors.text} !important;
    }
    ytd-compact-link-renderer tp-yt-paper-item {
      background: transparent !important;
      color: ${colors.text} !important;
    }
    ytd-compact-link-renderer tp-yt-paper-item yt-formatted-string {
      color: ${colors.text} !important;
    }
    ytd-compact-link-renderer yt-icon,
    ytd-compact-link-renderer .yt-icon-shape {
      fill: ${colors.textMuted} !important;
      color: ${colors.textMuted} !important;
    }
    ytd-compact-link-renderer:hover tp-yt-paper-item,
    ytd-compact-link-renderer tp-yt-paper-item:hover {
      background: ${colors.bgHover} !important;
    }
    ytd-compact-link-renderer a.yt-simple-endpoint {
      color: ${colors.text} !important;
    }
    /* FIX v26: Multi-page menu sections and header */
    ytmusic-multi-page-menu-renderer #header,
    ytmusic-multi-page-menu-renderer #sections,
    ytmusic-multi-page-menu-renderer #container {
      background: transparent !important;
      color: ${colors.text} !important;
    }
    yt-multi-page-menu-section-renderer {
      background: transparent !important;
    }
    /* FIX v26: Account menu avatar / profile section */
    ytd-compact-link-renderer yt-img-shadow {
      border-color: ${colors.bgInput} !important;
    }

    /* FIX v23: Menu popup icons inside items */
    ytmusic-menu-navigation-item-renderer yt-icon,
    ytmusic-menu-navigation-item-renderer iron-icon,
    ytmusic-menu-service-item-renderer yt-icon,
    ytmusic-menu-service-item-renderer iron-icon,
    ytmusic-toggle-menu-service-item-renderer yt-icon,
    ytmusic-toggle-menu-service-item-renderer iron-icon {
      fill: ${colors.textMuted} !important;
      color: ${colors.textMuted} !important;
    }

    /* Menu item hover */
    ytmusic-menu-navigation-item-renderer:hover,
    ytmusic-menu-service-item-renderer:hover,
    ytmusic-menu-item-renderer:hover,
    ytmusic-toggle-menu-service-item-renderer:hover,
    ytd-menu-service-item-renderer:hover {
      background: ${colors.bgHover} !important;
    }

    /* FIX v23: Menu popup container and listbox borders */
    ytmusic-menu-popup-renderer,
    ytmusic-popup-container {
      background: transparent !important;
    }
    tp-yt-paper-listbox.style-scope.ytmusic-menu-popup-renderer {
      background: ${colors.bgNav} !important;
      border: 1px solid ${colors.bgInput} !important;
      border-radius: 8px !important;
    }
    /* FIX v26: General popup container — ensure dropdown positioning wrappers are transparent */
    ytmusic-popup-container tp-yt-iron-dropdown #contentWrapper {
      background: transparent !important;
    }

    /* Dialog / overlay titles */
    .dialog-title,
    .title.yt-confirm-dialog-renderer,
    .title.ytmusic-add-to-playlist-renderer {
      color: ${colors.text} !important;
    }

    /* Toast / snackbar notifications */
    yt-notification-action-renderer,
    .notification-action-renderer,
    tp-yt-paper-toast,
    .yt-notification-action-renderer {
      background: ${colors.bgNav} !important;
      color: ${colors.text} !important;
    }

    /* Tooltip */
    yt-tooltip-renderer,
    tp-yt-paper-tooltip > #tooltip {
      background: ${colors.bgNav} !important;
      color: ${colors.text} !important;
    }

    /* === Progress bar === */
    ${PROGRESS_SELECTORS} { color: ${colors.text} !important; }
    #slider-bar { background: ${colors.bgInput} !important; }

    /* === Queue / Playlist === */
    ${QUEUE_SELECTORS} { background: ${colors.bgNav} !important; }

    /* === Comments === */
    ${COMMENT_SELECTORS} { background: ${colors.bg} !important; }

    /* === Overlay / backdrop === */
    .scrim,
    tp-yt-paper-dialog .backdrop,
    #overlay,
    .overlay,
    ytmusic-app .backdrop {
      background: rgba(0, 0, 0, 0.5) !important;
    }

    /* Song rows / list items hover */
    ytmusic-responsive-list-item-renderer:hover,
    ytmusic-list-item-renderer:hover {
      background: ${colors.bgHover} !important;
    }

    /* Category headers in search results (e.g., "Top result", "Songs", "Artists") */
    .header.ytmusic-item-section-renderer,
    .title.ytmusic-item-section-renderer {
      color: ${colors.text} !important;
    }

    /* Non-music search results (artist cards, album cards, video cards) */
    ytmusic-card-shelf-renderer,
    ytmusic-compact-station-renderer,
    ytmusic-compact-link-renderer,
    ytmusic-compact-playlist-renderer,
    ytmusic-compact-video-renderer,
    ytmusic-compact-artist-renderer,
    ytmusic-compact-album-renderer {
      background: ${colors.bg} !important;
      color: ${colors.text} !important;
    }

    /* Share panel, playlist panels, etc. */
    ytmusic-unified-share-panel,
    ytmusic-add-to-playlist-renderer,
    ytmusic-playlist-add-to-option-renderer {
      background: ${colors.bgNav} !important;
      color: ${colors.text} !important;
    }

    /* Share panel header */
    .header.ytmusic-unified-share-panel,
    .title.ytmusic-add-to-playlist-renderer {
      color: ${colors.text} !important;
    }

    /* Input fields in dialogs */
    tp-yt-paper-input .input-content,
    tp-yt-iron-autogrow-textarea .input-content,
    .input-content.tp-yt-paper-input {
      color: ${colors.text} !important;
    }

    /* Toggle / switch buttons */
    tp-yt-paper-toggle-button[checked] .toggle-button,
    tp-yt-paper-toggle-button[checked] .toggle-bar {
      background-color: ${colors.accent} !important;
    }

    /* Tab header underline */
    tp-yt-paper-tabs .tab-content .selection-bar {
      background: ${colors.accent} !important;
    }

    /* Error / empty states */
    ytmusic-message-renderer .subtitle,
    ytmusic-message-renderer .text {
      color: ${colors.textMuted} !important;
    }

    /* Like/dislike button states */
    ytmusic-like-button-renderer[like-status="LIKE"] .icon,
    ytmusic-like-button-renderer[like-status="DISLIKE"] .icon {
      color: ${colors.accent} !important;
      fill: ${colors.accent} !important;
    }

    /* ================================================
       FIX v20: Borders, separators, lines, dividers
       ================================================ */

    /* All separator / divider elements */
    .separator,
    .divider,
    ytmusic-separator-renderer,
    .top-bar-divider,
    #divider,
    hr,
    [role="separator"] {
      border-color: ${colors.bgInput} !important;
      background: ${colors.bgInput} !important;
    }

    /* Border lines on all major containers */
    ytmusic-nav-bar,
    ytmusic-player-bar,
    ytmusic-guide-renderer,
    ytmusic-search-box,
    ytmusic-search-suggestion-renderer,
    ytmusic-card-shelf-renderer {
      border-color: ${colors.bgInput} !important;
    }

    /* Top border of player bar (the line between content and player) */
    ytmusic-player-bar#player-bar,
    #player-bar {
      border-top: 1px solid ${colors.bgInput} !important;
    }

    /* Sidebar guide entry separators */
    ytmusic-guide-section-renderer:not(:last-child) {
      border-bottom: 1px solid ${colors.bgInput} !important;
    }

    /* Player queue item separators */
    ytmusic-player-queue-item {
      border-bottom: 1px solid ${colors.bgInput} !important;
    }

    /* Section dividers in browse pages */
    ytmusic-shelf-renderer:not(:last-child) {
      border-bottom: 1px solid ${colors.bgInput} !important;
    }

    /* tp-yt-paper elements — borders */
    tp-yt-paper-input-container {
      --paper-input-container-focus-color: ${colors.accent} !important;
      --paper-input-container-color: ${colors.bgInput} !important;
      border-color: ${colors.bgInput} !important;
    }

    /* Paper dialog borders */
    tp-yt-paper-dialog {
      border: 1px solid ${colors.bgInput} !important;
    }

    /* Menu popup border */
    ytmusic-menu-popup-renderer,
    ytd-menu-popup-renderer {
      border: 1px solid ${colors.bgInput} !important;
    }

    /* Chip cloud separator line */
    ytmusic-chip-cloud-renderer {
      border-bottom: 1px solid ${colors.bgInput} !important;
    }

    /* Additional YTM structural borders and lines */
    /* Horizontal rule in player queue */
    #items.ytmusic-player-queue,
    ytmusic-player-queue #items {
      border-top: none !important;
    }

    /* Outline rings on focusable elements */
    *:focus {
      outline-color: ${colors.accent} !important;
    }

    /* YTM shelf renderer bottom divider line */
    ytmusic-shelf-renderer > #content::before,
    .shelf-renderer .divider {
      border-color: ${colors.bgInput} !important;
      background: ${colors.bgInput} !important;
    }

    /* Playlist / album header gradient overlay */
    .background-gradient,
    .detail-page-header-background {
      background: linear-gradient(180deg, ${colors.bgNav} 0%, ${colors.bg} 100%) !important;
    }

    /* Now playing highlight line in queue */
    ytmusic-player-queue-item[selected],
    ytmusic-player-queue-item[playing] {
      border-left: 3px solid ${colors.accent} !important;
    }

    /* Tab selection bar (the colored line under the active tab) */
    tp-yt-paper-tabs .selection-bar {
      background: ${colors.accent} !important;
      border-color: ${colors.accent} !important;
    }

    /* Paper input container border on focus */
    tp-yt-paper-input-container[focused] .focused-line {
      background: ${colors.accent} !important;
    }
    tp-yt-paper-input-container .unfocused-line {
      background: ${colors.bgInput} !important;
    }

    /* === YTM CSS custom properties (deep integration) === */
    :root {
      --ytmusic-background: ${colors.bg} !important;
      --ytmusic-background-secondary: ${colors.bgNav} !important;
      --ytmusic-color-black1: ${colors.bg} !important;
      --ytmusic-color-black2: ${colors.bgNav} !important;
      --ytmusic-color-black3: ${colors.bgInput} !important;
      --ytmusic-color-black4: ${colors.bgHover} !important;
      --ytmusic-color-white1: ${colors.text} !important;
      --ytmusic-color-white2: ${colors.textMuted} !important;
      --ytmusic-color-grey1: ${colors.textMuted} !important;
      --ytmusic-color-grey2: ${colors.bgInput} !important;
      --ytmusic-brand-color: ${colors.accent} !important;
      --ytmusic-brand-background-solid: ${colors.accent} !important;
      --ytmusic-general-border-color: ${colors.bgInput} !important;
      --ytmusic-responsive-sheet-background: ${colors.bgNav} !important;
      --ytmusic-search-background: ${colors.bgNav} !important;
      --ytmusic-search-border: ${colors.bgInput} !important;
      --ytmusic-search-box-text-color: ${colors.text} !important;
      --ytmusic-search-box-hover-background: ${colors.bgHover} !important;
      --ytmusic-search-box-input-background: ${colors.bgInput} !important;
      --ytmusic-overlay-text-secondary: ${colors.text} !important;
      --yt-endpoint-color: ${colors.text} !important;
      --yt-spec-base-background: ${colors.bg} !important;
      --yt-spec-brand-background-solid: ${colors.bgNav} !important;
      --yt-spec-brand-background-primary: ${colors.bgNav} !important;
      --yt-spec-text-primary: ${colors.text} !important;
      --yt-spec-text-secondary: ${colors.textMuted} !important;
      --yt-spec-icon-inactive: ${colors.textMuted} !important;
      --yt-spec-filled-button-text: ${colors.bg} !important;
      --yt-spec-brand-icon-active: ${colors.accent} !important;
      --yt-spec-brand-text: ${colors.accent} !important;
      /* FIX v28: Call-to-action CSS variables — used by Sign-in button and CTA buttons.
         YTM's button-shape-next--call-to-action uses var(--yt-spec-call-to-action)
         for background and var(--yt-spec-call-to-action-inverse) for text color.
         Without these at :root level, the sign-in button and CTA buttons show
         YTM's default red/blue instead of the theme accent color. */
      --yt-spec-call-to-action: ${colors.accent} !important;
      --yt-spec-call-to-action-inverse: ${colors.bg} !important;
      --yt-spec-suggested-action: ${colors.bgInput} !important;
      --yt-spec-suggested-action-inverse: ${colors.text} !important;
      --yt-spec-10-percent-layer: ${colors.bgInput} !important;
      --yt-spec-static-overlay-background: ${colors.bg} !important;
      --yt-spec-general-background-a: ${colors.bg} !important;
      --yt-spec-general-background-b: ${colors.bgNav} !important;
      --yt-spec-general-background-c: ${colors.bgInput} !important;
      --yt-spec-touch-feedback: ${colors.bgHover} !important;
      --yt-spec-touch-feedback-inverse: ${colors.bgInput} !important;
      --paper-input-container-focus-color: ${colors.accent} !important;
      --paper-input-container-color: ${colors.bgInput} !important;
      --paper-input-container-input-color: ${colors.text} !important;
      --paper-input-container-label-color: ${colors.textMuted} !important;
      --paper-input-container-underline-color: ${colors.bgInput} !important;
      --paper-input-container-underline-focus-color: ${colors.accent} !important;
    }

    /* FIX v28: Sign-in button — comprehensive selectors for YTM's button system.
       YTM uses yt-spec-button-shape-next--call-to-action (or --tonal) inside
       yt-button-renderer#sign-in-button. The wrapper must be transparent to avoid
       "2 colors" conflict. The inner button gets the accent (CTA) style.
       CRITICAL: YTM sets --yt-spec-call-to-action at the element level on
       #sign-in-button and ytmusic-sign-in-button-renderer, which overrides the
       :root value. We must override these variables ON the element itself. */
    /* CSS variable overrides on the sign-in button elements — these must be set
       at the element level because YTM sets them there, which takes precedence
       over :root. Without these, the sign-in button shows YTM's default red. */
    #sign-in-button,
    ytmusic-sign-in-button-renderer {
      --yt-spec-call-to-action: ${colors.accent} !important;
      --yt-spec-call-to-action-inverse: ${colors.bg} !important;
      --yt-spec-10-percent-layer: transparent !important;
      --yt-spec-20-percent-layer: transparent !important;
      --yt-spec-touch-feedback: transparent !important;
    }
    /* Make the wrapper elements transparent so only the inner button is themed */
    #sign-in-button,
    #sign-in-button yt-button-shape,
    ytmusic-sign-in-button-renderer,
    ytmusic-sign-in-button-renderer yt-button-shape-renderer,
    ytmusic-guide-signin-promo-renderer yt-button-renderer {
      background: transparent !important;
      border-color: transparent !important;
    }
    /* Inner button — accent/CTA style for Sign In */
    ytmusic-sign-in-button-renderer .yt-spec-button-shape-next--call-to-action,
    ytmusic-sign-in-button-renderer .yt-spec-button-shape-next--filled,
    ytmusic-sign-in-button-renderer .yt-spec-button-shape-next--tonal,
    ytmusic-sign-in-button-renderer yt-button-shape-renderer button,
    ytmusic-sign-in-button-renderer .yt-spec-button-shape-next,
    #sign-in-button button.yt-spec-button-shape-next,
    #sign-in-button .yt-spec-button-shape-next--tonal,
    .sign-in-button button,
    ytmusic-nav-bar .yt-spec-button-shape-next--call-to-action,
    ytmusic-nav-bar .yt-spec-button-shape-next--filled,
    ytmusic-nav-bar yt-button-shape-renderer .yt-spec-button-shape-next--call-to-action {
      background: ${colors.accent} !important;
      color: ${colors.bg} !important;
      border-color: ${colors.accent} !important;
    }
    #sign-in-button .yt-spec-button-shape-next__button-text-content,
    #sign-in-button .yt-spec-button-shape-next--button-text-content,
    #sign-in-button .yt-core-attributed-string,
    #sign-in-button span.yt-core-attributed-string,
    ytmusic-sign-in-button-renderer .yt-spec-button-shape-next__button-text-content,
    ytmusic-sign-in-button-renderer .yt-spec-button-shape-next--button-text-content,
    ytmusic-sign-in-button-renderer .yt-spec-button-shape-next__icon,
    ytmusic-sign-in-button-renderer yt-icon {
      color: ${colors.bg} !important;
      fill: ${colors.bg} !important;
    }
    /* Sign-in button hover state */
    ytmusic-sign-in-button-renderer .yt-spec-button-shape-next:hover,
    #sign-in-button button.yt-spec-button-shape-next:hover,
    ytmusic-nav-bar .yt-spec-button-shape-next--call-to-action:hover,
    ytmusic-nav-bar .yt-spec-button-shape-next--filled:hover {
      opacity: 0.9 !important;
    }
    /* FIX v28: Sign-in button — new button rework (web_button_rework experiment).
       YTM is moving to yt-button-shape-view-model which uses a different structure.
       Override the view-model button wrapper to use theme accent color. */
    #sign-in-button yt-button-shape-view-model,
    ytmusic-sign-in-button-renderer yt-button-shape-view-model,
    ytmusic-nav-bar yt-button-renderer#sign-in-button yt-button-shape-view-model {
      background: ${colors.accent} !important;
      color: ${colors.bg} !important;
      border-color: ${colors.accent} !important;
    }
    #sign-in-button yt-button-shape-view-model yt-icon,
    #sign-in-button yt-button-shape-view-model .yt-core-attributed-string,
    ytmusic-sign-in-button-renderer yt-button-shape-view-model yt-icon,
    ytmusic-sign-in-button-renderer yt-button-shape-view-model .yt-core-attributed-string {
      fill: ${colors.bg} !important;
      color: ${colors.bg} !important;
    }
    /* Sign-in button touch feedback — make transparent so accent button shows through */
    #sign-in-button yt-touch-feedback-shape,
    #sign-in-button .ytSpecTouchFeedbackShapeStroke,
    #sign-in-button .ytSpecTouchFeedbackShapeFill,
    ytmusic-sign-in-button-renderer yt-touch-feedback-shape,
    ytmusic-sign-in-button-renderer .ytSpecTouchFeedbackShapeStroke,
    ytmusic-sign-in-button-renderer .ytSpecTouchFeedbackShapeFill {
      background: transparent !important;
      border-color: transparent !important;
    }
    /* Guide sign-in promo text below the button */
    ytmusic-guide-signin-promo-renderer .sign-in-promo-text,
    ytmusic-guide-signin-promo-renderer yt-formatted-string:not(.yt-core-attributed-string) {
      color: ${colors.textMuted} !important;
    }

    /* FIX v29: Nav bar sign-in link (.sign-in-link) — the <a> tag in the top
       navigation bar when the user is not signed in. YTM renders this as
       <a class="sign-in-link app-bar-button style-scope ytmusic-nav-bar">
       which was not previously targeted by any theme rule. It shows YTM's
       default white/grey color. Apply the accent color to match the theme. */
    .sign-in-link.ytmusic-nav-bar,
    a.sign-in-link.style-scope.ytmusic-nav-bar,
    ytmusic-nav-bar .sign-in-link {
      color: ${colors.accent} !important;
      background: transparent !important;
      border-color: ${colors.accent} !important;
    }
    .sign-in-link.ytmusic-nav-bar:hover,
    a.sign-in-link.style-scope.ytmusic-nav-bar:hover,
    ytmusic-nav-bar .sign-in-link:hover {
      color: ${colors.accent} !important;
      background: ${colors.bgHover} !important;
      border-color: ${colors.accent} !important;
    }

    /* Avatar / profile */
    yt-img-shadow,
    #avatar-btn {
      border-color: ${colors.bgInput} !important;
    }

    /* ================================================
       FIX v21: Additional search / filter chip borders
       ================================================ */
    /* Chip cloud container border */
    ytmusic-chip-cloud-renderer,
    yt-chip-cloud-renderer {
      border-color: ${colors.bgInput} !important;
    }

    /* Chip hover state */
    yt-chip-cloud-chip-renderer:hover {
      background: ${colors.bgHover} !important;
      border-color: ${colors.bgInput} !important;
    }

    /* ================================================
       FIX v21: Additional popup / overlay borders
       ================================================ */
    /* Contextual sheet / bottom sheet border */
    yt-contextual-sheet-renderer {
      border: 1px solid ${colors.bgInput} !important;
    }

    /* Confirm dialog border */
    yt-confirm-dialog-renderer {
      border: 1px solid ${colors.bgInput} !important;
    }

    /* ================================================
       FIX v21: Player bar progress bar theming
       ================================================ */
    /* Song progress bar slider */
    #progress-bar,
    #sliderBar,
    .song-progress,
    paper-slider,
    tp-yt-paper-slider {
      --paper-slider-active-color: ${colors.accent} !important;
      --paper-slider-knob-color: ${colors.accent} !important;
      --paper-slider-knob-start-color: ${colors.accent} !important;
      --paper-slider-knob-start-border-color: ${colors.accent} !important;
      --paper-slider-secondary-color: ${colors.bgInput} !important;
    }

    /* FIX: Knob circle — .slider-knob-inner is the actual visible circle.
       #sliderKnob is just a positioned container (no border-radius) so we
       never set background-color on it. We also override the CSS var on
       tp-yt-paper-slider so paper-slider's own rendering uses the accent. */
    tp-yt-paper-slider#progress-bar,
    tp-yt-paper-slider.style-scope.ytmusic-player-bar {
      --paper-slider-knob-color: ${colors.accent} !important;
      --paper-slider-knob-start-color: ${colors.accent} !important;
      --paper-slider-knob-start-border-color: ${colors.accent} !important;
    }
    .slider-knob-inner,
    .slider-knob-inner.style-scope.tp-yt-paper-slider {
      background-color: ${colors.accent} !important;
      border-radius: 50% !important;
    }

    /* Volume slider */
    #volume-slider,
    .volume-slider,
    ytmusic-volume-slider {
      --paper-slider-active-color: ${colors.accent} !important;
      --paper-slider-knob-color: ${colors.accent} !important;
    }

    /* === YouTube Music Logo === */
    /* Targets the nav-bar logo <img> (the "Music" wordmark SVG).
       Full CSS path:
         ytmusic-nav-bar > #left-content > ytmusic-logo > a > picture > img.logo
       Applies a themed accent drop-shadow glow + smooth hover fade. */
    img.logo.style-scope.ytmusic-logo,
    ytmusic-logo.style-scope.ytmusic-nav-bar a picture img.logo,
    ytmusic-logo.style-scope.ytmusic-nav-bar a.yt-simple-endpoint picture.style-scope img.logo.style-scope {
      filter: drop-shadow(0 0 4px ${colors.accent}) brightness(1.05) !important;
      opacity: 0.88 !important;
      transition: opacity 0.2s ease, filter 0.2s ease !important;
    }
    img.logo.style-scope.ytmusic-logo:hover,
    ytmusic-logo.style-scope.ytmusic-nav-bar a picture img.logo:hover,
    ytmusic-logo.style-scope.ytmusic-nav-bar a.yt-simple-endpoint picture.style-scope img.logo.style-scope:hover {
      filter: drop-shadow(0 0 7px ${colors.accent}) brightness(1.15) !important;
      opacity: 1 !important;
    }
  `;
}

// Built-in theme color definitions — v25 rework
// Kept only the most beautiful, well-designed dark themes:
//   Rosé Pine — elegant dark with warm rose/pine/foam accents
//   Tokyo Night — sleek blues and purples inspired by Tokyo nightscape
//   Nord — clean arctic blues, calm and professional
//   Midnight Emerald — deep dark with vibrant emerald green accent
const BUILTIN_THEMES = {
  'rose-pine': {
    name: 'Rosé Pine',
    colors: {
      bg: '#191724',       // Base
      bgNav: '#1f1d2e',    // Surface
      text: '#e0def4',     // Text
      accent: '#c4a7e7',   // Iris
      textMuted: '#908caa', // Subtle
      bgInput: '#26233a',  // Overlay
      bgHover: '#403d52',  // Highlight Med
      hover: '#524f67',    // Highlight High
      border: '#26233a'    // Overlay
    }
  },
  'tokyo-night': {
    name: 'Tokyo Night',
    colors: {
      bg: '#1a1b26',       // bg
      bgNav: '#16161e',    // bg_dark
      text: '#c0caf5',     // fg
      accent: '#7aa2f7',   // blue
      textMuted: '#565f89', // comment
      bgInput: '#292e42',  // terminal_black / bg_highlight
      bgHover: '#343b53',  // visual
      hover: '#414868',    // visual select
      border: '#292e42'    // bg_highlight
    }
  },
  'nord': {
    name: 'Nord',
    colors: {
      bg: '#2e3440',       // nord0 Polar Night
      bgNav: '#272c36',    // custom darker nord0
      text: '#eceff4',     // nord6 Snow Storm
      accent: '#88c0d0',   // nord8 Frost
      textMuted: '#81a1c1', // nord9 Frost
      bgInput: '#3b4252',  // nord1 Polar Night
      bgHover: '#434c5e',  // nord2 Polar Night
      hover: '#4c566a',    // nord3 Polar Night
      border: '#3b4252'    // nord1
    }
  },
  'midnight-emerald': {
    name: 'Midnight Emerald',
    colors: {
      bg: '#0d0f14',        // near-black with cool undertone
      bgNav: '#090b0f',     // deeper black for nav/player bar
      text: '#d8f3e4',      // soft mint-white (emerald tinted)
      accent: '#6ee7b7',    // emerald green
      textMuted: '#5e9e82', // muted emerald green
      bgInput: '#151820',   // input/surface background
      bgHover: '#1c2030',   // hover state
      hover: '#232840',     // deeper hover
      border: '#1c2030'     // border/separator
    }
  }
};

// Generate CSS for each built-in theme
Object.keys(BUILTIN_THEMES).forEach(id => {
  BUILTIN_THEMES[id].css = buildThemeCSS(BUILTIN_THEMES[id].colors);
});

// CSS key for injected themes (for removal)
let injectedThemeKey = null;

/**
 * Get all available YTM CSS theme names (built-in + custom).
 */
function getAvailableThemes(store) {
  const themes = [
    { id: 'none', name: 'None (Default)' }
  ];

  for (const [id, theme] of Object.entries(BUILTIN_THEMES)) {
    themes.push({ id: `ytm-${id}`, name: theme.name });
  }

  // Add custom themes from store
  try {
    const customThemes = store.get('customThemes');
    if (customThemes && typeof customThemes === 'object') {
      for (const [id, theme] of Object.entries(customThemes)) {
        themes.push({ id: `custom-${id}`, name: theme.name || id });
      }
    }
  } catch {}

  return themes;
}

/**
 * Get CSS for a theme ID.
 * Includes migration for removed themes (dracula, solarized) → new defaults.
 */
function getThemeCSS(themeId, store) {
  // Migration: map removed theme IDs to their closest replacement
  const migrated = migrateThemeId(themeId);
  const effectiveId = migrated !== themeId ? migrated : themeId;

  if (effectiveId && effectiveId.startsWith('ytm-')) {
    const builtinId = effectiveId.replace('ytm-', '');
    return BUILTIN_THEMES[builtinId]?.css || '';
  }

  if (effectiveId && effectiveId.startsWith('custom-')) {
    const customId = effectiveId.replace('custom-', '');
    try {
      const customThemes = store.get('customThemes');
      if (customThemes && customThemes[customId]) {
        return customThemes[customId].css || '';
      }
    } catch {}
  }

  return '';
}

/**
 * Migrate removed/renamed theme IDs to current equivalents.
 * v25 removed: dracula → rose-pine, solarized → tokyo-night
 * v31 removed: catppuccin → rose-pine
 */
function migrateThemeId(themeId) {
  const migrations = {
    'ytm-dracula': 'ytm-rose-pine',
    'ytm-solarized': 'ytm-tokyo-night',
    'ytm-catppuccin': 'ytm-rose-pine',
  };
  return migrations[themeId] || themeId;
}

/**
 * Get the color palette for a theme ID.
 * Used to sync title bar and mini player colors with the YTM theme.
 */
function getThemeColors(themeId, store) {
  const effectiveId = migrateThemeId(themeId);

  if (effectiveId && effectiveId.startsWith('ytm-')) {
    const builtinId = effectiveId.replace('ytm-', '');
    return BUILTIN_THEMES[builtinId]?.colors || null;
  }

  // Custom themes don't have structured colors
  return null;
}

/**
 * Build a JavaScript string that is executed *inside* the renderer to
 * inject theme CSS into any shadow roots found in the DOM.
 *
 * NOTE: YouTube Music uses Shady DOM (Polymer), NOT Shadow DOM.
 * element.shadowRoot is always null. The main theme CSS is injected via
 * insertCSS() which styles all light DOM elements directly.
 * This shadow DOM script is kept as a defensive fallback in case YTM
 * ever adds real Shadow DOM components in the future.
 *
 * NOTE: We build the JS string directly (no Function.toString()) to avoid
 * V8 serialization quirks that can break the injected script.
 *
 * @param {object} colors - Theme color palette
 * @param {string} mode - 'apply' to inject, 'remove' to clean up
 * @returns {string} JavaScript source to run via executeJavaScript
 */
function buildShadowScript(colors, mode) {
  const c = colors || {};
  const text = c.text || '';
  const bg = c.bg || '';
  const bgInput = c.bgInput || '';
  const bgNav = c.bgNav || '';
  const bgHover = c.bgHover || '';
  const accent = c.accent || '';
  const textMuted = c.textMuted || '';
  const styleId = '__ytm_shadow_theme_css';
  const obsKey = SHADOW_STYLE_OBSERVER_ID;

  if (mode === 'remove') {
    return `(() => {
      try {
        function cleanShadowRoots(root) {
          if (!root) return;
          var items = root.querySelectorAll ? root.querySelectorAll('*') : [];
          for (var i = 0; i < items.length; i++) {
            if (items[i].shadowRoot) {
              var s = items[i].shadowRoot.getElementById('${styleId}');
              if (s) s.remove();
              cleanShadowRoots(items[i].shadowRoot);
            }
          }
        }
        cleanShadowRoots(document);
      } catch(e) {}
      if (window['${obsKey}']) {
        try { window['${obsKey}'].disconnect(); } catch(e) {}
        window['${obsKey}'] = null;
      }
    })();`;
  }

  // Build CSS rules for shadow DOM elements
  const shadowCSS = [
    '* { color-scheme: dark !important; }',
    // FIX: slider knob — .slider-knob-inner is the actual circle inside tp-yt-paper-slider
    '.slider-knob-inner, .slider-knob-inner.style-scope.tp-yt-paper-slider',
    '{ background-color: ' + accent + ' !important; border-radius: 50% !important; }',
    // FIX: knob-start vars for the 0:00 state red border on hover
    'tp-yt-paper-slider, #progress-bar, paper-slider',
    '{',
    '  --paper-slider-knob-color: ' + accent + ' !important;',
    '  --paper-slider-knob-start-color: ' + accent + ' !important;',
    '  --paper-slider-knob-start-border-color: ' + accent + ' !important;',
    '  --paper-slider-active-color: ' + accent + ' !important;',
    '}',
    '* { color-scheme: dark !important; }',
    'input, tp-yt-paper-input, .input-content, iron-input, paper-input',
    '{ color: ' + text + ' !important; background: ' + bgInput + ' !important; }',
    'tp-yt-paper-item, tp-yt-paper-item:focus, tp-yt-paper-item.iron-selected',
    '{ background: ' + bgNav + ' !important; color: ' + text + ' !important; border: none !important; }',
    'tp-yt-paper-item:hover',
    '{ background: ' + bgHover + ' !important; }',
    'tp-yt-paper-input-container, tp-yt-paper-input-container .input-content',
    '{ background: ' + bgInput + ' !important; color: ' + text + ' !important; }',
    'tp-yt-paper-input-container .focused-line, tp-yt-paper-input-container[focused] .focused-line',
    '{ background: ' + accent + ' !important; }',
    'tp-yt-paper-input-container .unfocused-line',
    '{ background: ' + bgInput + ' !important; }',
    'tp-yt-paper-input-container #label, tp-yt-paper-input-container .label',
    '{ color: ' + textMuted + ' !important; }',
    'iron-icon, yt-icon, .search-icon',
    '{ fill: ' + textMuted + ' !important; color: ' + textMuted + ' !important; }',
    'tp-yt-paper-listbox, tp-yt-item-group',
    '{ background: ' + bgNav + ' !important; }',
    'tp-yt-paper-autocomplete-suggestions',
    '{ background: ' + bgNav + ' !important; border: none !important; }',
    // FIX v27: Search bar button — transparent in shadow DOM
    '.search-button, .search-button #button, yt-icon-button.search-button',
    '{ background: transparent !important; border-color: transparent !important; }',
    // FIX v27: ytmusic-chip-cloud-chip-renderer — Save button in shadow DOM
    '.gradient-box, ytmusic-chip-cloud-chip-renderer .gradient-box',
    '{ background: transparent !important; background-image: none !important; background-color: transparent !important; }',
    'ytmusic-chip-cloud-chip-renderer',
    '{ background: transparent !important; color: ' + text + ' !important; }',
    // Set CSS custom properties on shadow hosts so YTM's internal
    // var() references pick up themed values (they inherit through
    // shadow boundaries automatically).
    'ytmusic-search-box, ytmusic-search-suggestion, tp-yt-paper-autocomplete, ytmusic-chip-cloud-chip-renderer',
    '{',
    '  --ytmusic-search-box-text-color: ' + text + ' !important;',
    '  --ytmusic-search-box-background: ' + bgNav + ' !important;',
    '  --ytmusic-search-box-input-background: ' + bgInput + ' !important;',
    '  --ytmusic-search-box-hover-background: ' + bgHover + ' !important;',
    '  --paper-input-container-focus-color: ' + accent + ' !important;',
    '  --paper-input-container-color: ' + bgInput + ' !important;',
    '  --paper-input-container-input-color: ' + text + ' !important;',
    '  --paper-input-container-label-color: ' + textMuted + ' !important;',
    '  --paper-input-container-underline-color: ' + bgInput + ' !important;',
    '  --paper-input-container-underline-focus-color: ' + accent + ' !important;',
    '  --yt-spec-text-primary: ' + text + ' !important;',
    '  --yt-spec-text-secondary: ' + textMuted + ' !important;',
    '  --yt-spec-brand-background-solid: ' + bgNav + ' !important;',
    '  --yt-spec-general-background-a: ' + bgInput + ' !important;',
    '  --yt-spec-general-background-b: ' + bgNav + ' !important;',
    '  --yt-spec-10-percent-layer: transparent !important;',
    '  --yt-spec-touch-feedback: ' + bgHover + ' !important;',
    '  --ytmusic-chip-background: transparent !important;',
    '  --ytmusic-chip-background-hover: ' + bgHover + ' !important;',
    '  --ytmusic-chip-active-background: ' + bgHover + ' !important;',
    '  --yt-spec-call-to-action: ' + accent + ' !important;',
    '  --yt-spec-call-to-action-inverse: ' + bg + ' !important;',
    '  --yt-spec-icon-inactive: ' + text + ' !important;',
    '}',
    // FIX v28: Player bar shadow DOM CSS variable overrides
    'ytmusic-player-bar',
    '{',
    '  --yt-spec-text-primary: ' + text + ' !important;',
    '  --yt-spec-text-secondary: ' + textMuted + ' !important;',
    '  --yt-spec-icon-inactive: ' + text + ' !important;',
    '  --yt-spec-call-to-action: ' + accent + ' !important;',
    '  --yt-spec-call-to-action-inverse: ' + bg + ' !important;',
    '  --yt-spec-10-percent-layer: transparent !important;',
    '  --yt-spec-20-percent-layer: transparent !important;',
    '  --ytmusic-player-bar-text: ' + text + ' !important;',
    '  --ytmusic-player-bar-icon: ' + text + ' !important;',
    '}',
    // FIX v28: Sign-in button shadow DOM CSS variable overrides
    '#sign-in-button, ytmusic-sign-in-button-renderer',
    '{',
    '  --yt-spec-call-to-action: ' + accent + ' !important;',
    '  --yt-spec-call-to-action-inverse: ' + bg + ' !important;',
    '  --yt-spec-10-percent-layer: transparent !important;',
    '  --yt-spec-20-percent-layer: transparent !important;',
    '}',
    // FIX v29: Player bar icon shape hosts in shadow DOM — NUCLEAR approach.
    // The div has inline style="fill: currentcolor" which overrides less-specific CSS.
    // We need maximum-specificity selectors including Polymer scoping classes
    // AND direct overrides on the inner div and SVG path elements.
    'ytmusic-player-bar yt-icon-button button#button.style-scope.yt-icon-button',
    '{ color: ' + text + ' !important; }',
    'ytmusic-player-bar .volume > button, ytmusic-player-bar .previous-button > button, ytmusic-player-bar .play-pause-button > button, ytmusic-player-bar .next-button > button, ytmusic-player-bar .repeat > button, ytmusic-player-bar .shuffle > button, ytmusic-player-bar .captions > button, ytmusic-player-bar .expand-button > button',
    '{ color: ' + text + ' !important; }',
    'ytmusic-player-bar .yt-icon-shape.style-scope.yt-icon.ytSpecIconShapeHost, ytmusic-player-bar span.yt-icon-shape.ytSpecIconShapeHost',
    '{ color: ' + text + ' !important; }',
    'ytmusic-player-bar .yt-icon-shape div[style*="fill"], ytmusic-player-bar .ytSpecIconShapeHost div[style*="fill"], ytmusic-player-bar .yt-icon-shape.style-scope.yt-icon div, ytmusic-player-bar .ytSpecIconShapeHost.style-scope.yt-icon div',
    '{ fill: ' + text + ' !important; color: ' + text + ' !important; }',
    'ytmusic-player-bar .yt-icon-shape svg, ytmusic-player-bar .ytSpecIconShapeHost svg, ytmusic-player-bar .yt-icon-shape svg path, ytmusic-player-bar .ytSpecIconShapeHost svg path',
    '{ fill: currentcolor !important; color: ' + text + ' !important; }',
    // FIX v32: yt-core-attributed-string — YTM's new text component used for
    // song titles, album titles, and most text content. Must be themed in
    // shadow DOM contexts too. Also add explicit title/subtitle rules for
    // player bar, detail header, list items, and queue.
    'yt-core-attributed-string',
    '{ color: ' + text + ' !important; }',
    '.title yt-core-attributed-string, yt-core-attributed-string.title',
    '{ color: ' + text + ' !important; }',
    '.subtitle yt-core-attributed-string, yt-core-attributed-string.subtitle',
    '{ color: ' + textMuted + ' !important; }',
    '.byline yt-core-attributed-string, yt-core-attributed-string.byline',
    '{ color: ' + textMuted + ' !important; }',
    'ytmusic-player-bar .title, ytmusic-player-bar .song-title, ytmusic-player-bar .track-title',
    '{ color: ' + text + ' !important; }',
    'ytmusic-player-bar .subtitle, ytmusic-player-bar .byline, ytmusic-player-bar .second-subtitle, ytmusic-player-bar .content-info',
    '{ color: ' + textMuted + ' !important; }',
    'ytmusic-player-bar yt-core-attributed-string',
    '{ color: ' + text + ' !important; }',
    'ytmusic-player-bar .subtitle yt-core-attributed-string, ytmusic-player-bar .byline yt-core-attributed-string',
    '{ color: ' + textMuted + ' !important; }',
    'ytmusic-detail-header-renderer, ytmusic-data-bound-header-renderer',
    '{ --yt-spec-text-primary: ' + text + ' !important; --yt-spec-text-secondary: ' + textMuted + ' !important; }',
    'ytmusic-detail-header-renderer .title, ytmusic-detail-header-renderer yt-core-attributed-string',
    '{ color: ' + text + ' !important; }',
    'ytmusic-detail-header-renderer .subtitle, ytmusic-detail-header-renderer .description',
    '{ color: ' + textMuted + ' !important; }',
    'ytmusic-responsive-list-item-renderer, ytmusic-list-item-renderer',
    '{ --yt-spec-text-primary: ' + text + ' !important; --yt-spec-text-secondary: ' + textMuted + ' !important; }',
    'ytmusic-responsive-list-item-renderer .title, ytmusic-responsive-list-item-renderer yt-core-attributed-string',
    '{ color: ' + text + ' !important; }',
    'ytmusic-responsive-list-item-renderer .subtitle, ytmusic-responsive-list-item-renderer .byline',
    '{ color: ' + textMuted + ' !important; }',
    'ytmusic-player-queue, #side-view',
    '{ --yt-spec-text-primary: ' + text + ' !important; --yt-spec-text-secondary: ' + textMuted + ' !important; }',
    'ytmusic-player-queue .title, ytmusic-player-queue yt-core-attributed-string, #side-view .title, #side-view yt-core-attributed-string',
    '{ color: ' + text + ' !important; }',
    'ytmusic-player-queue .subtitle, ytmusic-player-queue .byline, #side-view .subtitle, #side-view .byline',
    '{ color: ' + textMuted + ' !important; }',
    // FIX v29: Sign-in link (.sign-in-link) in nav bar shadow DOM
    '.sign-in-link, a.sign-in-link',
    '{ color: ' + accent + ' !important; background: transparent !important; border-color: ' + accent + ' !important; }',
    '.sign-in-link:hover, a.sign-in-link:hover',
    '{ color: ' + accent + ' !important; background: ' + bgHover + ' !important; }',
  ].join(' ');

  return `(() => {
    var STYLE_ID = '${styleId}';
    var OBS_KEY = '${obsKey}';
    var CSS = ${JSON.stringify(shadowCSS)};

    function inject(shadowRoot) {
      if (!shadowRoot) return;
      var el = shadowRoot.getElementById(STYLE_ID);
      if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        shadowRoot.appendChild(el);
      }
      el.textContent = CSS;
    }

    function walk(node) {
      if (node.shadowRoot) {
        inject(node.shadowRoot);
        var children = node.shadowRoot.querySelectorAll('*');
        for (var i = 0; i < children.length; i++) walk(children[i]);
      }
    }

    function injectAll() {
      if (!document || !document.body) return;
      var all = document.body.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) walk(all[i]);
    }

    // Run immediately
    injectAll();

    // Disconnect previous observer (so we don't leak on theme switch)
    if (window[OBS_KEY] && typeof window[OBS_KEY].disconnect === 'function') {
      window[OBS_KEY].disconnect();
    }

    var timer = null;
    var observer = new MutationObserver(function() {
      clearTimeout(timer);
      timer = setTimeout(injectAll, 150);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window[OBS_KEY] = observer;
  })();`;
}

/**
 * Apply a YTM page theme by injecting CSS into the music WebContentsView.
 *
 * Theme CSS is injected via insertCSS() which styles all light DOM elements
 * (YouTube Music uses Shady DOM, not Shadow DOM, so insertCSS covers everything).
 * A shadow DOM injection script is also run as a defensive fallback.
 */
/**
 * FIX v30: Build a JavaScript string that directly force-sets inline styles
 * on all player bar button/icon elements using element.style.setProperty
 * with 'important' priority.
 *
 * WHY THIS IS NEEDED:
 * YTM's Polymer runtime sets `color` (and sometimes `fill`) as inline styles
 * on button#button, yt-icon, and .yt-icon-shape elements — repeatedly, via
 * property accessors and Polymer's own MutationObserver-driven updates.
 * CSS `!important` rules beat plain inline styles, but Polymer may call
 * setProperty('color', value, 'important') internally, which CSS cannot beat.
 *
 * The only reliable counter is to fight JavaScript with JavaScript:
 * use our own MutationObserver that fires AFTER Polymer's mutations settle
 * (debounced 80 ms), then calls setProperty('color', themeColor, 'important')
 * on every relevant element inside the player bar. This always wins because
 * we run last and use 'important' priority.
 *
 * ACTIVE/PRESSED STATE:
 * Buttons with aria-pressed="true" (repeat, shuffle, like) get the accent
 * color instead of the text color, mirroring the existing CSS rules.
 *
 * @param {object|null} colors - Theme color palette
 * @param {string}      mode   - 'apply' | 'remove'
 */
function buildPlayerBarFixScript(colors, mode) {
  const OBS_KEY = '__ytMusicPlayerBarBtnFix__';

  if (mode === 'remove') {
    return `(() => {
      if (window['${OBS_KEY}']) {
        try { window['${OBS_KEY}'].disconnect(); } catch(e) {}
        window['${OBS_KEY}'] = null;
      }
    })();`;
  }

  const text      = colors.text;
  const textMuted = colors.textMuted;
  const accent    = colors.accent;

  return `(() => {
    var TEXT      = ${JSON.stringify(text)};
    var TEXT_MUTED = ${JSON.stringify(textMuted)};
    var ACCENT    = ${JSON.stringify(accent)};
    var OBS_KEY = '${OBS_KEY}';

    // Selectors for every button/icon element whose inline color/fill we must override.
    // Covers the full Polymer chain:
    //   yt-icon-button > button#button > yt-icon
    //     > span.yt-icon-shape.ytSpecIconShapeHost
    //       > div[style="fill: currentcolor"] > svg > path
    var TARGETS = [
      'yt-icon-button',
      'yt-icon-button button',
      'yt-icon-button button#button',
      'yt-icon',
      'iron-icon',
      '.yt-icon-shape',
      'span.ytSpecIconShapeHost',
      '.yt-spec-button-shape-next',
      '.yt-spec-button-shape-next button',
      '.yt-spec-button-shape-view-model',
      'yt-button-shape-view-model',
    ].join(',');

    // FIX v32: Title/subtitle text selectors — YTM uses yt-core-attributed-string
    // and yt-formatted-string for song titles, album names, and artist names in
    // the player bar. Polymer may set inline color styles on these that beat CSS.
    var TITLE_TARGETS = [
      '.title',
      '.song-title',
      '.track-title',
      '.content-info',
      'yt-core-attributed-string',
      'yt-formatted-string.title',
    ].join(',');

    var SUBTITLE_TARGETS = [
      '.subtitle',
      '.byline',
      '.second-subtitle',
      'yt-formatted-string.byline',
      'yt-formatted-string.subtitle',
    ].join(',');

    function colorFor(el) {
      // All player bar buttons use accent — text colors are near-white like the
      // default, so only accent makes the theming actually visible.
      return ACCENT;
    }

    function fixElement(el) {
      var c = colorFor(el);
      el.style.setProperty('color', c, 'important');
      el.style.setProperty('fill',  c, 'important');
    }

    // FIX v32: Force title text color on song/album title elements.
    function fixTitleElement(el) {
      el.style.setProperty('color', TEXT, 'important');
    }

    // FIX v32: Force muted text color on subtitle/artist elements.
    function fixSubtitleElement(el) {
      el.style.setProperty('color', TEXT_MUTED, 'important');
    }

    function fixInlineFillDivs(bar) {
      // The innermost div has style="fill: currentcolor" as an inline attr.
      // We need to set 'fill' on it directly so the SVG path resolves correctly.
      var divs = bar.querySelectorAll('div[style]');
      for (var i = 0; i < divs.length; i++) {
        var d = divs[i];
        if (d.closest && d.closest('.yt-icon-shape, span.ytSpecIconShapeHost')) {
          var c = colorFor(d);
          d.style.setProperty('fill',  c, 'important');
          d.style.setProperty('color', c, 'important');
        }
      }
    }

    function fixPlayerBar() {
      var bar = document.querySelector('ytmusic-player-bar');
      if (!bar) return;
      // Fix button/icon colors
      var els = bar.querySelectorAll(TARGETS);
      for (var i = 0; i < els.length; i++) fixElement(els[i]);
      fixInlineFillDivs(bar);
      // FIX v32: Fix title/subtitle text colors
      var titleEls = bar.querySelectorAll(TITLE_TARGETS);
      for (var i = 0; i < titleEls.length; i++) fixTitleElement(titleEls[i]);
      var subEls = bar.querySelectorAll(SUBTITLE_TARGETS);
      for (var i = 0; i < subEls.length; i++) fixSubtitleElement(subEls[i]);
    }

    // FIX v32: Also fix detail header, list items, and queue titles globally
    // since Polymer can override their CSS on SPA navigation.
    function fixGlobalTitles() {
      // Detail header (album/playlist/artist page)
      var detailHeaders = document.querySelectorAll('ytmusic-detail-header-renderer, ytmusic-data-bound-header-renderer');
      for (var h = 0; h < detailHeaders.length; h++) {
        var tEls = detailHeaders[h].querySelectorAll('.title, yt-core-attributed-string, yt-formatted-string.title');
        for (var i = 0; i < tEls.length; i++) fixTitleElement(tEls[i]);
        var sEls = detailHeaders[h].querySelectorAll('.subtitle, .byline, .second-subtitle, .description, yt-formatted-string.byline, yt-formatted-string.subtitle');
        for (var i = 0; i < sEls.length; i++) fixSubtitleElement(sEls[i]);
      }
      // List items (song rows in album/playlist views)
      var listItems = document.querySelectorAll('ytmusic-responsive-list-item-renderer, ytmusic-list-item-renderer');
      for (var l = 0; l < listItems.length; l++) {
        var tEls = listItems[l].querySelectorAll('.title, .title-column, yt-core-attributed-string');
        for (var i = 0; i < tEls.length; i++) fixTitleElement(tEls[i]);
        var sEls = listItems[l].querySelectorAll('.subtitle, .byline, .second-byline');
        for (var i = 0; i < sEls.length; i++) fixSubtitleElement(sEls[i]);
      }
      // Player queue / side panel
      var queues = document.querySelectorAll('ytmusic-player-queue, #side-view');
      for (var q = 0; q < queues.length; q++) {
        var tEls = queues[q].querySelectorAll('.title, yt-core-attributed-string');
        for (var i = 0; i < tEls.length; i++) fixTitleElement(tEls[i]);
        var sEls = queues[q].querySelectorAll('.subtitle, .byline');
        for (var i = 0; i < sEls.length; i++) fixSubtitleElement(sEls[i]);
      }
      // Shelf / section titles
      var shelves = document.querySelectorAll('ytmusic-shelf-renderer, ytmusic-item-section-renderer, ytmusic-card-shelf-renderer');
      for (var s = 0; s < shelves.length; s++) {
        var tEls = shelves[s].querySelectorAll('.title, .header, yt-core-attributed-string');
        for (var i = 0; i < tEls.length; i++) fixTitleElement(tEls[i]);
      }
    }

    // Run immediately for already-rendered content.
    fixPlayerBar();
    fixGlobalTitles();

    // Disconnect any previously installed observer to avoid leaks on
    // theme switch or SPA navigation.
    if (window[OBS_KEY] && typeof window[OBS_KEY].disconnect === 'function') {
      window[OBS_KEY].disconnect();
    }

    // Debounce: fire 80 ms after mutations settle so we run after Polymer's
    // own microtask queue has flushed and re-applied its inline styles.
    var timer = null;
    var obs = new MutationObserver(function() {
      clearTimeout(timer);
      timer = setTimeout(function() {
        fixPlayerBar();
        fixGlobalTitles();
      }, 80);
    });

    var bar = document.querySelector('ytmusic-player-bar') || document.body;
    obs.observe(bar, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['style', 'aria-pressed']
    });

    // FIX v32: Also observe the main content area for title changes
    // (SPA navigation, album page loads, etc.)
    var mainContent = document.querySelector('ytmusic-app-layout') || document.body;
    if (mainContent !== bar) {
      var titleObs = new MutationObserver(function() {
        clearTimeout(timer);
        timer = setTimeout(function() {
          fixGlobalTitles();
        }, 150);
      });
      titleObs.observe(mainContent, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['style']
      });
    }

    // If attached to body (bar not yet in DOM), re-attach to bar once rendered.
    if (bar === document.body) {
      var bodyObs = new MutationObserver(function() {
        var b = document.querySelector('ytmusic-player-bar');
        if (b) {
          bodyObs.disconnect();
          obs.disconnect();
          obs.observe(b, {
            childList: true, subtree: true,
            attributes: true, attributeFilter: ['style', 'aria-pressed']
          });
          fixPlayerBar();
          fixGlobalTitles();
        }
      });
      bodyObs.observe(document.body, { childList: true, subtree: false });
    }

    window[OBS_KEY] = obs;
  })();`;
}

/**
 * Apply a YTM page theme by injecting CSS into the music WebContentsView.
 *
 * Theme CSS is injected via insertCSS() which styles all light DOM elements
 * (YouTube Music uses Shady DOM, not Shadow DOM, so insertCSS covers everything).
 * A shadow DOM injection script is also run as a defensive fallback.
 * FIX v30: A JS-based player bar button fixer is also injected to override
 * Polymer's inline style updates that CSS cannot reliably beat.
 */
function applyYtmTheme(wc, themeId, store) {
  if (!wc || wc.isDestroyed()) return;

  // Remove previously injected theme CSS
  if (injectedThemeKey) {
    wc.removeInsertedCSS(injectedThemeKey).catch(() => {});
    injectedThemeKey = null;
  }

  // If 'none', just remove the old theme — don't inject new CSS
  if (!themeId || themeId === 'none') {
    log.info('[themes] YTM theme removed');
    try {
      const removeScript = buildShadowScript(null, 'remove');
      wc.executeJavaScript(removeScript).catch(() => {});
      const removeFix = buildPlayerBarFixScript(null, 'remove');
      wc.executeJavaScript(removeFix).catch(() => {});
    } catch {}
    return;
  }

  // Get structured colors for shadow DOM script + player bar fix
  let colors = null;
  const effectiveId = migrateThemeId(themeId);
  if (effectiveId && effectiveId.startsWith('ytm-')) {
    const builtinId = effectiveId.replace('ytm-', '');
    colors = BUILTIN_THEMES[builtinId]?.colors || null;
  }

  const css = getThemeCSS(themeId, store);
  if (!css) return;

  wc.insertCSS(css)
    .then((key) => {
      injectedThemeKey = key;
      log.info('[themes] YTM theme applied:', themeId);

      if (colors) {
        // Shadow DOM styles (defensive fallback for real Shadow DOM components)
        const shadowScript = buildShadowScript(colors, 'apply');
        wc.executeJavaScript(shadowScript)
          .then(() => log.info('[themes] Shadow DOM styles injected'))
          .catch(err => log.warn('[themes] Shadow DOM injection failed:', err.message));

        // FIX v30: JS-based player bar button fixer — beats Polymer inline styles
        const fixScript = buildPlayerBarFixScript(colors, 'apply');
        wc.executeJavaScript(fixScript)
          .then(() => log.info('[themes] Player bar button fix injected'))
          .catch(err => log.warn('[themes] Player bar fix failed:', err.message));
      }
    })
    .catch(err => log.error('[themes] Failed to apply theme:', err.message));
}

/**
 * Re-inject shadow DOM styles only (without re-inserting light DOM CSS).
 * Called on did-navigate-in-page (SPA pushState) where the JS context
 * is preserved. This is a defensive measure — YTM uses Shady DOM so
 * insertCSS() persists and covers all elements.
 * FIX v30: Also re-injects the player bar button fixer script.
 */
function reInjectShadowStyles(wc, store) {
  if (!wc || wc.isDestroyed()) return;
  try {
    const settings = store.get('settings');
    if (!settings || !settings.ytmTheme || settings.ytmTheme === 'none') return;
    const themeId = settings.ytmTheme;
    let colors = null;
    if (themeId.startsWith('ytm-')) {
      const builtinId = themeId.replace('ytm-', '');
      colors = BUILTIN_THEMES[builtinId]?.colors || null;
    }
    if (colors) {
      const shadowScript = buildShadowScript(colors, 'apply');
      wc.executeJavaScript(shadowScript)
        .then(() => log.info('[themes] Shadow DOM styles re-injected (SPA nav)'))
        .catch(err => log.warn('[themes] Shadow DOM re-injection failed:', err.message));

      // FIX v30: Re-inject player bar fix — MutationObserver must be re-attached
      // to the freshly rendered player bar after SPA navigation.
      const fixScript = buildPlayerBarFixScript(colors, 'apply');
      wc.executeJavaScript(fixScript)
        .then(() => log.info('[themes] Player bar fix re-injected (SPA nav)'))
        .catch(err => log.warn('[themes] Player bar fix re-injection failed:', err.message));
    }
  } catch {}
}

/**
 * Save a custom theme to the store.
 */
function saveCustomTheme(store, themeId, name, css) {
  try {
    const customThemes = store.get('customThemes') || {};
    customThemes[themeId] = { name, css };
    store.set('customThemes', customThemes);
    log.info('[themes] Custom theme saved:', name);
    return true;
  } catch (err) {
    log.error('[themes] Failed to save custom theme:', err.message);
    return false;
  }
}

/**
 * Delete a custom theme from the store.
 */
function deleteCustomTheme(store, themeId) {
  try {
    const customThemes = store.get('customThemes') || {};
    delete customThemes[themeId];
    store.set('customThemes', customThemes);
    log.info('[themes] Custom theme deleted:', themeId);
    return true;
  } catch (err) {
    log.error('[themes] Failed to delete custom theme:', err.message);
    return false;
  }
}

/**
 * Import a custom theme from a CSS file.
 */
function importThemeFromFile(store, filePath) {
  try {
    const css = fs.readFileSync(filePath, 'utf8');
    const basename = path.basename(filePath, path.extname(filePath));
    const themeId = basename.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return saveCustomTheme(store, themeId, basename, css);
  } catch (err) {
    log.error('[themes] Failed to import theme file:', err.message);
    return false;
  }
}

module.exports = {
  getAvailableThemes,
  getThemeCSS,
  getThemeColors,
  applyYtmTheme,
  reInjectShadowStyles,
  saveCustomTheme,
  deleteCustomTheme,
  importThemeFromFile,
  BUILTIN_THEMES
};
