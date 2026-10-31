# Demo run book

## Start (2 terminals)
```bash
cd backend && . .venv/bin/activate && uvicorn app.server:app --port 8001
cd frontend && API_ORIGIN=http://127.0.0.1:8001 npm run dev        # http://localhost:3000
```
No backend? The UI replays `fixtures/voice_ai.json`, a real recorded run, and shows a "Sample data" pill.

## Pre-flight (10 minutes before)
- [ ] `curl -s localhost:8001/api/credits` returns a number (key works, credits left).
- [ ] Warm the cache, one at a time:
      `python tests/smoke_api.py "Should I invest in Bland AI" --lens investor`
      `python tests/smoke_api.py "We are Retell" --lens operator`
      `python tests/smoke_api.py "AI voice agent platforms"`
      Cached calls are reused for 24 hours; a warm run finishes in about 10 s instead of 90 s.
- [ ] Browser at 100% zoom, 1440 px wide, dark theme, notifications off.
- [ ] Have a never-seen query ready for the live beat (any company or market not in the list above).

## Two-minute script
| Time | Do | Say |
|---|---|---|
| 0:00 | Type **Should I invest in Bland AI**, Enter | "One sentence. No human in the loop from here." |
| 0:10 | Point at the trace on the left | "It resolves Bland on Crustdata's identity graph and rejects the landscaping company with the same name. It finds peers from four sources and throws out agencies and noise, with a reason for each." |
| 0:30 | **01 Atlas**: press play on the scrubber | "Where these companies actually employ people, where they are hiring, where talent moves." |
| 0:45 | **02 Momentum**: hover Bland in the leaderboard | "Bland ranks first of sixteen. Every number is a receipt." Click **77** → evidence drawer shows the raw Crustdata response. |
| 1:00 | **03 Build vs Sell**, **04 Talent** (quick scroll) | "Who has switched to selling. Who hires from whom." |
| 1:10 | **05 Capital** | "Which investors back several players in this market." |
| 1:20 | **06 Truth** | "We fetched Bland's own website and checked its claims against the graph. Two hold. We also show every data conflict we resolved and everything we threw out." |
| 1:35 | **07 Decisions**, then flip the lens to **Operator**, then **Founder** | "Three cited moves per audience. Same data, no refetch." |
| 1:50 | Point at **Watchtower** | "And it keeps watching: two live Crustdata watches are registered on these peers right now." |

For the video, record a live run and speed up the 60–90 s wait in editing. On stage, use a warm query, then run one never-seen query to prove it is live.

## If something goes wrong
| Symptom | Do |
|---|---|
| Run hangs on a stage | The trace shows retries; wait 30 s or start the warm query again. |
| "Could not resolve" | That is the honest failure path. Say so, then type the company's domain (e.g. `bland.ai`). |
| Backend down | Open `http://localhost:3000/run/mock_voice_ai?q=AI+voice+agent+platforms` (recorded run). |
| Port 8000 busy | We use 8001; keep `API_ORIGIN=http://127.0.0.1:8001`. |

## Verified test inputs
| Input | Expected |
|---|---|
| AI voice agent platforms | 15 peers, 7 scenes, 2 live watches |
| Should I invest in Bland AI | 16 peers, Bland #1 on momentum, 2 claims verified |
| We are Retell | 16 peers, operator moves |
| AI receptionist for dental clinics in India | 13 receptionist products, not clinics |
| hubspot | resolves to hubspot.com |
| Zzzqx | "Could not resolve" in 1 s |
| zzz nonexistent corp xyz | honest "no peers" in 1 s |
