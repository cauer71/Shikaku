/**
 * Shikaku – das Brett: Ansicht und Zeigerbedienung, nichts sonst.
 *
 * Diese Datei darf alles über das DOM wissen und möglichst wenig über das
 * Spiel. Sie kennt keine Uhr, keinen Spielstand, keine Sprache, keinen
 * Speicher und kein Netz: sie bekommt ein Rätsel und eine Liste Rechtecke und
 * macht daraus ein Bild, und sie verwandelt Zeigerereignisse in Zellen. Was
 * ein Antippen BEDEUTET — ein Rechteck setzen, eines wegnehmen, gar nichts —
 * entscheidet app.js.
 *
 * Der Schnitt liegt genau dort, weil die beiden Seiten sich verschieden
 * schnell ändern. Am Bild wird gedreht, solange etwas nicht gut aussieht; an
 * den Spielregeln steht nach dem ersten Tag nichts mehr. Eine Oberfläche, die
 * ihre Zeichenarbeit selbst macht, wird beim Nachbessern immer länger, und am
 * Ende steht die Ereignisbehandlung mitten in der Zeichenschleife.
 *
 * Drei Festlegungen ziehen sich durch die ganze Datei:
 *
 *  1. Die Treffererkennung RECHNET, sie sucht nicht. Aus clientX/clientY und
 *     getBoundingClientRect() des Bretts wird die Zelle gerechnet.
 *     `elementFromPoint` und ein `pointerenter` je Zelle wären kürzer, geben
 *     aber beim Ziehen über den Brettrand hinaus gar nichts zurück — und
 *     genau das passiert an der Kante bei jedem zweiten Zug: der Daumen liegt
 *     drei Millimeter neben dem Brett, und das Rechteck soll trotzdem bis zur
 *     Randspalte wachsen. Gerechnet wird es geklemmt, gesucht wird es nichts.
 *
 *  2. Die Zellen werden EINMAL gebaut und danach nur noch beschriftet.
 *     `innerHTML = ''` je Bild wäre einfacher zu schreiben, kostet aber bei
 *     144 Zellen einen vollständigen Neuaufbau samt Layout — mitten im
 *     Ziehen, wo der Finger auf dem Glas liegt und jedes Bild sitzen muss.
 *     Dasselbe gilt für die Flächen in #teile: die Elemente werden
 *     wiederverwendet, nur ihre Anzahl wird angepasst.
 *
 *  3. Gerechnet wird in ZELLEN, gezeichnet in PROZENT. Diese Datei setzt an
 *     einer Fläche nur die vier Zahlen --x/--y/--b/--h; wie breit ein Kästchen
 *     in Pixeln ist, weiß allein basis.css. Eine in JS gerechnete Pixelgröße
 *     müsste bei jedem Drehen des Geräts, bei jeder eingefahrenen Adressleiste
 *     und bei jeder Änderung der Schriftgröße nachgerechnet werden, und genau
 *     das wird beim ersten Umbau vergessen.
 */

import { belegung, imBrett } from './shikaku.js';

/**
 * So viele Flächenfarben gibt es (--f0 … --f4 in basis.css).
 *
 * Fünf und nicht vier: der Vier-Farben-Satz gilt für Landkarten mit
 * zusammenhängenden Ländern, die gierige Färbung hier ist aber keine optimale
 * — sie nimmt der Reihe nach die erste freie Farbe und kann sich damit in eine
 * Ecke malen, in der vier nicht reichen. Gemessen über einige hundert
 * erzeugte Rätsel kam die fünfte Farbe selten vor und die vierte oft; mit nur
 * vier Farben lägen gelegentlich zwei gleiche Flächen aneinander, und das
 * sieht wie ein Rechteck aus, das keines ist. Fünf ist der Preis dafür, dass
 * die Färbung einfach und schnell bleiben darf.
 */
const FARBEN = 5;

/* ------------------------------------------------------------ die Elemente */

/*
 * Die drei Elemente werden beim ersten Zugriff geholt und dann behalten.
 *
 * Warum nicht einmal beim Laden des Moduls: index.html lädt app.js als Modul
 * am Ende des Körpers, das Dokument steht also — aber diese Datei soll auch
 * dann noch etwas Sinnvolles tun, wenn sie früher geladen wird (ein Prüfstand,
 * ein zweiter Einstiegspunkt, eine spätere Fassung mit einem Modul-Vorladen im
 * Kopf). Ein `const brett = document.getElementById('brett')` an dieser Stelle
 * wäre in dem Fall dauerhaft null, und der Fehler zeigte sich als "das Brett
 * bleibt leer" ohne eine einzige Meldung.
 */
const merker = new Map();

function holen(kennung) {
  if (!merker.has(kennung)) {
    merker.set(kennung, typeof document === 'undefined'
      ? null : document.getElementById(kennung));
  }
  return merker.get(kennung);
}

/*
 * Das Ausmaß des zuletzt gebauten Bretts.
 *
 * Es steht hier und wird nicht bei jedem Aufruf aus dem DOM gelesen, weil
 * zelleAus() bei jedem Zeigerereignis danach fragt — und das sind beim Ziehen
 * gut hundert in der Sekunde. Eine Zahl aus einer CSS-Eigenschaft
 * zurückzulesen (getComputedStyle) kostet dabei jedes Mal eine erzwungene
 * Layoutrechnung, und die ist genau das, was ein Zug auf dem Telefon nicht
 * verträgt.
 */
let gebauteBreite = 0;
let gebauteHoehe = 0;

/** Klemmt eine Zahl in [von, bis]. */
function klemme(wert, von, bis) {
  return wert < von ? von : (wert > bis ? bis : wert);
}

/* ------------------------------------------------------------ Brett bauen */

/**
 * Legt die Zellen an: `breite * hoehe` Kinder in Zeilenordnung.
 *
 * Ein DocumentFragment und nicht `raster.append(zelle)` je Zelle: bei 144
 * Zellen sind das 144 Einfügungen in einen Baum, der schon im Bild steht,
 * gegen eine einzige. Messbar ist der Unterschied auf einem Telefon beim
 * Wechsel auf 'experte' — dort, wo der Spieler gerade auf "Experte" getippt
 * hat und das Bild stehen soll.
 */
function baueZellen(raster, breite, hoehe) {
  const haufen = document.createDocumentFragment();
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const zelle = document.createElement('div');
      zelle.className = 'zelle';
      zelle.dataset.x = String(x);
      zelle.dataset.y = String(y);
      haufen.append(zelle);
    }
  }
  raster.replaceChildren(haufen);
}

/**
 * Baut das Brett für dieses Rätsel: #raster füllen, --spalten/--zeilen setzen.
 *
 * Die Zellen werden nur dann wirklich neu erzeugt, wenn sich das Ausmaß
 * geändert hat. Beim Wechsel auf ein neues Rätsel DERSELBEN Stufe — der
 * häufigste Fall, "Nochmal" nach einer gelösten Partie — bleiben die 64
 * Kästchen also stehen und bekommen bloß neue Zahlen. Das ist nicht nur
 * schneller: die Zellen behalten dabei ihren Platz im Layout, und das Bild
 * springt beim Wechsel nicht.
 *
 * Die Zahlen selbst stehen als eigenes <span class="zahl"> in der Zelle und
 * nicht als deren Textinhalt. Der Grund ist die Malreihenfolge: das Plättchen
 * muss ÜBER den gesetzten Flächen liegen (sonst verschwindet die Zahl unter
 * ihrem eigenen Rechteck), und dafür braucht es ein positioniertes Element mit
 * eigenem z-index. Eine Zelle kann das nicht sein — sie liegt im Fluss und
 * trägt die Rasterlinien, die absichtlich UNTER den Flächen bleiben.
 */
export function baueBrett(raetsel) {
  const brett = holen('brett');
  const raster = holen('raster');
  if (!brett || !raster || !raetsel) return;

  const breite = raetsel.breite;
  const hoehe = raetsel.hoehe;
  if (!Number.isInteger(breite) || !Number.isInteger(hoehe)
      || breite < 1 || hoehe < 1) return;

  brett.style.setProperty('--spalten', String(breite));
  brett.style.setProperty('--zeilen', String(hoehe));

  if (breite !== gebauteBreite || hoehe !== gebauteHoehe
      || raster.childElementCount !== breite * hoehe) {
    baueZellen(raster, breite, hoehe);
    gebauteBreite = breite;
    gebauteHoehe = hoehe;
  }

  // Ein Streifen "welche Zelle trägt welchen Wert" statt einer Suche in
  // raetsel.zahlen je Zelle: bei 144 Zellen und 29 Zahlen wären das über
  // 4000 Vergleiche, hier ist es ein Durchgang über die Zahlen und einer über
  // die Zellen. 0 heißt "keine Zahl" – ein Wert ist im Shikaku immer >= 1.
  const werte = new Int16Array(breite * hoehe);
  for (const z of raetsel.zahlen ?? []) {
    if (!z) continue;
    if (z.x >= 0 && z.x < breite && z.y >= 0 && z.y < hoehe) {
      werte[z.y * breite + z.x] = z.wert;
    }
  }

  const zellen = raster.children;
  for (let k = 0; k < werte.length; k++) {
    const zelle = zellen[k];
    if (!zelle) continue;
    const wert = werte[k];
    const plaettchen = zelle.firstElementChild;
    if (wert > 0) {
      zelle.className = 'zelle zelle--zahl';
      if (plaettchen) {
        // Nur schreiben, wenn sich etwas geändert hat: eine Zuweisung an
        // textContent verwirft den Textknoten und legt einen neuen an, und
        // beim Wechsel auf ein Rätsel derselben Größe stimmt die Hälfte der
        // Zahlen ohnehin schon.
        const neu = String(wert);
        if (plaettchen.textContent !== neu) plaettchen.textContent = neu;
      } else {
        const span = document.createElement('span');
        span.className = 'zahl';
        span.textContent = String(wert);
        zelle.append(span);
      }
    } else {
      // Zellen ohne Zahl haben kein <span> – nicht ein leeres. Ein leeres
      // Plättchen hätte im Bild eine Mindestgröße und einen Rahmen und wäre
      // als heller Fleck zu sehen.
      zelle.className = 'zelle';
      if (plaettchen) plaettchen.remove();
    }
  }
}

/* ---------------------------------------------------------------- Färbung */

/**
 * Welche Farbe bekommt welches Rechteck? -> Array von Farbindizes (0 … 4),
 * parallel zu `rechtecke`.
 *
 * Zwei Bedingungen, und die zweite ist die unbequeme:
 *
 *  1. Zwei Flächen, die aneinander stoßen, haben nie dieselbe Farbe. Sonst
 *     sehen zwei Rechtecke wie eines aus, und im Shikaku ist die FORM der
 *     Fläche die ganze Aussage.
 *
 *  2. Dasselbe Rätsel sieht immer gleich aus, egal in welcher Reihenfolge der
 *     Spieler seine Rechtecke gelegt hat. Darum läuft die gierige Färbung in
 *     einer festen Ordnung (nach x, dann y, dann Index) und nicht in der
 *     Reihenfolge, in der die Rechtecke im Spielstand stehen. Ohne das
 *     springen die Farben, sobald man ein Rechteck löscht und neu zieht: es
 *     rutscht ans Ende der Liste, wird als letztes gefärbt und färbt dabei
 *     womöglich die halbe Nachbarschaft um. Gemessen im Bild ist das der
 *     unangenehmste Fehler von allen — man tippt eine Fläche weg und drei
 *     andere wechseln die Farbe.
 *
 * Ausdrücklich verworfen: die Farbe aus Fläche und Lage zu rechnen (etwa
 * `(x + 3 * y + flaeche) % 5`), wie Abschnitt 8 des Vertrags es nahelegt. Das
 * ist stabil und billig, erfüllt aber die erste Bedingung nicht — zwei
 * Nachbarn können dieselbe Zahl herausrechnen, und dann verschmelzen sie im
 * Bild. Die Lage geht hier stattdessen als ORDNUNG der Färbung ein: sie
 * bestimmt, wer sich seine Farbe zuerst nimmt, und damit hängt das Ergebnis
 * allein am Rätsel und nicht am Spielverlauf.
 *
 * Die Nachbarschaft kommt aus der Belegung und nicht aus einem Vergleich
 * "Rechteck gegen Rechteck": zwei Rechtecke sind Nachbarn, wenn zwei ihrer
 * Kästchen aneinander liegen, und das steht im Belegungsstreifen schon da.
 * Der Vergleich aller Paare wäre quadratisch (bei 29 Rechtecken 406 Paare,
 * jedes mit einer Kantenrechnung) und müsste die Berührung von der
 * Überlappung unterscheiden.
 */
export function faerbe(raetsel, rechtecke) {
  const liste = Array.isArray(rechtecke) ? rechtecke : [];
  if (!raetsel || liste.length === 0) return liste.map(() => 0);

  /*
   * -1 heißt "noch ohne Farbe", und der Unterschied zu einer 0 an dieser
   * Stelle ist keine Kleinigkeit: mit `fill(0)` sah jeder noch unbemalte
   * Nachbar wie ein mit Farbe 0 bemalter aus. Damit war Farbe 0 praktisch
   * immer gesperrt und die gierige Färbung hatte statt fünf nur vier Farben
   * zur Verfügung — und vier reichen ihr nicht immer. Auf einem
   * durchgespielten 8×8 lagen dann zwei gleichfarbige Flächen aneinander,
   * also genau das, was diese Funktion verhindern soll. Gefunden mit einer
   * Prüfung über ALLE Nachbarschaften eines gelösten Rätsels; von Hand wäre
   * es Zufall gewesen, denn im Bild fällt es nur an der einen Stelle auf.
   */
  const farben = new Array(liste.length).fill(-1);

  const breite = raetsel.breite;
  const hoehe = raetsel.hoehe;
  const feld = belegung(raetsel, liste);

  // Die Nachbarschaft als Menge je Rechteck. Ein Set und keine Liste, weil
  // zwei Flächen sich über viele Kästchen berühren und jede Berührung hier
  // einmal ankommt — eine Liste stände am Ende voller Wiederholungen, und die
  // Färbung liefe sie alle ab.
  const nachbarn = liste.map(() => new Set());
  const merke = (a, b) => {
    if (a >= 0 && b >= 0 && a !== b) {
      nachbarn[a].add(b);
      nachbarn[b].add(a);
    }
  };
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const k = y * breite + x;
      const hier = feld[k];
      // -1 (frei) und -2 (doppelt belegt) haben keinen Besitzer. Bei -2 geht
      // damit eine Nachbarschaft verloren; das ist verantwortbar, weil die
      // Oberfläche gar keine Überlappung entstehen lässt (ein neues Rechteck
      // entfernt die, die es schneidet). Aus einem von Hand verbogenen
      // Spielstand kann eine kommen, und dann sind die beiden Flächen im Bild
      // ohnehin übereinander — eine Farbe mehr oder weniger rettet das nicht.
      if (hier < 0) continue;
      if (x + 1 < breite) merke(hier, feld[k + 1]);
      if (y + 1 < hoehe) merke(hier, feld[k + breite]);
    }
  }

  const ordnung = liste.map((r, i) => i).sort((i, j) => {
    const a = liste[i];
    const b = liste[j];
    if (!a || !b) return i - j;
    return (a.x - b.x) || (a.y - b.y) || (i - j);
  });

  for (const i of ordnung) {
    let genommen = 0;
    for (const n of nachbarn[i]) {
      if (farben[n] >= 0) genommen |= 1 << farben[n];
    }
    let f = 0;
    while (f < FARBEN && (genommen & (1 << f))) f += 1;
    // Reichen fünf Farben nicht (gierig ist nicht optimal, und ein verbogener
    // Spielstand kann beliebig aussehen), wird die letzte doppelt vergeben
    // statt eine sechste zu erfinden: basis.css kennt genau fünf Marken, und
    // ein data-farbe="7" bekäme gar keine Farbe und wäre unsichtbar.
    farben[i] = f < FARBEN ? f : FARBEN - 1;
  }
  // Ein Rechteck ohne jede Zelle im Brett (ganz von einem anderen verdeckt)
  // kommt in `ordnung` vor und bekommt dort seine Farbe; -1 kann hier also
  // nicht mehr stehen. Die Zeile ist die Versicherung dagegen, dass eine -1
  // als data-farbe="-1" im Markup landet und die Fläche unsichtbar macht.
  return farben.map((f) => (f >= 0 ? f : 0));
}

/* -------------------------------------------------------- Flächen zeichnen */

/** Setzt die vier Zahlen, aus denen basis.css Lage und Größe rechnet. */
function setzeMasse(el, r) {
  el.style.setProperty('--x', String(r.x));
  el.style.setProperty('--y', String(r.y));
  el.style.setProperty('--b', String(r.b));
  el.style.setProperty('--h', String(r.h));
}

/**
 * Zeichnet die gesetzten Rechtecke in #teile.
 *
 * `urteile` ist das Array aus pruefeStand() (parallel zu `rechtecke`),
 * `gewaehlt` der Index des hervorzuhebenden Rechtecks oder -1.
 *
 * Die Elemente werden wiederverwendet: erst wird die Anzahl angepasst, dann
 * werden die Werte gesetzt. Der Preis dafür steht hier, damit ihn niemand
 * übersieht — ein Element trägt nach dem Zeichnen GENAU die Klassen, die
 * diese Funktion geschrieben hat. Die beiden flüchtigen Zustände (teil--neu,
 * teil--tipp) muss app.js also NACH dem Zeichnen setzen; würde diese Funktion
 * sie erhalten, blinkte irgendwann eine Fläche als Tipp, die nur das Element
 * eines längst gelöschten Rechtecks geerbt hat.
 *
 * Warum die Lage im Brett hier noch einmal geprüft wird, obwohl pruefeStand()
 * schon Urteile liefert: die Urteile beziehen sich auf Zahl und Fläche, nicht
 * auf den Rahmen. Ein Rechteck, das über den Rand hinausragt, kann für sich
 * 'gut' sein — und stände dann grün im Bild, während der Stand "nicht fertig"
 * meldet. Diese Widersprüchlichkeit ist genau die Art Fehler, die Spieler für
 * einen Fehler des Spiels halten.
 */
export function zeichneTeile(raetsel, rechtecke, urteile, gewaehlt = -1) {
  const teile = holen('teile');
  if (!teile || !raetsel) return;

  const liste = Array.isArray(rechtecke) ? rechtecke : [];
  const urteil = Array.isArray(urteile) ? urteile : null;
  const farben = faerbe(raetsel, liste);

  while (teile.childElementCount > liste.length) teile.lastElementChild.remove();
  while (teile.childElementCount < liste.length) {
    const el = document.createElement('div');
    el.className = 'teil';
    teile.append(el);
  }

  const kinder = teile.children;
  for (let i = 0; i < liste.length; i++) {
    const r = liste[i];
    const el = kinder[i];
    if (!el) continue;
    if (!r) { el.hidden = true; continue; }
    el.hidden = false;

    setzeMasse(el, r);
    el.dataset.i = String(i);
    el.dataset.farbe = String(farben[i]);

    const drin = imBrett(r, raetsel.breite, raetsel.hoehe);
    const gut = drin && (!urteil || urteil[i] === 'gut');
    let klassen = gut ? 'teil teil--gut' : 'teil teil--fehler';
    if (i === gewaehlt) klassen += ' teil--gewaehlt';
    if (el.className !== klassen) el.className = klassen;
  }
}

/* ------------------------------------------------------ Zeiger und Ziehen */

/**
 * Aus einem Zeigerereignis die Zelle rechnen. -> {x, y} oder null.
 *
 * Geklemmt und nicht verworfen: wer an der rechten Randspalte ein Rechteck
 * zieht, hat den Finger regelmäßig neben dem Brett, und das Rechteck soll
 * dann bis zur letzten Spalte gehen und nicht stehen bleiben. Genau dafür
 * wird gerechnet statt gesucht — ein `elementFromPoint` gibt draußen das
 * Brett oder den Körper zurück, und der Zug reißt ab.
 *
 * null kommt nur, wenn es gar nichts zu treffen gibt: kein Brett im Dokument,
 * noch kein Rätsel gebaut, oder ein Brett ohne Ausdehnung (versteckter Reiter,
 * `display: none` im Vorfahren). Ein Aufrufer, der das nicht prüft, würde
 * sonst mit NaN-Koordinaten rechnen, und NaN bricht nirgends laut, sondern
 * malt ein Rechteck, das nicht da ist.
 */
export function zelleAus(ereignis) {
  const brett = holen('brett');
  if (!brett || !ereignis || gebauteBreite < 1 || gebauteHoehe < 1) return null;
  const kasten = brett.getBoundingClientRect();
  if (!(kasten.width > 0) || !(kasten.height > 0)) return null;

  const spalte = Math.floor((ereignis.clientX - kasten.left) / kasten.width * gebauteBreite);
  const zeile = Math.floor((ereignis.clientY - kasten.top) / kasten.height * gebauteHoehe);
  return {
    x: klemme(spalte, 0, gebauteBreite - 1),
    y: klemme(zeile, 0, gebauteHoehe - 1),
  };
}

/** Sind zwei Zellen dieselbe? */
function gleicheZelle(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

/**
 * Hängt die Zeigerbedienung an das Brett.
 *
 * `handler` bekommt vier Ereignisse und eine Unterscheidung, die den ganzen
 * Unterschied macht:
 *
 *   beginn(zelle, ereignis)   der Zeiger ist aufgesetzt
 *   zug(zelle, ereignis)      er ist in eine ANDERE Zelle gewandert
 *   ende(zelle, ereignis)     losgelassen, nachdem er gewandert ist
 *   tipp(zelle, ereignis)     losgelassen, ohne die Startzelle zu verlassen
 *   abbruch()                 der Zug ist weggenommen worden
 *
 * `tipp` und `ende` getrennt zu melden ist der Grund, warum das Spiel keinen
 * zweiten Bedienmodus braucht. Ein Zug über mehrere Zellen ist immer "setze
 * dieses Rechteck"; ein Antippen ist immer "nimm weg, was hier liegt". Beides
 * dieselbe Geste, unterschieden allein daran, ob der Finger die Startzelle
 * verlassen hat — nicht an der Zeit (ein langer Druck ist kein anderer Zug)
 * und nicht an der zurückgelegten Strecke in Pixeln (auf 12×12 ist ein
 * Kästchen 30 Pixel breit, jede Schwelle in Pixeln wäre entweder größer als
 * eine Zelle oder kleiner als das Zittern eines Daumens).
 *
 * setPointerCapture, damit der Zug nicht abreißt: ohne das bekommt das Brett
 * keine Bewegung mehr, sobald der Finger es verlässt, und der letzte
 * gemeldete Punkt bliebe der am Rand. Mit dem Fang laufen auch pointerup und
 * pointercancel hier auf, egal wo der Finger gerade ist.
 *
 * Und trotzdem hängen Bewegung, Loslassen und Abbruch am FENSTER und nicht
 * am Brett. Der Grund ist der Satz zwei Zeilen weiter oben, dass der Fang
 * scheitern DARF: er wird in einem try aufgerufen, weil er wirft, wenn der
 * Zeiger zwischen Ereignis und Aufruf schon weg ist. Ohne Fang bekommt das
 * Brett aber kein pointerup mehr, sobald die Maus außerhalb losgelassen wird
 * — und dann bleibt `zeiger` für immer gesetzt. Das war kein hübscher
 * Randfall, sondern ein totes Brett: das pointerdown steigt bei
 * `zeiger !== null` aus, also nahm das Spiel danach keinen einzigen Zug mehr
 * an, und niemand hätte den Zusammenhang zu einem Mausklick vor zehn Minuten
 * gefunden. Am Fenster kommen die drei Ereignisse in jedem Fall an, mit Fang
 * wie ohne. Doppelt gemeldet wird nichts: nach `beenden()` steht `zeiger`
 * auf null und die Prüfung am Anfang jedes Zuhörers greift.
 */
export function verbindeZiehen(handler) {
  const brett = holen('brett');
  if (!brett || !handler) return;

  let zeiger = null;      // pointerId des laufenden Zuges, null = keiner
  let start = null;       // Startzelle
  let letzte = null;      // letzte gemeldete Zelle
  let gewandert = false;  // hat der Zeiger die Startzelle verlassen?

  const beenden = () => {
    zeiger = null;
    start = null;
    letzte = null;
    gewandert = false;
  };

  brett.addEventListener('pointerdown', (ereignis) => {
    // Ein Finger genügt. Der zweite auf dem Brett würde sonst denselben Zug
    // an zwei Stellen weiterziehen, und welcher gewinnt, hinge daran, welches
    // Ereignis zuletzt kam.
    if (zeiger !== null) return;
    // Rechte Maustaste und Mittelklick sind keine Züge: die eine öffnet ein
    // Menü, die andere scrollt in manchen Browsern.
    if (ereignis.pointerType === 'mouse' && ereignis.button !== 0) return;
    const zelle = zelleAus(ereignis);
    if (!zelle) return;

    zeiger = ereignis.pointerId;
    start = zelle;
    letzte = zelle;
    gewandert = false;
    // Im try, weil der Fang scheitern darf: ein Zeiger, der zwischen
    // Ereignis und Aufruf schon wieder weg ist (Maus aus dem Fenster
    // gezogen), wirft hier. Der Zug läuft danach ohne Fang weiter und ist
    // nur an der Kante ungenauer – ein Absturz wäre der schlechtere Tausch.
    try { brett.setPointerCapture(ereignis.pointerId); } catch { /* ohne Fang */ }
    // Verhindert die Textauswahl beim Ziehen mit der Maus und das Scrollen
    // mit dem Finger. touch-action: none in basis.css deckt den Finger schon
    // ab; der Doppelgriff kostet nichts und der Ausfall einer der beiden
    // Seiten fällt sonst erst auf dem Gerät auf.
    ereignis.preventDefault();
    /*
     * Und weil preventDefault den Fokus mitnimmt, wird er hier von Hand
     * gesetzt.
     *
     * Das war ein Bruch, den man nur im Betrieb sieht: das Brett hat
     * tabindex, hört auf Pfeiltasten, Leertaste und Entf – aber ein
     * pointerdown mit preventDefault gibt ihm den Fokus NICHT, und der
     * Browser lässt ihn auf dem <body> liegen. Wer also erst mit dem Finger
     * oder der Maus ein Rechteck zog und dann zur Tastatur griff, drückte
     * ins Leere: die Tasten kamen nie beim Brett an. Über die Tabulatortaste
     * ging es, aber niemand tabbt in ein Spielfeld, das er gerade
     * angetippt hat.
     *
     * preventScroll, weil der Fokus sonst das Brett in den sichtbaren
     * Bereich ruckt – auf einem kurzen Schirm springt dabei die Seite
     * genau in dem Augenblick, in dem der Finger schon zieht.
     */
    try { brett.focus({ preventScroll: true }); } catch { /* kein Fokus, kein Beinbruch */ }
    handler.beginn?.(zelle, ereignis);
  });

  /*
   * Am Fenster, nicht am Brett — der Grund steht im Kopf dieser Funktion.
   * Beim Ziehen über den Brettrand hinaus rechnet zelleAus() ohnehin und
   * klemmt, es geht also keine Genauigkeit verloren; gewonnen ist, dass ein
   * Zug, der außerhalb endet, auch dann sauber schließt, wenn der Zeigerfang
   * nicht zustande kam.
   */
  window.addEventListener('pointermove', (ereignis) => {
    if (zeiger === null || ereignis.pointerId !== zeiger) return;
    const zelle = zelleAus(ereignis);
    if (!zelle || gleicheZelle(zelle, letzte)) return;
    letzte = zelle;
    if (!gleicheZelle(zelle, start)) gewandert = true;
    handler.zug?.(zelle, ereignis);
  });

  window.addEventListener('pointerup', (ereignis) => {
    if (zeiger === null || ereignis.pointerId !== zeiger) return;
    const zelle = zelleAus(ereignis) ?? letzte ?? start;
    const warGewandert = gewandert;
    // Erst aufräumen, dann melden: der Handler darf neu zeichnen, ein neues
    // Rätsel bauen oder einen Dialog öffnen, und danach ist dieser Zug
    // Geschichte. Der Fang wird ebenfalls vorher gelöst, damit das folgende
    // lostpointercapture den bereits beendeten Zug nicht noch abbricht.
    beenden();
    try { brett.releasePointerCapture(ereignis.pointerId); } catch { /* schon weg */ }
    if (warGewandert) handler.ende?.(zelle, ereignis);
    else handler.tipp?.(zelle, ereignis);
  });

  window.addEventListener('pointercancel', (ereignis) => {
    if (zeiger === null || ereignis.pointerId !== zeiger) return;
    beenden();
    handler.abbruch?.();
  });

  /*
   * Der Fang kann auch ohne pointercancel verloren gehen — ein Anruf, ein
   * Wechsel der App, ein Browser, der bei einer Geste am Bildschirmrand
   * zurückzieht. Dann kommt weder up noch cancel, und ohne diese Zeile stände
   * die Vorschau bis zum nächsten Aufsetzen im Bild.
   */
  brett.addEventListener('lostpointercapture', (ereignis) => {
    if (zeiger === null || ereignis.pointerId !== zeiger) return;
    beenden();
    handler.abbruch?.();
  });

  /*
   * Der lange Druck auf dem Telefon öffnet sonst das Kontextmenü über dem
   * Brett — mitten in einem Zug, der noch nicht zu Ende ist. Auf dem Brett
   * gibt es nichts zu kopieren und nichts zu speichern, also nichts zu
   * verlieren.
   */
  brett.addEventListener('contextmenu', (ereignis) => ereignis.preventDefault());
}
