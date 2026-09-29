HANDS OF GOLD - PWA (Add to Home Screen)
========================================

WHAT WAS ADDED (all new files - nothing existing was rewritten)
  manifest.json            app name, icons, colors, shortcuts
  service-worker.js        offline caching
  pwa.js                   registers the worker + shows the install banner
  offline.html             what customers see with no signal
  icon-192.png             home screen icon
  icon-512.png             splash / store icon
  icon-maskable-512.png    Android adaptive icon
  apple-touch-icon.png     iPhone home screen icon (180x180)

  12 .html files got a small block before </head>. Look for
  "<!-- PWA: installable app -->". Delete that block to undo.

  Untouched: script.js, style.css, all media, all layout.
  Originals of script.js / style.css / index.html: _backup/pre-pwa/


THE ONE RULE THAT MATTERS ON EVERY DEPLOY
-----------------------------------------
Open service-worker.js. Line 8:

    var CACHE_VERSION = 'hog-v1';

Bump it EVERY time you deploy: hog-v2, hog-v3, hog-v4...

If you forget, phones that already installed the app can keep showing
older images. HTML, CSS and JS are always fetched from the network first,
so text and layout changes still come through - but bump it anyway. It
costs two seconds and removes the whole class of problem.


HOW IT LOOKS TO A CUSTOMER
--------------------------
Android/Chrome  after scrolling a bit, a gold "Install" bar appears.
                One tap and the icon is on their home screen.
iPhone/Safari   Apple shows no automatic prompt, so the bar tells them:
                tap Share, then "Add to Home Screen".
                (Only shows in Safari. Chrome on iPhone cannot install.)
Either way       the banner appears once. Dismissing it hides it for good
                 on that phone.


TESTING AFTER YOU DEPLOY
------------------------
1. Open www.handsofgoldny.com in Chrome on the PC.
2. F12 -> Application tab -> Manifest. No red errors.
3. Same tab -> Service Workers. Should say "activated and is running".
4. Address bar shows an install icon on the right. Click it.
5. On your iPhone: Safari -> the site -> scroll -> the banner appears.

If the service worker ever gets stuck on an old version:
F12 -> Application -> Service Workers -> Unregister, then reload.


GOOGLE TAG MANAGER
------------------
These events are pushed to the dataLayer, ready to make triggers from:
  pwa_prompt_shown      banner displayed (pwa_platform: android | ios)
  pwa_install_clicked   tapped Install
  pwa_install_accepted / pwa_install_dismissed
  pwa_installed         icon actually landed on their home screen
Installed visits also arrive with ?source=pwa on the URL.
