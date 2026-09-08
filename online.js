/**
 * Shikaku -- die Weltrangliste, Seite des Spiels.
 *
 * Was hier passiert: gespielte und gewonnene Partien werden weltweit gezaehlt,
 * und je Stufe steht eine Bestzeitenliste online -- mit dem dreistelligen
 * Kuerzel dessen, der sie haelt. Ohne Anmeldung, ohne Kennung, ohne
 * Geraetemerkmal; das Kuerzel setzt der Spieler selbst. Wer den Schalter in
 * den Einstellungen ausmacht, schickt gar nichts -- keine einzige Anfrage.
 *
 * Dass jeder eintragen kann, was er will, ist damit gesagt und nicht
 * versteckt: ohne Konten geht es nicht anders (siehe den Kopf von worker.js),
 * und in der Oberflaeche steht es unter rang.hinweis.
 *
 * Zwei Rufe, mehr gibt es nicht:
 *
 *   GET  /api/welt     holt den ganzen Stand samt Bestenliste je Stufe
 *   POST /api/partie   meldet eine beendete Partie und bekommt den neuen
 *                      Stand gleich zurueck -- kein zweiter Ruf noetig
 *
 * DER UNTERSCHIED ZU zehner-paare, von dem diese Datei den Aufbau hat: dort
 * war das Ergebnis ein PUNKTESTAND und gross war gut, hier ist es eine ZEIT
 * und klein ist gut. Aus hoechster() wird schnellster(), aus Math.max ein
 * Vergleich in die andere Richtung, aus "absteigend sortieren" ein
 * "aufsteigend". Wer eine dieser Stellen uebersieht, baut eine Anzeige, die
 * den Langsamsten feiert -- und weil so eine Zahl trotzdem plausibel aussieht,
 * faellt es niemandem auf.
 */

/*
 * Gerufen wird RELATIV -- dort, wo die Seite liegt, liegt auch die
 * Schnittstelle: auf shikaku.auer.page, auf der workers.dev-Adresse und beim
 * Entwickeln unter "wrangler dev". Das spart CORS und den Vorflug-OPTIONS vor
 * jedem POST.
 *
 * Die eine Ausnahme ist GitHub Pages: dort liegen nur die Dateien, ohne
 * Schnittstelle daneben. Von dort geht der Ruf an die feste Adresse, und die
 * antwortet mit offenem CORS.
 *
 * Herum und nicht andersherum, aus einem konkreten Grund: mit "immer die feste
 * Adresse, ausser zu Hause" haette jeder lokale Server in die ECHTE Datenbank
 * geschrieben, sobald man eine Partie zu Ende spielt. Ein Probelauf darf keine
 * Weltrekorde erzeugen. So laeuft der Ruf beim Entwickeln ins Leere, wenn
 * keine Schnittstelle daneben liegt -- und das ist der harmlose Fall, mit dem
 * diese Datei ohnehin umgehen kann.
 */
/*
 * Die vier Stufen kommen aus shikaku.js und werden hier NICHT noch einmal
 * hingeschrieben -- anders als MIN_ZEIT/MAX_ZEIT weiter unten, die worker.js
 * doppelt hat. Der Unterschied ist die Laufzeit: worker.js laeuft auf
 * Cloudflare und teilt mit dieser Datei kein Modul, shikaku.js liegt im selben
 * Browser und ist ohnehin geladen (app.js importiert beide, sw.js legt beide
 * ab). Ein Import kostet hier also nichts und erspart eine zweite Wahrheit --
 * eine fuenfte Stufe waere sonst an einer Stelle bekannt und an der anderen
 * nicht.
 */
import { STUFEN } from './shikaku.js';

const AUSWAERTS = 'https://shikaku.auer.page';
const HOST = typeof location !== 'undefined' && location.hostname.endsWith('github.io')
  ? AUSWAERTS : '';

/**
 * Liegt die Seite an einer Adresse, an der eine Schnittstelle überhaupt
 * antworten kann?
 *
 * Der Ruf geht relativ (siehe oben), und unter `file://` wird daraus
 * `file:///api/welt`. Das ist kein Fehlschlag, mit dem diese Datei umgehen
 * müsste, sondern ein Ruf, der von vornherein nicht gemeint war: es gibt dort
 * keinen Server, an den er gerichtet wäre. Chromium schreibt dafür zwei
 * CORS-Fehler in die Konsole ("Cross origin requests are only supported for
 * protocol schemes: …"), und die sehen aus wie ein Fehler im Spiel, obwohl
 * `ruf()` sie ohnehin verschluckt und alles weiterläuft.
 *
 * Der Fall ist nicht ausgedacht: die Einzeldatei-Fassung (siehe
 * tools/build-einzeldatei.mjs) ist genau dafür gebaut, per Doppelklick
 * geöffnet zu werden, und die Modulfassung lässt sich ebenso aus dem
 * Dateisystem starten. Gemessen in tools/probe-einzeldatei.mjs.
 *
 * Fehlt `location` ganz, wird durchgelassen: das ist Node, dort ist `fetch`
 * in den Tests absichtlich gestellt, und eine Prüfung, die die Tests
 * stillschweigend abschaltet, wäre schlimmer als die Konsolenmeldung.
 */
function amNetz() {
  if (typeof location === 'undefined') return true;
  return location.protocol === 'http:' || location.protocol === 'https:';
}

const SPEICHER = 'sk.welt.v1';

/** So lange gelten gelesene Weltwerte als frisch (5 Minuten). */
const FRISCH = 5 * 60 * 1000;

/** Nach so vielen Millisekunden gilt eine Anfrage als verloren. */
const GEDULD = 6000;

/**
 * Dieselben Schranken wie in worker.js (MIN_SEKUNDEN, MAX_SEKUNDEN).
 *
 * Doppelt aufgeschrieben, und das ist Absicht: worker.js laeuft auf
 * Cloudflare, diese Datei im Browser, und ohne Bundler gibt es kein gemeinsam
 * geladenes Modul zwischen beiden. Ein drittes Modul nur fuer zwei Zahlen
 * waere ein Import mehr in jeder Seite. Hier prueft es ohnehin etwas anderes:
 * der Worker entscheidet, was in die Datenbank DARF, diese Datei, was in die
 * ANZEIGE kommt -- und die muss auch einen Stand ueberleben, den ein
 * kaputter oder boshafter Server schickt.
 */
const MIN_ZEIT = 1;
const MAX_ZEIT = 86400;

/** Obergrenze fuer die Nebenzaehler einer Partie (Fehler, Tipps). */
const MAX_NEBEN = 999;

/**
 * So viele Namen nimmt die Anzeige je Stufe an -- dieselbe Zahl wie BESTENLISTE
 * in worker.js.
 *
 * Es ist ausdruecklich eine SCHRANKE und keine Erwartung: die Abfrage dort
 * schneidet schon bei zehn ab, aber diese Datei darf sich darauf nicht
 * verlassen. Was hier hereinkommt, geht ohne Umweg in den Ranglisten-Dialog,
 * und der zeichnet JEDE Zeile der Liste (siehe zeichneRangliste in app.js).
 * Eine Antwort mit dreitausend Eintraegen -- ein aufgebohrter Worker, ein
 * Zwischenspeicher, der etwas anderes einschiebt -- waere damit dreitausend
 * Tabellenzeilen und ein Merkzettel, der den Speicher des Browsers sprengt.
 * Und wenn setItem() dann wirft, verliert der Spieler nicht diese Antwort,
 * sondern seinen ganzen Merkzettel.
 */
const BESTENLISTE = 10;

let erlaubt = true;          // Schalter aus den Einstellungen

/* ------------------------------------------------------- kleiner Speicher */

/**
 * EIN Merkzettel im Speicher, den alle hier veraendern.
 *
 * Vorbild ist zehner-paare, wo sich vorher jede Aufgabe ihre eigene Abschrift
 * aus localStorage holte und sie nach mehreren Netzrufen zurueckschrieb. Das
 * ist Lesen-Aendern-Schreiben ueber Wartezeiten hinweg: wer zuletzt schreibt,
 * loescht die Arbeit des anderen. Mit nur einem Ruf je Aufgabe ist das kaum
 * noch ein Problem -- der Merkzettel bleibt trotzdem, er kostet nichts und die
 * Regel "einer, den alle anfassen" ist einfacher als "jeder seine Kopie".
 *
 * Die Rekorde liegen als { sekunden, kuerzel } beieinander und NICHT, wie in
 * zehner-paare, als zwei Tabellen (rekorde und wer) nebeneinander. Dort hatte
 * das seinen Grund: Rekorde aus der Zeit vor den Kuerzeln hatten keinen Namen,
 * die Zahl stand also allein. Hier hat jede Zeile ein Kuerzel, und ein Objekt
 * je Stufe heisst: Zahl und Name koennen nicht auseinanderlaufen. Nebenbei hat
 * der Merkzettel damit genau die Form, die auch /api/welt schickt -- die
 * Anzeige muss nur eine kennen.
 */
let merkzettel = null;

function zettel() {
  if (merkzettel) return merkzettel;
  let roh = null;
  try { roh = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null'); }
  catch { /* kaputter oder gesperrter Speicher ist kein Grund zum Absturz */ }
  merkzettel = {
    // Wann zuletzt wirklich GELESEN wurde. Ausdruecklich nicht "wann zuletzt
    // etwas geschrieben wurde": ein erhoehter Zaehler sagt nichts darueber,
    // ob die Bestzeiten noch stimmen.
    gelesenAm: Number(roh?.gelesenAm) || 0,
    spiele: typeof roh?.spiele === 'number' ? roh.spiele : null,
    siege: typeof roh?.siege === 'number' ? roh.siege : null,
    // Je Stufe { sekunden, kuerzel } -- der Weltrekord, also die schnellste
    // bekannte Zeit.
    rekorde: roh?.rekorde && typeof roh.rekorde === 'object' ? { ...roh.rekorde } : {},
    // Die Bestenliste je Stufe, schnellster zuerst.
    beste: roh?.beste && typeof roh.beste === 'object' ? { ...roh.beste } : {},
  };
  return merkzettel;
}

function sichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(zettel())); }
  catch { /* voller oder gesperrter Speicher: dann eben ohne */ }
}

/**
 * Wie alt sind die gelesenen Werte? Infinity heisst "noch nie gelesen".
 *
 * Negative Werte gibt es nicht: eine vorgestellte und dann zurueckgestellte
 * Geraeteuhr wuerde sonst dazu fuehren, dass tagelang nicht mehr nachgelesen
 * wird.
 */
function alter() {
  const wann = zettel().gelesenAm;
  if (!wann) return Infinity;
  const her = Date.now() - wann;
  return her < 0 ? Infinity : her;
}

/**
 * Eine Bestzeit kann nur FALLEN -- ein bekannter Wert wird nie durch einen
 * groesseren ersetzt.
 *
 * Das ist die Umkehrung von hoechster() in zehner-paare, und die Umkehrung ist
 * der ganze Witz: dort hiess "besser" groesser, hier kleiner. Ein Math.min()
 * allein taete es aber nicht, denn Zahl und Name ziehen gemeinsam um -- mit
 * Math.min stuende nach dem Wechsel die neue Zeit neben dem alten Namen.
 *
 * Warum die Regel ueberhaupt? Eine halb angekommene Antwort, ein Ruf, der ins
 * Leere lief, ein Stand aus einem anderen Reiter, ein Server, der gerade neu
 * aufgesetzt wurde -- in all diesen Faellen soll in der Anzeige nie eine Zeit
 * stehen, die LANGSAMER ist als die, die derselbe Browser vorher schon gezeigt
 * hat. Ein verschwundener Weltrekord sieht wie ein Fehler im Spiel aus, und
 * der Spieler kann nicht nachsehen, wer recht hat.
 *
 * Ausdruecklich exportiert, damit sich die Regel pruefen laesst.
 *
 * -> die Zeit, die danach im Merkzettel steht.
 */
export function schnellster(zettelchen, stufe, sekunden, kuerzel = '') {
  const alt = zettelchen.rekorde[stufe];
  const bekannt = alt && typeof alt.sekunden === 'number' ? alt.sekunden : null;

  if (bekannt === null || sekunden < bekannt) {
    zettelchen.rekorde[stufe] = { sekunden, kuerzel };
  } else if (sekunden === bekannt && kuerzel && !alt.kuerzel) {
    // Bei Gleichstand wird ein bekanntes Kuerzel nicht durch ein leeres
    // ersetzt: dass eine Antwort ohne Kuerzel kam, heisst nicht, dass der
    // Rekord seinen Namen verloren hat. Eine LUECKE wird dagegen gefuellt.
    zettelchen.rekorde[stufe] = { sekunden: bekannt, kuerzel };
  }

  return zettelchen.rekorde[stufe].sekunden;
}

/** Drei Zeichen aus A-Z und 0-9. Ohne Kuerzel kein Eintrag -- so ist es gewollt. */
const KUERZEL = /^[A-Z0-9]{1,3}$/;

/** Ein Nebenzaehler aus dem Netz: eine ganze Zahl in 0..999, sonst 0. */
function neben(wert) {
  return typeof wert === 'number' && Number.isInteger(wert) && wert >= 0 && wert <= MAX_NEBEN
    ? wert : 0;
}

/**
 * Prueft eine Bestenliste aus dem Netz. Gibt eine saubere Liste zurueck oder
 * null, wenn es gar keine war.
 *
 * Streng, weil jeder Eintrag ohne Umweg in die Anzeige geht: was hier
 * durchrutscht, steht anschliessend im Markup. Eine leere Liste ist erlaubt --
 * eine Stufe, auf der noch niemand mit Kuerzel gespielt hat, hat eben keine.
 */
export function besteListe(roh) {
  if (!Array.isArray(roh)) return null;
  const sauber = [];
  for (const e of roh) {
    // Auf dem Typ bestehen, nicht umrechnen: Number('143') ist 143, eine Zeit
    // als Zeichenkette waere sonst durchgegangen -- und Number(null) ist 0,
    // also der ewige Weltrekord. Dieselbe Regel wie in pruefePartie(): was an
    // einer Grenze gilt, gilt an allen.
    const sekunden = typeof e?.sekunden === 'number' ? e.sekunden : NaN;
    if (!Number.isInteger(sekunden) || sekunden < MIN_ZEIT || sekunden > MAX_ZEIT) continue;
    const kuerzel = typeof e?.kuerzel === 'string' ? e.kuerzel.toUpperCase() : '';
    // Zu lang wird nicht gekuerzt, sondern weggelassen: 'ABCD' zu 'ABC' zu
    // machen hiesse, die Zeit unter einem fremden Namen anzuzeigen.
    if (!KUERZEL.test(kuerzel)) continue;
    sauber.push({ sekunden, kuerzel, fehler: neben(e?.fehler), tipps: neben(e?.tipps) });
  }
  // AUFSTEIGEND, kleinste Zeit zuerst -- hier steht das Gegenteil von
  // zehner-paare. Die Datenbank sortiert schon, aber verlassen soll sich die
  // Anzeige darauf nicht: eine verdrehte Liste saehe aus wie ein Fehler im
  // Spiel. Der Nachrang nach Kuerzel ist dabei kein Beiwerk: gleiche Zeiten
  // sind in einem Zeitspiel haeufig, und ohne ihn duerfte dieselbe Liste bei
  // jedem Aufschlagen anders herum stehen.
  sauber.sort((a, b) => a.sekunden - b.sekunden || a.kuerzel.localeCompare(b.kuerzel));
  // Erst sortieren, dann abschneiden -- nicht umgekehrt. Kaeme die Liste
  // verdreht an, wuerde ein Abschneiden davor die SCHNELLSTEN zehn wegwerfen
  // und die langsamsten zeigen.
  return sauber.slice(0, BESTENLISTE);
}

/**
 * Traegt einen ganzen Stand aus der Schnittstelle in den Merkzettel ein.
 *
 * Auch ausdruecklich exportiert und geprueft: hier laeuft zusammen, was von
 * aussen kommt, und was hier falsch ist, steht anschliessend im Bild.
 *
 * -> true, wenn es ueberhaupt ein Stand war (nicht: ob sich etwas geaendert
 *    hat -- ein Stand, der nur Bekanntes bestaetigt, ist auch einer).
 */
export function uebernehmen(zettelchen, stand) {
  // Eine LISTE ist kein Stand. typeof [] ist 'object', ohne diese Zeile waere
  // ein [] also ein gueltiger (leerer) Stand -- und genau das schickt ein
  // falsch aufgesetzter Dienst gern zurueck. Der Unterschied ist nicht
  // theoretisch: der Rueckgabewert entscheidet weiter unten darueber, ob
  // gelesenAm gesetzt und eine Partie als gezaehlt gemeldet wird.
  if (!stand || typeof stand !== 'object' || Array.isArray(stand)) return false;

  // Ein unvollstaendiger Stand ist kein kaputter: was fehlt, bleibt beim
  // bekannten Wert. Der Worker schickt immer alles, ein alter oder halb
  // angekommener Stand nicht.
  if (typeof stand.spiele === 'number') zettelchen.spiele = stand.spiele;
  if (typeof stand.siege === 'number') zettelchen.siege = stand.siege;

  /*
   * DER STUFENNAME AUS DEM NETZ IST EIN OBJEKTSCHLUESSEL -- und deshalb wird er
   * geprueft, bevor er einer wird.
   *
   * Bis hierher stand die Regel dieser Datei nur auf den WERTEN: eine Zeit muss
   * eine Zahl sein, ein Kuerzel drei Zeichen. Der SCHLUESSEL ging ungeprueft
   * durch, und die naechste Zeile schreibt damit in den Merkzettel. Das hat
   * zwei Loecher, und beide sind mit einer geprueften Antwort erreichbar:
   *
   *   1. '__proto__' ist kein Name wie jeder andere. JSON.parse legt ihn als
   *      EIGENE Eigenschaft an, Object.entries gibt ihn also heraus -- eine
   *      Zuweisung darauf ruft aber den Setzer von Object.prototype und
   *      TAUSCHT DEN PROTOTYPEN des Merkzettels aus. Nach
   *      {"rekorde":{"__proto__":{"sekunden":1,"kuerzel":"HAX"}}} erbt
   *      zettel().rekorde ein sekunden und ein kuerzel, die nie eingetragen
   *      wurden, und jede Abfrage auf einen unbekannten Schluessel liefert
   *      plotzlich Werte. Beim beste-Zweig unten wird der Prototyp sogar ein
   *      Array, und dann hat ein Objekt eine length.
   *   2. Jeder andere erfundene Name legt eine echte Stufe an, die es nicht
   *      gibt. Fuenftausend davon in einer Antwort sind fuenftausend Eintraege
   *      im Merkzettel -- der wird gesichert, waechst ueber die Quote und
   *      nimmt beim Werfen von setItem() den ganzen Merkzettel mit.
   *
   * Beides ist mit derselben Zeile erledigt: es gibt genau vier Stufen, und
   * was keine ist, ist keine. Bewusst nicht ueber Object.create(null) oder
   * hasOwn geloest -- eine Erlaubnisliste ist hier kuerzer und deckt Loch 2
   * mit.
   */
  const rekorde = stand.rekorde && typeof stand.rekorde === 'object' ? stand.rekorde : {};
  for (const [stufe, r] of Object.entries(rekorde)) {
    if (!STUFEN.includes(stufe)) continue;
    const sekunden = typeof r?.sekunden === 'number' ? r.sekunden : NaN;
    if (!Number.isInteger(sekunden) || sekunden < MIN_ZEIT || sekunden > MAX_ZEIT) continue;
    schnellster(zettelchen, stufe, sekunden, typeof r?.kuerzel === 'string' ? r.kuerzel : '');
  }

  const beste = stand.beste && typeof stand.beste === 'object' ? stand.beste : null;
  if (beste) {
    for (const [stufe, liste] of Object.entries(beste)) {
      if (!STUFEN.includes(stufe)) continue;   // derselbe Grund wie oben
      const geprueft = besteListe(liste);
      // Bei Unsinn bleibt die bekannte Liste stehen -- anders als bei den
      // Rekorden gibt es hier kein "schneller gewinnt", die Datenbank ist die
      // Wahrheit ueber die Reihenfolge.
      if (!geprueft) continue;
      // Und eine LEERE Liste ersetzt eine bekannte auch nicht. In dieser
      // Datenbank verliert eine Stufe ihre Namen nie wieder: es gibt eine
      // Zeile je Kuerzel und Stufe, sie wird nur verbessert und niemals
      // geloescht. Kommt die Liste einer Stufe, die schon Namen hatte, leer
      // zurueck, ist das also keine Aussage ueber die Welt, sondern eine
      // unvollstaendige Antwort -- ein halb aufgebauter Server, eine
      // abgeschnittene Uebertragung. (In zehner-paare ist es umgekehrt
      // geloest; dort konnte die Liste auch wirklich leer sein.) Solange
      // NICHTS bekannt ist, wird die leere Liste dagegen uebernommen: dann
      // kann die Anzeige "noch keine Eintraege" sagen statt "offline".
      const bekannt = zettelchen.beste[stufe];
      if (!geprueft.length && Array.isArray(bekannt) && bekannt.length) continue;
      zettelchen.beste[stufe] = geprueft;
    }
  }
  return true;
}

/* ------------------------------------------------------------- die Rufe */

/**
 * Eine Anfrage. Alles hier verschluckt Fehler: die Weltrangliste darf das
 * Spiel nie aufhalten und nie mit einer Meldung stoeren. Faellt sie aus,
 * bleibt das Spiel unveraendert spielbar, die Weltwerte fehlen dann einfach.
 *
 * Die eigene Geduld ist noetig, weil fetch von sich aus nicht aufgibt: ohne
 * Abbruch bliebe ein Ruf in einem Netz, das Pakete schluckt, Minuten offen --
 * und der Enddialog wartete darauf.
 */
async function ruf(pfad, koerper = null) {
  if (!erlaubt || !amNetz()) return null;
  const stop = new AbortController();
  const uhr = setTimeout(() => stop.abort(), GEDULD);
  try {
    const antwort = await fetch(HOST + pfad, {
      method: koerper ? 'POST' : 'GET',
      headers: koerper ? { 'content-type': 'application/json' } : undefined,
      body: koerper ? JSON.stringify(koerper) : undefined,
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: stop.signal,
    });
    // Auch 400, 429 und 503 werden zu null: fuer das Spiel ist jede Antwort,
    // die keinen Stand enthaelt, dasselbe -- es zeigt weiter den Merkzettel.
    if (!antwort.ok) return null;
    return await antwort.json();
  } catch {
    return null;                     // Netz weg, abgebrochen, Dienst still
  } finally {
    clearTimeout(uhr);
  }
}

/* -------------------------------------------------------------- nach aussen */

export const welt = {
  /** Schalter aus den Einstellungen. Aus heisst: keine einzige Anfrage. */
  schalten(an) { erlaubt = !!an; },

  /**
   * Der letzte bekannte Stand -- sofort da, auch ohne Netz.
   *
   * Die Form ist genau die von /api/welt, dazu 'alter'. Damit muss die Anzeige
   * nicht unterscheiden, ob die Zahlen gerade angekommen oder vom Merkzettel
   * sind; wie frisch sie sind, sagt 'alter'.
   */
  zwischenstand() {
    const z = zettel();
    return {
      spiele: z.spiele,
      siege: z.siege,
      rekorde: { ...z.rekorde },
      beste: { ...z.beste },
      alter: alter(),
    };
  },

  /** Ob es sich lohnt, neu zu lesen. */
  veraltet() { return alter() > FRISCH; },

  /**
   * Eine Partie ist zu Ende. Zaehlt sie weltweit mit und traegt die Zeit ein,
   * falls es eine Bestzeit ist -- beides in einem Ruf.
   *
   * Ob es eine Bestzeit ist, entscheidet die DATENBANK und nicht dieser
   * Browser: der Vergleich steht im WHERE derselben Anweisung, die einfuegt
   * (siehe zeitEintragen in worker.js). Zwei Spieler, die im selben Augenblick
   * fertig werden, koennen sich damit nicht gegenseitig ueberschreiben.
   *
   * 'gezaehlt' sagt, ob die Partie weltweit wirklich mitgezaehlt wurde. Der
   * Aufrufer merkt sich das an der Partie: geht der Ruf verloren (Netz weg),
   * wird beim naechsten Ende derselben Partie nachgezaehlt statt gar nicht.
   *
   * 'stand' ist immer dabei, auch wenn nichts angekommen ist -- dann eben der
   * Merkzettel. Der Enddialog will einen Rang anzeigen und soll dafuer nicht
   * zwei Faelle kennen muessen.
   */
  async partieBeendet({ stufe, sekunden, kuerzel = '', fehler = 0, tipps = 0,
                        gewonnen = false, zaehlt = false, neuePartie = true } = {}) {
    if (!erlaubt) return { gezaehlt: false, stand: welt.zwischenstand() };

    const stand = await ruf('/api/partie', {
      stufe, sekunden, kuerzel,
      fehler, tipps,
      gewonnen: !!gewonnen, zaehlt: !!zaehlt, neuePartie: !!neuePartie,
    });
    /*
     * Nicht "es kam etwas zurueck", sondern "es war ein Stand" -- und das ist
     * nicht dasselbe. Eine 200er Antwort mit dem Koerper "ok" oder 123 ist
     * gueltiges JSON und damit hier ein Wert, der nicht null ist; ein
     * Anmeldeportal im Hotel-WLAN oder ein Zwischenspeicher, der etwas anderes
     * einschiebt, liefert genau so etwas. Ohne diese Pruefung meldete die Datei
     * dafuer gezaehlt: true, der Aufrufer merkte die Partie als weltweit
     * gezaehlt vor -- und sie war es nie. Nachgezaehlt wird dann auch nicht
     * mehr, denn niemand hat gemerkt, dass etwas verloren ging.
     */
    const z = zettel();
    if (!uebernehmen(z, stand)) return { gezaehlt: false, stand: welt.zwischenstand() };
    // gelesenAm bleibt unberuehrt: hier wurde geschrieben, nicht gelesen -- der
    // zurueckgegebene Stand ist zwar frisch, aber die naechste Anzeige soll
    // trotzdem nicht "gerade geholt" behaupten.
    sichern();
    return { gezaehlt: !!neuePartie, stand: welt.zwischenstand() };
  },

  /**
   * Liest den ganzen Weltstand. Ein Ruf, alle Stufen.
   *
   * Der Lesezeitpunkt wird nur gesetzt, wenn wirklich etwas angekommen ist.
   * Sonst gaelte ein leerer Stand fuenf Minuten lang als frisch, und die
   * Anzeige behauptete "gerade geholt" fuer Zahlen, die nie kamen.
   */
  async lesen() {
    if (!erlaubt) return null;
    const stand = await ruf('/api/welt');
    if (!stand) return null;
    const z = zettel();
    // Derselbe Grund wie in partieBeendet: der Lesezeitpunkt darf nur setzen,
    // wer wirklich einen Stand bekommen hat. Sonst gilt eine Antwort wie "ok"
    // fuenf Minuten lang als frisch, es wird nicht nachgelesen, und die
    // Anzeige behauptet "gerade geholt" fuer Zahlen, die nie kamen.
    if (!uebernehmen(z, stand)) return null;
    z.gelesenAm = Date.now();
    sichern();
    return welt.zwischenstand();
  },
};
