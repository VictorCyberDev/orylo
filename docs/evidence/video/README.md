# Demonstration video — provenance and honest limits

File: `docs/evidence/video/orylo-demo.mp4` · 1280×720, H.264, 25 fps, **49.1 s**, no audio (captions are plain text cards).
Produced by `scripts/record-demo-video.mjs` against the **deployed** site `https://orylo-demo.vercel.app` on 2026-11-11 (case ORY-1005, receipt RCPT-20261111-4DCE20566EB43A83).

## What is real
* **0:05.5–0:23** eGain's own public agent page (`https://ai.egain.cloud/r9iv/system/web/apps/aiagent/cc/web/index.html?agentid=015f4f90-8772-4065-9e64-894b3615c5d3&platform=standalone&flavor=ss`) is asked "I asked to cancel my subscription last week but I was charged again. What is your policy?" and answers from the policy documents with cited sources. Real recording, real wait included; the wording varies between runs (the agent is non-deterministic).
* **0:26–0:35** Orylo (a **separate system**, captioned as such): the customer is asked for consent, the earlier cancellation is applied and **verified** by read-back, the billing review is opened and stays **pending** ("No money has moved").
* **0:38–0:42** the public receipt check accepts the receipt: "Genuine receipt".
* **0:42–0:46** the customer requests a callback; the case shows "Waiting for a team member to pick it up".
* Frames are Chrome screencast frames of real browser sessions with their real timestamps; clips are only concatenated. Nothing is composited into the footage.

## What the video does NOT show (and must not be described as showing)
* The eGain agent **does not call Orylo**. The two are recorded separately; the cards say so. There is no eGain-originated action in this video.
* No eGain pre-chat form, guided process workflow or two-option escalation: they were not observable on the published agent (see `egain/published-agent-acceptance-log.md`).
* The eGain chat bubble is **not** shown working inside Orylo's pages on the public site: eGain's API admits only its own origin until the owner adds `https://orylo-demo.vercel.app` to the agent's allowed domains. The footage of Orylo's portal therefore shows the widget status chip "Loading the support assistant…" (it turns into "unavailable" after 20 s). That chip is real and left in.
* No narration. One near-white frame appears at a page navigation (about 0:42, the page navigation before the callback clip).

## Hosting
The mandate's submission forms ask for a **video URL**. This file is in the repository; uploading it to a video host (YouTube/Vimeo/…) needs the owner's account and was **not done**.
