/* Offline-Speicher: beim Einbauen alles Noetige ablegen, danach Netz zuerst
   und der Speicher als Rueckfalloption.

   "Netz zuerst" allein genuegt nicht, und das ist die eine Stelle, die man
   hier wirklich verstanden haben muss. fetch() geht naemlich durch den
   Zwischenspeicher des BROWSERS, und GitHub Pages schickt seine Dateien mit
   zehn Minuten Haltbarkeit. Der Browser antwortete also aus eigenem Bestand
   die alte app.js - und der Servicearbeiter legte sie noch einmal als frisch
   ab. Beim Anlegen des neuen Speichers dasselbe: addAll() holte die Dateien
   ebenfalls durch den Browserspeicher, ein Speicher mit NEUEM Namen konnte so
   mit ALTEM Inhalt entstehen und ihn beliebig lange weitertragen. Genau
   deshalb stand nach einer neuen Fassung weiter die alte Versionsnummer im
   Einstellungsdialog.

   Darum: der eigene Programmcode wird immer am Browserspeicher vorbei geholt
   ('reload'). Bilder nicht - die aendern sich praktisch nie, sie liegen unter
   /icons/ mit einem Jahr Haltbarkeit (siehe _headers), und sie sind der
   groesste Teil der Ladung. */
const CACHE = 'shikaku-1.0.0';

/* Was offline da sein muss. Eine LISTE und keine Regel, anders als in
   tools/build-dist.mjs - hier geht es nicht ums Kopieren, sondern um eine
   Zusage: diese Dateien sind ohne Netz vorhanden. Eine Regel koennte sie
   nicht geben, denn der Servicearbeiter kann das Verzeichnis nicht lesen.

   Dass die Liste zu dem passt, was tatsaechlich ausgeliefert wird, prueft
   tools/build-dist.mjs beim Bauen: es liest diese Datei, zieht die Pfade
   heraus und bricht ab, wenn einer in dist/ fehlt. Sonst waere ein einziger
   Tippfehler hier ein Spiel, das sich nie installieren laesst - denn ablegen()
   unten ist streng. */
const DATEIEN = [
  './', 'index.html',

  // Programmcode. app.js steuert, brett.js zeichnet das Brett und nimmt die
  // Zeigerereignisse an, der Rest ist reine Rechnung ohne DOM.
  'app.js', 'brett.js', 'shikaku.js', 'loeser.js', 'erzeuger.js',
  'i18n.js', 'online.js',

  // basis.css bringt Aufbau und Standardfarben, die drei Skins ueberschreiben
  // danach nur Farben und Kanten. Alle vier muessen da sein: der Skin steht in
  // den Einstellungen und kann jeder von ihnen sein, auch ohne Netz.
  'basis.css', 'mondrian.css', 'papier.css', 'm3.css', 'm3-farben.css',

  // Vier Manifeste. Das neutrale wird im Quelltext verwiesen, der
  // Startschnipsel haengt sofort auf die Sprachfassung um - und ein
  // Installationsdialog kann aufgehen, waehrend das Netz weg ist.
  'manifest.webmanifest', 'manifest.de.webmanifest',
  'manifest.it.webmanifest', 'manifest.en.webmanifest',

  // Nur die Icons, die die laufende Seite braucht: das SVG als Favicon, die
  // 32er Fassung fuer Browser, die kein SVG als Icon nehmen, und das
  // Apple-Bild fuer den Startbildschirm. Die 192er und 512er PNG holt sich
  // das Betriebssystem beim Installieren aus dem Manifest, nicht die Seite -
  // sie hier abzulegen waere ein halbes Megabyte fuer nichts.
  'icons/icon.svg', 'icons/icon-32.png', 'icons/apple-touch-icon.png',
];

/** Programmcode - muss bei einer neuen Fassung wirklich neu sein. */
const CODE = /(?:\.html|\.js|\.css|\.webmanifest)$|\/$/;

/** Wie addAll, aber am Zwischenspeicher des Browsers vorbei. */
async function ablegen(speicher, pfad) {
  const res = await fetch(new URL(pfad, self.location).href, { cache: 'reload' });
  // Streng wie addAll: schlaegt eine Datei fehl, gilt der ganze Speicher als
  // nicht angelegt. Ein halber Offline-Bestand ist schlimmer als keiner - er
  // sieht aus wie ein installiertes Spiel und ist eine weisse Seite.
  if (!res.ok) throw new Error(`${pfad}: ${res.status}`);
  await speicher.put(pfad, res);
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((speicher) => Promise.all(DATEIEN.map((pfad) => ablegen(speicher, pfad))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(
        namen.filter((n) => n !== CACHE).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  /* Nur eigene DATEIEN anfassen - die Weltrangliste nicht. Im Speicher waere
     sie sofort veraltet, und die Ausweichantwort index.html waere fuer eine
     Zahlenauskunft blanker Unsinn: online.js bekaeme HTML, wo es JSON
     erwartet, und wuerde die gespeicherten Weltwerte mit Muell ueberschreiben.

     Die Herkunft allein genuegt dafuer nicht: /api/ kommt vom SELBEN Host wie
     das Spiel, seit die Rangliste in der eigenen D1-Datenbank liegt. Die
     naheliegende Regel "nur Fremdes durchlassen" haette sie also
     stillschweigend mitgespeichert - derselbe Gedanke, nur eine Zeile weiter
     unten. */
  let url = null;
  try { url = new URL(e.request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  /* Beim Code die Adresse statt der Anfrage nehmen: aus einer Anfrage mit
     mode 'navigate' laesst sich keine neue bauen (der Konstruktor wirft), und
     mehr als ein schlichtes GET auf eine eigene Datei ist es nicht. */
  const holen = CODE.test(url.pathname)
    ? fetch(url.href, { cache: 'reload' })
    : fetch(e.request);

  e.respondWith(
    holen
      .then((res) => {
        // Nur Gelungenes ablegen. Ein abgelegter 404 waere ein Fehler, der
        // offline bleibt, bis der Speichername wechselt - also bis zur
        // naechsten Fassung.
        if (res.ok) {
          const kopie = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, kopie)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
