/**
 * Prüft die Kennungen, mit denen der Quelltext ins Markup greift.
 *
 * Der Anlass ist eine Fehlerart, die im Bild nichts sagt und in der Konsole
 * nichts sagt: ein Tippfehler in einer Kennung.
 *
 *   const btnVor = document.getElementById('btn-for');   // 'btn-vor'
 *
 * `getElementById` gibt dafür `null` zurück, und weil app.js überall mit
 * `?.` und `if (el)` arbeitet — was richtig ist, sonst stürzte das Spiel bei
 * einem fehlenden Element ganz ab —, passiert genau nichts. Kein Fehler, kein
 * Knopf, keine Spur. Gefunden wird das erst von jemandem, der auf "Vor"
 * drückt und sich wundert; und wenn "Vor" der Knopf ist, den man selten
 * braucht, dauert das bis nach der Auslieferung.
 *
 * Also mechanisch: alle Kennungen aus dem Quelltext ziehen und gegen
 * index.html abgleichen. Drei Quellen, weil das Spiel drei Wege ins Dokument
 * hat:
 *
 *   document.getElementById('x')   der gewöhnliche Weg
 *   $('x') / holen('x')            die Kürzel in app.js und brett.js
 *   querySelector('#x …')          ein Wähler, der mit einer Kennung anfängt
 *
 * Gesucht wird bewusst mit regulären Ausdrücken und nicht mit einem Parser.
 * Ein Parser wäre die erste Abhängigkeit des Projekts, und für das, worum es
 * hier geht — eine Zeichenkette in einem Aufruf —, reicht die Textsuche:
 * jede Kennung in diesem Spiel steht wörtlich im Quelltext, keine wird
 * zusammengesetzt. Sollte das einmal nicht mehr gelten, meldet dieses
 * Werkzeug den zusammengesetzten Fall nicht — und findet dafür auch keinen
 * falschen Fehler.
 *
 * Umgekehrt wird ebenfalls nachgesehen: eine Kennung in index.html, die
 * NIEMAND nennt (kein Skript, kein Attribut, kein Stilblatt), ist kein
 * Fehler, sondern Ballast — jemand hat ein Element umgebaut und das id
 * stehen lassen. Darum nur ein Hinweis, wie in check-i18n.mjs.
 *
 * Aufruf:  node tools/check-dom.mjs
 * Rückgabe: 1, wenn eine gesuchte Kennung im Markup fehlt, sonst 0.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Die Dateien, die ins Dokument greifen dürfen. Ausdrücklich aufgezählt und
 * nicht "alle .js": worker.js läuft auf dem Server und hat gar kein
 * Dokument, die Tests laufen in Node, und die Werkzeuge hier lesen Dateien.
 * Eine Kennung, die nur in einem Test steht, sagt über das Spiel nichts.
 */
const GREIFENDE_DATEIEN = ['app.js', 'brett.js', 'online.js', 'sw.js'];

/*
 * Die Muster, mit denen eine Kennung gesucht wird.
 *
 * `$(...)` und `holen(...)` stehen mit dabei, weil beide Dateien ihr eigenes
 * Kürzel für getElementById haben (app.js: `const $ = ...`, brett.js:
 * `function holen(...)`). Ohne die beiden fände dieses Werkzeug in app.js
 * genau NULL Kennungen und meldete zufrieden, dass alles stimmt — das wäre
 * das Schlimmste, was ein Prüfwerkzeug tun kann.
 */
const KENNUNGSMUSTER = [
  /\bgetElementById\(\s*['"]([^'"]+)['"]\s*\)/g,
  /(?:^|[^\w.$])\$\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bholen\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Wähler in querySelector/querySelectorAll/closest/matches.
 *
 * Drei Alternativen und nicht eine mit Rückverweis: die Wähler dieses
 * Projekts stehen teils in Rückwärtsstrichen und enthalten dann
 * Anführungszeichen (`.teil[data-i="${i}"]`). Eine gemeinsame Zeichenklasse
 * `[^'"`]` bricht dort mitten im Wähler ab — und dann steht die Kennung, um
 * die es geht, hinter dem Abbruch und wird nie geprüft. Gefunden beim
 * Gegenversuch mit einem absichtlich falschen `#nicht-da .teil[data-i=…]`:
 * das Werkzeug meldete zufrieden nichts.
 */
const WAEHLERMUSTER = /\b(?:querySelectorAll|querySelector|closest|matches)\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g;

/** Eine Kennung am Anfang eines Wählers: '#brett', '#teile .teil'. */
const KENNUNG_IM_WAEHLER = /#([A-Za-z][\w-]*)/g;

/** Eine Klasse in einem Wähler. */
const KLASSE_IM_WAEHLER = /\.([A-Za-z][\w-]*)/g;

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
  // Fehler dieses Werkzeugs, und ein roter Lauf würde nur verwirren – genau
  // wie in check-i18n.mjs.
  console.log('index.html gibt es noch nicht – nichts zu prüfen.');
  process.exit(0);
}

/* ------------------------------------------------ was das Markup anbietet */

const imMarkup = new Set();
for (const treffer of html.matchAll(/\sid\s*=\s*"([^"]+)"/g)) imMarkup.add(treffer[1]);
for (const treffer of html.matchAll(/\sid\s*=\s*'([^']+)'/g)) imMarkup.add(treffer[1]);

const klassenImMarkup = new Set();
for (const treffer of html.matchAll(/\sclass\s*=\s*"([^"]*)"/g)) {
  for (const k of treffer[1].split(/\s+/)) if (k) klassenImMarkup.add(k);
}

/* ------------------------------------------------ was der Quelltext sucht */

/** Kennung -> Menge der Dateien, in denen sie gesucht wird. */
const gesucht = new Map();
/** Klasse -> Menge der Dateien, in denen sie in einem Wähler steht. */
const gesuchteKlassen = new Map();

function vermerke(karte, name, datei) {
  if (!karte.has(name)) karte.set(name, new Set());
  karte.get(name).add(datei);
}

const quellen = new Map();
for (const name of GREIFENDE_DATEIEN) {
  const text = await lies(join(WURZEL, name));
  if (text === null) continue;
  quellen.set(name, text);

  for (const muster of KENNUNGSMUSTER) {
    for (const treffer of text.matchAll(muster)) vermerke(gesucht, treffer[1], name);
  }
  for (const treffer of text.matchAll(WAEHLERMUSTER)) {
    const waehler = treffer[1] ?? treffer[2] ?? treffer[3] ?? '';
    for (const k of waehler.matchAll(KENNUNG_IM_WAEHLER)) vermerke(gesucht, k[1], name);
    for (const k of waehler.matchAll(KLASSE_IM_WAEHLER)) vermerke(gesuchteKlassen, k[1], name);
  }
}

const fehlend = [...gesucht.keys()].filter((k) => !imMarkup.has(k)).sort();

/*
 * Klassen sind der weichere Fall und werden darum nur als Hinweis gemeldet.
 *
 * Der Grund: die halbe Oberfläche entsteht erst zur Laufzeit. '.teil' steht
 * nirgends in index.html — brett.js legt die Flächen selbst an, und
 * '.rang__zeile--du' schreibt app.js beim Zeichnen der Bestenliste. Eine
 * Klasse gilt deshalb als in Ordnung, wenn sie im Markup steht ODER
 * irgendwo im Quelltext gesetzt wird (className, classList.add, ein
 * Klassenname in einer Zeichenkette) ODER in einem Stilblatt vorkommt: ein
 * Wähler auf eine Klasse, die niemand vergibt, trifft dagegen nie etwas.
 */
async function stilblaetter() {
  const teile = [];
  for (const name of (await readdir(WURZEL)).sort()) {
    if (name.endsWith('.css')) teile.push(await lies(join(WURZEL, name)) ?? '');
  }
  return teile.join('\n');
}

const css = await stilblaetter();

/*
 * Der Quelltext, in dem lose nach einer Kennung gesucht wird.
 *
 * Die Skripte AUS index.html gehören dazu, das Markup drumherum nicht. Im
 * Kopf der Seite liegt ein klassischer Schnipsel, der Skin, Sprache und die
 * vier Stilblätter setzt, bevor das erste Bild steht (der Grund steht dort),
 * und der greift mit getElementById zu wie jedes Modul. Das ganze Dokument
 * mitzunehmen wäre dagegen der sichere Weg, die Gegenprobe wertlos zu
 * machen: jede Kennung steht in ihrem eigenen id-Attribut in
 * Anführungszeichen und wäre damit immer "gebraucht".
 */
const schnipsel = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((t) => t[1]);
const allerQuelltext = [...quellen.values(), ...schnipsel].join('\n');

function klasseWirdVergeben(name) {
  if (klassenImMarkup.has(name)) return true;
  if (css.includes(`.${name}`)) return true;
  // Wird sie irgendwo gesetzt? Gesucht wird der Name in Anführungszeichen
  // oder als Wort in einer Klassenliste ("teil teil--gut").
  return new RegExp(`['"\`][^'"\`]*\\b${name.replace(/[-]/g, '\\-')}\\b`).test(allerQuelltext);
}

const klassenOhneGrund = [...gesuchteKlassen.keys()]
  .filter((k) => !klasseWirdVergeben(k)).sort();

/* ------------------------------- Kennungen im Markup, die niemand braucht */

/**
 * Wird die Kennung irgendwo gebraucht?
 *
 * Nicht nur vom Skript: index.html verweist selbst auf Kennungen
 * (aria-labelledby, aria-controls, href="#…", <use href="#i-…">, for=…),
 * und die Stilblätter dürfen es auch. Ohne diesen Blick stände die halbe
 * Liste der Symbole und jede Dialogüberschrift unter "wird nicht
 * gebraucht", und eine Liste, die man überblättert, ist keine.
 */
function kennungGebraucht(kennung) {
  if (gesucht.has(kennung)) return true;
  if (new RegExp(`#${kennung.replace(/[-]/g, '\\-')}\\b`).test(html)) return true;
  if (new RegExp(`(?:aria-labelledby|aria-controls|aria-describedby|for)\\s*=\\s*["'][^"']*\\b${kennung}\\b`)
    .test(html)) return true;
  if (css.includes(`#${kennung}`)) return true;
  /*
   * Und zuletzt LOSE: steht die Kennung irgendwo als Zeichenkette im
   * Quelltext, gilt sie als gebraucht.
   *
   * Die beiden Richtungen dürfen verschieden streng sein, und sie müssen es
   * sogar. Für die Frage "fehlt eine gesuchte Kennung?" wird streng gesucht
   * (nur die drei Aufrufmuster oben), damit kein falscher Fehler gemeldet
   * wird. Für die Frage "braucht die noch jemand?" wird lose gesucht, damit
   * kein falscher Hinweis kommt: app.js schaltet die Stilblätter über einen
   * eigenen Helfer (`schalte('css-mondrian', …)`), und der Schnipsel im Kopf
   * von index.html holt dieselben vier Kennungen selbst. Beides ist echter
   * Gebrauch, den die Aufrufmuster nicht sehen.
   *
   * Was hier dennoch stehen bleibt, sind Kennungen, die nur ZUSAMMENGESETZT
   * angesprochen werden — die Reiter der Rangliste etwa, deren Kennung
   * app.js aus `offener.id` liest. Der Hinweis ist deshalb eine Leseliste
   * für Menschen und keine Regel; er lässt diesen Lauf nie scheitern.
   */
  return new RegExp(`['"\`]${kennung.replace(/[-]/g, '\\-')}['"\`]`).test(allerQuelltext);
}

const unbenutzt = [...imMarkup].filter((k) => !kennungGebraucht(k)).sort();

/* ---------------------------------------------------------------- Bericht */

console.log(`index.html trägt ${imMarkup.size} Kennungen, `
  + `der Quelltext sucht ${gesucht.size} in ${quellen.size} Dateien.`);

if (fehlend.length) {
  console.log(`\n${fehlend.length} gesuchte Kennungen gibt es im Markup nicht:`);
  for (const k of fehlend) {
    console.log(`  #${k}   (gesucht in ${[...gesucht.get(k)].join(', ')})`);
  }
}

if (klassenOhneGrund.length) {
  console.log('\nHinweis: diese Klassen stehen in einem Wähler, werden aber');
  console.log('nirgends vergeben – der Wähler trifft nie etwas:');
  for (const k of klassenOhneGrund) {
    console.log(`  .${k}   (gesucht in ${[...gesuchteKlassen.get(k)].join(', ')})`);
  }
}

if (unbenutzt.length) {
  console.log(`\nHinweis: ${unbenutzt.length} Kennungen im Markup nennt niemand `
    + '(kein Skript, kein Attribut, kein Stilblatt):');
  for (const k of unbenutzt) console.log(`  #${k}`);
}

if (!fehlend.length) console.log('\njede gesuchte Kennung steht im Markup');
process.exit(fehlend.length ? 1 : 0);
