/**
 * Prüft die Oberfläche gegen die Wörterbücher.
 *
 * Zwei Löcher gibt es zwischen index.html und i18n.js, und beide sieht man
 * im Bild nicht sofort:
 *
 *   (a) Im Markup steht ein Schlüssel, den es im Wörterbuch nicht gibt.
 *       `anwenden` schreibt dann den Schlüssel selbst ins Feld – absichtlich,
 *       damit es auffällt, aber eben erst dann, wenn jemand genau diesen
 *       Dialog öffnet. Das ist ein Fehler und lässt diesen Lauf scheitern.
 *
 *   (b) Im Wörterbuch steht ein Schlüssel, den niemand mehr verwendet.
 *       Das ist kein Fehler, sondern Ballast: er muss in drei Sprachen
 *       gepflegt werden und keiner sieht ihn. Darum nur ein Hinweis.
 *
 *   (c) Der Quelltext übergibt einen Schlüssel an `t`/`satz`, den es im
 *       Wörterbuch nicht gibt. Dieselbe Wirkung wie (a) und die größere
 *       Hälfte der Sätze: alles mit Platzhaltern steht in app.js und nicht
 *       im Markup. Auch das ist ein Fehler und lässt den Lauf scheitern.
 *
 * Warum die Suche nach (b) nicht bei index.html aufhört, obwohl der Vertrag
 * nur davon spricht: die Hälfte aller Schlüssel wird nie im Markup genannt,
 * sondern in app.js an `t` übergeben (tipp.*, hinweis.*, a11y.zelle*). Ohne
 * einen Blick in den Quelltext wäre die Hinweisliste so lang, dass niemand
 * sie liest – und ein Werkzeug, dessen Ausgabe man überblättert, ist keines.
 * Zusammengesetzte Schlüssel ('stufe.' + stufe) werden dabei über ihren
 * Rumpf erkannt; genauer geht es nur mit einem Parser, und der wäre die
 * erste Abhängigkeit des Projekts.
 *
 * Aufruf:  node tools/check-i18n.mjs
 * Rückgabe: 1, wenn ein Schlüssel aus Markup oder Quelltext fehlt, sonst 0.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRACHEN, STANDARD, texte } from '../i18n.js';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Die Attribute, die `anwenden` in i18n.js tatsächlich bedient. Steht ein
 * anderes im Markup, wird der Text dort nie geschrieben – das Feld bleibt
 * leer und kein Test merkt es, weil beide Dateien für sich in Ordnung sind.
 */
const BEDIENTE_ATTRIBUTE = new Set([
  'data-i18n', 'data-i18n-aria', 'data-i18n-platzhalter',
  'data-i18n-titel', 'data-i18n-html',
]);

/** Alles, was wie data-i18n… aussieht, mit einfachen oder doppelten Anführungszeichen. */
const IM_MARKUP = /(data-i18n(?:-[a-z]+)*)\s*=\s*("([^"]*)"|'([^']*)')/g;

async function lies(pfad) {
  try {
    return await readFile(pfad, 'utf8');
  } catch (fehler) {
    if (fehler.code === 'ENOENT') return null;
    throw fehler;
  }
}

const html = await lies(join(WURZEL, 'index.html'));
if (html === null) {
  // Beim parallelen Bau ist index.html manchmal noch nicht da. Das ist kein
  // Fehler dieses Werkzeugs, und ein roter Lauf würde nur verwirren.
  console.log('index.html gibt es noch nicht – nichts zu prüfen.');
  process.exit(0);
}

/* ------------------------------------------ (a) Schlüssel im Markup prüfen */

const woerterbuch = texte(STANDARD);
const bekannt = new Set(Object.keys(woerterbuch));

const imMarkup = new Map();      // Schlüssel -> Menge der Attribute, in denen er steht
const unbedient = new Map();     // Attribut  -> Menge der Schlüssel

for (const treffer of html.matchAll(IM_MARKUP)) {
  const attribut = treffer[1];
  const schluessel = (treffer[3] ?? treffer[4] ?? '').trim();
  if (!schluessel) continue;
  if (!imMarkup.has(schluessel)) imMarkup.set(schluessel, new Set());
  imMarkup.get(schluessel).add(attribut);
  if (!BEDIENTE_ATTRIBUTE.has(attribut)) {
    if (!unbedient.has(attribut)) unbedient.set(attribut, new Set());
    unbedient.get(attribut).add(schluessel);
  }
}

const fehlend = [...imMarkup.keys()].filter((k) => !bekannt.has(k)).sort();

/* --------------------------------- (b) Schlüssel im Wörterbuch nachschlagen */

/**
 * Der Heuhaufen: Markup und aller Quelltext, der `t` aufruft. i18n.js selbst
 * bleibt draußen (dort steht jeder Schlüssel per Definition), die Tests und
 * die Werkzeuge ebenso – ein Schlüssel, den nur noch ein Test nennt, ist im
 * Spiel nicht mehr in Gebrauch.
 */
async function heuhaufen() {
  const teile = [html];
  for (const name of (await readdir(WURZEL)).sort()) {
    if (!name.endsWith('.js') || name.endsWith('.test.js') || name === 'i18n.js') continue;
    teile.push(await lies(join(WURZEL, name)) ?? '');
  }
  return teile.join('\n');
}

const quelle = await heuhaufen();

/**
 * Wird der Schlüssel irgendwo genannt? Entweder wörtlich, oder als Rumpf
 * eines zusammengesetzten Namens: 'stufe.' + stufe und `stufe.${s}` sind
 * beides gängige Formen in app.js.
 */
function inGebrauch(schluessel) {
  if (quelle.includes(schluessel)) return true;
  const punkt = schluessel.lastIndexOf('.');
  if (punkt < 0) return false;
  const rumpf = schluessel.slice(0, punkt + 1);
  // 'stufe.' gefolgt von einem Anführungszeichen oder einer Einsetzung.
  return new RegExp(`${rumpf.replace(/\./g, '\\.')}(['"\`]|\\$\\{)`).test(quelle);
}

const ungenutzt = [...bekannt].filter((k) => !inGebrauch(k)).sort();

/* ------------------------- (c) Schlüssel aus dem Quelltext gegenprüfen */

/**
 * Dasselbe Loch wie (a), nur auf der anderen Seite: ein Schlüssel, den
 * app.js an `t` oder `satz` übergibt und den es nicht gibt.
 *
 * (a) prüft nur das Markup, und das ist die kleinere Hälfte — die Sätze mit
 * Platzhaltern (tipp.*, hinweis.*, a11y.zelle*) stehen ALLE im Quelltext und
 * gar nicht im Markup. Ein Tippfehler dort läuft genauso still ins Leere:
 * `t` gibt nach seinem eigenen Vertrag den Schlüssel selbst zurück, also
 * stände im Bild plötzlich "hinweis.zukLein" statt eines Satzes. Sichtbar
 * wird das erst, wenn genau dieser Fall im Spiel eintritt, und "ein zu
 * kleines Rechteck gesetzt" ist kein Fall, den jeder Prüflauf trifft.
 *
 * Geprüft werden nur WÖRTLICHE Schlüssel in einfachen Anführungszeichen als
 * zweites Argument. Zusammengesetzte (`stufe.${stufe}`) bleiben draußen: die
 * ließen sich nur mit einem Parser und einer Wertverfolgung auflösen, und
 * ein falscher Fehler in einem Prüfwerkzeug ist schlimmer als eine Lücke,
 * die im Kommentar steht.
 */
const AUFRUF = /\b(?:t|satz)\(\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?'([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)'/g;

const ausQuelltext = new Map();     // Schlüssel -> Menge der Dateien
for (const name of (await readdir(WURZEL)).sort()) {
  if (!name.endsWith('.js') || name.endsWith('.test.js') || name === 'i18n.js') continue;
  const text = await lies(join(WURZEL, name));
  if (!text) continue;
  for (const treffer of text.matchAll(AUFRUF)) {
    if (!ausQuelltext.has(treffer[1])) ausQuelltext.set(treffer[1], new Set());
    ausQuelltext.get(treffer[1]).add(name);
  }
}

const fehlendImCode = [...ausQuelltext.keys()].filter((k) => !bekannt.has(k)).sort();

/* ---------------------------------------------------------------- Bericht */

console.log(`index.html nennt ${imMarkup.size} Schlüssel, der Quelltext `
  + `${ausQuelltext.size}, i18n.js kennt ${bekannt.size} in `
  + `${SPRACHEN.length} Sprachen.`);

if (fehlend.length) {
  console.log(`\n${fehlend.length} Schlüssel aus dem Markup fehlen im Wörterbuch:`);
  for (const k of fehlend) {
    console.log(`  ${k}   (steht in ${[...imMarkup.get(k)].join(', ')})`);
  }
}

if (fehlendImCode.length) {
  console.log(`\n${fehlendImCode.length} Schlüssel aus dem Quelltext fehlen im Wörterbuch:`);
  for (const k of fehlendImCode) {
    console.log(`  ${k}   (übergeben in ${[...ausQuelltext.get(k)].join(', ')})`);
  }
}

if (unbedient.size) {
  console.log('\nHinweis: diese Attribute bedient anwenden() in i18n.js nicht –');
  console.log('der Text wird dort nie geschrieben:');
  for (const [attribut, schluessel] of unbedient) {
    console.log(`  ${attribut}   ${[...schluessel].slice(0, 4).join(' ')}`
      + `${schluessel.size > 4 ? ` (+${schluessel.size - 4})` : ''}`);
  }
}

// Der Schlüsselsatz der drei Sprachen ist Sache von i18n.test.js. Hier steht
// er trotzdem, weil dieses Werkzeug oft allein aufgerufen wird und eine
// halb übersetzte Oberfläche dieselbe Wirkung hat wie ein fehlender Text.
for (const spr of SPRACHEN) {
  if (spr === STANDARD) continue;
  const ist = new Set(Object.keys(texte(spr)));
  const fehlt = [...bekannt].filter((k) => !ist.has(k));
  const zuviel = [...ist].filter((k) => !bekannt.has(k));
  if (fehlt.length || zuviel.length) {
    console.log(`\nHinweis: ${spr} weicht vom Deutschen ab – `
      + `${fehlt.length} fehlen, ${zuviel.length} zu viel:`);
    for (const k of [...fehlt.slice(0, 8), ...zuviel.slice(0, 8)]) console.log(`  ${k}`);
  }
}

if (ungenutzt.length) {
  console.log(`\nHinweis: ${ungenutzt.length} Schlüssel werden nirgends verwendet `
    + '(weder im Markup noch im Quelltext):');
  // Gekürzt, weil diese Liste am Anfang eines Baus fast das ganze
  // Wörterbuch umfasst und dann die eigentlichen Fehler nach oben
  // wegschiebt. Wer sie ganz sehen will, hat sie in i18n.js.
  for (const k of ungenutzt.slice(0, 24)) console.log(`  ${k}`);
  if (ungenutzt.length > 24) console.log(`  … und ${ungenutzt.length - 24} weitere`);
}

const luecken = fehlend.length + fehlendImCode.length;
if (!luecken) console.log('\nkein fehlender Schlüssel');
process.exit(luecken ? 1 : 0);
