# DeinSweeper

Ein Logikspiel für das Smartphone im Stil von Minesweeper, mit vier eigenen Varianten.
**Jedes Spielfeld ist garantiert ohne Raten lösbar.**

| Variante | Idee |
|---|---|
| **Schwere Minen** | Kleine Minen zählen 1, große 2. Die Zahl ist die Summe der Nachbarn. |
| **Echolot** | Die Zahl zählt die Minen auf dem nächsten Ring, auf dem es Minen gibt. Die Ringe um die Zahl zeigen die Entfernung. |
| **Kompass** | Die Zahl zählt 12 Felder: die 8 Nachbarn plus je ein Feld zwei Schritte nach N, O, S und W. |
| **Magnetfeld** | Die Zahl zählt Magnete, die Farbe zeigt den überwiegenden Pol. Zum Sieg müssen alle Pole stimmen. |

Es gibt drei Schwierigkeitsgrade (8×10, 9×12 und 10×14). Punkte gibt es für schnelle Züge in Folge (Combo) und für einen Zeitbonus am Ende. Dazu kommen eine Bestenliste (auf dem Gerät und optional weltweit), Tipps, Sound und Vibration. Das Spiel lässt sich als App auf dem Homescreen installieren und läuft dann auch offline.

## Wie die Lösbarkeit garantiert wird

`js/core.js` enthält einen Logik-Löser, der nur mit den Informationen arbeitet, die auch die Spielerin oder der Spieler sieht. Er kombiniert höchstens 2 Hinweise (Leicht und Mittel) bzw. 3 Hinweise (Schwer). Ein Zufallsfeld wird nur angenommen, wenn der Löser es vom ersten Tipp an **komplett ohne Raten** aufdecken kann. Außerdem muss es eine Mindestzahl an Schritten enthalten, bei denen man mehrere Zahlen kombinieren muss, damit es wirklich etwas zu knobeln gibt.

Derselbe Löser liefert den **Tipp**-Button. Nach einer Explosion erklärt das Spiel außerdem, ob das Feld beweisbar eine Mine war oder ob geraten wurde.

Tests (Node 22.5+ wegen `node:sqlite`):

```bash
npm test                  # Lösbarkeit (20 Felder je Modus/Stufe) + Weltranglisten-Server
node test/check.mjs 100   # gründlicher
```

`test/check.mjs` prüft, dass jedes erzeugte Feld lösbar und reproduzierbar ist, dass der Löser nie einen echten Wert ausschließt und dass eine Partie, die nur den Tipps folgt, immer gewonnen wird. `test/api.mjs` prüft den Server: Echte Siege werden angenommen, unvollständige Partien, fremde Felder und gefälschte Zeiten werden abgelehnt.

## Lokal starten

```bash
npm run dev
```

Das startet das Spiel **mit einer lokalen Test-Weltrangliste** unter `http://localhost:8642` (die Datenbank liegt in `worker/.dev.sqlite`). Ohne Weltrangliste geht auch `python3 -m http.server 8642`.

## Weltrangliste (Cloudflare Worker + D1)

Die gemeinsame Bestenliste läuft als **eigener** Worker namens `knobelfeld-api` (der technische Name stammt noch aus der Entwicklung, für Spielerinnen und Spieler ist er unsichtbar). Andere Worker in deinem Cloudflare-Konto bleiben davon unberührt. Der kostenlose Tarif reicht locker: Eine Prüfung braucht weniger als 1 ms Rechenzeit.

**So schützt der Server vor Schummeln:** Der Browser schickt keine Punktzahl, sondern seine Züge. Der Server baut das Feld aus seinem eigenen Zufallswert nach, spielt die Züge nach und wertet nur echte Siege. Die Zeit misst er mit seiner eigenen Uhr, die Punkte rechnet er selbst aus. Jede Runde zählt nur einmal.

Einmalig einrichten (im Terminal, im Projektordner):

```bash
cd worker
npx wrangler login
npx wrangler d1 create knobelfeld
```

1. Die ausgegebene `database_id` in `worker/wrangler.toml` eintragen.
2. In `worker/wrangler.toml` bei `ALLOWED_ORIGINS` deine GitHub-Pages-Adresse ergänzen. Gemeint ist nur der Teil bis `.io`, ohne den Repository-Namen:
   `ALLOWED_ORIGINS = "https://<dein-name>.github.io,http://localhost:8642"`
3. Tabelle anlegen und Worker hochladen:
   ```bash
   npx wrangler d1 execute knobelfeld --remote --file=schema.sql
   npx wrangler deploy
   ```
4. `deploy` gibt eine Adresse aus, z. B. `https://knobelfeld-api.<name>.workers.dev`. Trage sie in `js/config.js` bei `PRODUCTION_API` ein.
5. Test im Browser: `https://knobelfeld-api.<name>.workers.dev/api/scores?mode=weighted&diff=easy` sollte `{"scores":[]}` zeigen.

Danach wie unten beschrieben auf GitHub hochladen. Bleibt `PRODUCTION_API` leer, läuft das Spiel einfach mit der Bestenliste auf dem jeweiligen Gerät.

Einen unpassenden Namen aus der Liste nehmen:

```bash
npx wrangler d1 execute knobelfeld --remote --command "UPDATE games SET name = NULL WHERE name = 'Unpassend'"
```

## Auf GitHub Pages veröffentlichen

1. Ein neues Repository auf GitHub anlegen (hier: `deinsweeper`).
2. Die Dateien hochladen:
   ```bash
   git init
   git add .
   git commit -m "DeinSweeper"
   git branch -M main
   git remote add origin git@github.com:cdapproach/deinsweeper.git
   git push -u origin main
   ```
3. Auf GitHub unter **Settings → Pages** bei *Source* die Option **Deploy from a branch** wählen, dann `main` und `/ (root)`, und speichern.
4. Nach ein bis zwei Minuten läuft das Spiel unter `https://cdapproach.github.io/deinsweeper/`.

Auf dem Handy die Seite öffnen und **„Zum Home-Bildschirm“** wählen. Danach startet das Spiel wie eine App, ohne Browserleiste.

**Nach Änderungen:** In `sw.js` die `VERSION` erhöhen (z. B. von `deinsweeper-v4` auf `deinsweeper-v5`), damit installierte Apps die neue Version laden.

## Dateien

- `index.html`, `css/style.css`: Oberfläche
- `js/core.js`: Varianten, Generator, Löser (ohne DOM, testbar in Node)
- `js/main.js`: Spielablauf, Eingabe, Punkte, Bestenliste
- `js/worker.js`: erzeugt Felder im Hintergrund
- `js/config.js`, `js/online.js`: Adresse und Anbindung der Weltrangliste
- `worker/`: Cloudflare Worker (`src/index.js`), Datenbank-Schema, lokaler Testserver (`dev.mjs`)
- `js/audio.js`, `js/fx.js`, `js/icons.js`: Sound, Partikel, Symbole
- `sw.js`, `manifest.webmanifest`, `icons/`: installierbare Web-App (PWA)
- `test/check.mjs`, `test/api.mjs`: Tests
