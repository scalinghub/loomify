# Loomify

Internes Tool, das Loom-Videos automatisch transkribiert und daraus Präsentationen erstellt.

**Loom URL → Video Download → Gemini Transkription → Gamma Präsentation**

## Voraussetzungen

- **macOS** mit [Homebrew](https://brew.sh)
- **Node.js** 20+ (`brew install node`)
- **Gamma Account** mit API-Zugang (Pro, Ultra, Team oder Business)
- **Google Gemini API Key** aus [Google AI Studio](https://aistudio.google.com/apikey)

## Installation

```bash
git clone https://github.com/scalinghub/loomify.git
cd loomify
chmod +x setup.sh
./setup.sh
```

Das Setup-Script prüft/installiert automatisch Node.js, npm und yt-dlp.

## Starten

```bash
npm run dev
```

Dann im Browser öffnen: **http://localhost:3002**

## Einrichtung

Beim ersten Start in der App unter **Einstellungen** die API-Keys eingeben:

| Key | Wo bekomme ich den? |
|-----|---------------------|
| **Gemini API Key** | [Google AI Studio](https://aistudio.google.com/apikey) |
| **Gamma API Key** | Gamma App → Settings → API |
| **Gamma Template ID** | (Optional) Eigene Vorlage aus Gamma |

Die Keys werden lokal im Browser gespeichert und bleiben über Sessions erhalten.

## Features

- **Batch-Verarbeitung** — Bis zu 10 Loom-URLs gleichzeitig
- **Merge-Modus** — Mehrere Videos zu einer Präsentation zusammenführen
- **Folienanzahl** — Anzahl der Folien pro Präsentation wählbar (3-30)
- **Parallele Verarbeitung** — Max. 2 Videos werden gleichzeitig verarbeitet
