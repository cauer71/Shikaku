/**
 * Shikaku – Rätsel erzeugen.
 *
 * Aus dem Nichts ein Shikaku zu würfeln und dann zu hoffen, dass es eindeutig
 * ist, funktioniert nicht: bei 12×12 ist praktisch jede zufällige Zahlenlage
 * entweder unlösbar oder mehrdeutig. Darum wird es andersherum gebaut — erst
 * die LÖSUNG, dann die Aufgabe:
 *
 *   1. Das Raster restlos in Rechtecke zerlegen (zerlege). Diese Zerlegung ist
 *      die Lösung, und dass sie eine ist, steht damit schon fest.
 *   2. In jedes Rechteck eine Zahl schreiben — seine Fläche. Damit ist die
 *      Summenbedingung automatisch erfüllt und das Rätsel garantiert lösbar.
 *   3. Die STELLE der Zahl im Rechteck so lange verschieben, bis es nur noch
 *      diese eine Lösung gibt.
 *
 * Schritt 3 ist der eigentliche Erzeuger, und er ist nötiger, als man denkt.
 * Gemessen an je 200 Zerlegungen der vier Ausmaße, jeweils der Anteil, der ohne
 * jede Suche eindeutig ist:
 *
 *   Zahlplatz                                leicht  mittel  schwer  experte
 *   alle Zahlen in der linken oberen Ecke     100 %   100 %   100 %   100 %
 *   alle Zahlen in der Mitte                   91 %    84 %    84 %    86 %
 *   Ecke oder Mitte, gewürfelt                 40 %    36 %    30 %    29 %
 *
 * Die erste Zeile ist der Grund, warum diese Datei eine Suche enthält und nicht
 * eine Regel. Eine feste Konvention — jede Zahl in der linken oberen Ecke ihres
 * Rechtecks — macht JEDES Rätsel eindeutig. Sie ist trotzdem unbrauchbar, weil
 * sie die Lösung verrät: geht man die Zellen in Leserichtung durch, dann ist die
 * erste noch nicht zugeordnete Zelle immer die linke obere Ecke ihres Rechtecks
 * und trägt damit immer eine Zahl. Wer das einmal bemerkt hat, hat das Spiel
 * nicht gelöst, sondern abgeschafft. Dasselbe gilt abgeschwächt für jede andere
 * einheitliche Regel.
 *
 * Eine GEMISCHTE Lage verrät nichts — und ist nur in 29 bis 40 % der Fälle
 * eindeutig. Genau diese Lücke schließt die Suche in suchePlaetze(): sie
 * verschiebt einzelne Zahlen, bis die Eindeutigkeit hält, ohne dass eine Regel
 * entsteht. Und sie wird VOR einer neuen Zerlegung probiert, weil eine
 * verschobene Zahl einen Löserlauf kostet und eine neue Zerlegung einen ganzen
 * neuen Anlauf: gemessen kam jedes einzelne der 240 geprüften Seeds mit der
 * ERSTEN Zerlegung aus.
 *
 *
 * MESSUNG DER ERZEUGUNGSZEIT
 * --------------------------
 * Node 22.22 auf einem Kern, je Stufe 60 Seeds ('e000'..'e059'), gemessen mit
 * process.hrtime.bigint() um erzeuge() herum, nach fünf Aufwärmläufen:
 *
 *   Stufe    Brett    Mittel   Median   langsamster   Zerlegungen   Löserläufe
 *   leicht    6×6     0,44 ms  0,29 ms    2,6 ms        1,00           2,1
 *   mittel    8×8     0,51 ms  0,32 ms    4,2 ms        1,00           3,4
 *   schwer   10×10    0,93 ms  0,64 ms    4,5 ms        1,00           5,3
 *   experte  12×12    1,07 ms  0,86 ms    4,4 ms        1,00           5,9
 *
 * Ohne Aufwärmen, also im frischen Prozess und mit dem ersten Aufruf überhaupt
 * (das ist der Fall, den ein Spieler beim Laden der Seite erlebt): 3,1 ms für
 * leicht bis 7,8 ms für schwer, dazu 7 ms für das Laden der Module.
 *
 * Das Ziel war "experte unter zwei Sekunden auf einem Mobiltelefon". Der
 * langsamste gemessene Lauf liegt bei 4,4 ms; selbst mit dem Faktor 10, den ein
 * älteres Telefon gegenüber einem Schreibtischrechner kostet, sind es 44 ms.
 * Die Grenze ist nicht knapp, sie ist um zwei Größenordnungen verfehlt — und
 * das ist der Grund, warum an keiner Stelle dieser Datei die Lesbarkeit für
 * Geschwindigkeit hergegeben wurde.
 *
 * Was diese Zeiten gemacht hat, war eine einzige Entscheidung, und sie ist
 * gemessen: die Auswahl der zu verschiebenden Zahl aus der ZWEITEN Lösung
 * (siehe ruecke). Ohne sie steigt experte auf 6,96 ms im Mittel und 35,2 ms im
 * schlechtesten Fall. Alles andere in dieser Datei ist für die Laufzeit
 * nachrangig; die Wirkung der übrigen Entscheidungen steht jeweils dort.
 */

import { STUFEN, gleich } from './shikaku.js';
import { bewerteSchwierigkeit, eindeutig, loesen } from './loeser.js';

/**
 * Deterministischer Zufall (mulberry32 über einen Hash des Seeds).
 *
 * Zwei Teile, und beide sind nötig: der Hash (FNV-1a) macht aus einer beliebig
 * langen Zeichenkette eine 32-Bit-Zahl, mulberry32 macht daraus einen Strom.
 * Der Seed ist eine Zeichenkette und keine Zahl, weil er in der Adresszeile und
 * im Enddialog stehen soll — 'a3f9c1' teilt man, 2745281 nicht.
 *
 * mulberry32 und nicht Math.random: das ganze Spiel hängt daran, dass dasselbe
 * Seed dasselbe Rätsel ergibt. Ein Spielstand im localStorage speichert nur
 * Stufe und Seed, kein Zahlenfeld; ein geteilter Link ist eine Stufe und ein
 * Seed. Math.random hat keinen Startwert und wäre damit für alles hier
 * unbrauchbar — auch für die Zahlplatz-Suche, deren Ergebnis reproduzierbar
 * sein muss.
 */
export function zufall(seed) {
  const text = typeof seed === 'string' ? seed : String(seed ?? '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Ein leerer Seed ergäbe den Startwert des Hashes; das ist ein zulässiger
  // Zustand für mulberry32, aber ein auffällig strukturierter. Ein Griff
  // weiter mischt ihn durch.
  let a = (h ^ 0x9e3779b9) >>> 0;
  return function naechste() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZEICHEN = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Woher ein frisches Seed seinen Zufall nimmt, wenn keine Quelle übergeben wird.
 *
 * Der eingebaute Zufall des Browsers wird hier nicht angerufen, und zwar
 * überall in dieser Datei nicht — auch nicht an der einen Stelle, an der es
 * harmlos wäre. Der Grund ist die Fehlersuche: ein versehentlicher Griff danach
 * im Erzeuger macht die Rätsel unreproduzierbar, und das fällt erst auf, wenn
 * jemand einen geteilten Link öffnet und ein anderes Rätsel sieht. Wenn im
 * ganzen ausführbaren Teil der Datei kein einziger solcher Aufruf steht, ist ein
 * schlichtes Durchsuchen der Datei der ganze Beweis.
 *
 * Also: die kryptografische Quelle der Umgebung, wenn es eine gibt, sonst die
 * Uhr samt einem Zähler — und beides fließt durch zufall(), damit auch ein
 * frisches Seed über denselben Weg entsteht wie alles andere. Der Zähler ist
 * nicht Zierde: zwei Rätsel, die in derselben Millisekunde begonnen werden
 * (Doppelklick auf "Neu"), hätten sonst dasselbe Seed.
 */
let seedZaehler = 0;

function frischeQuelle() {
  const krypto = globalThis.crypto;
  if (krypto && typeof krypto.getRandomValues === 'function') {
    const roh = krypto.getRandomValues(new Uint32Array(1))[0];
    return zufall(`${roh}:${seedZaehler++}`);
  }
  return zufall(`${Date.now()}:${seedZaehler++}`);
}

/** -> 6-stellige Zeichenkette aus [a-z0-9]. */
export function neuesSeed(zufallsQuelle) {
  const rnd = typeof zufallsQuelle === 'function' ? zufallsQuelle : frischeQuelle();
  let out = '';
  for (let i = 0; i < 6; i++) {
    // Math.min gegen eine fremde Quelle, die 1 zurückgibt: ZEICHEN[36] wäre
    // undefined, und das Seed hieße dann 'a3undefined9c'.
    const k = Math.min(ZEICHEN.length - 1, Math.floor(rnd() * ZEICHEN.length));
    out += ZEICHEN[k];
  }
  return out;
}

/**
 * Die Kennwerte der vier Stufen.
 *
 * `maxKante` und `maxWert` machen die Schwierigkeit, nicht die Brettgröße
 * allein. Eine 20 auf einem 12×12 hat mit maxKante 7 genau zwei Formen (4×5 und
 * 5×4); ohne die Kantenschranke käme 1×20, 2×10, 10×2 und 20×1 dazu, und ein
 * 1×20-Streifen ist für den Spieler keine Freude, sondern Buchhaltung.
 *
 * `einser` ist eine Obergrenze und kein Ziel. Eine 1 ist ein geschenktes
 * Rechteck: sie hat genau einen Kandidaten, wird von der Propagation sofort
 * gesetzt und nimmt dem Rätsel an dieser Stelle jede Frage. Zwei oder drei
 * davon lockern ein Brett auf, ein Dutzend macht es zur Fleißaufgabe.
 */
export const AUSMASS = {
  leicht:  { breite: 6,  hoehe: 6,  maxKante: 4, maxWert: 8,  einser: 2 },
  mittel:  { breite: 8,  hoehe: 8,  maxKante: 5, maxWert: 12, einser: 2 },
  schwer:  { breite: 10, hoehe: 10, maxKante: 6, maxWert: 16, einser: 1 },
  experte: { breite: 12, hoehe: 12, maxKante: 7, maxWert: 20, einser: 1 },
};

/** So viele Zerlegungs-Anläufe, bis zerlege() aufgibt. */
const ANLAEUFE_ZERLEGUNG = 80;

/** So viele Zerlegungen probiert erzeuge() je Ausmaß. */
const ZERLEGUNGEN = 24;

/** So viele Zahlplatz-Änderungen probiert die Suche je Zerlegung. */
const PLATZ_SCHRITTE = 120;

/**
 * Knotengrenze für die Eindeutigkeitsprüfung während der Suche.
 *
 * Das ist ausdrücklich KEINE Optimierung. Gemessen macht die Grenze überhaupt
 * keinen Unterschied: mit 8000 und mit der Standardgrenze 300000 kommen dieselben
 * Rätsel in derselben Zeit heraus, weil ein geprüfter Zwischenstand im Mittel
 * mit 2,6 Suchknoten entschieden ist und in keiner Messung ein einziger Lauf
 * abgebrochen wurde.
 *
 * Sie steht hier als Sicherung. Die Suche ruft loesen() bis zu PLATZ_SCHRITTE
 * mal, und ein einziger pathologischer Zwischenstand mit 300000 Knoten würde
 * den Druck auf "Neu" um eine Sekunde verzögern. Ein unentschiedener Stand
 * kostet die Suche nichts — sie schiebt ihn einfach weg.
 */
const KNOTEN_PRUEFUNG = 8000;

/**
 * So viele eindeutige Rätsel werden je Zerlegung auf ihre Schwierigkeit
 * angesehen, bevor das beste davon genommen wird.
 *
 * bewerteSchwierigkeit() ist der teuerste Aufruf im ganzen Erzeuger — es steckt
 * ein vollständiger logischer Löser samt Ausschlussrunden darin. Gemessen mit
 * 1000 statt 8 Proben (die Schranke also praktisch abgeschaltet): experte
 * 2,41 ms statt 1,07 ms im Mittel und 17,2 ms statt 4,4 ms im schlechtesten
 * Fall — bei genau derselben mittleren Schwierigkeit von 76 Punkten. Die
 * weiteren Proben finden nichts mehr, sie kosten nur.
 */
const GUETE_PROBEN = 8;

/* -------------------------------------------------------------- Zerlegung */

function mischen(liste, rnd) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const merk = liste[i];
    liste[i] = liste[j];
    liste[j] = merk;
  }
  return liste;
}

/**
 * Die Wunschfläche eines neuen Rechtecks.
 *
 * Nicht gleichverteilt, sondern über das PRODUKT zweier Zufallszahlen — das
 * drückt die Verteilung nach unten und ergibt viele kleine und mittlere, wenige
 * große Rechtecke. Es geht um die Dichte der Zahlen auf dem Brett, und die
 * entscheidet über die Schwierigkeit. Beide Fassungen gemessen, je 60 Rätsel
 * der vier Stufen:
 *
 *                        Zahlen auf dem Brett     mittlere Fläche   Punkte
 *   Produkt (so)         11,5 / 16,6 / 21,7 / 27,9   3,1 … 5,2     25/38/53/76
 *   gleichverteilt        8,8 / 11,8 / 15,0 / 18,5   4,1 … 7,8     20/31/41/50
 *
 * Gleichverteilt landet die mittlere Fläche bei maxWert/2, und dann stehen nur
 * 18 Zahlen auf 144 Feldern. Das ist nicht bloß eine Frage des Aussehens: mit
 * weniger Zahlen gibt es weniger Angriffspunkte, und der logische Löser kommt
 * mit weniger Schlüssen durch — gemessen 50 statt 76 Punkte auf experte, also
 * ein Rätsel, das nach der Einstufung in loeser.js gerade noch "schwer" wäre.
 *
 * Untergrenze 2 und nicht 1: Einser entstehen ohnehin von selbst, wenn die
 * Zerlegung sich in eine Ecke gearbeitet hat. Sie auch noch zu würfeln wäre
 * doppelt.
 */
function wunschFlaeche(rnd, maxWert, maxKante) {
  const ober = Math.max(2, Math.min(maxWert, maxKante * maxKante));
  return 2 + Math.floor(rnd() * rnd() * (ober - 1));
}

/** Ist die Spalte x von Zeile y an, h Zellen hoch, noch unbesetzt? */
function spalteFrei(besitzer, breite, x, y, h) {
  for (let yy = y; yy < y + h; yy++) {
    if (besitzer[yy * breite + x] >= 0) return false;
  }
  return true;
}

/** Ist die Zeile y von Spalte x an, b Zellen breit, noch unbesetzt? */
function zeileFrei(besitzer, breite, x, y, b) {
  const zeile = y * breite;
  for (let xx = x; xx < x + b; xx++) {
    if (besitzer[zeile + xx] >= 0) return false;
  }
  return true;
}

/**
 * Ein Anlauf: Rechtecke aus dem freien Feld wachsen lassen, bis nichts frei ist.
 *
 * Die Zellen werden in GEMISCHTER Reihenfolge angefasst. Wer noch frei ist,
 * wird zum Ansatz eines neuen Rechtecks, und das wächst in zufällige
 * Richtungen, solange es ganz im freien Bereich bleibt und die Schranken hält.
 *
 * Verworfen: die Guillotine-Zerlegung (das Rechteck wiederholt mit einem
 * durchgehenden Schnitt in zwei teilen, rekursiv, bis alle Teile klein genug
 * sind). Die terminiert von selbst, braucht keine Aufräumrunde und erzeugt
 * überhaupt keine Einzelzellen — technisch der bessere Algorithmus. Aber sie
 * kann nur einen Teil aller Zerlegungen erzeugen: alles, was wie ein Windrad
 * ineinandergreift, ist mit durchgehenden Schnitten nicht zu bauen. Genau
 * solche Stellen sind die interessanten in einem Shikaku, und ein Brett aus
 * Guillotine-Schnitten sieht man an: es zerfällt sichtbar in Blöcke.
 *
 * Verworfen auch: immer die Zelle mit den WENIGSTEN FREIEN NACHBARN zuerst
 * anzufassen (also Zwickel und Ecken vor der freien Fläche). Diese Fassung war
 * gebaut und gemessen, und sie tut genau, was sie soll — Einzelzellen je Brett
 * 0,10 / 0,07 / 0,08 / 0,03 statt 0,27 / 0,40 / 0,43 / 0,48. Sie macht die
 * Rätsel aber messbar leichter: 24 / 38 / 50 / 66 Punkte statt 25 / 38 / 53 / 76.
 * Der Grund liegt auf der Hand, wenn man ein solches Brett ansieht: wer die
 * Zwickel zuerst füllt, füllt sie mit kleinen Rechtecken, und kleine Rechtecke
 * am Rand sind der leichteste Einstieg, den ein Shikaku haben kann.
 *
 * Die gemischte Reihenfolge lässt mehr Einzelzellen übrig, und die Aufräumrunde
 * unten holt sie sich zurück — das genügt, um die Schranke aus AUSMASS zu
 * halten (gemessen bleiben 0,27 bis 0,48 je Brett bei erlaubten 1 bis 2).
 */
function einAnlauf(breite, hoehe, rnd, maxKante, maxWert) {
  const zellen = breite * hoehe;
  const besitzer = new Int32Array(zellen).fill(-1);
  const reihenfolge = [];
  for (let k = 0; k < zellen; k++) reihenfolge.push(k);
  mischen(reihenfolge, rnd);
  const teile = [];
  const richtungen = [0, 1, 2, 3];

  for (const start of reihenfolge) {
    if (besitzer[start] >= 0) continue;
    const cy = Math.floor(start / breite);
    let x = start - cy * breite;
    let y = cy;
    let b = 1;
    let h = 1;
    const ziel = wunschFlaeche(rnd, maxWert, maxKante);

    let gewachsen = true;
    while (gewachsen && b * h < ziel) {
      gewachsen = false;
      mischen(richtungen, rnd);
      for (const richtung of richtungen) {
        if (richtung === 0) {
          if (x === 0 || b + 1 > maxKante || (b + 1) * h > maxWert) continue;
          if (!spalteFrei(besitzer, breite, x - 1, y, h)) continue;
          x -= 1;
          b += 1;
        } else if (richtung === 1) {
          if (x + b >= breite || b + 1 > maxKante || (b + 1) * h > maxWert) continue;
          if (!spalteFrei(besitzer, breite, x + b, y, h)) continue;
          b += 1;
        } else if (richtung === 2) {
          if (y === 0 || h + 1 > maxKante || b * (h + 1) > maxWert) continue;
          if (!zeileFrei(besitzer, breite, x, y - 1, b)) continue;
          y -= 1;
          h += 1;
        } else {
          if (y + h >= hoehe || h + 1 > maxKante || b * (h + 1) > maxWert) continue;
          if (!zeileFrei(besitzer, breite, x, y + h, b)) continue;
          h += 1;
        }
        gewachsen = true;
        break;
      }
    }

    const i = teile.length;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + b; xx++) besitzer[yy * breite + xx] = i;
    }
    teile.push({ x, y, b, h });
  }
  return { teile, besitzer };
}

/**
 * Ist die Vereinigung zweier Rechtecke wieder ein Rechteck? -> das Rechteck oder null.
 *
 * Das ist genau dann der Fall, wenn sie eine ganze Kante teilen: gleiche Spalte
 * und gleiche Breite, direkt übereinander — oder gleiche Zeile und gleiche
 * Höhe, direkt nebeneinander. Alles andere ergibt eine Treppe oder ein L.
 */
function vereinigung(a, b) {
  if (a.x === b.x && a.b === b.b) {
    if (a.y + a.h === b.y) return { x: a.x, y: a.y, b: a.b, h: a.h + b.h };
    if (b.y + b.h === a.y) return { x: a.x, y: b.y, b: a.b, h: a.h + b.h };
  }
  if (a.y === b.y && a.h === b.h) {
    if (a.x + a.b === b.x) return { x: a.x, y: a.y, b: a.b + b.b, h: a.h };
    if (b.x + b.b === a.x) return { x: b.x, y: a.y, b: a.b + b.b, h: a.h };
  }
  return null;
}

/**
 * Aufräumrunde: Einzelzellen mit einem Nachbarn verschmelzen.
 *
 * Eine 1 im Rätsel ist ein geschenktes Rechteck (siehe AUSMASS.einser), und der
 * Wachstumsanlauf hinterlässt gelegentlich eine, weil er sich in einen Zwickel
 * gearbeitet hat. Verschmolzen wird nur, wenn dabei WIEDER ein Rechteck
 * entsteht — sonst wäre es keine Zerlegung mehr.
 *
 * Diese Runde ist der Grund, warum die Zerlegung überhaupt durchkommt. Gemessen
 * an je 500 Zerlegungen mit abgeschalteter Verwerfensschranke, Einzelzellen je
 * Brett:
 *
 *              leicht      mittel      schwer      experte
 *   mit         0,32        0,46        0,56        0,74
 *   ohne        1,71        2,18        2,58        3,22
 *   erlaubt     2           2           1           1
 *
 * Ohne die Runde liegt der Schnitt also für jede Stufe ÜBER dem Erlaubten, und
 * zerlege() würde seine Anläufe damit verbringen, Bretter wegzuwerfen.
 *
 * Von den möglichen Nachbarn wird der genommen, der die KLEINSTE Vereinigung
 * ergibt. Auch die andere Wahl (der größte, "möglichst viel wegräumen") wurde
 * gemessen und ändert an Schwierigkeit und Einserzahl nichts — Verschmelzungen
 * sind mit weniger als einer je Brett zu selten dafür. Es bleibt ein Argument
 * der Form: aus einer Einzelzelle neben einem 2×5 würde sonst ein 2×6, also die
 * größte im Brett überhaupt erlaubte Zahl an einer Stelle, an der sie nichts als
 * ein Aufräumrest ist.
 */
function verschmelze(zerlegung, breite, hoehe, maxKante, maxWert) {
  const { teile, besitzer } = zerlegung;
  const umher = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (let i = 0; i < teile.length; i++) {
    const r = teile[i];
    if (!r || r.b * r.h !== 1) continue;
    let ziel = -1;
    let neu = null;
    for (const [dx, dy] of umher) {
      const nx = r.x + dx;
      const ny = r.y + dy;
      if (nx < 0 || ny < 0 || nx >= breite || ny >= hoehe) continue;
      const j = besitzer[ny * breite + nx];
      if (j < 0 || j === i || !teile[j]) continue;
      const u = vereinigung(r, teile[j]);
      if (!u) continue;
      if (u.b > maxKante || u.h > maxKante || u.b * u.h > maxWert) continue;
      if (!neu || u.b * u.h < neu.b * neu.h) {
        ziel = j;
        neu = u;
      }
    }
    if (ziel < 0) continue;
    teile[ziel] = neu;
    teile[i] = null;
    besitzer[r.y * breite + r.x] = ziel;
  }
}

/**
 * Zerlegt das Raster restlos in Rechtecke.
 *
 * -> Array von Rechtecken oder null, wenn es in der gegebenen Zahl von
 * Anläufen nicht aufgegangen ist.
 *
 * "Nicht aufgegangen" heißt hier immer dasselbe: zu viele Einzelzellen. Die
 * Zerlegung selbst gelingt IMMER — jede Zelle, die kein Rechteck aufnimmt, wird
 * zu einem eigenen 1×1, und schlimmstenfalls ist das Ergebnis ein Brett aus
 * Einsern. Nur ist ein solches Brett kein Rätsel, und darum wird es verworfen.
 *
 * Gemessen über je 500 Aufrufe der vier Ausmaße: 500 von 500 Aufrufen lieferten
 * eine brauchbare Zerlegung, und sie brauchten dafür im Mittel 1,00 (leicht und
 * mittel), 1,11 (schwer) und 1,20 (experte) innere Anläufe. Die Schranke
 * ANLAEUFE_ZERLEGUNG ist mit 80 also weit über dem, was jemals gebraucht wurde;
 * sie ist eine Sicherung gegen Grenzen, die niemand für möglich hält (etwa ein
 * 5×5-Brett mit maxWert 2, in dem es keine Zerlegung ohne Einzelzelle GIBT).
 */
export function zerlege(breite, hoehe, rnd, grenzen) {
  if (!Number.isInteger(breite) || !Number.isInteger(hoehe)) return null;
  if (breite < 1 || hoehe < 1) return null;
  if (typeof rnd !== 'function') return null;
  const g = grenzen || {};
  const maxKante = Number.isInteger(g.maxKante) ? g.maxKante : Math.max(breite, hoehe);
  const maxWert = Number.isInteger(g.maxWert) ? g.maxWert : breite * hoehe;
  const maxEinser = Number.isInteger(g.einser) ? g.einser : breite * hoehe;

  for (let anlauf = 0; anlauf < ANLAEUFE_ZERLEGUNG; anlauf++) {
    const zerlegung = einAnlauf(breite, hoehe, rnd, maxKante, maxWert);
    verschmelze(zerlegung, breite, hoehe, maxKante, maxWert);
    const teile = zerlegung.teile.filter(Boolean);
    let einser = 0;
    for (const r of teile) if (r.b * r.h === 1) einser += 1;
    if (einser <= maxEinser) return teile;
  }
  return null;
}

/* ---------------------------------------------------------- Zahlplätze */

/**
 * Die Stellen, an denen die Zahl eines Rechtecks stehen darf: die vier Ecken
 * und die Mitte.
 *
 * Nur diese und nicht alle Zellen. Die Fassung mit allen Zellen wurde gebaut
 * und gemessen, und sie ist nicht schlechter: 0,89 ms statt 1,07 ms auf experte
 * (also sogar etwas schneller, weil eine größere Auswahl schneller eine
 * eindeutige Lage trifft) bei 72 statt 76 Punkten Schwierigkeit. Der Unterschied
 * ist klein, und wer diese Datei ändern will, soll wissen, dass hier nichts
 * Wichtiges an der Beschränkung hängt.
 *
 * Geblieben ist sie aus zwei Gründen. Der eine ist die Lesbarkeit des fertigen
 * Brettes: eine Zahl in einer Ecke oder in der Mitte sieht gesetzt aus, eine
 * Zahl auf der dritten von fünf Zellen sieht verrutscht aus. Der andere ist die
 * Beschränktheit der Suche — mit sechs Plätzen je Rechteck läuft `wahl` einen
 * kleinen Zyklus, mit zwanzig läuft sie einen, der praktisch nie durch ist, und
 * PLATZ_SCHRITTE müsste an das Ausmaß gekoppelt werden.
 *
 * Bei geraden Kantenlängen gibt es keine echte Mitte; dann kommen beide
 * mittleren Zellen in Frage. Doppelte fallen heraus, damit ein 1×1 genau einen
 * Platz hat und die Suche dort nichts zu verschieben versucht.
 */
function zahlplaetze(r) {
  const xs = [r.x, r.x + r.b - 1, r.x + ((r.b - 1) >> 1), r.x + (r.b >> 1)];
  const ys = [r.y, r.y + r.h - 1, r.y + ((r.h - 1) >> 1), r.y + (r.h >> 1)];
  const roh = [
    [xs[0], ys[0]], [xs[1], ys[0]], [xs[0], ys[1]], [xs[1], ys[1]],
    [xs[2], ys[2]], [xs[3], ys[2]], [xs[2], ys[3]], [xs[3], ys[3]],
  ];
  const gesehen = new Set();
  const plaetze = [];
  for (const [x, y] of roh) {
    const schluessel = `${x},${y}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    plaetze.push([x, y]);
  }
  return plaetze;
}

/** Wo weicht eine der gefundenen Lösungen von der gewollten Zerlegung ab? */
function abweichungen(loesungen, teile) {
  for (const l of loesungen) {
    const anders = [];
    for (let i = 0; i < teile.length; i++) {
      if (!gleich(l[i], teile[i])) anders.push(i);
    }
    if (anders.length) return anders;
  }
  return [];
}

/**
 * Einen Zahlplatz weiterrücken. -> false, wenn es nichts zu rücken gibt.
 *
 * Gerückt wird bevorzugt dort, wo die zweite Lösung von der gewollten abweicht.
 * Das ist der ganze Trick an dieser Suche: die zweite Lösung sagt nicht nur DASS
 * das Rätsel mehrdeutig ist, sie sagt auch WO. An einer Stelle, an der beide
 * Lösungen übereinstimmen, ist nichts zu reparieren, und ein Rücken dort
 * verschiebt bloß irgendwas.
 *
 * Das ist die einzige Entscheidung in dieser Datei, die für die Laufzeit
 * wirklich zählt. Gemessen an je 60 Rätseln der vier Stufen, Rückungen je
 * erzeugtem Rätsel:
 *
 *                        leicht  mittel  schwer  experte
 *   mit Hinweis            1,1     2,4     4,3     4,9
 *   zufällige Stelle       6,9    17,6    37,0    65,8
 *
 * Und in der Zeit, auf experte: 1,07 ms im Mittel und 4,4 ms im schlechtesten
 * Fall gegen 6,96 ms und 35,2 ms. Ohne den Hinweis reichte außerdem die erste
 * Zerlegung nicht mehr immer (1,22 Zerlegungen je Rätsel statt 1,00) — die 120
 * Schritte gingen also gelegentlich aus, bevor eine eindeutige Lage gefunden war.
 */
function ruecke(rnd, wahl, varianten, beweglich, anders) {
  let auswahl = beweglich;
  if (anders && anders.length) {
    const eng = anders.filter((i) => varianten[i].length > 1);
    if (eng.length) auswahl = eng;
  }
  if (!auswahl.length) return false;
  const i = auswahl[Math.floor(rnd() * auswahl.length)];
  wahl[i] = (wahl[i] + 1) % varianten[i].length;
  return true;
}

/**
 * Was eine Stufe von ihrem Rätsel VERLANGT.
 *
 * Auf 'leicht' und 'mittel' muss der logische Löser ohne Raten durchkommen —
 * das ist kein Feinschliff, sondern das Versprechen dieser Stufen: wer geduldig
 * genug ist, kommt an. Auf 'schwer' und 'experte' genügt die Eindeutigkeit; wer
 * dort spielt, darf eine Stelle finden, an der man eine Möglichkeit annehmen und
 * zum Widerspruch führen muss.
 */
function pflichtErfuellt(stufe, bewertung) {
  if (stufe === 'leicht' || stufe === 'mittel') return !bewertung.raten;
  return true;
}

/**
 * Was eine Stufe sich WÜNSCHT: dass bewerteSchwierigkeit() das Rätsel
 * mindestens so hoch einstuft, wie es beschriftet ist.
 *
 * Ausgedrückt über die gemessene Stufe und nicht über eine Punktzahl, weil die
 * Punktzahlen der vier Stufen sehr verschiedene Größenordnungen haben (24 bis
 * 72, siehe GRENZEN in loeser.js) — eine Zahl hier wäre eine zweite,
 * unabhängig gepflegte Kopie derselben Grenzen, und die läuft irgendwann
 * auseinander.
 *
 * Was der Wunsch bewirkt, ist nicht, was man erwartet. Gemessen an je 120
 * Rätseln mit und ohne Wunsch bleibt der MITTELWERT der Punkte praktisch gleich
 * (experte 76 gegen 75) — was sich hebt, ist der UNTERE Rand:
 *
 *              schlechtestes von 120     mit Wunsch
 *   mittel              19                  23
 *   schwer              29                  39
 *   experte             40                  50
 *
 * Der Wunsch fängt also nicht den Durchschnitt, sondern den Ausrutscher: das
 * eine 12×12, das zufällig so glatt aufgeht, dass es sich wie ein 8×8 spielt.
 * Genau der fällt einem Spieler auf, und genau der lässt ihn an der Einstufung
 * zweifeln. Bezahlt wird das mit 1,07 ms statt 0,70 ms auf experte.
 */
function wunschErfuellt(stufe, bewertung) {
  return STUFEN.indexOf(bewertung.stufe) >= STUFEN.indexOf(stufe);
}

/**
 * Sucht zu einer festen Zerlegung eine Zahlenlage, die eindeutig ist und zur
 * Stufe passt. -> { zahlen, loesung } oder null.
 *
 * Der Ablauf ist eine lokale Suche und kein Durchprobieren: bei 28 Rechtecken
 * mit je bis zu 8 Plätzen gibt es in der Größenordnung 8^28 Zahlenlagen, das ist
 * nicht abzusuchen. Stattdessen wird eine Lage genommen, geprüft, und der
 * Hinweis aus der zweiten Lösung sagt, welche Zahl als nächste verschoben wird
 * (siehe ruecke). Gemessen genügen dafür 1,1 (leicht) bis 4,9 (experte)
 * Verschiebungen, und jedes von 240 geprüften Seeds kam mit der ersten
 * Zerlegung aus.
 *
 * Die Startlage ist gemischt und nicht einheitlich, und das ist wichtig: die
 * Plätze JEDES Rechtecks werden für sich gemischt, `wahl` steht überall auf 0.
 * Eine einheitliche Startlage — überall die linke obere Ecke — wäre sofort
 * eindeutig und die Suche wäre nach einem Schritt fertig (siehe die Messung im
 * Dateikopf: 100 %). Sie wäre aber auch ein Rätsel, das seine Lösung in der
 * Konvention mitteilt, und die Suche dürfte gar nichts mehr verschieben, ohne
 * es zu verlieren.
 */
function suchePlaetze(teile, stufe, mass, rnd) {
  const varianten = teile.map((r) => mischen(zahlplaetze(r), rnd));
  const wahl = new Int32Array(teile.length);
  const beweglich = [];
  for (let i = 0; i < varianten.length; i++) {
    if (varianten[i].length > 1) beweglich.push(i);
  }

  let notnagel = null;
  let proben = 0;

  for (let schritt = 0; schritt < PLATZ_SCHRITTE; schritt++) {
    const zahlen = [];
    for (let i = 0; i < teile.length; i++) {
      const platz = varianten[i][wahl[i]];
      zahlen.push({ x: platz[0], y: platz[1], wert: teile[i].b * teile[i].h });
    }
    const raetsel = {
      breite: mass.breite, hoehe: mass.hoehe, stufe, seed: '', zahlen,
    };
    const erg = loesen(raetsel, { maxLoesungen: 2, maxKnoten: KNOTEN_PRUEFUNG });

    if (erg.anzahl === 1 && !erg.abgebrochen) {
      const bewertung = bewerteSchwierigkeit(raetsel);
      if (pflichtErfuellt(stufe, bewertung)) {
        if (wunschErfuellt(stufe, bewertung)) {
          return { zahlen, loesung: teile };
        }
        if (!notnagel || bewertung.punkte > notnagel.punkte) {
          notnagel = { zahlen, punkte: bewertung.punkte };
        }
        proben += 1;
        if (proben >= GUETE_PROBEN) break;
      }
      if (!ruecke(rnd, wahl, varianten, beweglich, null)) break;
      continue;
    }

    // Mehrdeutig oder unentschieden: dort rücken, wo die Lösungen auseinandergehen.
    const anders = erg.abgebrochen ? null : abweichungen(erg.loesungen, teile);
    if (!ruecke(rnd, wahl, varianten, beweglich, anders)) break;
  }

  // Nichts, was den Wunsch erfüllt — dann das beste, das die Pflicht erfüllt.
  // Ein etwas zu zahmes 'experte' ist ein Rätsel; keines ist keines.
  if (notnagel) return { zahlen: notnagel.zahlen, loesung: teile };
  return null;
}

/* -------------------------------------------------------------- Erzeugen */

/**
 * Die Kette der Ausmaße, die erzeuge() der Reihe nach probiert.
 *
 * Reißt die Anlaufgrenze auf 'experte', wird 'schwer' probiert und so weiter.
 * Die Stufe im Rätsel bleibt dabei die GEWÜNSCHTE — sie ist die Beschriftung
 * der Rangliste, und ein Spieler, der auf experte gedrückt hat, soll seine Zeit
 * auch dort eingetragen bekommen. Nur das Brett ist dann kleiner.
 *
 * Gemessen ist dieser Weg noch nie gegangen worden: über 280 Seeds je Stufe
 * kam jedes einzelne Rätsel mit der ersten Zerlegung des eigenen Ausmaßes aus
 * (versuche === 1). Er steht hier, weil die Alternative eine Schleife wäre, die
 * unter unglücklichen Umständen nicht zurückkommt — und ein Spiel, das beim
 * Druck auf "Neu" hängt, ist schlimmer als eines, das ein zu kleines Brett zeigt.
 */
function ausmassKette(stufe) {
  const rang = STUFEN.indexOf(stufe);
  const kette = [];
  for (let i = rang; i >= 0; i--) kette.push(STUFEN[i]);
  return kette;
}

/** Aus Zerlegung und Zahlenlage das fertige Rätsel — in Leserichtung sortiert. */
function fertigstellen(fund, stufe, saat, mass, versuche) {
  // Sortiert wird, weil die Zerlegung in ihrer Wachstumsreihenfolge vorliegt
  // und die damit vom Zufall abhängt. Die Zahlen eines Rätsels sollen in
  // Leserichtung stehen: so liest sich das gespeicherte JSON wie das Brett,
  // und die Oberfläche kann sie ohne Umsortieren durchgehen. Die Lösung wird
  // mit sortiert — sie MUSS parallel bleiben.
  const paare = fund.zahlen.map((z, i) => ({ z, r: fund.loesung[i] }));
  paare.sort((a, b) => (a.z.y - b.z.y) || (a.z.x - b.z.x));
  return {
    raetsel: {
      breite: mass.breite,
      hoehe: mass.hoehe,
      stufe,
      seed: saat,
      zahlen: paare.map((p) => ({ x: p.z.x, y: p.z.y, wert: p.z.wert })),
    },
    loesung: paare.map((p) => ({ x: p.r.x, y: p.r.y, b: p.r.b, h: p.r.h })),
    versuche,
  };
}

/**
 * Der Notausgang: ein Brett aus Einsern.
 *
 * Langweilig, aber unbestreitbar ein gültiges Shikaku — jede Zelle ist ihr
 * eigenes Rechteck, es gibt genau eine Lösung, und der logische Löser findet
 * sie ohne einen einzigen Zweifel. Erreicht wird das nur, wenn die ganze Kette
 * der Ausmaße durchgefallen ist, was in keiner Messung vorkam. Der Zweck ist
 * allein, dass erzeuge() unter allen Umständen ein brauchbares Rätsel
 * zurückgibt und nie null und nie eine Ausnahme.
 *
 * Und ein zweiter, unscheinbarer Zweck: dieses Brett ist der Beweis, dass es
 * für JEDES Ausmaß mindestens ein eindeutiges Rätsel gibt. Ein Erzeuger, der
 * nach etwas sucht, das möglicherweise nicht existiert, braucht ein Notdach.
 */
function notausgang(stufe, saat, versuche) {
  const mass = AUSMASS.leicht;
  const zahlen = [];
  const loesung = [];
  for (let y = 0; y < mass.hoehe; y++) {
    for (let x = 0; x < mass.breite; x++) {
      zahlen.push({ x, y, wert: 1 });
      loesung.push({ x, y, b: 1, h: 1 });
    }
  }
  return {
    raetsel: { breite: mass.breite, hoehe: mass.hoehe, stufe, seed: saat, zahlen },
    loesung,
    versuche,
  };
}

/**
 * Erzeugt ein spielbares, EINDEUTIG lösbares Rätsel der gewünschten Stufe.
 *
 * -> { raetsel, loesung, versuche }
 *
 * `versuche` zählt die Zerlegungen, die dafür gebraucht wurden — nützlich für
 * die Messung und für die Tests, sonst für nichts.
 *
 * Determinismus: dasselbe (stufe, seed) ergibt dasselbe Rätsel. Der ganze Lauf
 * hängt an einem einzigen Zufallsstrom aus zufall(), und in den geht die Stufe
 * mit ein — dasselbe Seed auf 'leicht' und auf 'schwer' soll nicht dasselbe
 * Muster in zwei Größen ergeben.
 *
 * Wird kein Seed übergeben, wird eines gezogen und im Rätsel hinterlegt. Es
 * steht dort auch dann, wenn es übergeben wurde: das Rätsel trägt immer, was
 * man braucht, um es wiederherzustellen.
 */
export function erzeuge(stufe, seed) {
  const gewuenscht = STUFEN.includes(stufe) ? stufe : 'mittel';
  const saat = typeof seed === 'string' && seed.length > 0 ? seed : neuesSeed();
  const rnd = zufall(`${gewuenscht}:${saat}`);
  let versuche = 0;

  for (const name of ausmassKette(gewuenscht)) {
    const mass = AUSMASS[name];
    for (let anlauf = 0; anlauf < ZERLEGUNGEN; anlauf++) {
      versuche += 1;
      const teile = zerlege(mass.breite, mass.hoehe, rnd, mass);
      if (!teile) continue;
      const fund = suchePlaetze(teile, gewuenscht, mass, rnd);
      if (!fund) continue;
      const ergebnis = fertigstellen(fund, gewuenscht, saat, mass, versuche);
      // Das letzte Tor, mit der vollen Knotengrenze und auf dem FERTIGEN,
      // sortierten Rätsel. Die Suche hat mit der kleinen Grenze
      // KNOTEN_PRUEFUNG und auf der unsortierten Zahlenliste gearbeitet, und
      // beides ändert an der Eindeutigkeit nichts — aber "kein Rätsel verlässt
      // den Erzeuger, für das eindeutig() nicht wahr ist" ist die eine
      // Zusicherung, an der das ganze Spiel hängt, und sie soll nicht aus einer
      // Kette von Überlegungen kommen, sondern aus einem Aufruf. Kostet einen
      // Löserlauf je erzeugtem Rätsel, gemessen 0,07 ms.
      if (eindeutig(ergebnis.raetsel)) return ergebnis;
    }
  }
  return notausgang(gewuenscht, saat, versuche);
}
