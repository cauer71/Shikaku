#!/usr/bin/env node
/**
 * Erzeugt die PNG-Fassungen des Zeichens aus icons/icon.svg.
 *
 *   npm i --no-save playwright-core
 *   node tools/make-icons.mjs
 *
 * Warum ein Browser und keine Bildbibliothek? Weil das Projekt zur Laufzeit
 * keine Abhaengigkeit hat und das auch beim Werkzeug so bleiben soll: hier
 * wird EIN Paket geborgt (playwright-core, ohne --save), und den Rest macht
 * das Chromium, das ohnehin fuer die Abnahme im echten Browser da ist.
 * sharp oder resvg waeren schneller, brechen aber bei Schrift auseinander -
 * die Ziffern im Zeichen kommen aus dem System-Schriftstapel, und nur ein
 * Browser setzt den so, wie ihn spaeter auch die Seite setzt. Ein
 * Zeichensatz-Fehler in einem Icon faellt niemandem auf, bis er auf dem
 * Startbildschirm klebt.
 *
 * Die Quelle ist die Datei und nicht ein Motiv im Code. Das ist der
 * Unterschied zu den Geschwisterprojekten: dort baut das Werkzeug das SVG
 * selbst zusammen und schreibt es am Ende auch als icon.svg. Hier ist
 * icon.svg von Hand entworfen und die WAHRHEIT - das Werkzeug skaliert nur.
 * So kann man das Zeichen im Editor ansehen und aendern, ohne ein Skript zu
 * lesen, und es kann nie zwischen Datei und Code auseinandergehen.
 *
 * Drei Sorten Ausgabe, drei verschiedene Gruende:
 *
 *   icon-32/192/512.png   randlos, mit durchsichtigem Grund dort, wo das SVG
 *                         nichts malt. Beim Zeichen des Spiels ist das
 *                         nirgends - es reicht bis an die Kante -, aber die
 *                         Angabe kostet nichts und haelt die Regel gerade.
 *   icon-maskable-*.png   mit Luft am Rand. Android schneidet aus einem
 *                         maskable-Icon eine Form heraus (Kreis, Kleeblatt,
 *                         Quadrat mit runden Ecken) und garantiert nur den
 *                         inneren Kreis. Ein randloses Zeichen verliert dort
 *                         seine Ecken samt Rahmen. Also sitzt das Motiv auf
 *                         74 % und der Rest ist Grund - und weil das Zeichen
 *                         selbst weiss und bunt ist, ist dieser Grund
 *                         schwarz: sonst verschwaende der Rahmen im Rand und
 *                         das Bild haette keine Kante mehr.
 *   apple-touch-icon.png  180 Pixel, deckend, randlos. iOS rundet selbst und
 *                         legt hinter Durchsichtiges Schwarz - ein Icon mit
 *                         Alpha sieht dort verlaufen aus. Deshalb ohne
 *                         omitBackground.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROMIUM_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const QUELLE = readFileSync(join(WURZEL, 'icons/icon.svg'), 'utf8');

/* Der Grund hinter dem Motiv, wenn es kleiner als die Kachel ist: das
   Schwarz der Linien aus mondrian.css. Ein Bild in einem schwarzen Passepartout
   - genau so haengt ein De-Stijl-Bild an der Wand. */
const RANDFARBE = '#16161a';

/**
 * Eine Seite, die genau eine Kachel gross ist und das Zeichen enthaelt.
 *
 * Das SVG wird als Text eingesetzt und nicht als <img src="icon.svg">: ein
 * eingebettetes Bild laedt asynchron, und der Bildschirmabzug kann davor
 * fallen. Beim eingesetzten Text kann das nicht passieren. Die Breiten- und
 * Hoehenangaben im SVG werden dabei ueberschrieben, das viewBox bleibt - so
 * skaliert dieselbe Quelle auf jede Groesse.
 */
function seite(groesse, { luft = 0 } = {}) {
  const motiv = Math.round(groesse * (1 - luft));
  const svg = QUELLE
    .replace(/\swidth="512"/, ` width="${motiv}"`)
    .replace(/\sheight="512"/, ` height="${motiv}"`);
  return `<style>
    html, body {
      margin: 0; padding: 0; width: ${groesse}px; height: ${groesse}px;
      overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      ${luft > 0 ? `background: ${RANDFARBE};` : ''}
    }
    svg { display: block; }
  </style>
  ${svg}`;
}

mkdirSync(join(WURZEL, 'icons'), { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });

/** Ein Bildschirmabzug in Originalgroesse, ohne Geraetefaktor. */
async function abzug(html, groesse, ziel, ohneGrund = false) {
  const p = await browser.newPage({
    viewport: { width: groesse, height: groesse },
    deviceScaleFactor: 1,
  });
  await p.setContent(html);
  // Die Ziffern kommen aus dem System-Schriftstapel. Ohne dieses Warten kann
  // der Abzug fallen, waehrend noch die Ersatzschrift steht - und dann sind
  // die Zahlen im Icon schmaler als im Spiel.
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(WURZEL, ziel), omitBackground: ohneGrund });
  await p.close();
  console.log('->', ziel);
}

// Randlos. 32 fuer die Adressleiste, 192 und 512 fuer das Manifest.
for (const groesse of [512, 192, 32]) {
  await abzug(seite(groesse), groesse, `icons/icon-${groesse}.png`, true);
}

// Mit Luft: Motiv auf 74 %, Rest schwarzer Grund. Deckend - ein maskable-Icon
// mit Alpha ist nach dem Schneiden loechrig.
for (const groesse of [512, 192]) {
  await abzug(seite(groesse, { luft: 0.26 }), groesse,
    `icons/icon-maskable-${groesse}.png`);
}

// iOS: 180 Pixel, deckend, randlos - iOS rundet selbst.
await abzug(seite(180), 180, 'icons/apple-touch-icon.png');

await browser.close();
