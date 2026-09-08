#!/usr/bin/env node
/**
 * Legt dist/ an: genau die Dateien, die die App im Netz braucht.
 *
 *   npm run build
 *
 * Warum ueberhaupt ein Schritt, wo das Projekt sonst ohne Build auskommt?
 * Weil Ausliefern etwas anderes ist als Entwickeln. Cloudflare laedt ein
 * Verzeichnis hoch, und dieses Verzeichnis darf nicht das Projekt selbst
 * sein - zwei Gruende, beide gemessen:
 *
 *   1. wrangler legt sein eigenes .wrangler/ in den Projektordner. Liegt der
 *      Ordner zugleich unter Beobachtung, laedt der lokale Server endlos neu
 *      ("Reloading local server" ohne Ende) und antwortet auf nichts mehr.
 *   2. Sonst gingen Werkzeuge, Tests, Migrationen, README und package.json
 *      mit hinaus. Oeffentlich sind sie im Repository ohnehin, aber auf der
 *      Spielseite haben sie nichts verloren.
 *
 * Kopiert wird nach einer REGEL und nicht nach einer Liste: alle Dateien der
 * obersten Ebene mit den Endungen unten, ausser Tests und dem Worker - dazu
 * icons/ vollstaendig. Eine Liste muesste man pflegen; eine neue CSS-Datei
 * waere sonst irgendwann vergessen und die Seite im Netz halb kaputt. Das
 * Schwesterprojekt sudoku macht es umgekehrt, mit einer Positivliste, und
 * hat genau dieses Problem: dort ist jede neue Datei ein zweiter Handgriff.
 * Der Preis der Regel ist, dass sie nicht sehen kann, was FEHLT - dafuer
 * stehen die drei Pruefungen weiter unten.
 *
 * worker.js faellt ausdruecklich heraus: das ist Servercode, den Cloudflare
 * buendelt und ausfuehrt. Als herunterladbare Datei danebenzuliegen waere
 * bestenfalls verwirrend.
 *
 * Vier Dinge tut dieser Schritt ausser Kopieren, und jedes deckt einen
 * Fehler ab, der sonst erst im Netz auffaellt:
 *
 *   - Fassungsnummern vergleichen (package.json, sw.js, app.js). Gehen sie
 *     auseinander, zeigt der Einstellungsdialog eine Nummer an, unter der die
 *     Dateien nie ausgeliefert wurden.
 *   - Die Offline-Liste aus sw.js gegen dist/ pruefen. ablegen() dort ist
 *     streng: schlaegt eine Datei fehl, gilt der ganze Speicher als nicht
 *     angelegt. Ein Tippfehler in der Liste ist also ein Spiel, das sich nie
 *     installieren laesst - und das merkt man ohne Telefon nicht.
 *   - Die Pruefsummen der eingebetteten Skripte in die Sicherheitsregel
 *     eintragen (siehe _headers).
 *   - _headers und .nojekyll mitnehmen, obwohl sie nicht in die Regel passen.
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZIEL = join(WURZEL, 'dist');

/** Was ausgeliefert wird - alles andere auf der obersten Ebene nicht. */
const ENDUNGEN = new Set(['.html', '.js', '.css', '.webmanifest']);

/** Servercode. Gehoert zu wrangler, nicht in die Auslieferung. */
const NICHT = new Set(['worker.js']);

/** Ordner, die ganz mitgehen. */
const ORDNER = ['icons'];

/**
 * Dateien ohne passende Endung, die trotzdem mit muessen.
 *
 * _headers wird von Cloudflare AUSGEWERTET und nicht ausgeliefert - es muss
 * aber im Asset-Verzeichnis liegen, damit Cloudflare es findet.
 * .nojekyll gilt fuer GitHub Pages in der Zweig-Betriebsart: ohne die Datei
 * versteckt Jekyll dort jeden Namen, der mit einem Unterstrich beginnt.
 * Beide sind leicht zu vergessen und beide fallen nur im Netz auf.
 */
const DAZU = ['_headers', '.nojekyll'];

/** Sammelstelle fuer alles, was schiefgeht - erst am Ende gemeinsam melden. */
const klagen = [];
const meckern = (satz) => klagen.push(satz);

/** Liest eine Datei, oder null, wenn es sie nicht gibt. */
async function lies(rel) {
  try {
    return await readFile(join(WURZEL, rel), 'utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Kopieren
// ---------------------------------------------------------------------------

await rm(ZIEL, { recursive: true, force: true });
await mkdir(ZIEL, { recursive: true });

const dabei = [];
for (const name of (await readdir(WURZEL)).sort()) {
  if (name === 'dist' || name.endsWith('.test.js') || NICHT.has(name)) continue;
  if (!ENDUNGEN.has(extname(name))) continue;
  if (!(await stat(join(WURZEL, name))).isFile()) continue;
  await cp(join(WURZEL, name), join(ZIEL, name));
  dabei.push(name);
}

for (const ordner of ORDNER) {
  try {
    await cp(join(WURZEL, ordner), join(ZIEL, ordner), { recursive: true });
    dabei.push(`${ordner}/`);
  } catch {
    meckern(`${ordner}/ fehlt - ohne die Icons laesst sich die App nicht installieren.`);
  }
}

for (const name of DAZU) {
  try {
    await cp(join(WURZEL, name), join(ZIEL, name));
    dabei.push(name);
  } catch {
    meckern(`${name} fehlt.`);
  }
}

// Die Probe aufs Exempel: ohne index.html ist es keine Seite. Das ist der eine
// Fehler, bei dem alles Weitere sinnlos waere - also hier schon Schluss.
if (!dabei.includes('index.html')) {
  console.error('dist/ ohne index.html - da stimmt etwas nicht.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Fassungsnummern
// ---------------------------------------------------------------------------

/*
 * Drei Stellen tragen dieselbe Nummer, und keine kann die anderen lesen:
 * package.json ist die Quelle, sw.js braucht sie im Speichernamen (ein neuer
 * Name ist das Signal "wirf den alten Bestand weg"), app.js zeigt sie im
 * Einstellungsdialog. Hier laufen alle drei durch, also wird hier verglichen.
 *
 * Der naheliegende Weg waere, die Nummer beim Bauen in die Dateien zu
 * schreiben. Genau das will dieses Projekt nicht: die Dateien sollen so, wie
 * sie im Verzeichnis liegen, ohne jeden Schritt im Browser laufen. Ein
 * erzeugtes app.js waere ein Bundler durch die Hintertuer.
 */
const paket = JSON.parse(await readFile(join(WURZEL, 'package.json'), 'utf8'));
const fassung = paket.version;

const swText = await lies('sw.js');
const swNummer = swText?.match(/const CACHE = 'shikaku-([^']+)'/);
if (!swText) meckern('sw.js fehlt - die App waere nicht offline-faehig.');
else if (!swNummer) meckern("sw.js: CACHE = 'shikaku-…' nicht gefunden.");
else if (swNummer[1] !== fassung) {
  meckern(`Fassungen gehen auseinander: package.json sagt ${fassung}, `
    + `sw.js sagt shikaku-${swNummer[1]}.`);
}

const appText = await lies('app.js');
const appNummer = appText?.match(/export const VERSION = '([^']+)'/);
if (!appText) meckern('app.js fehlt - die Seite waere still und leer.');
else if (!appNummer) meckern("app.js: export const VERSION = '…' nicht gefunden.");
else if (appNummer[1] !== fassung) {
  meckern(`Fassungen gehen auseinander: package.json sagt ${fassung}, `
    + `app.js sagt ${appNummer[1]}.`);
}

// ---------------------------------------------------------------------------
// 3. Die Offline-Liste gegen das, was wirklich da ist
// ---------------------------------------------------------------------------

/*
 * sw.js verspricht eine Liste von Dateien. Das Versprechen ist bindend: die
 * Ablage bricht komplett ab, wenn eine davon fehlt (das ist in sw.js
 * begruendet). Ein Tippfehler in der Liste heisst also nicht "eine Datei
 * fehlt offline", sondern "die App laesst sich nicht installieren" - und das
 * sieht man am Schreibtisch nicht.
 *
 * Gelesen wird der Quelltext mit einem Ausdruck und nicht per import: sw.js
 * ist ein Servicearbeiter-Skript, es spricht self und caches an und laesst
 * sich in Node nicht laden. Ein export nur fuer diese Pruefung
 * hineinzuschreiben waere die Datei nach dem Werkzeug geformt.
 */
if (swText) {
  const block = swText.match(/const DATEIEN = \[([\s\S]*?)\n\];/);
  if (!block) meckern('sw.js: die Liste DATEIEN liess sich nicht lesen.');
  else {
    const pfade = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (pfade.length < 5) meckern('sw.js: die Liste DATEIEN ist verdaechtig kurz.');
    const fehlen = [];
    for (const pfad of pfade) {
      if (pfad === './') continue;          // das Verzeichnis selbst, keine Datei
      try {
        await stat(join(ZIEL, pfad));
      } catch {
        fehlen.push(pfad);
      }
    }
    if (fehlen.length) {
      meckern(`sw.js nennt Dateien, die nicht in dist/ liegen: ${fehlen.join(', ')}\n`
        + '  Der Servicearbeiter laesst sich damit nicht einbauen - entweder die\n'
        + '  Datei anlegen oder sie aus der Liste DATEIEN nehmen.');
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Pruefsummen der eingebetteten Skripte in die Sicherheitsregel
// ---------------------------------------------------------------------------

/*
 * Ohne das stuende in _headers 'unsafe-inline' - die Erlaubnis fuer jedes
 * Skript, das im Quelltext auftaucht, gleich woher es stammt. Mit den
 * Pruefsummen laeuft genau der Code, der beim Zusammenstellen in den Dateien
 * stand; jede nachtraeglich eingeschleuste Zeile hat eine andere Summe und
 * wird vom Browser nicht ausgefuehrt.
 *
 * Gehasht wird der INHALT zwischen den Tags, byteweise so, wie er in der
 * Datei steht - Einrueckung und Zeilenumbrueche eingeschlossen. Deshalb
 * aendert sich die Summe bei jeder Aenderung an der Datei, und deshalb
 * entsteht sie hier und steht nicht von Hand in _headers.
 *
 * <script src="…"> wird ausdruecklich uebersprungen: das deckt 'self' ab, und
 * eine Summe dafuer waere falsch (der Browser hasht dort die Datei, nicht das
 * leere Tag).
 */
const html = dabei.filter((name) => name.endsWith('.html'));
const summen = [];
for (const rel of html) {
  const text = await readFile(join(WURZEL, rel), 'utf8');
  const bloecke = [...text.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!bloecke.length) {
    // Kein eingebettetes Skript ist kein Fehler an sich - aber wenn es in
    // KEINER Datei eines gibt, waere die Regel unnoetig streng gebaut und
    // jemand hat den Startschnipsel entfernt, ohne _headers anzufassen.
    continue;
  }
  for (const block of bloecke) {
    summen.push(`'sha256-${createHash('sha256').update(block[1], 'utf8').digest('base64')}'`);
  }
}
if (!summen.length) {
  meckern('In keiner HTML-Datei steht ein eingebettetes Skript - die '
    + 'Sicherheitsregel waere zu streng gebaut.');
}

const kopfDatei = join(ZIEL, '_headers');
const kopfText = await lies('_headers');
if (kopfText) {
  // Ausdruecklich nur in der Regelzeile ersetzen - der Platzhalter kommt auch
  // im Kommentar darueber vor, und der soll lesbar bleiben.
  const gefuellt = kopfText.replace(
    /(Content-Security-Policy:[^\n]*?)SKRIPT_HASHES/,
    (_, kopf) => kopf + summen.join(' '),
  );
  if (gefuellt === kopfText) {
    meckern('_headers: SKRIPT_HASHES steht in keiner '
      + 'Content-Security-Policy-Zeile - die Pruefsummen kaemen nirgends an.');
  } else {
    await writeFile(kopfDatei, gefuellt);
  }
}

// ---------------------------------------------------------------------------
// Abschluss
// ---------------------------------------------------------------------------

if (klagen.length) {
  console.error(`dist/ ist nicht vollstaendig - ${klagen.length} Beanstandung(en):`);
  for (const klage of klagen) console.error(`  - ${klage}`);
  process.exit(1);
}

console.log(`dist/ angelegt: Fassung ${fassung}, ${dabei.length} Eintraege, `
  + `${summen.length} Skript-Pruefsumme(n)`);
console.log(`  ${dabei.join(' ')}`);
