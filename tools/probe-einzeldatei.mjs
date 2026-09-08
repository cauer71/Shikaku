/**
 * Prüft `shikaku.html`, indem ein Rätsel darin durchgespielt wird.
 *
 *   node tools/build-einzeldatei.mjs && node tools/probe-einzeldatei.mjs
 *
 * Warum das nötig ist: `build-einzeldatei.mjs` legt die Module in EINEN
 * Namensraum zusammen und schneidet dabei `import` und `export` heraus. Das
 * sind Eingriffe in fremden Code mit einem regulären Ausdruck, und die
 * naheliegende Prüfung — "lädt die Seite ohne Konsolenfehler" — ist zu schwach:
 * eine Funktion, die durch die Umbenennung ins Leere zeigt, fällt erst auf,
 * wenn sie gerufen wird. Also wird gespielt.
 *
 * Geöffnet wird über `file://` und ausdrücklich nicht über einen Server: das
 * ist der Fall, für den die Einzeldatei da ist, und er ist der strengere.
 * Module über `file://` unterliegen der Herkunftsregel, ein übrig gebliebener
 * `import` würde hier also scheitern, auch wenn er über HTTP durchgegangen
 * wäre.
 *
 * Braucht `playwright-core` und ein Chromium (Pfad über CHROMIUM_PATH).
 * Das ist ein Prüfwerkzeug, keine Abhängigkeit des Spiels.
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATEI = join(ROOT, 'shikaku.html');
const CHROME = process.env.CHROMIUM_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!existsSync(DATEI)) {
  console.error('shikaku.html fehlt — erst tools/build-einzeldatei.mjs laufen lassen.');
  process.exit(1);
}

const klagen = [];
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-DE',
});
await ctx.addInitScript("localStorage.setItem('sk.gesehen.v1','true');");
const seite = await ctx.newPage();

const fehler = [];
seite.on('pageerror', (e) => fehler.push('pageerror: ' + e.message));
seite.on('console', (m) => { if (m.type() === 'error') fehler.push('console: ' + m.text()); });
// Eine Einzeldatei darf NICHTS nachladen. Jede Anfrage nach außen ist ein Fehler
// im Zusammenlegen, auch eine, die zufällig gelingt.
seite.on('request', (r) => {
  if (!r.url().startsWith('file://')) klagen.push(`lädt nach: ${r.url()}`);
});

await seite.goto('file://' + DATEI, { waitUntil: 'load' });
await seite.waitForTimeout(1200);

const start = await seite.evaluate(() => ({
  fassung: window.__sk?.VERSION ?? null,
  stand: window.__sk?.stand?.() ?? null,
  zellen: document.querySelectorAll('#raster .zelle').length,
  zahlen: document.querySelectorAll('#raster .zahl').length,
  skin: document.documentElement.dataset.skin,
  // Ein Stilblatt muss wirklich wirken, nicht bloß im Dokument stehen.
  grund: getComputedStyle(document.body).backgroundColor,
}));
console.log('Geladen:', JSON.stringify(start));
if (!start.fassung) klagen.push('window.__sk fehlt — das Bündel läuft nicht');
if (!start.zellen) klagen.push('kein Brett gezeichnet');
if (!start.zahlen) klagen.push('keine Zahlen im Brett');
if (start.grund === 'rgba(0, 0, 0, 0)') klagen.push('kein Stil wirksam — <style> nicht angekommen');

/** Ein Rechteck ziehen, gerechnet aus der Brettgeometrie. */
async function ziehe(r) {
  const pt = await seite.evaluate((rr) => {
    const brett = document.getElementById('brett');
    const k = brett.getBoundingClientRect();
    const st = getComputedStyle(brett);
    const zb = k.width / Number(st.getPropertyValue('--spalten'));
    const zh = k.height / Number(st.getPropertyValue('--zeilen'));
    return { ax: k.left + (rr.x + 0.5) * zb, ay: k.top + (rr.y + 0.5) * zh,
             bx: k.left + (rr.x + rr.b - 0.5) * zb, by: k.top + (rr.y + rr.h - 0.5) * zh };
  }, r);
  await seite.mouse.move(pt.ax, pt.ay);
  await seite.mouse.down();
  await seite.mouse.move(pt.bx, pt.by, { steps: 3 });
  await seite.mouse.up();
}

// Der Tipp geht durch loeser.js — also durch das Modul, in dem umbenannt wurde.
// Er ist damit der Test, der die Umbenennung wirklich prüft.
await seite.click('#btn-tipp');
await seite.waitForTimeout(700);
const tipp = await seite.evaluate(() => ({
  teile: document.querySelectorAll('#teile .teil').length,
  hinweis: document.getElementById('hinweis')?.textContent?.trim() ?? '',
}));
console.log('Tipp:', JSON.stringify(tipp));
if (!tipp.teile && !tipp.hinweis) klagen.push('der Tipp tut nichts — Umbenennung in loeser.js prüfen');

/*
 * Die Lösung wird in NODE gerechnet, aus den Modulen — nicht im Browser aus
 * dem Bündel.
 *
 * Der naheliegende Weg wäre `seite.evaluate(() => erzeuge(...))`, und er
 * funktioniert nicht: das Bündel steht in einem `<script type="module">` und
 * hat damit seinen eigenen Bereich, `erzeuge` ist von außen nicht zu sehen.
 * Das ist kein Mangel, sondern der Grund, warum das Zusammenlegen überhaupt
 * ohne Namenskollisionen auskommt.
 *
 * Der Umweg über Node ist die strengere Prüfung: die Rechtecke kommen aus
 * `erzeuger.js`, das Brett auf dem Schirm hat das Bündel gezeichnet. Passen
 * sie zusammen, dann erzeugen beide Fassungen aus demselben Seed dasselbe
 * Rätsel — sonst würde kein einziges Rechteck sitzen.
 */
const { erzeuge } = await import('file://' + join(ROOT, 'erzeuger.js'));
const loesung = erzeuge(start.stand.stufe, start.stand.seed).loesung;
console.log(`Lösung aus den Modulen: ${loesung.length} Rechtecke ` +
            `(Seed ${start.stand.seed}, Stufe ${start.stand.stufe})`);
await seite.click('#btn-leeren');
await seite.waitForTimeout(300);
for (const r of loesung) await ziehe(r);
await seite.waitForTimeout(1200);

const ende = await seite.evaluate(() => ({
  fertig: window.__sk.stand().fertig,
  offen: window.__sk.stand().offen,
  endeOffen: document.getElementById('dlg-ende')?.open ?? false,
  zeit: document.getElementById('ende-zeit')?.textContent?.trim() ?? '',
  falsch: document.querySelectorAll('#teile .teil--fehler').length,
}));
console.log('Durchgespielt:', JSON.stringify(ende));
if (!ende.fertig) klagen.push('Lösung eingetragen, aber nicht als fertig erkannt');
if (!ende.endeOffen) klagen.push('Endedialog ging nicht auf');
if (ende.falsch) klagen.push(`${ende.falsch} Rechtecke der echten Lösung gelten als fehlerhaft`);
if (fehler.length) klagen.push('Seitenfehler: ' + fehler.join(' | '));

await browser.close();
console.log(klagen.length ? '\nFehlgeschlagen:\n  ' + klagen.join('\n  ')
                          : '\nshikaku.html ist spielbar.');
process.exit(klagen.length ? 1 : 0);
