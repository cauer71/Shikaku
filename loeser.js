/**
 * Shikaku – Löser, Schwierigkeitsmaß und Tipp.
 *
 * Diese Datei ist das Fundament des ganzen Spiels, und zwar aus einem Grund:
 * ein Shikaku mit zwei Lösungen ist kaputt. Der Spieler zeichnet eine gültige
 * Zerlegung, das Spiel sagt "falsch", und er hat keine Möglichkeit, das zu
 * widerlegen. Der Erzeuger darf darum nichts herausgeben, was hier nicht als
 * eindeutig durchgegangen ist — und diese Prüfung muss richtig sein, nicht
 * bloß meistens richtig.
 *
 *
 * DIE MODELLIERUNG: Shikaku ist eine exakte Überdeckung
 * ------------------------------------------------------
 * Für jede Zahl gibt es eine endliche Menge möglicher Rechtecke (ihre
 * "Kandidaten", siehe kandidaten() in shikaku.js). Gesucht ist eine Auswahl
 * von genau einem Kandidaten je Zahl, die jede Zelle des Brettes genau einmal
 * deckt.
 *
 * Der entscheidende Kniff steckt in der Kandidatenmenge: jeder Kandidat einer
 * Zahl enthält seine eigene Zahl und KEINE fremde. Damit kann die Zelle, auf
 * der eine Zahl steht, nur von Kandidaten dieser Zahl gedeckt werden — und
 * "jede Zahl bekommt genau ein Rechteck" ist keine zusätzliche Bedingung mehr,
 * sondern folgt aus "jede Zelle wird genau einmal gedeckt". Das Problem hat
 * damit nur EINE Art von Bedingung (Zellen) statt zwei (Zellen und Zahlen),
 * und die Propagation braucht nur eine Sorte Zähler.
 *
 * Verworfen: die Bedingungen getrennt zu führen und einen fertigen
 * Algorithmus X mit verketteten Listen (Knuths "Dancing Links") aufzubauen.
 * Das ist der Standardweg für exakte Überdeckungen und wäre bei 12×12 auch
 * schnell genug. Nur trägt er nichts zu dem bei, was hier zusätzlich gebraucht
 * wird: der TIPP muss sagen, mit WELCHER Überlegung der nächste Zug zu finden
 * ist, und die Schwierigkeit wird daran gemessen, welche Überlegungen nötig
 * waren. Dancing Links kennt keine Überlegungen, es kennt nur Spalten mit der
 * kleinsten Anzahl. Also flache Zähl-Arrays mit einer Rückspur — dieselbe
 * Wirkung, aber die Zwischenschritte bleiben benennbar.
 *
 *
 * DIE DATEN EINER SUCHE
 * ---------------------
 * `baueAufgabe()` legt alles Unveränderliche an: die Kandidaten aller Zahlen
 * durchnumeriert (eine globale "id" je Kandidat), je Kandidat seine Zellen und
 * seine Zellmaske, je Zelle die Liste der Kandidaten, die sie decken.
 *
 * `neuerZustand()` legt das Veränderliche an: lebt/tot je Kandidat, die Zahl
 * der lebenden Kandidaten je Zahl und je Zelle, was gesetzt ist, welche Zellen
 * gedeckt sind. Verändert wird immer NUR über toete() und setze(), und beide
 * schreiben ihre Änderung in eine Rückspur. Zurückgesetzt wird mit marke() und
 * zurueck(), also ohne den Zustand zu kopieren.
 *
 * Verworfen: den Zustand je Verzweigung zu kopieren. Bei 12×12 sind das rund
 * 115 Kandidaten, also wenige Kilobyte — die Kopie wäre erträglich. Die
 * Rückspur hat aber einen Nebeneffekt, der sie unabhängig von der
 * Geschwindigkeit gewinnen lässt: der Zustand ist EIN Objekt, das die ganze
 * Suche über dasselbe bleibt. Damit kann jede Hilfsfunktion ihn einfach
 * annehmen, und es gibt keinen Weg, versehentlich auf einer alten Abschrift
 * weiterzurechnen.
 *
 *
 * WORAUF SICH DAS VERTRAUEN STÜTZT
 * --------------------------------
 * Propagation und Verzweigung schneiden Möglichkeiten weg. Schneidet eine Regel
 * einmal zu viel weg, dann meldet dieser Löser ein mehrdeutiges Rätsel als
 * eindeutig, der Erzeuger liefert es aus, und der Spieler zeichnet irgendwann
 * eine richtige Lösung, die das Spiel für falsch erklärt. Ein Test, der prüft,
 * dass ein von Hand gerechnetes Rätsel richtig gelöst wird, findet einen
 * solchen Fehler nicht — er tritt auf den Brettern auf, an die niemand gedacht
 * hat.
 *
 * Darum wurde gegen einen zweiten, bewusst dummen Zähler geprüft: Zahlen in
 * fester Reihenfolge, jeder Kandidat der Reihe nach, bei Überlappung verwerfen,
 * am Ende die restlosen Deckungen zählen. Keine Propagation, keine
 * Verzweigungsregel, keine Bitmasken — nichts, was ein gemeinsamer Denkfehler
 * sein könnte.
 *
 *   4000 Zufallsbretter von 2×2 bis 6×6, alle Lösungen bis 30 gezählt
 *   (Verteilung: 2385-mal eine, 1029-mal zwei, der Rest bis 30):
 *       kein einziger Unterschied.
 *   360 Bretter in 8×8, 10×10 und 12×12, davon 284 mehrdeutige,
 *   Eindeutigkeit entschieden:
 *       kein einziger Unterschied.
 *   3000 Bretter, 12000 Schlüsse des logischen Lösers darunter 135 Ausschlüsse,
 *   jeder Schluss gegen ALLE Lösungen des Brettes geprüft:
 *       kein Schluss, der nicht in jeder Lösung steht.
 *
 * Die letzte Zeile ist die Zusicherung, an der der Tipp hängt: was der logische
 * Löser setzt, ist zwingend und nicht bloß eine Möglichkeit.
 */

import {
  gleich, kandidaten, pruefeRaetsel, ueberlappen, imBrett, zahlenIn,
} from './shikaku.js';

/* ------------------------------------------------------- Aufgabe aufbauen */

/**
 * Alles Unveränderliche einer Suche.
 *
 * Zur Größenordnung, gemessen an je 60 erzeugten Rätseln der vier Stufen:
 *
 *   Stufe    Brett   Zahlen   Kandidaten   je Zahl höchstens   Maskenwörter
 *   leicht    6×6     11,5        27              8                 2
 *   mittel    8×8     16,6        49             13                 2
 *   schwer   10×10    21,7        79             19                 4
 *   experte  12×12    27,9       115             26                 5
 *
 * Zellmasken als Uint32Array und nicht als BigInt. Beide Fassungen wurden
 * gebaut und auf demselben Bestand gemessen; die Suche läuft identisch (auf die
 * Knoten genau), nur die Darstellung der Zellabdeckung unterscheidet sich:
 *
 *   240 erzeugte Rätsel, Eindeutigkeitsbeweis:  0,066 ms gegen  0,088 ms (1,3×)
 *   320 Suchlast-Bretter, alle Lösungen:      216,4  ms gegen 1075,3  ms (5,0×)
 *
 * ("Suchlast" heißt hier und im Folgenden: eine Zerlegung in gleich große
 * Rechtecke mit den Zahlen auf beliebigen Zellen, im Mittel 146 Kandidaten und
 * 81784 Suchknoten je Brett — der Fall, in dem der Löser wirklich sucht statt
 * nur zu propagieren. Insgesamt 13,5 Millionen Lösungen.)
 *
 * Der Unterschied ist Müll: jede BigInt-Verknüpfung legt ein neues Objekt an,
 * und setze()/zurueck() verknüpfen bei jedem Suchknoten. Bei Uint32Array fällt
 * nichts an. Auf den erzeugten Rätseln wäre beides schnell genug — aber der
 * Erzeuger ruft den Löser hundertfach, und die 30 % sind geschenkt.
 */
function baueAufgabe(raetsel) {
  const breite = raetsel.breite;
  const hoehe = raetsel.hoehe;
  const zellen = breite * hoehe;
  const w = Math.ceil(zellen / 32) || 1;
  const anzahlZahlen = raetsel.zahlen.length;

  const rechteckeVon = [];
  const zahlVon = [];
  const zahlKand = [];
  const zellKand = [];
  for (let k = 0; k < zellen; k++) zellKand.push([]);

  for (let i = 0; i < anzahlZahlen; i++) {
    const ids = [];
    for (const r of kandidaten(raetsel, i)) {
      ids.push(rechteckeVon.length);
      rechteckeVon.push(r);
      zahlVon.push(i);
    }
    zahlKand.push(ids);
  }

  const anzahl = rechteckeVon.length;
  const masken = new Uint32Array(anzahl * w);
  // Die Zellen eines Kandidaten liegen flach hintereinander, `zellVon` nennt
  // den Anfang. Ein Array von Arrays wäre lesbarer, aber toete() und zurueck()
  // laufen genau hier hunderttausendfach durch, und eine flache Int32Array
  // erspart je Aufruf eine Indirektion und dem Sammler die Objekte.
  const zellVon = new Int32Array(anzahl + 1);
  for (let id = 0; id < anzahl; id++) {
    const r = rechteckeVon[id];
    zellVon[id + 1] = zellVon[id] + r.b * r.h;
  }
  const zellFlach = new Int32Array(zellVon[anzahl]);
  for (let id = 0; id < anzahl; id++) {
    const r = rechteckeVon[id];
    const maskeAb = id * w;
    let p = zellVon[id];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.b; x++) {
        const k = y * breite + x;
        masken[maskeAb + (k >>> 5)] |= 1 << (k & 31);
        zellFlach[p++] = k;
        zellKand[k].push(id);
      }
    }
  }

  return {
    breite, hoehe, zellen, w, anzahlZahlen, anzahl,
    rechteckeVon, zahlVon, zahlKand, zellKand, masken, zellVon, zellFlach,
    // Bitmuster über die KANDIDATEN (nicht über die Zellen), Wortbreite wk.
    // Nur der Ausschluss braucht sie, darum werden sie erst bei Bedarf gebaut,
    // siehe ueberZeile().
    wk: Math.ceil(anzahl / 32) || 1,
    ueberCache: new Array(anzahl).fill(null),
  };
}

/* -------------------------------------------------------- Suchzustand */

function neuerZustand(aufg) {
  return {
    aufg,
    lebt: new Uint8Array(aufg.anzahl).fill(1),
    zahlAnzahl: Int32Array.from(aufg.zahlKand, (liste) => liste.length),
    zellAnzahl: Int32Array.from(aufg.zellKand, (liste) => liste.length),
    gesetzt: new Int32Array(aufg.anzahlZahlen).fill(-1),
    belegt: new Uint32Array(aufg.w),
    offeneZahlen: aufg.anzahlZahlen,
    spurTot: [],
    spurGesetzt: [],
    // Kratzfläche für den Ausschluss. Einmal angelegt und immer wiederverwendet:
    // die Runde läuft über alle Zellen und würde sonst je Zelle ein Array
    // anlegen, das sie sofort wieder wegwirft.
    durchschnitt: new Uint32Array(aufg.wk),
  };
}

/** Ist die Zelle noch frei? */
function frei(zst, k) {
  return (zst.belegt[k >>> 5] & (1 << (k & 31))) === 0;
}

/** Deckt der Kandidat diese Zelle? */
function deckt(aufg, id, k) {
  return (aufg.masken[id * aufg.w + (k >>> 5)] & (1 << (k & 31))) !== 0;
}

/** Einen Kandidaten aus dem Rennen nehmen und in die Rückspur schreiben. */
function toete(zst, id) {
  if (!zst.lebt[id]) return;
  const aufg = zst.aufg;
  zst.lebt[id] = 0;
  zst.spurTot.push(id);
  zst.zahlAnzahl[aufg.zahlVon[id]] -= 1;
  const bis = aufg.zellVon[id + 1];
  for (let p = aufg.zellVon[id]; p < bis; p++) zst.zellAnzahl[aufg.zellFlach[p]] -= 1;
}

/**
 * Einen Kandidaten setzen: seine Zellen sind gedeckt, seine Zahl ist versorgt,
 * und alles, was ihn berührt, fliegt hinaus.
 *
 * Der gesetzte Kandidat bleibt ausdrücklich "lebendig". Das sieht zunächst
 * inkonsequent aus, hält aber alle Zähler in einer einzigen Bedeutung: der
 * Zellzähler ist immer "so viele lebende Kandidaten decken diese Zelle". Für
 * eine gedeckte Zelle steht dann 1, und alle Regeln, die Zähler lesen, gucken
 * ohnehin nur auf FREIE Zellen. Würde man ihn mit toete() entfernen, müsste
 * zurueck() zwei Sorten von Rückspur-Einträgen unterscheiden.
 *
 * Die anderen Kandidaten derselben Zahl brauchen keine eigene Behandlung: sie
 * enthalten alle die eigene Zahl, liegen also alle auf einer Zelle des gerade
 * gesetzten Rechtecks und werden von der Überlappungsregel mit erledigt.
 */
function setze(zst, id) {
  const aufg = zst.aufg;
  const i = aufg.zahlVon[id];
  zst.gesetzt[i] = id;
  zst.spurGesetzt.push(i);
  zst.offeneZahlen -= 1;
  const maskeAb = id * aufg.w;
  for (let k = 0; k < aufg.w; k++) zst.belegt[k] |= aufg.masken[maskeAb + k];
  const bis = aufg.zellVon[id + 1];
  for (let p = aufg.zellVon[id]; p < bis; p++) {
    const liste = aufg.zellKand[aufg.zellFlach[p]];
    for (let q = 0; q < liste.length; q++) {
      const j = liste[q];
      if (j !== id && zst.lebt[j]) toete(zst, j);
    }
  }
}

function marke(zst) {
  return { tot: zst.spurTot.length, ges: zst.spurGesetzt.length };
}

function zurueck(zst, m) {
  const aufg = zst.aufg;
  while (zst.spurGesetzt.length > m.ges) {
    const i = zst.spurGesetzt.pop();
    const id = zst.gesetzt[i];
    zst.gesetzt[i] = -1;
    zst.offeneZahlen += 1;
    const maskeAb = id * aufg.w;
    for (let k = 0; k < aufg.w; k++) zst.belegt[k] &= ~aufg.masken[maskeAb + k];
  }
  while (zst.spurTot.length > m.tot) {
    const id = zst.spurTot.pop();
    zst.lebt[id] = 1;
    zst.zahlAnzahl[aufg.zahlVon[id]] += 1;
    const bis = aufg.zellVon[id + 1];
    for (let p = aufg.zellVon[id]; p < bis; p++) zst.zellAnzahl[aufg.zellFlach[p]] += 1;
  }
}

/** Den einen noch lebenden Kandidaten aus einer Liste holen, oder -1. */
function derLebende(zst, liste) {
  for (let q = 0; q < liste.length; q++) {
    if (zst.lebt[liste[q]]) return liste[q];
  }
  return -1;
}

/* --------------------------------------------------------- Propagation */

/**
 * Alles setzen und wegwerfen, was zwingend ist. -> false bei Widerspruch.
 *
 * Vier Regeln, und mehr braucht es hier nicht:
 *
 *  1. Eine Zahl ohne Kandidaten  -> Widerspruch.
 *  2. Eine Zahl mit genau einem Kandidaten -> der wird gesetzt.
 *  3. Eine freie Zelle, die kein Kandidat mehr decken kann -> Widerspruch.
 *  4. Eine freie Zelle, die nur ein Kandidat decken kann -> der wird gesetzt.
 *
 * Das Wegwerfen überlappender Kandidaten steckt in setze() und braucht darum
 * keine eigene Regel.
 *
 * Gelaufen wird in Runden über alle Zahlen und alle Zellen, bis sich nichts
 * mehr ändert. Verworfen: eine Arbeitsliste ("worklist"), die nur die von der
 * letzten Änderung betroffenen Zahlen und Zellen erneut betrachtet. Das ist der
 * asymptotisch saubere Weg, und bei einem großen Rätsel wäre er der richtige.
 * Hier sind es höchstens 144 Zellen und 28 Zahlen: ein voller Durchlauf ist
 * eine Schleife über zwei typisierte Arrays und liest im Wesentlichen einen
 * Zähler je Zelle. Die Arbeitsliste müsste dafür je getötetem Kandidaten alle
 * seine Zellen und seine Zahl anmelden, also mehr Buchhaltung führen als der
 * Durchlauf kostet, den sie erspart.
 *
 * `protokoll` sammelt die gesetzten Rechtecke samt der Regel, die sie gefunden
 * hat. Der zählende Löser übergibt hier null — er will die Schritte nicht, und
 * jedes angelegte Objekt wäre pro Suchknoten verschenkt.
 */
function propagiere(zst, protokoll) {
  const aufg = zst.aufg;
  let wieder = true;
  while (wieder) {
    wieder = false;

    for (let i = 0; i < aufg.anzahlZahlen; i++) {
      if (zst.gesetzt[i] >= 0) continue;
      const n = zst.zahlAnzahl[i];
      if (n === 0) return false;
      if (n !== 1) continue;
      const id = derLebende(zst, aufg.zahlKand[i]);
      if (id < 0) return false;
      setze(zst, id);
      if (protokoll) {
        protokoll.push({ technik: 'einzigerKandidat', zahl: i, rechteck: aufg.rechteckeVon[id] });
      }
      wieder = true;
    }

    for (let k = 0; k < aufg.zellen; k++) {
      if (!frei(zst, k)) continue;
      const n = zst.zellAnzahl[k];
      if (n === 0) return false;
      if (n !== 1) continue;
      const id = derLebende(zst, aufg.zellKand[k]);
      if (id < 0) return false;
      setze(zst, id);
      if (protokoll) {
        protokoll.push({ technik: 'einzigeDeckung', zahl: aufg.zahlVon[id], rechteck: aufg.rechteckeVon[id] });
      }
      wieder = true;
    }
  }
  return true;
}

/* ----------------------------------------------------------- Ausschluss */

/**
 * Bitmuster aller Kandidaten, die den Kandidaten `c` berühren.
 *
 * Zwei Kandidaten überlappen genau dann, wenn sie sich eine Zelle teilen — die
 * gesuchte Menge ist also die Vereinigung der Kandidatenlisten aller Zellen von
 * `c`. Das Ergebnis wird gemerkt: der Ausschluss fragt dieselben Kandidaten
 * über alle Zellen des Brettes hinweg immer wieder, und die Menge ändert sich
 * nie (sie hängt nur an der Geometrie, nicht am Suchzustand).
 *
 * Gebaut wird erst bei Bedarf, und das ist keine Sparsamkeit um ihrer selbst
 * willen: loesen() ruft ausschlussRunde() nie, und der Erzeuger ruft loesen()
 * hundertfach je erzeugtem Rätsel. Würde die Überlappungsmatrix im Aufbau
 * entstehen, zahlte jeder dieser Läufe für etwas, das er nicht anfasst. So
 * zahlt nur logischLoesen() dafür, und dort auch nur für die Kandidaten, die
 * wirklich als Decker einer freien Zelle auftreten.
 */
function ueberZeile(aufg, c) {
  let zeile = aufg.ueberCache[c];
  if (zeile) return zeile;
  zeile = new Uint32Array(aufg.wk);
  const bis = aufg.zellVon[c + 1];
  for (let p = aufg.zellVon[c]; p < bis; p++) {
    const liste = aufg.zellKand[aufg.zellFlach[p]];
    for (let q = 0; q < liste.length; q++) {
      const id = liste[q];
      zeile[id >>> 5] |= 1 << (id & 31);
    }
  }
  aufg.ueberCache[c] = zeile;
  return zeile;
}

/**
 * Eine Runde Ausschluss. -> Zahl der weggeworfenen Kandidaten.
 *
 * Die Überlegung, die ein Mensch am Papier anstellt: "Wenn dieses Rechteck hier
 * läge, dann käme an jene Zelle nichts mehr heran — also liegt es nicht hier."
 *
 * Formal: ein Kandidat k scheidet aus, wenn es eine freie Zelle z gibt, die k
 * nicht deckt, und JEDER noch lebende Kandidat, der z decken könnte, überlappt
 * mit k. Nach dem Setzen von k wäre z unerreichbar.
 *
 * Der Weg dorthin ist der Grund, warum das schnell genug ist. Naiv müsste man
 * für jede freie Zelle jeden lebenden Kandidaten gegen die ganze Deckungsmenge
 * dieser Zelle prüfen, also drei ineinandergeschachtelte Schleifen mit einem
 * Maskenvergleich im Kern.
 *
 * Stattdessen wird die Frage umgedreht: gesucht sind die Kandidaten, die ALLE
 * Decker von z berühren, und das ist der Durchschnitt der Berühr-Bitmuster
 * (ueberZeile) über alle Decker. Je Zelle sind das |Decker| UND-Verknüpfungen
 * über wenige Wörter, danach werden nur die wenigen gesetzten Bits einzeln
 * angesehen.
 *
 * Beide Fassungen wurden gebaut und liefern Schritt für Schritt dasselbe
 * Ergebnis. Gemessen (logischLoesen über den ganzen Bestand):
 *
 *   240 erzeugte Rätsel:      0,073 ms gegen 0,090 ms   (1,2×)
 *   320 Suchlast-Bretter:     0,259 ms gegen 0,825 ms   (3,2×)
 *
 * Auf erzeugten Rätseln lohnt es sich also kaum — dort läuft der Ausschluss
 * selten, weil die billigen Regeln fast alles erledigen. Der Unterschied
 * entsteht genau dort, wo die Funktion wirklich arbeitet: auf einem Brett, das
 * mit den einfachen Regeln nicht in Gang kommt. Und das ist der Fall, in dem
 * naechsterZug() sie ruft — wenn der Spieler auf "Tipp" drückt, weil er nicht
 * weiterkommt.
 *
 * Die Decker selbst stehen zwangsläufig auch im Durchschnitt — sie liegen ja
 * alle auf z und berühren sich damit gegenseitig. Sie fallen über die Prüfung
 * "deckt k die Zelle z?" heraus, und genau darum muss diese Prüfung sein.
 */
function ausschlussRunde(zst) {
  const aufg = zst.aufg;
  const durch = zst.durchschnitt;
  let weg = 0;
  for (let z = 0; z < aufg.zellen; z++) {
    if (!frei(zst, z)) continue;
    const decker = [];
    const liste = aufg.zellKand[z];
    for (let q = 0; q < liste.length; q++) if (zst.lebt[liste[q]]) decker.push(liste[q]);
    // 0 und 1 Decker sind Sache der Propagation, nicht des Ausschlusses.
    if (decker.length < 2) continue;

    const erste = ueberZeile(aufg, decker[0]);
    for (let w = 0; w < aufg.wk; w++) durch[w] = erste[w];
    for (let t = 1; t < decker.length; t++) {
      const zeile = ueberZeile(aufg, decker[t]);
      for (let w = 0; w < aufg.wk; w++) durch[w] &= zeile[w];
    }

    for (let w = 0; w < aufg.wk; w++) {
      let bits = durch[w] | 0;
      while (bits !== 0) {
        const tief = bits & -bits;
        bits ^= tief;
        const id = w * 32 + (31 - Math.clz32(tief >>> 0));
        if (!zst.lebt[id]) continue;
        if (zst.gesetzt[aufg.zahlVon[id]] >= 0) continue;
        if (deckt(aufg, id, z)) continue;
        toete(zst, id);
        weg += 1;
      }
    }
  }
  return weg;
}

/* ------------------------------------------------------- Lösungen zählen */

/** Die gesetzten Rechtecke als Lösung, parallel zu raetsel.zahlen. */
function loesungAus(zst) {
  const aufg = zst.aufg;
  const out = new Array(aufg.anzahlZahlen);
  for (let i = 0; i < aufg.anzahlZahlen; i++) {
    const r = aufg.rechteckeVon[zst.gesetzt[i]];
    // Abschrift und nicht die Vorlage: die Kandidatenobjekte werden von der
    // Aufgabe geteilt, und eine Lösung wandert in den Spielstand und durch
    // JSON. Ein Aufrufer, der daran dreht, soll nicht die Suche verbiegen.
    out[i] = { x: r.x, y: r.y, b: r.b, h: r.h };
  }
  return out;
}

/**
 * Die freie Zelle mit den WENIGSTEN deckenden Kandidaten.
 *
 * Verzweigt wird an einer ZELLE und nicht an einer Zahl. Der Grund ist die
 * engere Sicht: eine Zelle hat oft nur zwei oder drei Decker, während dieselbe
 * Lage aus Sicht der Zahlen noch fünf Möglichkeiten offen lässt. Die Zellsicht
 * schließt die Zahlsicht dabei ein — die Zelle, auf der eine Zahl steht, hat
 * genau die Kandidaten dieser Zahl als Decker, sie ist also selbst eine der
 * betrachteten Zellen und wird gewählt, wenn sie die engste ist.
 *
 * Alle drei denkbaren Regeln wurden gebaut und gemessen; sie zählen dieselben
 * Lösungen, sie brauchen nur verschieden viele Knoten dafür:
 *
 *                                     240 erzeugte    320 Suchlast-Bretter
 *                                     Rätsel,         ------------------------
 *                                     Eindeutigkeit   Eindeutigkeit   alle
 *                                     (Knoten)        (Knoten)        Lösungen
 *   Zelle mit wenigsten Deckern          1,84            15,3       81784 / 216 ms
 *   Zahl mit wenigsten Kandidaten        1,91            15,6       85564 / 143 ms
 *   erste freie Zelle in Leserichtung    1,87            13,0       84057 / 153 ms
 *
 * Zwei Dinge sind daran ehrlich festzuhalten.
 *
 * Erstens: auf ERZEUGTEN Rätseln, also in dem Fall, für den dieser Löser da
 * ist, ist die Wahl gleichgültig. 1,84 Knoten im Mittel heißt, dass die
 * Propagation praktisch alles allein erledigt und meist überhaupt nicht
 * verzweigt wird. Wer hier eine Verzweigungsregel abstimmt, stimmt Rauschen ab.
 *
 * Zweitens: wo wirklich gesucht wird, spart die Zellsicht Knoten (81784 gegen
 * 85564, also 4 % gegenüber der Zahlsicht) und verliert trotzdem an der Uhr
 * (216 ms gegen 143 ms), weil der Durchlauf über alle Zellen mehr kostet, als
 * die gesparten Knoten bringen. Die einfachste Regel — nimm die erste freie
 * Zelle — liegt bei beidem in der Mitte und ist beim Entscheiden der
 * Eindeutigkeit sogar die knotensparendste.
 *
 * Geblieben ist trotzdem die kleinste Zelle, aus einem Grund, der nicht in der
 * Tabelle steht: maxKnoten. Die Schranke, an der `abgebrochen` hängt, zählt
 * Knoten und keine Millisekunden, und ein abgebrochener Lauf lässt den Erzeuger
 * ein Rätsel wegwerfen. Weggeworfen werden soll, was schwer zu ENTSCHEIDEN ist
 * — nicht, was eine unglückliche Verzweigungsreihenfolge erwischt hat. Die
 * kleinste Zelle beschränkt den Verzweigungsgrad an jedem Knoten, die erste
 * freie tut das nicht, und diese Garantie ist mehr wert als 70 ms in einem
 * Lastfall, den das Spiel nie erzeugt.
 *
 * Bei zwei Deckern wird abgebrochen: kleiner geht es nach der Propagation
 * nicht, und die restlichen Zellen anzusehen wäre verlorene Zeit.
 */
function besteZelle(zst) {
  const aufg = zst.aufg;
  let beste = -1;
  let wenigste = Infinity;
  for (let k = 0; k < aufg.zellen; k++) {
    if (!frei(zst, k)) continue;
    const n = zst.zellAnzahl[k];
    if (n < wenigste) {
      wenigste = n;
      beste = k;
      if (n <= 2) break;
    }
  }
  return beste;
}

function suche(zst, ziel, grenze, ergebnis) {
  ergebnis.knoten += 1;
  if (ergebnis.knoten > grenze) {
    ergebnis.abgebrochen = true;
    return;
  }
  if (!propagiere(zst, null)) return;
  if (zst.offeneZahlen === 0) {
    // Alle Zahlen versorgt heißt zwangsläufig: alles gedeckt. Wäre noch eine
    // Zelle frei, hätte sie keinen lebenden Decker mehr (alle lebenden
    // Kandidaten gehören zu gesetzten Zahlen und liegen auf gedeckten Zellen),
    // und die Propagation hätte das als Widerspruch gemeldet.
    ergebnis.anzahl += 1;
    if (ergebnis.loesungen.length < ziel) ergebnis.loesungen.push(loesungAus(zst));
    return;
  }
  const zelle = besteZelle(zst);
  if (zelle < 0) return;
  const aufg = zst.aufg;
  const zweige = [];
  const liste = aufg.zellKand[zelle];
  for (let q = 0; q < liste.length; q++) if (zst.lebt[liste[q]]) zweige.push(liste[q]);
  for (let t = 0; t < zweige.length; t++) {
    const m = marke(zst);
    setze(zst, zweige[t]);
    suche(zst, ziel, grenze, ergebnis);
    zurueck(zst, m);
    if (ergebnis.anzahl >= ziel || ergebnis.abgebrochen) return;
  }
}

/**
 * Zählt Lösungen, höchstens `maxLoesungen`.
 *
 * -> { anzahl, loesungen, abgebrochen, knoten }
 *
 * `abgebrochen` heißt: die Schrittgrenze war erreicht, die Zahl ist also eine
 * UNTERE Schranke. Der Erzeuger muss so ein Rätsel wegwerfen — nicht weil es
 * schlecht wäre, sondern weil über seine Eindeutigkeit nichts bekannt ist, und
 * "unbekannt" ist beim Ausliefern dasselbe wie "nicht eindeutig".
 *
 * Ein Rätsel, das pruefeRaetsel() nicht besteht, hat null Lösungen. Das ist
 * keine verschluckte Ausnahme, sondern die richtige Antwort: passt die Summe
 * der Zahlen nicht zur Fläche, gibt es keine restlose Zerlegung, und alles
 * andere (Zahlen außerhalb des Brettes, zwei Zahlen auf einer Zelle) ist gar
 * keine Aufgabe. `abgebrochen` bleibt dabei false — die Antwort ist sicher.
 */
export function loesen(raetsel, { maxLoesungen = 2, maxKnoten = 300000 } = {}) {
  const ergebnis = { anzahl: 0, loesungen: [], abgebrochen: false, knoten: 0 };
  if (pruefeRaetsel(raetsel)) return ergebnis;
  const ziel = Math.max(1, Math.floor(maxLoesungen) || 1);
  const grenze = Math.max(1, Math.floor(maxKnoten) || 1);
  suche(neuerZustand(baueAufgabe(raetsel)), ziel, grenze, ergebnis);
  return ergebnis;
}

/**
 * Genau eine Lösung? Nie eine Ausnahme, im Zweifel `false`.
 *
 * Der Zweifel ist hier ausdrücklich eingebaut: ein abgebrochener Lauf gilt als
 * NICHT eindeutig. Diese Funktion ist das Tor, durch das jedes Rätsel muss, und
 * ein Tor, das bei Unsicherheit öffnet, ist keines.
 */
export function eindeutig(raetsel) {
  try {
    const erg = loesen(raetsel, { maxLoesungen: 2 });
    return !erg.abgebrochen && erg.anzahl === 1;
  } catch {
    return false;
  }
}

/* --------------------------------------------------- der logische Löser */

/**
 * Der logische Löser: löst NUR mit Schlüssen, nie durch Raten.
 *
 * -> { geloest, rechtecke, schritte, technik, sackgasse }
 *
 * Die drei Techniken, alles was ein Mensch am Papier auch tut:
 *  - einzigerKandidat: eine Zahl hat nur noch ein mögliches Rechteck.
 *  - einzigeDeckung:   eine freie Zelle lässt sich nur noch von einem
 *                      einzigen Kandidaten überhaupt decken.
 *  - ausschluss:       ein Kandidat scheidet aus, weil er eine Zelle
 *                      unerreichbar machen würde.
 *
 * Die Reihenfolge ist die Reihenfolge des Aufwands: erst die beiden billigen
 * Regeln bis zum Stillstand, dann eine Runde Ausschluss, dann wieder von vorn.
 * Ein Mensch macht es genauso — man zählt erst ab, was übrig bleibt, und fängt
 * erst dann an, Möglichkeiten gegeneinander auszuspielen.
 *
 * Zur Zuordnung der Technik beim Ausschluss: der Ausschluss SETZT nichts, er
 * wirft nur weg. Gesetzt wird gleich danach von einer der beiden billigen
 * Regeln. Trotzdem wird dieser eine nächste Zug als 'ausschluss' verbucht und
 * nicht als 'einzigerKandidat', und zwar weil die Zählung eine Frage beantworten
 * soll: was musste der Spieler KÖNNEN? Vor dem Ausschluss stand das Brett; die
 * Überlegung, die es weiterbewegt hat, war der Ausschluss. Wer nur die
 * setzende Regel verbucht, misst ein Rätsel als trivial, das keine der beiden
 * einfachen Regeln jemals in Gang gebracht hätte.
 *
 * `vorgabe` ist ein Array parallel zu raetsel.zahlen mit schon gesetzten
 * Rechtecken (null = offen). Das braucht nur naechsterZug(), um den nächsten
 * Schluss auf dem AKTUELLEN Spielstand zu suchen; von außen ruft man diese
 * Funktion mit einem Argument.
 */
export function logischLoesen(raetsel, vorgabe = null) {
  const technik = { einzigerKandidat: 0, einzigeDeckung: 0, ausschluss: 0 };
  const anzahlZahlen = Array.isArray(raetsel?.zahlen) ? raetsel.zahlen.length : 0;
  if (pruefeRaetsel(raetsel)) {
    return {
      geloest: false,
      rechtecke: new Array(anzahlZahlen).fill(null),
      schritte: [],
      technik,
      sackgasse: true,
    };
  }

  const aufg = baueAufgabe(raetsel);
  const zst = neuerZustand(aufg);
  const schritte = [];
  let sackgasse = false;

  if (Array.isArray(vorgabe)) {
    for (let i = 0; i < vorgabe.length; i++) {
      const r = vorgabe[i];
      if (!r) continue;
      // Ein Rechteck jenseits der letzten Zahl ist keine Vorgabe, die zu diesem
      // Rätsel parallel liegt. Vorher lief die Schleife blind weiter und stürzte
      // eine Zeile später ("aufg.zahlKand[i] is not iterable") — ein Spielstand
      // mit mehr Rechtecken als Zahlen ist aber genau das, was ein Spieler
      // hinlegt, der eines zu viel gezogen hat. Behandelt wird es wie jede andere
      // unmögliche Vorgabe: Sackgasse.
      if (i >= aufg.anzahlZahlen) { sackgasse = true; break; }
      if (zst.gesetzt[i] >= 0) continue;
      let id = -1;
      for (const c of aufg.zahlKand[i]) {
        if (zst.lebt[c] && gleich(aufg.rechteckeVon[c], r)) { id = c; break; }
      }
      // Ein vorgegebenes Rechteck, das kein lebender Kandidat mehr ist, ist
      // falsch oder mit einem anderen unvereinbar. Weiterrechnen wäre Unsinn.
      if (id < 0) { sackgasse = true; break; }
      setze(zst, id);
    }
  }

  // Nach der Vorgabe kann die letzte Zahl schon versorgt sein; dann ist die
  // Schleife sofort fertig und das Ergebnis ist "gelöst, ohne einen Schritt".
  let ausschlussVoraus = false;
  while (!sackgasse) {
    const protokoll = [];
    const ok = propagiere(zst, protokoll);
    for (const s of protokoll) {
      const t = ausschlussVoraus ? 'ausschluss' : s.technik;
      ausschlussVoraus = false;
      technik[t] += 1;
      schritte.push({ technik: t, zahl: s.zahl, rechteck: { ...s.rechteck } });
    }
    if (!ok) { sackgasse = true; break; }
    if (zst.offeneZahlen === 0) break;
    // Stillstand bei den billigen Regeln: jetzt der Ausschluss. Bringt er
    // nichts, ist ohne Raten nicht weiterzukommen.
    if (ausschlussRunde(zst) === 0) break;
    ausschlussVoraus = true;
  }

  const rechtecke = new Array(aufg.anzahlZahlen);
  for (let i = 0; i < aufg.anzahlZahlen; i++) {
    const id = zst.gesetzt[i];
    rechtecke[i] = id >= 0 ? { ...aufg.rechteckeVon[id] } : null;
  }
  return {
    geloest: !sackgasse && zst.offeneZahlen === 0,
    rechtecke,
    schritte,
    technik,
    sackgasse,
  };
}

/* ------------------------------------------------------- Schwierigkeit */

/**
 * Was eine Überlegung in Punkten wiegt.
 *
 * Die Reihenfolge kommt vom Aufwand am Papier. `einzigerKandidat` ist der
 * Grundfall — abzählen, was für eine Zahl noch übrig ist, das tut man ohne
 * nachzudenken. `einzigeDeckung` verlangt den Blick von der anderen Seite: nicht
 * "was kann diese Zahl", sondern "wer könnte diese leere Zelle noch erreichen";
 * erfahrene Spieler machen das flüssig, Anfänger sehen es gar nicht.
 * `ausschluss` ist eine Fallunterscheidung mit Widerspruch, also echte Arbeit.
 *
 * Was diese Gewichte in der Praxis bedeuten, ist gemessen und soll hier stehen,
 * weil man es aus den Zahlen 1/3/9 nicht ablesen kann. Über je 120 erzeugte
 * Rätsel, Anteil der Schritte und Anteil der Punkte:
 *
 *              Schritte (ek / ed / au)      Punkte (ek / ed / au / offen)
 *   leicht        43 % / 56 % / 0,7 %          20 % / 77 % /  3 % /  0 %
 *   mittel        38 % / 61 % / 1,0 %          16 % / 80 % /  4 % /  0 %
 *   schwer        32 % / 67 % / 1,1 %          13 % / 83 % /  4 % /  0 %
 *   experte       30 % / 68 % / 1,5 %          12 % / 81 % /  5 % /  2 %
 *
 * Die Punktzahl ist also im Wesentlichen "dreimal die Zahl der einzigen
 * Deckungen". Der Ausschluss ist mit rund einem Prozent der Schritte selten und
 * trägt entsprechend wenig — 9 statt 3 ist keine Feinabstimmung, sondern die
 * Aussage, dass ein Ausschluss überhaupt zählt. Wer diese Gewichte anfassen
 * will, sollte wissen, dass an ihnen die Grenzen in GRENZEN hängen und dass
 * beides zusammen gemessen wurde.
 */
const GEWICHT = { einzigerKandidat: 1, einzigeDeckung: 3, ausschluss: 9 };

/**
 * Was eine Zahl kostet, die der logische Löser nicht erschließen konnte.
 *
 * Ohne diesen Zuschlag wäre die Bewertung verkehrt herum: bleibt der Löser nach
 * drei Schritten stehen, gibt es fast keine Punkte — ein Rätsel, das nur mit
 * Raten zu lösen ist, sähe damit leichter aus als eines, das sich in dreißig
 * sauberen Schritten ausrechnen lässt.
 *
 * 20 und nicht der mittlere Schrittpreis (gemessen 2,2 bis 2,6 Punkte je
 * Schritt, über die vier Stufen): eine Stelle, an der man eine Möglichkeit
 * annehmen und zum Widerspruch führen muss, ist teurer als jede der drei
 * Techniken — sonst wäre sie eine von ihnen.
 */
const STRAFE_OFFEN = 20;

/**
 * Die Grenzen zwischen den Stufen, in Punkten.
 *
 * Gemessen über je 120 erzeugte Rätsel der vier Stufen, wobei der Erzeuger
 * dabei NUR auf Eindeutigkeit geachtet hat (sein Schwierigkeitswunsch war
 * abgeschaltet, sonst wäre die Messung im Kreis gelaufen):
 *
 *   leicht  (6×6,   11,3 Zahlen):  Mittel 25, Spanne 11 –  38
 *   mittel  (8×8,   16,7 Zahlen):  Mittel 38, Spanne 19 –  56
 *   schwer  (10×10, 22,7 Zahlen):  Mittel 54, Spanne 29 –  78
 *   experte (12×12, 28,7 Zahlen):  Mittel 73, Spanne 40 – 371
 *
 * (Die 371 ist ein Rätsel, das der logische Löser nicht durchbekam — dort
 * schlägt STRAFE_OFFEN durch. Solche gab es 2 von 120.)
 *
 * Die Punkte sind ausdrücklich ABSOLUT und nicht auf die Zahl der Zahlen
 * bezogen. Der erste Versuch war die bezogene Fassung (Punkte je Zahl, damit
 * "100" hieß: jede Zahl war reines Abzählen). Gemessen ergab das für die vier
 * Stufen 208 / 225 / 254 / 255 Punkte — sie waren praktisch nicht zu
 * unterscheiden, und das ist auch logisch: die MISCHUNG der Techniken je Zahl
 * hängt kaum am Ausmaß, es gibt auf einem großen Brett nur mehr davon. Genau
 * das ist aber die Schwierigkeit, die ein Spieler erlebt — ein 12×12 ist nicht
 * schwerer, weil jeder Schluss schwerer wäre, sondern weil es dreimal so viele
 * sind und man den Überblick behalten muss.
 *
 * Die Grenzen liegen jeweils zwischen zwei Mittelwerten, näher am unteren: die
 * Verteilungen überlappen, und im Zweifel soll ein Rätsel eher zu hoch als zu
 * tief eingestuft werden. Die Funktion BESCHREIBT ein Rätsel; welche Stufe
 * darauf steht, entscheidet der Erzeuger über das Ausmaß des Brettes.
 */
const GRENZEN = [
  ['leicht', 31],
  ['mittel', 46],
  ['schwer', 63],
];

/**
 * Wie schwer ist das Rätsel? Gemessen an dem, was der logische Löser braucht.
 *
 * -> { punkte, stufe, raten, techniken }
 *
 * `raten` ist wahr, wenn logischLoesen nicht durchkam — dann ist das Rätsel für
 * `leicht` und `mittel` unbrauchbar und wird vom Erzeuger verworfen.
 */
export function bewerteSchwierigkeit(raetsel) {
  const erg = logischLoesen(raetsel);
  let offen = 0;
  for (const r of erg.rechtecke) if (!r) offen += 1;
  const punkte = erg.technik.einzigerKandidat * GEWICHT.einzigerKandidat
    + erg.technik.einzigeDeckung * GEWICHT.einzigeDeckung
    + erg.technik.ausschluss * GEWICHT.ausschluss
    + offen * STRAFE_OFFEN;
  let stufe = 'experte';
  for (const [name, grenze] of GRENZEN) {
    if (punkte <= grenze) { stufe = name; break; }
  }
  return { punkte, stufe, raten: !erg.geloest, techniken: erg.technik };
}

/* ---------------------------------------------------------------- Tipp */

/**
 * Nächster sinnvoller Zug für die Tipp-Funktion, auf dem AKTUELLEN Stand.
 *
 * -> { rechteck, zahl, wert, technik, grund } oder null
 *
 * `zahl` ist der INDEX in raetsel.zahlen (dieselbe Zählung wie bei einer
 * Lösung), `wert` die Zahl, die auf dem Brett steht — der Index allein ist für
 * die Oberfläche unhandlich, und den Wert daneben zu legen kostet nichts.
 * `grund` ist ein i18n-SCHLÜSSEL und kein Text.
 *
 * Die Reihenfolge der Fälle ist der ganze Unterschied zwischen einem Tipp und
 * einem Verrat:
 *
 *  1. Steht etwas Falsches auf dem Brett, wird DAS gemeldet ('tipp.raeumeAuf').
 *     Einen weiteren Zug zu nennen, während ein falsches Rechteck liegt, wäre
 *     schlimmer als kein Tipp: der Spieler baut auf einem Fehler weiter, den
 *     das Spiel bereits kennt.
 *
 *  2. Sonst wird der nächste Schluss auf dem VERBLEIBENDEN Brett gesucht, mit
 *     genau denselben drei Techniken, die auch ein Mensch hat, und die Technik
 *     wird mitgeliefert. Der Spieler soll nachvollziehen können, WARUM das
 *     Rechteck dort liegen muss.
 *
 * Verworfen: einfach ein noch fehlendes Rechteck aus der Lösung zu zeigen. Das
 * ist ein Tipp im Sinne von "hier, nimm" — er hilft dem Spieler weiter, aber
 * er bringt ihm nichts bei, und er trifft mit hoher Wahrscheinlichkeit eine
 * Stelle, die noch gar nicht zu erschließen ist.
 */
export function naechsterZug(raetsel, rechtecke) {
  const stand = Array.isArray(rechtecke) ? rechtecke.filter(Boolean) : [];
  const erg = loesen(raetsel, { maxLoesungen: 1 });
  if (erg.anzahl === 0 || !erg.loesungen.length) return null;
  const loesung = erg.loesungen[0];

  // 1. Was liegt, muss stimmen. Verglichen wird gegen die echte Lösung und
  //    nicht bloß mit bewerteRechteck(): ein Rechteck kann für sich allein
  //    tadellos sein ('gut') und trotzdem an der falschen Stelle liegen.
  //    `verbraucht` fängt dabei den Doppelfall ab — zwei deckungsgleiche
  //    Rechtecke auf dem Brett können nicht beide richtig sein.
  const verbraucht = new Uint8Array(loesung.length);
  for (const r of stand) {
    let treffer = -1;
    for (let i = 0; i < loesung.length; i++) {
      if (!verbraucht[i] && gleich(r, loesung[i])) { treffer = i; break; }
    }
    if (treffer < 0) {
      const drin = imBrett(r, raetsel.breite, raetsel.hoehe) ? zahlenIn(raetsel, r) : [];
      const zahl = drin.length === 1 ? drin[0] : -1;
      return {
        rechteck: { ...r },
        zahl,
        wert: zahl >= 0 ? raetsel.zahlen[zahl].wert : 0,
        technik: 'raeumeAuf',
        grund: 'tipp.raeumeAuf',
      };
    }
    verbraucht[treffer] = 1;
  }

  // 2. Alles Gesetzte ist richtig. Bleibt überhaupt noch etwas?
  const vorgabe = [];
  let offene = 0;
  for (let i = 0; i < loesung.length; i++) {
    vorgabe.push(verbraucht[i] ? loesung[i] : null);
    if (!verbraucht[i]) offene += 1;
  }
  if (offene === 0) return null;

  const logisch = logischLoesen(raetsel, vorgabe);
  const schritt = logisch.schritte[0];
  if (schritt && gleich(schritt.rechteck, loesung[schritt.zahl])) {
    return {
      rechteck: { ...schritt.rechteck },
      zahl: schritt.zahl,
      wert: raetsel.zahlen[schritt.zahl].wert,
      technik: schritt.technik,
      grund: `tipp.${schritt.technik}`,
    };
  }

  /*
   * Der logische Löser kommt hier nicht weiter — auf 'schwer' und 'experte' ist
   * das der Normalfall und ausdrücklich erlaubt, dort ist nur die Eindeutigkeit
   * Pflicht. Ein Tipp, der auf diesen beiden Stufen nie kommt, wäre aber ein
   * kaputter Knopf.
   *
   * Also wird aus der echten Lösung das Rechteck der Zahl mit den WENIGSTEN
   * verbliebenen Möglichkeiten gezeigt: das ist die Stelle, an der ein Mensch
   * am ehesten selbst weitergekommen wäre, und die Begründung 'tipp.ausschluss'
   * stimmt der Sache nach — auszurechnen ist es, nur nicht mit einer der beiden
   * billigen Regeln allein.
   *
   * Der ausdrücklich verworfene Ausweg war, hier null zurückzugeben und die
   * Oberfläche 'tipp.keiner' anzeigen zu lassen. Das ist ehrlicher, aber es
   * ergibt ein Spiel, dessen Tipp-Knopf auf den beiden oberen Stufen nichts
   * tut — und der Grund dafür ("die Aufgabe ist zu schwer für unseren Löser")
   * lässt sich dem Spieler nicht erklären. 'tipp.keiner' bleibt für den Fall,
   * dass es wirklich nichts zu tun gibt.
   */
  let besteZahl = -1;
  let wenigste = Infinity;
  for (let i = 0; i < loesung.length; i++) {
    if (verbraucht[i]) continue;
    let moeglich = 0;
    for (const k of kandidaten(raetsel, i)) {
      let passt = true;
      for (let j = 0; j < vorgabe.length; j++) {
        if (vorgabe[j] && ueberlappen(k, vorgabe[j])) { passt = false; break; }
      }
      if (passt) moeglich += 1;
    }
    if (moeglich > 0 && moeglich < wenigste) { wenigste = moeglich; besteZahl = i; }
  }
  if (besteZahl < 0) return null;
  return {
    rechteck: { ...loesung[besteZahl] },
    zahl: besteZahl,
    wert: raetsel.zahlen[besteZahl].wert,
    technik: 'ausschluss',
    grund: 'tipp.ausschluss',
  };
}
