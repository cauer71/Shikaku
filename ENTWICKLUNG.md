# Shikaku — Aufbau und Entscheidungen

Was in den Dateien selbst steht, steht hier nicht noch einmal. Dieses Dokument
beantwortet die Fragen, die man beim Lesen des Codes an ihn stellt: warum ist
es so geschnitten, was war die naheliegende Alternative, und woran wurde
entschieden.

Das kurze Vorwort dazu: **fast jede Zahl in den Kommentaren ist gemessen.**
Wo eine Entscheidung an einer Vermutung hing, wurde die Vermutung geprüft — und
in mehreren Fällen fiel sie durch. Diese Fälle stehen ausdrücklich dabei, weil
sie die eigentliche Begründung sind.

## Der Schnitt

```
                    ┌──────────────┐
                    │  index.html  │  Gerüst, Kennungen, Dialoge
                    └──────┬───────┘
                           │
        ┌──────────────────┴──────────────────┐
        │              app.js                 │  Zustand, Uhr, Undo, Dialoge
        └──┬────────┬──────────┬──────────┬───┘
           │        │          │          │
      ┌────▼───┐ ┌──▼─────┐ ┌──▼─────┐ ┌──▼──────┐
      │brett.js│ │erzeuger│ │loeser  │ │online.js│──▶ worker.js ──▶ D1 „spiele“
      └────────┘ └───┬────┘ └───┬────┘ └─────────┘
       Ansicht +     └────┬──────┘
       Zeiger        ┌────▼─────┐
                     │shikaku.js│  Modell und Regeln, rein
                     └──────────┘
```

Die Linie, die zählt, ist die untere: `shikaku.js`, `loeser.js` und
`erzeuger.js` kennen **kein DOM und kein Netz**. Sie nehmen Daten und geben
Daten. Das ist nicht Ordnungsliebe, sondern die Bedingung dafür, dass die
Eigenschaftstests überhaupt möglich sind: 40 Rätsel je Stufe erzeugen und jedes
gegen einen zweiten Löser prüfen geht in Node in einer Sekunde und im Browser
gar nicht.

`brett.js` und `app.js` sind bewusst getrennt, obwohl beide „Oberfläche" sind:
`brett.js` weiß, wie ein Rechteck auf dem Schirm aussieht und wie aus einer
Zeigerposition eine Zelle wird, `app.js` weiß, was ein Zug bedeutet. Der Schnitt
liegt dort, wo man beim Lesen sonst dauernd hin- und herspringt.

## Warum der Löser das Fundament ist

Ein Shikaku mit zwei Lösungen ist kaputt — und zwar auf die schlimmste Art: der
Spieler zeichnet eine gültige Zerlegung, das Spiel sagt „falsch", und er hat
keine Möglichkeit, das zu widerlegen. Er sucht dann den Fehler bei sich.

Der Erzeuger gibt darum nichts heraus, was nicht durch `eindeutig()` gegangen
ist. Damit hängt die Richtigkeit des ganzen Spiels an dieser einen Funktion.

### Die Modellierung: eine exakte Überdeckung mit nur einer Bedingungsart

Für jede Zahl gibt es eine endliche Menge möglicher Rechtecke. Gesucht ist eine
Auswahl von genau einem Kandidaten je Zahl, die jede Zelle genau einmal deckt.

Der Kniff steckt in der Kandidatenmenge: jeder Kandidat einer Zahl enthält seine
eigene Zahl und **keine fremde**. Damit kann die Zelle, auf der eine Zahl steht,
nur von Kandidaten dieser Zahl gedeckt werden — und „jede Zahl bekommt genau ein
Rechteck" ist keine zusätzliche Bedingung mehr, sondern folgt aus „jede Zelle
wird genau einmal gedeckt". Eine Bedingungsart statt zwei, ein Zähler statt
zwei.

**Verworfen: Knuths Dancing Links.** Das ist der Standardweg für exakte
Überdeckungen und wäre bei 12 × 12 auch schnell genug. Er trägt aber nichts zu
dem bei, was hier zusätzlich gebraucht wird: der **Tipp** muss sagen, mit
*welcher* Überlegung der nächste Zug zu finden ist, und die **Schwierigkeit**
wird daran gemessen, welche Überlegungen nötig waren. Dancing Links kennt keine
Überlegungen, es kennt nur Spalten mit der kleinsten Anzahl. Also flache
Zähl-Arrays mit einer Rückspur — dieselbe Wirkung, aber die Zwischenschritte
bleiben benennbar.

### Die drei Techniken

Es sind genau die, die ein Mensch am Papier auch anwendet:

- **einzigerKandidat** — eine Zahl hat nur noch ein mögliches Rechteck.
- **einzigeDeckung** — eine freie Zelle lässt sich nur noch von einem einzigen
  Kandidaten überhaupt decken.
- **ausschluss** — ein Kandidat scheidet aus, weil er eine Zelle unerreichbar
  machen würde: nach seinem Setzen gäbe es für irgendeine Zelle keinen
  Kandidaten mehr.

`logischLoesen()` wendet nur diese an und rät nie. Ob es damit durchkommt, ist
die Grundlage für zwei Dinge: die Schwierigkeit (`bewerteSchwierigkeit()`
gewichtet die Techniken und stuft an festen Grenzen ein) und die Zusage, dass
Leicht und Mittel ohne Raten lösbar sind.

### Woran sich das Vertrauen stützt

Propagation und Verzweigung schneiden Möglichkeiten weg. Schneidet eine Regel
einmal zu viel weg, meldet der Löser ein mehrdeutiges Rätsel als eindeutig. Ein
Test, der prüft, dass ein von Hand gerechnetes Rätsel richtig gelöst wird,
findet so einen Fehler **nicht** — er tritt auf den Brettern auf, an die niemand
gedacht hat.

Darum gibt es einen zweiten, bewusst dummen Zähler: Zahlen in fester
Reihenfolge, jeder Kandidat der Reihe nach, bei Überlappung verwerfen, am Ende
die restlosen Deckungen zählen. Keine Propagation, keine Verzweigungsregel,
keine Bitmasken — nichts, was ein gemeinsamer Denkfehler sein könnte.

| Prüfung | Umfang | Ergebnis |
|---|---|---|
| Lösungszahl und -menge | 4000 Bretter 2×2–6×6, alle Lösungen bis 30 (1029-mal genau zwei) | kein Unterschied |
| Eindeutigkeitsurteil | 360 Bretter 8×8–12×12, davon 284 mehrdeutig | kein Unterschied |
| Jeder logische Schluss gegen *alle* Lösungen seines Brettes | 1200 Bretter, 5957 Schlüsse | kein unsounder Schluss |
| Jeder weggeworfene Kandidat gegen *alle* Lösungen | 3000 Bretter, 3253 Ausschlüsse | keiner kam in einer Lösung vor |
| Bitmasken-Ausschluss gegen naive Dreifachschleife | 1406 Runden, 11124 Kandidaten, bis `wk = 8` | null Rundenunterschied |

Der dumme Gegenlöser ist kein Wegwerfstück: er ist der Grund, warum man dem
schnellen glauben kann.

## Der Erzeuger

Drei Schritte: zerlegen, Zahlen platzieren, prüfen.

**Zerlegen** — Zellen aus einer gemischten Reihenfolge nehmen, von jeder freien
Zelle ein zufälliges Rechteck in den freien Bereich wachsen lassen,
Kantenlängen und Fläche nach `AUSMASS` begrenzen. Danach eine **Aufräumrunde**,
die Einzelzell-Splitter mit einem Nachbarn verschmilzt, wenn dabei wieder ein
Rechteck entsteht. Diese Runde ist der Grund, warum die Zerlegung überhaupt
durchkommt: ohne sie bleiben zu viele Einser übrig, und ein Brett voller Einsen
ist kein Rätsel. Gemessen liefern 500 von 500 Aufrufen je Ausmaß eine gültige
Zerlegung.

**Zahlen platzieren** — und hier fiel die naheliegende Annahme durch. Die
Vermutung war: eine Zahl in der Ecke ihres Rechtecks bindet stärker als eine in
der Mitte, also führt „möglichst in die Ecke" schneller zur Eindeutigkeit.
Gemessen ist es anders:

| Zahlenlage | Anteil eindeutig |
|---|---|
| alle in der linken oberen Ecke | 100 % |
| alle in der Mitte | 84–91 % |
| gemischt | 29–40 % |

Der Hebel ist also die **Einheitlichkeit**, nicht die Ecke. Und genau darum ist
sie unbrauchbar: liegt jede Zahl in ihrer linken oberen Ecke, dann trägt die
erste unzugeordnete Zelle in Leserichtung *immer* eine Zahl — das Rätsel verrät
seine Lösung. Also wird gesucht: über die Zahlpositionen, nicht über neue
Zerlegungen. Das ist der billigere Hebel, und die Suche wählt die zu
verschiebende Zahl aus der **zweiten** Lösung — dort, wo sich die beiden
Lösungen unterscheiden, ist die Mehrdeutigkeit. Ohne diesen Kniff steigt
Experte von 1,07 ms auf 6,96 ms im Mittel und von 4,4 ms auf 35,2 ms im
schlechtesten Fall.

**Prüfen** — `eindeutig()`, und für Leicht und Mittel zusätzlich, dass
`logischLoesen()` ohne Raten durchkommt.

### Gemessene Erzeugungszeit

Node 22 auf einem Kern, je Stufe 60 Seeds:

| Stufe | Raster | Mittel | Median | schlechtester | Zerlegungen |
|---|---|---|---|---|---|
| Leicht | 6 × 6 | 0,44 ms | 0,29 ms | 2,6 ms | 1,00 |
| Mittel | 8 × 8 | 0,51 ms | 0,32 ms | 4,2 ms | 1,00 |
| Schwer | 10 × 10 | 0,93 ms | 0,64 ms | 4,5 ms | 1,00 |
| Experte | 12 × 12 | **1,07 ms** | 0,86 ms | **4,4 ms** | 1,00 |

„Zerlegungen 1,00" heißt: jedes der geprüften Seeds kam mit der **ersten**
Zerlegung aus, die Zahlplatz-Suche allein hat es geschafft. Der Notausgang —
ein leichteres Ausmaß probieren — wurde nie erreicht. Kalt im frischen Prozess
sind es 3,1 bis 7,8 ms plus 7 ms Modulladen; im Browser gemessen 8 bis 28 ms.
Selbst mit dem Faktor 10, den ein älteres Telefon kostet, bleibt der
schlechteste Fall bei 44 ms.

Determinismus ist Pflicht: `zufall(seed)` ist die einzige Zufallsquelle, und
dasselbe `(stufe, seed)` ergibt dasselbe Rätsel — auch nach einem Fehlversuch
mit Neuanlauf. `Math.random` und `Date.now` kommen im Kern nicht vor.

## Die Grenzen nach außen

Es gibt vier, und an jeder gilt dieselbe Regel: **auf dem Typ bestehen, nicht
umrechnen.** `Number('')` ist 0 und `Number(null)` auch — beides wäre eine
gültige Zeit. `String(['mittel'])` ist `'mittel'` — ein Array wäre als Stufe
durchgegangen.

| Grenze | Prüfstelle |
|---|---|
| `POST /api/partie` | `pruefePartie()` in `worker.js` |
| Antwort der Schnittstelle | `uebernehmen()`, `besteListe()` in `online.js` |
| `localStorage` | `liesEinstellungen()`, `holeSpiel()` in `app.js` |
| Adresse (`?neu=`, `?seed=`) | beim Start in `app.js` |

Die Prüffunktionen sind ausdrücklich exportiert, damit sie sich in Node prüfen
lassen — hier geht Fremdes in die Datenbank und in die Anzeige über, und was
hier durchrutscht, steht anschließend in der Weltliste oder im Markup.

Drei Löcher, die das adversariale Gegenlesen dort gefunden hat, sind
lehrreich genug, um sie zu nennen:

- **Prototyp-Verschmutzung über den Stufennamen.** `JSON.parse` legt
  `__proto__` als *eigene* Eigenschaft an, `Object.entries` gibt ihn also
  heraus — die Zuweisung `zettel.rekorde[stufe] = …` ruft dann aber den Setzer
  von `Object.prototype`. Der Merkzettel erbte danach Werte, die niemand
  eingetragen hat. Behoben mit einer Erlaubnisliste (`STUFEN.includes`), die
  zugleich das zweite Loch derselben Zeile schließt: jeder erfundene Name legte
  eine echte Stufe an, 5000 in einer Antwort ließen den Merkzettel über die
  Speicherquote wachsen.
- **Jede 200er-Antwort galt als Weltstand.** `Response('"ok"', {status:200})`
  — ein Anmeldeportal im Hotel-WLAN — war ein gültiger „Stand". In `lesen()`
  hieß das fünf Minuten „gerade geholt" für Zahlen, die nie kamen; in
  `partieBeendet()` hieß es `gezaehlt: true`, und die Partie wurde **nie**
  nachgezählt. Der Kommentar behauptete beides schon richtig, der Code tat es
  nicht.
- **`pruefeRaetsel` starb an der Eingabe, die es abfangen soll.** Es legte vor
  jeder inhaltlichen Prüfung `new Int16Array(breite*hoehe)` an — bei
  `{breite: 100000, hoehe: 100000}` ein `RangeError`, der `loesen`,
  `logischLoesen` und `naechsterZug` mitnahm. Der Weg dorthin ist genau der,
  für den die Prüfung existiert: ein Spielstand aus dem `localStorage` oder
  eine geteilte Adresse.

## Eine Datenbank für alle Spiele

Die Rangliste liegt nicht mehr in einer eigenen Datenbank `shikaku`, sondern
zusammen mit den anderen Spielen in `spiele`. Der Grund ist eine Zählweise:
**D1 zählt im Free-Tarif Datenbanken und nicht Tabellen**, zehn sind das Limit
— und es kommt etwa alle vier Tage ein Spiel dazu. Eine Datenbank je Spiel
hätte das Limit in gut einem Monat erreicht, und der Preis wäre nicht das
ausbleibende nächste Spiel gewesen, sondern das Abräumen eines bestehenden.
Tabellen sind dagegen unbegrenzt.

Die naheliegende Alternative — auf den bezahlten Tarif wechseln — ist
verworfen, weil sie laufende Kosten für ein Problem aufwirft, das eine
Umbenennung löst. Die zweite Alternative, die Ranglisten aller Spiele in *eine*
Tabelle mit einer Spalte `spiel` zu legen, ist verworfen, weil die Spiele
verschiedene Formen haben: hier entscheidet eine kleine Zeit, in Zehner-Paare
eine große Punktzahl, und die Spalten sind andere. Eine gemeinsame Tabelle wäre
entweder halb leer oder voller Sonderfälle gewesen.

Bezahlt wird mit dem Präfix `shikaku_` vor jedem Tabellen- und Indexnamen. Der
ist an zwei Stellen **nötig** und nicht bloß ordentlich:

- `zaehler` hieß in Zehner-Paare dieselbe Tabelle wie hier, mit denselben
  Zeilen `spiele` und `siege`. Ungetrennt hätten sich die beiden Spiele
  gegenseitig hochgezählt, und beide hätten eine falsche Weltzahl angezeigt —
  ohne dass irgendwo ein Fehler aufgetreten wäre.
- **Indexnamen sind in SQLite je Datenbank eindeutig, nicht je Tabelle.** Zwei
  Spiele mit einem Index `bestzeiten_rangliste` hätten sich beim Anlegen
  gegenseitig abgewiesen. Darum heißt er `shikaku_bestzeiten_rangliste`.

Aus demselben Grund heißt die Migrationsdatei `0001_shikaku.sql` und nicht
`0001_schema.sql`: wrangler führt in `d1_migrations` je **Datenbank** Buch,
welche Migration schon lief, und zwar über den **Dateinamen**. Zwei Projekte
mit je einem `0001_schema.sql` heißt, dass wrangler das zweite für angewandt
hält und es **stillschweigend überspringt** — kein Fehler, keine Meldung, nur
fehlende Tabellen. Ein `migrations_table`, mit dem sich das je Projekt trennen
ließe, gibt es nicht (nachgesehen: weder in der Konfiguration noch als Flag),
der Dateiname ist also der einzige Unterscheider.

Jede Anweisung in der Migration trägt `IF NOT EXISTS`. Das Schema steht in
`spiele` bereits; die Datei muss folgenlos durchlaufen können und dieselbe
Datei muss eine frische Datenbank vollständig anlegen.

Die alte Datenbank `shikaku` bleibt vorerst unberührt stehen — sie ist der
Rückfall, falls am geteilten Bestand etwas nicht stimmt. **Übernommen wird von
dort nichts:** eine Migration läuft immer in *einer* Datenbank und kann die
andere nicht lesen, und ein roher Export von drüben trüge die alten,
präfixlosen Namen wieder herein — also genau die Kollision, die der Präfix
verhindert. Die Rangliste in `spiele` fängt darum leer an.

## Die Oberfläche

### Treffererkennung rechnet, sie sucht nicht

`#brett` fängt alle Zeigerereignisse, und aus `clientX/clientY` und
`getBoundingClientRect()` wird die Zelle berechnet. `elementFromPoint` und ein
`pointerenter` je Zelle wären der naheliegende Weg und versagen beide, sobald
der Finger über den Brettrand hinausgeht — und genau das passiert beim Ziehen an
der Kante ständig.

Dazu gehört ein Fund, der ohne echten Browser nicht zu sehen war:
`pointerup`/`pointercancel` hingen am Brett. `setPointerCapture` darf scheitern
(er steht selbst in einem `try`), und dann bekommt das Brett kein `pointerup`,
wenn außerhalb losgelassen wird — der Zeigerzustand blieb gesetzt, und das
Brett nahm für den Rest der Sitzung **keinen einzigen Zug** mehr an, ohne
Meldung und ohne erkennbaren Zusammenhang. Die Ereignisse hängen jetzt am
`window`.

### Die Uhr

Die Zeit kommt aus `Date.now()`-Differenzen, das Intervall zeichnet nur. Ein
`setInterval` als Zeitquelle driftet, und auf einem Telefon, das den Tab
schlafen legt, driftet es um Minuten. Die Uhr hält bei verstecktem Tab und im
offenen Dialog.

### Farben, die nicht springen

Die Farbe eines Rechtecks kommt aus einer Greedy-Färbung über den
Nachbarschaftsgraphen, in fester Reihenfolge nach Position — **nicht** nach
Einfügereihenfolge. Sonst wechseln alle Farben, wenn man ein Rechteck löscht
und neu zieht, und das sieht aus wie ein Fehler.

### Zwei Messungen, die eine Vermutung widerlegt haben

Beide beim eigenen Nachprüfen am Bild gefunden, nachdem der Code schon stand:

- **Der freie Platz gehörte ins Spielfeld, nicht über die Kärtchen.** Ein
  quadratisches Brett auf 390 × 844 ist von der Breite begrenzt, also bleiben
  rund 200 px Höhe übrig. Sie wurden mit `margin-top: auto` an `.hud` *und*
  `.leiste` verteilt, damit der Spielblock im Daumenbereich liegt. Nachgemessen
  hält das nicht: das Brett stand mit den zwei automatischen Rändern bei
  y = 287..653 und ohne sie bei genau denselben y = 287..653. Der Daumen gewann
  nichts, bezahlt wurde es mit 96,66 px Leere unter dem Titel — die sich im
  Bild nicht als Absicht liest, sondern als vergessener Abstand.
- **Der Hinweisbalken erreichte seine `max-width` nie.** Ein festbezogener
  Kasten ohne eigene Breite passt sich seinem Inhalt an, und der Raum dafür
  reicht von `left` bis zum rechten Rand. Mit `left: 50%` war das die *halbe*
  Fensterbreite: gemessen 195 px von 390, bei erlaubten 358,8 px. Der längste
  Satz des Spiels stand in fünf Zeilen und lag als hoher Klotz über dem Brett.
  Beidseitig verankert sind es drei Zeilen.

## Die Prüfwerkzeuge

`npm test` allein reicht für dieses Projekt nicht, weil zwei Arten von Bruch
kein Test bemerkt:

- **`tools/check-dom.mjs`** — `index.html` und `app.js`/`brett.js` sind über
  Kennungen verbunden. Ein Tippfehler darin ist ein stiller `null`-Zugriff, den
  kein Test findet und der erst auffällt, wenn ein Knopf nichts tut. Das
  Werkzeug zieht alle gesuchten Kennungen aus dem Quelltext und gleicht sie ab.
- **`tools/check-i18n.mjs`** — dasselbe für Textschlüssel, in beide Richtungen:
  ein Schlüssel im Markup, den es nicht gibt (Fehler), und ein Schlüssel im
  Wörterbuch, den niemand benutzt (Hinweis).

Dazu die Eigenschaftstests im Kern: sie prüfen nicht *ein* Rätsel, sondern
*jedes* — für 40 Seeds je Stufe gilt, dass die Summe der Zahlen die Fläche ist,
jede Zelle genau einmal gedeckt wird, jedes Rechteck genau eine Zahl enthält,
die Fläche der Zahl entspricht und `eindeutig()` hält. Ein einzelnes von Hand
gerechnetes Beispiel — es gibt auch die, unter anderem das 7 × 7 aus dem
Vorbild mit 5 + 12 + 9 + 9 + 8 + 3 + 3 = 49 — prüft, dass der Löser richtig
rechnet. Die Eigenschaftstests prüfen, dass er es auf Brettern tut, an die
niemand gedacht hat.

## Was offen ist

- **`naechsterZug` auf einem Brett, das der logische Löser nicht schafft**,
  zeigt das Rechteck der Zahl mit den wenigsten Möglichkeiten und begründet es
  mit `tipp.ausschluss`. Der Zug stimmt (er kommt aus der echten Lösung), die
  Begründung ist großzügig. Die Alternative wäre `null` und `tipp.keiner` —
  dann tut der Tipp-Knopf auf Experte gelegentlich nichts. Wer es anders will,
  ändert eine Stelle.
- **Schwer und Experte dürfen Raten verlangen, tun es aber selten** (gemessen
  2 von 200). Eine Untergrenze wird nicht erzwungen: ein Rätsel absichtlich
  schwerer zu machen, als der Zufall es hergibt, hätte den Erzeuger deutlich
  langsamer gemacht, und der Unterschied wäre für den Spieler kaum zu merken.
- **Echte Nebenläufigkeit** (zwei gleichzeitige `POST`) ist nicht gemessen,
  sondern nur aus dem SQL abgeleitet. Der Vergleich steht im `WHERE` derselben
  Anweisung — dass das genügt, ist eine Zusage von SQLite, keine Beobachtung
  aus einem Lasttest. Der UPSERT selbst ist dagegen gegen die echte Datenbank
  belegt: eine langsamere Zeit desselben Kürzels lässt Zeit, Fehler und Tipps
  unberührt.
- **Die Oberfläche ist nicht gegen die veröffentlichte Seite geprüft**,
  sondern nur gegen `dist/` hinter einem örtlichen Server. Der Grund ist die
  Umgebung: ein echter Browser kommt von hier aus nicht an `shikaku.auer.page`
  (der Proxy bricht die Verbindung ab), `curl` schon. Die Schnittstelle ist
  darum live geprüft, das Brett nicht. Genau dafür gibt es bei
  `zehner-paare` einen eigenen Workflow, der auf einem GitHub-Läufer läuft —
  der wäre hier der nächste Schritt.

## Was dabei live geprüft ist

Nach dem Ausliefern an der echten Schnittstelle nachgemessen, nicht abgeleitet:

- Alle Dateien werden ausgeliefert, `worker.js`, `package.json`, `README.md`
  und die Testdateien dagegen **nicht** (404) — die Regel in
  `build-dist.mjs` greift also.
- Ein unbekannter Pfad bekommt die eigene 404-Seite, nicht `index.html`
  mit Status 200. Das ist der Grund für `not_found_handling: "404-page"`.
- `GET /api/welt` antwortet aus D1.
- Eine gewonnene Partie **ohne** Kürzel zählt nur mit und schreibt keine
  Zeile. Mit Kürzel entsteht eine, und eine langsamere Zeit desselben
  Kürzels ändert danach nichts.
- Die Prüfungen weisen ab, was sie abweisen sollen: zu schnell für die Stufe,
  erfundene Stufe, Sekunden als Zeichenkette, vierstelliges Kürzel. Ein
  `__proto__` im Körper läuft ins Leere.

Die Testdaten sind hinterher gelöscht und die Zähler zurückgesetzt — die
Weltzahlen fangen bei null an.
