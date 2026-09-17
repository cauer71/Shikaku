/**
 * Shikaku – die Steuerung.
 *
 * Hier läuft zusammen, was die anderen Dateien für sich können: shikaku.js
 * kennt die Regeln, loeser.js den nächsten Schluss, erzeuger.js das nächste
 * Rätsel, brett.js das Bild und die Zeigerbedienung, i18n.js die Sätze,
 * online.js die Rangliste. Diese Datei kennt die REIHENFOLGE — was passiert,
 * wenn ein Finger aufsetzt, wann die Uhr läuft, was ein Sieg auslöst, wo
 * gespeichert wird.
 *
 * Zwei Dinge stehen bewusst NICHT hier:
 *
 *  - Kein Zeichnen von Flächen und Zellen. Das ist brett.js, und der Schnitt
 *    hält, weil diese Datei nie ein Kästchen anfasst: sie sagt "so sieht der
 *    Stand aus" und lässt zeichnen.
 *  - Keine Regelentscheidung. Ob ein Rechteck passt, sagt bewerteRechteck();
 *    ob die Partie fertig ist, sagt pruefeStand(). Eine zweite, hier
 *    nachgebaute Prüfung wäre eine zweite Wahrheit, und die beiden gehen
 *    beim ersten Umbau auseinander.
 *
 * Die Bedienung ist eine einzige Geste, und das ist die wichtigste
 * Entscheidung im ganzen Spiel: ZIEHEN setzt ein Rechteck, ANTIPPEN nimmt
 * eines weg. Kein Werkzeugumschalter, kein Radiergummi, kein langer Druck.
 * Der erste Entwurf hatte einen Löschmodus als sechsten Knopf in der Leiste;
 * im Bild zeigte sich sofort, warum das falsch ist — man tippt auf eine
 * Fläche, nichts passiert, und man sucht den Fehler beim Spiel statt beim
 * eigenen Modus. Ein Zug über genau eine Zelle, der auf ein bestehendes
 * Rechteck fällt, kann nur "weg damit" heißen: das Rechteck, das dort
 * entstehen würde, liegt schon da.
 */

import {
  STUFEN, normRechteck, enthaelt, ueberlappen, gleich, imBrett,
  bewerteRechteck, pruefeStand, pruefeRaetsel, kandidaten, zahlAn,
} from './shikaku.js';
import { naechsterZug } from './loeser.js';
import { erzeuge, AUSMASS } from './erzeuger.js';
import { SPRACHEN, erkenneSprache, t, anwenden } from './i18n.js';
import { welt } from './online.js';
import { baueBrett, zeichneTeile, zelleAus, verbindeZiehen } from './brett.js';

/** Die Fassung. tools/build-dist.mjs liest genau diese Zeile. */
export const VERSION = '1.0.0';

/* ========================================================================
   1. Speicher

   Vier Schlüssel, und jeder gehört genau einer Sache (der fünfte,
   sk.welt.v1, gehört online.js und wird hier nie angefasst). Ein einziger
   großer Eintrag wäre bequemer zu schreiben, aber dann hängt die laufende
   Partie am selben Datensatz wie die Einstellungen: ein halb geschriebener
   Spielstand nimmt die Sprache mit, und ein voller Speicher verliert beides
   auf einmal.
   ======================================================================== */

const SCHLUESSEL = {
  einst: 'sk.einst.v1',
  spiel: 'sk.spiel.v1',
  best: 'sk.best.v1',
  gesehen: 'sk.gesehen.v1',
};

/*
 * Jeder Zugriff im try. localStorage wirft in mehr Fällen, als man denkt:
 * im privaten Fenster von Safari, bei abgeschalteten Website-Daten, wenn die
 * Quote voll ist, und in einem iframe mit fremder Herkunft. Ein Spiel, das
 * beim Lesen einer Einstellung abstürzt, ist schlimmer als eines ohne
 * Einstellungen.
 */
const speicher = {
  lies(schluessel, ersatz = null) {
    try {
      const roh = localStorage.getItem(schluessel);
      return roh == null ? ersatz : JSON.parse(roh);
    } catch { return ersatz; }
  },
  schreib(schluessel, wert) {
    try { localStorage.setItem(schluessel, JSON.stringify(wert)); }
    catch { /* voller oder gesperrter Speicher: dann eben ohne */ }
  },
  liesRoh(schluessel, ersatz = null) {
    try { return localStorage.getItem(schluessel) ?? ersatz; } catch { return ersatz; }
  },
  schreibRoh(schluessel, wert) {
    try { localStorage.setItem(schluessel, wert); } catch { /* egal */ }
  },
};

/* ========================================================================
   2. Einstellungen
   ======================================================================== */

const STANDARD_EINST = {
  skin: 'apple',
  thema: 'auto',
  sprache: '',          // leer heißt: der Sprache des Geräts folgen
  kuerzel: '',
  welt: true,
  hilfslinien: true,
  vibration: true,
};

const SKINS = ['mondrian', 'papier', 'm3', 'm3plus', 'apple'];
const THEMEN = ['auto', 'hell', 'dunkel'];

/**
 * Die englischen Schreibweisen auf die deutschen abbilden.
 *
 * Der Startschnipsel im `<head>` nimmt beides an (`if (einst.thema === 'hell'
 * || einst.thema === 'dunkel')` steht dort neben `'light'`/`'dark'`) — er muss
 * das, weil `data-theme` selbst die englischen Namen trägt und weil er ohne
 * dieses Modul auskommen soll. Diese Datei kannte bis hierher nur die
 * deutschen. Ergebnis war ein Widerspruch, der genau einmal auffällt und dann
 * verwirrt: bei `{"thema":"dark"}` im Speicher setzte der Schnipsel das
 * Attribut, die Seite kam dunkel herauf — und `liesEinstellungen` verwarf den
 * unbekannten Wert, `zeigeDarstellung` nahm das Attribut wieder weg, und das
 * Bild sprang zurück auf hell. Gemessen an einem selbst gesetzten Eintrag,
 * nicht vermutet.
 *
 * Ein Spieler kommt an so einen Eintrag nicht von allein — die Oberfläche
 * schreibt nur `hell`/`dunkel`. Aber ein Wert, den die eine Hälfte des
 * Programms annimmt und die andere wegwirft, ist auch dann falsch, wenn es
 * heute niemanden trifft.
 */
function themaNormal(wert) {
  if (wert === 'light') return 'hell';
  if (wert === 'dark') return 'dunkel';
  return wert;
}

/**
 * Die Einstellungen aus dem Speicher, Feld für Feld geprüft.
 *
 * Der kurze Weg wäre `{ ...STANDARD_EINST, ...gelesen }`. Der localStorage
 * ist aber eine Grenze nach außen wie jede andere: dort steht, was eine
 * ältere Fassung geschrieben hat, was jemand in der Konsole eingetippt hat,
 * und im schlimmsten Fall eine Zeichenkette statt eines Objekts (die sich
 * dann als Buchstabenfelder in die Einstellungen streut). Geprüft wird auf
 * dem TYP und gegen die erlaubten Werte, nicht umgerechnet — `welt: "false"`
 * wäre sonst wahr, und der Schalter, der "kein einziger Netzruf" verspricht,
 * hätte genau das Gegenteil getan.
 */
function liesEinstellungen() {
  const roh = speicher.lies(SCHLUESSEL.einst);
  const gelesen = roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
  const flagge = (wert, standard) => (typeof wert === 'boolean' ? wert : standard);
  const thema = themaNormal(gelesen.thema);
  return {
    skin: SKINS.includes(gelesen.skin) ? gelesen.skin : STANDARD_EINST.skin,
    thema: THEMEN.includes(thema) ? thema : STANDARD_EINST.thema,
    // Eine unbekannte Sprache wird zu "" und heißt damit "dem Gerät folgen" –
    // nicht zu 'de'. Wer ein Spiel mit einer Einstellung aus der Zukunft
    // öffnet, soll seine eigene Sprache sehen und nicht meine.
    sprache: SPRACHEN.includes(gelesen.sprache) ? gelesen.sprache : '',
    kuerzel: sauberesKuerzel(gelesen.kuerzel),
    welt: flagge(gelesen.welt, STANDARD_EINST.welt),
    hilfslinien: flagge(gelesen.hilfslinien, STANDARD_EINST.hilfslinien),
    vibration: flagge(gelesen.vibration, STANDARD_EINST.vibration),
  };
}

const einst = liesEinstellungen();

function sichereEinst() {
  speicher.schreib(SCHLUESSEL.einst, einst);
}

/*
 * Der Weltschalter geht als erstes an online.js: "aus" heißt dort kein
 * einziger Netzruf, und diese Zusicherung soll auch für den allerersten Ruf
 * gelten, den irgendetwas hier auslöst.
 */
welt.schalten(einst.welt);

/* ========================================================================
   3. Sprache

   i18n.js nimmt die Sprache absichtlich als erstes Argument und hat kein
   verstecktes "aktuell" (der Grund steht dort). Der Preis ist ein Argument
   an jeder Aufrufstelle, und den zahlt diese eine Zeile.
   ======================================================================== */

function spracheJetzt() {
  if (SPRACHEN.includes(einst.sprache)) return einst.sprache;
  const geraet = typeof navigator === 'undefined' ? []
    : (navigator.languages ?? [navigator.language]);
  return erkenneSprache(geraet);
}

/** Ein Satz in der eingestellten Sprache. */
function satz(schluessel, werte) {
  return t(spracheJetzt(), schluessel, werte);
}

/* ========================================================================
   4. Die Elemente aus index.html

   Alle auf einmal und beim Laden: das Modul läuft am Ende des Körpers, das
   Dokument steht also vollständig. Ein fehlendes Element ist damit sofort
   als undefined zu sehen und nicht erst beim ersten Klick.
   ======================================================================== */

const $ = (kennung) => document.getElementById(kennung);

const elWurzel = document.documentElement;
const elBrett = $('brett');
const elVorschau = $('vorschau');
const elTeile = $('teile');
const elSagt = $('brett-sagt');
const elHinweis = $('hinweis');

const elZeit = $('wert-zeit');
const elOffen = $('wert-offen');
const elStufe = $('wert-stufe');
const elNotizZeit = $('notiz-zeit');
const elNotizOffen = $('notiz-offen');
const elNotizStufe = $('notiz-stufe');
const elKarteStufe = $('karte-stufe');

const btnZurueck = $('btn-zurueck');
const btnVor = $('btn-vor');
const btnTipp = $('btn-tipp');
const btnLeeren = $('btn-leeren');
const btnNeu = $('btn-neu');

const dlgRegeln = $('dlg-regeln');
const dlgEinst = $('dlg-einstellungen');
const dlgEnde = $('dlg-ende');
const dlgRang = $('dlg-rangliste');
const dlgNeu = $('dlg-neu');
const ALLE_DIALOGE = [dlgRegeln, dlgEinst, dlgEnde, dlgRang, dlgNeu];

const elEndeZeit = $('ende-zeit');
const elEndeText = $('ende-text');
const elEndeRang = $('ende-rang');
const elEndeKuerzel = $('ende-kuerzel');

const elRangReiter = $('rang-reiter');
const elRangListe = $('rang-liste');
const elRangWelt = $('rang-welt');

const elFeldKuerzel = $('feld-kuerzel');
const elNeuLaeuft = $('neu-laeuft');

const wenigerBewegung = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ========================================================================
   5. Der Zustand

   Ein einziges Objekt für die laufende Partie, daneben nur noch, was das
   BILD betrifft (Zugstapel, laufende Auswahl, Zellcursor, offener Reiter der
   Rangliste). Verworfen wurde eine Klasse mit Methoden: hier gibt es genau
   eine Partie, und ein `this` in jeder Zeile hätte nichts erklärt, was der
   Name nicht schon sagt.
   ======================================================================== */

let partie = null;
/*
 * partie = {
 *   raetsel,      das Rätsel (reine Daten, ohne Lösung)
 *   rechtecke,    was der Spieler gelegt hat
 *   sekunden,     verbrauchte Zeit, mit Nachkomma (siehe Uhr)
 *   fehler,       wie oft ein nicht passendes Rechteck gesetzt wurde
 *   tipps,        wie oft der Tipp-Knopf geholfen hat
 *   wann,         Beginn der Partie (Date.now), nur zur Buchführung
 *   gemeldet,     ist diese Partie schon weltweit gezählt worden?
 *   fertig,       ist der Endedialog für diesen Stand schon gelaufen?
 *   ende,         die Zahlen für den Endedialog (erst nach dem Sieg da)
 * }
 */

/** Der Zugstapel: Schnappschüsse, kein Protokoll. Warum, steht bei merke(). */
let stapel = [[]];
let zeiger = 0;

/**
 * Die laufende Auswahl (Finger oder Tastatur) oder null: {von, bis} in
 * Zellen. Beide Bedienarten benutzen dasselbe Feld — ein Rechteck, das mit
 * der Tastatur aufgespannt wird, ist genau dasselbe wie eines unter dem
 * Finger, und zwei Zustände dafür würden garantiert auseinanderlaufen.
 */
let auswahl = null;

/** Der Zellcursor für die Tastatur, und ob er zu sehen ist. */
let cursor = { x: 0, y: 0 };
let cursorSichtbar = false;

/** Welche Stufe steht in der Rangliste offen? */
let rangStufe = 'mittel';

/* ========================================================================
   6. Kleine Helfer
   ======================================================================== */

/** Sekunden als m:ss. Über eine Stunde wird h:mm:ss – dann ist es soweit. */
function zeitText(sekunden) {
  const ganz = Math.max(0, Math.floor(sekunden || 0));
  const s = ganz % 60;
  const m = Math.floor(ganz / 60) % 60;
  const h = Math.floor(ganz / 3600);
  const zwei = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${zwei(m)}:${zwei(s)}` : `${m}:${zwei(s)}`;
}

/** Ein Rechteck kopieren. Flach genügt: vier Zahlen, keine Verschachtelung. */
const kopie = (r) => ({ x: r.x, y: r.y, b: r.b, h: r.h });

/** Ist das ein brauchbares Rechteck für dieses Brett? */
function brauchbar(r, raetsel) {
  return !!r && Number.isInteger(r.x) && Number.isInteger(r.y)
    && Number.isInteger(r.b) && Number.isInteger(r.h)
    && imBrett(r, raetsel.breite, raetsel.hoehe);
}

/** Drei Zeichen, A-Z und 0-9. Gefiltert wird beim Lesen UND beim Schreiben. */
function sauberesKuerzel(roh) {
  return String(roh ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

/**
 * Die Meldungszeile über dem Brett.
 *
 * Sie wird erst versteckt und dann wieder gezeigt, damit die Einblendung
 * auch bei zwei Meldungen hintereinander läuft: eine Animation startet nur,
 * wenn das Element neu ins Bild kommt, und ein bloßer Textwechsel ist für den
 * Browser dasselbe Element.
 */
let hinweisUhr = null;
function hinweis(text, dauer = 2600) {
  if (!elHinweis || !text) return;
  elHinweis.hidden = true;
  elHinweis.textContent = text;
  // Ein erzwungener Zwischenschritt im Layout, damit das Verstecken wirklich
  // gilt, bevor wieder gezeigt wird.
  void elHinweis.offsetWidth;
  elHinweis.hidden = false;
  clearTimeout(hinweisUhr);
  hinweisUhr = setTimeout(() => { elHinweis.hidden = true; }, dauer);
}

/**
 * Der Vorlesebereich unter dem Brett.
 *
 * Getrennt von hinweis(): die Meldungszeile ist für alle da und verschwindet
 * nach zwei Sekunden, dieser Text ist für die Vorlesehilfe und darf länger
 * und genauer sein ("Spalte 3, Zeile 2, Teil des Rechtecks mit der Zahl 6").
 * Beides in einem Element wäre entweder für das Auge zu lang oder für das
 * Ohr zu knapp.
 */
function sagt(text) {
  if (elSagt && text) elSagt.textContent = text;
}

/** Kurz zittern – nur wenn eingeschaltet und wenn das Gerät es kann. */
function zittern(muster) {
  if (!einst.vibration) return;
  try { navigator.vibrate?.(muster); } catch { /* nicht unterstützt */ }
}

/** Ein Bild abwarten, damit ein gesetzter Text wirklich erscheint. */
function naechstesBild() {
  return new Promise((weiter) => {
    requestAnimationFrame(() => setTimeout(weiter, 0));
  });
}

/* ========================================================================
   7. Darstellung: Skin, Farbschema, Sprache
   ======================================================================== */

/**
 * Setzt Skin und Farbschema – genau so, wie es der Schnipsel im Kopf von
 * index.html beim Start tut.
 *
 * Umgeschaltet wird über `disabled` an den <link>-Elementen und nicht über
 * href: ein neues href lädt die Datei nach, und beim Umschalten stände das
 * Brett für ein paar Bilder ohne Stil da. Die vier Stilblätter liegen alle
 * schon im Speicher, `disabled` kostet nur einen neuen Stilabgleich.
 */
function zeigeDarstellung() {
  const skin = SKINS.includes(einst.skin) ? einst.skin : 'apple';
  elWurzel.dataset.skin = skin;

  const schalte = (kennung, an) => {
    const el = $(kennung);
    if (el) el.disabled = !an;
  };
  schalte('css-mondrian', skin === 'mondrian');
  schalte('css-papier', skin === 'papier');
  schalte('css-m3', skin === 'm3');
  schalte('css-m3plus', skin === 'm3plus');
  schalte('css-apple', skin === 'apple');
  // m3-farben.css liefert die Rollenfarben für beide Material-Skins.
  schalte('css-m3-farben', skin === 'm3' || skin === 'm3plus');

  // "auto" setzt gar kein Attribut und folgt damit prefers-color-scheme; nur
  // eine bewusste Wahl schreibt data-theme und gewinnt dann in beide
  // Richtungen. Die Werte heißen im CSS "light"/"dark", in den Einstellungen
  // "hell"/"dunkel" – die Umschrift liegt hier, weil sie an der Grenze zum
  // Stilblatt gehört und nicht in den gespeicherten Daten.
  if (einst.thema === 'hell') elWurzel.dataset.theme = 'light';
  else if (einst.thema === 'dunkel') elWurzel.dataset.theme = 'dark';
  else delete elWurzel.dataset.theme;

  elWurzel.dataset.hilfslinien = einst.hilfslinien ? 'an' : 'aus';
  farbeDerLeiste();
}

/**
 * Die Farbe der Browserleiste folgt dem tatsächlichen Grund der Seite.
 *
 * Zwei Bilder Verzögerung, weil direkt nach dem Umschalten das neue
 * Stilblatt noch nicht angewandt ist und der Hintergrund durchsichtig
 * zurückkäme – dann stände in der Statusleiste des Telefons schwarz, wo
 * weiß gemeint war.
 *
 * Beschrieben wird die Marke, deren `media` gerade GILT. index.html bringt
 * zwei mit (eine für hell, eine für dunkel), und `querySelector` hätte immer
 * die erste genommen: im dunklen Schema wäre der geschriebene Wert damit
 * wirkungslos gewesen, weil der Browser die zweite liest. Die Startwerte
 * dort passen zum Standard-Stil; sobald ein anderer Stil eingeschaltet ist,
 * stimmt nur noch der wirklich gemessene Grund.
 */
function farbeDerLeiste() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const marken = [...document.querySelectorAll('meta[name="theme-color"]')];
    const marke = marken.find((m) => !m.media || window.matchMedia(m.media).matches)
      ?? marken[0];
    const grund = getComputedStyle(document.body).backgroundColor;
    if (marke && grund && !/rgba\(0, 0, 0, 0\)|transparent/.test(grund)) {
      marke.setAttribute('content', grund);
    }
  }));
}

/**
 * Schreibt alle Texte neu – ohne Neuladen.
 *
 * `anwenden` läuft über die ganze Seite; der Wert {fassung} gilt dabei für
 * alle Stellen und wird nur von einer gebraucht (einst.fassung). Die anderen
 * Platzhalter bleiben unberührt stehen, weil i18n.js einen Platzhalter ohne
 * Wert absichtlich nicht ersetzt.
 *
 * Die Stufe im Kärtchen ist der eine Text, der nicht fest im Markup stehen
 * kann: dort steht `data-i18n="stufe.mittel"`, und ein Sprachwechsel würde
 * "Mittel" schreiben, auch wenn gerade 'experte' läuft. Also wird der
 * Schlüssel am Element mitgeführt – dann stimmt er bei jedem Lauf von
 * `anwenden` von selbst, und niemand muss daran denken.
 */
function zeigeTexte() {
  const sprache = spracheJetzt();
  elWurzel.lang = sprache;

  if (partie && elStufe) elStufe.dataset.i18n = `stufe.${partie.raetsel.stufe}`;
  anwenden(document, sprache, { fassung: VERSION });

  document.title = `${satz('app.titel')} – ${satz('app.untertitel')}`;
  const beschreibung = document.querySelector('meta[name="description"]');
  if (beschreibung) beschreibung.setAttribute('content', satz('app.beschreibung'));

  // Das Manifest gibt es je Sprache. Umgehängt wird es auch hier und nicht
  // nur im Kopf-Schnipsel: wer die Sprache umstellt und danach installiert,
  // soll die App in der Sprache bekommen, die er gerade gewählt hat.
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = `manifest.${sprache}.webmanifest`;

  zeichneKarten();
  zeichneRangliste();
}

/* ========================================================================
   8. Die Uhr

   Die Zeit kommt aus Date.now()-Differenzen, das Intervall zeichnet nur.
   `setInterval` als Zeitquelle wäre eine Zeile kürzer und geht schief: der
   Browser drosselt Intervalle im Hintergrund auf einen Schlag pro Minute,
   und dann fehlen einer Partie, die zwischendurch im zweiten Reiter lag,
   Minuten. Umgekehrt läuft ein Intervall auf einem beschäftigten Gerät
   nach, und dann zählte die Uhr zu langsam.

   Angehalten wird an drei Stellen, und alle drei sind derselbe Gedanke:
   gezählt wird nur Zeit, in der man wirklich spielen KANN. Versteckter Tab,
   offener Dialog, noch kein erster Zug.
   ======================================================================== */

let uhrLaeuft = false;   // soll die Zeit überhaupt zählen (erster Zug getan)?
let uhrSeit = null;      // Date.now() beim letzten Nachtragen, null = pausiert
let uhrId = null;

function dialogOffen() {
  return ALLE_DIALOGE.some((d) => d && d.open);
}

function uhrNachtragen() {
  if (uhrSeit === null || !partie) return;
  const jetzt = Date.now();
  partie.sekunden += (jetzt - uhrSeit) / 1000;
  uhrSeit = jetzt;
  zeichneZeit();
}

/**
 * Der einzige Ort, an dem die Uhr an- und ausgeht. Alles andere ruft nur
 * diese Funktion und muss die drei Bedingungen nicht kennen — das ist der
 * Unterschied zwischen "die Uhr hält im Dialog" und "die Uhr hält in vier
 * von fünf Dialogen, weil einer beim Nachbessern vergessen wurde".
 */
function uhrPruefen() {
  const soll = !!partie && uhrLaeuft && !document.hidden && !dialogOffen();
  if (soll && uhrSeit === null) {
    uhrSeit = Date.now();
    uhrId = setInterval(uhrNachtragen, 250);
  } else if (!soll && uhrSeit !== null) {
    uhrNachtragen();          // die letzte Teilsekunde nicht verlieren
    clearInterval(uhrId);
    uhrId = null;
    uhrSeit = null;
  }
}

/** Die Uhr beginnt mit dem ersten Zug, nicht mit dem Aufschlagen der Seite. */
function uhrAnstossen() {
  if (uhrLaeuft || !partie || partie.fertig) return;
  uhrLaeuft = true;
  uhrPruefen();
}

function uhrAnhalten() {
  uhrLaeuft = false;
  uhrPruefen();
}

document.addEventListener('visibilitychange', () => {
  uhrPruefen();
  // Wer die App wegwischt, kommt vielleicht nie wieder – jetzt sichern und
  // nicht erst nach den 400 ms der Entprellung.
  if (document.hidden) sichereJetzt();
});

/* ========================================================================
   9. Zeichnen
   ======================================================================== */

function zeichneZeit() {
  if (elZeit) elZeit.textContent = zeitText(partie ? partie.sekunden : 0);
}

/**
 * Die drei Kärtchen über dem Brett.
 *
 * In der Notizzeile der Zeit steht der WELTREKORD der Stufe und nicht die
 * eigene Bestzeit. Zwei Gründe: die eigene Bestzeit hat keinen Schlüssel im
 * Wörterbuch und wäre ohne Beschriftung eine Zahl ohne Aussage, und der
 * Weltrekord ist das, was während des Spielens interessiert — man will
 * wissen, worauf man zielt. Die eigene Bestzeit steht im Endedialog, wo sie
 * hingehört.
 */
function zeichneKarten() {
  if (!partie) return null;
  const stand = pruefeStand(partie.raetsel, partie.rechtecke);
  zeichneZeit();
  if (elOffen) elOffen.textContent = String(stand.offen);
  const stufenName = satz(`stufe.${partie.raetsel.stufe}`);
  if (elStufe) elStufe.textContent = stufenName;
  // Der Name des Stufen-Knopfes nennt die Stufe mit. Warum das hier steht und
  // nicht als data-i18n-aria im Markup, steht in index.html am Kärtchen.
  if (elKarteStufe) {
    elKarteStufe.setAttribute('aria-label', satz('a11y.karteStufe', { stufe: stufenName }));
  }
  if (elNotizStufe) {
    elNotizStufe.textContent = `${partie.raetsel.breite} × ${partie.raetsel.hoehe}`;
  }
  if (elNotizZeit) {
    const rekord = welt.zwischenstand().rekorde?.[partie.raetsel.stufe];
    elNotizZeit.textContent = rekord && typeof rekord.sekunden === 'number'
      ? satz('rang.weltrekord', {
        zeit: zeitText(rekord.sekunden),
        kuerzel: sauberesKuerzel(rekord.kuerzel) || '–',
      })
      : '';
  }
  // Die Notizzeile der offenen Kästchen bleibt leer. Sie steht trotzdem im
  // Markup, weil sonst die drei Kärtchen verschieden hoch wären und die
  // Werte auf verschiedener Höhe ständen (siehe .karte__notiz in basis.css).
  if (elNotizOffen) elNotizOffen.textContent = '';
  return stand;
}

/**
 * Die Werkzeugleiste.
 *
 * Nach dem Sieg sind ALLE vier aus, nicht nur der Tipp.
 *
 * Das war ein echter Bruch und keine Feinheit: Antippen und Tipp fragten
 * schon immer `partie.fertig` ab, Zurück, Vor, Leeren und die Entf-Taste
 * nicht. Wer nach dem Endedialog auf Zurück drückte, nahm damit das letzte
 * Rechteck wieder weg — das Brett war nicht mehr gelöst, die Uhr lief aber
 * nie wieder an (uhrAnstossen() steigt bei `fertig` aus) und der Tipp blieb
 * gesperrt. Ein Zustand, aus dem nur "Neu" herausführt, und nichts im Bild
 * sagte, warum. Eine gelöste Partie ist fertig; wer weiterspielen will,
 * bekommt ein neues Rätsel.
 */
function zeichneWerkzeuge() {
  const laeuft = !!partie && !partie.fertig;
  if (btnZurueck) btnZurueck.disabled = !laeuft || zeiger <= 0;
  if (btnVor) btnVor.disabled = !laeuft || zeiger >= stapel.length - 1;
  if (btnTipp) btnTipp.disabled = !laeuft;
  if (btnLeeren) btnLeeren.disabled = !laeuft || partie.rechtecke.length === 0;
}

/**
 * Die Vorschau: das Rechteck, das gerade entsteht — und der Zellcursor der
 * Tastatur.
 *
 * Beides in EINEM Element, und das ist eine bewusste Verkürzung. Ein eigener
 * Cursor bräuchte eine eigene Klasse in basis.css, und diese Datei darf das
 * Stilblatt nicht anfassen (es gehört einer anderen Datei). #vorschau ist
 * dafür genau das Richtige: ein Kästchen mit deutlichem Rand, das über allem
 * liegt. Ein 1×1-Rechteck an der Cursorstelle IST der Cursor.
 *
 * Das Urteil kommt aus bewerteRechteck() und damit aus derselben Funktion,
 * die hinterher über das gesetzte Rechteck entscheidet. Eine eigene Rechnung
 * hier ("Fläche == Zahl") wäre kürzer und würde beim Ziehen über zwei Zahlen
 * grün zeigen, wo das gesetzte Rechteck rot wird.
 */
function zeichneVorschau() {
  if (!elVorschau) return;
  let r = null;
  let urteil = null;
  if (auswahl && partie) {
    r = normRechteck(auswahl.von.x, auswahl.von.y, auswahl.bis.x, auswahl.bis.y);
    urteil = bewerteRechteck(partie.raetsel, r);
  } else if (cursorSichtbar && partie) {
    r = { x: cursor.x, y: cursor.y, b: 1, h: 1 };
  }
  if (!r) {
    elVorschau.hidden = true;
    return;
  }
  elVorschau.style.setProperty('--x', String(r.x));
  elVorschau.style.setProperty('--y', String(r.y));
  elVorschau.style.setProperty('--b', String(r.b));
  elVorschau.style.setProperty('--h', String(r.h));
  elVorschau.className = urteil === null ? 'vorschau'
    : (urteil === 'gut' ? 'vorschau vorschau--gut' : 'vorschau vorschau--fehler');
  elVorschau.hidden = false;
}

/**
 * Alles neu: Flächen, Kärtchen, Werkzeuge, Vorschau.
 *
 * Hervorgehoben wird das Rechteck unter dem Zellcursor, solange der Cursor zu
 * sehen ist. Das ist nicht Zierde: bei Tastaturbedienung ist es die einzige
 * Auskunft darüber, was die Entf-Taste treffen würde.
 */
function zeichne() {
  if (!partie) return null;
  const stand = zeichneKarten();
  const gewaehlt = cursorSichtbar ? teilAn(cursor.x, cursor.y) : -1;
  zeichneTeile(partie.raetsel, partie.rechtecke, stand.urteile, gewaehlt);
  zeichneWerkzeuge();
  zeichneVorschau();
  return stand;
}

/** Das DOM-Element einer Fläche, für die flüchtigen Zustände (neu, tipp). */
function holeTeil(i) {
  return elTeile ? elTeile.querySelector(`.teil[data-i="${i}"]`) : null;
}

/* ========================================================================
   10. Der Zugstapel

   Gespeichert werden SCHNAPPSCHÜSSE der Rechteckliste und keine Züge.

   Das ist die teurere Lösung und die richtige. Ein Protokoll aus Zügen
   ("setze dieses Rechteck", "lösche jenes") muss jeden Zug umkehren können,
   und der Zug "setze ein Rechteck" ist im Shikaku nicht einfach umkehrbar:
   er entfernt alle Rechtecke, die er schneidet, und das können vier sein.
   Die Umkehrung müsste die vier mitschleppen — dann ist der Protokolleintrag
   aber schon fast ein Schnappschuss, nur mit mehr Code drumherum. Beim
   Leeren wäre er es ganz.

   Der Preis: bei 29 Rechtecken sind das 29 mal vier Zahlen je Zug, bei 200
   Zügen also rund 23.000 Zahlen. Auf einem Telefon ist das nichts.
   ======================================================================== */

const STAPEL_MAX = 300;

function merke() {
  // Alles nach dem Zeiger fällt weg: wer nach einem Zurück wieder etwas
  // setzt, hat einen neuen Ast begonnen, und der alte ist nicht mehr
  // erreichbar. Ein Baum statt einer Linie wäre denkbar und für ein
  // Rätselspiel nicht zu bedienen.
  stapel.length = zeiger + 1;
  stapel.push(partie.rechtecke.map(kopie));
  if (stapel.length > STAPEL_MAX) stapel.shift();
  zeiger = stapel.length - 1;
}

function stapelZuruecksetzen(rechtecke) {
  stapel = [rechtecke.map(kopie)];
  zeiger = 0;
}

/**
 * Kann am Brett überhaupt noch etwas geändert werden?
 *
 * Die eine Stelle, die alle Zugwege abfragen — Antippen, Tastatur, Zurück,
 * Vor, Leeren, Tipp. Vorher stand `!partie || partie.fertig` in der Hälfte
 * davon und in der anderen Hälfte nicht, und genau in der anderen Hälfte
 * ließ sich eine gelöste Partie wieder aufbrechen (siehe zeichneWerkzeuge).
 */
function spielbar() {
  return !!partie && !partie.fertig;
}

function zurueck() {
  if (!spielbar()) return;
  if (zeiger <= 0) {
    hinweis(satz('hinweis.nichtsRueckgaengig'));
    return;
  }
  zeiger -= 1;
  partie.rechtecke = stapel[zeiger].map(kopie);
  nachDemZug({ melden: false });
}

function vor() {
  if (!spielbar() || zeiger >= stapel.length - 1) return;
  zeiger += 1;
  partie.rechtecke = stapel[zeiger].map(kopie);
  nachDemZug({ melden: false });
}

/* ========================================================================
   11. Züge
   ======================================================================== */

/**
 * Welches Rechteck deckt diese Zelle? -> Index oder -1.
 *
 * Von hinten gesucht: liegen wider Erwarten zwei übereinander (ein von Hand
 * verbogener Spielstand), gewinnt das später gelegte. Das ist auch im Bild
 * das obere – ein Antippen nimmt dann das weg, das man sieht.
 */
function teilAn(x, y) {
  for (let i = partie.rechtecke.length - 1; i >= 0; i--) {
    if (enthaelt(partie.rechtecke[i], x, y)) return i;
  }
  return -1;
}

/** Index eines deckungsgleichen Rechtecks im Spielstand, oder -1. */
function findeTeil(r) {
  return partie.rechtecke.findIndex((vorhanden) => gleich(vorhanden, r));
}

/**
 * Nach jedem Zug: zeichnen, sichern, auf Sieg prüfen.
 *
 * `melden` sagt, ob der neue Deckungsstand vorgelesen werden soll. Beim
 * SETZEN ja — das ist die Auskunft, die ein Spieler ohne Bild braucht, um zu
 * wissen, wie weit er ist. Beim Wegnehmen, Leeren, Zurück und Vor nicht: dort
 * sagt die Meldungszeile schon, was passiert ist (sie ist ein aria-live
 * Bereich), und zwei Ansagen zu einem Tastendruck sind eine zu viel.
 */
function nachDemZug({ melden = true } = {}) {
  const stand = zeichne();
  if (!stand) return;
  sichere();
  if (melden) {
    const gedeckt = partie.raetsel.breite * partie.raetsel.hoehe - stand.offen;
    sagt(satz('a11y.gedeckt', { wert: gedeckt, offen: stand.offen }));
  }
  if (stand.fertig) gewonnen();
}

/**
 * Ein Rechteck setzen.
 *
 * Was es schneidet, wird ERSETZT und nicht daneben gelegt. Der Vertrag sagt
 * das so, und im Bild ist es die einzige Möglichkeit: zwei übereinander
 * liegende Flächen sind nicht zu unterscheiden, der Spieler sieht die obere
 * und wundert sich, warum das Brett nicht aufgeht. Verworfen war auch
 * "verweigern, wenn es überlappt" — dann müsste man vor jeder Korrektur erst
 * aufräumen, und Korrigieren ist im Shikaku der Normalfall.
 */
function setzeRechteck(r) {
  if (!spielbar() || !brauchbar(r, partie.raetsel)) return false;

  partie.rechtecke = partie.rechtecke.filter((alt) => !ueberlappen(alt, r));
  partie.rechtecke.push(kopie(r));
  merke();

  const urteil = bewerteRechteck(partie.raetsel, r);
  if (urteil !== 'gut') partie.fehler += 1;

  uhrAnstossen();
  nachDemZug();

  // Die frisch gesetzte Fläche wächst kurz auf – das ist die einzige
  // Rückmeldung, die immer da ist (ein Ton wäre auf dem Telefon meist stumm,
  // die Vibration ist abschaltbar). Die Klasse wird NACH dem Zeichnen
  // gesetzt, weil zeichneTeile() die Klassen vollständig neu schreibt. Das
  // neue Rechteck steht immer am Ende der Liste – es wurde eben angehängt.
  if (!wenigerBewegung.matches) {
    const el = holeTeil(partie.rechtecke.length - 1);
    if (el) {
      el.classList.remove('teil--neu');
      void el.offsetWidth;
      el.classList.add('teil--neu');
    }
  }
  zittern(12);

  // Nur 'zuKlein' bekommt einen Satz. Die anderen Fehlurteile sieht man am
  // Rechteck selbst: 'keineZahl' und 'mehrereZahlen' sind offensichtlich,
  // sobald die Fläche rot daliegt, und 'zuGross' ebenso. Ein zu KLEINES
  // Rechteck sieht dagegen aus wie ein richtiges – man hat die Zahl gelesen
  // und um eins zu kurz gezogen –, und genau da hilft der Satz.
  if (urteil === 'zuKlein') {
    const drin = eineZahlIn(r);
    if (drin >= 0) {
      hinweis(satz('hinweis.zuKlein', { wert: partie.raetsel.zahlen[drin].wert }));
    }
  }
  return true;
}

/** Der Index der einen Zahl im Rechteck, oder -1. */
function eineZahlIn(r) {
  let gefunden = -1;
  for (let i = 0; i < partie.raetsel.zahlen.length; i++) {
    const z = partie.raetsel.zahlen[i];
    if (!enthaelt(r, z.x, z.y)) continue;
    if (gefunden >= 0) return -1;
    gefunden = i;
  }
  return gefunden;
}

/** Ein Rechteck wegnehmen. */
function loescheTeil(i) {
  if (!spielbar() || i < 0 || i >= partie.rechtecke.length) return false;
  partie.rechtecke.splice(i, 1);
  merke();
  uhrAnstossen();
  nachDemZug({ melden: false });
  hinweis(satz('hinweis.rechteckWeg'));
  zittern(8);
  return true;
}

function leeren() {
  if (!spielbar() || partie.rechtecke.length === 0) return;
  partie.rechtecke = [];
  merke();
  nachDemZug({ melden: false });
  hinweis(satz('hinweis.geleert'));
}

/**
 * Ein Antippen: nimm weg, was hier liegt — und wenn nichts liegt, setze das
 * kleinste Rechteck, das es gibt.
 *
 * Der zweite Teil ist keine Zugabe, sondern für die Einsen nötig: eine 1 ist
 * immer nur ihr eigenes Kästchen, und dafür ein Rechteck von einer Zelle zu
 * derselben Zelle zu ziehen ist auf dem Telefon eine Fingerübung. Antippen
 * setzt es.
 */
function antippen(zelle) {
  if (!spielbar()) return;
  const i = teilAn(zelle.x, zelle.y);
  if (i >= 0) loescheTeil(i);
  else setzeRechteck({ x: zelle.x, y: zelle.y, b: 1, h: 1 });
}

/* ========================================================================
   12. Zeigerbedienung

   Die vier Rückrufe von brett.js. Mehr passiert hier nicht — die Rechnung
   von Bildschirmpunkt auf Zelle, der Zeigerfang und die Unterscheidung
   zwischen Ziehen und Antippen liegen dort.
   ======================================================================== */

verbindeZiehen({
  beginn(zelle) {
    if (!partie || partie.fertig) return;
    auswahl = { von: zelle, bis: zelle };
    /*
     * Der Zellcursor der Tastatur folgt dem Finger, bleibt aber unsichtbar.
     * Wer nach einem Zug zur Tastatur greift, findet ihn dort, wo er
     * hingesehen hat, und nicht in der linken oberen Ecke — und wer nur mit
     * dem Finger spielt, bekommt kein zweites Kästchen ins Bild gemalt, das
     * er nicht bedient.
     */
    cursor = { x: zelle.x, y: zelle.y };
    zeichneVorschau();
  },
  zug(zelle) {
    if (!auswahl) return;
    auswahl.bis = zelle;
    cursor = { x: zelle.x, y: zelle.y };
    zeichneVorschau();
  },
  ende(zelle) {
    if (!auswahl) return;
    const r = normRechteck(auswahl.von.x, auswahl.von.y, zelle.x, zelle.y);
    auswahl = null;
    setzeRechteck(r);
    zeichneVorschau();
  },
  tipp(zelle) {
    auswahl = null;
    antippen(zelle);
    zeichneVorschau();
  },
  abbruch() {
    auswahl = null;
    zeichneVorschau();
  },
});

/* ========================================================================
   13. Tipp

   Der Tipp ist kein Verrat: er setzt ein Rechteck, das schon zwingend ist,
   und sagt dazu, WORAN man das sieht. Der Grund kommt als i18n-Schlüssel aus
   loeser.js, die Zahlen für den Satz stellt diese Datei bereit.
   ======================================================================== */

/**
 * Welche freie Zelle trägt den Schluss "nur dieses Rechteck kann sie decken"?
 *
 * Gebraucht für den Satz zu 'einzigeDeckung', der eine Zelle in Spalte und
 * Zeile nennt. loeser.js gibt sie nicht mit — und einfach die linke obere
 * Ecke des Rechtecks zu nennen wäre eine BEHAUPTUNG, die falsch sein kann:
 * für diese Ecke gibt es womöglich mehrere Kandidaten, und der Spieler, der
 * nachrechnet, findet einen zweiten und hält den Tipp für kaputt. Also wird
 * die Zelle hier gesucht, mit derselben Rechnung, die der Löser benutzt.
 *
 * -> {x, y} (1-basiert, wie ein Mensch zählt) oder null.
 */
function deckungsZelle(raetsel, gesetzt, rechteck) {
  const offeneZahlen = [];
  for (let i = 0; i < raetsel.zahlen.length; i++) {
    const z = raetsel.zahlen[i];
    // Eine Zahl gilt als versorgt, wenn ihre eigene Zelle schon gedeckt ist.
    if (!gesetzt.some((r) => enthaelt(r, z.x, z.y))) offeneZahlen.push(i);
  }
  const moeglich = [];
  for (const i of offeneZahlen) {
    for (const k of kandidaten(raetsel, i)) {
      if (!gesetzt.some((r) => ueberlappen(r, k))) moeglich.push(k);
    }
  }
  for (let y = rechteck.y; y < rechteck.y + rechteck.h; y++) {
    for (let x = rechteck.x; x < rechteck.x + rechteck.b; x++) {
      if (gesetzt.some((r) => enthaelt(r, x, y))) continue;
      let treffer = 0;
      for (const k of moeglich) {
        if (enthaelt(k, x, y)) treffer += 1;
        if (treffer > 1) break;
      }
      if (treffer === 1) return { x: x + 1, y: y + 1 };
    }
  }
  return null;
}

/** Eine Fläche kurz als Tipp blinken lassen. */
function blinke(i) {
  const el = holeTeil(i);
  if (!el) return;
  el.classList.add('teil--tipp');
  // Die Klasse bleibt, bis die Animation aus ist (1,1 s dreimal), und wird
  // dann weggenommen: sonst bliebe der gestrichelte Ring bis zum nächsten
  // Zeichnen stehen und sähe wie eine Auswahl aus.
  setTimeout(() => el.classList.remove('teil--tipp'), 3500);
}

function tippen() {
  if (!spielbar()) return;
  const gefunden = naechsterZug(partie.raetsel, partie.rechtecke);
  if (!gefunden) {
    hinweis(satz('tipp.keiner'));
    return;
  }

  // Ein Tipp ist keine Schande, aber er wird gezählt – vor allem anderen,
  // damit er auch dann in der Rangliste steht, wenn der Spieler danach
  // sofort gewinnt.
  partie.tipps += 1;
  uhrAnstossen();

  const werte = { wert: gefunden.wert };

  if (gefunden.technik === 'raeumeAuf') {
    // Hier wird NICHTS gesetzt: es liegt schon etwas Falsches, und ein
    // weiteres Rechteck obendrauf würde den Fehler festschreiben. Gezeigt
    // wird das schuldige Rechteck.
    const i = findeTeil(gefunden.rechteck);
    zeichne();
    if (i >= 0) blinke(i);
    // Nur die Meldungszeile, nicht zusätzlich sagt(): #hinweis ist selbst
    // ein aria-live-Bereich (role="status"), der Satz wird also schon
    // vorgelesen. Beides zu setzen hieß, ihn zweimal zu hören – genau das,
    // was nachDemZug() an anderer Stelle ausdrücklich vermeidet.
    hinweis(satz(gefunden.grund, werte), 4000);
    return;
  }

  if (gefunden.technik === 'einzigeDeckung') {
    const zelle = deckungsZelle(partie.raetsel, partie.rechtecke, gefunden.rechteck);
    if (zelle) {
      werte.x = zelle.x;
      werte.y = zelle.y;
    } else {
      // Findet sich die tragende Zelle nicht (kann bei einem verbogenen
      // Spielstand passieren), bleiben {x} und {y} im Satz stehen. Das sieht
      // nach Fehler aus – und ist besser als eine erfundene Zelle.
      werte.x = gefunden.rechteck.x + 1;
      werte.y = gefunden.rechteck.y + 1;
    }
  }

  setzeRechteck(gefunden.rechteck);
  const i = findeTeil(gefunden.rechteck);
  if (i >= 0) blinke(i);
  // Länger stehen lassen als eine gewöhnliche Meldung: das ist ein Satz, den
  // man lesen und dann am Brett nachvollziehen soll, und nicht bloß eine
  // Bestätigung.
  hinweis(satz(gefunden.grund, werte), 4500);
}

/* ========================================================================
   14. Gewonnen
   ======================================================================== */

/** Die eigenen Bestzeiten je Stufe. */
function eigeneBest() {
  const roh = speicher.lies(SCHLUESSEL.best) ?? {};
  return roh && typeof roh === 'object' ? roh : {};
}

/**
 * Das Ende einer Partie.
 *
 * Die Sperre über `partie.fertig` ist nötig, weil hier mehrere Wege
 * zusammenlaufen: der letzte gesetzte Zug, ein Vor über den letzten Zug
 * hinaus, ein fortgesetzter Spielstand, der schon gelöst war. Ohne sie liefe
 * die Auswertung mehrfach, und die Partie ginge zweimal an die Rangliste.
 */
function gewonnen() {
  if (!partie || partie.fertig) return;
  partie.fertig = true;
  uhrAnhalten();
  zeichneWerkzeuge();

  const sekunden = Math.max(1, Math.round(partie.sekunden));
  const stufe = partie.raetsel.stufe;

  // Die eigene Bestzeit fortschreiben. Kleiner ist besser – das ist der
  // ganze Unterschied zu einem Punktespiel, und er steht an jeder Stelle, an
  // der verglichen wird.
  const best = eigeneBest();
  const bestVorher = typeof best[stufe] === 'number' ? best[stufe] : null;
  const istEigeneBest = bestVorher === null || sekunden < bestVorher;
  if (istEigeneBest) {
    best[stufe] = sekunden;
    speicher.schreib(SCHLUESSEL.best, best);
  }

  /*
   * Was im Endedialog steht, hängt an drei Vergleichen, und der erste ist
   * der heikle: ein Weltrekord wird nur behauptet, wenn ein bekannter
   * Weltrekord GESCHLAGEN wurde.
   *
   * Der naheliegende Weg wäre "kein Weltrekord bekannt, also ist meiner
   * einer" (so macht es zehner-paare). Bei einer ZEIT ist das aber eine
   * Behauptung über die ganze Welt, die man ohne Netz mit Sicherheit nicht
   * aufstellen kann — und ohne Netz ist nie einer bekannt. Im ersten Bild
   * stand deshalb bei jeder gelösten Partie am Schreibtisch "Neuer
   * Weltrekord", und das ist eine Auszeichnung, die sich in Luft auflöst,
   * sobald man online geht. Kommt die Antwort des Dienstes an und steht die
   * eigene Zeit dann obenan, wird der Satz nachgetragen (siehe melde()).
   */
  const weltVorher = welt.zwischenstand().rekorde?.[stufe];
  partie.ende = {
    sekunden,
    stufe,
    bestVorher,
    istEigeneBest,
    istGleichstand: bestVorher !== null && sekunden === bestVorher,
    istWeltrekord: einst.welt && !!weltVorher
      && typeof weltVorher.sekunden === 'number' && sekunden < weltVorher.sekunden,
  };

  zittern([30, 60, 30, 60, 80]);
  zeigeEnde();
  melde(sekunden);
  sichereJetzt();
}

/** Füllt den Endedialog und schlägt ihn auf. */
function zeigeEnde() {
  zeichneEndeText();
  if (elEndeKuerzel) elEndeKuerzel.value = sauberesKuerzel(einst.kuerzel);
  zeigeEndeRang(welt.zwischenstand());
  oeffne(dlgEnde);
}

/** Zeit und Auszeichnung im Endedialog – auch später noch einmal aufrufbar. */
function zeichneEndeText() {
  const e = partie?.ende;
  if (!e) return;
  if (elEndeZeit) {
    elEndeZeit.textContent = satz('ende.zeit', {
      stufe: satz(`stufe.${e.stufe}`),
      zeit: zeitText(e.sekunden),
    });
  }
  if (!elEndeText) return;
  const stuecke = [];
  if (e.istWeltrekord) {
    stuecke.push(satz('ende.weltrekord', { stufe: satz(`stufe.${e.stufe}`) }));
  } else if (e.istEigeneBest && e.bestVorher !== null) {
    stuecke.push(satz('ende.persoenlich', { zeit: zeitText(e.bestVorher) }));
  } else if (e.istGleichstand) stuecke.push(satz('ende.gleichstand'));
  stuecke.push(satz('ende.fehlerTipps', { fehler: partie.fehler, tipps: partie.tipps }));
  elEndeText.textContent = stuecke.join(' ');
}

/**
 * Der Rang im Endedialog.
 *
 * Gesucht wird das eigene Kürzel in der Bestenliste der Stufe. Steht es
 * nicht drin (kein Kürzel, keine Antwort vom Netz, die Zeit reicht nicht in
 * die ersten zehn), steht dort der Weltrekord — eine Zeile, die nichts sagt,
 * wäre ein leerer Platz im Dialog.
 */
function zeigeEndeRang(stand) {
  if (!elEndeRang || !partie) return;
  const stufe = partie.raetsel.stufe;
  const kuerzel = sauberesKuerzel(einst.kuerzel);
  const liste = Array.isArray(stand?.beste?.[stufe]) ? stand.beste[stufe] : [];
  const platz = kuerzel ? liste.findIndex((e) => e.kuerzel === kuerzel) + 1 : 0;
  const rekord = stand?.rekorde?.[stufe];
  if (platz > 0) elEndeRang.textContent = satz('rang.du', { platz });
  else if (rekord && typeof rekord.sekunden === 'number') {
    elEndeRang.textContent = satz('rang.weltrekord', {
      zeit: zeitText(rekord.sekunden),
      kuerzel: sauberesKuerzel(rekord.kuerzel) || '–',
    });
  /*
   * Kam die Meldung nicht durch, steht das HIER und nicht in der
   * Meldungszeile über dem Brett.
   *
   * Vorher blendete melde() dafür einen Hinweis ein – und weil die Rangliste
   * auf einem statischen Wirt ÜBERHAUPT keinen Dienst hat (/api/ läuft ins
   * Leere), war das kein Ausnahmefall, sondern jede gewonnene Partie: erst
   * der Endedialog, und darüber, quer über das Brett, "Kein Netz". Der
   * Vertrag sagt es deutlich: die Rangliste darf das Spiel nie aufhalten und
   * nie mit einer Meldung stören. Im Dialog ist die Auskunft am richtigen
   * Platz – dort, wo sonst der Rang stünde, den es ohne Netz eben nicht gibt.
   */
  } else if (partie.nichtGemeldet) elEndeRang.textContent = satz('hinweis.offline');
  else elEndeRang.textContent = '';
}

/**
 * Die Partie an die Rangliste melden.
 *
 * `neuePartie` und `gewonnen` gehen nur beim ERSTEN Mal mit hinaus, `zaehlt`
 * bei jedem Ruf. Der Grund steht in worker.js: eine Partie kann mehrfach
 * enden — der Dialog geht zu und wieder auf, die Seite wird neu geladen,
 * das Kürzel wird erst nachträglich eingetippt. Gezählt werden soll sie
 * einmal, eingetragen so oft, wie sich das Kürzel ändert.
 *
 * Geht der Ruf verloren, bleibt `gemeldet` falsch: dann wird beim nächsten
 * Ende derselben Partie nachgezählt statt gar nicht.
 */
/*
 * Die Rufe werden AUFGEREIHT und nicht nebeneinander losgelassen.
 *
 * Ohne diese Reihe wird eine Partie doppelt gezählt, und der Weg dorthin ist
 * kein Kunstgriff: `gewonnen()` meldet, und das 'change' des Kürzelfelds im
 * Endedialog meldet gleich danach noch einmal. Solange der erste Ruf
 * unterwegs ist, steht `gemeldet` aber noch auf falsch — beide Rufe hielten
 * sich also für den ersten, schickten `neuePartie: true` und
 * `gewonnen: true`, und im Weltstand stand eine Partie zu viel und ein Sieg
 * zu viel. Auf einer langsamen Verbindung ist das der Normalfall und nicht
 * die Ausnahme: bis die Antwort da ist, hat der Spieler sein Kürzel längst
 * eingetippt.
 *
 * Verworfen wurde ein einfacher Riegel ("läuft schon, also nichts tun"). Der
 * verhindert die Doppelzählung auch — und wirft dabei genau den zweiten Ruf
 * weg, auf den es ankommt: den mit dem Kürzel. Aufgereiht läuft der zweite
 * Ruf, wenn `gemeldet` schon steht, geht damit als Nachtrag hinaus (`zaehlt`
 * ohne `neuePartie`) und trägt die Zeile unter dem Kürzel ein.
 */
let meldeKette = Promise.resolve();

function melde(sekunden) {
  meldeKette = meldeKette.then(() => meldeEinmal(sekunden)).catch(() => {
    /* online.js verschluckt seine Fehler selbst; das hier ist die
       Versicherung, dass ein doch durchgekommener die Reihe nicht für den
       Rest der Sitzung verstopft. */
  });
  return meldeKette;
}

async function meldeEinmal(sekunden) {
  if (!einst.welt || !partie) return;
  const eigene = partie;
  const erst = !eigene.gemeldet;
  const ergebnis = await welt.partieBeendet({
    stufe: eigene.raetsel.stufe,
    sekunden,
    kuerzel: sauberesKuerzel(einst.kuerzel),
    fehler: Math.min(999, eigene.fehler),
    tipps: Math.min(999, eigene.tipps),
    gewonnen: erst,
    zaehlt: true,
    neuePartie: erst,
  });
  if (ergebnis?.gezaehlt) {
    eigene.gemeldet = true;
    eigene.nichtGemeldet = false;
    if (eigene === partie) sichereJetzt();
  } else if (erst) {
    // Nur vermerken, nicht melden: den Satz dazu setzt zeigeEndeRang() in
    // den Dialog, und der Grund dafür steht dort.
    eigene.nichtGemeldet = true;
  }
  // Der Ruf bringt den frischen Weltstand mit – Kärtchen, Endedialog und
  // Rangliste zeigen ihn sofort, ohne einen zweiten Ruf.
  if (eigene !== partie) return;
  const stand = ergebnis?.stand ?? welt.zwischenstand();

  /*
   * Jetzt erst ist eine Aussage über die Welt möglich: steht in der Antwort
   * des Dienstes die eigene Zeit als Rekord der Stufe, ist es einer. Das
   * Kürzel muss dabei stimmen oder fehlen — eine gleich schnelle Zeit eines
   * anderen Spielers ist nicht die eigene.
   */
  const rekord = stand.rekorde?.[eigene.raetsel.stufe];
  const meins = sauberesKuerzel(einst.kuerzel);
  if (eigene.ende && rekord && rekord.sekunden === eigene.ende.sekunden
      && (!rekord.kuerzel || !meins || rekord.kuerzel === meins)) {
    eigene.ende.istWeltrekord = true;
  }
  zeichneEndeText();
  zeichneKarten();
  zeigeEndeRang(stand);
  zeichneRangliste();
}

/* ========================================================================
   15. Speichern und Fortsetzen
   ======================================================================== */

/*
 * Entprellt, weil beim Ziehen bis zu hundert Ereignisse in der Sekunde
 * ankommen: JSON.stringify samt localStorage bei jedem davon ist der
 * sicherste Weg, ein Ziehen ruckeln zu lassen. 400 ms sind lang genug, dass
 * ein Zug immer nur einmal geschrieben wird, und kurz genug, dass ein
 * Wegwischen der App fast nie etwas verliert – und für das "fast nie" gibt
 * es sichereJetzt() an den Stellen, an denen es darauf ankommt.
 */
let sicherUhr = null;
let gespeichertGesagt = false;

function spielstand() {
  return {
    raetsel: partie.raetsel,
    rechtecke: partie.rechtecke.map(kopie),
    sekunden: partie.sekunden,
    fehler: partie.fehler,
    tipps: partie.tipps,
    wann: partie.wann,
    // Nicht im Vertrag und trotzdem nötig: ohne diesen Merker zählt ein
    // Neuladen nach dem Sieg die Partie ein zweites Mal weltweit mit.
    gemeldet: !!partie.gemeldet,
  };
}

function sichere() {
  if (!partie) return;
  clearTimeout(sicherUhr);
  sicherUhr = setTimeout(() => {
    speicher.schreib(SCHLUESSEL.spiel, spielstand());
    /*
     * Einmal je Partie sagen, dass gespeichert wird. Wer das Spiel zum
     * ersten Mal weglegt, weiß sonst nicht, dass er es wiederfindet – und
     * spielt eine halb gelöste Aufgabe lieber zu Ende, als sie zu verlieren.
     *
     * Aber nur, wenn die Meldungszeile gerade frei ist. Das Speichern läuft
     * 400 ms nach dem Zug, und war dieser Zug ein Tipp, dann stand dort die
     * Begründung ("Für die 6 bleibt nur noch dieses Rechteck") – die
     * Auskunft, um die es beim Tippen überhaupt geht. Die Buchhaltung des
     * Spielstands hat sie weggewischt, bevor sie zu lesen war. Steht etwas,
     * bleibt `gespeichertGesagt` falsch und die Sache wird beim nächsten
     * Speichern nachgeholt.
     */
    if (!gespeichertGesagt && !partie.fertig && elHinweis?.hidden !== false) {
      gespeichertGesagt = true;
      hinweis(satz('hinweis.gespeichert'), 3200);
    }
  }, 400);
}

function sichereJetzt() {
  if (!partie) return;
  clearTimeout(sicherUhr);
  uhrNachtragen();          // die Sekunden bis hierher gehören noch dazu
  speicher.schreib(SCHLUESSEL.spiel, spielstand());
}

/*
 * Die Seite verlässt uns: jetzt sichern, ohne die Entprellung abzuwarten.
 *
 * 'pagehide' und nicht 'beforeunload'. Der Unterschied ist auf dem Telefon
 * der ganze Punkt: beforeunload feuert dort verlässlich NICHT, wenn die App
 * weggewischt oder vom System entladen wird, pagehide dagegen schon — und es
 * feuert auch beim Wechsel in den Seiten-Zwischenspeicher, aus dem der
 * Zurück-Knopf zurückkommt. Ohne diese Zeile verliert ein Neuladen innerhalb
 * der 400 ms nach einem Zug genau diesen Zug; gemessen im Prüfstand, und
 * genau so passiert es dem Spieler, der nach dem letzten Rechteck sofort
 * neu lädt.
 */
window.addEventListener('pagehide', sichereJetzt);

/**
 * Eine laufende Partie zurückholen.
 *
 * Alles wird geprüft, als käme es von einem Fremden — und das tut es auch:
 * im localStorage kann ein Eintrag aus einer älteren Fassung, aus einem
 * anderen Spiel oder aus einer Tastatureingabe in der Entwicklerkonsole
 * stehen. Ein Rätsel, das pruefeRaetsel() nicht besteht, wird verworfen;
 * einzelne unbrauchbare Rechtecke werden weggelassen und nicht
 * zurechtgebogen.
 *
 * Ein FERTIGES Rätsel wird nicht fortgesetzt: der Spieler hat es gelöst, und
 * das erste, was er beim Wiederkommen sehen soll, ist eine neue Aufgabe und
 * nicht sein alter Endedialog.
 */
function holeSpiel() {
  const roh = speicher.lies(SCHLUESSEL.spiel);
  if (!roh || typeof roh !== 'object') return null;
  const raetsel = roh.raetsel;
  if (pruefeRaetsel(raetsel)) return null;
  if (!STUFEN.includes(raetsel.stufe)) raetsel.stufe = 'mittel';

  const rechtecke = (Array.isArray(roh.rechtecke) ? roh.rechtecke : [])
    .filter((r) => brauchbar(r, raetsel))
    .map(kopie);
  if (pruefeStand(raetsel, rechtecke).fertig) return null;

  return {
    raetsel,
    rechtecke,
    /*
     * Number.isFinite und nicht `typeof === 'number'`: Infinity ist eine
     * Zahl und ist >= 0, rutschte also durch. Danach zeigte die Uhr
     * "Infinity:NaN:NaN", `Math.round` blieb Infinity, und die Partie ging
     * mit `sekunden: null` (so schreibt JSON.stringify eine Unendlichkeit)
     * an die Rangliste. NaN fiel schon vorher heraus, weil NaN >= 0 falsch
     * ist — eine Prüfung, die nur die Hälfte der Nicht-Zahlen fängt, ist
     * aber genau die Art Prüfung, auf die sich niemand verlassen kann.
     */
    sekunden: Number.isFinite(roh.sekunden) && roh.sekunden >= 0 ? roh.sekunden : 0,
    fehler: Number.isInteger(roh.fehler) && roh.fehler >= 0 ? roh.fehler : 0,
    tipps: Number.isInteger(roh.tipps) && roh.tipps >= 0 ? roh.tipps : 0,
    wann: Number.isInteger(roh.wann) ? roh.wann : Date.now(),
    gemeldet: !!roh.gemeldet,
    fertig: false,
  };
}

/* ========================================================================
   16. Dialoge
   ======================================================================== */

function oeffne(dlg) {
  if (!dlg || dlg.open) return;
  dlg.showModal();
  // Ohne das landet der Fokus auf dem Schließen-Kreuz und malt dort einen
  // Ring – als wäre das Wichtigste am Dialog, ihn wieder zuzumachen.
  dlg.focus({ preventScroll: true });
  dlg.querySelector('.dlg__inhalt')?.scrollTo({ top: 0 });
  uhrPruefen();
}

function schliesse(dlg) {
  if (!dlg || !dlg.open) return;
  dlg.close();
  uhrPruefen();
}

for (const dlg of ALLE_DIALOGE) {
  if (!dlg) continue;
  dlg.addEventListener('click', (e) => {
    // Ein Klick auf den Hintergrund schließt. Das <dialog> selbst füllt den
    // ganzen Bildschirm (siehe .dlg in basis.css), das Blatt ist sein Kind –
    // ein Treffer auf dem Dialog und nicht auf dem Blatt ist also der
    // Hintergrund.
    if (e.target === dlg) schliesse(dlg);
    else if (e.target.closest('[data-zu]')) schliesse(dlg);
  });
  // Escape schließt über 'cancel'. Abgefangen und selbst geschlossen, damit
  // beides denselben Weg nimmt und die Uhr in jedem Fall nachgeprüft wird.
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    schliesse(dlg);
  });
  dlg.addEventListener('close', uhrPruefen);
}

/* ========================================================================
   17. Einstellungen
   ======================================================================== */

/** Setzt die Haken in einer Knopfreihe. */
function zeigeWahl(kennung, wert) {
  const gruppe = $(kennung);
  if (!gruppe) return;
  for (const knopf of gruppe.querySelectorAll('.wahl__option')) {
    knopf.setAttribute('aria-pressed', String(knopf.dataset.wert === wert));
  }
}

function zeigeEinstellungen() {
  zeigeWahl('wahl-skin', SKINS.includes(einst.skin) ? einst.skin : 'apple');
  zeigeWahl('wahl-thema', THEMEN.includes(einst.thema) ? einst.thema : 'auto');
  // Die Sprachreihe zeigt die WIRKSAME Sprache, nicht den gespeicherten
  // Wert: ohne eigene Wahl folgt das Spiel dem Gerät, und dann soll der
  // Haken bei der Sprache stehen, die man tatsächlich liest.
  zeigeWahl('wahl-sprache', spracheJetzt());

  const schalter = (kennung, an) => {
    const el = $(kennung);
    if (el) el.checked = !!an;
  };
  schalter('schalter-welt', einst.welt);
  schalter('schalter-hilfslinien', einst.hilfslinien);
  schalter('schalter-vibration', einst.vibration);

  // Nicht überschreiben, während jemand darin tippt – der Schreibzeiger
  // sprang sonst ans Ende, sobald irgendetwas anderes ein Neuzeichnen
  // auslöst.
  if (elFeldKuerzel && document.activeElement !== elFeldKuerzel) {
    elFeldKuerzel.value = sauberesKuerzel(einst.kuerzel);
  }
}

$('wahl-skin')?.addEventListener('click', (e) => {
  const knopf = e.target.closest('.wahl__option');
  if (!knopf || !SKINS.includes(knopf.dataset.wert)) return;
  einst.skin = knopf.dataset.wert;
  sichereEinst();
  zeigeDarstellung();
  zeigeEinstellungen();
});

$('wahl-thema')?.addEventListener('click', (e) => {
  const knopf = e.target.closest('.wahl__option');
  if (!knopf || !THEMEN.includes(knopf.dataset.wert)) return;
  einst.thema = knopf.dataset.wert;
  sichereEinst();
  zeigeDarstellung();
  zeigeEinstellungen();
});

$('wahl-sprache')?.addEventListener('click', (e) => {
  const knopf = e.target.closest('.wahl__option');
  if (!knopf || !SPRACHEN.includes(knopf.dataset.wert)) return;
  einst.sprache = knopf.dataset.wert;
  sichereEinst();
  zeigeTexte();            // ohne Neuladen: Texte, lang, Manifest, Kärtchen
  zeigeEinstellungen();
});

$('schalter-welt')?.addEventListener('change', (e) => {
  einst.welt = !!e.target.checked;
  sichereEinst();
  welt.schalten(einst.welt);
  zeichneKarten();
  zeichneRangliste();
});

$('schalter-hilfslinien')?.addEventListener('change', (e) => {
  einst.hilfslinien = !!e.target.checked;
  sichereEinst();
  zeigeDarstellung();
});

$('schalter-vibration')?.addEventListener('change', (e) => {
  einst.vibration = !!e.target.checked;
  sichereEinst();
  zittern(20);             // sofort spürbar, dass der Schalter etwas tut
});

/**
 * Das Kürzel wird bei JEDEM Tastendruck gefiltert und gespeichert.
 *
 * Nicht erst auf einen Knopf: den Endedialog kann man wegtippen, und ein
 * Kürzel, das dabei verloren geht, tippt niemand ein zweites Mal. Die
 * Meldung kommt dagegen erst beim Verlassen des Feldes ('change') – bei
 * jedem Buchstaben eine Meldung wäre Lärm.
 */
function kuerzelGetippt(feld) {
  const sauber = sauberesKuerzel(feld.value);
  if (feld.value !== sauber) feld.value = sauber;
  einst.kuerzel = sauber;
  sichereEinst();
  zeigeEinstellungen();
}

for (const feld of [elFeldKuerzel, elEndeKuerzel]) {
  if (!feld) continue;
  feld.addEventListener('input', () => kuerzelGetippt(feld));
  feld.addEventListener('change', () => {
    kuerzelGetippt(feld);
    if (einst.kuerzel) hinweis(satz('hinweis.kuerzelGesetzt', { kuerzel: einst.kuerzel }));
    // Im Endedialog hat das Kürzel eine Folge: die Partie ist schon gemeldet,
    // aber ohne Namen. Ein zweiter Ruf trägt die Zeile nach – gezählt wird
    // sie dabei nicht noch einmal (siehe melde()).
    if (feld === elEndeKuerzel && partie?.fertig && einst.kuerzel) {
      melde(Math.max(1, Math.round(partie.sekunden)));
    }
  });
}

/* ========================================================================
   18. Rangliste
   ======================================================================== */

/**
 * Die Reiterreihe der Rangliste — Haken, Tabhalt und Beschriftung der Tafel.
 *
 * Drei Dinge auf einmal, und die letzten zwei fehlten:
 *
 *  - `aria-selected` sagt, welcher Reiter offen ist. Das war schon da.
 *  - `tabindex` rollt mit: genau EIN Reiter ist mit der Tabulatortaste zu
 *    erreichen, alle anderen tragen -1. Das ist das Muster für eine
 *    Reiterreihe, und es ist keine Formalie — ohne es tabbt man sich durch
 *    vier Knöpfe, um an die Liste zu kommen, und mit den Pfeiltasten (die
 *    jede Vorlesehilfe hier anbietet) passierte gar nichts.
 *  - Die Tafel benennt sich nach dem offenen Reiter. Eine Tafel ohne Namen
 *    ist für eine Vorlesehilfe "Tabbereich" und sonst nichts; mit dem Namen
 *    ist es "Mittel, Tabbereich", und damit steht der Zusammenhang zwischen
 *    Reiter und Liste auch für den da, der die Liste nicht sehen kann.
 */
function zeigeReiter() {
  if (!elRangReiter) return;
  let offener = null;
  for (const knopf of elRangReiter.querySelectorAll('.reiter')) {
    const offen = knopf.dataset.stufe === rangStufe;
    knopf.setAttribute('aria-selected', String(offen));
    knopf.tabIndex = offen ? 0 : -1;
    if (offen) offener = knopf;
  }
  if (elRangListe && offener?.id) elRangListe.setAttribute('aria-labelledby', offener.id);
}

/**
 * Zeichnet die Bestenliste der offenen Stufe.
 *
 * Gebaut wird eine Tabelle mit den drei Spalten Platz, Spieler, Zeit. Ein
 * <table> und keine Liste, weil das hier wirklich eine Tabelle ist — drei
 * gleichartige Angaben je Zeile, mit Kopfzeile. basis.css gestaltet beide
 * Formen (das steht dort ausdrücklich), also kostet die Wahl nichts.
 *
 * Die Werte kommen aus dem Netz und gehen ins Markup, darum steht zwischen
 * beidem textContent und keine Zeichenkette mit HTML. besteListe() in
 * online.js prüft schon streng, aber "geprüft" und "als Text eingesetzt"
 * sind zwei Sicherungen, und die zweite kostet hier nichts.
 */
function zeichneRangliste() {
  if (!elRangListe) return;
  zeigeReiter();
  const stand = welt.zwischenstand();
  const liste = Array.isArray(stand.beste?.[rangStufe]) ? stand.beste[rangStufe] : [];
  const meins = sauberesKuerzel(einst.kuerzel);

  elRangListe.replaceChildren();
  if (!liste.length) {
    const leer = document.createElement('p');
    leer.className = 'notiz';
    leer.textContent = satz('rang.leer');
    elRangListe.append(leer);
  } else {
    const tabelle = document.createElement('table');
    const kopf = document.createElement('thead');
    const kopfzeile = document.createElement('tr');
    for (const schluessel of ['rang.platz', 'rang.spieler', 'rang.zeit']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = satz(schluessel);
      kopfzeile.append(th);
    }
    kopf.append(kopfzeile);
    tabelle.append(kopf);

    const koerper = document.createElement('tbody');
    liste.forEach((eintrag, i) => {
      const zeile = document.createElement('tr');
      if (eintrag.kuerzel === meins && meins) {
        zeile.className = 'rang__zeile--du';
        // Die Hervorhebung darf nicht allein an der Farbe hängen: eine
        // hinterlegte Zeile ist mit einer Farbsehschwäche unter Umständen
        // jede andere Zeile, und für eine Vorlesehilfe ist sie gar nichts.
        // Den Balken und die fette Schrift bringt basis.css mit, die Ansage
        // steht hier.
        zeile.setAttribute('aria-current', 'true');
      }

      const platz = document.createElement('td');
      platz.textContent = String(i + 1);
      zeile.append(platz);

      const wer = document.createElement('td');
      wer.textContent = eintrag.kuerzel;
      // Fehler und Tipps stehen daneben – so steht es im Hinweis unter der
      // Liste, und ohne sie wäre eine Zeit ohne Zusammenhang.
      const notiz = document.createElement('span');
      notiz.className = 'notiz';
      notiz.textContent = ` ${satz('ende.fehlerTipps', {
        fehler: eintrag.fehler, tipps: eintrag.tipps,
      })}`;
      wer.append(notiz);
      zeile.append(wer);

      const zeitZelle = document.createElement('td');
      zeitZelle.textContent = zeitText(eintrag.sekunden);
      zeile.append(zeitZelle);

      koerper.append(zeile);
    });
    tabelle.append(koerper);
    elRangListe.append(tabelle);
  }

  if (elRangWelt) {
    /*
     * Ohne Netz die letzten bekannten Werte zeigen und das SAGEN. Der
     * verworfene Weg war, in dem Fall gar nichts anzuzeigen: dann sieht eine
     * Rangliste, die den Server nicht erreicht, genauso aus wie eine, auf der
     * noch niemand gespielt hat — und der Spieler hält sich für den ersten
     * Menschen mit einem Shikaku.
     */
    if (!einst.welt) elRangWelt.textContent = '';
    else if (stand.spiele === null) elRangWelt.textContent = satz('rang.offline');
    else {
      elRangWelt.textContent = `${satz('rang.spiele', { spiele: stand.spiele })} · `
        + `${satz('rang.siege', { siege: stand.siege ?? 0 })}`;
    }
  }
}

/** Beim Aufschlagen: sofort den Merkzettel zeigen, dann nachlesen. */
let lesenLaeuft = false;
async function frischeWeltwerte() {
  if (!einst.welt || lesenLaeuft || !welt.veraltet()) return;
  lesenLaeuft = true;
  try {
    const stand = await welt.lesen();
    if (stand) {
      zeichneRangliste();
      zeichneKarten();
    }
  } finally {
    lesenLaeuft = false;
  }
}

elRangReiter?.addEventListener('click', (e) => {
  const knopf = e.target.closest('.reiter');
  if (!knopf || !STUFEN.includes(knopf.dataset.stufe)) return;
  rangStufe = knopf.dataset.stufe;
  zeichneRangliste();
});

/**
 * Pfeiltasten in der Reiterreihe — Pos1 und Ende dazu.
 *
 * Gehört zu role="tablist" wie die Leertaste zu einem Knopf: wer eine
 * Reiterreihe ansagt, dem wird eine Reiterreihe angeboten, und die bedient
 * man mit den Pfeilen. Ohne diesen Zuhörer war das Versprechen im Markup
 * eine Behauptung.
 *
 * Der neue Reiter bekommt den Fokus AUSDRÜCKLICH: das rollende tabindex aus
 * zeigeReiter() setzt den alten auf -1, und ein Element, das den Fokus hält
 * und ihn verliert, gibt ihn an den Körper ab – danach ist die Reihe mit der
 * Tastatur nicht mehr zu bedienen.
 */
elRangReiter?.addEventListener('keydown', (e) => {
  const richtung = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
    : (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0);
  const ans = e.key === 'Home' ? 0 : (e.key === 'End' ? STUFEN.length - 1 : -1);
  if (!richtung && ans < 0) return;
  e.preventDefault();
  const jetzt = STUFEN.indexOf(rangStufe);
  // Umlaufend: von "Experte" nach rechts kommt wieder "Leicht". Vier Reiter
  // sind wenige genug, dass ein Anschlag am Rand nur nach Fehler aussieht.
  const ziel = ans >= 0 ? ans
    : (jetzt + richtung + STUFEN.length) % STUFEN.length;
  rangStufe = STUFEN[ziel];
  zeichneRangliste();
  elRangReiter.querySelector(`.reiter[data-stufe="${rangStufe}"]`)?.focus();
});

/* ========================================================================
   19. Neues Rätsel
   ======================================================================== */

/**
 * Ein neues Rätsel bauen und aufs Brett legen.
 *
 * Die Erzeugung ist synchron und kann auf 'experte' einen Augenblick dauern.
 * Damit der Hinweis "Das Rätsel wird gebaut …" nicht erst NACH der Wartezeit
 * erscheint (ein gesetzter Text wird ja nicht sofort gemalt), wird
 * ausdrücklich ein Bild abgewartet. requestAnimationFrame allein genügt
 * dafür nicht: der Rückruf läuft VOR dem Malen. Erst das setTimeout(0)
 * dahinter kommt danach.
 *
 * Ein Web Worker wäre die saubere Lösung und ist hier zu teuer: er müsste
 * erzeuger.js, loeser.js und shikaku.js noch einmal laden, und die gemessene
 * Wartezeit liegt bei 'experte' unter einer halben Sekunde.
 */
let erzeugungLaeuft = false;
async function neuesSpiel(stufe, seed) {
  // Ein zweiter Griff, während der erste noch rechnet, wird verworfen. Auf
  // 'experte' ist zwischen Tippen und Brett eine halbe Sekunde Zeit, und wer
  // in dieser Zeit noch einmal tippt (weil scheinbar nichts passiert), hätte
  // sonst zwei Rätsel erzeugt und das erste sofort weggeworfen.
  if (erzeugungLaeuft) return;
  erzeugungLaeuft = true;
  const gewuenscht = STUFEN.includes(stufe) ? stufe : 'mittel';
  if (elNeuLaeuft) elNeuLaeuft.hidden = false;
  await naechstesBild();

  let raetsel = null;
  try {
    raetsel = erzeuge(gewuenscht, seed).raetsel;
  } catch {
    // Kann nach dem Vertrag nicht passieren (erzeuge() hat einen Notausgang),
    // aber ein Spiel ohne Brett wäre der schlimmste Ausgang von allen.
    raetsel = null;
  }
  if (elNeuLaeuft) elNeuLaeuft.hidden = true;
  erzeugungLaeuft = false;
  if (!raetsel) return;

  // Erst die Dialoge zu, dann die Partie: starte() prüft am Ende auf einen
  // fertigen Stand und könnte den Endedialog öffnen, und ein Dialog, der
  // gleich danach geschlossen wird, blitzt auf.
  schliesse(dlgNeu);
  schliesse(dlgEnde);
  starte({
    raetsel,
    rechtecke: [],
    sekunden: 0,
    fehler: 0,
    tipps: 0,
    wann: Date.now(),
    gemeldet: false,
    fertig: false,
  });
}

/** Eine Partie aufs Brett bringen – neu oder fortgesetzt. */
function starte(neue) {
  partie = neue;
  uhrLaeuft = false;
  uhrSeit = null;
  clearInterval(uhrId);
  uhrId = null;
  gespeichertGesagt = false;
  auswahl = null;
  cursor = { x: 0, y: 0 };
  cursorSichtbar = false;
  stapelZuruecksetzen(partie.rechtecke);
  rangStufe = partie.raetsel.stufe;

  baueBrett(partie.raetsel);
  if (elStufe) elStufe.dataset.i18n = `stufe.${partie.raetsel.stufe}`;
  zeichne();
  // Die Rangliste steht auf der Stufe, die gerade gespielt wird – wer sie
  // aufschlägt, will die Zeiten sehen, gegen die er gerade antritt.
  zeichneRangliste();
  sichereJetzt();

  // Ein fortgesetzter Spielstand kann schon gelöst sein – dann gehört der
  // Endedialog dazu. holeSpiel() lässt so einen Stand allerdings gar nicht
  // durch; die Prüfung steht hier für den Weg über ?seed= und für die
  // Zukunft.
  if (pruefeStand(partie.raetsel, partie.rechtecke).fertig) gewonnen();
}

$('neu-stufen')?.addEventListener('click', (e) => {
  const knopf = e.target.closest('[data-stufe]');
  if (!knopf || !STUFEN.includes(knopf.dataset.stufe)) return;
  neuesSpiel(knopf.dataset.stufe);
});

/* ========================================================================
   20. Tastatur

   Vollständig bedienbar heißt: ohne Zeigegerät spielbar, nicht nur
   erreichbar. Der Zellcursor ist dafür das Mindeste — Pfeiltasten bewegen
   ihn, Leertaste oder Enter spannen ein Rechteck auf, ein zweiter Druck
   setzt es.
   ======================================================================== */

const SCHRITTE = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

function bewegeCursor(dx, dy) {
  if (!partie) return;
  const b = partie.raetsel.breite;
  const h = partie.raetsel.hoehe;
  // Der erste Pfeildruck ZEIGT den Cursor nur, er bewegt ihn nicht. Sonst
  // erscheint er einen Schritt neben der Stelle, an der man ihn erwartet –
  // und wo er vorher stand, hat man nie gesehen.
  if (cursorSichtbar) {
    cursor = {
      x: Math.min(b - 1, Math.max(0, cursor.x + dx)),
      y: Math.min(h - 1, Math.max(0, cursor.y + dy)),
    };
  }
  cursorSichtbar = true;
  if (auswahl) auswahl.bis = { ...cursor };
  zeichne();
  meldeZelle(cursor);
}

/**
 * Was unter dem Cursor steht, für die Vorlesehilfe.
 *
 * Drei Fälle, drei Sätze: leer, eine Zahl, Teil eines Rechtecks. Die Zählung
 * ist 1-basiert – "Spalte 0" versteht niemand, der nicht programmiert.
 *
 * 'a11y.zelleTeil' nennt die Zahl des Rechtecks und wird deshalb nur
 * verwendet, wenn es GENAU EINE gibt. Bei einem fehlerhaften Rechteck (keine
 * Zahl oder zwei) wird die Zelle selbst beschrieben: eine erfundene Zahl
 * vorzulesen wäre schlimmer als eine knappere Auskunft, denn wer nicht
 * hinsehen kann, hat nichts, womit er sie überprüfen könnte.
 */
function meldeZelle(zelle) {
  if (!partie) return;
  const werte = { x: zelle.x + 1, y: zelle.y + 1 };
  const i = teilAn(zelle.x, zelle.y);
  const eigene = i >= 0 ? eineZahlIn(partie.rechtecke[i]) : -1;
  if (eigene >= 0) {
    sagt(satz('a11y.zelleTeil', { ...werte, wert: partie.raetsel.zahlen[eigene].wert }));
    return;
  }
  const zahl = zahlAn(partie.raetsel, zelle.x, zelle.y);
  if (zahl >= 0) {
    sagt(satz('a11y.zelleZahl', { ...werte, wert: partie.raetsel.zahlen[zahl].wert }));
  } else {
    sagt(satz('a11y.zelleLeer', werte));
  }
}

elBrett?.addEventListener('keydown', (e) => {
  if (!partie) return;
  if (e.key in SCHRITTE) {
    e.preventDefault();
    const [dx, dy] = SCHRITTE[e.key];
    bewegeCursor(dx, dy);
    return;
  }
  if (e.key === ' ' || e.key === 'Enter') {
    // Die Leertaste würde die Seite scrollen, Enter einen umgebenden Knopf
    // auslösen – beides ist hier nicht gemeint.
    e.preventDefault();
    if (partie.fertig) return;
    cursorSichtbar = true;
    if (!auswahl) {
      // Erster Druck: aufspannen. Auf einer belegten Zelle ohne weiteres
      // Ziehen bleibt es beim Antippen – die Auswahl von einer Zelle zu
      // derselben Zelle ist genau das.
      auswahl = { von: { ...cursor }, bis: { ...cursor } };
      zeichneVorschau();
    } else {
      const von = auswahl.von;
      const bis = { ...cursor };
      auswahl = null;
      if (von.x === bis.x && von.y === bis.y) antippen(bis);
      else setzeRechteck(normRechteck(von.x, von.y, bis.x, bis.y));
      zeichneVorschau();
    }
    return;
  }
  if (e.key === 'Escape' && auswahl) {
    // Nur wenn wirklich eine Auswahl läuft: sonst soll Escape das tun, was
    // es überall tut, und nicht stillschweigend geschluckt werden.
    e.preventDefault();
    auswahl = null;
    zeichneVorschau();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    const i = teilAn(cursor.x, cursor.y);
    if (i >= 0) loescheTeil(i);
  }
});

/*
 * Verlässt das Brett den Fokus, verschwindet der Zellcursor.
 *
 * Er ist eine Fokusanzeige und keine Markierung: ein Kästchen, das im Bild
 * stehen bleibt, während der Fokus längst auf einem Knopf sitzt, behauptet
 * eine Auswahl, die es nicht mehr gibt. Eine laufende Auswahl wird dabei
 * verworfen — mit dem Fokus ist auch die Taste weg, die sie beenden würde.
 */
elBrett?.addEventListener('blur', () => {
  if (!cursorSichtbar && !auswahl) return;
  cursorSichtbar = false;
  auswahl = null;
  zeichne();
});

document.addEventListener('keydown', (e) => {
  // In einem Dialog und in einem Eingabefeld gehören die Tasten dem Dialog
  // und dem Feld. Ein 'z' im Kürzelfeld darf keinen Zug zurücknehmen.
  const ziel = e.target;
  if (!ziel || typeof ziel.closest !== 'function') return;
  if (ziel.closest('dialog')) return;
  if (ziel.matches('input, textarea, select')) return;
  /*
   * z nimmt zurück, Umschalt+z und y gehen wieder vor.
   *
   * Vorher hörte diese Stelle auf 'z' UND 'Z' und rief in beiden Fällen
   * zurueck(). Damit nahm Strg+Umschalt+Z einen Zug ZURÜCK — und das ist in
   * jedem anderen Programm der Griff für "doch wieder vor". Wer sich
   * verklickt hat, drückt genau diese Tastenfolge, und das Spiel machte das
   * Gegenteil von dem, was überall sonst passiert. Die Steuerungstaste
   * bleibt dabei unbeachtet: mit oder ohne meint der Griff dasselbe, und
   * ein Rückgängig des Browsers gibt es auf einem Brett ohne Eingabefelder
   * nicht.
   *
   * y liegt dazu, weil das auf einer deutschen Tastatur der gewohnte
   * Vorwärtsgriff ist (Strg+Y).
   */
  /*
   * Gefragt wird nach e.shiftKey und nicht nach dem Zeichen 'Z'.
   *
   * Der erste Versuch unterschied 'z' von 'Z' — das ist die naheliegende
   * Lesart und im Prüfstand sofort durchgefallen: dort kam bei gedrückter
   * Umschalttaste weiterhin 'z' an, und damit nahm der Vorwärtsgriff einen
   * Zug zurück. Welchen Buchstaben ein Browser bei einer Umschaltung
   * meldet, hängt an der Tastaturbelegung und an der Fernsteuerung, mit der
   * geprüft wird; ob die Umschalttaste liegt, steht dagegen unmissverständ-
   * lich im Ereignis.
   */
  const taste = String(e.key).toLowerCase();
  if (taste === 'z' && !e.shiftKey) zurueck();
  else if ((taste === 'z' && e.shiftKey) || taste === 'y') vor();
});

/* ========================================================================
   21. Knöpfe
   ======================================================================== */

btnZurueck?.addEventListener('click', zurueck);
btnVor?.addEventListener('click', vor);
btnTipp?.addEventListener('click', tippen);
btnLeeren?.addEventListener('click', leeren);
btnNeu?.addEventListener('click', () => oeffne(dlgNeu));

$('btn-regeln')?.addEventListener('click', () => oeffne(dlgRegeln));
$('btn-einstellungen')?.addEventListener('click', () => {
  zeigeEinstellungen();
  oeffne(dlgEinst);
});
$('btn-rangliste')?.addEventListener('click', () => {
  schliesse(dlgEinst);
  zeichneRangliste();
  oeffne(dlgRang);
  frischeWeltwerte();
});
$('btn-ende-nochmal')?.addEventListener('click', () => {
  const stufe = partie ? partie.raetsel.stufe : 'mittel';
  schliesse(dlgEnde);
  neuesSpiel(stufe);
});

/*
 * Das Stufen-Kärtchen ist die Abkürzung zum Stufenwechsel: dort steht die
 * Stufe, also führt es dorthin, wo man sie ändert. role="button" bringt die
 * Tastatur nicht mit – ein <div> hört von sich aus weder auf Enter noch auf
 * die Leertaste.
 */
elKarteStufe?.addEventListener('click', () => oeffne(dlgNeu));
elKarteStufe?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  oeffne(dlgNeu);
});

/* ========================================================================
   22. Start
   ======================================================================== */

zeigeDarstellung();

/**
 * Die Adresse mitlesen.
 *
 * `?neu=stufe` kommt aus den Verknüpfungen im Manifest, `?seed=...` von Hand
 * – zum Weitergeben eines Rätsels und für die Fehlersuche. Beides wird
 * danach aus der Adresse geputzt: bliebe es stehen, bekäme ein Neuladen
 * wieder ein frisches Rätsel und der halb gelöste Stand wäre weg. Das
 * Weitergeben leidet nicht darunter — das Seed steht im Rätsel und damit im
 * Spielstand.
 */
function ausDerAdresse() {
  const adresse = new URLSearchParams(location.search);
  const stufe = adresse.get('neu');
  const seed = adresse.get('seed');
  const wunsch = {
    stufe: STUFEN.includes(stufe) ? stufe : null,
    seed: typeof seed === 'string' && /^[a-z0-9]{1,16}$/i.test(seed) ? seed : null,
  };
  if (wunsch.stufe || wunsch.seed) {
    history.replaceState(null, '', location.pathname);
  }
  return wunsch;
}

const wunsch = ausDerAdresse();
const fortgesetzt = wunsch.stufe || wunsch.seed ? null : holeSpiel();

if (fortgesetzt) {
  starte(fortgesetzt);
} else {
  // Erst ein leeres Brett in der gewünschten Größe, dann erzeugen: so steht
  // sofort ein Raster da, und der Hinweis "wird gebaut" hat etwas, worüber
  // er liegen kann.
  const stufe = wunsch.stufe ?? 'mittel';
  const mass = AUSMASS[stufe];
  baueBrett({ breite: mass.breite, hoehe: mass.hoehe, stufe, zahlen: [] });
  neuesSpiel(stufe, wunsch.seed ?? undefined);
}

zeigeTexte();
zeigeEinstellungen();
zeichneRangliste();
frischeWeltwerte();

/*
 * Die Regeln beim ersten Besuch. Wer Shikaku noch nie gesehen hat, hat auf
 * einem Brett voller Zahlen keine Chance zu erraten, was zu tun ist – und
 * ein Spiel, das man erst nachlesen muss, spielt niemand.
 */
if (speicher.liesRoh(SCHLUESSEL.gesehen) !== 'true') {
  speicher.schreibRoh(SCHLUESSEL.gesehen, 'true');
  oeffne(dlgRegeln);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline ist Zugabe */ });
  });
}

/**
 * Für die Abnahme im echten Browser.
 *
 * `stand()` gibt genau das, was ein Prüfstand braucht, um zu sehen, ob das
 * Spiel tut, was es soll. Das Rätsel steht daneben, damit sich eine Lösung
 * dazu rechnen lässt – ohne das müsste ein Prüflauf raten oder das Spiel von
 * Hand durchspielen.
 */
window.__sk = {
  VERSION,
  stand() {
    if (!partie) return { stufe: null, offen: null, sekunden: 0, fertig: false, teile: 0 };
    const s = pruefeStand(partie.raetsel, partie.rechtecke);
    return {
      stufe: partie.raetsel.stufe,
      offen: s.offen,
      sekunden: Math.round(partie.sekunden),
      fertig: s.fertig,
      teile: partie.rechtecke.length,
      fehler: partie.fehler,
      tipps: partie.tipps,
      seed: partie.raetsel.seed,
    };
  },
  get raetsel() { return partie?.raetsel ?? null; },
  get rechtecke() { return partie ? partie.rechtecke.map(kopie) : []; },
  setzeRechteck, loescheTeil, leeren, zurueck, vor, tippen, neuesSpiel,
  zelleAus,
};
