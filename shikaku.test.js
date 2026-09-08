/**
 * Regeltests für das Modell: node --test shikaku.test.js
 *
 * Alles hier ist von Hand nachgerechnet. Kein Test in dieser Datei ruft den
 * Erzeuger — die Regeln müssen sich an Brettern prüfen lassen, die man auf ein
 * Blatt zeichnen kann, sonst prüft man den Erzeuger und nicht die Regeln.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUFEN, flaeche, normRechteck, enthaelt, ueberlappen, gleich, imBrett,
  zahlenIn, zahlAn, bewerteRechteck, belegung, pruefeStand, kandidaten,
  summeStimmt, pruefeRaetsel,
} from './shikaku.js';

/**
 * Ein 4×4-Brett mit einer 4 in jeder Ecke. Summe 16 = Fläche, also ein
 * wohlgeformtes Rätsel; die Lösung sind die vier 2×2-Quadranten.
 */
const VIERECK = {
  breite: 4,
  hoehe: 4,
  stufe: 'hand',
  seed: 'hand',
  zahlen: [
    { x: 0, y: 0, wert: 4 },
    { x: 3, y: 0, wert: 4 },
    { x: 0, y: 3, wert: 4 },
    { x: 3, y: 3, wert: 4 },
  ],
};

test('STUFEN ist die Reihenfolge, auf die sich alles andere verlässt', () => {
  assert.deepEqual(STUFEN, ['leicht', 'mittel', 'schwer', 'experte']);
});

test('flaeche ist Breite mal Höhe', () => {
  assert.equal(flaeche({ x: 2, y: 1, b: 4, h: 3 }), 12);
  assert.equal(flaeche({ x: 0, y: 0, b: 1, h: 1 }), 1);
});

test('normRechteck nimmt die Ecken in jeder Reihenfolge und Richtung', () => {
  const soll = { x: 1, y: 2, b: 3, h: 2 };
  assert.deepEqual(normRechteck(1, 2, 3, 3), soll, 'links oben nach rechts unten');
  assert.deepEqual(normRechteck(3, 3, 1, 2), soll, 'rechts unten nach links oben');
  assert.deepEqual(normRechteck(3, 2, 1, 3), soll, 'rechts oben nach links unten');
  assert.deepEqual(normRechteck(1, 3, 3, 2), soll, 'links unten nach rechts oben');
});

test('normRechteck: eine einzelne Zelle ist 1×1 und nicht 0×0', () => {
  assert.deepEqual(normRechteck(3, 3, 3, 3), { x: 3, y: 3, b: 1, h: 1 });
});

test('normRechteck rechnet auch mit negativen Ecken weiter', () => {
  // Beim Ziehen über den Brettrand hinaus liefert die Oberfläche negative
  // Zellen. Diese Funktion soll daran nicht scheitern; die Prüfung, ob das
  // Ergebnis im Brett liegt, ist Sache von imBrett().
  assert.deepEqual(normRechteck(-2, 1, 0, 1), { x: -2, y: 1, b: 3, h: 1 });
});

test('enthaelt kennt die Grenzen des Rechtecks', () => {
  const r = { x: 2, y: 1, b: 3, h: 2 };
  assert.ok(enthaelt(r, 2, 1), 'linke obere Ecke');
  assert.ok(enthaelt(r, 4, 2), 'rechte untere Ecke');
  assert.ok(!enthaelt(r, 5, 1), 'eine Spalte zu weit rechts');
  assert.ok(!enthaelt(r, 2, 3), 'eine Zeile zu weit unten');
  assert.ok(!enthaelt(r, 1, 1), 'eine Spalte zu weit links');
});

test('ueberlappen: Berühren ist kein Überlappen', () => {
  const a = { x: 0, y: 0, b: 2, h: 2 };
  assert.ok(ueberlappen(a, { x: 1, y: 1, b: 2, h: 2 }), 'eine Zelle gemeinsam');
  assert.ok(!ueberlappen(a, { x: 2, y: 0, b: 2, h: 2 }), 'Kante an Kante, waagrecht');
  assert.ok(!ueberlappen(a, { x: 0, y: 2, b: 2, h: 2 }), 'Kante an Kante, senkrecht');
  assert.ok(!ueberlappen(a, { x: 2, y: 2, b: 2, h: 2 }), 'nur Ecke an Ecke');
  assert.ok(ueberlappen(a, a), 'mit sich selbst schon');
});

test('gleich verlangt alle vier Zahlen und verträgt null', () => {
  const a = { x: 1, y: 2, b: 3, h: 4 };
  assert.ok(gleich(a, { x: 1, y: 2, b: 3, h: 4 }));
  assert.ok(!gleich(a, { x: 1, y: 2, b: 4, h: 3 }), 'gedreht ist nicht gleich');
  assert.ok(!gleich(a, null));
  assert.ok(!gleich(null, null), 'zwei Nichtse sind nicht deckungsgleich');
});

test('imBrett prüft den Rahmen und die Mindestgröße', () => {
  assert.ok(imBrett({ x: 0, y: 0, b: 4, h: 4 }, 4, 4), 'genau ausgefüllt');
  assert.ok(!imBrett({ x: 1, y: 0, b: 4, h: 4 }, 4, 4), 'rechts hinaus');
  assert.ok(!imBrett({ x: -1, y: 0, b: 2, h: 2 }, 4, 4), 'links hinaus');
  assert.ok(!imBrett({ x: 0, y: 0, b: 0, h: 2 }, 4, 4), 'Breite 0 ist kein Rechteck');
  assert.ok(!imBrett(null, 4, 4));
});

test('zahlenIn und zahlAn', () => {
  assert.deepEqual(zahlenIn(VIERECK, { x: 0, y: 0, b: 2, h: 2 }), [0]);
  assert.deepEqual(zahlenIn(VIERECK, { x: 0, y: 0, b: 4, h: 1 }), [0, 1]);
  assert.deepEqual(zahlenIn(VIERECK, { x: 1, y: 1, b: 2, h: 2 }), []);
  assert.deepEqual(zahlenIn(VIERECK, { x: 0, y: 0, b: 4, h: 4 }), [0, 1, 2, 3]);
  assert.equal(zahlAn(VIERECK, 3, 0), 1);
  assert.equal(zahlAn(VIERECK, 1, 1), -1);
});

test('bewerteRechteck kennt alle fünf Urteile', () => {
  assert.equal(bewerteRechteck(VIERECK, { x: 0, y: 0, b: 2, h: 2 }), 'gut');
  assert.equal(bewerteRechteck(VIERECK, { x: 1, y: 1, b: 2, h: 2 }), 'keineZahl');
  assert.equal(bewerteRechteck(VIERECK, { x: 0, y: 0, b: 4, h: 1 }), 'mehrereZahlen');
  assert.equal(bewerteRechteck(VIERECK, { x: 0, y: 0, b: 3, h: 2 }), 'zuGross');
  assert.equal(bewerteRechteck(VIERECK, { x: 0, y: 0, b: 1, h: 2 }), 'zuKlein');
});

test('bewerteRechteck meldet zwei Zahlen und nicht die falsche Fläche', () => {
  // Ein 1×4-Streifen über zwei Vieren hat die Fläche 4, also "richtig" für
  // jede von beiden. Das Urteil muss trotzdem 'mehrereZahlen' sein: der
  // Spieler soll teilen und nicht die Kante schieben.
  assert.equal(bewerteRechteck(VIERECK, { x: 0, y: 0, b: 4, h: 1 }), 'mehrereZahlen');
});

test('belegung nennt zu jeder Zelle ihr Rechteck', () => {
  const feld = belegung(VIERECK, [{ x: 0, y: 0, b: 2, h: 2 }]);
  assert.equal(feld.length, 16);
  assert.equal(feld[0], 0);
  assert.equal(feld[1], 0);
  assert.equal(feld[4], 0, 'Zelle (0,1) ist y*breite+x = 4');
  assert.equal(feld[5], 0);
  assert.equal(feld[2], -1, 'unbedeckt');
  assert.equal(feld[15], -1);
});

test('belegung: Doppeldeckung wird -2 und bleibt -2', () => {
  const zwei = belegung(VIERECK, [{ x: 0, y: 0, b: 2, h: 2 }, { x: 1, y: 1, b: 2, h: 2 }]);
  assert.equal(zwei[5], -2, 'Zelle (1,1) liegt in beiden');
  assert.equal(zwei[0], 0, 'nur im ersten');
  assert.equal(zwei[10], 1, 'nur im zweiten');

  const drei = belegung(VIERECK, [
    { x: 0, y: 0, b: 4, h: 4 }, { x: 0, y: 0, b: 4, h: 4 }, { x: 0, y: 0, b: 4, h: 4 },
  ]);
  for (let k = 0; k < 16; k++) assert.equal(drei[k], -2, 'dreifach bleibt doppelt');
});

test('belegung beschneidet Rechtecke am Brettrand', () => {
  const feld = belegung(VIERECK, [{ x: 3, y: 3, b: 2, h: 2 }]);
  assert.equal(feld[15], 0, 'die eine Zelle im Brett');
  let gedeckt = 0;
  for (const v of feld) if (v >= 0) gedeckt += 1;
  assert.equal(gedeckt, 1, 'was draußen liegt, taucht nicht auf');
});

test('pruefeStand erkennt die fertige Zerlegung', () => {
  const loesung = [
    { x: 0, y: 0, b: 2, h: 2 }, { x: 2, y: 0, b: 2, h: 2 },
    { x: 0, y: 2, b: 2, h: 2 }, { x: 2, y: 2, b: 2, h: 2 },
  ];
  const stand = pruefeStand(VIERECK, loesung);
  assert.equal(stand.fertig, true);
  assert.equal(stand.gedeckt, 16);
  assert.equal(stand.offen, 0);
  assert.equal(stand.doppelt, 0);
  assert.deepEqual(stand.urteile, ['gut', 'gut', 'gut', 'gut']);
  assert.deepEqual(stand.fehlerhaft, []);
});

test('pruefeStand zählt offen, doppelt und fehlerhaft getrennt', () => {
  const stand = pruefeStand(VIERECK, [
    { x: 0, y: 0, b: 2, h: 2 },   // gut
    { x: 1, y: 1, b: 2, h: 2 },   // keineZahl, überdeckt (1,1)
  ]);
  assert.equal(stand.fertig, false);
  assert.equal(stand.doppelt, 1);
  assert.equal(stand.gedeckt, 6, '4 + 4 Zellen, eine davon doppelt');
  assert.equal(stand.offen, 9);
  assert.deepEqual(stand.urteile, ['gut', 'keineZahl']);
  assert.deepEqual(stand.fehlerhaft, [1]);
});

test('pruefeStand verträgt einen leeren und einen unsinnigen Stand', () => {
  const leer = pruefeStand(VIERECK, []);
  assert.equal(leer.fertig, false);
  assert.equal(leer.offen, 16);
  assert.deepEqual(leer.urteile, []);
  assert.equal(pruefeStand(VIERECK, null).offen, 16, 'null ist ein leerer Stand');
});

test('pruefeStand: ein Rechteck außerhalb des Brettes ist nie fertig', () => {
  /*
   * Diese Lage ist nur zu bauen, wenn die Summe der Zahlen NICHT zur Fläche
   * passt — bei einem wohlgeformten Rätsel folgt aus "alles genau einmal
   * gedeckt" und "alle Urteile gut" schon, dass kein Rechteck hinausragt.
   * Genau deshalb ist die Prüfung in pruefeStand eine Sicherung und keine
   * Regel: das Rätsel kann aus dem localStorage kommen und schadhaft sein.
   */
  const schief = {
    breite: 2, hoehe: 1, stufe: 'hand', seed: 'hand',
    zahlen: [{ x: 0, y: 0, wert: 1 }, { x: 1, y: 0, wert: 2 }],
  };
  const stand = pruefeStand(schief, [
    { x: 0, y: 0, b: 1, h: 1 },
    { x: 1, y: 0, b: 2, h: 1 },   // ragt eine Spalte hinaus
  ]);
  assert.equal(stand.offen, 0);
  assert.equal(stand.doppelt, 0);
  assert.deepEqual(stand.fehlerhaft, [], 'jedes Rechteck ist für sich gut');
  assert.equal(stand.fertig, false, 'und trotzdem nicht fertig');
});

test('kandidaten: die fremde Zahl schneidet weg', () => {
  // Für die 4 links oben bleibt nur der Quadrant: der senkrechte 1×4-Streifen
  // enthielte die 4 bei (0,3), der waagrechte die bei (3,0).
  assert.deepEqual(kandidaten(VIERECK, 0), [{ x: 0, y: 0, b: 2, h: 2 }]);
  assert.deepEqual(kandidaten(VIERECK, 3), [{ x: 2, y: 2, b: 2, h: 2 }]);
});

test('kandidaten auf einem 1×n-Brett', () => {
  const streifen = {
    breite: 5, hoehe: 1, stufe: 'hand', seed: 'hand',
    zahlen: [{ x: 0, y: 0, wert: 2 }, { x: 2, y: 0, wert: 3 }],
  };
  assert.deepEqual(kandidaten(streifen, 0), [{ x: 0, y: 0, b: 2, h: 1 }],
    'nach links geht nichts, nach rechts nur bis zur 3');
  assert.deepEqual(kandidaten(streifen, 1), [
    { x: 1, y: 0, b: 3, h: 1 },
    { x: 2, y: 0, b: 3, h: 1 },
  ], 'die 3 kann noch rutschen; x=0 enthielte die 2');
});

test('kandidaten: eine Zahl, die nirgends hinpasst, hat keine', () => {
  const zuGross = {
    breite: 3, hoehe: 3, stufe: 'hand', seed: 'hand',
    zahlen: [{ x: 0, y: 0, wert: 5 }, { x: 2, y: 2, wert: 4 }],
  };
  assert.deepEqual(kandidaten(zuGross, 0), [], '5 ist prim und 5 > 3');
  assert.deepEqual(kandidaten(zuGross, 9), [], 'ein Index außerhalb liefert eine leere Liste');
  assert.deepEqual(kandidaten(zuGross, -1), [], 'und ein negativer auch');
});

test('kandidaten zählt alle Teilerformen auf', () => {
  const gross = {
    breite: 4, hoehe: 4, stufe: 'hand', seed: 'hand',
    zahlen: [{ x: 1, y: 1, wert: 4 }, { x: 3, y: 3, wert: 12 }],
  };
  const liste = kandidaten(gross, 0);
  const formen = new Set(liste.map((r) => `${r.b}x${r.h}`));
  assert.ok(formen.has('1x4'), 'senkrechter Streifen');
  assert.ok(formen.has('2x2'), 'Quadrat');
  assert.ok(formen.has('4x1'), 'waagrechter Streifen');
  for (const r of liste) {
    assert.equal(flaeche(r), 4);
    assert.ok(enthaelt(r, 1, 1));
    assert.ok(imBrett(r, 4, 4));
    assert.ok(!enthaelt(r, 3, 3), 'keine fremde Zahl');
  }
});

test('summeStimmt', () => {
  assert.equal(summeStimmt(VIERECK), true);
  assert.equal(summeStimmt({ ...VIERECK, hoehe: 5 }), false);
  assert.equal(summeStimmt(null), false);
  assert.equal(summeStimmt({ breite: 1, hoehe: 1, zahlen: [{ x: 0, y: 0, wert: '1' }] }), false,
    'eine Zeichenkette ist keine Zahl');
});

test('pruefeRaetsel lässt ein gutes Rätsel durch', () => {
  assert.equal(pruefeRaetsel(VIERECK), null);
});

test('pruefeRaetsel prüft auf dem Typ und nicht durch Umrechnen', () => {
  assert.match(pruefeRaetsel(null), /fehlt/);
  assert.match(pruefeRaetsel('rätsel'), /fehlt/);
  assert.match(pruefeRaetsel({ ...VIERECK, breite: 0 }), /Breite/);
  assert.match(pruefeRaetsel({ ...VIERECK, breite: 4.5 }), /Breite/);
  assert.match(pruefeRaetsel({ ...VIERECK, breite: '4' }), /Breite/,
    'Number("4") wäre 4 — hier gilt der Typ');
  assert.match(pruefeRaetsel({ ...VIERECK, hoehe: -1 }), /Höhe/);
  assert.match(pruefeRaetsel({ ...VIERECK, zahlen: 'viele' }), /zahlen/);
  assert.match(pruefeRaetsel({ ...VIERECK, zahlen: [] }), /keine Zahlen/);
});

test('pruefeRaetsel prüft jede einzelne Zahl', () => {
  const mit = (zahlen) => pruefeRaetsel({ ...VIERECK, zahlen });
  assert.match(mit([null]), /kein Objekt/);
  assert.match(mit([{ x: 0.5, y: 0, wert: 16 }]), /ganzzahlige Lage/);
  assert.match(mit([{ x: 0, y: '0', wert: 16 }]), /ganzzahlige Lage/);
  assert.match(mit([{ x: 4, y: 0, wert: 16 }]), /außerhalb/);
  assert.match(mit([{ x: 0, y: -1, wert: 16 }]), /außerhalb/);
  assert.match(mit([{ x: 0, y: 0, wert: 0 }]), /brauchbaren Wert/);
  assert.match(mit([{ x: 0, y: 0, wert: 17 }]), /brauchbaren Wert/, 'größer als das Brett');
  assert.match(mit([{ x: 0, y: 0, wert: 2.5 }]), /brauchbaren Wert/);
});

test('pruefeRaetsel weist ein unmäßiges Brett ab, statt daran zu sterben', () => {
  /*
   * Diese Funktion ist das Tor für alles, was aus dem localStorage, aus einer
   * geteilten Adresse oder aus einer alten Fassung hereinkommt. Sie legte für
   * die Prüfung "zwei Zahlen auf einer Zelle" eine Tabelle über ALLE Zellen an
   * — und starb bei einem 100000×100000-Brett an einem
   * "RangeError: Array buffer allocation failed". Eine Prüfung, die an ihrer
   * Eingabe abstürzt, prüft nicht: sie muss eine Meldung zurückgeben.
   */
  for (const riesig of [
    { ...VIERECK, breite: 100000, hoehe: 100000, zahlen: [{ x: 0, y: 0, wert: 1 }] },
    // Formal widerspruchsfrei: eine einzige Zahl, die genau das Brett deckt.
    { ...VIERECK, breite: 100000, hoehe: 100000, zahlen: [{ x: 0, y: 0, wert: 10000000000 }] },
    { ...VIERECK, breite: 2147483647, hoehe: 2147483647, zahlen: [{ x: 0, y: 0, wert: 1 }] },
    { ...VIERECK, breite: 1, hoehe: 2147483647, zahlen: [{ x: 0, y: 0, wert: 1 }] },
  ]) {
    const meldung = pruefeRaetsel(riesig);
    assert.equal(typeof meldung, 'string', `${riesig.breite}×${riesig.hoehe}`);
    assert.match(meldung, /zu groß/);
  }
});

test('pruefeRaetsel lässt das größte erlaubte Brett noch durch', () => {
  // Die Schranke liegt bei 128×128 = 16384 Zellen. Eine Zeile darunter muss
  // ein Rätsel bleiben, sonst ist die Schranke keine Sicherung, sondern eine
  // stille Einschränkung des Modells.
  const gross = { breite: 128, hoehe: 128, stufe: 'hand', seed: 'gross', zahlen: [{ x: 0, y: 0, wert: 16384 }] };
  assert.equal(pruefeRaetsel(gross), null);
  assert.match(pruefeRaetsel({ ...gross, breite: 129, zahlen: [{ x: 0, y: 0, wert: 16512 }] }), /zu groß/);
});

test('kandidaten kommt auch bei einem unmäßigen Wert sofort zurück', () => {
  /*
   * Aufgezählt wird über die Teiler des Wertes, und der Wert kommt von außen.
   * Die Schleife lief bis `wert` und damit bei einer Milliarde eine Milliarde
   * Runden, um am Ende die leere Liste zurückzugeben — die Laufzeit hing an
   * der hereingegebenen Zahl statt am Brett.
   */
  const wild = { breite: 3, hoehe: 3, stufe: 'hand', seed: 'wild', zahlen: [{ x: 1, y: 1, wert: 1000000000 }] };
  const beginn = Date.now();
  assert.deepEqual(kandidaten(wild, 0), []);
  const gedauert = Date.now() - beginn;
  assert.ok(gedauert < 100, `kandidaten brauchte ${gedauert} ms`);
  // Und an den Ergebnissen ändert die Schranke nichts: eine Form, die breiter
  // als das Brett ist, war vorher schon ausgeschlossen.
  const streifen = { breite: 6, hoehe: 1, stufe: 'hand', seed: 'w', zahlen: [{ x: 2, y: 0, wert: 6 }] };
  assert.deepEqual(kandidaten(streifen, 0), [{ x: 0, y: 0, b: 6, h: 1 }]);
});

test('pruefeRaetsel findet zwei Zahlen auf einer Zelle', () => {
  const doppelt = pruefeRaetsel({
    ...VIERECK,
    zahlen: [{ x: 1, y: 2, wert: 8 }, { x: 1, y: 2, wert: 8 }],
  });
  assert.match(doppelt, /\(1,2\)/);
});

test('pruefeRaetsel findet die falsche Summe', () => {
  const fehler = pruefeRaetsel({
    ...VIERECK,
    zahlen: [{ x: 0, y: 0, wert: 4 }, { x: 3, y: 3, wert: 4 }],
  });
  assert.match(fehler, /Summe/);
  assert.match(fehler, /8/);
  assert.match(fehler, /16/);
});
