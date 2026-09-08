# Shikaku — das Rechteck-Rätsel

Das japanische Logikrätsel von Nikoli („in Rechtecke schneiden", auch *Divide
by Squares* oder *Rectangles*) als eigenständige Web-App. Keine
Abhängigkeiten, kein Bundler, kein Build-Schritt für das Spiel selbst: die
Dateien sind das, was der Browser lädt.

**Die Regel in einem Satz:** Zerlege das Raster restlos in Rechtecke — in jedem
Rechteck steht genau eine Zahl, und die Zahl sagt, aus wie vielen Kästchen es
besteht.

Daraus folgt alles andere. Jedes Kästchen gehört am Ende zu genau einem
Rechteck, keine Lücken, keine Überlappungen, und die Summe aller Zahlen ist
deshalb immer so groß wie das ganze Raster. Die Zahl ist die **Fläche**, nicht
die Kantenlänge: eine 6 kann 1×6, 2×3, 3×2 oder 6×1 sein, und welche Form
bleibt, entscheiden die Nachbarn.

## Spielen

**https://shikaku.auer.page** — dort läuft es, samt gemeinsamer Rangliste.
Die Adresse des Workers selbst ist
`https://shikaku.christian-auer-71.workers.dev`; sie tut dasselbe und ist der
Weg, wenn man den eigenen Namen einmal umhängt.

Örtlich:

```
npm run build && cd dist && python3 -m http.server 4173
```

Oder als **einzelne Datei**, ohne Server:

```
npm run einzeldatei     # legt shikaku.html an, ~374 KB
```

Die lässt sich per Doppelklick öffnen, verschicken oder auf einen Stick legen —
das ganze Spiel steckt darin. Nur die Weltrangliste fehlt (die braucht den
Worker); die eigenen Bestzeiten laufen weiter.

Jedes Rätsel wird neu erzeugt und ist **eindeutig lösbar** — das ist geprüft,
nicht gehofft: der Erzeuger lässt kein Rätsel heraus, für das der Löser mehr
als eine Lösung findet.

| Stufe | Raster | Kästchen | längste Kante | größte Zahl |
|---|---|---|---|---|
| Leicht | 6 × 6 | 36 | 4 | 8 |
| Mittel | 8 × 8 | 64 | 5 | 12 |
| Schwer | 10 × 10 | 100 | 6 | 16 |
| Experte | 12 × 12 | 144 | 7 | 20 |

**Leicht und Mittel sind ohne Raten lösbar.** Das ist eine Zusage des
Erzeugers und keine Beobachtung: er verwirft ein Rätsel, das der logische
Löser nicht mit Schlüssen durchbekommt. Auf Schwer und Experte darf ein Rätsel
eine Stelle enthalten, an der man eine Möglichkeit durchprobieren muss —
eindeutig bleibt es trotzdem.

### Bedienung

- **Ziehen** — mit dem Finger oder der Maus von einer Ecke zur anderen. Das
  Rechteck wächst mit, und die Vorschau zeigt schon während des Zugs, ob es
  passt.
- **Antippen** — ein Rechteck antippen löscht es. Es gibt keinen zweiten
  Modus und keinen Radiergummi-Knopf: ein Zug über eine Zelle ist ein neues
  Rechteck, ein Tippen darauf nimmt es weg.
- **Überschreiben** — zieht man über bestehende Rechtecke, verschwinden sie.
  Man muss nicht erst aufräumen, um seine Meinung zu ändern.
- **Tastatur** — Pfeiltasten bewegen den Zellcursor, Leertaste oder Enter
  beginnt und beendet die Auswahl, Escape bricht ab, Entf löscht das Rechteck
  unter dem Cursor, `z` nimmt zurück, `Umschalt+z` oder `y` wieder vor.
- **Tipp** — setzt das nächste Rechteck, das sich logisch erzwingen lässt, und
  sagt dabei, *warum* es erzwungen ist („Für die Zahl 8 bleibt nur noch dieses
  Rechteck"). Liegt ein falsches Rechteck auf dem Brett, sagt er stattdessen,
  dass aufgeräumt werden muss. Tipps werden gezählt und stehen am Ende dabei.

### Adressen

- `?neu=leicht` … `?neu=experte` — startet sofort eine Partie dieser Stufe.
  Genau das benutzen die Verknüpfungen des installierten Programms.
- `?seed=a3f9c1` — erzeugt **genau dieses** Rätsel wieder. Dasselbe Seed ergibt
  immer dasselbe Raster; damit lässt sich ein Rätsel weitergeben oder ein
  Fehler nachstellen.

## Auf Cloudflare veröffentlichen

Vorbereitet für **Cloudflare Workers mit statischen Assets** — die für neue
Projekte empfohlene Betriebsart; Pages ist der ältere Weg.

```bash
npx wrangler login          # einmalig
npm run build               # dist/ zusammenstellen
npm run deploy              # bauen und veröffentlichen
```

Es wird nichts installiert: die Skripte rufen `npx wrangler@latest` auf. Das
Spiel selbst bleibt ohne Abhängigkeiten.

Die Domain hängt am Worker und steht bewusst **nicht** in `wrangler.jsonc`:
so lässt sie sich ändern, ohne den Code anzufassen. `shikaku.auer.page` ist
angelegt (Workers → shikaku → Settings → Domains & Routes); der DNS-Eintrag
entsteht dabei von selbst, weil `auer.page` im selben Konto liegt.

Eine Stelle nennt die Adresse doch, und sie muss mitwandern: `AUSWAERTS` in
`online.js`. Das ist der Fall „das Spiel liegt auf GitHub Pages" — dort steht
keine Schnittstelle daneben, der Ruf muss also über Kreuz gehen, und der Worker
antwortet dafür mit offenem CORS. Solange das Spiel nur unter seiner eigenen
Domain läuft, wird die Konstante nie benutzt.

### Was ausgeliefert wird

Nicht das Wurzelverzeichnis, sondern `dist/` — zusammengestellt von
`tools/build-dist.mjs`. Zwei Gründe, beide aus der Praxis der
Vorgängerprojekte:

- `wrangler` legt sein eigenes `.wrangler/` in den Projektordner. Liegt der
  Ordner zugleich unter Beobachtung, lädt der lokale Server endlos neu.
- Werkzeuge, Tests, README und `package.json` haben auf der Spielseite nichts
  verloren. Öffentlich sind sie ohnehin, ausgeliefert müssen sie nicht sein.

Kopiert wird nach einer **Regel** und nicht nach einer Liste: alle Dateien der
obersten Ebene mit den Endungen `.html`, `.js`, `.css`, `.webmanifest`, ohne
`*.test.js` und ohne `worker.js`, dazu `icons/` vollständig. Eine Liste müsste
man pflegen, und eine neue CSS-Datei wäre irgendwann vergessen.

`worker.js` fällt ausdrücklich heraus: das ist Servercode, den Cloudflare
bündelt und ausführt. Als ausgelieferte Datei danebenzuliegen wäre bestenfalls
verwirrend — und `tools/build-dist.mjs` prüft, dass er nicht mitgeht.

### Die Kopfzeilen und die CSP

`_headers` schreibt fest, dass die App nichts von außen lädt: keine fremde
Schrift, kein fremdes Bild, kein fremdes Skript. Käme je eine externe Quelle
hinzu, bricht sie sichtbar, statt still zu laden.

Der einzige eingebettete `<script>`-Block ist der Startschnipsel im `<head>`,
der Skin, Farbschema und Sprache vor dem ersten Bild setzt. Er braucht *kein*
`'unsafe-inline'`: `tools/build-dist.mjs` rechnet beim Zusammenstellen den
SHA-256 jedes Inline-Skripts aus und setzt ihn in die CSP ein. Damit läuft
genau der Code, der in der Datei steht — eingefügtes Skript hätte eine andere
Prüfsumme und würde nicht ausgeführt.

### Gemeinsame Rangliste (D1)

Datenbank `shikaku` (Cloudflare D1, Region Westeuropa), gebunden als `DB`.

```bash
# Schema anwenden (einmalig)
npx wrangler d1 migrations apply shikaku --remote
```

Zwei Tabellen, zwei Adressen:

```
GET  /api/welt      Weltrekord je Stufe, Bestenliste je Stufe, die Zähler
POST /api/partie    eine beendete Partie — zählt mit, trägt eine Bestzeit ein,
                    und antwortet mit demselben Stand wie /api/welt
```

Der zweite Ruf nach einer Partie entfällt damit. Alles andere geht an die
statischen Dateien; der Worker läuft nur für `/api/`.

**Eine Zeile je Kürzel und Stufe**, in ihr immer die schnellste Zeit. Das ist
der Unterschied zu Zehner-Paare, wo die Tabelle jeden Rekord aufhebt und mit
jeder Partie wächst: hier ist sie von Natur aus beschränkt — höchstens 36³
Kürzel mal vier Stufen — und braucht kein Aufräumen, keine Verfallsfrist und
keinen Cron-Auftrag. Der Weltrekord einer Stufe ist die erste Zeile ihrer
Liste, der Rang eines Kürzels ein Zählen bis dorthin, und ein Index beantwortet
alle drei Fragen.

Der Vergleich steht im `WHERE` derselben Anweisung, die einfügt:

```sql
INSERT INTO bestzeiten (kuerzel, stufe, sekunden, fehler, tipps, wann)
VALUES (?1, ?2, ?3, ?4, ?5, ?6)
ON CONFLICT(kuerzel, stufe) DO UPDATE SET …
WHERE excluded.sekunden < bestzeiten.sekunden
```

Lesen, Vergleichen und Schreiben passieren damit in einem Satz. Zwei Spieler,
die im selben Augenblick fertig werden, können sich nicht gegenseitig
überschreiben — genau das war der Grund, überhaupt eine Datenbank zu nehmen.

**Was diese Rangliste nicht kann:** Sie hat keine Konten. Wer die Adresse
kennt, kann Zeiten senden — gegen Falscheinträge ist eine offene Rangliste
nicht absicherbar, und das steht auch so in der Oberfläche. Geprüft wird, was
prüfbar ist:

- Kürzel: bis drei Zeichen aus `A–Z` und `0–9`. Ein viertes Zeichen wird
  **abgewiesen** und nicht abgeschnitten — aus `ABCD` würde sonst `ABC`, und
  die Zeit landete auf der Zeile eines anderen Spielers.
- Zeit: ganze Sekunden, höchstens ein Tag, und **je Stufe** eine untere
  Schranke (10 / 15 / 25 / 35 s). Ein 6×6 in elf Sekunden ist möglich, ein
  12×12 nicht.
- Fehler und Tipps: 0–999.
- Stufe: aus der bekannten Liste. Ein erfundener Name kommt weder in die
  Tabelle noch als Objektschlüssel in die Antwort.
- Ratenbegrenzung je Absender, Schreiben knapper als Lesen (10 bzw. 60 je
  Minute). Fehlt das Binding — lokal, im Trockenlauf —, geht die Anfrage durch:
  eine Bremse, die bei einer Störung das Spiel lahmlegt, wäre schlechter als
  keine.
- Bei `POST` wird die Herkunft geprüft: ein fremder Origin wird abgewiesen,
  ein fehlender geht durch (der beweist nichts).

**Ohne Kürzel wird nur gezählt.** Wer keines setzt, erscheint nicht in der
Liste — eine Zeile ohne Namen könnte niemand halten, und alle namenlosen
Meldungen hätten denselben Primärschlüssel. Der Schalter *Weltrangliste* in den
Einstellungen schaltet jeden Netzruf ab, nicht nur das Senden.

**Fällt die Datenbank aus, bleibt das Spiel unverändert spielbar.** Es fehlen
dann die Weltwerte, und die letzten bekannten stehen weiter da. `online.js`
verschluckt jeden Fehler und gibt `null` zurück; die Rangliste darf das Spiel
nie aufhalten und nie mit einer Meldung stören.

## Gestaltung

Der Leitgedanke ist keine Dekoration, sondern die Sache selbst: **Shikaku ist
Mondrian.** Das Rätsel *ist* eine Flächenteilung in Rechtecke — genau das, was
De Stijl gemalt hat. Der Standard-Skin macht das sichtbar: weißer Grund, harte
schwarze Rasterlinien, die fertigen Rechtecke in Zinnoberrot, Kobaltblau,
Chromgelb, Grauweiß und Schwarz, die Zahlen in einem sehr fetten geometrischen
Schnitt. Dunkel wird der Grund zu tiefem Anthrazit, die Grundfarben bleiben.

Drei Skins, jeder hell und dunkel:

| Skin | Anmutung |
|---|---|
| `mondrian` | De Stijl. Der Auftritt des Spiels. |
| `papier` | Warmes Papier, pastellige Flächen, Bleistiftlinien. Ruhig fürs lange Spiel. |
| `m3` | Material 3, damit es neben Zehner-Paare steht. |

*Auto* folgt der Einstellung des Geräts. Eine bewusste Wahl schreibt
`data-theme` und gewinnt dann in beide Richtungen.

Die Farbe eines Rechtecks ist **nicht zufällig**, sondern aus einer
Greedy-Färbung über den Nachbarschaftsgraphen abgeleitet, in fester Reihenfolge
nach Position. Dasselbe Rätsel sieht damit immer gleich aus, benachbarte
Rechtecke bekommen nie dieselbe Farbe, und die Farben springen nicht, wenn man
eines löscht und neu zieht.

Weiteres, das nicht verhandelbar war:

- **Mobil zuerst**, 390 × 844 ist der Maßstab. Das Brett füllt die Breite und
  bleibt quadratisch, die Werkzeugleiste liegt unten in Daumenreichweite,
  `env(safe-area-inset-*)` wird beachtet. Auf einem breiten Bildschirm bleibt
  das Spiel in seiner Spalte, und die Ränder tragen die De-Stijl-Komposition.
- Auch auf 12 × 12 bleibt jede Zahl lesbar: die Schriftgröße ist über `clamp()`
  an die Zellgröße gekoppelt, und die Zahl sitzt in einem Plättchen, das sich
  vom Rechteck darunter abhebt.
- Berührziele mindestens 44 × 44 px (die Werkzeuge sind 56 px hoch).
- Der Zustand eines Rechtecks hängt nicht nur an der Farbe.
- `prefers-reduced-motion: reduce` schaltet alle Übergänge ab.
- Keine externe Schrift, kein externes Bild. Symbole sind ein inline-SVG-Sprite.

## Sprachen

Deutsch, Italienisch, Englisch. Ohne eigene Wahl folgt das Spiel dem Gerät;
eine unbekannte Sprache heißt „dem Gerät folgen" und nicht „Deutsch". Der
Wechsel braucht kein Neuladen und hängt auch den Manifest-Verweis um — es gibt
eines je Sprache, damit der Installationsdialog in der richtigen Sprache steht.

`tools/check-i18n.mjs` prüft jeden `data-i18n`-Schlüssel aus `index.html` und
dem Quelltext gegen die Wörterbücher; `i18n.test.js` prüft, dass alle drei
Sprachen denselben Schlüsselsatz haben und dass jeder Platzhalter, der im
deutschen Text steht, auch im italienischen und englischen vorkommt — sonst
fehlt dort eine Zahl.

## Installieren

Die gehostete Fassung ist eine installierbare Web-App und läuft danach offline.
Der Service Worker holt **Netz zuerst** und fällt auf den Speicher zurück; der
eigene Programmcode wird dabei immer mit `cache: 'reload'` geholt, also am
Zwischenspeicher des Browsers vorbei. Ohne das kann ein Speicher mit neuem
Namen mit altem Inhalt entstehen und ihn beliebig lange weitertragen — der
Fehler, an dem bei Zehner-Paare nach einer neuen Fassung weiter die alte
Versionsnummer stand.

`/api/` wird ausdrücklich **nicht** angefasst: im Zwischenspeicher wäre die
Rangliste sofort veraltet, und `index.html` als Ausweichantwort für eine
Zahlenauskunft wäre blanker Unsinn.

## Spielstand

| Schlüssel | Inhalt |
|---|---|
| `sk.einst.v1` | Skin, Farbschema, Sprache, Kürzel, Weltschalter, Hilfslinien, Vibration |
| `sk.spiel.v1` | die laufende Partie: Rätsel, Rechtecke, Sekunden, Fehler, Tipps |
| `sk.best.v1` | eigene Bestzeit je Stufe |
| `sk.welt.v1` | Merkzettel der Weltwerte (gehört `online.js`) |
| `sk.gesehen.v1` | ob die Regeln schon gezeigt wurden |

Eine halb gelöste Partie überlebt ein Neuladen. Beim Laden wird sie **geprüft
und nicht geglaubt**: der `localStorage` ist eine Grenze nach außen wie jede
andere, dort steht, was eine ältere Fassung geschrieben hat, was jemand in der
Konsole eingetippt hat, und im schlimmsten Fall eine Zeichenkette statt eines
Objekts. Geprüft wird auf den Typ und gegen die erlaubten Werte, nicht
umgerechnet — `welt: "false"` wäre sonst wahr, und der Schalter, der „kein
einziger Netzruf" verspricht, hätte genau das Gegenteil getan.

## Entwickeln

```bash
npm test                   # 200 Tests, node --test, ohne Netz
npm run check              # Textschlüssel und DOM-Kennungen
npm run build              # dist/ zusammenstellen
npm run einzeldatei        # shikaku.html zusammenlegen
npm run check:einzeldatei  # und darin ein Rätsel durchspielen
```

`check:dom` gibt es, weil ein Tippfehler in einer Kennung ein stiller
`null`-Zugriff ist: `index.html` und `app.js`/`brett.js` sind über Kennungen
verbunden, und kein Test bemerkt eine, die nicht mehr passt.

`check:einzeldatei` spielt in der zusammengelegten Datei wirklich ein Rätsel
durch, statt nur zu prüfen, ob sie lädt. Das Zusammenlegen schneidet `import`
und `export` mit einem regulären Ausdruck heraus — eine Funktion, die dadurch
ins Leere zeigt, fällt erst auf, wenn sie gerufen wird.

Der Aufbau steht in [ENTWICKLUNG.md](ENTWICKLUNG.md) — Modulschnitt, wie der
Löser arbeitet, warum der Erzeuger so und nicht anders sucht, und die
gemessenen Zahlen dazu.

## Fassungsnummer

Eine Nummer an vier Stellen, die zusammenlaufen müssen: `package.json`,
`VERSION` in `app.js`, der Cache-Name in `sw.js` und die Anzeige in den
Einstellungen (die sie aus `VERSION` bekommt). Zurzeit **1.0.0**.

## Aufbau

```
index.html            Oberfläche
app.js                Steuerung: Bedienung, Uhr, Undo, Tipp, Dialoge, Speichern
brett.js              Brett zeichnen und Zeigerbedienung
shikaku.js            Modell und Regeln (rein, kein DOM, kein Netz)
loeser.js             Löser, Schwierigkeitsmaß, Tipp-Logik
erzeuger.js           Rätsel erzeugen, Seed-basiert
i18n.js               Wörterbücher de/it/en
online.js             Rangliste-Client
worker.js             Cloudflare Worker — Servercode, geht NICHT nach dist/
basis.css             Aufbau und Bauteile
mondrian.css          Skin (Standard)
papier.css            Skin
m3.css m3-farben.css  Skin
sw.js                 Offline-Speicher
migrations/           D1-Schema
tools/                dist/ und shikaku.html bauen, Icons, Manifeste, Prüfwerkzeuge
*.test.js             Tests zu jedem Modul
```

## Lizenz

MIT.
