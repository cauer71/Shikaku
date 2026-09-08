/**
 * Shikaku: die Weltrangliste auf Cloudflare Workers und D1.
 *
 * Drei Adressen, mehr braucht das Spiel nicht:
 *
 *   GET     /api/welt    Weltrekord je Stufe samt Kuerzel, die Bestenliste je
 *                        Stufe und die Zaehler -- alles in EINEM Ruf.
 *   POST    /api/partie  Eine beendete Partie: zaehlt mit und traegt die Zeit
 *                        ein, wenn sie eine Bestzeit ist. Antwortet mit
 *                        demselben Stand wie /api/welt, damit das Spiel nach
 *                        einer Partie keinen zweiten Ruf braucht.
 *   OPTIONS /api/*       Der Vorflug fuer den POST von GitHub Pages.
 *
 * Alles andere geht an die statischen Dateien (env.ASSETS).
 *
 * ZUR EHRLICHKEIT, und das steht auch so in der Oberflaeche: eine offene
 * Rangliste OHNE KONTEN laesst sich nicht gegen Falscheintraege sichern. Wer
 * die Adresse kennt, kann eine Zeit senden, die er nie gespielt hat, und kein
 * Code hier kann das unterscheiden -- der Server sieht kein Spiel, er sieht
 * eine Zahl. Ein Beweis waere nur mit einem serverseitig erzeugten Raetsel und
 * einem mitgeschickten Zugprotokoll zu haben, und das ist fuer ein Spiel, das
 * offline auf GitHub Pages laufen soll, der falsche Preis. Geprueft wird
 * darum nur, was PRUEFBAR ist:
 *
 *   - die Form (Typ, Laenge, erlaubte Zeichen)          -> pruefePartie
 *   - die Plausibilitaet, und zwar JE STUFE             -> MIN_JE_STUFE
 *   - dass der Ruf aus dem Spiel selbst kommt           -> fremdeHerkunft
 *   - wie oft jemand sendet                             -> darfDurch
 *
 * Der Unterschied zu zehner-paare, von dem der Aufbau dieser Datei stammt,
 * ist die Richtung: dort war ein hoher PUNKTESTAND das Ziel, hier eine kurze
 * ZEIT. Jedes MAX() ist ein MIN(), jedes ">" im Vergleich ein "<". Das ist die
 * eine Stelle, an der man beim Abschreiben eine Rangliste baut, die den
 * Langsamsten feiert.
 */

/** Die Stufen des Spiels. Was nicht hier steht, kommt nicht in die Tabelle. */
const STUFEN = ['leicht', 'mittel', 'schwer', 'experte'];

/**
 * Die aeussersten Schranken fuer eine Zeit.
 *
 * MIN_SEKUNDEN ist der harte Boden ueber alle Stufen, MAX_SEKUNDEN ein Tag:
 * wer laenger als 24 Stunden an einem Raetsel sitzt, hat das Fenster offen
 * gelassen und keine Partie gespielt. Beides sind Schranken gegen Unsinn und
 * kein Schutz gegen Betrug (siehe oben).
 */
const MIN_SEKUNDEN = 10;
const MAX_SEKUNDEN = 86400;

/**
 * Die untere Schranke JE STUFE -- und das ist der Punkt, an dem eine globale
 * Grenze nicht genuegt.
 *
 * Ein 6x6-Raetsel in 11 Sekunden ist moeglich: es hat etwa zehn Rechtecke, und
 * wer die Loesung schon sieht, zieht zehn Rechtecke in zehn Wischbewegungen.
 * Dieselben 11 Sekunden auf 12x12 sind es nicht -- dort sind es rund
 * fuenfundzwanzig Rechtecke, und allein das Ziehen dauert laenger, ganz ohne
 * Nachdenken. Eine einzige globale Grenze muss sich also entweder nach der
 * leichten Stufe richten (dann laesst sie auf Experte jeden Unsinn durch) oder
 * nach der schweren (dann wirft sie auf Leicht ehrliche Zeiten weg).
 *
 * Die Zahlen sind aus dem Ausmass der Stufen (siehe AUSMASS in erzeuger.js)
 * hergeleitet, nicht geraten -- Zellen geteilt durch die mittlere
 * Rechtecksflaeche gibt die Zahl der Zuege, und je Zug wird knapp eine Sekunde
 * angesetzt, was fuer einen Menschen mit dem Finger auf Glas schon sehr
 * schnell ist:
 *
 *   leicht  6x6  = 36 Zellen  / ~3.6 =  10 Rechtecke -> 10 s
 *   mittel  8x8  = 64 Zellen  / ~4.2 =  15 Rechtecke -> 15 s
 *   schwer 10x10 = 100 Zellen / ~5.0 =  20 Rechtecke -> 25 s
 *   experte 12x12 = 144 Zellen / ~6.0 = 24 Rechtecke -> 35 s
 *
 * Absichtlich eher zu niedrig als zu hoch: eine Schranke, die eine ECHTE
 * Bestzeit abweist, ist der schlimmere Fehler. Sie soll das Unmoegliche
 * erwischen (ein 12x12 in drei Sekunden), nicht das Erstaunliche.
 */
const MIN_JE_STUFE = { leicht: 10, mittel: 15, schwer: 25, experte: 35 };

/** Drei Zeichen aus A-Z und 0-9, oder gar keines. */
const KUERZEL = /^[A-Z0-9]{0,3}$/;

/** Obergrenze fuer die Nebenzaehler einer Partie (Fehler, Tipps). */
const MAX_NEBEN = 999;

/** So viele Namen stehen je Stufe in der Bestenliste. */
const BESTENLISTE = 10;

/**
 * Antwort mit offenem CORS.
 *
 * Offen ('*'), weil das Spiel auch auf GitHub Pages liegt und von dort ueber
 * Kreuz hierher ruft. Zu holen gibt es nichts, was nicht ohnehin jeder sehen
 * soll: die Rangliste ist der oeffentliche Teil des Spiels.
 *
 * no-store, weil sich der Stand mit jeder Partie aendert -- ein
 * zwischengespeicherter Weltrekord waere schlimmer als keiner, weil er sich
 * richtig anfuehlt. Den kurzlebigen Zwischenspeicher hat das Spiel selbst
 * (der Merkzettel in online.js), und der weiss, wie alt seine Zahlen sind.
 */
function json(daten, status = 200, zusatz = null) {
  const kopf = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (zusatz) Object.assign(kopf, zusatz);
  return new Response(JSON.stringify(daten), { status, headers: kopf });
}

/**
 * Ratenbegrenzung, gezaehlt je Absender.
 *
 * Die Rangliste hat keine Konten: wer die Adresse kennt, kann senden. Form und
 * Plausibilitaet helfen gegen Unsinn, gegen schieres Draufhalten helfen sie
 * nicht -- zehntausend plausible Zeiten in einer Minute sind einzeln alle
 * gueltig und machen die Liste zusammen unbrauchbar.
 *
 * Im Zweifel fuer den Spieler: fehlt das Binding (lokal, im Trockenlauf, in
 * den Tests) oder antwortet es nicht, geht die Anfrage DURCH. Eine
 * Ratenbegrenzung, die bei einer eigenen Stoerung das Spiel lahmlegt, waere
 * schlechter als keine.
 */
async function darfDurch(env, name, schluessel) {
  const bremse = env?.[name];
  if (!bremse || typeof bremse.limit !== 'function') return true;
  try {
    const { success } = await bremse.limit({ key: schluessel });
    return success !== false;
  } catch {
    return true;
  }
}

/**
 * Schreibt hier jemand von einer fremden Seite aus?
 *
 * Ohne diese Pruefung koennte eine beliebige Webseite den Browser ihrer
 * Besucher still Eintraege senden lassen -- lesen koennte sie die Antwort
 * nicht, aber die Zeile stuende in der Rangliste. Browser setzen "Origin" bei
 * jedem POST, auch bei gleicher Herkunft; ist der Kopf da und passt er nicht,
 * wird abgewiesen.
 *
 * Fehlt er ganz (curl, alte Clients, ein Test), geht die Anfrage durch: die
 * Rangliste ist ohnehin offen, und ein fehlender Kopf beweist nichts. Geprueft
 * wird, was pruefbar ist.
 *
 * Die GitHub-Pages-Ausgabe des Spiels ruft von einem fremden Host aus -- die
 * ist deshalb ausdruecklich zugelassen. Eine Liste erlaubter Hosts statt
 * "gleicher Host oder github.io" waere strenger und trotzdem nichts wert: wer
 * ohne Browser sendet, setzt sich einen passenden Origin selbst.
 */
function fremdeHerkunft(request, url) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const host = new URL(origin).host;
    return host !== url.host && !host.endsWith('.github.io');
  } catch {
    return true;                      // unlesbarer Origin -- dann eben nicht
  }
}

/**
 * Der Weltstand: Bestenliste je Stufe, der Weltrekord je Stufe, dazu die
 * Zaehler.
 *
 * Alles in EINEM Ruf, obwohl die Bestenliste nur zu sehen ist, wer den
 * Ranglisten-Dialog aufschlaegt. Sie kostet knapp zwei Kilobyte, und dafuer
 * steht sie sofort da -- auch beim Umschalten der Stufe und auch ohne Netz,
 * weil das Spiel den ganzen Stand auf dem Merkzettel behaelt. Ein zweiter Ruf
 * beim Aufschlagen waere teurer als die zwei Kilobyte.
 *
 * Nur ZWEI Anweisungen, und die Rekorde kommen ohne eigene: der Weltrekord
 * einer Stufe ist der KOPF ihrer Bestenliste. Das gilt hier, weil jede Zeile
 * in bestzeiten ein Kuerzel hat (ohne Kuerzel wird nicht geschrieben, siehe
 * partieBeendet) -- in zehner-paare stand daneben noch eine eigene MIN-Abfrage,
 * weil es dort Rekorde aus der Zeit vor den Kuerzeln gab, die in der
 * Bestenliste nicht vorkommen durften. Dieses Loch gibt es hier nicht, und
 * eine Abfrage, deren Antwort man schon hat, ist eine Abfrage zu viel. Sollten
 * je Zeilen ohne Kuerzel in die Tabelle kommen (eine Uebernahme aus einer
 * anderen Quelle etwa), muss die eigene MIN-Abfrage zurueck.
 */
async function weltstand(db) {
  const [beste, zaehler] = await db.batch([
    // ROW_NUMBER statt "LIMIT je Gruppe", das SQL nicht kennt: eine Abfrage
    // je Stufe waere vier statt einer, und ein blosses LIMIT 40 ueber alles
    // haette bei ungleich vollen Stufen die eine Liste abgeschnitten und die
    // andere halb leer gelassen.
    //
    // Der Nachrang nach kuerzel macht die Reihenfolge eindeutig. In einem
    // ZEITSPIEL ist das kein Beiwerk, sondern noetig: gleiche Sekundenzahlen
    // sind haeufig (bei Punkten waren sie die Ausnahme), und ohne festen
    // Nachrang duerfte die Datenbank zwei Spieler mit 143 Sekunden bei jedem
    // Laden anders herum ziehen. Die Liste haette sich bei jedem Aufschlagen
    // umsortiert und ausgesehen wie ein Fehler im Spiel.
    db.prepare(`
      SELECT stufe, sekunden, kuerzel, fehler, tipps FROM (
        SELECT stufe, sekunden, kuerzel, fehler, tipps,
               ROW_NUMBER() OVER (PARTITION BY stufe ORDER BY sekunden ASC, kuerzel ASC) AS rang
          FROM bestzeiten
         WHERE kuerzel <> ''
      ) WHERE rang <= ?1
      ORDER BY stufe, sekunden ASC, kuerzel ASC`).bind(BESTENLISTE),
    db.prepare('SELECT name, wert FROM zaehler'),
  ]);

  const stand = { spiele: 0, siege: 0, rekorde: {}, beste: {} };

  // Nur die zwei bekannten Namen uebernehmen und nicht blind stand[name]
  // setzen: die Tabelle ist unsere, aber eine Zeile, die 'beste' oder
  // 'rekorde' heisst, wuerde sonst die halbe Antwort ueberschreiben. Das ist
  // kein erwarteter Fall -- nur eine Art, ihn unmoeglich zu machen.
  for (const z of zaehler.results ?? []) {
    if (z.name === 'spiele' || z.name === 'siege') stand[z.name] = z.wert;
  }

  // Dieselbe Vorsicht wie bei den Zaehlernamen darueber, und aus demselben
  // Grund: b.stufe wird hier zu einem OBJEKTSCHLUESSEL. Der Worker schreibt nur
  // gepruefte Stufen (siehe pruefePartie), aber die Tabelle ist nicht nur ihm
  // zugaenglich -- eine Zeile aus "wrangler d1 execute", eine Uebernahme aus
  // einer anderen Quelle, ein spaeterer zweiter Schreiber. Eine Zeile mit der
  // Stufe '__proto__' wuerde mit stand.beste[b.stufe] den Prototypen der
  // Antwort austauschen statt einen Eintrag anzulegen; alles andere Erfundene
  // waere eine Stufe in der Antwort, die das Spiel nicht kennt. Vier Stufen
  // gibt es, und was keine ist, ist keine.
  for (const b of beste.results ?? []) {
    if (!STUFEN.includes(b.stufe)) continue;
    const liste = (stand.beste[b.stufe] ??= []);
    liste.push({ sekunden: b.sekunden, kuerzel: b.kuerzel, fehler: b.fehler, tipps: b.tipps });
    // Der erste Eintrag der sortierten Liste IST der Weltrekord der Stufe.
    if (liste.length === 1) stand.rekorde[b.stufe] = { sekunden: b.sekunden, kuerzel: b.kuerzel };
  }

  return stand;
}

/**
 * Traegt eine Zeit ein -- aber nur, wenn sie schneller ist als die, die schon
 * dasteht.
 *
 * Das ist EIN Satz, und darauf kommt hier alles an: das Lesen der alten Zeit,
 * der Vergleich und das Schreiben passieren in derselben Anweisung, unter
 * derselben Sperre der Datenbank. Das "WHERE excluded.sekunden <
 * bestzeiten.sekunden" gehoert zum UPSERT und nicht davor.
 *
 * Die naheliegende Alternative waere Lesen-Vergleichen-Schreiben:
 *
 *     const alt = await db.prepare('SELECT sekunden FROM ...').first();
 *     if (!alt || sekunden < alt.sekunden) await db.prepare('INSERT ...').run();
 *
 * Das ist zwei Rufe lang und in der Mitte offen. Zwischen dem SELECT und dem
 * INSERT liegt ein await, und in diesem Fenster laeuft der Worker fuer eine
 * andere Anfrage weiter -- womoeglich in einer anderen Weltgegend auf einer
 * anderen Instanz. Zwei Spieler, die im selben Augenblick fertig werden,
 * lesen dann BEIDE die alte Zeit, halten beide ihre eigene fuer besser und
 * schreiben beide. Wer als zweiter schreibt, gewinnt -- und wenn das der
 * LANGSAMERE von beiden ist, hat die Datenbank anschliessend die schlechtere
 * Zeit gespeichert und die bessere ist weg. Kein Wiederholen und kein
 * Nachfragen holt sie zurueck, denn niemand hat gemerkt, dass etwas verloren
 * ging. Genau dieses verlorene Update ist der Grund, warum die Rangliste eine
 * Datenbank braucht und kein Schluessel-Wert-Speicher genuegt.
 *
 * Nebenwirkung, die gut ist: nicht der Browser entscheidet, was eine Bestzeit
 * ist, sondern die Datenbank. Der Client schickt jede beendete Partie und
 * darf sich irren; ueber res.meta.changes stuende sogar da, ob es eine war.
 */
function zeitEintragen(db, stufe, sekunden, kuerzel, fehler, tipps) {
  return db.prepare(`
    INSERT INTO bestzeiten (kuerzel, stufe, sekunden, fehler, tipps, wann)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(kuerzel, stufe) DO UPDATE SET
      sekunden = excluded.sekunden,
      fehler   = excluded.fehler,
      tipps    = excluded.tipps,
      wann     = excluded.wann
    WHERE excluded.sekunden < bestzeiten.sekunden
  `).bind(kuerzel, stufe, sekunden, fehler, tipps, Date.now());
}

/** Plus eins, und legt den Zaehler beim ersten Mal an. */
function zaehlerHoch(db, name) {
  return db.prepare(`
    INSERT INTO zaehler (name, wert) VALUES (?1, 1)
    ON CONFLICT(name) DO UPDATE SET wert = wert + 1
  `).bind(name);
}

/**
 * Ein Nebenzaehler einer Partie (Fehler, Tipps).
 *
 * Fehlt er, ist er 0 -- ein Client, der ihn nicht schickt, ist kein Fehler.
 * Ist er DA, muss er eine ganze Zahl in 0..999 sein, sonst wird die ganze
 * Meldung abgewiesen. Das Zurechtbiegen auf 0 (so macht es der Sudoku-Worker)
 * ist hier verworfen: es schreibt eine Zahl in die Liste, die niemand gespielt
 * hat. Und wer 'viele' oder -3 als Fehlerzahl schickt, ist nicht das Spiel --
 * dann ist auch die Zeit daneben nichts wert.
 *
 * -> die Zahl oder null, wenn sie nicht taugt.
 */
function nebenzaehler(wert) {
  if (wert === undefined || wert === null) return 0;
  if (typeof wert !== 'number' || !Number.isInteger(wert)) return null;
  if (wert < 0 || wert > MAX_NEBEN) return null;
  return wert;
}

/**
 * Prueft, was hereinkommt, und gibt es sauber zurueck.
 *
 * Eigene Funktion und ausdruecklich exportiert, damit sie sich in Node pruefen
 * laesst: hier ist die EINZIGE Stelle, an der Fremdes in die Datenbank
 * uebergeht, und was hier durchrutscht, steht anschliessend fuer alle in der
 * Weltliste.
 *
 * Gibt { ok: true, ... } oder { ok: false, fehler } zurueck -- nie eine
 * Ausnahme: eine kaputte Anfrage ist ein 400 und kein Serverfehler.
 *
 * Achtung auf den Doppelsinn von 'fehler': bei { ok: false } ist es der GRUND
 * der Ablehnung (ein Text), bei { ok: true } die FEHLERZAHL der Partie (eine
 * Zahl, so heisst die Spalte). Der Name ist vom Vertrag fuer beides
 * vorgegeben; 'ok' entscheidet, welche Bedeutung gilt, und keine Stelle liest
 * beide.
 */
export function pruefePartie(koerper) {
  // Auf dem Typ bestehen und nicht umrechnen: String(['mittel']) waere
  // 'mittel', ein Array haette also als Stufe durchgesehen. Harmlos in der
  // Wirkung, aber eine Pruefung, die so etwas durchlaesst, prueft nicht.
  const stufe = typeof koerper?.stufe === 'string' ? koerper.stufe : '';
  if (!STUFEN.includes(stufe)) return { ok: false, fehler: 'unbekannte Stufe' };

  // Number('') ist 0 und Number(null) auch -- beides waere hier eine Zeit von
  // null Sekunden, also der ewige Weltrekord. Bei einem PUNKTESTAND waere so
  // ein Ausrutscher harmlos (0 Punkte gewinnen nichts), bei einer ZEIT ist er
  // der schlimmste Fall, den es gibt: kleiner ist besser, und 0 ist am
  // kleinsten. Darum ausdruecklich auf eine Zahl bestehen.
  const sekunden = typeof koerper?.sekunden === 'number' ? koerper.sekunden : NaN;
  if (!Number.isInteger(sekunden) || sekunden < MIN_SEKUNDEN || sekunden > MAX_SEKUNDEN) {
    return { ok: false, fehler: 'unglaubwuerdige Zeit' };
  }
  // Und dann noch einmal gegen die Stufe: 11 Sekunden sind auf 6x6 moeglich
  // und auf 12x12 nicht (siehe MIN_JE_STUFE).
  if (sekunden < MIN_JE_STUFE[stufe]) {
    return { ok: false, fehler: 'fuer diese Stufe zu schnell' };
  }

  const fehler = nebenzaehler(koerper?.fehler);
  if (fehler === null) return { ok: false, fehler: 'unbrauchbare Fehlerzahl' };
  const tipps = nebenzaehler(koerper?.tipps);
  if (tipps === null) return { ok: false, fehler: 'unbrauchbare Tippzahl' };

  // Grossbuchstaben wie im Spiel; was uebrig bleibt, muss der Form genuegen.
  //
  // NICHT gekuerzt, sondern abgewiesen, wenn mehr als drei Zeichen kommen --
  // und das ist der Unterschied zu zehner-paare, wo 'ABCDEF' zu 'ABC' wurde.
  // Dort war jeder Rekord eine eigene Zeile, ein gekuerztes Kuerzel also
  // hoechstens ein falsch beschrifteter Eintrag. Hier ist (kuerzel, stufe) der
  // Primaerschluessel: aus 'ABCD' wuerde 'ABC', und die Zeit landete auf der
  // Zeile eines ANDEREN Spielers und ueberschriebe womoeglich dessen Bestzeit.
  // Fremde Namen darf ein Tippfehler nicht treffen.
  const roh = typeof koerper?.kuerzel === 'string' ? koerper.kuerzel : '';
  const kuerzel = roh.toUpperCase();
  if (!KUERZEL.test(kuerzel)) return { ok: false, fehler: 'unbrauchbares Kuerzel' };

  return {
    ok: true, stufe, sekunden, kuerzel, fehler, tipps,
    neuePartie: !!koerper?.neuePartie,
    gewonnen: !!koerper?.gewonnen,
    zaehlt: !!koerper?.zaehlt,
  };
}

/**
 * Eine beendete Partie.
 *
 * neuePartie, gewonnen und zaehlt kommen getrennt: eine Partie kann mehrfach
 * enden (der Enddialog geht zu und wieder auf, die Seite wird neu geladen),
 * und das Spiel merkt sich selbst, was davon schon hinausgegangen ist.
 *
 * Eine ZEILE gibt es nur mit Kuerzel. Ohne Kuerzel wird die Partie gezaehlt
 * und sonst nichts -- eine namenlose Zeile koennte niemand halten, und alle
 * namenlosen Meldungen einer Stufe haetten denselben Primaerschluessel und
 * wuerden sich gegenseitig zur "schnellsten anonymen Zeit der Welt"
 * ueberschreiben.
 *
 * Alle Anweisungen in EINEM batch: das ist bei D1 eine Transaktion, also
 * kommen Zaehler und Bestzeit gemeinsam an oder gar nicht. Ein halb gezaehltes
 * Spiel waere kein Drama, aber es kostet auch nichts, es auszuschliessen -- und
 * ein Ruf statt drei ist der eigentliche Gewinn.
 */
async function partieBeendet(db, koerper) {
  const p = pruefePartie(koerper);
  if (!p.ok) return json({ fehler: p.fehler }, 400);

  const anweisungen = [];
  if (p.neuePartie) anweisungen.push(zaehlerHoch(db, 'spiele'));
  if (p.gewonnen) anweisungen.push(zaehlerHoch(db, 'siege'));
  if (p.zaehlt && p.kuerzel) {
    anweisungen.push(zeitEintragen(db, p.stufe, p.sekunden, p.kuerzel, p.fehler, p.tipps));
  }

  if (anweisungen.length) await db.batch(anweisungen);
  return json(await weltstand(db));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Alles, was keine Schnittstelle ist, sind die Dateien des Spiels. Die
    // Asset-Schicht liefert auch die 404.html fuer unbekannte Pfade.
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    // Der Vorflug. Er kommt nur von GitHub Pages -- liegt das Spiel neben dem
    // Worker, ist der POST gleicher Herkunft und braucht keinen.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
        },
      });
    }

    // Bei Cloudflare steht die Adresse des Absenders in dieser Kopfzeile.
    const absender = request.headers.get('cf-connecting-ip') || 'unbekannt';

    try {
      if (url.pathname === '/api/welt') {
        if (request.method !== 'GET') return json({ fehler: 'Methode nicht erlaubt' }, 405);
        if (!await darfDurch(env, 'LESE_LIMIT', 'lesen:' + absender)) {
          return json({ fehler: 'Zu viele Anfragen' }, 429, { 'retry-after': '60' });
        }
        return json(await weltstand(env.DB));
      }

      if (url.pathname === '/api/partie') {
        if (request.method !== 'POST') return json({ fehler: 'Methode nicht erlaubt' }, 405);
        if (fremdeHerkunft(request, url)) {
          return json({ fehler: 'Eintrag nur aus dem Spiel selbst' }, 403);
        }
        if (!await darfDurch(env, 'SCHREIB_LIMIT', 'schreiben:' + absender)) {
          return json({ fehler: 'Zu viele Eintraege in kurzer Zeit' }, 429, { 'retry-after': '60' });
        }
        let koerper = null;
        try { koerper = await request.json(); } catch { /* bleibt null */ }
        return await partieBeendet(env.DB, koerper);
      }

      return json({ fehler: 'nicht gefunden' }, 404);
    } catch (e) {
      // Faellt die Datenbank aus, bleibt das SPIEL spielbar -- es fehlen dann
      // eben die Weltwerte. Darum 503 mit JSON und nicht einfach ein leerer
      // Fehler: online.js macht daraus ein null, zeigt seinen Merkzettel und
      // stoert den Spieler mit keiner Meldung.
      return json({ fehler: 'Datenbank nicht erreichbar', grund: String(e?.message ?? e) }, 503);
    }
  },
};
