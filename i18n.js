/* =========================================================================
   Shikaku – die drei Sprachen

   Deutsch, Italienisch, Englisch. Deutsch ist die Quelle: dort steht der
   Satz, wie er gemeint ist, die anderen beiden folgen ihm im Sinn, nicht im
   Wortlaut. Der Autor sitzt in Südtirol, Italienisch ist hier keine Zugabe –
   ein italienischer Satz, der nach Übersetzung klingt, ist ein Fehler wie
   ein fehlender Schlüssel.

   Warum eine eigene Datei und kein Fremdpaket: es sind gut hundert Sätze
   und ein Platzhalter-Ersetzer. Was ein Paket sonst noch mitbringt –
   Pluralregeln nach CLDR, Datums- und Zahlenformate, Nachladen einzelner
   Sprachen – braucht dieses Spiel nicht, und es wäre die erste Abhängigkeit
   in einem Projekt, das ohne auskommt.

   Wo eine Zahl in einem Satz steht, steht sie deshalb HINTER ihrem Wort
   ("Fehler {fehler}", nicht "{fehler} Fehler"). Das ist keine Marotte,
   sondern die Umgehung des Mehrzahlproblems: "1 Tipps" ist im Deutschen
   schief und "1 errori" im Italienischen falsch, und für zwei Beschriftungen
   eine Pluralmaschine mitzuschleppen wäre unverhältnismäßig. Mit der Zahl
   hinten stimmt jeder Fall in allen drei Sprachen.

   Warum `t` die Sprache als ERSTES Argument nimmt und es kein
   `setzeSprache()` mit Modulzustand gibt (so macht es zehner-paare):
   an dieses Wörterbuch gehen nicht nur die Oberfläche, sondern auch
   tools/gen-manifests.mjs (alle drei Sprachen in einem Lauf) und die Tests.
   Ein verstecktes "aktuell", das der letzte Aufrufer gesetzt hat, macht
   genau dort falsche Ausgaben, die niemand sieht. Der Preis ist ein
   Argument mehr an jeder Aufrufstelle; app.js hat dafür seinen eigenen
   Kurzschluss.
   ========================================================================= */

/**
 * Reihenfolge = Reihenfolge im Umschalter in den Einstellungen.
 * Der Vertrag will hier ein Array; die Beschriftungen stehen als
 * `sprache.de` / `sprache.it` / `sprache.en` im Wörterbuch selbst.
 */
export const SPRACHEN = ['de', 'it', 'en'];

/** Die Quelle. Fällt alles andere aus, wird dieser Satz gezeigt. */
export const STANDARD = 'de';

/**
 * Die Platzhalter, die überhaupt vorkommen dürfen (Vertrag, Abschnitt 7).
 * Steht hier und nicht nur im Test, damit app.js dagegen prüfen kann, was
 * es an `t` übergibt – ein Tippfehler im Wertenamen bleibt sonst bis ins
 * Bild unentdeckt, wo dann "{zeit}" steht.
 */
export const PLATZHALTER = [
  'zeit', 'stufe', 'wert', 'kuerzel', 'platz', 'offen', 'fehler', 'tipps',
  'spiele', 'siege', 'x', 'y', 'fassung',
];

const TEXTE = {

  /* ------------------------------------------------------------- Deutsch */
  de: {
    // "Shikaku" ist der Name des Rätsels bei Nikoli und wird in keiner
    // Sprache übersetzt – so wie Sudoku auch.
    'app.titel': 'Shikaku',
    'app.untertitel': 'Das Rechteck-Rätsel',
    'app.beschreibung': 'Zerlege das Raster in Rechtecke: in jedem steht genau eine Zahl, '
      + 'und die Zahl ist seine Fläche. Das japanische Rätsel von Nikoli, fürs Smartphone.',

    // Die drei Statuskarten. Auf 390 px bleiben je Marke rund 100 px –
    // ein Wort, kein Umbruch.
    'hud.zeit': 'Zeit',
    'hud.offen': 'Offen',
    'hud.stufe': 'Stufe',

    'stufe.leicht': 'Leicht',
    'stufe.mittel': 'Mittel',
    'stufe.schwer': 'Schwer',
    'stufe.experte': 'Experte',

    // Die Werkzeugleiste ist die engste Stelle im Spiel: fünf Knöpfe in
    // einer Zeile, in Daumenreichweite. Mehr als neun Zeichen passen dort
    // nicht, das prüft i18n.test.js nach.
    'werkzeug.zurueck': 'Zurück',
    'werkzeug.vor': 'Vor',
    'werkzeug.tipp': 'Tipp',
    'werkzeug.leeren': 'Leeren',
    'werkzeug.neu': 'Neu',

    // -------------------------------------------------------------- Regeln
    // Der wichtigste Text im Spiel. Wer Shikaku noch nie gesehen hat, muss
    // nach diesen Sätzen spielen können, ohne nachzufragen. Darum: erst der
    // Kern in einem Satz, dann die drei Dinge, die man wirklich wissen muss
    // (restlos, genau eine Zahl, eindeutig), dann die Bedienung.
    'regeln.titel': 'So wird gespielt',
    'regeln.kern': 'Zerlege das Raster restlos in Rechtecke: in jedem Rechteck steht genau '
      + 'eine Zahl, und die Zahl sagt, aus wie vielen Kästchen es besteht.',
    'regeln.p1': 'Am Ende gehört jedes Kästchen zu genau einem Rechteck. Keine Lücken, keine '
      + 'Überlappungen – das Raster geht restlos auf. Die Summe aller Zahlen ist deshalb '
      + 'immer so groß wie das ganze Raster.',
    'regeln.p2': 'Die Zahl ist die Fläche ihres Rechtecks, nicht seine Kantenlänge. Eine 6 wird '
      + 'also 1×6, 2×3, 3×2 oder 6×1; welche dieser Formen bleibt, entscheiden die Nachbarn. '
      + 'Eine 1 ist immer nur ihr eigenes Kästchen, und eine Primzahl wie 7 bleibt immer ein '
      + 'schmaler Streifen.',
    'regeln.p3': 'Jedes Rätsel hat genau eine Lösung. Auf den unteren Stufen kommt man Schritt '
      + 'für Schritt hin, ohne zu raten: am besten dort anfangen, wo eine Zahl wenig Platz hat '
      + '– eine 4 in der Ecke oder eine große Zahl am Rand lässt oft nur eine Form zu. Von da '
      + 'an wird es enger, und die Kanten der schon gesetzten Rechtecke zeigen den nächsten '
      + 'Schritt.',
    'regeln.bedienungTitel': 'Bedienung',
    'regeln.b1': 'Ziehen: von einer Ecke des Rechtecks zur gegenüberliegenden. Der Umriss zeigt '
      + 'beim Ziehen mit, was entsteht, und ob Zahl und Fläche zusammenpassen.',
    'regeln.b2': 'Antippen: ein Antippen nimmt ein gesetztes Rechteck wieder weg.',
    'regeln.b3': 'Tipp: setzt ein Rechteck, das schon zwingend ist, und sagt dazu, woran man das '
      + 'sieht. Tipps werden mitgezählt.',
    'regeln.b4': 'Zurück und Vor gehen durch die eigenen Züge, Leeren räumt das ganze Brett. Die '
      + 'Uhr läuft dabei weiter.',
    'regeln.los': 'Los geht’s',
    // Beschreibung des Beispielbildes. Die Zahlen darin gehen auf:
    // 6 + 3 + 2 + 1 = 12 = vier mal drei Kästchen.
    'regeln.bildAlt': 'Beispiel: ein Raster aus vier mal drei Kästchen, restlos zerlegt in vier '
      + 'Rechtecke – die 6 als 2×3, die 3 als liegender Streifen, die 2 als stehendes Paar und '
      + 'die 1 als einzelnes Kästchen.',

    // ------------------------------------------------------- Einstellungen
    'einst.titel': 'Einstellungen',
    'einst.darstellung': 'Darstellung',
    'einst.skin': 'Stil',
    'einst.thema': 'Farbschema',
    'einst.sprache': 'Sprache',
    'einst.spiel': 'Spiel',
    'einst.kuerzel': 'Dein Kürzel',
    'einst.kuerzelHinweis': 'Drei Zeichen, Buchstaben oder Ziffern. Sie stehen in der Rangliste '
      + 'neben deiner Zeit. Ohne Kürzel wird die Partie nur mitgezählt.',
    'einst.welt': 'Weltweit mitzählen',
    'einst.weltHinweis': 'Hinaus geht nur, was in der Liste steht: Stufe, Zeit, Fehler, Tipps '
      + 'und dein Kürzel. Kein Gerät, keine Kennung, kein Konto; die IP-Adresse sieht der Dienst '
      + 'wie jeder Server im Netz. Weil niemand angemeldet ist, kann jeder eintragen, was er '
      + 'will – nimm die Weltwerte als Anhaltspunkt, nicht als Urkunde.',
    'einst.hilfslinien': 'Hilfslinien im Raster',
    'einst.vibration': 'Vibration',
    'einst.ueber': 'Über',
    'einst.fassung': 'Fassung {fassung}',
    'einst.quelle': 'Quelltext',
    'einst.rangliste': 'Rangliste',
    'einst.zu': 'Fertig',

    // Stilnamen: "Mondrian" und "Material 3" sind Namen und bleiben stehen.
    'skin.mondrian': 'Mondrian',
    'skin.papier': 'Papier',
    'skin.m3': 'Material 3',

    'thema.auto': 'Auto',
    'thema.hell': 'Hell',
    'thema.dunkel': 'Dunkel',

    // Sprachnamen in der eigenen Sprache – so findet jeder seine wieder,
    // auch wenn die Oberfläche gerade in einer fremden steht. Darum stehen
    // in allen drei Wörterbüchern dieselben drei Wörter.
    'sprache.de': 'Deutsch',
    'sprache.it': 'Italiano',
    'sprache.en': 'English',

    // ----------------------------------------------------------- Spielende
    'ende.gewonnen': 'Gelöst',
    'ende.zeit': '{stufe} in {zeit}',
    'ende.weltrekord': 'Neuer Weltrekord auf {stufe}.',
    'ende.persoenlich': 'Neue eigene Bestzeit – vorher {zeit}.',
    'ende.gleichstand': 'Gleichstand mit deiner Bestzeit.',
    'ende.kuerzelFrage': 'Kürzel für die Rangliste',
    'ende.nochmal': 'Nochmal',
    'ende.zu': 'Schließen',
    'ende.fehlerTipps': 'Fehler {fehler} · Tipps {tipps}',
    'ende.ohneKuerzel': 'Ohne Kürzel wird die Partie mitgezählt, kommt aber nicht in die Liste.',

    // ----------------------------------------------------------- Rangliste
    'rang.titel': 'Rangliste',
    'rang.leer': 'Auf dieser Stufe steht noch keine Zeit.',
    'rang.platz': 'Platz',
    'rang.zeit': 'Zeit',
    'rang.spieler': 'Spieler',
    'rang.weltrekord': 'Weltrekord: {zeit} · {kuerzel}',
    'rang.spiele': 'Weltweit gespielt: {spiele}',
    'rang.siege': 'Davon gelöst: {siege}',
    'rang.offline': 'Kein Netz – die Liste zeigt den letzten bekannten Stand.',
    'rang.hinweis': 'Gezählt wird die Zeit bis zum letzten gesetzten Rechteck. Fehler und Tipps '
      + 'stehen daneben, kosten aber keine Sekunden.',
    'rang.du': 'Du · Platz {platz}',

    // -------------------------------------------------------- Neues Rätsel
    'neu.titel': 'Neues Rätsel',
    'neu.frage': 'Welche Stufe?',
    'neu.abbrechen': 'Abbrechen',
    'neu.laeuft': 'Das Rätsel wird gebaut …',

    // ---------------------------------------------------------------- Tipp
    // Diese fünf sind die `grund`-Schlüssel aus loeser.js: der Tipp setzt
    // nicht nur ein Rechteck, er sagt auch, welcher Schluss dahinter steckt.
    // Genau das ist der Unterschied zwischen "die Lösung verraten" und
    // "Shikaku lernen".
    'tipp.einzigerKandidat': 'Für die Zahl {wert} bleibt nur noch dieses Rechteck.',
    'tipp.einzigeDeckung': 'Das Kästchen in Spalte {x}, Zeile {y} lässt sich nur noch von diesem '
      + 'Rechteck decken.',
    'tipp.ausschluss': 'Jede andere Form für die Zahl {wert} würde ein Kästchen übrig lassen, '
      + 'das dann niemand mehr decken kann.',
    'tipp.keiner': 'Hier bringt kein Schluss mehr weiter – das muss probiert werden.',
    'tipp.raeumeAuf': 'Erst die rot gezeichneten Rechtecke wegnehmen, dann geht es weiter.',

    // ------------------------------------------------------- Meldungszeile
    'hinweis.rechteckWeg': 'Rechteck weggenommen.',
    'hinweis.geleert': 'Brett geleert.',
    'hinweis.nichtsRueckgaengig': 'Kein Zug zum Zurücknehmen.',
    'hinweis.gespeichert': 'Die Partie ist gespeichert – beim nächsten Start ist sie wieder da.',
    'hinweis.offline': 'Kein Netz. Gespielt wird trotzdem weiter.',
    'hinweis.kuerzelGesetzt': 'Kürzel {kuerzel} gespeichert.',
    'hinweis.zuKlein': 'Das Rechteck ist kleiner als seine Zahl {wert}.',

    // -------------------------------------------------------- Vorlesehilfe
    // Diese Sätze werden nie gezeichnet, sie werden vorgelesen. Deshalb
    // ausformuliert und mit Satzzeichen: eine Vorlesehilfe liest "Spalte 3,
    // Zeile 2" als Pause, "3/2" dagegen als Bruch.
    'a11y.regeln': 'Spielregeln',
    // Die Werkzeugleiste braucht einen EIGENEN Namen. Sie trug einmal
    // a11y.brett, und damit hieß sie für die Vorlesehilfe genauso wie das
    // Brett darüber – zwei Bereiche mit demselben Namen sind schlimmer als
    // einer ohne, weil man sie beim Durchgehen nicht auseinanderhält.
    'a11y.werkzeuge': 'Werkzeuge',
    'a11y.einstellungen': 'Einstellungen',
    'a11y.brett': 'Spielbrett',
    'a11y.karteZeit': 'Verbrauchte Zeit',
    'a11y.karteOffen': 'Noch offene Kästchen',
    /*
      Der Name nennt die STUFE mit.

      Das Kärtchen ist ein Knopf, und der Name eines Knopfes verdrängt
      seinen Inhalt: "Stufe / Mittel / 8 × 8" steht sichtbar darin und wurde
      von keiner Vorlesehilfe gelesen, weil aria-label gewinnt. Damit war
      die Schwierigkeit der laufenden Partie der einzige Wert im ganzen
      Spiel, den ein blinder Spieler nirgends erfahren konnte. Die Handlung
      steht trotzdem vorne — bei einem Knopf ist sie das Wichtige.
    */
    'a11y.karteStufe': 'Stufe wechseln, aktuell {stufe}',
    'a11y.zelleLeer': 'Spalte {x}, Zeile {y}, leer',
    'a11y.zelleZahl': 'Spalte {x}, Zeile {y}, Zahl {wert}',
    'a11y.zelleTeil': 'Spalte {x}, Zeile {y}, Teil des Rechtecks mit der Zahl {wert}',
    'a11y.dialogZu': 'Schließen',
    'a11y.gedeckt': 'Gedeckt: {wert}. Noch offen: {offen}.',
  },

  /* --------------------------------------------------------- Italienisch */
  it: {
    'app.titel': 'Shikaku',
    'app.untertitel': 'Il rompicapo dei rettangoli',
    'app.beschreibung': 'Dividi la griglia in rettangoli: in ognuno c’è un solo numero, e quel '
      + 'numero è la sua area. Il rompicapo giapponese di Nikoli, per lo smartphone.',

    'hud.zeit': 'Tempo',
    'hud.offen': 'Libere',
    'hud.stufe': 'Livello',

    'stufe.leicht': 'Facile',
    'stufe.mittel': 'Medio',
    'stufe.schwer': 'Difficile',
    'stufe.experte': 'Esperto',

    // Fünf Knöpfe in einer Zeile: "Annulla"/"Indizio" sind mit sieben
    // Zeichen schon das Längste, was dort hineingeht.
    'werkzeug.zurueck': 'Annulla',
    'werkzeug.vor': 'Ripeti',
    'werkzeug.tipp': 'Indizio',
    'werkzeug.leeren': 'Svuota',
    'werkzeug.neu': 'Nuovo',

    'regeln.titel': 'Come si gioca',
    'regeln.kern': 'Dividi tutta la griglia in rettangoli: in ogni rettangolo c’è un solo '
      + 'numero, e quel numero dice di quante caselle è fatto.',
    'regeln.p1': 'Alla fine ogni casella appartiene a un solo rettangolo. Niente buchi, niente '
      + 'sovrapposizioni: la griglia si divide senza resti. Per questo la somma di tutti i '
      + 'numeri è sempre grande come la griglia intera.',
    'regeln.p2': 'Il numero è l’area del suo rettangolo, non la lunghezza di un lato. Un 6 '
      + 'diventa quindi 1×6, 2×3, 3×2 oppure 6×1; quale di queste forme resti lo decidono i '
      + 'vicini. Un 1 è sempre soltanto la sua casella, e un numero primo come 7 resta sempre '
      + 'una striscia sottile.',
    'regeln.p3': 'Ogni rompicapo ha una sola soluzione. Ai livelli più bassi ci si arriva passo '
      + 'per passo, senza tirare a indovinare: conviene partire dove un numero ha poco spazio – '
      + 'un 4 in un angolo o un numero grande lungo il bordo spesso ammette una forma sola. Da '
      + 'lì lo spazio si restringe, e i bordi dei rettangoli già posati indicano la mossa '
      + 'successiva.',
    'regeln.bedienungTitel': 'Comandi',
    'regeln.b1': 'Trascina: da un angolo del rettangolo a quello opposto. Mentre trascini il '
      + 'contorno mostra che cosa stai posando, e se numero e area coincidono.',
    'regeln.b2': 'Tocca: un tocco su un rettangolo già posato lo toglie di nuovo.',
    'regeln.b3': 'Indizio: posa un rettangolo che è già obbligato e spiega da che cosa si vede. '
      + 'Gli indizi vengono contati.',
    'regeln.b4': 'Annulla e Ripeti scorrono le tue mosse, Svuota libera tutta la griglia. Il '
      + 'tempo intanto continua a correre.',
    'regeln.los': 'Iniziamo',
    'regeln.bildAlt': 'Esempio: una griglia di quattro per tre caselle, divisa senza resti in '
      + 'quattro rettangoli – il 6 come 2×3, il 3 come striscia orizzontale, il 2 come coppia '
      + 'verticale e l’1 come singola casella.',

    'einst.titel': 'Impostazioni',
    'einst.darstellung': 'Aspetto',
    'einst.skin': 'Stile',
    'einst.thema': 'Schema colori',
    'einst.sprache': 'Lingua',
    'einst.spiel': 'Gioco',
    'einst.kuerzel': 'La tua sigla',
    'einst.kuerzelHinweis': 'Tre caratteri, lettere o cifre. Compaiono in classifica accanto al '
      + 'tuo tempo. Senza sigla la partita viene soltanto contata.',
    'einst.welt': 'Conta nel mondo',
    'einst.weltHinweis': 'Esce solo quello che sta in classifica: livello, tempo, errori, indizi '
      + 'e la tua sigla. Nessun dispositivo, nessun codice, nessun account; l’indirizzo IP lo '
      + 'vede il servizio come ogni server in rete. Poiché nessuno è registrato, chiunque può '
      + 'scrivere quello che vuole – prendi i valori mondiali come indicazione, non come '
      + 'certificato.',
    'einst.hilfslinien': 'Linee guida nella griglia',
    'einst.vibration': 'Vibrazione',
    'einst.ueber': 'Informazioni',
    'einst.fassung': 'Versione {fassung}',
    'einst.quelle': 'Codice sorgente',
    'einst.rangliste': 'Classifica',
    'einst.zu': 'Fatto',

    'skin.mondrian': 'Mondrian',
    'skin.papier': 'Carta',
    'skin.m3': 'Material 3',

    'thema.auto': 'Auto',
    'thema.hell': 'Chiaro',
    'thema.dunkel': 'Scuro',

    'sprache.de': 'Deutsch',
    'sprache.it': 'Italiano',
    'sprache.en': 'English',

    'ende.gewonnen': 'Risolto',
    'ende.zeit': '{stufe} in {zeit}',
    'ende.weltrekord': 'Nuovo record mondiale a livello {stufe}.',
    'ende.persoenlich': 'Nuovo record personale – prima era {zeit}.',
    'ende.gleichstand': 'Pari con il tuo record personale.',
    'ende.kuerzelFrage': 'Sigla per la classifica',
    'ende.nochmal': 'Ancora',
    'ende.zu': 'Chiudi',
    'ende.fehlerTipps': 'Errori {fehler} · indizi {tipps}',
    'ende.ohneKuerzel': 'Senza sigla la partita viene contata, ma non entra in classifica.',

    'rang.titel': 'Classifica',
    'rang.leer': 'A questo livello non c’è ancora nessun tempo.',
    'rang.platz': 'Pos.',
    'rang.zeit': 'Tempo',
    'rang.spieler': 'Giocatore',
    'rang.weltrekord': 'Record mondiale: {zeit} · {kuerzel}',
    'rang.spiele': 'Giocate nel mondo: {spiele}',
    'rang.siege': 'Di queste risolte: {siege}',
    'rang.offline': 'Senza rete – la classifica mostra l’ultimo stato conosciuto.',
    'rang.hinweis': 'Conta il tempo fino all’ultimo rettangolo posato. Errori e indizi stanno '
      + 'accanto, ma non aggiungono secondi.',
    'rang.du': 'Tu · pos. {platz}',

    'neu.titel': 'Nuovo rompicapo',
    'neu.frage': 'Che livello?',
    'neu.abbrechen': 'Annulla',
    'neu.laeuft': 'Sto costruendo il rompicapo …',

    'tipp.einzigerKandidat': 'Per il numero {wert} resta solo questo rettangolo.',
    'tipp.einzigeDeckung': 'La casella in colonna {x}, riga {y} può essere coperta solo da '
      + 'questo rettangolo.',
    'tipp.ausschluss': 'Ogni altra forma per il numero {wert} lascerebbe una casella che poi '
      + 'nessun rettangolo potrebbe più coprire.',
    'tipp.keiner': 'Qui nessun ragionamento porta avanti – bisogna provare.',
    'tipp.raeumeAuf': 'Prima togli i rettangoli disegnati in rosso, poi si va avanti.',

    'hinweis.rechteckWeg': 'Rettangolo rimosso.',
    'hinweis.geleert': 'Griglia svuotata.',
    'hinweis.nichtsRueckgaengig': 'Nessuna mossa da annullare.',
    'hinweis.gespeichert': 'La partita è salvata – la ritrovi al prossimo avvio.',
    'hinweis.offline': 'Nessuna rete. Si continua a giocare comunque.',
    'hinweis.kuerzelGesetzt': 'Sigla {kuerzel} salvata.',
    'hinweis.zuKlein': 'Il rettangolo è più piccolo del suo numero {wert}.',

    'a11y.regeln': 'Regole del gioco',
    'a11y.werkzeuge': 'Strumenti',
    'a11y.einstellungen': 'Impostazioni',
    'a11y.brett': 'Griglia di gioco',
    'a11y.karteZeit': 'Tempo trascorso',
    'a11y.karteOffen': 'Caselle ancora libere',
    'a11y.karteStufe': 'Cambia livello, attualmente {stufe}',
    'a11y.zelleLeer': 'Colonna {x}, riga {y}, vuota',
    'a11y.zelleZahl': 'Colonna {x}, riga {y}, numero {wert}',
    'a11y.zelleTeil': 'Colonna {x}, riga {y}, parte del rettangolo con il numero {wert}',
    'a11y.dialogZu': 'Chiudi',
    'a11y.gedeckt': 'Coperte: {wert}. Ancora libere: {offen}.',
  },

  /* ------------------------------------------------------------- Englisch */
  en: {
    'app.titel': 'Shikaku',
    'app.untertitel': 'The rectangle puzzle',
    'app.beschreibung': 'Divide the grid into rectangles: each one holds exactly one number, and '
      + 'that number is its area. The Japanese puzzle by Nikoli, made for your phone.',

    'hud.zeit': 'Time',
    'hud.offen': 'Open',
    'hud.stufe': 'Level',

    'stufe.leicht': 'Easy',
    'stufe.mittel': 'Medium',
    'stufe.schwer': 'Hard',
    'stufe.experte': 'Expert',

    'werkzeug.zurueck': 'Undo',
    'werkzeug.vor': 'Redo',
    'werkzeug.tipp': 'Hint',
    'werkzeug.leeren': 'Clear',
    'werkzeug.neu': 'New',

    'regeln.titel': 'How to play',
    'regeln.kern': 'Divide the whole grid into rectangles: every rectangle holds exactly one '
      + 'number, and that number says how many cells it is made of.',
    'regeln.p1': 'In the end every cell belongs to exactly one rectangle. No gaps, no overlaps – '
      + 'the grid comes out even. That is why all the numbers together always add up to the size '
      + 'of the whole grid.',
    'regeln.p2': 'The number is the area of its rectangle, not the length of a side. So a 6 '
      + 'becomes 1×6, 2×3, 3×2 or 6×1; which of those shapes survives is decided by the '
      + 'neighbours. A 1 is never more than its own cell, and a prime like 7 always stays a thin '
      + 'strip.',
    'regeln.p3': 'Every puzzle has exactly one solution. On the lower levels you can reason your '
      + 'way there step by step, without guessing: start where a number has little room – a 4 in '
      + 'a corner, or a large number along an edge, often allows only one shape. From there it '
      + 'gets tighter, and the edges of the rectangles already placed point to the next step.',
    'regeln.bedienungTitel': 'Controls',
    'regeln.b1': 'Drag from one corner of the rectangle to the opposite one. As you drag, the '
      + 'outline shows what you are about to place, and whether the number and the area agree.',
    'regeln.b2': 'Tap: a tap takes a rectangle you have placed away again.',
    'regeln.b3': 'Hint: places a rectangle that is already forced, and says how you could have '
      + 'seen it. Hints are counted.',
    'regeln.b4': 'Undo and Redo step through your own moves, Clear empties the whole board. The '
      + 'clock keeps running while you do.',
    'regeln.los': 'Let’s go',
    'regeln.bildAlt': 'Example: a grid of four by three cells, divided completely into four '
      + 'rectangles – the 6 as 2×3, the 3 as a horizontal strip, the 2 as an upright pair and '
      + 'the 1 as a single cell.',

    'einst.titel': 'Settings',
    'einst.darstellung': 'Appearance',
    'einst.skin': 'Style',
    'einst.thema': 'Colour scheme',
    'einst.sprache': 'Language',
    'einst.spiel': 'Game',
    'einst.kuerzel': 'Your initials',
    'einst.kuerzelHinweis': 'Three characters, letters or digits. They stand next to your time in '
      + 'the ranking. Without initials the game is only counted.',
    'einst.welt': 'Count worldwide',
    'einst.weltHinweis': 'Only what appears in the list goes out: level, time, mistakes, hints '
      + 'and your initials. No device, no identifier, no account; the service sees your IP '
      + 'address like any server on the net. Since nobody signs in, anyone can enter whatever '
      + 'they like – treat the world figures as a pointer, not as a certificate.',
    'einst.hilfslinien': 'Guide lines in the grid',
    'einst.vibration': 'Vibration',
    'einst.ueber': 'About',
    'einst.fassung': 'Version {fassung}',
    'einst.quelle': 'Source code',
    'einst.rangliste': 'Ranking',
    'einst.zu': 'Done',

    'skin.mondrian': 'Mondrian',
    'skin.papier': 'Paper',
    'skin.m3': 'Material 3',

    'thema.auto': 'Auto',
    'thema.hell': 'Light',
    'thema.dunkel': 'Dark',

    'sprache.de': 'Deutsch',
    'sprache.it': 'Italiano',
    'sprache.en': 'English',

    'ende.gewonnen': 'Solved',
    'ende.zeit': '{stufe} in {zeit}',
    'ende.weltrekord': 'New world record on {stufe}.',
    'ende.persoenlich': 'A new personal best – {zeit} before.',
    'ende.gleichstand': 'Level with your personal best.',
    'ende.kuerzelFrage': 'Initials for the ranking',
    'ende.nochmal': 'Again',
    'ende.zu': 'Close',
    'ende.fehlerTipps': 'Mistakes {fehler} · hints {tipps}',
    'ende.ohneKuerzel': 'Without initials the game still counts, but it does not enter the list.',

    'rang.titel': 'Ranking',
    'rang.leer': 'No time on this level yet.',
    'rang.platz': 'Rank',
    'rang.zeit': 'Time',
    'rang.spieler': 'Player',
    'rang.weltrekord': 'World record: {zeit} · {kuerzel}',
    'rang.spiele': 'Played worldwide: {spiele}',
    'rang.siege': 'Of those solved: {siege}',
    'rang.offline': 'No network – the list shows the last state it knows.',
    'rang.hinweis': 'The clock counts up to the last rectangle you place. Mistakes and hints are '
      + 'listed alongside, but they cost no seconds.',
    'rang.du': 'You · rank {platz}',

    'neu.titel': 'New puzzle',
    'neu.frage': 'Which level?',
    'neu.abbrechen': 'Cancel',
    'neu.laeuft': 'Building the puzzle …',

    'tipp.einzigerKandidat': 'Only this rectangle is left for the number {wert}.',
    'tipp.einzigeDeckung': 'The cell in column {x}, row {y} can only be covered by this '
      + 'rectangle.',
    'tipp.ausschluss': 'Any other shape for the number {wert} would leave a cell behind that '
      + 'nothing could cover any more.',
    'tipp.keiner': 'No deduction gets you further here – this one has to be tried out.',
    'tipp.raeumeAuf': 'Take the rectangles drawn in red away first, then it can go on.',

    'hinweis.rechteckWeg': 'Rectangle removed.',
    'hinweis.geleert': 'Board cleared.',
    'hinweis.nichtsRueckgaengig': 'No move to undo.',
    'hinweis.gespeichert': 'The game is saved – it will be here the next time you start.',
    'hinweis.offline': 'No network. You can keep playing.',
    'hinweis.kuerzelGesetzt': 'Initials {kuerzel} saved.',
    'hinweis.zuKlein': 'The rectangle is smaller than its number {wert}.',

    'a11y.regeln': 'Game rules',
    'a11y.werkzeuge': 'Tools',
    'a11y.einstellungen': 'Settings',
    'a11y.brett': 'Game board',
    'a11y.karteZeit': 'Time elapsed',
    'a11y.karteOffen': 'Cells still open',
    'a11y.karteStufe': 'Change level, currently {stufe}',
    'a11y.zelleLeer': 'Column {x}, row {y}, empty',
    'a11y.zelleZahl': 'Column {x}, row {y}, number {wert}',
    'a11y.zelleTeil': 'Column {x}, row {y}, part of the rectangle with the number {wert}',
    'a11y.dialogZu': 'Close',
    'a11y.gedeckt': 'Covered: {wert}. Still open: {offen}.',
  },
};

// Eingefroren, weil das Wörterbuch über `texte()` nach draußen gegeben wird
// und dort mit dem lebenden Objekt gearbeitet wird. Eine unbedachte
// Zuweisung in app.js würde sonst den Satz für ALLE Spieler dieser Sitzung
// ändern, und der Fehler wäre nur im Bild zu sehen, nirgends im Quelltext.
// Die Alternative – bei jedem Aufruf eine Kopie ausgeben – kostet bei einem
// Sprachwechsel drei Objekte mit je hundert Feldern, ohne etwas zu gewinnen.
for (const spr of Object.keys(TEXTE)) Object.freeze(TEXTE[spr]);
Object.freeze(TEXTE);

/* ------------------------------------------------------------------ Motor */

/**
 * Welche der drei Sprachen will das Gerät?
 *
 * `liste` ist gedacht für `navigator.languages` – eine nach Vorliebe
 * sortierte Liste wie ['de-AT', 'de', 'en-US']. Genommen wird die erste,
 * die wir überhaupt sprechen; von 'de-AT' interessiert nur der Teil vor
 * dem Bindestrich, denn ein eigenes Österreichisch gibt es hier nicht.
 *
 * Die Funktion sieht ABSICHTLICH nicht selbst in `navigator` – sie bleibt
 * eine reine Funktion ihres Arguments. Node 22 bringt selbst ein
 * `globalThis.navigator` mit, und ein Rückgriff darauf hätte die Tests von
 * der Spracheinstellung des Rechners abhängig gemacht, auf dem sie laufen.
 * Den Zugriff auf das Gerät macht app.js, das ohnehin im Browser steht.
 */
export function erkenneSprache(liste) {
  // Eine einzelne Zeichenkette ('de-AT') ist ein häufiger Vertipper an der
  // Aufrufstelle und hier billig zu verzeihen; ohne diese Zeile käme sie
  // als Liste ihrer Buchstaben herein.
  const quelle = typeof liste === 'string' ? [liste]
    : (Array.isArray(liste) ? liste : []);
  for (const eintrag of quelle) {
    if (typeof eintrag !== 'string') continue;
    const kurz = eintrag.toLowerCase().split('-')[0];
    if (SPRACHEN.includes(kurz)) return kurz;
  }
  return STANDARD;
}

/**
 * Das ganze Wörterbuch einer Sprache. Für tools/gen-manifests.mjs, für
 * tools/check-i18n.mjs und für die Tests – das Spiel selbst nimmt `t`.
 * Eine unbekannte Sprache bekommt das deutsche Wörterbuch, nicht undefined:
 * jeder Aufrufer hier müsste sonst denselben Rückfall selbst schreiben.
 */
export function texte(sprache) {
  return TEXTE[sprache] ?? TEXTE[STANDARD];
}

/**
 * Ein Satz, mit eingesetzten Platzhaltern.
 *
 * Drei Entscheidungen, die man beim Lesen sonst für Zufall hält:
 *
 * 1. Fehlt der Schlüssel in der gewählten Sprache, kommt der deutsche Satz.
 *    Eine halb deutsche Oberfläche ist unangenehm, ein roher Schlüssel im
 *    Bild ist ein Fehlerbericht. Dass es nie dazu kommt, sichert der Test
 *    "alle drei Sprachen, derselbe Schlüsselsatz" ab.
 * 2. Kennt auch das Deutsche den Schlüssel nicht, kommt der Schlüssel
 *    selbst zurück. Das ist bewusst hässlich: ein leeres Feld fällt
 *    niemandem auf, "hinweis.zuKlein" mitten im Dialog schon.
 * 3. Ein Platzhalter, für den kein Wert (oder null/undefined) da ist,
 *    bleibt stehen. Der naheliegende Weg – String(wert) – schreibt sonst
 *    "undefined" ins Bild, und das sieht wie ein Text aus. "{zeit}" sieht
 *    wie ein Fehler aus, und genau das ist es dann auch.
 */
export function t(sprache, schluessel, werte) {
  const wb = TEXTE[sprache] ?? TEXTE[STANDARD];
  const satz = wb[schluessel] ?? TEXTE[STANDARD][schluessel];
  if (typeof satz !== 'string') return String(schluessel);
  if (!werte) return satz;
  return satz.replace(/\{(\w+)\}/g, (ganz, name) => {
    const wert = werte[name];
    return wert === undefined || wert === null ? ganz : String(wert);
  });
}

/**
 * Schreibt alle Texte unter `wurzel` neu. Drei Attribute, drei Ziele:
 *
 *   data-i18n              -> textContent
 *   data-i18n-aria         -> aria-label
 *   data-i18n-platzhalter  -> placeholder
 *
 * Dazu zwei Zugaben, die nichts kosten und ein Loch verhindern, falls
 * index.html sie doch braucht: data-i18n-titel -> title und
 * data-i18n-html -> innerHTML. Letzteres ist nur deshalb unbedenklich,
 * weil der Inhalt aus diesem Wörterbuch kommt und von nirgends sonst; es
 * geht kein Spielername und kein Wert aus dem Netz hier durch.
 *
 * Warum bei jedem Sprachwechsel über die ganze Seite gelaufen wird, statt
 * einzelne Verweise zu pflegen: bei rund hundert Stellen ist der Lauf
 * billiger als die Buchführung – und es kann keine Stelle vergessen werden.
 *
 * `werte` gilt für ALLE Stellen. Nur ein Schlüssel im Markup braucht
 * überhaupt einen Wert (einst.fassung), und app.js gibt ihn dort mit.
 * Fehlt er, bleibt "{fassung}" sichtbar stehen – siehe `t`.
 *
 * Rückgabe: die Zahl der geschriebenen Stellen. Damit kann eine Abnahme
 * prüfen, dass überhaupt etwas passiert ist; ein Aufruf, der 0 zurückgibt,
 * heißt fast immer, dass die Wurzel die falsche war.
 */
export function anwenden(wurzel, sprache, werte) {
  if (!wurzel || typeof wurzel.querySelectorAll !== 'function') return 0;
  const spr = SPRACHEN.includes(sprache) ? sprache : STANDARD;
  let geschrieben = 0;

  const lauf = (attribut, feld, setzen) => {
    for (const el of wurzel.querySelectorAll(`[${attribut}]`)) {
      const schluessel = el.dataset?.[feld] ?? el.getAttribute?.(attribut);
      if (!schluessel) continue;
      setzen(el, t(spr, schluessel, werte));
      geschrieben++;
    }
  };

  lauf('data-i18n', 'i18n', (el, text) => { el.textContent = text; });
  lauf('data-i18n-aria', 'i18nAria', (el, text) => el.setAttribute('aria-label', text));
  lauf('data-i18n-platzhalter', 'i18nPlatzhalter',
    (el, text) => el.setAttribute('placeholder', text));
  lauf('data-i18n-titel', 'i18nTitel', (el, text) => el.setAttribute('title', text));
  lauf('data-i18n-html', 'i18nHtml', (el, text) => { el.innerHTML = text; });

  return geschrieben;
}
