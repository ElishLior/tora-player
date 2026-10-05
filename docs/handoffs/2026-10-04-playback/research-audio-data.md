# Tora Player audio-data research — 2026-10-04

## Result and abstract input

Investigate duration authority across the catalog, media element, decoded file, progress rules, and offline copies. The current sample supports a browser-estimation hypothesis more strongly than a broad catalog-duration error. Preserve the documented final-minute / final-5% policy. Establish trustworthy duration evidence before a focused change.

Six complete public files decoded without errors. Their positive catalog durations agree with decoded audio within 0.41 seconds. Two public examples still contain zero duration despite substantial audio. Prior desktop WebKit metadata estimates differ from measured Opus files in both directions. Current desktop Chromium metadata agrees with ffprobe.

The application accepts a positive media-element duration for display and completion. A modeled execution shows that an underestimated duration can mark the final part complete too early. This report does not establish real mobile playback behavior.

## Scope and checkout

- Assignment: resume investigation audio-data, read-only research for later abstracts and development prompts.
- Checkout: /Users/liorelisha/tora-playback-reliability.
- Verified HEAD: 7c51a08c7ff4e3bdb023c8e8e7ab17bea2681c1a.
- Actual Git branch: codex/playback-reliability. The assignment label audio-data is not the Git branch.
- Initial Git status was clean. No checkout, dependency installation, repository edits, commits, pushes, deploys, or database/R2 writes occurred.
- Read the main checkout's AGENTS.md and CLAUDE.md, the specified Astra/Sol handoff, and the research checkout's CLAUDE.md.
- The research checkout has no AGENTS.md. Its CLAUDE.md differs from the main guide only in agent-workflow/reference sections.
- No delegation occurred. No credential file or account credential API was needed for fresh access.
- Fresh catalog access used public RSS and server-rendered public lesson pages. Audio access used public download and stream routes.
- Browser probes ran bare audio elements on /robots.txt. They did not mount the application, call play(), or send listen/progress events.
- The sole retained new deliverable is this report. Temporary audio and new intermediate JSON files were removed.
- The production deployment revision was not independently identified. Local source analysis applies to the verified research revision.

## Prior partial evidence inspected first

Primary local trace: /Users/liorelisha/.claude/projects/-Users-liorelisha-Tora-player/c41b386e-7774-48f5-b43b-3ab82cbda9e1/subagents/workflows/wf_ce052562-105/agent-a483c4e01fc687d4a.jsonl.

| Transcript lines | Evidence |
| --- | --- |
| 39–47 | Historical inventory: 245 published lessons, 429 audio-part rows, and 24 legacy lessons without part rows. |
| 47 | Part rows: 417 .opus and 12 .mp3. Five Opus rows and one MP3 row had zero duration. No M4A row appeared. |
| 79–80 | Prior slow-transfer experiment started. Its result file remains empty. |
| 83–84 | Eleven selected file probes with durations and one MP3 estimation warning. |
| 87 | Metadata-only browser script. No audio playback call. |
| 99–101 | Full decode of the 64 kbps MP3 reported approximately 01:31:36.73. |
| 133–136 | Follow-up preload/seek script and duration reference table. |
| 152–153 | Completed metadata-only logs for eleven samples in desktop WebKit and Chromium. |
| 156 | Session-limit interruption. No completed final analysis. |

The other inspected artifacts are under /private/tmp. Catalog artifacts: samples.tsv, truth.tsv, lesson_audio_all.json, lessons_all.json, and probe_all.tsv. Browser artifacts: el_duration.mjs, el_duration2.mjs, el_duration_webkit.json, and el_duration_chromium.json. These prior artifacts were not modified.

The interrupted broad probe contains 346 rows, not all 453 historical audio representations. Of these, 343 matched positive part durations in the historical catalog. Their maximum absolute difference was 0.538 seconds. This is counterevidence to a broad minutes-long catalog error. It is incomplete historical evidence, not a current full-catalog audit.

The prior script used Playwright 1.58.2. Its installed browser catalog listed Chromium 145.0.7632.6/revision 1208 and WebKit 26.0/revision 2248. These are desktop automation builds. The transcript did not record runtime browser versions or a mobile OS. They cannot establish an iOS Safari version.

No el_duration2_*.json result exists. Do not claim that preload-auto or near-end seeks corrected the duration. The prior timeout experiment supplies no usable conclusion. Workflow completion does not establish successful research.

## Current public catalog checks

[Public RSS](https://tora-player.vercel.app/feed.xml) returned HTTP 200. It still lists the September 25 part GUIDs with durations 4642 and 3819 seconds. It omits itunes:duration for both selected zero-duration examples.

Direct public HTML checks confirmed these rows:

| Public lesson | Part ID | Duration s | Bytes |
| --- | --- | ---: | ---: |
| [b23bb496…](https://tora-player.vercel.app/he/lessons/b23bb496-3614-4518-ac53-363dfc7f1dd8) | b73efe56-b5b3-420e-bf6e-c9fa5e36b291 | 0 | 4,682,143 |
| Same lesson, other part | efafac82-0daf-469a-afc5-ac14a6a4ccf4 | 0 | 11,309,438 |
| [ee7c498a…](https://tora-player.vercel.app/he/lessons/ee7c498a-a64e-4ddc-8865-c2a91a942ff1) | 5a213eaa-4001-4510-9a8f-6413a840f237 | 0 | 115,823,594 |

The [40-second legacy lesson](https://tora-player.vercel.app/he/lessons/93d640b8-8dae-4616-8203-7cbd28bda1b7) still exposes duration 40, size 91,717, and is_published true. Its absence from the main feed is consistent with the short-lesson exclusion. Do not interpret feed absence as missing audio or unpublished content.

No fresh database-wide query occurred. The historical inventory has no M4A example. This report does not cover every codec or published file.

## Fresh file measurements

The measurement followed the public download route internally. It saved one bounded temporary file and ran ffprobe. It decoded the complete file to mono signed 16-bit PCM at the source sample rate. Duration equals PCM bytes / (2 × sample_rate).

The full-file budget was 90 MiB. Six files used 82,458,167 bytes, about 78.64 MiB. Four additional tail requests used 262,144 bytes. RSS/HTML and browser metadata traffic are additional. Browser transfer size was not independently counted.

Every file returned HTTP 200 after the internal redirect. Downloaded size matched Content-Length and catalog size. Each decode exited 0 with no decode error. FFmpeg and ffprobe reported version 9.0.2. Redirect URLs were never printed or retained.

| Sample | Catalog s | ffprobe s | Decoded PCM s | Prior WebKit metadata s | Prior Chromium metadata s |
| --- | ---: | ---: | ---: | ---: | ---: |
| fb296bdf-p0 | 4642 | 4642.406500 | 4642.393500 | 4686.72 | 4642.4065 |
| fb296bdf-p1 | 3819 | 3819.066500 | 3819.053500 | 3712.2 | 3819.0665 |
| legacy-93d640b8-40s | 40 | 40.142167 | 40.137833 | 39.96 | 40.142167 |
| b23bb496-p0-dur0 | 0 | 2268.022167 | 2268.017833 | 2165.88 | 2268.022167 |
| 475ab9e6-mp3-320k | 326 | 325.623458 | 325.623458 | 325.656 | 325.623458 |
| 1a89e3fa-mp3-64k | 5497 | 5496.704000 | 5496.732000 | 5496.696 | 5496.704 |

Fresh RSS confirmed all positive part durations in the table. Public HTML confirmed the legacy duration and zero Opus duration. The zero-duration MP3 was not downloaded again because its 115.8 MB file exceeded the sample budget. Its current zero metadata is confirmed. Its 7238.911995-second ffprobe result is historical.

The September 25 lesson has two measured files with a total decoded duration of 8461.447 seconds. Its historical catalog total is 8461 seconds. This does not support a minutes-long source-duration error for that lesson.

### MP3 estimation

For 1a89e3fa-mp3-64k, ffprobe warned: “Estimating duration from bitrate, this may be inaccurate”. Its estimate was 5496.704 seconds. Full decode produced 87,947,712 samples at 16 kHz, or 5496.732 seconds. The difference is 0.028 seconds.

The first 4096 bytes had no Xing, Info, VBRI, or LAME marker. This marker check alone does not prove every metadata tag absent. The explicit ffprobe warning confirms an estimation path. This measured file does not demonstrate a material duration error.

The 320 kbps MP3 contains an Info marker at byte 65. It produced no estimation warning. Its ffprobe and decoded durations agree at 325.623458 seconds. Its 326-second catalog value is consistent with rounding.

[FFmpeg's MP3 demuxer source](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.0/libavformat/mp3dec.c), lines 299–341, reads Xing/Info/VBRI metadata and computes duration from frame count and padding. This pinned v8 source explains the mechanism. It is not the exact source revision of the local v9.0.2 binary.

### Opus in Ogg: end-of-stream flag

A complete page scan found one logical stream per sampled Opus file. None contained an Ogg end-of-stream flag. Each final tail request returned HTTP 206 with an exact 65,536-byte range. The final page's flag byte was zero.

| Sample | Pages | Pre-skip samples | Final granule | EOS pages | Decoded samples at 48 kHz |
| --- | ---: | ---: | ---: | ---: | ---: |
| fb296bdf-p0 | 2677 | 312 | 222835512 | 0 | 222834888 |
| fb296bdf-p1 | 2136 | 312 | 183315192 | 0 | 183314568 |
| legacy-93d640b8-40s | 24 | 104 | 1926824 | 0 | 1926616 |
| b23bb496-p0-dur0 | 1094 | 104 | 108865064 | 0 | 108864856 |

[RFC 7845 section 3](https://www.rfc-editor.org/rfc/rfc7845.html#section-3) describes an EOS-marked final page and requires decoders to tolerate streams without it. [Sections 4.3–4.5](https://www.rfc-editor.org/rfc/rfc7845.html#section-4.3) define granule time, pre-skip, initial offsets, and end trim.

Do not equate the final granule with decoded sample count. The sampled ffprobe/PCM offsets are 4.333–13 milliseconds. Initial position and pre-skip need separate treatment.

Confidence is high for the absent flag in these four representations. Causal confidence is low for a link to WebKit estimation. Full decode succeeds and complete object sizes agree. These checks establish full delivery of the current stored object. They do not prove that the original recording contains every intended second. No original WhatsApp source comparison, CRC audit, or remux experiment occurred.

## Browser evidence

Prior metadata probes used preload=metadata on the application stream route. Durations remained unchanged at metadata, +5 seconds, and +25 seconds. Every result reports paused true. There is no full-playback evidence.

| Additional historical sample | Catalog s | Prior ffprobe s | Desktop WebKit s | Error versus ffprobe s |
| --- | ---: | ---: | ---: | ---: |
| legacy-83f825c0-495s | 495 | 495.102167 | 481.68 | −13.422167 |
| legacy-fda5369b-7036s | 7036 | 7036.622167 | 6793.44 | −243.182167 |
| f1e265f4-61kbps | 1673 | 1673.286500 | 1777.86 | +104.573500 |
| ee7c498a-mp3-dur0 | 0 | 7238.911995 | 7238.911995464852 | approximately 0 |
| bb1b257b-mp3-128k | 1355 | 1355.000000 | 1355 | 0 |

For the September 25 files, WebKit estimated part 0 about 44.314 seconds long and part 1 about 106.867 seconds short. Both directions matter. A blanket maximum or rejection of smaller durations can preserve an overestimate.

Fresh T3 preview checks used desktop Electron 44.4.2 / Chromium 152.0.7977.130. They checked three isolated elements at metadata and +2 seconds:

| Sample | Metadata s | After 2 s | Position | Paused |
| --- | ---: | ---: | ---: | --- |
| fb296bdf-p1 | 3819.0665 | 3819.0665 | 0 | true |
| b23bb496-p0-dur0 | 2268.022167 | 2268.022167 | 0 | true |
| 475ab9e6-mp3-320k | 325.623458 | 325.623458 | 0 | true |

Fresh values match ffprobe. No play, playing, or ended event occurred. The first long awaited preview call hit the tool's 15-second timeout. The corrected probe stored results in page memory, then returned through a separate read. The corrected result is complete. It does not establish WebKit behavior.

The [HTML media standard](https://html.spec.whatwg.org/multipage/media.html#dom-media-duration-dev) explicitly allows duration estimates and later durationchange events. Browser metadata duration is not an independent decoded-file measurement.

| Evidence class | Status |
| --- | --- |
| File measurements | Six fresh complete downloads and full decodes. |
| Desktop browser behavior | Three fresh Chromium probes and eleven prior Chromium/WebKit metadata probes. |
| Modeled application behavior | Actual pure progress functions executed with measured/prior inputs. |
| Real iOS / Android playback | Untested. |
| Installed PWA / lock-screen / hardware | Untested. |
| Offline Blob metadata | Untested. |
| Natural end / premature end / correction during play | Untested. |

## Metadata provenance and application data flow

All source references apply to /Users/liorelisha/tora-playback-reliability at the verified HEAD.

| Stage | Source lines | What the code establishes |
| --- | --- | --- |
| Browser upload metadata | src/lib/audio-utils.ts:51–69 | Blob URL, preload metadata, first loadedmetadata duration, rounded seconds. Error/30-second timeout returns zero. No full decode or later-duration reconciliation. |
| Daily upload | src/app/[locale]/lessons/upload/daily-upload-client.tsx:123–127,256 | Extraction becomes durationSec, then upload duration. |
| Upload request | src/hooks/use-upload.ts:58–64,85–97 | Sends supplied original metadata duration after optional transcode. It does not remeasure output. |
| Upload persistence | src/app/api/upload/complete/route.ts:97–111 | Measures assembled byte size, then stores supplied duration. No independent server duration probe appears here. |
| Manifest importer | scripts/import-manifest.mjs:90–112 | Persists part.sec from input manifest. This does not establish how the manifest calculated sec. |
| WhatsApp importer | scripts/import-whatsapp-lessons.mjs:296–306 | Persists rounded input duration_seconds, else zero. |
| Legacy short importer | scripts/import-short-clips.mjs:154–156 | Uses rounded input duration_seconds. |
| Lesson aggregate | supabase/migrations/002_anon_write_and_lesson_audio.sql:211–237 | Declares a trigger that sums part durations into lesson duration. Migration evidence, not live schema verification. |
| Online/offline metadata | src/lib/lesson-tracks.ts:35–50,78–107,111–125 | Part duration is distinct from lesson total. Offline metadata supplies part durations and original part count. |
| Initial display | src/stores/audio-store.ts:126–135 | Starts with track.duration. |
| Duration replacement | src/lib/audio-engine.ts:168–170,227–234; src/lib/audio-controller.ts:419–420; src/stores/audio-store.ts:258 | Accepts positive finite element duration and replaces display duration. |
| Progress checkpoints | src/lib/audio-controller.ts:184–211 | Uses engine duration for observed progress and final-part completion. |
| Resume rules | src/lib/lesson-progress.ts:37–40,55–67 | Completed progress resets to start. Otherwise positive catalog duration takes precedence for near-end resume. |
| Seek clamps | src/lib/audio-engine.ts:112–122,239–246; src/lib/audio-controller.ts:486–489 | Caps seek/start targets using positive duration. |
| UI and OS position | src/components/player/seek-bar.tsx:61–63; src/hooks/use-media-session.ts:68–75 | Caps progress at 100%, remaining at zero, and OS position at duration. |
| End recovery | src/lib/audio-lifecycle.ts:44–50; src/lib/audio-controller.ts:215–220 | Uses observed duration to distinguish a cutoff and record final position. Natural-event behavior remains unmeasured. |

The size estimate in src/lib/audio-transcode.ts:120–150 assumes typical bitrates to predict output size. It is not the catalog-duration persistence path. Do not identify that helper as the cause of incorrect stored durations.

No row records a duration method, browser/version, confidence, or extraction error in the inspected paths. Exact historical provenance cannot be inferred solely from timestamp-style versus hash-style keys.

## Modeled completion result

Actual lesson-progress.ts functions ran through TypeScript transpilation in memory. No repository test or file change occurred. The initial Node strip-types command failed because the active Node did not support that option. The corrected execution used the installed TypeScript package.

Input: final September 25 part, position 3655 seconds, prior WebKit duration 3712.2 seconds, decoded duration 3819.0535 seconds.

| Rule/result | Value |
| --- | --- |
| Actual audio remaining | 164.0535 seconds |
| isNearPartEnd(3655, 3712.2) | true |
| isNearPartEnd(3655, 3819.0535) | false |
| isLastPart(partIndex 1, partCount 2) | true |
| getResumePoint with completed true | index 0, position 0 |
| Same progress with completed false | index 1, position 3655 |

Confidence is high for the pure-rule result and inspected controller data flow. Device impact requires evidence that the element still reports the short estimate at that position. This run did not play to that point or execute the full controller.

The near-end threshold starts at 3652.2 under the estimate, versus 3759.0535 under decoded duration. That moves completion 106.8535 seconds earlier than the documented policy.

## Findings, counterevidence, and falsifiable hypotheses

| ID | Finding / hypothesis | Confidence | Counterevidence and falsifier |
| --- | --- | --- | --- |
| A1 | Published part metadata is zero despite nonempty audio. | High for current rows. | Zero represents unknown. Chromium recovers accurate lengths. Trace each surface before claiming user impact. |
| A2 | Prior desktop WebKit gives inaccurate metadata duration for selected Opus files. | High for retained logs, unverified on mobile. | Chromium matches measurement. WebKit can revise during playback. Refute mobile applicability with affected-device evidence. |
| A3 | Current rules can complete a final part early under an underestimated element duration. | High modeled, medium end-to-end hypothesis. | Accurate catalog protects unfinished resume if completed stays false. Duration correction before checkpoint can remove the trigger. |
| A4 | Missing EOS contributes to WebKit estimation or premature end. | Low causal confidence. | Four files decode fully. No EOS-marked comparison exists. Reject if an otherwise equivalent finalized container retains the error. |
| A5 | MP3 bitrate estimation causes the reported minutes-long mismatch. | Low for this sample. | The warning sample differs by 28 ms. Reject it as material unless a different device retains a large error. |
| A6 | Browser extraction or manifest input can create unknown/wrong catalog duration. | Medium mechanism, low historical attribution. | Positive samples agree within rounding. Exact historical extractor/manifest producer is unknown. Compare original file and actual input manifest. |
| A7 | Proxy timeout makes a browser treat a truncated transfer as natural end. | Unestablished. | Prior result is empty. Fresh downloads and tail ranges succeed. No end event was induced. |

## Focused later test steps

1. Use the stable IDs and hashes in the appendix. Record device, OS, browser version, and browser versus PWA mode.
2. Start with the September 25 final part and zero-duration Opus part. Compare the stream URL with an exact offline Blob.
3. Use an isolated harness that blocks listen/progress endpoints. Do not mount production account synchronization.
4. Record loadedmetadata, each durationchange, currentTime, seekable, buffered, readyState, networkState, error, pause, and ended.
5. Observe duration before play, after buffer growth, after explicit seeks, near 3652 seconds, and at the final sample.
6. Verify whether the short estimate persists to a checkpoint. Refute A3 if the browser corrects it first.
7. Exercise final and earlier parts separately. Confirm that the one-minute/5% rule uses supported duration evidence.
8. For unknown durations, verify progress, resume, Media Session reset, and offline metadata without a lesson-total-as-part shortcut.
9. Compare unchanged Opus against a local remux: ffmpeg -i original.opus -c:a copy finalized.ogg.
10. Verify packet/sample counts and EOS first. Remux changes timestamps and layout, so it does not isolate one flag.
11. If results differ, inspect a controlled EOS/CRC experiment before you name EOS as the cause. Never overwrite production audio.
12. Compare MP3 decoded samples with demuxer estimates. Add VBR/Xing only if a public candidate exists.
13. If needed, run one separately bounded slow proxy transfer. Capture delivered bytes and exact termination.
14. Pair the transfer with browser events. A timeout alone cannot establish an ended event or recovery defect.
15. Preserve valid natural-end advancement, multipart resume, and unknown offline part-count rules.
16. Do not adopt max(catalog, element), monotonic-duration rejection, or new seek boundaries without evidence for both estimate directions.

Acceptance evidence: reproduce a material error on the affected device, identify duration authority at failure, and demonstrate a causal checkpoint/end path. Preserve the documented completion policy. Report unsupported platforms and untested cases explicitly.

This research did not run the prior /private/tmp/bug4 suite, repository CI, builds, or end-to-end tests. No implementation occurred. The pure-rule execution proves only the supplied inputs.

## Reproduction method

Use the public download route with an encoded public file key and disposition=inline. Follow redirects internally. Never log response Location headers or effective URLs.

```bash
curl --fail --silent --show-error --location --max-time 80 --max-filesize 94371840 \
  'https://tora-player.vercel.app/api/audio/download/<encoded-public-file-key>?disposition=inline' \
  --output /private/tmp/<temporary-sample>
ffprobe -v warning \
  -show_entries format=duration,size,bit_rate,start_time:stream=codec_name,sample_rate,channels,duration,start_time,bit_rate \
  -of json /private/tmp/<temporary-sample>
ffmpeg -v error -nostdin -i /private/tmp/<temporary-sample> \
  -map 0:a:0 -ac 1 -ar <source-sample-rate> -f s16le pipe:1
```

Count stdout bytes directly. Divide by two and the source sample rate. The actual measurement used Python urllib and subprocess with these ffprobe/ffmpeg arguments. It bounded each download, checked byte length, calculated SHA-256, then deleted the temporary file. The 90 MiB bound applied across the six full files, not separately to each.

The appendices below preserve exact sanitized measurements and fresh browser observations. They contain no credentials or signed URLs.

## Stable identity and measurements

| Sample | Stable part/lesson ID | Public file key | SHA-256 |
| --- | --- | --- | --- |
| fb296bdf-p0 | d3a58d7c-2eaf-445c-af47-3c43383fad01 | audio/fb296bdf-9d25-4832-a2d9-262875d48a29/0_1790312437834.opus | 398d9cdfa4f999771549a27ad80021782261d35fc34ede6bc4cb5f9d106bdd92 |
| fb296bdf-p1 | 43bf8dcc-e00f-4737-8da1-b537fdf35740 | audio/fb296bdf-9d25-4832-a2d9-262875d48a29/1_1790312436819.opus | 3bcba3f0b22fe9c284453f8213791a82715e3e247442e6904f6837e51a0b0e69 |
| legacy-93d640b8-40s | 93d640b8-8dae-4616-8203-7cbd28bda1b7 | audio/short-clips/1771979419524_p71v4z.opus | f3acdddacd6e3f249b614b715f0ccabbb9a495b058e3902a00d309136aa645a5 |
| b23bb496-p0-dur0 | b73efe56-b5b3-420e-bf6e-c9fa5e36b291 | audio/b23bb496-3614-4518-ac53-363dfc7f1dd8/0_1771929990678.opus | 3a3abf0dfd2259a704b9b2d69760ca69e5acd90cf85331c90e9b53b627ea48d8 |
| 475ab9e6-mp3-320k | 1a08d5ce-678b-4d98-b662-cfdfd7019c1e | audio/475ab9e6-4372-4a82-b427-f9473e4f0715/4_1771971959172.mp3 | ca7b6fc01a731bc64a10a34edc4395874c7c3aa8876508086e4002aae1fcd629 |
| 1a89e3fa-mp3-64k | badcc14c-9730-45f1-ae9f-15b51f41a04b | audio/1a89e3fa-75da-427b-b0dc-ce68c3db2f83/84ac72d4b4992c89317d869c1423564d2337f269.mp3 | 49450cc2bb8ee9bc4e307e9e1f996d17efbc1355a63b9fdcaa428d2e909dcf11 |

### Full file measurement records

```json
[
  {
    "label": "fb296bdf-p0",
    "key": "audio/fb296bdf-9d25-4832-a2d9-262875d48a29/0_1790312437834.opus",
    "priorCatalog": 4642,
    "feed": [
      {
        "guid": "d3a58d7c-2eaf-445c-af47-3c43383fad01",
        "duration": "4642",
        "length": "11510481",
        "type": "audio/ogg",
        "link": "https://tora-player.vercel.app/he/lessons/fb296bdf-9d25-4832-a2d9-262875d48a29"
      }
    ],
    "bytes": 11510481,
    "expectedBytes": 11510481,
    "contentType": "audio/ogg",
    "httpStatus": 200,
    "sha256": "398d9cdfa4f999771549a27ad80021782261d35fc34ede6bc4cb5f9d106bdd92",
    "probe": {
      "programs": [],
      "stream_groups": [],
      "streams": [
        {
          "codec_name": "opus",
          "sample_rate": "48000",
          "channels": 1,
          "start_time": "0.006500",
          "duration": "4642.406500"
        }
      ],
      "format": {
        "start_time": "0.006500",
        "duration": "4642.406500",
        "size": "11510481",
        "bit_rate": "19835"
      }
    },
    "probeWarning": "",
    "decodedSeconds": 4642.3935,
    "pcmSampleRate": 48000,
    "pcmSampleCount": 222834888,
    "decodeExit": 0,
    "decodeError": "",
    "mp3PrefixMarkers": {},
    "ogg": {
      "pages": 2677,
      "serialCount": 1,
      "preSkip": 312,
      "eosGranules": [],
      "firstNonzeroGranule": 86712,
      "eosMinusPreSkipSeconds": null
    },
    "tailRange": {
      "status": 206,
      "contentRange": "bytes 11444945-11510480/11510481",
      "bytes": 65536,
      "lastPage": {
        "flags": 0,
        "granule": 222835512,
        "seq": 2676
      }
    }
  },
  {
    "label": "fb296bdf-p1",
    "key": "audio/fb296bdf-9d25-4832-a2d9-262875d48a29/1_1790312436819.opus",
    "priorCatalog": 3819,
    "feed": [
      {
        "guid": "43bf8dcc-e00f-4737-8da1-b537fdf35740",
        "duration": "3819",
        "length": "9172950",
        "type": "audio/ogg",
        "link": "https://tora-player.vercel.app/he/lessons/fb296bdf-9d25-4832-a2d9-262875d48a29"
      }
    ],
    "bytes": 9172950,
    "expectedBytes": 9172950,
    "contentType": "audio/ogg",
    "httpStatus": 200,
    "sha256": "3bcba3f0b22fe9c284453f8213791a82715e3e247442e6904f6837e51a0b0e69",
    "probe": {
      "programs": [],
      "stream_groups": [],
      "streams": [
        {
          "codec_name": "opus",
          "sample_rate": "48000",
          "channels": 1,
          "start_time": "0.006500",
          "duration": "3819.066500"
        }
      ],
      "format": {
        "start_time": "0.006500",
        "duration": "3819.066500",
        "size": "9172950",
        "bit_rate": "19215"
      }
    },
    "probeWarning": "",
    "decodedSeconds": 3819.0535,
    "pcmSampleRate": 48000,
    "pcmSampleCount": 183314568,
    "decodeExit": 0,
    "decodeError": "",
    "mp3PrefixMarkers": {},
    "ogg": {
      "pages": 2136,
      "serialCount": 1,
      "preSkip": 312,
      "eosGranules": [],
      "firstNonzeroGranule": 80952,
      "eosMinusPreSkipSeconds": null
    },
    "tailRange": {
      "status": 206,
      "contentRange": "bytes 9107414-9172949/9172950",
      "bytes": 65536,
      "lastPage": {
        "flags": 0,
        "granule": 183315192,
        "seq": 2135
      }
    }
  },
  {
    "label": "legacy-93d640b8-40s",
    "key": "audio/short-clips/1771979419524_p71v4z.opus",
    "priorCatalog": 40,
    "feed": [],
    "bytes": 91717,
    "expectedBytes": 91717,
    "contentType": "audio/ogg",
    "httpStatus": 200,
    "sha256": "f3acdddacd6e3f249b614b715f0ccabbb9a495b058e3902a00d309136aa645a5",
    "probe": {
      "programs": [],
      "stream_groups": [],
      "streams": [
        {
          "codec_name": "opus",
          "sample_rate": "48000",
          "channels": 1,
          "start_time": "0.002167",
          "duration": "40.142167"
        }
      ],
      "format": {
        "start_time": "0.002167",
        "duration": "40.142167",
        "size": "91717",
        "bit_rate": "18278"
      }
    },
    "probeWarning": "",
    "decodedSeconds": 40.13783333333333,
    "pcmSampleRate": 48000,
    "pcmSampleCount": 1926616,
    "decodeExit": 0,
    "decodeError": "",
    "mp3PrefixMarkers": {},
    "ogg": {
      "pages": 24,
      "serialCount": 1,
      "preSkip": 104,
      "eosGranules": [],
      "firstNonzeroGranule": 86504,
      "eosMinusPreSkipSeconds": null
    },
    "tailRange": {
      "status": 206,
      "contentRange": "bytes 26181-91716/91717",
      "bytes": 65536,
      "lastPage": {
        "flags": 0,
        "granule": 1926824,
        "seq": 23
      }
    }
  },
  {
    "label": "b23bb496-p0-dur0",
    "key": "audio/b23bb496-3614-4518-ac53-363dfc7f1dd8/0_1771929990678.opus",
    "priorCatalog": 0,
    "feed": [
      {
        "guid": "b73efe56-b5b3-420e-bf6e-c9fa5e36b291",
        "duration": null,
        "length": "4682143",
        "type": "audio/ogg",
        "link": "https://tora-player.vercel.app/he/lessons/b23bb496-3614-4518-ac53-363dfc7f1dd8"
      }
    ],
    "bytes": 4682143,
    "expectedBytes": 4682143,
    "contentType": "audio/ogg",
    "httpStatus": 200,
    "sha256": "3a3abf0dfd2259a704b9b2d69760ca69e5acd90cf85331c90e9b53b627ea48d8",
    "probe": {
      "programs": [],
      "stream_groups": [],
      "streams": [
        {
          "codec_name": "opus",
          "sample_rate": "48000",
          "channels": 1,
          "start_time": "0.002167",
          "duration": "2268.022167"
        }
      ],
      "format": {
        "start_time": "0.002167",
        "duration": "2268.022167",
        "size": "4682143",
        "bit_rate": "16515"
      }
    },
    "probeWarning": "",
    "decodedSeconds": 2268.0178333333333,
    "pcmSampleRate": 48000,
    "pcmSampleCount": 108864856,
    "decodeExit": 0,
    "decodeError": "",
    "mp3PrefixMarkers": {},
    "ogg": {
      "pages": 1094,
      "serialCount": 1,
      "preSkip": 104,
      "eosGranules": [],
      "firstNonzeroGranule": 103784,
      "eosMinusPreSkipSeconds": null
    },
    "tailRange": {
      "status": 206,
      "contentRange": "bytes 4616607-4682142/4682143",
      "bytes": 65536,
      "lastPage": {
        "flags": 0,
        "granule": 108865064,
        "seq": 1093
      }
    }
  },
  {
    "label": "475ab9e6-mp3-320k",
    "key": "audio/475ab9e6-4372-4a82-b427-f9473e4f0715/4_1771971959172.mp3",
    "priorCatalog": 326,
    "feed": [
      {
        "guid": "1a08d5ce-678b-4d98-b662-cfdfd7019c1e",
        "duration": "326",
        "length": "13027244",
        "type": "audio/mpeg",
        "link": "https://tora-player.vercel.app/he/lessons/475ab9e6-4372-4a82-b427-f9473e4f0715"
      }
    ],
    "bytes": 13027244,
    "expectedBytes": 13027244,
    "contentType": "audio/mpeg",
    "httpStatus": 200,
    "sha256": "ca7b6fc01a731bc64a10a34edc4395874c7c3aa8876508086e4002aae1fcd629",
    "probe": {
      "programs": [],
      "stream_groups": [],
      "streams": [
        {
          "codec_name": "mp3",
          "sample_rate": "48000",
          "channels": 1,
          "start_time": "0.023021",
          "duration": "325.623458",
          "bit_rate": "320000"
        }
      ],
      "format": {
        "start_time": "0.023021",
        "duration": "325.623458",
        "size": "13027244",
        "bit_rate": "320056"
      }
    },
    "probeWarning": "",
    "decodedSeconds": 325.62345833333336,
    "pcmSampleRate": 48000,
    "pcmSampleCount": 15629926,
    "decodeExit": 0,
    "decodeError": "",
    "mp3PrefixMarkers": {
      "Xing": -1,
      "Info": 65,
      "VBRI": -1,
      "LAME": 2594
    },
    "ogg": null
  },
  {
    "label": "1a89e3fa-mp3-64k",
    "key": "audio/1a89e3fa-75da-427b-b0dc-ce68c3db2f83/84ac72d4b4992c89317d869c1423564d2337f269.mp3",
    "priorCatalog": 5497,
    "feed": [
      {
        "guid": "badcc14c-9730-45f1-ae9f-15b51f41a04b",
        "duration": "5497",
        "length": "43973632",
        "type": "audio/mpeg",
        "link": "https://tora-player.vercel.app/he/lessons/1a89e3fa-75da-427b-b0dc-ce68c3db2f83"
      }
    ],
    "bytes": 43973632,
    "expectedBytes": 43973632,
    "contentType": "audio/mpeg",
    "httpStatus": 200,
    "sha256": "49450cc2bb8ee9bc4e307e9e1f996d17efbc1355a63b9fdcaa428d2e909dcf11",
    "probe": {
      "programs": [],
      "stream_groups": [],
      "streams": [
        {
          "codec_name": "mp3",
          "sample_rate": "16000",
          "channels": 1,
          "start_time": "0.000000",
          "duration": "5496.704000",
          "bit_rate": "64000"
        }
      ],
      "format": {
        "start_time": "0.000000",
        "duration": "5496.704000",
        "size": "43973632",
        "bit_rate": "64000"
      }
    },
    "probeWarning": "[mp3 @ 0x7816824000] Estimating duration from bitrate, this may be inaccurate\n",
    "decodedSeconds": 5496.732,
    "pcmSampleRate": 16000,
    "pcmSampleCount": 87947712,
    "decodeExit": 0,
    "decodeError": "",
    "mp3PrefixMarkers": {
      "Xing": -1,
      "Info": -1,
      "VBRI": -1,
      "LAME": -1
    },
    "ogg": null
  }
]
```

### Fresh browser observation

```json
{
  "date": "2026-10-04T09:10:24.061Z",
  "done": true,
  "rows": [
    {
      "after2Seconds": "3819.0665",
      "currentTime": 0,
      "events": [
        {
          "duration": "3819.0665",
          "name": "durationchange"
        },
        {
          "duration": "3819.0665",
          "name": "loadedmetadata"
        }
      ],
      "label": "fb296bdf-p1",
      "metadataDuration": "3819.0665",
      "paused": true,
      "status": "metadata"
    },
    {
      "after2Seconds": "2268.022167",
      "currentTime": 0,
      "events": [
        {
          "duration": "2268.022167",
          "name": "durationchange"
        },
        {
          "duration": "2268.022167",
          "name": "loadedmetadata"
        }
      ],
      "label": "b23bb496-p0-dur0",
      "metadataDuration": "2268.022167",
      "paused": true,
      "status": "metadata"
    },
    {
      "after2Seconds": "325.623458",
      "currentTime": 0,
      "events": [
        {
          "duration": "325.623458",
          "name": "durationchange"
        },
        {
          "duration": "325.623458",
          "name": "loadedmetadata"
        }
      ],
      "label": "475ab9e6-mp3-320k",
      "metadataDuration": "325.623458",
      "paused": true,
      "status": "metadata"
    }
  ],
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) T3Code(Nightly)/0.0.46-nightly.20261004.2644 Chrome/152.0.7977.130 Electron/44.4.2 Safari/537.36"
}
```
