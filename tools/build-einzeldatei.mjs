/**
 * Legt `shikaku.html` an: das ganze Spiel in EINER Datei.
 *
 * Warum es das gibt, obwohl `dist/` schon eine fertige Seite ist: eine einzelne
 * Datei braucht keinen Server. Sie lässt sich per Mail verschicken, auf einen
 * Stick legen, in eine Wiki-Seite hängen oder mit `file://` aufmachen — und sie
 * ist der schnellste Weg, jemandem das Spiel zu zeigen, ohne vorher etwas zu
 * veröffentlichen. `cauer71/sudoku` ist genau so gebaut; hier ist es der
 * Zweitweg neben der Modulfassung.
 *
 *   node tools/build-einzeldatei.mjs
 *
 * Was dabei WEGFÄLLT und warum:
 *
 *   - Der Service Worker. Eine einzelne Datei hat kein `sw.js` daneben, und
 *     ohne Server gibt es auch keine Registrierung. `app.js` fängt den Fehler
 *     ohnehin ab; hier fliegt der Aufruf gleich heraus, damit in der Konsole
 *     keine 404 steht, die nach einem Fehler aussieht.
 *   - Das Manifest, aus demselben Grund. Der Startschnipsel im Kopf prüft
 *     `if (mf)` vor dem Umhängen und kommt ohne den Verweis zurecht.
 *   - Die Weltrangliste hat keinen Worker, an den sie sich wenden könnte.
 *     Sie fällt nicht aus — sie ist einfach nicht da: `online.js` verschluckt
 *     jeden Fehlschlag und gibt `null` zurück, das Spiel bleibt unverändert
 *     spielbar. Die eigenen Bestzeiten laufen weiter.
 *
 * Wie die Module zusammengelegt werden: alle sieben in einen einzigen
 * `<script type="module">`, in Abhängigkeitsreihenfolge, die lokalen
 * `import`-Zeilen und das Schlüsselwort `export` entfernt. Das funktioniert,
 * weil sie sich einen Namensraum teilen können — nachgeprüft, nicht gehofft:
 * 241 Namen auf der obersten Ebene, und genau EINE Kollision, `zurueck` in
 * `loeser.js` (die Rückspur der Suche) gegen `app.js` (Rückgängig). Sie wird
 * beim Zusammenlegen umbenannt, und weil sie in `loeser.js` modulintern ist,
 * merkt das niemand außerhalb.
 *
 * Verworfen: ein `<script type="importmap">` mit `data:`-Adressen je Modul.
 * Das hätte die Dateien unverändert gelassen — aber Importkarten müssen
 * statisch im Dokument stehen, `data:`-Module hängen an der CSP der jeweiligen
 * Umgebung, und ein Fehler daran wäre eine leere Seite ohne Meldung. Das
 * Zusammenlegen ist grober, aber es lässt sich prüfen: `tools/probe-einzeldatei.mjs`
 * spielt in der erzeugten Datei ein ganzes Rätsel durch.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = (name) => readFileSync(join(ROOT, name), 'utf8');

/** In Abhängigkeitsreihenfolge: was zuerst steht, wird von späteren gebraucht. */
const MODULE = [
  'shikaku.js', 'loeser.js', 'erzeuger.js', 'i18n.js', 'online.js',
  'brett.js', 'app.js',
];

/**
 * Umbenennungen je Modul, gegen Namensgleichheit auf der obersten Ebene.
 *
 * Bewusst eine Liste und keine automatische Umbenennung aller Namen: eine
 * Umbenennung, die ein Werkzeug ausdenkt, ist im Fehlerfall nicht zu lesen.
 * Kommt eine zweite Kollision dazu, meldet die Prüfung unten sie namentlich,
 * und dann steht sie hier dazu.
 */
const UMBENENNEN = {
  'loeser.js': { zurueck: 'rueckspurZurueck' },
};

/** Die Stilblätter in der Reihenfolge, in der sie im Kopf stehen. */
const STILE = [
  { datei: 'basis.css', id: null },
  { datei: 'm3-farben.css', id: 'css-m3-farben' },
  { datei: 'm3.css', id: 'css-m3' },
  { datei: 'papier.css', id: 'css-papier' },
  { datei: 'mondrian.css', id: 'css-mondrian' },
];

/* ------------------------------------------------------- die Module ------ */

/**
 * Ein Modul für den gemeinsamen Namensraum vorbereiten.
 *
 * `export` fällt weg, lokale `import`-Zeilen fallen weg (auch die
 * mehrzeiligen — `loeser.js` und `app.js` haben je eine). Ein Import, der
 * NICHT mit './' beginnt, bleibt stehen und lässt die Prüfung unten
 * fehlschlagen: er käme von außen, und das wäre in einer Datei, die für sich
 * allein laufen soll, ein Widerspruch, den man sehen muss.
 */
function vorbereiten(name, quelle) {
  let q = quelle;

  // Lokale Importe, ein- und mehrzeilig. Non-greedy bis zum ersten "from './…'".
  q = q.replace(/^import\s+[\s\S]*?from\s+'\.\/[^']+';[ \t]*\n/gm, '');

  // Das Schlüsselwort export vor Deklarationen. Andere Formen gibt es hier
  // nicht (geprüft: nur "export const" und "export function").
  q = q.replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)/gm, '');

  for (const [alt, neu] of Object.entries(UMBENENNEN[name] ?? {})) {
    q = q.replace(new RegExp(`\\b${alt}\\b`, 'g'), neu);
  }

  // Die Registrierung des Service Workers samt ihrem if-Block.
  q = q.replace(/if\s*\('serviceWorker' in navigator\)\s*\{[\s\S]*?\n\}\n/, '');

  return `/* ═══ ${name} ═══ */\n${q.trim()}\n`;
}

const teile = MODULE.map((m) => vorbereiten(m, lies(m)));
const gebuendelt = teile.join('\n');

/* --------------------------------------------------------- die Prüfung --- */

const klagen = [];
if (/^import\s/m.test(gebuendelt)) {
  klagen.push('im Bündel steht noch ein import — siehe vorbereiten()');
}
if (/^export\s/m.test(gebuendelt)) {
  klagen.push('im Bündel steht noch ein export — siehe vorbereiten()');
}
if (/serviceWorker/.test(gebuendelt)) {
  klagen.push('die Registrierung des Service Workers ist noch drin');
}

// Namensgleichheit auf der obersten Ebene: dieselbe Prüfung, die die Liste
// UMBENENNEN begründet — damit eine neu dazukommende Kollision auffällt,
// statt sich als stille Überschreibung zu äußern.
const gesehen = new Map();
MODULE.forEach((m, i) => {
  const re = /^(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (const t of teile[i].matchAll(re)) {
    const n = t[1];
    if (gesehen.has(n)) klagen.push(`Namensgleichheit "${n}": ${gesehen.get(n)} und ${m}`);
    else gesehen.set(n, m);
  }
});

/* ----------------------------------------------------------- das HTML ---- */

let html = lies('index.html');

// Die Stilblätter durch <style> ersetzen. Die Kennungen bleiben, weil der
// Startschnipsel und app.js die Skins über `disabled` umschalten — und
// HTMLStyleElement.disabled tut genau dasselbe wie HTMLLinkElement.disabled.
for (const { datei, id } of STILE) {
  const verweis = id
    ? new RegExp(`<link rel="stylesheet" href="${datei}" id="${id}">`)
    : new RegExp(`<link rel="stylesheet" href="${datei}">`);
  if (!verweis.test(html)) { klagen.push(`Verweis auf ${datei} nicht gefunden`); continue; }
  const marke = id ? ` id="${id}"` : '';
  html = html.replace(verweis, `<style${marke}>\n${lies(datei).trim()}\n</style>`);
}

// Manifest heraus (es liegt keines daneben).
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');

// Und der Modulverweis wird das Bündel.
const modulVerweis = /<script type="module" src="app\.js"><\/script>/;
if (!modulVerweis.test(html)) klagen.push('der Verweis auf app.js wurde nicht gefunden');
html = html.replace(modulVerweis, `<script type="module">\n${gebuendelt}\n</script>`);

if (/<link rel="stylesheet"|src="[^"]*\.js"/.test(html)) {
  klagen.push('es hängt noch eine externe Datei am Dokument');
}

if (klagen.length) {
  console.error('Nicht geschrieben:\n  ' + klagen.join('\n  '));
  process.exit(1);
}

writeFileSync(join(ROOT, 'shikaku.html'), html);
const kb = (html.length / 1024).toFixed(0);
console.log(`shikaku.html angelegt: ${kb} KB, ${MODULE.length} Module, ${STILE.length} Stilblätter.`);
console.log('Prüfen mit: node tools/probe-einzeldatei.mjs');
