# StageOne 🎤

> A TikTok-style social app for emerging singers to share performances, get discovered, and rise toward a live virtual concert.

## Live Demo

**App:** https://cal-tracker--ahmadshraim45.replit.app  
**Repo:** https://github.com/ahmadshraim08-arch/stageone

---

## What is StageOne?

StageOne lets singers record and share 60-second vocal performances called **Music Minutes**. Fans discover talent, tip creators with **Golden Mics**, and follow their favourite artists. The top performers rise up a score-based leaderboard toward **StageOne Live** — a virtual concert for the best of the best.

### Key Features

- 🎵 **Music Minutes** — 60-second vocal performance clips with automatic lyric overlays powered by Musixmatch
- 🎙️ **AI Song Matching** — upload a video and the app automatically identifies the song you're covering using ElevenLabs transcription + Musixmatch
- 🏆 **Golden Mics** — tipping system for fans to support creators
- 📈 **StageOne Score** — leaderboard that tracks creator momentum toward StageOne Live
- 💬 **Direct Messaging** — inbox with conversation threads; share Music Minutes inside messages
- 🔍 **Discovery Feed** — TikTok-style swipe feed of trending performances
- 👤 **Creator Profiles** — followers, following, post grid, score display

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Expo / React Native (iOS + Android + Web) |
| Auth | Clerk |
| API | Express 5 + Node.js 24 |
| Database | PostgreSQL + Drizzle ORM |
| AI Transcription | ElevenLabs Scribe |
| Lyrics | Musixmatch API |
| Storage | Replit Object Storage (GCS) |
| Validation | Zod v4 |
| Monorepo | pnpm workspaces |
| Language | TypeScript 5.9 throughout |

---

## How the Analysis Pipeline Works

When a singer uploads a video:

1. **Video retrieved** from object storage via signed URL
2. **ElevenLabs Scribe** transcribes the vocal performance directly from the video (no audio extraction needed)
3. **Musixmatch** matches the transcript against its song database
4. **Lyric range detection** identifies which section of the song was performed
5. Lyrics are overlaid on the video in sync with the performance

If direct video transcription fails, the pipeline automatically falls back to FFmpeg audio extraction before retrying with ElevenLabs.

---

## Project Structure
