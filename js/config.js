/*
 * DIGITAL RAVAN BOX — runtime configuration
 * ------------------------------------------------------------
 * API_URL     Leave EMPTY for LOCAL MODE: everything runs in this browser (localStorage),
 *             perfect for testing the full ceremony without any server.
 *             For production, paste your Google Apps Script Web App URL
 *             (ends in /exec). See README → "Google Sheets / Apps Script Setup".
 * LOCAL_ADMIN_PASSWORD  Admin password used ONLY in local mode. In production the
 *             password lives in Apps Script → Script properties → ADMIN_PASSWORD.
 * PUBLIC_URL  The URL employees open (used for the QR code + poster).
 *             Leave empty to auto-detect from where the site is hosted.
 * EVENT_ID    Groups submissions for this celebration.
 */
window.RAVAN_CONFIG = {
  API_URL: '',
  LOCAL_ADMIN_PASSWORD: 'ravan2026',
  PUBLIC_URL: '',
  EVENT_ID: 'dussehra-2026',
  EVENT_DATE_LABEL: '16 OCTOBER 2026',
  MESSAGE_MAX: 150
};
