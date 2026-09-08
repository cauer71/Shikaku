/**
 * Tests für den Erzeuger: node --test erzeuger.test.js
 *
 * Der Erzeuger würfelt, also lässt sich sein Ergebnis nicht Zeile für Zeile
 * nachrechnen. Geprüft wird darum zweierlei:
 *
 *  - EIGENSCHAFTEN über viele Seeds: was für jedes erzeugte Rätsel gelten muss,
 *    egal wie es aussieht. Das ist der eigentliche Beweis, dass der Erzeuger
 *    richtig arbeitet.
 *  - DETERMINISMUS: dasselbe Seed muss dasselbe Rätsel ergeben, tief verglichen.
 *    Daran hängt der Spielstand im localStorage und jeder geteilte Link.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUFEN, belegung, zahlenIn, flaeche, pruefeStand, pruefeRaetsel, imBrett,
} from './shikaku.js';
import { eindeutig, logischLoesen } from './loeser.js';
import { zufall, neuesSeed, AUSMASS, zerlege, erzeuge } from './erzeuger.js';

/** So viele Seeds je Stufe für die Eigenschaftstests. */
const SEEDS = 40;

const seedFolge = (praefix) =>
  Array.from({ length: SEEDS }, (unused, i) => praefix + String(i).padStart(2, '0'));

/* ------------------------------------------------------------- Zufall */

test('zufall liefert zu gleichem Seed denselben Strom', () => {
  const a = zufall('a3f9c1');
  const b = zufall('a3f9c1');
  for (let i = 0; i < 200; i++) assert.equal(a(), b());
});

test('zufall liefert zu verschiedenen Seeds verschiedene Ströme', () => {
  const a = zufall('a3f9c1');
  const b = zufall('a3f9c2');
  let gleiche = 0;
  for (let i = 0; i < 200; i++) if (a() === b()) gleiche += 1;
  assert.equal(gleiche, 0);
});

test('zufall bleibt im halboffenen Einheitsintervall', () => {
  for (const seed of ['', 'x', 'a3f9c1', 'ein sehr langes Seed mit Leerzeichen']) {
    const rnd = zufall(seed);
    for (let i = 0; i < 5000; i++) {
      const v = rnd();
      assert.ok(v >= 0 && v < 1, `${seed}: ${v}`);
    }
  }
});

test('zufall streut halbwegs gleichmäßig', () => {
  // Kein Test der Güte des Generators, sondern ein Test gegen den groben
  // Fehler: ein Strom, der nur in einer Hälfte liegt oder immer dasselbe
  // liefert, würde die Zerlegung still verkrüppeln.
  const faecher = new Array(10).fill(0);
  const rnd = zufall('streuung');
  for (let i = 0; i < 100000; i++) faecher[Math.floor(rnd() * 10)] += 1;
  for (const n of faecher) assert.ok(n > 9000 && n < 11000, `Fach mit ${n}`);
});

test('zufall nimmt auch etwas anderes als eine Zeichenkette an', () => {
  assert.equal(typeof zufall(42)(), 'number');
  assert.equal(typeof zufall(null)(), 'number');
  assert.equal(typeof zufall(undefined)(), 'number');
});

test('neuesSeed sind sechs Zeichen aus [a-z0-9]', () => {
  for (let i = 0; i < 200; i++) {
    const seed = neuesSeed();
    assert.match(seed, /^[a-z0-9]{6}$/);
  }
});

test('neuesSeed ist mit gegebener Quelle deterministisch', () => {
  assert.equal(neuesSeed(zufall('quelle')), neuesSeed(zufall('quelle')));
});

test('neuesSeed verträgt eine Quelle, die 1 zurückgibt', () => {
  assert.match(neuesSeed(() => 1), /^[a-z0-9]{6}$/, 'kein "undefined" im Seed');
  assert.match(neuesSeed(() => 0), /^a{6}$/);
});

test('neuesSeed wiederholt sich nicht ohne Not', () => {
  const gesehen = new Set();
  for (let i = 0; i < 500; i++) gesehen.add(neuesSeed());
  assert.ok(gesehen.size > 490, `nur ${gesehen.size} verschiedene von 500`);
});

/* ------------------------------------------------------------ AUSMASS */

test('AUSMASS hat für jede Stufe genau die vereinbarten Felder', () => {
  assert.deepEqual(Object.keys(AUSMASS), STUFEN);
  for (const stufe of STUFEN) {
    assert.deepEqual(Object.keys(AUSMASS[stufe]).sort(),
      ['breite', 'einser', 'hoehe', 'maxKante', 'maxWert']);
    for (const wert of Object.values(AUSMASS[stufe])) {
      assert.ok(Number.isInteger(wert) && wert >= 0);
    }
  }
});

test('AUSMASS steigt mit der Stufe', () => {
  for (let i = 1; i < STUFEN.length; i++) {
    const klein = AUSMASS[STUFEN[i - 1]];
    const gross = AUSMASS[STUFEN[i]];
    assert.ok(gross.breite > klein.breite);
    assert.ok(gross.maxKante > klein.maxKante);
    assert.ok(gross.maxWert > klein.maxWert);
  }
});

/* ---------------------------------------------------------- zerlege */

/** Deckt die Zerlegung das Brett restlos und ohne Überschneidung? */
function istZerlegung(teile, breite, hoehe) {
  const feld = new Int32Array(breite * hoehe).fill(-1);
  for (let i = 0; i < teile.length; i++) {
    const r = teile[i];
    if (!imBrett(r, breite, hoehe)) return `Rechteck ${i} liegt nicht im Brett`;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.b; x++) {
        const k = y * breite + x;
        if (feld[k] >= 0) return `Zelle (${x},${y}) liegt in ${feld[k]} und ${i}`;
        feld[k] = i;
      }
    }
  }
  for (let k = 0; k < feld.length; k++) {
    if (feld[k] < 0) return `Zelle ${k} ist frei`;
  }
  return null;
}

test('zerlege deckt jedes Brett restlos und hält die Schranken', () => {
  for (const stufe of STUFEN) {
    const mass = AUSMASS[stufe];
    const rnd = zufall('zerlege:' + stufe);
    for (let i = 0; i < 200; i++) {
      const teile = zerlege(mass.breite, mass.hoehe, rnd, mass);
      assert.ok(teile, `${stufe}: keine Zerlegung im Anlauf ${i}`);
      assert.equal(istZerlegung(teile, mass.breite, mass.hoehe), null, `${stufe}/${i}`);
      let einser = 0;
      for (const r of teile) {
        assert.ok(r.b <= mass.maxKante && r.h <= mass.maxKante, `${stufe}: Kante ${r.b}×${r.h}`);
        assert.ok(flaeche(r) <= mass.maxWert, `${stufe}: Fläche ${flaeche(r)}`);
        if (flaeche(r) === 1) einser += 1;
      }
      assert.ok(einser <= mass.einser, `${stufe}: ${einser} Einser bei erlaubten ${mass.einser}`);
    }
  }
});

test('zerlege ist deterministisch', () => {
  const a = zerlege(10, 10, zufall('gleich'), AUSMASS.schwer);
  const b = zerlege(10, 10, zufall('gleich'), AUSMASS.schwer);
  assert.deepEqual(a, b);
});

test('zerlege arbeitet auch ohne Schranken und auf schmalen Brettern', () => {
  const rnd = zufall('schmal');
  for (const [breite, hoehe] of [[1, 1], [1, 7], [7, 1], [2, 3], [13, 5]]) {
    const teile = zerlege(breite, hoehe, rnd, {});
    assert.ok(teile, `${breite}×${hoehe}`);
    assert.equal(istZerlegung(teile, breite, hoehe), null, `${breite}×${hoehe}`);
  }
});

test('zerlege gibt auf, wenn die Schranken nichts erlauben', () => {
  // Ein 5×5 ist mit Rechtecken der Fläche 2 nicht zu decken: 25 ist ungerade,
  // eine Einzelzelle bleibt zwangsläufig übrig — und die ist hier verboten.
  assert.equal(zerlege(5, 5, zufall('x'), { maxKante: 2, maxWert: 2, einser: 0 }), null);
});

test('zerlege prüft seine Argumente und wirft nicht', () => {
  assert.equal(zerlege(0, 5, zufall('x'), {}), null);
  assert.equal(zerlege(5, -1, zufall('x'), {}), null);
  assert.equal(zerlege(2.5, 5, zufall('x'), {}), null);
  assert.equal(zerlege('5', 5, zufall('x'), {}), null);
  assert.equal(zerlege(5, 5, null, {}), null);
  assert.ok(zerlege(4, 4, zufall('x')), 'grenzen darf fehlen');
});

/* ---------------------------------------------------------- erzeuge */

/**
 * Alles, was für JEDES erzeugte Rätsel gelten muss. Gibt eine Meldung zurück
 * oder null.
 */
function pruefeErzeugnis(stufe, seed, ergebnis) {
  const { raetsel, loesung, versuche } = ergebnis;
  const sagen = (text) => `${stufe}/${seed}: ${text}`;

  const formfehler = pruefeRaetsel(raetsel);
  if (formfehler) return sagen(formfehler);
  if (raetsel.stufe !== stufe) return sagen('falsche Stufe im Rätsel');
  if (raetsel.seed !== seed) return sagen('das Seed steht nicht im Rätsel');
  if (!Number.isInteger(versuche) || versuche < 1) return sagen('versuche ist keine Zahl ab 1');

  // Die Lösung ist parallel zu den Zahlen, jedes Rechteck enthält genau seine
  // eigene Zahl, und seine Fläche ist deren Wert.
  if (loesung.length !== raetsel.zahlen.length) return sagen('Lösung nicht parallel zu zahlen');
  for (let i = 0; i < loesung.length; i++) {
    const r = loesung[i];
    if (!imBrett(r, raetsel.breite, raetsel.hoehe)) return sagen(`Rechteck ${i} nicht im Brett`);
    const drin = zahlenIn(raetsel, r);
    if (drin.length !== 1) return sagen(`Rechteck ${i} enthält ${drin.length} Zahlen`);
    if (drin[0] !== i) return sagen(`Rechteck ${i} enthält die Zahl ${drin[0]}`);
    if (flaeche(r) !== raetsel.zahlen[i].wert) return sagen(`Rechteck ${i}: Fläche != Zahl`);
  }

  // Jede Zelle genau einmal gedeckt.
  const feld = belegung(raetsel, loesung);
  for (let k = 0; k < feld.length; k++) {
    if (feld[k] === -1) return sagen(`Zelle ${k} ist nicht gedeckt`);
    if (feld[k] === -2) return sagen(`Zelle ${k} ist doppelt gedeckt`);
  }
  if (!pruefeStand(raetsel, loesung).fertig) return sagen('pruefeStand hält die Lösung nicht für fertig');

  if (!eindeutig(raetsel)) return sagen('nicht eindeutig');

  // Die Einser-Schranke der Stufe, sofern das eigene Ausmaß benutzt wurde.
  const mass = AUSMASS[stufe];
  if (raetsel.breite === mass.breite && raetsel.hoehe === mass.hoehe) {
    let einser = 0;
    for (const z of raetsel.zahlen) if (z.wert === 1) einser += 1;
    if (einser > mass.einser) return sagen(`${einser} Einser bei erlaubten ${mass.einser}`);
    for (const r of loesung) {
      if (r.b > mass.maxKante || r.h > mass.maxKante) return sagen('Kante über maxKante');
      if (flaeche(r) > mass.maxWert) return sagen('Fläche über maxWert');
    }
  }

  // Die Zahlen stehen in Leserichtung.
  for (let i = 1; i < raetsel.zahlen.length; i++) {
    const vor = raetsel.zahlen[i - 1];
    const jetzt = raetsel.zahlen[i];
    if (vor.y > jetzt.y || (vor.y === jetzt.y && vor.x >= jetzt.x)) {
      return sagen('zahlen stehen nicht in Leserichtung');
    }
  }
  return null;
}

for (const stufe of STUFEN) {
  test(`erzeuge ${stufe}: jedes von ${SEEDS} Rätseln hält alle Eigenschaften`, () => {
    for (const seed of seedFolge('p')) {
      assert.equal(pruefeErzeugnis(stufe, seed, erzeuge(stufe, seed)), null);
    }
  });
}

test('leicht und mittel sind ohne Raten lösbar', () => {
  for (const stufe of ['leicht', 'mittel']) {
    for (const seed of seedFolge('o')) {
      const { raetsel } = erzeuge(stufe, seed);
      assert.equal(logischLoesen(raetsel).geloest, true, `${stufe}/${seed} braucht Raten`);
    }
  }
});

test('erzeuge ist deterministisch — tiefer Vergleich', () => {
  for (const stufe of STUFEN) {
    for (const seed of ['a3f9c1', 'zzz', '000000']) {
      const a = erzeuge(stufe, seed);
      const b = erzeuge(stufe, seed);
      assert.deepEqual(a.raetsel, b.raetsel, `${stufe}/${seed}`);
      assert.deepEqual(a.loesung, b.loesung, `${stufe}/${seed}`);
      assert.equal(a.versuche, b.versuche, `${stufe}/${seed}`);
    }
  }
});

test('verschiedene Seeds ergeben verschiedene Rätsel', () => {
  for (const stufe of STUFEN) {
    const gesehen = new Set();
    for (const seed of seedFolge('d')) {
      gesehen.add(JSON.stringify(erzeuge(stufe, seed).raetsel.zahlen));
    }
    assert.equal(gesehen.size, SEEDS, stufe);
  }
});

test('dieselbe Saat auf verschiedenen Stufen ergibt verschiedene Muster', () => {
  // Die Stufe geht in den Zufallsstrom ein. Sonst wäre 'leicht' der linke obere
  // Ausschnitt von 'experte', und wer beide spielt, würde es merken.
  const zahlen = STUFEN.map((s) => JSON.stringify(erzeuge(s, 'gleich').raetsel.zahlen));
  assert.equal(new Set(zahlen).size, STUFEN.length);
});

test('erzeuge ohne Seed zieht eines und legt es ins Rätsel', () => {
  const { raetsel, loesung } = erzeuge('leicht');
  assert.match(raetsel.seed, /^[a-z0-9]{6}$/);
  assert.equal(pruefeRaetsel(raetsel), null);
  assert.equal(eindeutig(raetsel), true);
  // Und mit demselben Seed kommt genau dasselbe wieder heraus.
  const wieder = erzeuge('leicht', raetsel.seed);
  assert.deepEqual(wieder.raetsel, raetsel);
  assert.deepEqual(wieder.loesung, loesung);
});

test('erzeuge fällt bei unbekannter Stufe auf mittel zurück', () => {
  for (const unfug of ['unmöglich', '', null, undefined, 42, ['leicht']]) {
    const { raetsel } = erzeuge(unfug, 'zurueck');
    assert.equal(raetsel.stufe, 'mittel', String(unfug));
    assert.equal(raetsel.breite, AUSMASS.mittel.breite);
  }
});

test('erzeuge nimmt nur eine Zeichenkette als Seed', () => {
  // Eine Zahl als Seed wäre still zu einem frisch gezogenen Seed geworden und
  // hätte den Determinismus stillschweigend gebrochen — darum ausdrücklich hier.
  const a = erzeuge('leicht', 7);
  const b = erzeuge('leicht', 7);
  assert.notDeepEqual(a.raetsel.seed, undefined);
  assert.match(a.raetsel.seed, /^[a-z0-9]{6}$/);
  assert.notEqual(a.raetsel.seed, b.raetsel.seed, 'ohne brauchbares Seed wird gezogen');
});

test('die Rätsel sind nicht durchweg einförmig', () => {
  // Ein Erzeuger, der immer dasselbe Muster liefert, würde alle Tests oben
  // bestehen. Also: über 40 Seeds müssen verschiedene Zahlen und verschiedene
  // Rechteckformen vorkommen.
  for (const stufe of STUFEN) {
    const werte = new Set();
    const formen = new Set();
    for (const seed of seedFolge('v')) {
      const { raetsel, loesung } = erzeuge(stufe, seed);
      for (const z of raetsel.zahlen) werte.add(z.wert);
      for (const r of loesung) formen.add(`${r.b}x${r.h}`);
    }
    assert.ok(werte.size >= 5, `${stufe}: nur ${werte.size} verschiedene Zahlen`);
    assert.ok(formen.size >= 8, `${stufe}: nur ${formen.size} verschiedene Formen`);
    assert.ok([...formen].some((f) => f.split('x')[0] !== f.split('x')[1]),
      `${stufe}: nur Quadrate`);
  }
});

test('erzeuge bleibt in seinem Zeitrahmen', () => {
  /*
   * Das ist keine Messung — die steht im Kopf von erzeuger.js. Das ist eine
   * Schranke gegen die Verschlechterung: gemessen liegt experte bei 1,1 ms im
   * Mittel und 4,4 ms im schlechtesten von 60 Läufen. Sollte eine Änderung das
   * um zwei Größenordnungen verschlechtern, soll ein Test darauf zeigen und
   * nicht ein Spieler auf einem langsamen Telefon.
   */
  for (const stufe of STUFEN) {
    const beginn = Date.now();
    for (const seed of seedFolge('t')) erzeuge(stufe, seed);
    const je = (Date.now() - beginn) / SEEDS;
    assert.ok(je < 200, `${stufe}: ${je.toFixed(1)} ms je Rätsel`);
  }
});
