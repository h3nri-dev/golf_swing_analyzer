// Basic consent mode: no Google tag or analytics requests before an opt-in.
// Keep the property's original ID and recognize existing visitors' choices.
const MEASUREMENT_ID = 'G-MG3PW4FRFM';
const STORAGE_KEY = 'golf_cookie_consent';
const DISABLE_KEY = `ga-disable-${MEASUREMENT_ID}`;
const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
let choice = readChoice();
let configured = false;
let tagLoaded = false;
let tagLoading = false;
let noticeTimer;

window[DISABLE_KEY] = true;
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
gtag('consent', 'default', denied);

function parseChoice(value) {
  try {
    const saved = JSON.parse(value);
    return typeof saved?.analytics === 'boolean' ? saved.analytics : null;
  } catch { return null; }
}

function readChoice() {
  try { return parseChoice(localStorage.getItem(STORAGE_KEY)); }
  catch { return null; }
}

function clearAnalyticsCookies() {
  // Expire both host-only cookies and GA cookies set on a parent domain.
  const parts = location.hostname.split('.');
  const domains = ['', ...parts.map((_, index) => `; domain=${parts.slice(index).join('.')}`)];
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.trim().split('=')[0];
    if (name !== '_ga' && !name.startsWith('_ga_')) continue;
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax`;
  }
}

function configureAnalytics() {
  // An opt-out may arrive while the external script is still downloading.
  if (choice !== true || !tagLoaded || configured) return;
  configured = true;
  let referrer = '';
  try { referrer = new URL(document.referrer).origin; } catch { /* No referrer. */ }
  const page = { page_location: location.origin + location.pathname, page_title: document.title, page_referrer: referrer };
  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, {
    ...page,
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  gtag('event', 'page_view', { ...page, send_to: MEASUREMENT_ID });
}

function loadAnalytics() {
  if (tagLoaded) { configureAnalytics(); return; }
  if (tagLoading) return;
  tagLoading = true;
  const script = document.createElement('script');
  script.id = 'googleAnalyticsTag';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  script.onload = () => { tagLoading = false; tagLoaded = true; configureAnalytics(); };
  script.onerror = () => { tagLoading = false; script.remove(); };
  document.head.append(script);
}

function applyChoice() {
  const allowed = choice === true;
  window[DISABLE_KEY] = !allowed;
  gtag('consent', 'update', { ...denied, analytics_storage: allowed ? 'granted' : 'denied' });
  if (allowed) loadAnalytics();
  else clearAnalyticsCookies();
  document.querySelectorAll('[data-consent-banner]').forEach(host => { host.hidden = choice !== null; });
  document.getElementById('cookieCurrentChoice').textContent = `Google Analytics is ${allowed ? 'on' : 'off'}.`;
}

function saveChoice(allowed) {
  choice = allowed;
  let saved = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ essential: true, analytics: allowed, marketing: false, timestamp: new Date().toISOString() }));
  } catch { saved = false; }
  applyChoice();
  closeSettings();
  const notice = document.getElementById('consentNotice');
  notice.textContent = `Google Analytics ${allowed ? 'allowed' : 'off'}.${saved ? ' Preference saved.' : ' Browser storage is unavailable; this choice applies to this page only.'}`;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 4500);
}

const banner = `<section class="cookie-banner" aria-label="Optional analytics"><p><strong>Optional analytics.</strong> Allow Google Analytics to help improve the site? Your videos stay on your device.</p><div class="cookie-actions"><button data-analytics-choice="true">Allow analytics</button><button data-analytics-choice="false">No thanks</button><a href="privacy.html" target="_blank" rel="noopener">Privacy Policy ↗</a></div></section>`;
document.querySelectorAll('[data-consent-banner]').forEach(host => { host.innerHTML = banner; });
document.body.insertAdjacentHTML('beforeend', `
  <dialog id="cookieDialog" aria-labelledby="cookieTitle" aria-describedby="cookieCurrentChoice">
    <div class="cookie-heading"><h2 id="cookieTitle">Cookie settings</h2><button class="cookie-close" id="closeCookieSettings" autofocus>Close</button></div>
    <p class="cookie-status" id="cookieCurrentChoice" role="status"></p>
    <div class="cookie-description"><p><strong>Essential preferences</strong><br>We remember this choice in your browser’s local storage. The video tools work with analytics off.</p><p><strong>Optional Google Analytics</strong><br>Helps us understand site visits and usage, using cookies and device information. It loads only when you allow it. We do not add your videos, drawings or swing measurements to analytics events. Advertising features stay off.</p></div>
    <p>Cloudflare also measures site visits and performance through our hosting. It does not use analytics cookies and is separate from this Google Analytics preference. <a href="privacy.html" target="_blank" rel="noopener">Read the Privacy Policy ↗</a></p>
    <div class="cookie-actions"><button data-analytics-choice="true">Allow analytics</button><button data-analytics-choice="false">Turn analytics off</button></div>
    <p>Changes apply immediately without reloading your videos. Turning analytics off also removes this site’s accessible Google Analytics cookies.</p>
  </dialog><div id="consentNotice" class="consent-notice" role="status" hidden></div>`);

const dialog = document.getElementById('cookieDialog');
let returnFocus;
function closeSettings() { if (dialog.open) dialog.close(); }
document.getElementById('closeCookieSettings').addEventListener('click', closeSettings);
dialog.addEventListener('close', () => returnFocus?.focus({ preventScroll: true }));
document.addEventListener('click', event => {
  const choiceButton = event.target.closest('[data-analytics-choice]');
  if (choiceButton) { saveChoice(choiceButton.dataset.analyticsChoice === 'true'); return; }
  const settings = event.target.closest('[data-cookie-settings]');
  if (!settings) return;
  const parentDialog = settings.closest('dialog');
  returnFocus = parentDialog?.id === 'helpDialog' ? document.getElementById('workspaceHelp') : parentDialog?.id === 'privacyDialog' ? document.getElementById('privacy') : settings;
  parentDialog?.close();
  if (!dialog.open) dialog.showModal();
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  choice = event.key === null ? null : parseChoice(event.newValue);
  applyChoice();
});
applyChoice();
