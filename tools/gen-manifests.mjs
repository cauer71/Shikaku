#!/usr/bin/env node
/**
 * Erzeugt je Sprache ein Web-App-Manifest aus i18n.js.
 *
 *   node tools/gen-manifests.mjs
 *
 * Warum drei Dateien und nicht eine? Ein Manifest kann sich nicht selbst
 * uebersetzen. name, short_name, description und die Namen der Kurzbefehle
 * stehen als feste Zeichenketten darin, und der Browser liest genau die
 * Datei, auf die <link rel="manifest"> zeigt - kein Aushandeln, kein
 * Accept-Language. Also gibt es eine Datei je Sprache, und der Startschnipsel
 * im <head> von index.html haengt den Verweis noch vor dem ersten Bild um.
 * Damit steht im Installationsdialog und auf dem Startbildschirm derselbe
 * Text wie im Spiel; sonst waere die Mehrsprachigkeit an der Haustuer zu Ende.
 *
 * Die Texte kommen aus dem Woerterbuch und nicht aus einer zweiten Quelle.
 * Der bequeme Weg waere gewesen, die drei Dateien von Hand zu pflegen - und
 * genau der geht bei der zweiten Textaenderung schief, weil niemand daran
 * denkt, dass ein Titel an vier Stellen steht.
 *
 * Alles ausser dem Text steht EINMAL in manifest.webmanifest: Icons, Groessen,
 * Farben, Anzeigeart, Adressen der Kurzbefehle. Diese Datei ist die Vorlage,
 * die drei anderen sind Kopien mit ersetzten Texten. Wer ein Icon dazulegt,
 * fasst also eine Datei an und laesst dieses Werkzeug laufen.
 *
 * Die Reihenfolge der Schluessel bleibt dabei die der Vorlage: der
 * Objekt-Spread behaelt sie, und ein erneut zugewiesener Schluessel wandert
 * nicht nach hinten. Deshalb sind die vier Dateien Zeile fuer Zeile
 * vergleichbar - ein Diff zeigt dann wirklich nur den geaenderten Text.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * i18n.js baut ein anderer Teil des Projekts. Fehlt die Datei noch, ist das
 * kein Absturz mit Stapelspur, sondern eine Auskunft und Rueckgabecode 1:
 * dieses Werkzeug ist eine Zutat, kein Pflichtschritt, und die vier Manifeste
 * liegen fertig im Verzeichnis. Ein Absturz hier saehe aus wie ein Defekt im
 * Projekt und ist doch nur eine Reihenfolge.
 */
let i18n;
try {
  i18n = await import(join(WURZEL, 'i18n.js'));
} catch (fehler) {
  console.error('i18n.js liess sich nicht laden - die Manifeste bleiben, wie sie sind.');
  console.error(`  Grund: ${fehler?.message ?? fehler}`);
  process.exit(1);
}

const { SPRACHEN, t } = i18n;
if (!Array.isArray(SPRACHEN) || typeof t !== 'function') {
  console.error('i18n.js hat nicht die erwartete Form (SPRACHEN, t) - abgebrochen.');
  process.exit(1);
}

const vorlage = JSON.parse(await readFile(join(WURZEL, 'manifest.webmanifest'), 'utf8'));

/*
 * Alle vier Stufen liegen als Kurzbefehl auf dem Startbildschirm. Die
 * Reihenfolge ist die des Spiels und nicht die des Alphabets - wer lange
 * drueckt, sucht "leicht" oben und "experte" unten.
 *
 * Die Adressen (./?neu=leicht) stehen bereits in der Vorlage; hier wird nur
 * der Text ersetzt. Sie noch einmal zu schreiben waere eine zweite Quelle
 * fuer dieselbe Angabe.
 */
const STUFEN = ['leicht', 'mittel', 'schwer', 'experte'];

let geschrieben = 0;
for (const sprache of SPRACHEN) {
  const manifest = {
    ...vorlage,
    name: t(sprache, 'app.titel'),
    short_name: t(sprache, 'app.titel'),
    description: t(sprache, 'app.beschreibung'),
    lang: sprache,
    shortcuts: STUFEN.map((stufe, i) => ({
      ...(vorlage.shortcuts?.[i] ?? {}),
      name: `${t(sprache, 'neu.titel')} – ${t(sprache, `stufe.${stufe}`)}`,
      short_name: t(sprache, `stufe.${stufe}`),
      url: `./?neu=${stufe}`,
    })),
  };

  /*
   * screenshots werden bewusst NICHT dazuerfunden. Ein Verweis auf eine Datei,
   * die es nicht gibt, macht in Chrome den Installationsdialog kaputt - er
   * zeigt dann gar nichts an, statt nur das fehlende Bild weglassen. Sind
   * eines Tages Bildschirmfotos da, gehoeren sie in die Vorlage und kommen
   * ueber den Spread von selbst hier durch.
   */

  const datei = join(WURZEL, `manifest.${sprache}.webmanifest`);
  await writeFile(datei, `${JSON.stringify(manifest, null, 2)}\n`);
  geschrieben++;
  console.log(`manifest.${sprache}.webmanifest: ${manifest.name} · `
    + `${manifest.shortcuts.length} Kurzbefehle`);
}
console.log(`${geschrieben} Manifeste geschrieben`);
