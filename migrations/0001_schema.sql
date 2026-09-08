-- Shikaku: die Weltrangliste.
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

CREATE TABLE IF NOT EXISTS bestzeiten (
  -- Drei Zeichen aus A-Z und 0-9. Hier NICHT leer: eine Zeile ohne Namen
  -- koennte niemand halten, und der Primaerschluessel waere fuer alle
  -- namenlosen Meldungen derselbe -- sie wuerden sich gegenseitig
  -- ueberschreiben und die schnellste anonyme Zeit der Welt bilden. Wer ohne
  -- Kuerzel spielt, wird darum nur gezaehlt (siehe zaehler) und bekommt hier
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
CREATE INDEX IF NOT EXISTS bestzeiten_rangliste ON bestzeiten (stufe, sekunden, kuerzel);

-- Gespielte und gewonnene Partien, weltweit -- auch die ohne Kuerzel. Eine
-- Zeile je Zaehler statt einer Spalte je Zaehler: ein dritter kommt dann ohne
-- Schemaaenderung dazu, und der Worker kennt nur den Namen.
CREATE TABLE IF NOT EXISTS zaehler (
  name TEXT PRIMARY KEY,
  wert INTEGER NOT NULL DEFAULT 0
);
