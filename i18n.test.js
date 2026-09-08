/**
 * Prüft die drei Wörterbücher gegeneinander und den Motor darum herum.
 *
 * Übersetzungen gehen selten daran kaputt, dass ein Satz unschön klingt –
 * sie gehen daran kaputt, dass ein Schlüssel vergessen wurde und die
 * Oberfläche halb deutsch bleibt, oder dass ein Platzhalter fehlt und im
 * Bild plötzlich eine Zahl weniger steht als gemeint. Beides ist von Hand
 * nicht zu finden und hier in wenigen Zeilen zu erschlagen.
 *
 * Der zweite Teil prüft `anwenden` gegen ein handgeschriebenes Miniatur-DOM.
 * Ein echtes DOM (jsdom) wäre die erste Abhängigkeit des Projekts, und
 * gebraucht werden davon genau drei Dinge: querySelectorAll, dataset und
 * setAttribute. Die sind unten schneller gebaut als installiert.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPRACHEN, STANDARD, PLATZHALTER, erkenneSprache, texte, t, anwenden,
} from './i18n.js';

const platzhalterVon = (satz) => [...satz.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const ANDERE = SPRACHEN.filter((s) => s !== STANDARD);

/**
 * Die Schlüsselliste aus Abschnitt 7 des Vertrags, wörtlich abgeschrieben.
 * Steht hier als eigene Liste und wird nicht aus i18n.js abgeleitet – sonst
 * prüfte sich die Datei gegen sich selbst und ein gestrichener Schlüssel
 * fiele nie auf.
 */
const VERTRAG = `
app.titel  app.beschreibung  app.untertitel
hud.zeit  hud.offen  hud.stufe
stufe.leicht  stufe.mittel  stufe.schwer  stufe.experte
werkzeug.zurueck  werkzeug.vor  werkzeug.tipp  werkzeug.leeren  werkzeug.neu
regeln.titel  regeln.kern  regeln.p1  regeln.p2  regeln.p3
regeln.bedienungTitel  regeln.b1  regeln.b2  regeln.b3  regeln.b4
regeln.los  regeln.bildAlt
einst.titel  einst.darstellung  einst.skin  einst.thema  einst.sprache
einst.spiel  einst.kuerzel  einst.kuerzelHinweis  einst.welt  einst.weltHinweis
einst.hilfslinien  einst.vibration  einst.ueber  einst.fassung  einst.quelle
einst.rangliste  einst.zu
skin.mondrian  skin.papier  skin.m3
thema.auto  thema.hell  thema.dunkel
sprache.de  sprache.it  sprache.en
ende.gewonnen  ende.zeit  ende.weltrekord  ende.persoenlich  ende.gleichstand
ende.kuerzelFrage  ende.nochmal  ende.zu  ende.fehlerTipps  ende.ohneKuerzel
rang.titel  rang.leer  rang.platz  rang.zeit  rang.spieler  rang.weltrekord
rang.spiele  rang.siege  rang.offline  rang.hinweis  rang.du
neu.titel  neu.frage  neu.abbrechen  neu.laeuft
tipp.einzigerKandidat  tipp.einzigeDeckung  tipp.ausschluss  tipp.keiner
tipp.raeumeAuf
hinweis.rechteckWeg  hinweis.geleert  hinweis.nichtsRueckgaengig
hinweis.gespeichert  hinweis.offline  hinweis.kuerzelGesetzt  hinweis.zuKlein
a11y.regeln  a11y.einstellungen  a11y.brett  a11y.karteZeit  a11y.karteOffen
a11y.karteStufe  a11y.zelleLeer  a11y.zelleZahl  a11y.zelleTeil  a11y.dialogZu
a11y.gedeckt
`.trim().split(/\s+/);

/* ------------------------------------------------------- Die Wörterbücher */

test('es sind genau die drei Sprachen des Vertrags', () => {
  assert.deepEqual(SPRACHEN, ['de', 'it', 'en']);
  assert.equal(STANDARD, 'de');
  for (const spr of SPRACHEN) {
    assert.ok(Object.keys(texte(spr)).length > 90, `${spr}: Wörterbuch fast leer`);
  }
});

test('alle Schlüssel des Vertrags sind da', () => {
  for (const spr of SPRACHEN) {
    const ist = texte(spr);
    const fehlen = VERTRAG.filter((k) => !(k in ist));
    assert.deepEqual(fehlen, [], `${spr}: Schlüssel aus dem Vertrag fehlen`);
  }
  // 101 Schlüssel nennt der Vertrag – wenn diese Zahl kippt, ist beim
  // Abschreiben etwas verlorengegangen, nicht am Wörterbuch.
  assert.equal(VERTRAG.length, 101);
});

test('alle drei Sprachen haben denselben Schlüsselsatz', () => {
  for (const spr of ANDERE) {
    const soll = new Set(Object.keys(texte(STANDARD)));
    const ist = new Set(Object.keys(texte(spr)));
    assert.deepEqual([...soll].filter((k) => !ist.has(k)), [], `${spr}: fehlende Schlüssel`);
    assert.deepEqual([...ist].filter((k) => !soll.has(k)), [], `${spr}: unbekannte Schlüssel`);
  }
});

test('kein Text ist leer, keiner hat Leerzeichen am Rand', () => {
  for (const spr of SPRACHEN) {
    for (const [k, v] of Object.entries(texte(spr))) {
      assert.equal(typeof v, 'string', `${spr}/${k} ist keine Zeichenkette`);
      assert.ok(v.trim().length > 0, `${spr}/${k} ist leer`);
      // Kein Satz wird in Shikaku an einen anderen geklebt; ein Rand-
      // leerzeichen ist deshalb immer ein Versehen aus dem Umbrechen der
      // langen Zeichenketten im Quelltext.
      assert.equal(v, v.trim(), `${spr}/${k} hat ein Leerzeichen am Rand`);
    }
  }
});

test('nur die Platzhalter aus dem Vertrag kommen vor', () => {
  for (const spr of SPRACHEN) {
    for (const [k, v] of Object.entries(texte(spr))) {
      for (const name of platzhalterVon(v)) {
        assert.ok(PLATZHALTER.includes(name),
          `${spr}/${k}: {${name}} steht nicht in der erlaubten Liste`);
      }
    }
  }
});

test('jeder Platzhalter des deutschen Satzes steht auch im italienischen und englischen', () => {
  // Der häufigste Übersetzungsfehler überhaupt: der Satz klingt richtig,
  // aber die Zahl darin ist verschwunden. Verglichen werden die Mengen in
  // beide Richtungen – ein Platzhalter zu viel ist genauso falsch, denn
  // dann steht dort im Bild "{tipps}" und niemand füllt es.
  const quelle = texte(STANDARD);
  for (const spr of ANDERE) {
    const wb = texte(spr);
    for (const [k, deutsch] of Object.entries(quelle)) {
      assert.deepEqual(platzhalterVon(wb[k] ?? ''), platzhalterVon(deutsch),
        `${spr}/${k}: Platzhalter weichen ab (${wb[k]})`);
    }
  }
});

test('mit vollem Wertesatz bleibt kein Platzhalter übrig', () => {
  // Das ist die Gegenprobe zur erlaubten Liste: dass jeder {name} im Text
  // wirklich einer ist, den `t` auch ersetzt. Eine geschweifte Klammer, die
  // aus einem Umbruch stehen geblieben ist, fällt hier auf.
  const alle = Object.fromEntries(PLATZHALTER.map((p) => [p, 'X']));
  for (const spr of SPRACHEN) {
    for (const k of Object.keys(texte(spr))) {
      const fertig = t(spr, k, alle);
      assert.ok(!/[{}]/.test(fertig), `${spr}/${k}: ungelöst -> ${fertig}`);
    }
  }
});

test('Namen werden nicht übersetzt', () => {
  for (const spr of SPRACHEN) {
    const wb = texte(spr);
    assert.equal(wb['app.titel'], 'Shikaku', `${spr}: der Name des Rätsels wurde übersetzt`);
    assert.equal(wb['skin.m3'], 'Material 3', `${spr}: Material 3 ist ein Name`);
    assert.equal(wb['skin.mondrian'], 'Mondrian', `${spr}: Mondrian ist ein Name`);
    // Die Sprachnamen stehen in jeder Oberfläche in der eigenen Sprache,
    // sonst findet ein Italiener sein "Italiano" in der deutschen
    // Oberfläche nicht wieder.
    assert.equal(wb['sprache.de'], 'Deutsch');
    assert.equal(wb['sprache.it'], 'Italiano');
    assert.equal(wb['sprache.en'], 'English');
  }
});

test('die engen Felder halten ihre Zeichengrenze', () => {
  // Fünf Werkzeugknöpfe in einer Zeile auf 390 px, drei Statuskarten
  // darüber: das sind die Stellen, an denen ein langes Wort wirklich
  // hinausläuft. Die Grenzen sind grob und mit Luft gewählt – die feine
  // Messung macht später der Browser, nicht dieser Test.
  const GRENZE = {
    'werkzeug.zurueck': 9, 'werkzeug.vor': 9, 'werkzeug.tipp': 9,
    'werkzeug.leeren': 9, 'werkzeug.neu': 9,
    'hud.zeit': 10, 'hud.offen': 10, 'hud.stufe': 10,
    'stufe.leicht': 10, 'stufe.mittel': 10, 'stufe.schwer': 10, 'stufe.experte': 10,
    'thema.auto': 8, 'thema.hell': 8, 'thema.dunkel': 8,
    'skin.mondrian': 12, 'skin.papier': 12, 'skin.m3': 12,
    'rang.platz': 10, 'rang.zeit': 10, 'rang.spieler': 12,
    'einst.zu': 10, 'ende.nochmal': 12, 'ende.zu': 12, 'neu.abbrechen': 12,
  };
  for (const spr of SPRACHEN) {
    const wb = texte(spr);
    for (const [k, max] of Object.entries(GRENZE)) {
      assert.ok(wb[k].length <= max,
        `${spr}/${k}: ${wb[k].length} Zeichen, erlaubt sind ${max} ("${wb[k]}")`);
    }
  }
});

test('die Regeln sind in jeder Sprache ausformuliert', () => {
  // Der Regeltext ist das, was ein Neuling zuerst sieht. Ein Stichwort
  // statt eines Satzes fällt in der eigenen Sprache sofort auf, in einer
  // fremden nie – darum die harte Untergrenze.
  for (const spr of SPRACHEN) {
    const wb = texte(spr);
    for (const k of ['regeln.kern', 'regeln.p1', 'regeln.p2', 'regeln.p3']) {
      assert.ok(wb[k].length >= 110, `${spr}/${k}: nur ${wb[k].length} Zeichen`);
      assert.ok(/[.!?]$/.test(wb[k]), `${spr}/${k}: endet nicht mit einem Satzzeichen`);
    }
    for (const k of ['regeln.b1', 'regeln.b2', 'regeln.b3', 'regeln.b4']) {
      assert.ok(wb[k].length >= 40, `${spr}/${k}: nur ${wb[k].length} Zeichen`);
      assert.ok(/[.!?]$/.test(wb[k]), `${spr}/${k}: endet nicht mit einem Satzzeichen`);
    }
  }
});

test('kein Markup in den Texten', () => {
  // Shikaku setzt seine Texte über textContent. Ein <b> im Wörterbuch
  // stünde also als sichtbares "<b>" im Bild.
  for (const spr of SPRACHEN) {
    for (const [k, v] of Object.entries(texte(spr))) {
      assert.ok(!/<[a-zA-Z/]/.test(v), `${spr}/${k}: sieht nach Markup aus`);
    }
  }
});

test('das Malkreuz bleibt ein Malkreuz', () => {
  // × (U+00D7), nicht der Buchstabe x: in "2×3" steht es für die Form des
  // Rechtecks, und in einer sehr fetten Schrift ist der Unterschied groß.
  const quelle = texte(STANDARD);
  for (const spr of ANDERE) {
    const wb = texte(spr);
    for (const [k, deutsch] of Object.entries(quelle)) {
      if (!deutsch.includes('×')) continue;
      assert.ok(wb[k].includes('×'), `${spr}/${k}: Malkreuz verloren`);
      assert.ok(!/\d\s*x\s*\d/.test(wb[k]), `${spr}/${k}: kleines x statt Malkreuz`);
    }
  }
});

/* ------------------------------------------------------------- erkenneSprache */

test('erkenneSprache nimmt die erste bekannte Sprache', () => {
  assert.equal(erkenneSprache(['de-AT']), 'de', 'Österreichisch ist Deutsch');
  assert.equal(erkenneSprache(['fr', 'it-IT']), 'it', 'die erste bekannte gewinnt');
  assert.equal(erkenneSprache(['it-IT', 'de-DE']), 'it');
  assert.equal(erkenneSprache(['en-GB', 'it']), 'en');
  assert.equal(erkenneSprache(['IT']), 'it', 'Großschreibung stört nicht');
  assert.equal(erkenneSprache(['de_CH']), STANDARD,
    'der Unterstrich ist keine gültige Trennung – dann eben Deutsch als Quelle');
});

test('erkenneSprache verträgt jeden Unsinn', () => {
  assert.equal(erkenneSprache(undefined), STANDARD);
  assert.equal(erkenneSprache(null), STANDARD);
  assert.equal(erkenneSprache([]), STANDARD);
  assert.equal(erkenneSprache(['fr', 'es', 'ja']), STANDARD, 'keine davon sprechen wir');
  assert.equal(erkenneSprache([null, '', 42, 'it']), 'it', 'Lücken werden übersprungen');
  assert.equal(erkenneSprache('en-US'), 'en', 'eine einzelne Zeichenkette geht auch');
  assert.equal(erkenneSprache(42), STANDARD);
  assert.equal(erkenneSprache({}), STANDARD);
});

/* --------------------------------------------------------------------- t */

test('t setzt Platzhalter ein', () => {
  assert.equal(t('de', 'ende.zeit', { stufe: 'Mittel', zeit: '2:13' }), 'Mittel in 2:13');
  assert.equal(t('it', 'hinweis.kuerzelGesetzt', { kuerzel: 'CHR' }), 'Sigla CHR salvata.');
  assert.equal(t('en', 'einst.fassung', { fassung: '1.0.0' }), 'Version 1.0.0');
});

test('t lässt einen Platzhalter ohne Wert stehen', () => {
  assert.equal(t('de', 'einst.fassung'), 'Fassung {fassung}', 'ohne Werte gar nichts ersetzen');
  assert.equal(t('de', 'einst.fassung', {}), 'Fassung {fassung}');
  assert.equal(t('de', 'einst.fassung', { fassung: undefined }), 'Fassung {fassung}',
    'undefined ist kein Wert – sonst stünde "Fassung undefined" im Dialog');
  assert.equal(t('de', 'einst.fassung', { fassung: null }), 'Fassung {fassung}');
  assert.equal(t('de', 'einst.fassung', { falsch: 'x' }), 'Fassung {fassung}',
    'ein fremder Wertename füllt nichts');
});

test('t verträgt die Null und die Zahl', () => {
  assert.equal(t('de', 'ende.fehlerTipps', { fehler: 0, tipps: 0 }), 'Fehler 0 · Tipps 0',
    'die Null ist ein Wert und muss erscheinen');
  assert.equal(t('de', 'a11y.zelleZahl', { x: 3, y: 2, wert: 12 }),
    'Spalte 3, Zeile 2, Zahl 12');
});

test('t gibt bei einem unbekannten Schlüssel den Schlüssel zurück', () => {
  assert.equal(t('de', 'gibt.es.nicht'), 'gibt.es.nicht');
  assert.equal(t('it', 'gibt.es.nicht'), 'gibt.es.nicht');
  assert.equal(t('de', undefined), 'undefined', 'auch das darf nichts werfen');
});

test('t fällt bei unbekannter Sprache auf Deutsch zurück', () => {
  assert.equal(t('fr', 'werkzeug.tipp'), 'Tipp');
  assert.equal(t(undefined, 'werkzeug.tipp'), 'Tipp');
  // Und in jeder bekannten Sprache liefert jeder Schlüssel Text, nie sich selbst.
  for (const spr of SPRACHEN) {
    for (const k of Object.keys(texte(STANDARD))) {
      assert.notEqual(t(spr, k), k, `${spr}/${k} liefert den Schlüssel statt Text`);
    }
  }
});

/* -------------------------------------------------------------- anwenden */

/**
 * Ein Miniatur-DOM: genau so viel, wie `anwenden` anfasst. `querySelectorAll`
 * versteht dabei nur die eine Form, die vorkommt – "[data-...]".
 */
function bauDom(beschreibungen) {
  const elemente = beschreibungen.map((attribute) => {
    const dataset = {};
    for (const [name, wert] of Object.entries(attribute)) {
      // data-i18n-aria -> i18nAria, wie es der Browser in dataset schreibt
      const feld = name.replace(/^data-/, '')
        .replace(/-([a-z])/g, (ganz, b) => b.toUpperCase());
      dataset[feld] = wert;
    }
    return {
      attribute, dataset, textContent: '', innerHTML: '', gesetzt: {},
      setAttribute(name, wert) { this.gesetzt[name] = wert; },
      getAttribute(name) { return this.attribute[name] ?? null; },
    };
  });
  return {
    elemente,
    querySelectorAll(auswahl) {
      const name = auswahl.slice(1, -1);
      return elemente.filter((el) => name in el.attribute);
    },
  };
}

test('anwenden schreibt Text, aria-label und placeholder', () => {
  const dom = bauDom([
    { 'data-i18n': 'werkzeug.tipp' },
    { 'data-i18n-aria': 'a11y.brett' },
    { 'data-i18n-platzhalter': 'ende.kuerzelFrage' },
    { 'data-i18n': 'einst.zu', 'data-i18n-aria': 'a11y.dialogZu' },
  ]);
  const geschrieben = anwenden(dom, 'it');
  assert.equal(geschrieben, 5, 'vier Elemente, fünf Stellen');
  assert.equal(dom.elemente[0].textContent, 'Indizio');
  assert.equal(dom.elemente[1].gesetzt['aria-label'], 'Griglia di gioco');
  assert.equal(dom.elemente[2].gesetzt.placeholder, 'Sigla per la classifica');
  assert.equal(dom.elemente[3].textContent, 'Fatto');
  assert.equal(dom.elemente[3].gesetzt['aria-label'], 'Chiudi');
});

test('anwenden gibt die Werte an jede Stelle weiter', () => {
  const dom = bauDom([{ 'data-i18n': 'einst.fassung' }]);
  anwenden(dom, 'de', { fassung: '1.0.0' });
  assert.equal(dom.elemente[0].textContent, 'Fassung 1.0.0');
});

test('anwenden macht einen fehlenden Schlüssel sichtbar', () => {
  // Das ist die eigentliche Prüfung dieser Funktion: ein Loch im
  // Wörterbuch darf nicht als leeres Feld enden, sonst fällt es nie auf.
  const dom = bauDom([{ 'data-i18n': 'werkzeug.gibtsnicht' }]);
  anwenden(dom, 'de');
  assert.equal(dom.elemente[0].textContent, 'werkzeug.gibtsnicht');
});

test('anwenden verträgt eine unbekannte Sprache und eine fehlende Wurzel', () => {
  const dom = bauDom([{ 'data-i18n': 'werkzeug.neu' }]);
  anwenden(dom, 'kl');
  assert.equal(dom.elemente[0].textContent, 'Neu', 'Klingonisch fällt auf Deutsch zurück');
  assert.equal(anwenden(null, 'de'), 0);
  assert.equal(anwenden(undefined, 'de'), 0);
  assert.equal(anwenden({}, 'de'), 0, 'ein Objekt ohne querySelectorAll ist keine Wurzel');
});

test('anwenden überspringt ein leeres Attribut', () => {
  const dom = bauDom([{ 'data-i18n': '' }]);
  assert.equal(anwenden(dom, 'de'), 0);
  assert.equal(dom.elemente[0].textContent, '', 'nichts geschrieben, nichts kaputt');
});

test('das Wörterbuch lässt sich von außen nicht ändern', () => {
  // texte() gibt das lebende Objekt heraus; eingefroren kann eine
  // unbedachte Zuweisung in app.js den Satz nicht für alle verbiegen.
  const wb = texte('de');
  assert.throws(() => { wb['werkzeug.neu'] = 'Anders'; }, TypeError);
  assert.equal(t('de', 'werkzeug.neu'), 'Neu');
});
