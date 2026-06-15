---
name: LyricStage absMs timing formula
description: How to compute the active lyric line from video position + section offset.
---

A performer's video starts at the beginning of the section they chose. The section
starts at `section.startMs` within the full track. The user can also dial in a
`timingOffsetMs` to compensate for recording latency.

**Formula:**
```ts
const absMs = videoPositionMs + section.startMs + section.timingOffsetMs;
const activeLine = lines.find(
  l => l.startMs !== null && l.endMs !== null && absMs >= l.startMs && absMs < l.endMs
) ?? null;
```

**Why:** `videoPositionMs` = elapsed time inside the video (polled via `Video.getStatusAsync()` every 250 ms). Adding `section.startMs` converts this to a position in the full track's lyric timeline. `timingOffsetMs` (adjustable ±200 ms in the post flow) corrects for any recording lag.

**How to apply:** Use this formula in `MusicMinuteCard.tsx` (lyric overlay) and in any
future lyric-karaoke replay screen. The polling interval (250 ms) is a tradeoff between
smoothness and battery — do not reduce below 100 ms.
