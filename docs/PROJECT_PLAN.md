# Calinguero public project plan

**Stage:** M0 technical feasibility and reproducible baselines.

This public plan describes the intended product and the evidence available.
It does not claim production readiness, platform parity, or permission to
redistribute third-party media.

## Product scope

- Live television, movies, and series.
- Android TV, LG webOS, and Samsung/Tizen as separate platform targets.
- A centrally curated catalog that loads without viewer-entered playlist
  URLs or provider credentials.
- Central source changes reaching clients without application reinstalls.
- Incremental development, retaining useful existing playback and UI work.

Direct playback from authorized sources is the initial approach. It does
not guarantee that playback URLs or credentials are technically hidden
from the device. An administrator's credentials must never be delivered
with the catalog.

## What this repository contains

The current source is the Apache-2.0 webOS base derived from
[webos-iptv-player](https://github.com/lennylxx/webos-iptv-player), with
baseline test corrections and project documentation. The upstream history,
license, and notices are retained.

The runtime still identifies itself as `webOS IPTV Player`,
`com.lennylxx.iptv`, version `1.18.0`. This is intentional baseline
preservation, not finished Calinguero branding or a new app identity.

| Platform | Current evidence | Still pending |
| --- | --- | --- |
| LG webOS | Original base compiled and packaged locally; service smoke passed with Node.js 0.12.2. Baseline suite passed 4,642 tests, with four existing skips. | Installation, remote navigation, playback, and automatic catalog behavior on the actual target TV. |
| Android TV | Approved product target. | Original-client environment/build and platform integration. Android client source is not included here. |
| Samsung/Tizen | Documentary and public-source research completed. | Exact device/runtime information, base adoption, signing, prototype, deployment route, and hardware proof. |

The reported test results describe local validation, not a successful
GitHub Actions run or a target-TV compatibility certification.

## M0 acceptance outline

1. Identify source revisions and reproduce the relevant original builds.
2. Agree on a small sample of authorized content, retaining categories.
3. Obtain the catalog automatically on first launch.
4. Select and play content with picture and audio.
5. Change a source centrally and observe the update without reinstalling
   or reconfiguring the viewer.
6. Record build, install, remote-control, playback, and update evidence
   separately for every platform. Record concrete blockers rather than
   declaring unsupported platforms complete.

M0 is not complete. A generated package, a successful API request, or a
working desktop preview does not substitute for actual TV playback.
Multi-TV account permissions and concurrency also require their own proof.

## Central catalog limitations

The previously inspected administration base provides curated live-TV
output. Managed movies, series, and EPG require separate server-side work.
A capability present in a player does not mean the central catalog already
supplies it.

Source replacement must distinguish updating an existing local content
identity from creating a new entry. Equivalence cannot be inferred from a
matching title alone, particularly for movie versions and episode order.

## Later modules

| Module | Intended outcome |
| --- | --- |
| M1 | Visual identity, accessible remote navigation, and approved UX. |
| M2 | Curated live TV, agreed EPG integration, and reversible manual source replacement. |
| M3 | Managed movies with explicit identity and compatible progress rules. |
| M4 | Series, seasons, correct episode order, and agreed progress behavior. |
| M5 | Account diagnostics and assisted maintenance with explicit observation age and provenance. |
| M6, optional | Backups or automatic switching only under separately approved rules. |

## Samsung/Tizen research

The [research report](SAMSUNG_TIZEN_RESEARCH.md) recommends a bounded
experiment reusing suitable webOS frontend parts while keeping Tizen
playback, platform services, packaging, and signing separate. OpenIPTV is
an inspected fallback, not an adopted dependency.

No Tizen implementation or compatibility claim follows from the research.
Development installation and sustainable distribution are separate
decisions; an LG IPK is not a Samsung package.

## Boundaries and open decisions

- Use only owned or explicitly authorized content and provider access.
- Do not publish playlists, provider credentials, signing keys, private
  device identifiers, or local infrastructure configuration.
- Do not add retransmission, transcoding, viewer activation, or automatic
  failover as an implied solution to another requirement.
- Select branding, application identifiers, signatures, and update channels
  before distributing independent clients.
- Verify actual device models, installed platforms, authorized samples,
  and deployment requirements before hardware tests.
- External projects keep their own licenses. This repository's webOS
  license does not establish the license of future Android or Tizen code.
