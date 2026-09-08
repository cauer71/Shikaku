/**
 * Was von aussen in die ANZEIGE uebergeht: schnellster(), besteListe() und
 * uebernehmen() aus online.js.
 *
 * Die Gegenstelle (pruefePartie in worker.js) entscheidet, was in die
 * DATENBANK darf; hier steht die zweite Grenze, und sie ist nicht die
 * unwichtigere: ein Fehler hier laesst eine Bestzeit verschwinden, die es
 * gibt -- oder zeigt eine, die es nicht gibt. Und jeder Eintrag der
 * Bestenliste geht als Markup in den Ranglisten-Dialog.
 *
 * Der rote Faden aller Tests hier ist die RICHTUNG. online.js ist dem Aufbau
 * nach die Datei aus zehner-paare, aber dort war das Ergebnis ein Punktestand
 * und gross war gut. Jede Stelle, an der dort ein Math.max, ein ">" oder ein
 * "absteigend" stand, muss hier andersherum stehen. Das faellt bei einer
 * falschen Zahl nicht auf -- 143 Sekunden sehen so plausibel aus wie 720 --,
 * darum ist jede dieser Stellen einzeln geprueft.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { schnellster, besteListe, uebernehmen, welt } from './online.js';

/*
 * localStorage gibt es in Node nicht, online.js braucht es aber fuer den
 * Merkzettel. Ein kleines Ersatzobjekt auf globalThis genuegt -- eine Map
 * hinter getItem/setItem, mehr benutzt die Datei nicht.
 *
 * Dass diese Zuweisung NACH dem import steht, ist unbedenklich, obwohl ESM die
 * Importe nach oben zieht: online.js fasst localStorage nur innerhalb von
 * zettel() an, und zettel() laeuft erst beim ersten Ruf von aussen. Ein
 * Zugriff beim Laden waere ohnehin ein Fehler in online.js -- die Datei muss
 * auch in einem Browser mit gesperrtem Speicher ladbar bleiben.
 *
 * Der vorbelegte Eintrag ist der interessante Fall: ein Spieler, der die Seite
 * mit einem alten Merkzettel oeffnet, muss seine Bestzeiten sofort sehen,
 * bevor der erste Ruf durch ist.
 */
globalThis.localStorage = {
  daten: new Map([['sk.welt.v1', JSON.stringify({
    gelesenAm: 0, spiele: 40, siege: 31,
    rekorde: { mittel: { sekunden: 143, kuerzel: 'CHR' } },
    beste: { mittel: [{ sekunden: 143, kuerzel: 'CHR', fehler: 0, tipps: 0 }] },
  })]]),
  getItem(schluessel) {
    return this.daten.has(schluessel) ? this.daten.get(schluessel) : null;
  },
  setItem(schluessel, wert) { this.daten.set(schluessel, String(wert)); },
  removeItem(schluessel) { this.daten.delete(schluessel); },
  clear() { this.daten.clear(); },
};

/** Ein frischer, leerer Merkzettel -- so, wie zettel() ihn ohne Vorlage baut. */
const leer = () => ({ spiele: null, siege: null, rekorde: {}, beste: {} });

/* ----------------------------------------------- schnellster: kleiner gewinnt */

test('eine schnellere Zeit ersetzt die bekannte samt Namen', () => {
  const z = leer();
  schnellster(z, 'mittel', 200, 'CHR');
  schnellster(z, 'mittel', 143, 'TAB');
  assert.deepEqual(z.rekorde.mittel, { sekunden: 143, kuerzel: 'TAB' });
});

test('eine LANGSAMERE Zeit ersetzt nie -- auch nicht ihren Namen', () => {
  // Die eine Stelle, an der ein abgeschriebenes Math.max() aus zehner-paare
  // alles verdorben haette: dort war gross besser.
  const z = leer();
  schnellster(z, 'mittel', 143, 'TAB');
  schnellster(z, 'mittel', 900, 'XXX');
  assert.deepEqual(z.rekorde.mittel, { sekunden: 143, kuerzel: 'TAB' });
});

test('die erste bekannte Zeit einer Stufe wird uebernommen, wie hoch sie auch ist', () => {
  const z = leer();
  assert.equal(schnellster(z, 'experte', 3600, 'SES'), 3600);
  assert.deepEqual(z.rekorde.experte, { sekunden: 3600, kuerzel: 'SES' });
});

test('bei Gleichstand fuellt ein Name eine Luecke, ueberschreibt aber keinen', () => {
  const ohne = leer();
  schnellster(ohne, 'mittel', 143, '');
  schnellster(ohne, 'mittel', 143, 'CHR');
  assert.equal(ohne.rekorde.mittel.kuerzel, 'CHR', 'die Luecke wird gefuellt');
  assert.equal(ohne.rekorde.mittel.sekunden, 143);

  const mit = leer();
  schnellster(mit, 'mittel', 143, 'CHR');
  schnellster(mit, 'mittel', 143, '');
  assert.equal(mit.rekorde.mittel.kuerzel, 'CHR', 'ein bekannter Name bleibt stehen');
});

test('jede Stufe hat ihren eigenen Rekord', () => {
  const z = leer();
  schnellster(z, 'leicht', 30, 'AAA');
  schnellster(z, 'experte', 900, 'BBB');
  assert.equal(z.rekorde.leicht.sekunden, 30);
  assert.equal(z.rekorde.experte.sekunden, 900);
});

test('ein kaputter Merkzettel-Eintrag wird durch die erste echte Zeit ersetzt', () => {
  // Aus einer aelteren Fassung, aus einem fremden Reiter, aus einem von Hand
  // veraenderten Speicher: was keine Zahl ist, gilt als "noch nichts bekannt".
  const z = leer();
  z.rekorde.mittel = { sekunden: 'schnell', kuerzel: 'ZZZ' };
  schnellster(z, 'mittel', 143, 'CHR');
  assert.deepEqual(z.rekorde.mittel, { sekunden: 143, kuerzel: 'CHR' });
});

/* ----------------------------------------------------------- besteListe */

test('eine gewoehnliche Liste kommt sauber durch', () => {
  const l = besteListe([
    { sekunden: 143, kuerzel: 'CHR', fehler: 0, tipps: 0 },
    { sekunden: 207, kuerzel: 'TAB', fehler: 2, tipps: 1 },
  ]);
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], { sekunden: 143, kuerzel: 'CHR', fehler: 0, tipps: 0 });
  assert.deepEqual(l[1], { sekunden: 207, kuerzel: 'TAB', fehler: 2, tipps: 1 });
});

test('was keine Liste ist, ist null -- und laesst die bekannte stehen', () => {
  for (const k of [null, undefined, {}, 'CHR', 7, { 0: 'x' }, true]) {
    assert.equal(besteListe(k), null, JSON.stringify(k) ?? String(k));
  }
  // Eine LEERE Liste ist etwas anderes als keine: eine Stufe ohne Eintraege.
  assert.deepEqual(besteListe([]), []);
});

test('Eintraege ohne brauchbares Kuerzel fallen heraus', () => {
  const l = besteListe([
    { sekunden: 100, kuerzel: 'ABC' },
    { sekunden: 110, kuerzel: '' },            // ohne Namen -- genau das soll weg
    { sekunden: 120, kuerzel: '<b>' },
    { sekunden: 130, kuerzel: 'A B' },
    { sekunden: 140, kuerzel: 'ÄÖÜ' },
    { sekunden: 150, kuerzel: 'ABCD' },        // zu lang: nicht kuerzen, weglassen
    { sekunden: 160 },
    { sekunden: 170, kuerzel: 123 },
  ]);
  assert.deepEqual(l.map((e) => e.kuerzel), ['ABC']);
});

test('unglaubwuerdige Zeiten fallen heraus', () => {
  const l = besteListe([
    { sekunden: 100, kuerzel: 'AAA' },
    { sekunden: 0, kuerzel: 'BBB' },           // waere der ewige Weltrekord
    { sekunden: -5, kuerzel: 'CCC' },
    { sekunden: 1.5, kuerzel: 'DDD' },
    { sekunden: '90', kuerzel: 'EEE' },        // Number('90') waere 90 gewesen
    { sekunden: NaN, kuerzel: 'FFF' },
    { sekunden: null, kuerzel: 'GGG' },        // Number(null) waere 0 gewesen
    { sekunden: 86401, kuerzel: 'HHH' },       // laenger als ein Tag
  ]);
  assert.deepEqual(l.map((e) => e.kuerzel), ['AAA']);
});

test('Fehler und Tipps ausserhalb 0..999 werden zu 0', () => {
  // Hier wird zurechtgebogen und nicht verworfen -- anders als im Worker: eine
  // unsinnige Nebenzahl ist kein Grund, eine Bestzeit aus der ANZEIGE zu
  // nehmen. In die Datenbank kaeme sie gar nicht.
  const l = besteListe([{ sekunden: 143, kuerzel: 'CHR', fehler: 5000, tipps: '3' }]);
  assert.deepEqual(l[0], { sekunden: 143, kuerzel: 'CHR', fehler: 0, tipps: 0 });
});

test('das Kuerzel wird gross geschrieben', () => {
  assert.equal(besteListe([{ sekunden: 143, kuerzel: 'chr' }])[0].kuerzel, 'CHR');
});

test('eine verdrehte Liste wird AUFSTEIGEND sortiert', () => {
  // Die Datenbank sortiert schon. Verlassen soll sich die Anzeige nicht
  // darauf: eine verdrehte Liste saehe aus wie ein Fehler im Spiel -- und eine
  // absteigend sortierte (wie in zehner-paare) waere genau der Fehler, der
  // beim Abschreiben passiert.
  const l = besteListe([{ sekunden: 900, kuerzel: 'A' }, { sekunden: 143, kuerzel: 'B' },
                        { sekunden: 500, kuerzel: 'C' }]);
  assert.deepEqual(l.map((e) => e.sekunden), [143, 500, 900]);
});

test('gleiche Zeiten stehen in einer festen Reihenfolge', () => {
  // In einem Zeitspiel sind gleiche Werte haeufig. Ohne festen Nachrang
  // stuende die Liste bei jedem Aufschlagen anders da.
  const einmal = besteListe([{ sekunden: 143, kuerzel: 'TAB' }, { sekunden: 143, kuerzel: 'CHR' }]);
  const zweimal = besteListe([{ sekunden: 143, kuerzel: 'CHR' }, { sekunden: 143, kuerzel: 'TAB' }]);
  assert.deepEqual(einmal.map((e) => e.kuerzel), ['CHR', 'TAB']);
  assert.deepEqual(zweimal.map((e) => e.kuerzel), ['CHR', 'TAB']);
});

/* ----------------------------------------------------------- uebernehmen */

test('ein ganzer Stand wird uebernommen', () => {
  const z = leer();
  assert.equal(uebernehmen(z, {
    spiele: 115, siege: 75,
    rekorde: { leicht: { sekunden: 41, kuerzel: 'TAB' },
               experte: { sekunden: 1203, kuerzel: 'SES' } },
    beste: { leicht: [{ sekunden: 41, kuerzel: 'TAB', fehler: 0, tipps: 0 }] },
  }), true);
  assert.equal(z.spiele, 115);
  assert.equal(z.siege, 75);
  assert.equal(z.rekorde.leicht.sekunden, 41);
  assert.equal(z.rekorde.experte.kuerzel, 'SES');
  assert.equal(z.beste.leicht.length, 1);
});

test('ein unvollstaendiger Stand laesst das Fehlende stehen', () => {
  const z = leer();
  uebernehmen(z, { spiele: 115, siege: 75, rekorde: { mittel: { sekunden: 143, kuerzel: 'CHR' } } });
  // Nur die Zaehler kommen nach -- Rekorde und Bestenliste bleiben, wie sie
  // waren. Der Worker schickt immer alles; ein halb angekommener Stand nicht.
  uebernehmen(z, { spiele: 116 });
  assert.equal(z.spiele, 116);
  assert.equal(z.siege, 75);
  assert.equal(z.rekorde.mittel.sekunden, 143);
});

test('ein kaputter Stand aendert nichts und sagt es', () => {
  const z = leer();
  schnellster(z, 'mittel', 143, 'CHR');
  for (const k of [null, undefined, 'nein', 7, true]) {
    assert.equal(uebernehmen(z, k), false, String(k));
  }
  // Ein Stand mit unsinnigen Rekorden gilt als Stand, die Rekorde aber nicht.
  assert.equal(uebernehmen(z, {
    spiele: 'viele',
    rekorde: { mittel: { sekunden: 'schnell' }, leicht: { sekunden: -5 },
               schwer: { sekunden: 0 }, experte: null },
  }), true);
  assert.equal(z.spiele, null, 'eine Zeichenkette ist keine Partienzahl');
  assert.equal(z.rekorde.mittel.sekunden, 143, 'der bekannte Rekord bleibt');
  assert.equal(z.rekorde.leicht, undefined, 'eine negative Zeit wird nicht eingetragen');
  assert.equal(z.rekorde.schwer, undefined, 'null Sekunden auch nicht');
  assert.equal(z.rekorde.experte, undefined);
});

test('eine unbrauchbare Bestenliste laesst die bekannte stehen', () => {
  const z = leer();
  uebernehmen(z, { beste: { mittel: [{ sekunden: 143, kuerzel: 'CHR' }] } });
  uebernehmen(z, { beste: { mittel: 'kaputt' } });
  assert.deepEqual(z.beste.mittel.map((e) => e.kuerzel), ['CHR']);
});

test('eine LEERE Liste ersetzt eine bekannte nicht', () => {
  // In dieser Datenbank verliert eine Stufe ihre Namen nie wieder: eine Zeile
  // je Kuerzel und Stufe, sie wird nur verbessert und niemals geloescht. Kommt
  // die Liste leer zurueck, ist die Antwort unvollstaendig -- keine Aussage
  // ueber die Welt.
  const z = leer();
  uebernehmen(z, { beste: { mittel: [{ sekunden: 143, kuerzel: 'CHR' }] } });
  uebernehmen(z, { beste: { mittel: [] } });
  assert.deepEqual(z.beste.mittel.map((e) => e.kuerzel), ['CHR']);

  // Solange NICHTS bekannt ist, wird die leere Liste uebernommen: dann kann
  // die Anzeige "noch keine Eintraege" sagen statt "offline".
  const frisch = leer();
  uebernehmen(frisch, { beste: { schwer: [] } });
  assert.deepEqual(frisch.beste.schwer, []);
});

test('ein Stand ohne beste ruehrt die bekannte Liste nicht an', () => {
  const z = leer();
  uebernehmen(z, { beste: { schwer: [{ sekunden: 486, kuerzel: 'SES' }] } });
  uebernehmen(z, { spiele: 200 });
  assert.deepEqual(z.beste.schwer.map((e) => e.kuerzel), ['SES']);
});

/* ------------------------------------------------------- der Merkzettel */

test('der Merkzettel aus dem Speicher steht sofort da', () => {
  // Ohne Netz, ohne Ruf: das ist der Fall "Seite geoeffnet, Flugzeugmodus".
  const s = welt.zwischenstand();
  assert.equal(s.spiele, 40);
  assert.equal(s.siege, 31);
  assert.deepEqual(s.rekorde.mittel, { sekunden: 143, kuerzel: 'CHR' });
  assert.equal(s.beste.mittel.length, 1);
  assert.equal(s.alter, Infinity, 'noch nie gelesen');
  assert.equal(welt.veraltet(), true);
});

test('mit ausgeschaltetem Schalter geht keine einzige Anfrage hinaus', async () => {
  globalThis.fetch = () => { throw new Error('es darf gar nicht gerufen werden'); };
  welt.schalten(false);
  assert.equal(await welt.lesen(), null);
  const gemeldet = await welt.partieBeendet({ stufe: 'mittel', sekunden: 143, kuerzel: 'CHR' });
  assert.equal(gemeldet.gezaehlt, false);
  // Der Stand ist trotzdem dabei: der Enddialog soll nicht zwei Faelle kennen.
  assert.equal(gemeldet.stand.rekorde.mittel.sekunden, 143);
  welt.schalten(true);
});

test('ein gelesener Stand wird uebernommen und gesichert', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    spiele: 41, siege: 32,
    rekorde: { mittel: { sekunden: 130, kuerzel: 'TAB' } },
    beste: { mittel: [{ sekunden: 130, kuerzel: 'TAB', fehler: 0, tipps: 0 }] },
  }), { status: 200 });

  const s = await welt.lesen();
  assert.equal(s.spiele, 41);
  assert.deepEqual(s.rekorde.mittel, { sekunden: 130, kuerzel: 'TAB' });
  assert.ok(s.alter < 1000, 'gerade gelesen');
  assert.equal(welt.veraltet(), false);
  // Und im Speicher steht es auch, fuer das naechste Oeffnen.
  const gesichert = JSON.parse(localStorage.getItem('sk.welt.v1'));
  assert.equal(gesichert.rekorde.mittel.sekunden, 130);
  assert.ok(gesichert.gelesenAm > 0);
});

test('eine Partie geht mit allen Feldern hinaus', async () => {
  let gesehen = null;
  globalThis.fetch = async (adresse, wie) => {
    gesehen = { adresse, koerper: JSON.parse(wie.body), methode: wie.method };
    return new Response(JSON.stringify({ spiele: 42, siege: 33 }), { status: 200 });
  };

  const ergebnis = await welt.partieBeendet({
    stufe: 'schwer', sekunden: 486, kuerzel: 'SES', fehler: 1, tipps: 2,
    gewonnen: true, zaehlt: true, neuePartie: true,
  });
  assert.equal(ergebnis.gezaehlt, true);
  assert.equal(ergebnis.stand.spiele, 42);
  assert.equal(gesehen.methode, 'POST');
  assert.match(gesehen.adresse, /\/api\/partie$/);
  assert.deepEqual(gesehen.koerper, {
    stufe: 'schwer', sekunden: 486, kuerzel: 'SES', fehler: 1, tipps: 2,
    gewonnen: true, zaehlt: true, neuePartie: true,
  });
});

test('ein Ausfall haelt das Spiel nicht auf', async () => {
  const vorher = welt.zwischenstand();

  globalThis.fetch = async () => { throw new Error('Netz weg'); };
  assert.equal(await welt.lesen(), null);
  assert.equal((await welt.partieBeendet({ stufe: 'mittel', sekunden: 143 })).gezaehlt, false);

  // Auch ein 503 der Datenbank ist fuer das Spiel dasselbe wie kein Netz.
  globalThis.fetch = async () => new Response(JSON.stringify({ fehler: 'Datenbank nicht erreichbar' }),
    { status: 503 });
  assert.equal(await welt.lesen(), null);

  // Und eine Antwort, die kein JSON ist, ebenso.
  globalThis.fetch = async () => new Response('<html>Fehlerseite</html>', { status: 200 });
  assert.equal(await welt.lesen(), null);

  // Der bekannte Stand steht unveraendert weiter da.
  assert.deepEqual(welt.zwischenstand().rekorde, vorher.rekorde);
});

/* ------------------------------------- was ein boshafter Dienst schicken kann */

/*
 * Bis hierher war der Server bloss kaputt. Jetzt ist er BOSHAFT -- und das ist
 * kein Hirngespinst: die Auswaertsadresse steht in online.js, die Antwort
 * kommt ueber ein Netz, das nicht dem Spieler gehoert, und ein Anmeldeportal
 * im Hotel-WLAN antwortet auf alles mit 200.
 */

test('ein __proto__ als Stufenname verschmutzt den Merkzettel nicht', () => {
  // JSON.parse legt __proto__ als EIGENE Eigenschaft an -- Object.entries gibt
  // ihn also heraus. Eine ZUWEISUNG darauf ruft dann den Setzer von
  // Object.prototype und tauscht den Prototypen des Merkzettels aus: danach
  // erbte er ein sekunden und ein kuerzel, die niemand eingetragen hat, und
  // beste haette als Objekt eine length.
  const z = leer();
  const boese = JSON.parse('{"spiele":1,'
    + '"rekorde":{"__proto__":{"sekunden":1,"kuerzel":"HAX"}},'
    + '"beste":{"__proto__":[{"sekunden":1,"kuerzel":"HAX"}]}}');
  assert.deepEqual(Object.getOwnPropertyNames(boese.rekorde), ['__proto__'],
    'so kommt es aus JSON.parse -- als eigene Eigenschaft');

  assert.equal(uebernehmen(z, boese), true, 'ein Stand ist es trotzdem');
  assert.equal(Object.getPrototypeOf(z.rekorde), Object.prototype, 'Prototyp unberuehrt');
  assert.equal(Object.getPrototypeOf(z.beste), Object.prototype);
  assert.deepEqual(Object.keys(z.rekorde), []);
  assert.deepEqual(Object.keys(z.beste), []);
  assert.equal(z.rekorde.sekunden, undefined, 'nichts geerbt');
  assert.equal(z.beste.length, undefined);
  // Was gueltig war, kommt trotzdem an -- geprueft wird der Schluessel, nicht
  // die ganze Antwort verworfen.
  assert.equal(z.spiele, 1);

  // Und das Ganze auch ueber die echte Kette Object.prototype.
  assert.equal(({}).kuerzel, undefined);
});

test('erfundene Stufennamen kommen nicht in den Merkzettel', () => {
  // Zwei Gruende: eine Stufe, die das Spiel nicht kennt, kann die Anzeige
  // nicht zeigen -- und fuenftausend davon sind ein Merkzettel, der ueber die
  // Speicherquote waechst. Wenn setItem() dann wirft, ist nicht diese Antwort
  // verloren, sondern der ganze Merkzettel.
  const z = leer();
  const viele = { rekorde: {}, beste: {} };
  for (let i = 0; i < 5000; i++) {
    viele.rekorde[`stufe${i}`] = { sekunden: 100 + i, kuerzel: 'AAA' };
    viele.beste[`stufe${i}`] = [{ sekunden: 100 + i, kuerzel: 'AAA' }];
  }
  viele.rekorde.mittel = { sekunden: 143, kuerzel: 'CHR' };
  uebernehmen(z, viele);
  assert.deepEqual(Object.keys(z.rekorde), ['mittel'], 'nur die echte Stufe');
  assert.deepEqual(Object.keys(z.beste), []);
  assert.equal(z.rekorde.mittel.sekunden, 143);
});

test('eine ueberlange Bestenliste wird auf zehn gekuerzt', () => {
  // Der Worker schneidet bei zehn ab. Verlassen soll sich die Anzeige darauf
  // nicht: zeichneRangliste in app.js zeichnet JEDE Zeile der Liste.
  const roh = Array.from({ length: 3000 }, (_, i) => ({ sekunden: 3000 - i, kuerzel: 'AAA' }));
  const l = besteListe(roh);
  assert.equal(l.length, 10);
  // Und es sind die SCHNELLSTEN zehn -- gekuerzt wird nach dem Sortieren.
  assert.deepEqual(l.map((e) => e.sekunden), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  const z = leer();
  uebernehmen(z, { beste: { mittel: roh } });
  assert.equal(z.beste.mittel.length, 10);
});

test('eine Liste ist kein Weltstand', () => {
  // typeof [] ist 'object' -- ohne die Array-Pruefung waere ein [] ein
  // gueltiger, leerer Stand. Und weil der Rueckgabewert entscheidet, ob
  // gelesenAm gesetzt wird, waere das eine Antwort, die fuenf Minuten lang als
  // frisch gilt.
  const z = leer();
  assert.equal(uebernehmen(z, []), false);
  assert.equal(uebernehmen(z, [{ spiele: 1 }]), false);
  assert.equal(uebernehmen(z, {}), true, 'ein leeres Objekt ist ein leerer Stand');
});

test('eine 200er Antwort, die kein Stand ist, gilt nicht als gelesen', async () => {
  // Das ist der Fall Anmeldeportal: Status 200, gueltiges JSON, kein Stand.
  // "ok" ist als Wert nicht null -- ohne die Pruefung ueber uebernehmen()
  // stuende danach ein Lesezeitpunkt im Merkzettel, die naechsten fuenf
  // Minuten wuerde nicht nachgelesen, und die Anzeige behauptete "gerade
  // geholt" fuer Zahlen, die nie kamen.
  const vorher = JSON.parse(localStorage.getItem('sk.welt.v1')).gelesenAm;
  for (const koerper of ['"ok"', '123', 'true', '[]', 'null']) {
    globalThis.fetch = async () => new Response(koerper, { status: 200 });
    assert.equal(await welt.lesen(), null, koerper);
    assert.equal(JSON.parse(localStorage.getItem('sk.welt.v1')).gelesenAm, vorher,
      `${koerper} darf den Lesezeitpunkt nicht setzen`);
  }
});

test('eine 200er Antwort, die kein Stand ist, gilt nicht als gezaehlt', async () => {
  // Derselbe Fall auf der Schreibseite, und hier ist der Schaden groesser:
  // 'gezaehlt' merkt der Aufrufer sich an der Partie. Ein falsches true heisst,
  // dass beim naechsten Ende derselben Partie NICHT nachgezaehlt wird -- die
  // Partie ist dann nie irgendwo angekommen, und niemand hat es gemerkt.
  for (const koerper of ['"ok"', '123', 'true', '[]']) {
    globalThis.fetch = async () => new Response(koerper, { status: 200 });
    const r = await welt.partieBeendet({ stufe: 'mittel', sekunden: 143, kuerzel: 'CHR' });
    assert.equal(r.gezaehlt, false, koerper);
    assert.ok(r.stand, 'der Merkzettel ist trotzdem dabei');
  }
});

test('ein abgebrochener und ein synchron werfender Ruf sind auch nur null', async () => {
  // Die eigene Geduld bricht mit einem AbortController ab. Der Abbruch
  // erreicht diese Datei als Ausnahme aus dem await, genau wie ein fetch, das
  // gar nicht erst startet -- beides darf das Spiel nicht aufhalten.
  globalThis.fetch = async (_, wie) => {
    wie.signal.throwIfAborted();
    throw Object.assign(new Error('abgebrochen'), { name: 'AbortError' });
  };
  assert.equal(await welt.lesen(), null);

  // fetch, das SYNCHRON wirft (eine Adresse, die der Browser nicht mag, eine
  // Erweiterung, die dazwischenfunkt): der Ruf steht im try, also faellt es
  // ebenfalls auf null zusammen und nicht in den Aufrufer.
  globalThis.fetch = () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await welt.lesen(), null);
  assert.equal((await welt.partieBeendet({ stufe: 'mittel', sekunden: 143 })).gezaehlt, false);

  // Und eine Antwort ohne Koerper -- .json() wirft dort.
  globalThis.fetch = async () => new Response('', { status: 200 });
  assert.equal(await welt.lesen(), null);
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await welt.lesen(), null);
});

/*
 * Unter file:// wird gar nicht gerufen.
 *
 * Der Ruf geht relativ, aus '/api/welt' wird dort also 'file:///api/welt' --
 * eine Adresse, an der nichts antwortet und an der Chromium zwei CORS-Fehler
 * in die Konsole schreibt. Verschluckt wurden sie immer schon; sinnlos war der
 * Ruf trotzdem. Gefunden mit der Einzeldatei-Fassung, die genau dafuer gebaut
 * ist, per Doppelklick geoeffnet zu werden (tools/probe-einzeldatei.mjs).
 *
 * `location` wird hier gestellt und danach wieder entfernt: fehlt es ganz,
 * laesst amNetz() absichtlich durch -- das ist der Zustand aller anderen Tests
 * in dieser Datei, und der darf sich durch diesen nicht aendern.
 */
test('unter file:// wird die Schnittstelle nicht gerufen', async () => {
  const vorher = globalThis.location;
  let gerufen = 0;
  globalThis.fetch = async () => { gerufen++; return new Response('{}', { status: 200 }); };
  welt.schalten(true);

  try {
    globalThis.location = { protocol: 'file:', hostname: '', href: 'file:///shikaku.html' };
    assert.equal(await welt.lesen(), null, 'lesen() darf unter file:// nichts liefern');
    assert.equal((await welt.partieBeendet({ stufe: 'mittel', sekunden: 143 })).gezaehlt, false);
    assert.equal(gerufen, 0, 'es darf kein fetch stattgefunden haben');

    // Zur Gegenprobe: ueber http wird sehr wohl gerufen. Sonst haette die
    // Pruefung oben auch bestanden, wenn amNetz() einfach immer falsch waere.
    globalThis.location = { protocol: 'https:', hostname: 'shikaku.auer.page', href: 'https://shikaku.auer.page/' };
    globalThis.fetch = async () => { gerufen++; return new Response(JSON.stringify({
      spiele: 1, siege: 1, rekorde: {}, beste: {} }), { status: 200 }); };
    assert.notEqual(await welt.lesen(), null, 'ueber https muss gelesen werden');
    assert.equal(gerufen, 1, 'genau ein Ruf ueber https');
  } finally {
    if (vorher === undefined) delete globalThis.location;
    else globalThis.location = vorher;
  }
});
