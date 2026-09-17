-- Shikaku: die Weltrangliste.
--
-- Alle Tabellen tragen den Praefix "shikaku_", weil die Datenbank "spiele"
-- sich mehrere Spiele teilen. Grund: D1 zaehlt im Free-Tarif DATENBANKEN und
-- nicht Tabellen, zehn sind das Limit, und es kommt etwa alle vier Tage ein
-- Spiel dazu. Der Praefix loest dabei zwei ganz konkrete Zusammenstoesse und
-- ist nicht bloss Ordnung: "zaehler" hiess in zehner-paare dieselbe Tabelle
-- wie hier, mit denselben Zeilen 'spiele' und 'siege' - ungetrennt haetten
-- die beiden Spiele einander hochgezaehlt. Und Indexnamen sind in SQLite je
-- DATENBANK eindeutig und nicht je Tabelle, weshalb auch der Index den
-- Praefix traegt.
--
-- Ebenso traegt die DATEI hier den Spielnamen (0001_shikaku.sql statt
-- 0001_schema.sql): wrangler fuehrt in d1_migrations je Datenbank Buch,
-- welche Migration schon lief, und zwar ueber den DATEINAMEN. Zwei Spiele mit
-- je einem 0001_schema.sql heisst, dass das zweite als erledigt gilt und
-- stillschweigend uebersprungen wird.
--
-- Jede Anweisung hier traegt IF NOT EXISTS. Das Schema steht in "spiele"
-- bereits, diese Datei muss also folgenlos durchlaufen koennen - und derselbe
-- Lauf legt sie in einer frischen Datenbank vollstaendig an.
--
-- Zwei Tabellen, mehr braucht es nicht. Der Unterschied zu zehner-paare, das
-- daneben steht, ist die Richtung: dort waren Punkte das Ergebnis und GROSS
-- war gut, hier ist es eine Zeit und KLEIN ist gut. Das klingt nach einer
-- Kleinigkeit und ist der Grund, warum diese Datei nicht die abgeschriebene
-- von dort ist: jedes MAX() wird ein MIN(), jedes DESC ein ASC, und jedes
-- ">" im Vergleich ein "<". Wer eine dieser Stellen uebersieht, baut eine
-- Rangliste, die den Langsamsten feiert.
--
-- Der zweite Unterschied ist die Zeilenzahl. In zehner-paare haelt die Tabelle
-- JEDEN Rekord, den es je gab, und waechst mit jeder Partie. Hier gibt es
-- genau EINE Zeile je Kuerzel und Stufe, und in ihr steht immer nur die
-- schnellste Zeit dieses Kuerzels. Damit ist die Tabelle von Natur aus
-- beschraenkt: hoechstens 36^3 Kuerzel (46656) mal vier Stufen, und selbst der
-- unwahrscheinliche Vollstand waere eine Tabelle von wenigen Megabyte. Sie
-- braucht kein Aufraeumen, keine Verfallsfrist und keinen Cron-Auftrag.
--
-- Die naheliegende Alternative -- jede beendete Partie als eigene Zeile, die
-- Bestzeit als MIN() darueber -- waere fuer die Abfragen genauso gut gewesen
-- und haette sogar eine Geschichte je Spieler ergeben. Sie ist verworfen,
-- weil sie unbeschraenkt waechst: eine offene Schnittstelle ohne Konten laesst
-- sich nicht daran hindern, in einer Nacht hunderttausend Partien zu melden.
-- Mit einer Zeile je Kuerzel und Stufe kostet derselbe Angriff nichts weiter
-- als eine ueberschriebene eigene Zeile.

CREATE TABLE IF NOT EXISTS shikaku_bestzeiten (
  -- Drei Zeichen aus A-Z und 0-9. Hier NICHT leer: eine Zeile ohne Namen
  -- koennte niemand halten, und der Primaerschluessel waere fuer alle
  -- namenlosen Meldungen derselbe -- sie wuerden sich gegenseitig
  -- ueberschreiben und die schnellste anonyme Zeit der Welt bilden. Wer ohne
  -- Kuerzel spielt, wird darum nur gezaehlt (siehe shikaku_zaehler) und bekommt
  -- keine Zeile. Der Worker setzt das durch, nicht diese Tabelle: eine
  -- CHECK-Bedingung waere eine zweite Wahrheit an einer zweiten Stelle.
  kuerzel  TEXT    NOT NULL,
  -- 'leicht' | 'mittel' | 'schwer' | 'experte'. Als Text und nicht als Zahl,
  -- damit die Tabelle ohne Nachschlagen lesbar ist -- 40 Bytes je Zeile mehr
  -- sind bei hoechstens ein paar zehntausend Zeilen kein Argument.
  stufe    TEXT    NOT NULL,
  -- Die Spielzeit in ganzen Sekunden. Kleiner ist besser.
  sekunden INTEGER NOT NULL,
  -- Falsch gesetzte Rechtecke und benutzte Tipps dieser Partie. Sie gehen in
  -- die Rangfolge NICHT ein: die Zeit allein entscheidet. Sie stehen daneben,
  -- damit die Liste zeigen kann, ob eine Zeit mit oder ohne Hilfe zustande
  -- kam -- eine schnelle Zeit mit sechs Tipps liest sich anders als dieselbe
  -- Zeit ohne einen.
  fehler   INTEGER NOT NULL DEFAULT 0,
  tipps    INTEGER NOT NULL DEFAULT 0,
  -- Millisekunden seit 1970, der Zeitpunkt der EINGETRAGENEN (also der
  -- schnellsten) Partie. Wird beim Verbessern mitgezogen, sonst waere es der
  -- Zeitpunkt einer Zeit, die gar nicht mehr in der Zeile steht.
  wann     INTEGER NOT NULL,
  PRIMARY KEY (kuerzel, stufe)
);

-- Der eine Index, der alle drei Fragen der Rangliste beantwortet: die
-- Bestenliste einer Stufe (ORDER BY sekunden), den Weltrekord einer Stufe
-- (dieselbe Liste, erste Zeile) und den Rang eines Kuerzels (Zaehlen, bis es
-- kommt). Das kuerzel als dritte Spalte ist kein Beiwerk, sondern der
-- eindeutige Nachrang bei gleicher Zeit: gleiche Sekundenzahlen sind in einem
-- Zeitspiel haeufig, und ohne festen Nachrang duerfte die Datenbank zwei
-- Spieler mit 143 Sekunden bei jedem Laden anders herum ziehen. Die Liste
-- haette dann bei jedem Aufschlagen ausgesehen wie ein Fehler im Spiel.
CREATE INDEX IF NOT EXISTS shikaku_bestzeiten_rangliste ON shikaku_bestzeiten (stufe, sekunden, kuerzel);

-- Gespielte und gewonnene Partien, weltweit -- auch die ohne Kuerzel. Eine
-- Zeile je Zaehler statt einer Spalte je Zaehler: ein dritter kommt dann ohne
-- Schemaaenderung dazu, und der Worker kennt nur den Namen.
CREATE TABLE IF NOT EXISTS shikaku_zaehler (
  name TEXT PRIMARY KEY,
  wert INTEGER NOT NULL DEFAULT 0
);
