# Vantage demo video

File: `video/Vantage-demo.mp4` (1920x1080, H.264 + AAC, 1:59.9). It is a real screen recording of the app plus Apple-style title cards and an original ambient track. There is no voiceover: the story is carried by title cards and what happens on screen.

## What the video must say

- **What it is:** an agent that answers one question about a market, company or idea by mapping Crustdata's live graph of companies, people, jobs and funding.
- **Who it is for:** investors, operators and founders. Each gets a different answer and a different set of views.
- **The problem it solves:** the answers to "Who is winning? Who is coming for us? Is there room for me?" are scattered across companies, people, jobs and money.
- **The value it adds:** the decision comes first, and every number links to the exact Crustdata response behind it.

## Timeline

| Time | On screen | Text |
|---|---|---|
| 0:00 | Black title card | Every market decision starts with a question. |
| 0:03 | Black title card | The answers are buried across companies, people, jobs and money. |
| 0:05 | Title card with logo | VANTAGE · Ask about any market. Get the decision, with receipts. |
| 0:08 | Home page. The question "Is Harvey AI worth backing against Legora?" is typed live, then the page scrolls to the persona cards and the library of recorded live runs | (UI only) |
| 0:23 | Title card | INVESTOR · Is Harvey AI worth backing against Legora? |
| 0:26 | Run page (investor), see beat list below | (UI only) |
| 0:59 | Title card | OPERATOR · We are Linear. Who is coming after our customers? |
| 1:02 | Run page (operator), see beat list below | (UI only) |
| 1:27 | Title card | FOUNDER · Is there room for a new AI note-taker for doctors in the US? |
| 1:29 | Run page (founder), see beat list below | (UI only) |
| 1:54 | Title card | LIVE ON CRUSTDATA · Companies. People. Jobs. Funding. Every number, cited. |
| 1:57 | Title card with logo | VANTAGE · Decisions, with receipts. |

### Investor: Is Harvey AI worth backing against Legora?
1. **Brief, answer first:** "Strong — dig in: Harvey ranks #1 of 16 on momentum". The tiles show rank, momentum, raised, claims that hold, investors in the market and sources.
2. **Evidence:** a number is clicked and the evidence drawer opens with the Crustdata endpoint and JSON.
3. **Momentum:** the 12-month scrubber plays and a leaderboard row is opened.
4. **Truth:** Harvey's own claims checked against the graph ("2 hold").
5. **Capital:** who backs the market.
6. **Decisions:** "Legora is not pulling ahead: Harvey 77 vs Legora 74 on momentum", diligence questions, the Watchtower.
7. **Persona switch:** the header is clicked to Operator, then Founder. The page reshapes with no refetch.

### Operator: We are Linear. Who is coming after our customers?
1. **Brief:** "Threat #1: Notion is accelerating fastest".
2. **Evidence:** a number is clicked to open its source.
3. **Momentum:** who is accelerating and who is stalling (scrubber plays).
4. **Atlas:** the globe is dragged to show where rivals employ people and hire.
5. **Talent:** a hover over the chord shows who is hiring from whom.
6. **Decisions:** moves, the latest-signals timeline (funding, hires, expansions) and live watches.

### Founder: Is there room for a new AI note-taker for doctors in the US?
1. **Brief:** crowdedness 48/100. The players are DeepScribe, Heidi, Scrivas, Autoscriber and others.
2. **Evidence:** a number is clicked to open its source.
3. **Atlas:** the globe is dragged to show where the market is, and isn't.
4. **Momentum:** who is winning and who is stalling.
5. **Capital:** which investors to pitch first.
6. **Decisions:** crowdedness, leaders, the wedge, live signals and watches.

## Key features shown

- **One question in:** natural language input; the persona is detected automatically.
- **Live agent trace:** every Crustdata call, plus every accepted and rejected candidate with a reason.
- **Answer-first brief:** six numbers chosen for the persona.
- **Persona-shaped scenes:**
  - Investor: Momentum, Truth, Capital, Talent, Decisions.
  - Operator: Momentum, Build vs Sell, Atlas, Talent, Decisions.
  - Founder: Atlas, Momentum, Capital, Decisions.
- **A "what to do" line on every scene.**
- **Every number clickable to its Crustdata evidence.**
- **Decisions plus Watchtower:** real Crustdata entity and discovery watches, and a latest-signals timeline.
- **Recorded library:** the runs open instantly, and "Run live" re-runs one against the API.

## Rebuild or re-cut

The sources are in `video/src/`. You need the app running (backend on :8001, frontend on :3000), ffmpeg, and Node with Playwright.

```bash
cd video/src
node rec.mjs rec home      # also: harvey, linear, scribe (run all four in parallel); records real browser sessions
node cards.mjs .           # renders title cards and captions from cards.json into cards/
python3 music.py music.wav 120
python3 live.py            # -> Vantage-demo-live.mp4 (title cards + trimmed recordings + music)
```

- **To change the wording,** edit `cards.json`.
- **To change the order, durations or speed,** edit the `seq` list in `live.py`. `rec(name, keep_seconds, speed)` keeps the last N seconds of a recording.
- **To change on-screen actions,** edit `rec.mjs`: scroll targets, clicks, the globe drag and persona switching.
- **There is also a stills-and-zoom variant:** `cap1.mjs` (screenshots) plus `assemble.py`. It is not committed, but can be regenerated.

## Known issues visible in the current cut

- After a number is clicked in the investor run, the evidence drawer stays open over the Truth scene for a moment.
- Harvey's Truth scene shows a garbled claim card, "3,500+ Countries". The site actually says 3,500+ customers in 85+ countries.
- The Capital sidebar double-counts co-led rounds: it shows 14 rounds and $2.1B where the real figures are 10 rounds and about $1.4B.
