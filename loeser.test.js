/**
 * Tests für Löser, Schwierigkeit und Tipp: node --test loeser.test.js
 *
 * Die Rätsel in dieser Datei sind von Hand gebaut und ihre Lösungen von Hand
 * nachgerechnet. Nur die letzten drei Tests rufen den Erzeuger, und zwar für
 * das, was von Hand nicht zu prüfen ist: dass 'leicht' und 'mittel' wirklich
 * ohne Raten durchgehen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { STUFEN, gleich, pruefeStand } from './shikaku.js';
import {
  loesen, eindeutig, logischLoesen, bewerteSchwierigkeit, naechsterZug,
} from './loeser.js';
import { erzeuge, zufall } from './erzeuger.js';

/*
 * Das 7×7-Vorbild: Zahlen 5, 12, 9, 9, 8, 3, 3 — Summe 49.
 *
 * Die Zerlegung sieht so aus (Buchstabe = Rechteck, die Zahl steht jeweils an
 * der unten angegebenen Stelle):
 *
 *     A A A B B B B        A = 3×3 =  9   Zahl bei (0,2)
 *     A A A B B B B        B = 4×3 = 12   Zahl bei (3,0)
 *     A A A B B B B        C = 3×3 =  9   Zahl bei (0,5)
 *     C C C D E F F        D = 1×3 =  3   Zahl bei (3,3)
 *     C C C D E F F        E = 1×3 =  3   Zahl bei (4,3)
 *     C C C D E F F        F = 2×4 =  8   Zahl bei (5,3)
 *     G G G G G F F        G = 5×1 =  5   Zahl bei (4,6)
 *
 * Diese Zahlenlage ist eindeutig lösbar und braucht alle drei Techniken:
 * zwei einzige Deckungen für die beiden 3er-Streifen, dann einen Ausschluss,
 * dann läuft der Rest durch.
 */
const SIEBEN = {
  breite: 7,
  hoehe: 7,
  stufe: 'hand',
  seed: 'sieben',
  zahlen: [
    { x: 0, y: 2, wert: 9 },
    { x: 3, y: 0, wert: 12 },
    { x: 0, y: 5, wert: 9 },
    { x: 3, y: 3, wert: 3 },
    { x: 4, y: 3, wert: 3 },
    { x: 5, y: 3, wert: 8 },
    { x: 4, y: 6, wert: 5 },
  ],
};

const SIEBEN_LOESUNG = [
  { x: 0, y: 0, b: 3, h: 3 },
  { x: 3, y: 0, b: 4, h: 3 },
  { x: 0, y: 3, b: 3, h: 3 },
  { x: 3, y: 3, b: 1, h: 3 },
  { x: 4, y: 3, b: 1, h: 3 },
  { x: 5, y: 3, b: 2, h: 4 },
  { x: 0, y: 6, b: 5, h: 1 },
];

/** Dasselbe Brett mit allen Zahlen in der linken oberen Ecke ihres Rechtecks. */
const SIEBEN_ECKEN = {
  ...SIEBEN,
  seed: 'ecken',
  zahlen: SIEBEN_LOESUNG.map((r) => ({ x: r.x, y: r.y, wert: r.b * r.h })),
};

/**
 * Ein 2×2 mit zwei Zweien auf der Diagonale — das kleinste Rätsel mit GENAU
 * zwei Lösungen. Entweder beide Rechtecke liegen waagrecht (zwei Zeilen) oder
 * beide senkrecht (zwei Spalten); mehr geht auf vier Feldern nicht.
 */
const ZWEI_WEGE = {
  breite: 2, hoehe: 2, stufe: 'zwei', seed: 'zwei',
  zahlen: [{ x: 0, y: 0, wert: 2 }, { x: 1, y: 1, wert: 2 }],
};

/** Dasselbe Brett mit den Zweien untereinander: dann gibt es nur einen Weg. */
const EIN_WEG = {
  breite: 2, hoehe: 2, stufe: 'zwei', seed: 'eins',
  zahlen: [{ x: 0, y: 0, wert: 2 }, { x: 0, y: 1, wert: 2 }],
};

/** Ein 1×5-Streifen: eine 2 am Rand, eine 3 in der Mitte. */
const STREIFEN = {
  breite: 5, hoehe: 1, stufe: 'hand', seed: 'streifen',
  zahlen: [{ x: 0, y: 0, wert: 2 }, { x: 2, y: 0, wert: 3 }],
};

/*
 * Ein 6×4, das GENAU EINE Lösung hat, an dem der logische Löser aber keinen
 * einzigen Schritt zustandebringt — weder eine Zahl mit nur einem Kandidaten,
 * noch eine Zelle mit nur einem Decker, noch ein Ausschluss.
 *
 *     3 3 3 8 8 4        A = 3×1 = 3   Zahl bei (1,0)
 *     3 4 4 8 8 4        B = 2×2 = 4   Zahl bei (1,1)
 *     3 4 4 8 8 4        C = 2×4 = 8   Zahl bei (3,3)
 *     3 2 2 8 8 4        D = 1×3 = 3   Zahl bei (0,2)
 *                        E = 2×1 = 2   Zahl bei (1,3)
 *                        F = 1×4 = 4   Zahl bei (5,1)
 *
 * Ein solches Rätsel ist auf 'schwer' und 'experte' ausdrücklich erlaubt: dort
 * ist nur die Eindeutigkeit Pflicht. Es ist hier als festes Brett eingetragen
 * und nicht als Seed, weil es unter erzeugten Rätseln selten ist (gemessen 2 von
 * 200 auf experte) und ein Test nicht darauf warten soll, dass der Erzeuger
 * eines auswürfelt.
 */
const NUR_MIT_RATEN = {
  breite: 6, hoehe: 4, stufe: 'hand', seed: 'raten',
  zahlen: [
    { x: 1, y: 0, wert: 3 },
    { x: 1, y: 1, wert: 4 },
    { x: 5, y: 1, wert: 4 },
    { x: 0, y: 2, wert: 3 },
    { x: 1, y: 3, wert: 2 },
    { x: 3, y: 3, wert: 8 },
  ],
};

const NUR_MIT_RATEN_LOESUNG = [
  { x: 0, y: 0, b: 3, h: 1 },
  { x: 1, y: 1, b: 2, h: 2 },
  { x: 5, y: 0, b: 1, h: 4 },
  { x: 0, y: 1, b: 1, h: 3 },
  { x: 1, y: 3, b: 2, h: 1 },
  { x: 3, y: 0, b: 2, h: 4 },
];

/**
 * Unlösbar, aber nicht offensichtlich: jede Zahl HAT einen Kandidaten, nur
 * schließen sich die beiden Vieren gegenseitig aus. Die 4 links oben kann nur
 * das Quadrat (0,0)-(1,1) sein (die Streifen wären 4 lang und das Brett ist 3),
 * die 4 rechts oben nur (1,0)-(2,1) — und die beiden teilen sich zwei Zellen.
 */
const UNLOESBAR = {
  breite: 3, hoehe: 3, stufe: 'hand', seed: 'nichts',
  zahlen: [{ x: 0, y: 0, wert: 4 }, { x: 2, y: 0, wert: 4 }, { x: 1, y: 2, wert: 1 }],
};

/*
 * Ein 2×3 mit drei Zweien im Zickzack — GENAU DREI Lösungen:
 *
 *     2 .        (1) zwei senkrechte Zweier oben, ein waagrechter unten
 *     . 2        (2) drei waagrechte Zweier übereinander
 *     2 .        (3) ein waagrechter oben, zwei senkrechte unten
 *
 * Der Gegenpol zu ZWEI_WEGE: eine ungerade Zahl von Lösungen, und zwar eine,
 * die ein Zähler, der Suchblätter statt Lösungen zählt, nicht zufällig auch
 * herausbekommt. Von Hand nachgezählt, unten gegen den dummen Zähler geprüft.
 */
const DREI_WEGE = {
  breite: 2, hoehe: 3, stufe: 'drei', seed: 'drei',
  zahlen: [{ x: 0, y: 0, wert: 2 }, { x: 1, y: 1, wert: 2 }, { x: 0, y: 2, wert: 2 }],
};

/* --------------------------------------------- der dumme Gegenzähler */

/*
 * Ein zweiter Löser, absichtlich dumm, für die Gegenprobe unten.
 *
 * Er benutzt NICHTS aus shikaku.js oder loeser.js — keine kandidaten(), keine
 * Bitmasken, keine Propagation, keine Verzweigungsregel. Er zählt alle
 * Rechtecke des Brettes auf, behält die mit passender Fläche und genau einer
 * (der eigenen) Zahl, probiert dann die Zahlen in fester Reihenfolge durch und
 * zählt am Ende die restlosen Deckungen.
 *
 * Das ist der Punkt: er teilt mit dem echten Löser keinen einzigen Gedanken.
 * Ein Denkfehler in der Propagation oder in der Ausschlussregel — genau die
 * Sorte Fehler, die ein mehrdeutiges Rätsel als eindeutig durchgehen lässt und
 * dem Spieler eine richtige Lösung als falsch ausweist — kann hier nicht
 * dieselbe falsche Zahl erzeugen. Von Hand gerechnete Bretter finden so einen
 * Fehler nicht; er sitzt auf den Brettern, an die niemand gedacht hat.
 */
function dummeKandidaten(raetsel, i) {
  const { breite, hoehe, zahlen } = raetsel;
  const eigen = zahlen[i];
  const out = [];
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      for (let b = 1; x + b <= breite; b++) {
        for (let h = 1; y + h <= hoehe; h++) {
          if (b * h !== eigen.wert) continue;
          // Genau eine Zahl drin, und zwar die EIGENE. Beides zählen: ein
          // Rechteck, in dem allein eine fremde Zahl steht, hätte sonst als
          // Kandidat gegolten (und ZWEI_WEGE hätte vier Lösungen statt zwei).
          let drin = 0;
          let eigeneDrin = false;
          for (let j = 0; j < zahlen.length; j++) {
            const z = zahlen[j];
            if (z.x >= x && z.x < x + b && z.y >= y && z.y < y + h) {
              drin += 1;
              if (j === i) eigeneDrin = true;
            }
          }
          if (drin === 1 && eigeneDrin) out.push({ x, y, b, h });
        }
      }
    }
  }
  return out;
}

/** Alle Lösungen aufzählen, höchstens `hoechstens`. -> { anzahl, loesungen } */
function dummZaehlen(raetsel, hoechstens) {
  const { breite, hoehe, zahlen } = raetsel;
  const zellen = breite * hoehe;
  const kand = zahlen.map((unused, i) => dummeKandidaten(raetsel, i));
  const feld = new Int32Array(zellen).fill(-1);
  const gewaehlt = new Array(zahlen.length).fill(null);
  const loesungen = [];
  let anzahl = 0;

  const malen = (r, wert) => {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.b; x++) feld[y * breite + x] = wert;
    }
  };
  const istFrei = (r) => {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.b; x++) if (feld[y * breite + x] >= 0) return false;
    }
    return true;
  };

  const weiter = (i) => {
    if (anzahl >= hoechstens) return;
    if (i === zahlen.length) {
      for (let k = 0; k < zellen; k++) if (feld[k] < 0) return;
      anzahl += 1;
      loesungen.push(gewaehlt.map((r) => ({ x: r.x, y: r.y, b: r.b, h: r.h })));
      return;
    }
    for (const r of kand[i]) {
      if (!istFrei(r)) continue;
      malen(r, i);
      gewaehlt[i] = r;
      weiter(i + 1);
      gewaehlt[i] = null;
      malen(r, -1);
      if (anzahl >= hoechstens) return;
    }
  };
  weiter(0);
  return { anzahl, loesungen };
}

/**
 * Ein Zufallsbrett mit mindestens einer Lösung: erst restlos zerlegen (erste
 * freie Zelle, zufällig nach rechts und unten wachsen), dann in jedes Rechteck
 * an einer zufälligen Stelle seine Fläche schreiben. Absichtlich NICHT über
 * erzeuger.js: der Erzeuger liefert nur eindeutige Bretter, und geprüft werden
 * soll gerade das Zählen auf mehrdeutigen.
 */
function zufallsBrett(breite, hoehe, rnd, maxKante) {
  const feld = new Int32Array(breite * hoehe).fill(-1);
  const zahlen = [];
  for (let start = 0; start < feld.length; start++) {
    if (feld[start] >= 0) continue;
    const y0 = Math.floor(start / breite);
    const x0 = start - y0 * breite;
    let b = 1;
    let h = 1;
    const ziel = 1 + Math.floor(rnd() * 5);
    let gewachsen = true;
    while (gewachsen && b * h < ziel) {
      gewachsen = false;
      if (b + 1 <= maxKante && x0 + b < breite) {
        let ok = true;
        for (let y = y0; y < y0 + h; y++) if (feld[y * breite + x0 + b] >= 0) ok = false;
        if (ok) { b += 1; gewachsen = true; continue; }
      }
      if (h + 1 <= maxKante && y0 + h < hoehe) {
        let ok = true;
        for (let x = x0; x < x0 + b; x++) if (feld[(y0 + h) * breite + x] >= 0) ok = false;
        if (ok) { h += 1; gewachsen = true; }
      }
    }
    const i = zahlen.length;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + b; x++) feld[y * breite + x] = i;
    }
    zahlen.push({
      x: x0 + Math.floor(rnd() * b),
      y: y0 + Math.floor(rnd() * h),
      wert: b * h,
    });
  }
  return { breite, hoehe, stufe: 'hand', seed: 'zufall', zahlen };
}

/** Eine Lösung als Zeichenkette, damit sich Lösungsmengen vergleichen lassen. */
const alsText = (loesung) => loesung.map((r) => `${r.x},${r.y},${r.b},${r.h}`).join('|');

/* ------------------------------------------------------------- Zählen */

test('das 7×7-Vorbild hat genau eine Lösung, und zwar die gezeichnete', () => {
  const erg = loesen(SIEBEN, { maxLoesungen: 2 });
  assert.equal(erg.abgebrochen, false);
  assert.equal(erg.anzahl, 1);
  assert.deepEqual(erg.loesungen[0], SIEBEN_LOESUNG);
  assert.equal(pruefeStand(SIEBEN, erg.loesungen[0]).fertig, true);
});

test('das 7×7 mit allen Zahlen in der Ecke ist ebenfalls eindeutig', () => {
  const erg = loesen(SIEBEN_ECKEN, { maxLoesungen: 2 });
  assert.equal(erg.anzahl, 1);
  assert.deepEqual(erg.loesungen[0], SIEBEN_LOESUNG);
});

test('ein Rätsel mit zwei Lösungen: der Löser muss beide finden', () => {
  const erg = loesen(ZWEI_WEGE, { maxLoesungen: 2 });
  assert.equal(erg.abgebrochen, false);
  assert.equal(erg.anzahl, 2);
  assert.equal(erg.loesungen.length, 2);
  // Beide gefundenen Lösungen sind gültige Zerlegungen und verschieden.
  for (const l of erg.loesungen) assert.equal(pruefeStand(ZWEI_WEGE, l).fertig, true);
  assert.ok(!gleich(erg.loesungen[0][0], erg.loesungen[1][0]));
});

test('loesen zählt LÖSUNGEN und nicht Suchblätter: genau zwei und genau drei', () => {
  /*
   * Ein Zähler, der die Blätter des Suchbaums zählt statt der Lösungen, fällt
   * an einem eindeutigen Rätsel nicht auf und an einem zweideutigen oft auch
   * nicht. Darum ausdrücklich beides: ein Brett mit genau zwei und eines mit
   * genau drei Lösungen, jeweils mit reichlich Luft nach oben gezählt, und die
   * gefundenen Lösungen müssen paarweise verschieden und alle gültig sein.
   */
  for (const [raetsel, soll] of [[ZWEI_WEGE, 2], [DREI_WEGE, 3]]) {
    const erg = loesen(raetsel, { maxLoesungen: 20 });
    assert.equal(erg.abgebrochen, false, raetsel.seed);
    assert.equal(erg.anzahl, soll, `${raetsel.seed}: ${erg.anzahl} statt ${soll}`);
    assert.equal(erg.loesungen.length, soll, raetsel.seed);
    assert.equal(new Set(erg.loesungen.map(alsText)).size, soll,
      `${raetsel.seed}: doppelt gemeldete Lösung`);
    for (const l of erg.loesungen) {
      assert.equal(pruefeStand(raetsel, l).fertig, true, raetsel.seed);
    }
    // Und dieselbe Zahl kommt aus dem dummen Zähler heraus.
    assert.equal(dummZaehlen(raetsel, 20).anzahl, soll, raetsel.seed);
  }
});

test('loesen stimmt auf 200 Zufallsbrettern mit dem dummen Zähler überein', () => {
  /*
   * Die eigentliche Zusicherung dieser Datei. Ein Fehler in Propagation oder
   * Verzweigung zeigt sich nicht an den Brettern oben — die sind von Hand
   * gebaut und damit genau die Fälle, an die gedacht wurde. Er zeigt sich an
   * einem beliebigen mehrdeutigen Brett, und dort wird er hier gesucht:
   * gleiche Anzahl, gleiche Lösungsmenge, jede gemeldete Lösung gültig.
   */
  let mehrdeutig = 0;
  let loesungenGesamt = 0;
  for (let n = 0; n < 200; n++) {
    const rnd = zufall('gegenprobe' + n);
    const breite = 2 + Math.floor(rnd() * 4);
    const hoehe = 2 + Math.floor(rnd() * 4);
    const raetsel = zufallsBrett(breite, hoehe, rnd, 1 + Math.floor(rnd() * 3));
    const wo = `Brett ${n} (${breite}×${hoehe})`;

    const dumm = dummZaehlen(raetsel, 60);
    const klug = loesen(raetsel, { maxLoesungen: 60, maxKnoten: 2000000 });
    assert.equal(klug.abgebrochen, false, wo);
    assert.equal(klug.anzahl, dumm.anzahl, `${wo}: ${klug.anzahl} gegen ${dumm.anzahl}`);
    assert.deepEqual(klug.loesungen.map(alsText).sort(), dumm.loesungen.map(alsText).sort(), wo);
    for (const l of klug.loesungen) assert.equal(pruefeStand(raetsel, l).fertig, true, wo);
    assert.equal(eindeutig(raetsel), dumm.anzahl === 1, `${wo}: eindeutig-Urteil`);

    if (dumm.anzahl > 1) mehrdeutig += 1;
    loesungenGesamt += dumm.anzahl;
  }
  // Ein Lauf, in dem fast jedes Brett eindeutig ist, prüft das Zählen nicht.
  assert.ok(mehrdeutig >= 20, `nur ${mehrdeutig} mehrdeutige Bretter`);
  assert.ok(loesungenGesamt >= 220, `nur ${loesungenGesamt} Lösungen insgesamt`);
});

test('mehr als maxLoesungen wird nicht gesucht', () => {
  const eine = loesen(ZWEI_WEGE, { maxLoesungen: 1 });
  assert.equal(eine.anzahl, 1, 'nach der ersten wird abgebrochen');
  assert.equal(eine.loesungen.length, 1);
});

test('das 2×2 mit den Zahlen untereinander hat nur einen Weg', () => {
  const erg = loesen(EIN_WEG, { maxLoesungen: 2 });
  assert.equal(erg.anzahl, 1);
  assert.deepEqual(erg.loesungen[0], [
    { x: 0, y: 0, b: 2, h: 1 },
    { x: 0, y: 1, b: 2, h: 1 },
  ]);
});

test('ein 1×n-Brett', () => {
  const erg = loesen(STREIFEN, { maxLoesungen: 2 });
  assert.equal(erg.anzahl, 1);
  assert.deepEqual(erg.loesungen[0], [
    { x: 0, y: 0, b: 2, h: 1 },
    { x: 2, y: 0, b: 3, h: 1 },
  ]);
});

test('das kleinste Brett von allen: 1×1', () => {
  const eins = { breite: 1, hoehe: 1, stufe: 'hand', seed: 'x', zahlen: [{ x: 0, y: 0, wert: 1 }] };
  const erg = loesen(eins, { maxLoesungen: 2 });
  assert.equal(erg.anzahl, 1);
  assert.deepEqual(erg.loesungen[0], [{ x: 0, y: 0, b: 1, h: 1 }]);
});

test('ein unlösbares Rätsel hat null Lösungen', () => {
  const erg = loesen(UNLOESBAR, { maxLoesungen: 2 });
  assert.equal(erg.anzahl, 0);
  assert.deepEqual(erg.loesungen, []);
  assert.equal(erg.abgebrochen, false, 'die Antwort ist sicher, nicht abgebrochen');
});

test('ein Rätsel, das keines ist, hat null Lösungen und wirft nicht', () => {
  for (const kaputt of [
    null,
    { breite: 4, hoehe: 4, zahlen: [{ x: 0, y: 0, wert: 4 }] },        // Summe falsch
    { breite: 2, hoehe: 2, zahlen: [{ x: 5, y: 5, wert: 4 }] },        // außerhalb
    { breite: 2, hoehe: 2, zahlen: 'vier' },
  ]) {
    const erg = loesen(kaputt);
    assert.equal(erg.anzahl, 0);
    assert.equal(erg.abgebrochen, false);
    assert.equal(eindeutig(kaputt), false);
  }
});

test('die Knotengrenze wird gemeldet und nicht überschritten', () => {
  const erg = loesen(SIEBEN, { maxLoesungen: 2, maxKnoten: 1 });
  assert.equal(erg.abgebrochen, true);
  assert.ok(erg.knoten <= 2, `knoten war ${erg.knoten}`);
});

test('eindeutig ist bei einem abgebrochenen Lauf falsch — im Zweifel nein', () => {
  assert.equal(eindeutig(SIEBEN), true);
  assert.equal(eindeutig(ZWEI_WEGE), false, 'zwei Lösungen');
  assert.equal(eindeutig(UNLOESBAR), false, 'keine Lösung');
  assert.equal(eindeutig(EIN_WEG), true);
});

test('knoten wird immer gezählt, auch wenn nichts gefunden wird', () => {
  assert.ok(loesen(UNLOESBAR).knoten >= 1);
  assert.ok(loesen(SIEBEN).knoten >= 1);
});

/* ------------------------------------------------- der logische Löser */

test('logischLoesen löst das 7×7 ohne Raten', () => {
  const erg = logischLoesen(SIEBEN);
  assert.equal(erg.geloest, true);
  assert.equal(erg.sackgasse, false);
  assert.deepEqual(erg.rechtecke, SIEBEN_LOESUNG);
  assert.equal(erg.schritte.length, SIEBEN.zahlen.length,
    'je Zahl genau ein Schritt');
});

test('die Schrittzähler stimmen mit den Schritten überein', () => {
  for (const raetsel of [SIEBEN, SIEBEN_ECKEN, EIN_WEG, STREIFEN]) {
    const erg = logischLoesen(raetsel);
    const summe = erg.technik.einzigerKandidat + erg.technik.einzigeDeckung + erg.technik.ausschluss;
    assert.equal(summe, erg.schritte.length);
    for (const s of erg.schritte) {
      assert.ok(['einzigerKandidat', 'einzigeDeckung', 'ausschluss'].includes(s.technik));
      assert.ok(s.zahl >= 0 && s.zahl < raetsel.zahlen.length);
      assert.equal(s.rechteck.b * s.rechteck.h, raetsel.zahlen[s.zahl].wert);
    }
  }
});

test('jeder Schluss des logischen Lösers steht auch in der echten Lösung', () => {
  // Das ist die Eigenschaft, an der der Tipp hängt: ein logischer Schluss ist
  // zwingend, also muss er in JEDER Lösung vorkommen.
  const echt = loesen(SIEBEN, { maxLoesungen: 1 }).loesungen[0];
  for (const s of logischLoesen(SIEBEN).schritte) {
    assert.ok(gleich(s.rechteck, echt[s.zahl]), `Schritt für Zahl ${s.zahl}`);
  }
});

test('das 7×7 braucht alle drei Techniken', () => {
  const erg = logischLoesen(SIEBEN);
  assert.ok(erg.technik.einzigeDeckung > 0, 'einzige Deckung');
  assert.ok(erg.technik.ausschluss > 0, 'Ausschluss');
});

test('das 7×7 mit allen Zahlen in der Ecke braucht nur die einfachste Technik', () => {
  const erg = logischLoesen(SIEBEN_ECKEN);
  assert.equal(erg.geloest, true);
  assert.equal(erg.technik.einzigerKandidat, 7);
  assert.equal(erg.technik.einzigeDeckung, 0);
  assert.equal(erg.technik.ausschluss, 0);
});

test('logischLoesen erkennt den Widerspruch', () => {
  const erg = logischLoesen(UNLOESBAR);
  assert.equal(erg.sackgasse, true);
  assert.equal(erg.geloest, false);
});

test('logischLoesen bleibt bei einem mehrdeutigen Rätsel stehen', () => {
  const erg = logischLoesen(ZWEI_WEGE);
  assert.equal(erg.geloest, false);
  assert.equal(erg.sackgasse, false, 'kein Widerspruch, nur nicht zu erschließen');
  assert.deepEqual(erg.rechtecke, [null, null]);
  assert.deepEqual(erg.schritte, []);
});

test('logischLoesen verträgt ein kaputtes Rätsel', () => {
  const erg = logischLoesen({ breite: 2, hoehe: 2, zahlen: [{ x: 0, y: 0, wert: 3 }] });
  assert.equal(erg.geloest, false);
  assert.equal(erg.sackgasse, true);
  assert.deepEqual(erg.rechtecke, [null]);
  assert.equal(logischLoesen(null).sackgasse, true);
});

test('logischLoesen nimmt eine Vorgabe an und rechnet von dort weiter', () => {
  const vorgabe = SIEBEN_LOESUNG.map((r, i) => (i === 0 ? r : null));
  const erg = logischLoesen(SIEBEN, vorgabe);
  assert.equal(erg.geloest, true);
  assert.deepEqual(erg.rechtecke, SIEBEN_LOESUNG);
  assert.equal(erg.schritte.length, SIEBEN.zahlen.length - 1,
    'der vorgegebene Schritt wird nicht noch einmal gefunden');
  assert.ok(!erg.schritte.some((s) => s.zahl === 0));
});

test('eine unmögliche Vorgabe ist eine Sackgasse', () => {
  const falsch = SIEBEN_LOESUNG.map((r, i) => (i === 0 ? { x: 4, y: 4, b: 3, h: 3 } : null));
  assert.equal(logischLoesen(SIEBEN, falsch).sackgasse, true);
});

test('eine zu lange Vorgabe ist eine Sackgasse und keine Ausnahme', () => {
  // Ein Spielstand kann MEHR Rechtecke enthalten als das Rätsel Zahlen hat —
  // der Spieler hat eines zu viel gezogen. Vorher lief die Vorgabe-Schleife
  // über das Ende der Zahlen hinaus und starb an `aufg.zahlKand[i]`.
  const zuLang = [...SIEBEN_LOESUNG, { x: 0, y: 0, b: 1, h: 1 }];
  const erg = logischLoesen(SIEBEN, zuLang);
  assert.equal(erg.sackgasse, true);
  assert.equal(erg.geloest, false);
  assert.equal(erg.rechtecke.length, SIEBEN.zahlen.length, 'die Antwort bleibt parallel');
  // Nur Lücken hinter dem Ende sind harmlos: das ist kein zusätzliches Rechteck.
  const nurLuecken = [...SIEBEN_LOESUNG, null, undefined];
  assert.equal(logischLoesen(SIEBEN, nurLuecken).geloest, true);
});

test('ein unmäßig großes Brett wirft nirgends, es wird abgewiesen', () => {
  /*
   * pruefeRaetsel() ist das Tor für alles, was aus dem localStorage oder einer
   * geteilten Adresse hereinkommt. Vorher legte es für ein 100000×100000-Brett
   * eine Tabelle über alle Zellen an und starb an einem RangeError — und mit
   * ihm loesen(), logischLoesen() und naechsterZug(), die alle eine Antwort
   * versprechen und keine Ausnahme.
   */
  for (const riesig of [
    { breite: 100000, hoehe: 100000, stufe: 'h', seed: 'x', zahlen: [{ x: 0, y: 0, wert: 1 }] },
    // Formal widerspruchsfrei: eine Zahl, die genau das ganze Brett deckt.
    { breite: 100000, hoehe: 100000, stufe: 'h', seed: 'x', zahlen: [{ x: 0, y: 0, wert: 10000000000 }] },
    { breite: 2147483647, hoehe: 2147483647, stufe: 'h', seed: 'x', zahlen: [{ x: 0, y: 0, wert: 1 }] },
  ]) {
    const erg = loesen(riesig);
    assert.equal(erg.anzahl, 0);
    assert.equal(erg.abgebrochen, false);
    assert.equal(eindeutig(riesig), false);
    assert.equal(logischLoesen(riesig).sackgasse, true);
    assert.equal(naechsterZug(riesig, []), null);
    assert.equal(bewerteSchwierigkeit(riesig).raten, true);
  }
});

/* ---------------------------------------------------- Schwierigkeit */

test('bewerteSchwierigkeit beschreibt das 7×7', () => {
  const b = bewerteSchwierigkeit(SIEBEN);
  assert.equal(b.raten, false);
  assert.ok(b.punkte > 0);
  assert.ok(STUFEN.includes(b.stufe));
  assert.deepEqual(Object.keys(b.techniken).sort(),
    ['ausschluss', 'einzigeDeckung', 'einzigerKandidat']);
});

test('mehr Technik heißt mehr Punkte', () => {
  const einfach = bewerteSchwierigkeit(SIEBEN_ECKEN);
  const schwerer = bewerteSchwierigkeit(SIEBEN);
  assert.ok(schwerer.punkte > einfach.punkte,
    `${schwerer.punkte} sollte über ${einfach.punkte} liegen`);
});

test('bewerteSchwierigkeit setzt raten, wenn der logische Löser nicht durchkommt', () => {
  const b = bewerteSchwierigkeit(ZWEI_WEGE);
  assert.equal(b.raten, true);
  assert.ok(b.punkte >= 40, 'zwei offene Zahlen kosten je STRAFE_OFFEN');
});

/* ----------------------------------------------------------- Tipp */

test('naechsterZug nennt auf dem leeren Brett den ersten Schluss', () => {
  const tipp = naechsterZug(SIEBEN, []);
  assert.ok(tipp);
  assert.equal(tipp.grund, `tipp.${tipp.technik}`);
  assert.ok(['einzigerKandidat', 'einzigeDeckung', 'ausschluss'].includes(tipp.technik));
  assert.ok(gleich(tipp.rechteck, SIEBEN_LOESUNG[tipp.zahl]), 'der Tipp trifft die echte Lösung');
  assert.equal(tipp.wert, SIEBEN.zahlen[tipp.zahl].wert);
});

test('der Tipp geht Schritt für Schritt durch das ganze Rätsel', () => {
  // Immer den Tipp annehmen: dann muss das Brett in genau so vielen Schritten
  // fertig werden, wie es Zahlen hat, und nie ein Aufräum-Tipp kommen.
  const stand = [];
  for (let n = 0; n < SIEBEN.zahlen.length; n++) {
    const tipp = naechsterZug(SIEBEN, stand);
    assert.ok(tipp, `Schritt ${n}`);
    assert.notEqual(tipp.technik, 'raeumeAuf', `Schritt ${n} soll kein Aufräumen sein`);
    assert.ok(gleich(tipp.rechteck, SIEBEN_LOESUNG[tipp.zahl]));
    stand.push(tipp.rechteck);
  }
  assert.equal(pruefeStand(SIEBEN, stand).fertig, true);
  assert.equal(naechsterZug(SIEBEN, stand), null, 'auf dem fertigen Brett gibt es nichts zu sagen');
});

test('naechsterZug räumt zuerst auf, wenn etwas Falsches liegt', () => {
  const falsch = { x: 0, y: 0, b: 3, h: 4 };     // 12 Zellen, enthält die 9
  const tipp = naechsterZug(SIEBEN, [falsch]);
  assert.ok(tipp);
  assert.equal(tipp.technik, 'raeumeAuf');
  assert.equal(tipp.grund, 'tipp.raeumeAuf');
  assert.ok(gleich(tipp.rechteck, falsch), 'gemeldet wird das falsche Rechteck selbst');
});

test('naechsterZug räumt auch ein Rechteck weg, das für sich gut aussieht', () => {
  // 3×3 an der falschen Stelle: enthält genau eine 9 und hat die Fläche 9,
  // ist also 'gut' im Sinne von bewerteRechteck — und trotzdem falsch.
  const falsch = { x: 0, y: 2, b: 3, h: 3 };
  assert.ok(!SIEBEN_LOESUNG.some((r) => gleich(r, falsch)));
  const tipp = naechsterZug(SIEBEN, [falsch]);
  assert.equal(tipp.technik, 'raeumeAuf');
  assert.ok(gleich(tipp.rechteck, falsch));
});

test('naechsterZug meldet das zweite von zwei gleichen Rechtecken', () => {
  const richtig = SIEBEN_LOESUNG[1];
  const tipp = naechsterZug(SIEBEN, [richtig, { ...richtig }]);
  assert.equal(tipp.technik, 'raeumeAuf', 'einmal richtig ist richtig, zweimal ist eines zu viel');
});

test('naechsterZug baut auf dem auf, was schon richtig liegt', () => {
  const stand = [SIEBEN_LOESUNG[3], SIEBEN_LOESUNG[4]];
  const tipp = naechsterZug(SIEBEN, stand);
  assert.ok(tipp);
  assert.notEqual(tipp.technik, 'raeumeAuf');
  assert.ok(tipp.zahl !== 3 && tipp.zahl !== 4, 'nicht noch einmal dasselbe');
  assert.ok(gleich(tipp.rechteck, SIEBEN_LOESUNG[tipp.zahl]));
});

test('naechsterZug verträgt Lücken und Unsinn im Spielstand', () => {
  assert.ok(naechsterZug(SIEBEN, [null, undefined]));
  assert.ok(naechsterZug(SIEBEN, null));
  assert.equal(naechsterZug(UNLOESBAR, []), null, 'ohne Lösung kein Tipp');
  assert.equal(naechsterZug(null, []), null);
});

test('das 6×4 ist eindeutig und für den logischen Löser doch unzugänglich', () => {
  const erg = loesen(NUR_MIT_RATEN, { maxLoesungen: 2 });
  assert.equal(erg.abgebrochen, false);
  assert.equal(erg.anzahl, 1, 'eindeutig');
  assert.deepEqual(erg.loesungen[0], NUR_MIT_RATEN_LOESUNG);

  const logisch = logischLoesen(NUR_MIT_RATEN);
  assert.equal(logisch.geloest, false);
  assert.equal(logisch.sackgasse, false, 'kein Widerspruch — nur nicht zu erschließen');
  assert.deepEqual(logisch.schritte, [], 'nicht ein einziger Schritt');
  assert.equal(bewerteSchwierigkeit(NUR_MIT_RATEN).raten, true);
});

test('auch auf einem Rätsel, das der logische Löser nicht schafft, kommt ein Tipp', () => {
  // Sonst wäre der Tipp-Knopf auf 'schwer' und 'experte' gelegentlich ein
  // Knopf, der nichts tut — und dem Spieler ist nicht zu erklären, warum.
  const tipp = naechsterZug(NUR_MIT_RATEN, []);
  assert.ok(tipp, 'ein Tipp muss kommen');
  assert.ok(gleich(tipp.rechteck, NUR_MIT_RATEN_LOESUNG[tipp.zahl]), 'und er muss stimmen');
  assert.equal(tipp.technik, 'ausschluss');
  assert.equal(tipp.grund, 'tipp.ausschluss');
});

test('der Tipp führt auch das 6×4 bis zum Ende', () => {
  const stand = [];
  for (let n = 0; n < NUR_MIT_RATEN.zahlen.length; n++) {
    const tipp = naechsterZug(NUR_MIT_RATEN, stand);
    assert.ok(tipp, `Schritt ${n}`);
    assert.notEqual(tipp.technik, 'raeumeAuf', `Schritt ${n}`);
    assert.ok(gleich(tipp.rechteck, NUR_MIT_RATEN_LOESUNG[tipp.zahl]), `Schritt ${n}`);
    stand.push(tipp.rechteck);
  }
  assert.equal(pruefeStand(NUR_MIT_RATEN, stand).fertig, true);
});

/* ------------------------------------- die Zusicherung an die Stufen */

test('leicht ist ohne Raten lösbar, über 40 Seeds', () => {
  for (let i = 0; i < 40; i++) {
    const seed = 'l' + String(i).padStart(2, '0');
    const { raetsel } = erzeuge('leicht', seed);
    assert.equal(logischLoesen(raetsel).geloest, true, `leicht/${seed}`);
    assert.equal(bewerteSchwierigkeit(raetsel).raten, false, `leicht/${seed}`);
  }
});

test('mittel ist ohne Raten lösbar, über 40 Seeds', () => {
  for (let i = 0; i < 40; i++) {
    const seed = 'm' + String(i).padStart(2, '0');
    const { raetsel } = erzeuge('mittel', seed);
    assert.equal(logischLoesen(raetsel).geloest, true, `mittel/${seed}`);
  }
});

test('der vorgeschlagene Zug steht über 100 Rätsel hinweg in der echten Lösung', () => {
  /*
   * Der Tipp ist nur so viel wert, wie er stimmt. Geprüft wird darum nicht auf
   * dem leeren Brett allein — dort trifft schon der erste Schluss —, sondern
   * aus zufälligen RICHTIGEN Teilständen heraus: der genannte Zug muss in der
   * eindeutigen Lösung vorkommen, er darf nicht schon liegen, und aus einem
   * richtigen Teilstand darf nie ein Aufräum-Tipp kommen.
   *
   * Und die Lösung, mit der verglichen wird, ist nicht die des Erzeugers,
   * sondern die, die loesen() findet — sonst prüfte der Test den Tipp gegen
   * eine Behauptung statt gegen das Rätsel.
   */
  let raetselZahl = 0;
  let tipps = 0;
  for (const stufe of STUFEN) {
    for (let n = 0; n < 25; n++) {
      const seed = `z${stufe[0]}${n}`;
      const { raetsel } = erzeuge(stufe, seed);
      const gezaehlt = loesen(raetsel, { maxLoesungen: 2 });
      assert.equal(gezaehlt.anzahl, 1, `${seed}: nicht eindeutig`);
      const loesung = gezaehlt.loesungen[0];
      raetselZahl += 1;

      const rnd = zufall(`stand:${seed}`);
      const staende = [[]];
      for (let v = 0; v < 4; v++) staende.push(loesung.filter(() => rnd() < 0.5));
      for (const stand of staende) {
        const tipp = naechsterZug(raetsel, stand);
        if (stand.length === loesung.length) {
          assert.equal(tipp, null, `${seed}: fertiges Brett`);
          continue;
        }
        assert.ok(tipp, `${seed}: kein Tipp bei ${stand.length} von ${loesung.length}`);
        tipps += 1;
        assert.notEqual(tipp.technik, 'raeumeAuf', `${seed}: alles Gelegte war richtig`);
        assert.ok(gleich(tipp.rechteck, loesung[tipp.zahl]), `${seed}: Tipp neben der Lösung`);
        assert.equal(tipp.wert, raetsel.zahlen[tipp.zahl].wert, seed);
        assert.equal(tipp.grund, `tipp.${tipp.technik}`, seed);
        assert.ok(!stand.some((r) => gleich(r, tipp.rechteck)),
          `${seed}: der Tipp nennt ein Rechteck, das schon liegt`);
      }
    }
  }
  assert.equal(raetselZahl, 100);
  assert.ok(tipps >= 400, `nur ${tipps} Tipps geprüft`);
});

test('der Tipp führt jedes erzeugte Rätsel bis zum Ende', () => {
  for (const stufe of STUFEN) {
    const { raetsel, loesung } = erzeuge(stufe, 'zug7');
    const stand = [];
    for (let n = 0; n < raetsel.zahlen.length; n++) {
      const tipp = naechsterZug(raetsel, stand);
      assert.ok(tipp, `${stufe}: Schritt ${n}`);
      assert.notEqual(tipp.technik, 'raeumeAuf', `${stufe}: Schritt ${n}`);
      assert.ok(gleich(tipp.rechteck, loesung[tipp.zahl]), `${stufe}: Schritt ${n}`);
      stand.push(tipp.rechteck);
    }
    assert.equal(pruefeStand(raetsel, stand).fertig, true, stufe);
    assert.equal(naechsterZug(raetsel, stand), null, stufe);
  }
});
