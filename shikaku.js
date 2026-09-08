/**
 * Shikaku – das Modell und die Regeln.
 *
 * Reine Daten, reine Funktionen: kein DOM, kein Netz, kein Zufall. Damit lässt
 * sich alles hier in Node prüfen (shikaku.test.js), und genau deshalb liegt es
 * getrennt von app.js. Der Löser (loeser.js) und der Erzeuger (erzeuger.js)
 * bauen ausschließlich auf diesen Funktionen auf.
 *
 * Die Regel des Spiels in einem Satz: das Raster wird restlos in Rechtecke
 * zerlegt, jedes Rechteck enthält genau EINE Zahl, und seine Fläche ist genau
 * diese Zahl.
 *
 * Zwei Festlegungen, die sich durch die ganze Sammlung ziehen:
 *
 *  - Eine Zelle heißt immer `y * breite + x`. Nicht `x * hoehe + y`. Das Raster
 *    wird zeilenweise gelesen, das DOM baut die Zellen zeilenweise auf, und
 *    `belegung()` gibt einen zeilenweisen Streifen zurück. Eine einzige
 *    Leserichtung für alles erspart die Umrechnung an jeder Grenze.
 *
 *  - Eine Lösung ist ein Array von Rechtecken PARALLEL zu `raetsel.zahlen`:
 *    `loesung[i]` gehört zu `zahlen[i]`. Der naheliegendere Weg wäre gewesen,
 *    das Rechteck neben die Zahl zu legen ({x, y, wert, rechteck}), aber dann
 *    wäre das Rätsel nicht mehr die reine Aufgabe: es trüge seine Lösung mit
 *    sich, und jeder Spielstand im localStorage wäre ein Spoiler. Getrennte
 *    Arrays halten die Aufgabe frei von der Antwort.
 */

/** Die vier Stufen, in aufsteigender Schwierigkeit. Reihenfolge ist Vertrag. */
export const STUFEN = ['leicht', 'mittel', 'schwer', 'experte'];

/** Fläche eines Rechtecks – im Shikaku ist das gleichzeitig seine Zahl. */
export function flaeche(r) {
  return r.b * r.h;
}

/**
 * Aus zwei Eckzellen ein Rechteck machen.
 *
 * Beide Ecken sind ZELLEN, nicht Gitterpunkte: das Rechteck von (3,3) nach
 * (3,3) ist 1×1 und nicht 0×0. Darum die "+ 1". Die Ecken dürfen in jeder
 * Reihenfolge und in jeder der vier Richtungen kommen — beim Ziehen mit dem
 * Finger fängt man mal oben links an und mal unten rechts, und das darf kein
 * Unterschied sein.
 */
export function normRechteck(x1, y1, x2, y2) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    b: Math.abs(x2 - x1) + 1,
    h: Math.abs(y2 - y1) + 1,
  };
}

/** Liegt die Zelle (x, y) im Rechteck? */
export function enthaelt(r, x, y) {
  return x >= r.x && x < r.x + r.b && y >= r.y && y < r.y + r.h;
}

/**
 * Schneiden sich zwei Rechtecke?
 *
 * Die Prüfung läuft über die Trennachse und nicht über die Zellen: vier
 * Vergleiche statt bis zu 400 Schleifendurchläufen. Der Löser fragt das
 * hunderttausendfach, und dort ist das der Unterschied zwischen einer
 * Millisekunde und einer Sekunde.
 */
export function ueberlappen(a, b) {
  return a.x < b.x + b.b && b.x < a.x + a.b
      && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Deckungsgleich? Zwei Rechtecke sind gleich, wenn alle vier Zahlen gleich sind. */
export function gleich(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y && a.b === b.b && a.h === b.h;
}

/** Liegt das Rechteck ganz im Raster – und ist es überhaupt eines (b, h >= 1)? */
export function imBrett(r, breite, hoehe) {
  return !!r && r.b >= 1 && r.h >= 1
      && r.x >= 0 && r.y >= 0
      && r.x + r.b <= breite && r.y + r.h <= hoehe;
}

/**
 * Ein Gitter, das zu jeder Zelle den Index ihrer Zahl nennt (-1 = keine).
 *
 * Nicht nach außen gegeben und ausdrücklich NICHT gespeichert: ein Rätsel ist
 * hier reine Daten, und ein Zwischenspeicher an einem Objekt, das der Aufrufer
 * jederzeit ändern darf (etwa aus JSON neu gelesen), wäre eine stille
 * Fehlerquelle. Der Aufbau kostet eine Schleife über die Zellen; `kandidaten()`
 * ruft ihn einmal je Zahl, das sind bei 12×12 rund 2600 Schritte für das ganze
 * Rätsel und damit unter der Messbarkeitsgrenze.
 */
function zahlgitter(raetsel) {
  const { breite, hoehe, zahlen } = raetsel;
  const gitter = new Int16Array(breite * hoehe).fill(-1);
  for (let i = 0; i < zahlen.length; i++) {
    const z = zahlen[i];
    if (z.x >= 0 && z.x < breite && z.y >= 0 && z.y < hoehe) {
      gitter[z.y * breite + z.x] = i;
    }
  }
  return gitter;
}

/** Alle Zahlen, die im Rechteck liegen. -> Array von Indizes in raetsel.zahlen. */
export function zahlenIn(raetsel, r) {
  const drin = [];
  for (let i = 0; i < raetsel.zahlen.length; i++) {
    const z = raetsel.zahlen[i];
    if (enthaelt(r, z.x, z.y)) drin.push(i);
  }
  return drin;
}

/** Index der Zahl auf dieser Zelle, oder -1. */
export function zahlAn(raetsel, x, y) {
  for (let i = 0; i < raetsel.zahlen.length; i++) {
    const z = raetsel.zahlen[i];
    if (z.x === x && z.y === y) return i;
  }
  return -1;
}

/**
 * Wie steht dieses Rechteck für sich allein da? Ohne Rücksicht auf andere.
 *
 * -> 'gut' | 'keineZahl' | 'mehrereZahlen' | 'zuGross' | 'zuKlein'
 *
 * Die Reihenfolge der Prüfungen ist die Reihenfolge, in der ein Spieler den
 * Fehler sieht: erst "da ist gar keine Zahl drin" bzw. "da sind zwei drin" —
 * das erkennt man am Rechteck selbst —, und nur wenn genau eine Zahl darin
 * steht, ist überhaupt von zu groß oder zu klein zu reden. Ein Rechteck mit
 * zwei Zahlen als 'zuGross' zu melden wäre technisch oft auch richtig, aber
 * als Rückmeldung irreführend: der Spieler soll nicht die Kante verschieben,
 * er soll das Rechteck teilen.
 *
 * Die Lage im Brett prüft diese Funktion NICHT — der Rahmen ist nicht "ein
 * anderes Rechteck", und für ihn gibt es kein Urteil in der Liste. Darum
 * kümmert sich pruefeStand().
 */
export function bewerteRechteck(raetsel, r) {
  const drin = zahlenIn(raetsel, r);
  if (drin.length === 0) return 'keineZahl';
  if (drin.length > 1) return 'mehrereZahlen';
  const wert = raetsel.zahlen[drin[0]].wert;
  const f = flaeche(r);
  if (f > wert) return 'zuGross';
  if (f < wert) return 'zuKlein';
  return 'gut';
}

/**
 * Welche Zelle gehört welchem Rechteck?
 *
 * -> Int16Array(breite*hoehe): Index in `rechtecke`, -1 = frei, -2 = doppelt
 * belegt. Der Index einer Zelle ist immer y * breite + x.
 *
 * -2 ist ansteckend und bleibt: eine dreifach gedeckte Zelle ist auch nur
 * "doppelt belegt". Die Alternative wäre gewesen, die Zahl der Deckungen zu
 * zählen; gebraucht wird sie nirgends — die Oberfläche färbt eine überdeckte
 * Zelle rot, egal wie oft sie überdeckt ist —, und ein Zähler hätte den
 * Rückgabewert um seine schönste Eigenschaft gebracht: dass ein nicht-negativer
 * Wert unmittelbar der gesuchte Rechteck-Index ist.
 *
 * Rechtecke, die über den Rand hinausragen, werden auf das Brett beschnitten:
 * ihre Zellen draußen haben keinen Index in diesem Array. Der Stand meldet sie
 * trotzdem als nicht fertig, siehe pruefeStand().
 */
export function belegung(raetsel, rechtecke) {
  const { breite, hoehe } = raetsel;
  const feld = new Int16Array(breite * hoehe).fill(-1);
  for (let i = 0; i < rechtecke.length; i++) {
    const r = rechtecke[i];
    if (!r) continue;
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(breite, r.x + r.b);
    const y1 = Math.min(hoehe, r.y + r.h);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const k = y * breite + x;
        feld[k] = feld[k] === -1 ? i : -2;
      }
    }
  }
  return feld;
}

/**
 * Der ganze Stand auf einen Blick.
 *
 * -> { fertig, gedeckt, offen, doppelt, urteile, fehlerhaft }
 *
 * `fertig` verlangt drei Dinge, und alle drei sind nötig: jede Zelle genau
 * einmal gedeckt, jedes Rechteck 'gut', und jedes Rechteck ganz im Brett.
 * Der dritte Punkt sieht überflüssig aus, ist es aber nicht — ein Rechteck,
 * das über den Rand hinausragt, kann innen genau die letzte Lücke füllen und
 * dabei die richtige Zahl mit der richtigen Fläche enthalten. Dann wären alle
 * Zellen genau einmal gedeckt und alle Urteile 'gut', und ohne diese Prüfung
 * stünde ein Sieg da, den es nicht gibt. Die Oberfläche kann das nicht
 * verhindern, denn sie muss beim Ziehen über den Rand hinaus etwas anzeigen.
 *
 * `fehlerhaft` bleibt dagegen streng die Liste der Rechtecke, deren URTEIL
 * nicht 'gut' ist — sie ist für die Einfärbung gedacht, und ein Rechteck
 * außerhalb des Brettes bekommt seine eigene Behandlung in app.js.
 */
export function pruefeStand(raetsel, rechtecke) {
  const liste = Array.isArray(rechtecke) ? rechtecke : [];
  const feld = belegung(raetsel, liste);
  let gedeckt = 0;
  let offen = 0;
  let doppelt = 0;
  for (let k = 0; k < feld.length; k++) {
    if (feld[k] === -1) offen += 1;
    else if (feld[k] === -2) doppelt += 1;
    else gedeckt += 1;
  }
  const urteile = [];
  const fehlerhaft = [];
  let alleImBrett = true;
  for (let i = 0; i < liste.length; i++) {
    const urteil = liste[i] ? bewerteRechteck(raetsel, liste[i]) : 'keineZahl';
    urteile.push(urteil);
    if (urteil !== 'gut') fehlerhaft.push(i);
    if (!imBrett(liste[i], raetsel.breite, raetsel.hoehe)) alleImBrett = false;
  }
  const fertig = offen === 0 && doppelt === 0 && fehlerhaft.length === 0 && alleImBrett;
  return { fertig, gedeckt, offen, doppelt, urteile, fehlerhaft };
}

/** Enthält der Block b×h ab (x, y) genau die eigene Zahl und keine fremde? */
function nurEigene(gitter, breite, x, y, b, h, eigen) {
  for (let yy = y; yy < y + h; yy++) {
    const zeile = yy * breite;
    for (let xx = x; xx < x + b; xx++) {
      const gefunden = gitter[zeile + xx];
      if (gefunden >= 0 && gefunden !== eigen) return false;
    }
  }
  return true;
}

/**
 * Alle Rechtecke, die für die Zahl mit dem Index `i` überhaupt in Frage kommen.
 *
 * Vier Bedingungen, alle vier notwendig: Fläche = Wert, enthält die eigene
 * Zahl, liegt im Brett, enthält keine FREMDE Zahl. Die letzte ist der Grund,
 * warum diese Menge klein bleibt: ohne sie hätte eine 20 auf einem 12×12-Brett
 * dutzende Lagen, mit ihr sind es meist eine Handvoll.
 *
 * Aufgezählt wird über die Teiler des Wertes: b läuft von 1 bis wert, und h
 * ergibt sich. Der naheliegende Weg — alle Rechtecke des Brettes durchgehen und
 * die mit passender Fläche behalten — wäre bei 12×12 über 6000 Rechtecke je
 * Zahl; über die Teiler sind es bei einer 20 genau sechs Formen und damit
 * einige Dutzend Lagen. Beides ist einmalig billig, aber der Löser baut diese
 * Listen bei jedem Aufruf neu auf, und der Erzeuger ruft den Löser hundertfach.
 *
 * Die Reihenfolge ist festgelegt (b aufsteigend, dann y, dann x) und nicht
 * zufällig: der Löser verzweigt in dieser Reihenfolge, und ein Erzeuger, der
 * denselben Seed zweimal bekommt, muss zweimal dasselbe Rätsel liefern.
 */
export function kandidaten(raetsel, i) {
  const { breite, hoehe, zahlen } = raetsel;
  const eigene = zahlen[i];
  if (!eigene) return [];
  const wert = eigene.wert;
  if (!Number.isInteger(wert) || wert < 1) return [];
  const gitter = zahlgitter(raetsel);
  const gefunden = [];
  // Nur bis `breite` und nicht bis `wert`: eine breitere Form fällt gleich
  // darunter durch `b > breite` heraus, die Aufzählung bleibt also Zeichen für
  // Zeichen dieselbe. Es geht um den Fall, in dem `wert` groß und das Brett
  // klein ist — ein Wert von einer Million (aus einem schadhaften Spielstand,
  // aus einer geteilten Adresse) drehte hier eine Million Runden, um am Ende
  // eine leere Liste zurückzugeben. Die Schranke macht die Laufzeit zur Sache
  // des BRETTES und nicht der hereingegebenen Zahl.
  const bHoechstens = Math.min(wert, breite);
  for (let b = 1; b <= bHoechstens; b++) {
    if (wert % b !== 0) continue;
    const h = wert / b;
    if (h > hoehe) continue;
    const xVon = Math.max(0, eigene.x - b + 1);
    const xBis = Math.min(eigene.x, breite - b);
    const yVon = Math.max(0, eigene.y - h + 1);
    const yBis = Math.min(eigene.y, hoehe - h);
    for (let y = yVon; y <= yBis; y++) {
      for (let x = xVon; x <= xBis; x++) {
        if (nurEigene(gitter, breite, x, y, b, h, i)) gefunden.push({ x, y, b, h });
      }
    }
  }
  return gefunden;
}

/** Summe aller Zahlen == breite*hoehe? Ein Rätsel, für das das nicht gilt, ist keines. */
export function summeStimmt(raetsel) {
  if (!raetsel || !Array.isArray(raetsel.zahlen)) return false;
  let summe = 0;
  for (const z of raetsel.zahlen) {
    if (!z || typeof z.wert !== 'number') return false;
    summe += z.wert;
  }
  return summe === raetsel.breite * raetsel.hoehe;
}

/**
 * Die größte Zellenzahl, die pruefeRaetsel() noch als Rätsel gelten lässt.
 *
 * 128×128, also das Hundertfache des größten Brettes, das dieses Spiel baut
 * (12×12 auf 'experte'). Die Schranke ist keine Geschmacksfrage, sondern die
 * Bedingung dafür, dass pruefeRaetsel() überhaupt seine Aufgabe erfüllen kann:
 * hinter der Prüfung legen zahlgitter(), belegung() und baueAufgabe() im Löser
 * Tabellen über ALLE Zellen an. Ein Rätsel mit `breite: 100000, hoehe: 100000`
 * (Summe der Zahlen 10^10, formal widerspruchsfrei) trieb diese Funktion selbst
 * in einen `RangeError: Array buffer allocation failed` — die Prüfung, die
 * schadhafte Daten abfangen soll, stürzte an ihnen ab, und mit ihr loesen(),
 * logischLoesen() und naechsterZug().
 *
 * Ein Brett dieser Größe ist ohnehin kein Rätsel: niemand spielt es, kein Löser
 * entscheidet es. Es abzuweisen kostet nichts und macht die Zusicherung "null
 * oder eine deutsche Fehlermeldung" erst wahr.
 */
const MAX_ZELLEN = 128 * 128;

/**
 * Rätsel auf Wohlgeformtheit prüfen. -> null oder eine deutsche Fehlermeldung.
 *
 * Diese Funktion steht an der Grenze nach außen: aus dem localStorage, aus
 * einer geteilten Adresse, aus einer alten Fassung des Spiels kann alles
 * hereinkommen. Geprüft wird darum auf dem TYP und nicht umgerechnet —
 * `Number('')` ist 0 und wäre eine gültige Spaltenzahl, `String(['leicht'])`
 * wäre eine gültige Stufe. Eine Prüfung, die so etwas durchlässt, prüft nicht.
 * Und sie wirft nie: eine Prüfung, die an ihrer Eingabe stirbt, prüft auch nicht.
 *
 * Die Stufe wird bewusst NICHT geprüft. Sie ist eine Beschriftung für die
 * Anzeige und keine Eigenschaft der Aufgabe; die Tests bauen Rätsel mit
 * erfundenen Stufen ('hand', 'zwei'), und die sind vollkommen wohlgeformt.
 */
export function pruefeRaetsel(raetsel) {
  if (!raetsel || typeof raetsel !== 'object') return 'Rätsel fehlt';
  const { breite, hoehe } = raetsel;
  if (!Number.isInteger(breite) || breite < 1) return 'Breite muss eine ganze Zahl ab 1 sein';
  if (!Number.isInteger(hoehe) || hoehe < 1) return 'Höhe muss eine ganze Zahl ab 1 sein';
  if (breite * hoehe > MAX_ZELLEN) {
    return `Das Brett ist zu groß (${breite}×${hoehe}, höchstens ${MAX_ZELLEN} Zellen)`;
  }
  if (!Array.isArray(raetsel.zahlen)) return 'zahlen muss ein Array sein';
  if (raetsel.zahlen.length === 0) return 'Das Rätsel hat keine Zahlen';

  const zellen = breite * hoehe;
  // Int32Array und nicht Int16Array: hier steht ein INDEX in `zahlen` drin, und
  // ab 32768 Zahlen lief der in Int16 über. `belegt[k] = 32768` wurde zu -32768,
  // die Prüfung `belegt[k] >= 0` schlug fehl, und zwei Zahlen auf derselben
  // Zelle gingen als wohlgeformt durch. Mit MAX_ZELLEN wären es höchstens 16384
  // Zahlen und Int16 reichte wieder — aber eine Prüfung soll nicht an einer
  // Schranke hängen, die eine Zeile weiter oben steht und morgen anders lautet.
  const belegt = new Int32Array(zellen).fill(-1);
  let summe = 0;
  for (let i = 0; i < raetsel.zahlen.length; i++) {
    const z = raetsel.zahlen[i];
    if (!z || typeof z !== 'object') return `Zahl ${i} ist kein Objekt`;
    if (!Number.isInteger(z.x) || !Number.isInteger(z.y)) {
      return `Zahl ${i} hat keine ganzzahlige Lage`;
    }
    if (z.x < 0 || z.x >= breite || z.y < 0 || z.y >= hoehe) {
      return `Zahl ${i} liegt außerhalb des Brettes`;
    }
    if (!Number.isInteger(z.wert) || z.wert < 1 || z.wert > zellen) {
      return `Zahl ${i} hat keinen brauchbaren Wert`;
    }
    const k = z.y * breite + z.x;
    if (belegt[k] >= 0) return `Auf Zelle (${z.x},${z.y}) stehen zwei Zahlen`;
    belegt[k] = i;
    summe += z.wert;
  }
  if (summe !== zellen) {
    return `Die Summe der Zahlen (${summe}) passt nicht zur Fläche (${zellen})`;
  }
  return null;
}
