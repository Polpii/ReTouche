# ReTouche

> **Embodied Representations for Self-Directed Piano Learning**
>
> Accepted at **ACM CHI 2026** (full paper).
>
> Developed at the Institute for Future Technologies and the Neuroscience Institute Paris.

Live deployment: **[retouche.vercel.app](https://retouche.vercel.app/)**

---

## What this is

ReTouche is a **projection-augmented piano-learning system**. Instead of moving the learner's attention away from the keyboard to a screen — as scrolling sheet music or DAW overlays typically do — ReTouche projects guidance **directly onto the piano and the player's hands**. Combined with a player piano whose keys move under software control and a small set of high-level interaction tools, the system keeps the learner anchored in the embodied task and reshapes *where attention lives during practice*.

The system is the artefact of a broader research question: how do different forms of representation — *situated*, *sensorimotor*, and *social* — change agency, attention reorientation, and sustained engagement in self-directed motor learning?

This repository contains the **web-based control surface and content management app** used to run the study, deployed at [retouche.vercel.app](https://retouche.vercel.app/). The physical projection-mapping and player-piano stack lives in a separate (mostly hardware-bound) repository.

---

## Research contributions

The CHI 2026 paper makes three contributions, each backed by a different evaluation method:

1. **A typology of embodied representations for piano learning** — distinguishing *situated* (on-instrument cues), *sensorimotor* (movement-coupled feedback), and *social* (teacher / peer presence) modes.
2. **A comparative structured observation** (n = 18, three conditions) showing how each representation type supports a different learning move (orientation, repair, sustained attention).
3. **A longitudinal autoethnography + expert focus group** triangulating the lab findings with multi-week real-world use and expert (instructor) critique.

A summary of the design rationale, the study protocol, and the evidence is available on the portfolio project page.

---

## What this repository contains

This repo is the **Next.js 15 / TypeScript** web app that:

- serves the learner-facing interface (lesson navigation, projected-content selection, session controls);
- serves the teacher-facing interface (content authoring, learner monitoring, session annotations);
- backs both with **Firebase** (Auth + Firestore + Hosting + App Hosting);
- exposes the data layer used by the projection-mapping client (the on-instrument display).

```
├── app/                    # Next.js app router (learner + teacher routes)
├── components/             # Shared UI components
├── data/                   # Lesson data, song catalogue, study assets
├── firebase/               # Firebase client/server initialisation
├── public/                 # Static assets (icons, illustrations)
├── apphosting.yaml         # Firebase App Hosting config
├── firebase.json           # Hosting + emulators config
├── next.config.ts
├── tsconfig.json
└── tailwind.config.ts
```

The companion projection client (player-piano control, projection mapping, MIDI bridge) subscribes to the same Firestore collections, so session state is consistent across the web app and the physical setup.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth + Data | Firebase (Auth, Firestore) |
| Hosting | Firebase App Hosting + Vercel (mirror) |
| Deployment | GitHub Actions (`.github/workflows/`) |

---

## Getting started

### Prerequisites

- Node.js **20+**
- A Firebase project (free tier is enough). Enable **Authentication** (Email/Password or Google) and **Firestore**.

### Install and run

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local       # then fill in NEXT_PUBLIC_FIREBASE_* keys

# 3. Run
npm run dev                       # http://localhost:3000
```

### Production build

```bash
npm run build
npm start
```

### Deploy

```bash
# Vercel
vercel --prod

# Firebase App Hosting
firebase deploy --only apphosting
```

---

## Data model (Firestore)

The schema is intentionally flat and append-only so that the study data is easy to audit and replay:

```
users/{userId}                       # learner or teacher profile
lessons/{lessonId}                   # static lesson metadata + score reference
sessions/{sessionId}                 # one practice session
  events/{eventId}                   # ordered events (note on/off, hint shown, etc.)
annotations/{annotationId}           # teacher-side or self-annotation
content/{contentId}                  # projected-content packages
```

Session events are the single source of truth for the projection client and for downstream behavioural analysis.

---

## Research evaluation

The CHI 2026 paper is based on three triangulated studies:

| Study | Method | Sample | What it tells us |
|---|---|---|---|
| Comparative structured observation | 3-arm controlled comparison | n = 18 | Which representation supports which learning move |
| Longitudinal autoethnography | Multi-week first-person log | n = 1 | How the system holds up in real use |
| Expert focus group | Semi-structured group session | piano instructors | External validity + design critique |

Analysis was done in Python (`pandas`, `scipy.stats`) and R (mixed-effects models). The CSV/JSON logs and the analysis notebooks live in the study branch and are available on request for replication.

---

## Citation

```bibtex
@inproceedings{arslan2026retouche,
  title     = {ReTouche: Embodied Representations for Self-Directed Piano Learning},
  author    = {Arslan, Paul-Peter and Xiao, Xiao and others},
  booktitle = {Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems (CHI '26)},
  year      = {2026},
  publisher = {ACM}
}
```

---

## License

MIT — see [`LICENSE`](LICENSE).
