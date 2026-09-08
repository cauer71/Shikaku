/**
 * Die Grenze nach aussen: pruefePartie() und der Ruf-Verteiler in worker.js.
 *
 * pruefePartie() ist die EINZIGE Stelle, an der etwas von aussen in die
 * Datenbank uebergeht. Was hier durchrutscht, steht anschliessend fuer alle in
 * der Weltliste -- und in einem ZEITSPIEL an der schlimmsten Stelle: kleiner
 * ist besser, eine durchgelassene Null waere der ewige, unschlagbare
 * Weltrekord. In zehner-paare waere derselbe Ausrutscher harmlos gewesen (null
 * Punkte gewinnen nichts). Darum wird hier auf jeden Typ bestanden und nichts
 * umgerechnet.
 *
 * Der zweite Teil prueft den Verteiler mit einer nachgestellten Datenbank.
 * Nicht, weil SQL sich damit pruefen liesse -- die Attrappe versteht kein
 * SQL --, sondern die Entscheidungen davor und danach: welche Anweisungen
 * ueberhaupt abgeschickt werden (ohne Kuerzel keine Zeile), was ein fremder
 * Origin bekommt, was eine ausgefallene Datenbank bekommt, und dass die
 * Ratenbegrenzung bei eigener Stoerung durchlaesst statt zu sperren.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { pruefePartie } from './worker.js';

/*
 * node:sqlite ist ab Node 22 dabei und braucht kein Paket -- damit laesst sich
 * das Schema aus migrations/ mit ECHTEM SQLite pruefen und nicht nur mit einer
 * Attrappe, die kein SQL versteht. Auf einer aelteren Laufzeit wird der Teil
 * uebersprungen statt die ganze Datei zum Absturz zu bringen.
 */
let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* aeltere Laufzeit */ }

const gueltig = {
  stufe: 'mittel', sekunden: 143, kuerzel: 'CHR',
  fehler: 0, tipps: 0, gewonnen: true, zaehlt: true, neuePartie: true,
};

/* ------------------------------------------------- was hereinkommen darf */

test('eine gewoehnliche Partie geht durch', () => {
  const p = pruefePartie(gueltig);
  assert.equal(p.ok, true);
  assert.equal(p.stufe, 'mittel');
  assert.equal(p.sekunden, 143);
  assert.equal(p.kuerzel, 'CHR');
  assert.equal(p.fehler, 0);
  assert.equal(p.tipps, 0);
  assert.equal(p.zaehlt, true);
});

test('alle vier Stufen sind bekannt, erfundene nicht', () => {
  for (const s of ['leicht', 'mittel', 'schwer', 'experte']) {
    assert.equal(pruefePartie({ ...gueltig, stufe: s }).ok, true, s);
  }
  for (const s of ['Mittel', 'endlos', 'klassisch', '', null, undefined, 42, {}]) {
    assert.equal(pruefePartie({ ...gueltig, stufe: s }).ok, false, String(s));
  }
});

test('eine Stufe als Array wird nicht in eine Zeichenkette umgerechnet', () => {
  // String(['mittel']) waere 'mittel' -- genau darum steht in pruefePartie ein
  // typeof und kein String().
  assert.equal(pruefePartie({ ...gueltig, stufe: ['mittel'] }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, stufe: ['mittel', 'schwer'] }).ok, false);
});

test('die Zeit muss wirklich eine ganze Zahl sein', () => {
  for (const s of [15, 143, 3600, 86400]) {
    assert.equal(pruefePartie({ ...gueltig, sekunden: s }).ok, true, String(s));
  }
  // '143' und null waeren ueber Number() gueltige Zahlen geworden -- und
  // Number(null) ist 0, also die schnellste Zeit, die es gibt.
  for (const s of ['143', null, undefined, NaN, Infinity, 1.5, {}, [143]]) {
    assert.equal(pruefePartie({ ...gueltig, sekunden: s }).ok, false, String(s));
  }
});

test('negative Zeiten und die Null kommen nicht in die Liste', () => {
  for (const s of [0, -1, -143]) {
    const p = pruefePartie({ ...gueltig, sekunden: s });
    assert.equal(p.ok, false, String(s));
    assert.ok(p.fehler, 'eine Ablehnung braucht einen Grund');
  }
});

test('zu langsam ist auch keine Partie', () => {
  assert.equal(pruefePartie({ ...gueltig, sekunden: 86400 }).ok, true, 'ein Tag geht noch');
  assert.equal(pruefePartie({ ...gueltig, sekunden: 86401 }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, sekunden: 999999 }).ok, false);
});

test('die untere Schranke haengt an der Stufe', () => {
  // Elf Sekunden sind auf 6x6 moeglich (etwa zehn Rechtecke, wer die Loesung
  // sieht, zieht sie in zehn Wischbewegungen) und auf 12x12 nicht.
  assert.equal(pruefePartie({ ...gueltig, stufe: 'leicht', sekunden: 11 }).ok, true);
  assert.equal(pruefePartie({ ...gueltig, stufe: 'mittel', sekunden: 11 }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, stufe: 'schwer', sekunden: 11 }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, stufe: 'experte', sekunden: 11 }).ok, false);
  // Jede Stufe nimmt ihre eigene Schranke gerade noch an.
  assert.equal(pruefePartie({ ...gueltig, stufe: 'leicht', sekunden: 10 }).ok, true);
  assert.equal(pruefePartie({ ...gueltig, stufe: 'mittel', sekunden: 15 }).ok, true);
  assert.equal(pruefePartie({ ...gueltig, stufe: 'schwer', sekunden: 25 }).ok, true);
  assert.equal(pruefePartie({ ...gueltig, stufe: 'experte', sekunden: 35 }).ok, true);
  // Und eine darunter nicht mehr.
  assert.equal(pruefePartie({ ...gueltig, stufe: 'schwer', sekunden: 24 }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, stufe: 'experte', sekunden: 34 }).ok, false);
});

test('das Kuerzel wird gross geschrieben', () => {
  assert.equal(pruefePartie({ ...gueltig, kuerzel: 'chr' }).kuerzel, 'CHR');
  assert.equal(pruefePartie({ ...gueltig, kuerzel: 'aB3' }).kuerzel, 'AB3');
});

test('vier Zeichen werden abgewiesen und NICHT gekuerzt', () => {
  // Der Unterschied zu zehner-paare, und er ist wichtig: (kuerzel, stufe) ist
  // hier der Primaerschluessel. Aus 'ABCD' ein 'ABC' zu machen hiesse, die
  // Zeit auf der Zeile eines anderen Spielers einzutragen.
  for (const k of ['ABCD', 'ABCDEF', 'chris']) {
    assert.equal(pruefePartie({ ...gueltig, kuerzel: k }).ok, false, k);
  }
});

test('was nicht A-Z oder 0-9 ist, kommt nicht in die Liste', () => {
  for (const k of ['A B', 'Ä', 'a!', '<b>', 'CH-', ' AB', 'A\nB', "'; DROP"]) {
    assert.equal(pruefePartie({ ...gueltig, kuerzel: k }).ok, false, JSON.stringify(k));
  }
  // Zahlen und Objekte sind kein Kuerzel, gelten aber als "keines" statt als
  // Fehler: sie koennen aus einem alten Spielstand kommen.
  assert.equal(pruefePartie({ ...gueltig, kuerzel: 123 }).kuerzel, '');
  assert.equal(pruefePartie({ ...gueltig, kuerzel: {} }).kuerzel, '');
});

test('ein leeres Kuerzel ist erlaubt -- die Partie zaehlt dann nur mit', () => {
  for (const k of ['', undefined, null]) {
    const p = pruefePartie({ ...gueltig, kuerzel: k });
    assert.equal(p.ok, true, String(k));
    assert.equal(p.kuerzel, '');
  }
  // Dass daraus keine ZEILE wird, prueft der Verteiler weiter unten.
});

test('Fehler und Tipps muessen in 0..999 liegen', () => {
  for (const n of [0, 1, 7, 999]) {
    assert.equal(pruefePartie({ ...gueltig, fehler: n, tipps: n }).ok, true, String(n));
  }
  for (const n of [1000, -1, 1.5, '3', NaN, Infinity, {}, [1]]) {
    assert.equal(pruefePartie({ ...gueltig, fehler: n }).ok, false, String(n));
    assert.equal(pruefePartie({ ...gueltig, tipps: n }).ok, false, String(n));
  }
  // Fehlen sie ganz, sind sie null -- ein Client, der sie nicht schickt, ist
  // kein Fehler. Zurechtgebogen wird aber nichts: 1000 Fehler auf 0 zu setzen
  // hiesse, eine Zahl in die Liste zu schreiben, die niemand gespielt hat.
  const p = pruefePartie({ stufe: 'mittel', sekunden: 143, kuerzel: 'CHR' });
  assert.equal(p.ok, true);
  assert.equal(p.fehler, 0);
  assert.equal(p.tipps, 0);
});

test('ein leerer oder kaputter Koerper wirft nicht, sondern wird abgelehnt', () => {
  for (const k of [null, undefined, {}, [], 'ABC', 7, true]) {
    const p = pruefePartie(k);
    assert.equal(p.ok, false, JSON.stringify(k) ?? String(k));
    assert.ok(p.fehler, 'eine Ablehnung braucht einen Grund');
  }
});

test('die drei Schalter sind immer echte Wahrheitswerte', () => {
  const p = pruefePartie({ ...gueltig, zaehlt: 'ja', gewonnen: 0, neuePartie: undefined });
  assert.equal(p.zaehlt, true);
  assert.equal(p.gewonnen, false);
  assert.equal(p.neuePartie, false);
});

/* ------------------------------------------------------ der Ruf-Verteiler */

/**
 * Eine nachgestellte D1-Datenbank.
 *
 * Sie versteht kein SQL und soll es nicht: geprueft wird, WELCHE Anweisungen
 * abgeschickt werden, nicht was SQLite daraus macht. Was die Anweisungen
 * bewirken, prueft der Trockenlauf gegen die echte Datenbank.
 *
 * Die Leseabfragen bekommen leere Ergebnisse -- der Weltstand ist dann leer,
 * und genau das ist der interessante Fall: er muss trotzdem die vier Felder
 * spiele/siege/rekorde/beste haben, weil online.js sie liest.
 */
function attrappe(kaputt = false) {
  const gesehen = [];
  return {
    gesehen,
    prepare(sql) {
      if (kaputt) throw new Error('keine Verbindung');
      return { sql, bind(...werte) { return { sql, werte }; } };
    },
    async batch(anweisungen) {
      if (kaputt) throw new Error('keine Verbindung');
      gesehen.push(...anweisungen);
      return anweisungen.map(() => ({ results: [], meta: { changes: 1 } }));
    },
  };
}

/** Die Umgebung des Workers: Datenbank, Dateien, und was der Test noch braucht. */
function umgebung(db, mehr = {}) {
  return {
    DB: db,
    ASSETS: { fetch: async () => new Response('datei', { status: 200 }) },
    ...mehr,
  };
}

const post = (koerper, kopf = {}) => new Request('https://shikaku.auer.page/api/partie', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...kopf },
  body: JSON.stringify(koerper),
});

/**
 * Die abgeschickten SCHREIB-Anweisungen zu einer Tabelle.
 *
 * Das INSERT im Muster ist noetig, weil durch dieselbe Attrappe auch die
 * Leseabfragen des Weltstands laufen -- und die stehen im selben batch und
 * nennen dieselben Tabellen.
 */
const schreibtIn = (db, tabelle) =>
  db.gesehen.filter((a) => /^\s*INSERT/.test(a.sql) && a.sql.includes(tabelle));

test('GET /api/welt gibt einen vollstaendigen, wenn auch leeren Stand', async () => {
  const db = attrappe();
  const antwort = await worker.fetch(new Request('https://shikaku.auer.page/api/welt'), umgebung(db));
  assert.equal(antwort.status, 200);
  assert.equal(antwort.headers.get('access-control-allow-origin'), '*');
  assert.equal(antwort.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await antwort.json(), { spiele: 0, siege: 0, rekorde: {}, beste: {} });
});

test('eine gemeldete Partie zaehlt mit und traegt die Zeit ein', async () => {
  const db = attrappe();
  const antwort = await worker.fetch(post(gueltig), umgebung(db));
  assert.equal(antwort.status, 200);
  // Die Antwort ist derselbe Weltstand -- das Spiel braucht keinen zweiten Ruf.
  assert.deepEqual(await antwort.json(), { spiele: 0, siege: 0, rekorde: {}, beste: {} });

  const zeit = schreibtIn(db, 'bestzeiten');
  assert.equal(zeit.length, 1);
  assert.deepEqual(zeit[0].werte.slice(0, 5), ['CHR', 'mittel', 143, 0, 0]);
  assert.equal(schreibtIn(db, 'zaehler').length, 2, 'spiele und siege');
});

test('der Vergleich steht im WHERE derselben Anweisung, die einfuegt', async () => {
  // Das ist die eine Stelle, an der die Rangliste richtig oder kaputt ist:
  // lesen, vergleichen und schreiben muessen in EINEM Satz stehen. Zwei
  // Spieler, die im selben Augenblick fertig werden, wuerden sich mit
  // Lesen-Vergleichen-Schreiben gegenseitig ueberschreiben -- und wenn der
  // Langsamere zuletzt schreibt, ist die bessere Zeit weg.
  const db = attrappe();
  await worker.fetch(post(gueltig), umgebung(db));
  const sql = schreibtIn(db, 'bestzeiten')[0].sql.replace(/\s+/g, ' ');
  assert.match(sql, /ON CONFLICT\(kuerzel, stufe\) DO UPDATE/);
  assert.match(sql, /WHERE excluded\.sekunden < bestzeiten\.sekunden/);
});

test('ohne Kuerzel wird nur gezaehlt, keine Zeile geschrieben', async () => {
  const db = attrappe();
  const antwort = await worker.fetch(post({ ...gueltig, kuerzel: '' }), umgebung(db));
  assert.equal(antwort.status, 200);
  assert.equal(schreibtIn(db, 'bestzeiten').length, 0);
  assert.equal(schreibtIn(db, 'zaehler').length, 2);
});

test('eine Partie, die nicht zaehlt, traegt nichts ein', async () => {
  const db = attrappe();
  await worker.fetch(post({ ...gueltig, zaehlt: false, gewonnen: false }), umgebung(db));
  assert.equal(schreibtIn(db, 'bestzeiten').length, 0);
  assert.equal(schreibtIn(db, 'zaehler').length, 1, 'nur die gespielte Partie');
});

test('eine unglaubwuerdige Meldung wird abgewiesen, ohne die Datenbank zu beruehren', async () => {
  const db = attrappe();
  const antwort = await worker.fetch(post({ ...gueltig, sekunden: 3 }), umgebung(db));
  assert.equal(antwort.status, 400);
  assert.ok((await antwort.json()).fehler);
  assert.equal(db.gesehen.length, 0);
});

test('kein JSON im Koerper ist ein 400 und kein Absturz', async () => {
  const db = attrappe();
  const antwort = await worker.fetch(new Request('https://shikaku.auer.page/api/partie', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: 'keine Daten',
  }), umgebung(db));
  assert.equal(antwort.status, 400);
});

test('ein fremder Origin darf nicht schreiben, GitHub Pages schon', async () => {
  const db = attrappe();
  const fremd = await worker.fetch(post(gueltig, { origin: 'https://boese.example' }), umgebung(db));
  assert.equal(fremd.status, 403);
  assert.equal(db.gesehen.length, 0);

  const eigen = await worker.fetch(post(gueltig, { origin: 'https://shikaku.auer.page' }), umgebung(attrappe()));
  assert.equal(eigen.status, 200);
  // Die Ausgabe auf GitHub Pages ruft von einem fremden Host aus -- die ist
  // ausdruecklich zugelassen, sonst koennte von dort niemand eintragen.
  const pages = await worker.fetch(post(gueltig, { origin: 'https://cauer71.github.io' }), umgebung(attrappe()));
  assert.equal(pages.status, 200);
});

test('ein fehlender Origin geht durch -- er beweist nichts', async () => {
  const db = attrappe();
  const antwort = await worker.fetch(post(gueltig), umgebung(db));
  assert.equal(antwort.status, 200);
});

test('OPTIONS beantwortet den Vorflug', async () => {
  const antwort = await worker.fetch(
    new Request('https://shikaku.auer.page/api/partie', { method: 'OPTIONS' }),
    umgebung(attrappe()));
  assert.equal(antwort.status, 204);
  assert.equal(antwort.headers.get('access-control-allow-origin'), '*');
  assert.match(antwort.headers.get('access-control-allow-methods'), /POST/);
});

test('die Ratenbegrenzung sperrt -- und laesst bei eigener Stoerung durch', async () => {
  const zu = { limit: async () => ({ success: false }) };
  const kaputteBremse = { limit: async () => { throw new Error('Bremse still'); } };

  const gesperrt = await worker.fetch(post(gueltig), umgebung(attrappe(), { SCHREIB_LIMIT: zu }));
  assert.equal(gesperrt.status, 429);
  assert.equal(gesperrt.headers.get('retry-after'), '60');

  const lesenGesperrt = await worker.fetch(
    new Request('https://shikaku.auer.page/api/welt'), umgebung(attrappe(), { LESE_LIMIT: zu }));
  assert.equal(lesenGesperrt.status, 429);

  // Eine Ratenbegrenzung, die bei eigener Stoerung das Spiel lahmlegt, waere
  // schlechter als keine. Fehlt das Binding ganz (lokal, im Trockenlauf),
  // gilt dasselbe.
  const trotzdem = await worker.fetch(post(gueltig), umgebung(attrappe(), { SCHREIB_LIMIT: kaputteBremse }));
  assert.equal(trotzdem.status, 200);
  const ohne = await worker.fetch(post(gueltig), umgebung(attrappe()));
  assert.equal(ohne.status, 200);
});

test('eine ausgefallene Datenbank ist ein 503 mit JSON -- das Spiel bleibt spielbar', async () => {
  const db = attrappe(true);
  for (const anfrage of [new Request('https://shikaku.auer.page/api/welt'), post(gueltig)]) {
    const antwort = await worker.fetch(anfrage, umgebung(db));
    assert.equal(antwort.status, 503);
    const daten = await antwort.json();
    assert.ok(daten.fehler, 'online.js macht daraus ein null und zeigt seinen Merkzettel');
  }
  // Auch ein ganz fehlendes Binding darf nicht durchschlagen.
  const ohneDb = await worker.fetch(new Request('https://shikaku.auer.page/api/welt'),
    { ASSETS: { fetch: async () => new Response('') } });
  assert.equal(ohneDb.status, 503);
});

test('falsche Methode, unbekannter Pfad, und alles andere sind die Dateien', async () => {
  const env = umgebung(attrappe());
  const falsch = await worker.fetch(
    new Request('https://shikaku.auer.page/api/welt', { method: 'POST', body: '{}' }), env);
  assert.equal(falsch.status, 405);

  const unbekannt = await worker.fetch(new Request('https://shikaku.auer.page/api/quatsch'), env);
  assert.equal(unbekannt.status, 404);

  const datei = await worker.fetch(new Request('https://shikaku.auer.page/index.html'), env);
  assert.equal(await datei.text(), 'datei', 'kommt aus der Asset-Schicht');
});

/* --------------------------------------------- was boshaft hereinkommen kann */

/*
 * Die Faelle, die keine Tippfehler sind, sondern Absicht. pruefePartie ist die
 * einzige Stelle, an der Fremdes in die Datenbank uebergeht -- und sie wird von
 * einer offenen Adresse ohne Konten gerufen. Was hier nicht faellt, faellt
 * nirgends mehr.
 */

test('ein __proto__ im Koerper verschmutzt nichts', () => {
  // JSON.parse legt __proto__ als EIGENE Eigenschaft an, nicht als Prototypen
  // -- die Verschmutzung entsteht erst dort, wo so ein Schluessel wieder
  // ZUGEWIESEN wird. pruefePartie weist nichts zu und liest nur, also muss es
  // schlicht eine Ablehnung sein und Object.prototype unberuehrt bleiben.
  const boese = JSON.parse('{"__proto__":{"stufe":"mittel","sekunden":11,"kuerzel":"HAX"}}');
  assert.equal(pruefePartie(boese).ok, false);
  assert.equal(Object.prototype.stufe, undefined, 'Object.prototype ist unberuehrt');
  assert.equal(({}).sekunden, undefined);

  // Und derselbe Schluessel als Stufe ist eine unbekannte Stufe, nichts weiter.
  assert.equal(pruefePartie({ ...gueltig, stufe: '__proto__' }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, stufe: 'constructor' }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, stufe: 'toString' }).ok, false);
});

test('verschachtelte Objekte werden nicht ausgepackt', () => {
  // Ein valueOf, das die richtige Zahl liefert, ist der klassische Weg um eine
  // Pruefung herum -- er funktioniert nur gegen Number(), nicht gegen typeof.
  assert.equal(pruefePartie({ ...gueltig, sekunden: { valueOf: () => 143 } }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, sekunden: { sekunden: 143 } }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, stufe: { toString: () => 'mittel' } }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, kuerzel: { toString: () => 'CHR' } }).kuerzel, '');
  assert.equal(pruefePartie({ ...gueltig, fehler: { valueOf: () => 3 } }).ok, false);
});

test('Zahlen als Zeichenketten sind keine Zahlen', () => {
  for (const s of ['143', ' 143', '143 ', '1e2', '0x8f', '', ' ']) {
    assert.equal(pruefePartie({ ...gueltig, sekunden: s }).ok, false, JSON.stringify(s));
  }
});

test('Infinity, NaN und die negative Null kommen nicht durch', () => {
  for (const s of [Infinity, -Infinity, NaN, 1e309]) {
    assert.equal(pruefePartie({ ...gueltig, sekunden: s }).ok, false, String(s));
  }
  // -0 ist eine ganze Zahl und kleiner als MIN_SEKUNDEN -- es scheitert also an
  // der Schranke und nicht am Typ. Wichtig ist nur, dass es scheitert: als Zeit
  // waere es die schnellste, die es gibt.
  assert.equal(pruefePartie({ ...gueltig, sekunden: -0 }).ok, false);
  for (const n of [Infinity, -Infinity, NaN]) {
    assert.equal(pruefePartie({ ...gueltig, fehler: n }).ok, false, String(n));
    assert.equal(pruefePartie({ ...gueltig, tipps: n }).ok, false, String(n));
  }
});

test('sehr lange Zeichenketten und Steuerzeichen sind kein Kuerzel', () => {
  assert.equal(pruefePartie({ ...gueltig, kuerzel: 'A'.repeat(100000) }).ok, false);
  assert.equal(pruefePartie({ ...gueltig, stufe: 'm'.repeat(100000) }).ok, false);
  // Steuerzeichen, unsichtbare Zeichen und Zeilenumbrueche: der Anker $ in
  // /^[A-Z0-9]{0,3}$/ steht am Ende der ganzen Zeichenkette und nicht am
  // Zeilenende -- ohne das /m waere 'AB\n' durchgegangen und stuende mit einem
  // Umbruch in der Weltliste.
  for (const k of ['AB\n', 'AB\r', '\u0000AB', 'A\tB', 'AB\u200b', 'A\u202eB', 'AB\u0007']) {
    assert.equal(pruefePartie({ ...gueltig, kuerzel: k }).ok, false, JSON.stringify(k));
  }
});

test('gemischte Gross- und Kleinschreibung mit Ziffern wird gross', () => {
  assert.equal(pruefePartie({ ...gueltig, kuerzel: 'a1b' }).kuerzel, 'A1B');
  assert.equal(pruefePartie({ ...gueltig, kuerzel: '0z9' }).kuerzel, '0Z9');
  assert.equal(pruefePartie({ ...gueltig, kuerzel: 'Ab' }).kuerzel, 'AB');
  // toUpperCase() kann eine Zeichenkette LAENGER machen ('ß' wird 'SS'). Das
  // darf die Laengengrenze nicht umgehen: geprueft wird nach dem Umwandeln.
  assert.equal(pruefePartie({ ...gueltig, kuerzel: 'ßß' }).ok, false, 'SSSS waere vier Zeichen');
  assert.equal(pruefePartie({ ...gueltig, kuerzel: 'ß' }).kuerzel, 'SS');
});

test('null und Arrays an jeder Stelle sind eine Ablehnung, kein Absturz', () => {
  const unsinn = [null, undefined, [], [1], [[1]], {}, () => 143, true];

  // Stufe und Zeit sind die Pflichtangaben: dort ist alles davon eine
  // Ablehnung, und jede Ablehnung nennt ihren Grund.
  for (const feld of ['stufe', 'sekunden']) {
    for (const wert of unsinn) {
      const p = pruefePartie({ ...gueltig, [feld]: wert });
      assert.equal(p.ok, false, `${feld} = ${JSON.stringify(wert) ?? String(wert)}`);
      assert.ok(p.fehler, 'eine Ablehnung braucht einen Grund');
    }
  }

  // Beim Kuerzel gilt "was keine Zeichenkette ist, ist KEIN Kuerzel" -- die
  // Partie zaehlt dann nur mit. Wichtig ist, dass daraus nie ein Kuerzel
  // WIRD: String([]) waere '' gewesen, String(['A','B']) aber 'A,B'.
  for (const wert of unsinn) {
    const p = pruefePartie({ ...gueltig, kuerzel: wert });
    assert.equal(p.ok, true, `kuerzel = ${JSON.stringify(wert) ?? String(wert)}`);
    assert.equal(p.kuerzel, '', 'und zwar als leeres Kuerzel');
  }
  assert.equal(pruefePartie({ ...gueltig, kuerzel: ['A', 'B'] }).kuerzel, '');

  // Die Nebenzaehler nehmen nur "nicht geschickt" hin, alles andere ist ein
  // Grund, die ganze Meldung abzuweisen (zurechtgebogen wird nichts).
  for (const feld of ['fehler', 'tipps']) {
    for (const wert of unsinn) {
      const p = pruefePartie({ ...gueltig, [feld]: wert });
      const darfDurch = wert === null || wert === undefined;
      assert.equal(p.ok, darfDurch, `${feld} = ${JSON.stringify(wert) ?? String(wert)}`);
      if (darfDurch) assert.equal(p[feld], 0);
    }
  }

  // Ein Array als ganzer Koerper hat keine Felder -- und wirft nicht.
  assert.equal(pruefePartie([gueltig]).ok, false);
});

/* ------------------------------- Schema und Abfragen gegen echtes SQLite */

/*
 * Der wichtigste Test dieser Datei, und der einzige, den eine Attrappe nicht
 * leisten kann: WORKER UND CLIENT MUESSEN DIESELBE DATENFORM MEINEN.
 *
 * Hier laeuft das Schema aus migrations/0001_schema.sql durch echtes SQLite,
 * der Worker schreibt seine Zeilen mit seinen eigenen Anweisungen, liest den
 * Weltstand mit seinen eigenen Abfragen -- und das Ergebnis geht durch
 * uebernehmen() aus online.js. Ein falscher Spaltenname, ein vertauschter
 * Primaerschluessel, ein '>' statt '<' im UPSERT oder ein DESC im ORDER BY
 * faellt hier auf und nur hier. In der Attrappe faellt es nicht auf, weil sie
 * kein SQL versteht, und im Browser nicht, weil 900 Sekunden so plausibel
 * aussehen wie 143.
 */
function echteDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const satz of readFileSync('./migrations/0001_schema.sql', 'utf8').split(';')) {
    if (satz.trim()) sqlite.exec(`${satz};`);
  }
  // Die kleine Nachbildung der D1-Schnittstelle: prepare/bind/batch, und batch
  // gibt je Anweisung ein { results } zurueck. Mehr benutzt worker.js nicht.
  const anweisung = (sql) => {
    let werte = [];
    const a = {
      sql,
      bind(...w) { werte = w; return a; },
      lauf() {
        const vor = sqlite.prepare(sql);
        if (/^\s*SELECT/i.test(sql)) return { results: vor.all(...werte), meta: {} };
        const r = vor.run(...werte);
        return { results: [], meta: { changes: Number(r.changes) } };
      },
    };
    return a;
  };
  return {
    sqlite,
    prepare: anweisung,
    async batch(liste) { return liste.map((a) => a.lauf()); },
    zeile(kuerzel, stufe) {
      return sqlite.prepare('SELECT sekunden, fehler, tipps FROM bestzeiten WHERE kuerzel = ? AND stufe = ?')
        .get(kuerzel, stufe);
    },
  };
}

const melde = (db, koerper) => worker.fetch(post(koerper), umgebung(db));

test('das Schema nimmt zehn Zeilen auf und der Weltstand liest sie zurueck', { skip: !DatabaseSync }, async () => {
  const db = echteDb();
  const zeilen = [
    ['leicht', 41, 'TAB'], ['leicht', 55, 'CHR'], ['leicht', 41, 'AAA'],
    ['mittel', 143, 'CHR'], ['mittel', 143, 'TAB'], ['mittel', 200, 'ZZZ'],
    ['schwer', 486, 'SES'], ['schwer', 400, 'CHR'],
    ['experte', 1203, 'SES'], ['experte', 999, 'TAB'],
  ];
  for (const [stufe, sekunden, kuerzel] of zeilen) {
    const antwort = await melde(db, { stufe, sekunden, kuerzel, fehler: 1, tipps: 2,
      gewonnen: true, zaehlt: true, neuePartie: true });
    assert.equal(antwort.status, 200, `${stufe} ${sekunden} ${kuerzel}`);
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM bestzeiten').get().n, 10);

  const stand = await (await worker.fetch(
    new Request('https://shikaku.auer.page/api/welt'), umgebung(db))).json();

  // Die Zaehler stehen als Zeilen in zaehler und kommen als Zahlen an.
  assert.equal(stand.spiele, 10);
  assert.equal(stand.siege, 10);

  // Je Stufe der SCHNELLSTE als Rekord -- nicht der langsamste, nicht der
  // letzte. Bei Gleichstand entscheidet das Kuerzel (AAA vor TAB).
  assert.deepEqual(stand.rekorde.leicht, { sekunden: 41, kuerzel: 'AAA' });
  assert.deepEqual(stand.rekorde.mittel, { sekunden: 143, kuerzel: 'CHR' });
  assert.deepEqual(stand.rekorde.schwer, { sekunden: 400, kuerzel: 'CHR' });
  assert.deepEqual(stand.rekorde.experte, { sekunden: 999, kuerzel: 'TAB' });

  // Und die Bestenliste je Stufe aufsteigend, mit allen vier Feldern, die
  // online.js liest.
  assert.deepEqual(stand.beste.leicht.map((e) => e.sekunden), [41, 41, 55]);
  assert.deepEqual(stand.beste.leicht.map((e) => e.kuerzel), ['AAA', 'TAB', 'CHR']);
  assert.deepEqual(stand.beste.experte[0], { sekunden: 999, kuerzel: 'TAB', fehler: 1, tipps: 2 });
  for (const stufe of ['leicht', 'mittel', 'schwer', 'experte']) {
    for (const e of stand.beste[stufe]) {
      assert.deepEqual(Object.keys(e).sort(), ['fehler', 'kuerzel', 'sekunden', 'tipps'],
        'genau die Felder, die online.js liest');
    }
  }
});

test('der UPSERT uebernimmt nur SCHNELLERE Zeiten -- und alles Beiwerk mit', { skip: !DatabaseSync }, async () => {
  // Das ist die Stelle, an der ein '>' statt '<' ein stiller, fataler Fehler
  // waere: die Liste sammelte dann die langsamsten Zeiten und saehe dabei
  // vollkommen richtig aus.
  const db = echteDb();
  await melde(db, { ...gueltig, sekunden: 200, fehler: 5, tipps: 5 });
  assert.deepEqual({ ...db.zeile('CHR', 'mittel') }, { sekunden: 200, fehler: 5, tipps: 5 });

  // Schneller: die Zeile wird ersetzt, samt Fehlern und Tipps.
  await melde(db, { ...gueltig, sekunden: 143, fehler: 0, tipps: 0 });
  assert.deepEqual({ ...db.zeile('CHR', 'mittel') }, { sekunden: 143, fehler: 0, tipps: 0 });

  // Langsamer: NICHTS aendert sich -- auch nicht die Nebenzahlen. Das ist der
  // Grund, warum das WHERE zum UPSERT gehoert und nicht in die SET-Liste: es
  // haelt die ganze Zeile zusammen.
  await melde(db, { ...gueltig, sekunden: 900, fehler: 9, tipps: 9 });
  assert.deepEqual({ ...db.zeile('CHR', 'mittel') }, { sekunden: 143, fehler: 0, tipps: 0 });

  // Gleich schnell aendert auch nichts ('<' und nicht '<='): der erste behaelt
  // seinen Zeitpunkt.
  const vorher = db.sqlite.prepare('SELECT wann FROM bestzeiten WHERE kuerzel = ? AND stufe = ?').get('CHR', 'mittel').wann;
  await melde(db, { ...gueltig, sekunden: 143, fehler: 7, tipps: 7 });
  assert.deepEqual({ ...db.zeile('CHR', 'mittel') }, { sekunden: 143, fehler: 0, tipps: 0 });
  assert.equal(db.sqlite.prepare('SELECT wann FROM bestzeiten WHERE kuerzel = ? AND stufe = ?').get('CHR', 'mittel').wann, vorher);

  // Der Primaerschluessel ist (kuerzel, stufe) und nicht kuerzel allein: eine
  // andere Stufe desselben Spielers ist eine eigene Zeile.
  await melde(db, { ...gueltig, stufe: 'schwer', sekunden: 900 });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM bestzeiten WHERE kuerzel = ?').get('CHR').n, 2);
  assert.equal(db.zeile('CHR', 'schwer').sekunden, 900);
});

test('eine erfundene Stufe in der Tabelle faerbt nicht auf die Antwort ab', { skip: !DatabaseSync }, async () => {
  // Der Worker schreibt nur gepruefte Stufen. Die TABELLE ist aber nicht nur
  // ihm zugaenglich -- "wrangler d1 execute" reicht. Eine Zeile mit der Stufe
  // '__proto__' wuerde mit stand.beste[b.stufe] den Prototypen der Antwort
  // austauschen statt einen Eintrag anzulegen.
  const db = echteDb();
  const roh = db.sqlite.prepare('INSERT INTO bestzeiten (kuerzel, stufe, sekunden, fehler, tipps, wann) VALUES (?, ?, ?, 0, 0, 0)');
  roh.run('HAX', '__proto__', 1);
  roh.run('HAX', 'erfunden', 2);
  await melde(db, gueltig);

  const antwort = await worker.fetch(new Request('https://shikaku.auer.page/api/welt'), umgebung(db));
  const stand = await antwort.json();
  assert.deepEqual(Object.keys(stand.beste), ['mittel']);
  assert.deepEqual(Object.keys(stand.rekorde), ['mittel']);
  // Und der rohe JSON-Text enthaelt den Schluessel nirgends -- ein
  // ausgetauschter Prototyp waere in Object.keys() unsichtbar gewesen.
  assert.equal((await (await worker.fetch(
    new Request('https://shikaku.auer.page/api/welt'), umgebung(db))).text()).includes('__proto__'), false);
});

test('der Index der Rangliste trifft und deckt die Abfrage', { skip: !DatabaseSync }, () => {
  // Die Reihenfolge (stufe, sekunden, kuerzel) ist kein Geschmack: nur so
  // beantwortet der eine Index alle drei Fragen der Rangliste, ohne die Zeilen
  // selbst anzufassen. Steht kuerzel vor sekunden, wird daraus ein Sortieren
  // im Speicher.
  const db = echteDb();
  const plan = db.sqlite.prepare(
    "EXPLAIN QUERY PLAN SELECT stufe, sekunden, kuerzel FROM bestzeiten "
    + "WHERE kuerzel <> '' ORDER BY stufe, sekunden ASC, kuerzel ASC").all()
    .map((z) => z.detail).join(' | ');
  assert.match(plan, /COVERING INDEX bestzeiten_rangliste/);
  assert.doesNotMatch(plan, /TEMP B-TREE/, 'nachtraeglich sortieren muesste es nicht');
});
