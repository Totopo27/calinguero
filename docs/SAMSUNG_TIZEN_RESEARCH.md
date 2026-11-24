# Calinguero: Samsung/Tizen research and feasibility

**Research date:** 2026-11-23.  
**Status:** COMPLETE — documentary and source-level research; no implementation base has been adopted and no Samsung hardware has been tested.  
**Purpose:** choose a justified Samsung/Tizen development route and define the smallest useful CU7000 feasibility test.

## 1. Decision to support

Compare adapting the existing webOS client's reusable web layer with starting from an existing Tizen-specific player. A recommendation must distinguish documented capabilities, inspected implementation, community reports, and behavior still requiring hardware proof.

### Executive recommendation

**First evaluate a bounded Tizen adaptation of the existing webOS frontend, not a direct port of the whole application. Keep OpenIPTV as the strongest inspected Tizen-specific fallback.**

This retains useful catalog, UI, storage, and navigation work while isolating the incompatible playback and platform services. It is a recommendation for a feasibility prototype, not proof that adaptation will be cheaper or that the whole webOS application runs on Samsung.

The most consequential feasibility gates are:

1. A signed application can be installed and exercised on the exact CU7000.
2. Authorized streams play through a suitable Samsung media path, including any necessary headers.
3. The application can obtain and refresh Calinguero's central catalog without viewer configuration.
4. There is an acceptable installation/update/distribution route for the intended pilot; a development install is not automatically that route.

If those gates expose excessive webOS coupling or unsupported playback requirements, reconsider the base before a full UI adaptation. Do not start by rewriting every client, introducing a universal UI framework, or adding video retransmission.

## 2. Confirmed scope and authorization

- Samsung/Tizen is an approved additional target alongside Android TV and LG webOS.
- A Samsung CU7000-class television is available as a test target. Its complete regional model code, installed firmware, and installed Tizen version remain unknown.
- Calinguero covers live television, movies, and series, developed incrementally.
- The intended first-launch experience obtains a centrally curated catalog without the viewer entering playlist URLs or credentials. Source changes should reach clients without reinstalling the application.
- Direct playback from authorized providers remains the initial approach. This does not promise that playback credentials are technically inaccessible on the client.
- This report describes documentary and source-level research, not SDK installation, third-party project execution, or device/provider testing.

The [public project plan](PROJECT_PLAN.md) records all three target platforms and separate M0 validation requirements. No Tizen implementation base has been selected.

## 3. Research method

Three read-only research streams were completed:

1. Official Samsung/Tizen specifications, playback APIs, development tooling, signing, installation, and distribution.
2. Public GitHub players: actual source, revision, license, buildability, feature coverage, and comparison with the existing webOS client.
3. Public community evidence: Reddit, Samsung developer forums, and issue/discussion threads, with model, firmware, date, and reproduction context where available.

Source collection and synthesis are complete for the decision above. Selected official claims, the OpenIPTV license, and StreamVault's backend/license description were also spot-checked during synthesis. No third-party project was cloned, installed, compiled, or executed for this investigation.

Primary documentation and inspected source take precedence over search snippets, repository badges, installer catalogs, and unsupported community generalizations. Missing or inaccessible evidence will be recorded rather than treated as proof.

Evidence categories used below:

- **Official:** Samsung documentation or product specifications.
- **Inspected:** public repository source, license, manifests, or release records at an identified revision.
- **Reported:** an individual community observation with its stated device/version context.
- **Proposed:** a recommendation or future test, not an observed outcome.

## 4. Official platform findings

### 4.1 What the CU7000 label establishes

Samsung's [43-inch UN43CU7000PXPA product page](https://www.samsung.com/latin_en/tvs/uhd-4k-tv/cu7000-43-inch-un43cu7000pxpa/) identifies a 2023 Tizen television. Samsung's [model-group table](https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html) places `UCU7000` in `23TV_BASIC1`, originally associated with Tizen 7.0 and TV Extension 7.0 or later. The corresponding 2023 web-engine baseline is Chromium M94.

**This is a family/reference baseline, not identification of the target unit.** The available device information does not establish the regional SKU above. Supported televisions may receive platform upgrades, so model year cannot safely substitute for installed firmware or platform version. Samsung documents runtime/model queries in [Retrieving Platform Information](https://developer.samsung.com/smarttv/develop/guides/fundamentals/retrieving-platform-information.html).

Before implementation testing, obtain the full model code, region, firmware, and actual platform version. Do not assume a seven-year upgrade entitlement or a particular installed Tizen version from the family name alone.

### 4.2 Application, tooling, and signing

Samsung TV web applications use a Tizen project, `config.xml`, and a signed `.wgt` package. This is distinct from Android APK and LG webOS IPK packaging.

The documented toolchain includes Tizen Studio, the TV Extension, certificate tooling, CLI, simulator/emulator, and Web Inspector. Samsung documents Windows, Ubuntu, and macOS development environments. A CLI workflow exists for building, packaging, installing, running, and uninstalling applications; the exact supported tool versions must be checked again before installation.

Official starting points:

- [Creating TV web applications](https://developer.samsung.com/smarttv/develop/getting-started/creating-tv-applications.html).
- [SDK prerequisites](https://developer.samsung.com/smarttv/develop/tools/prerequisites.html).
- [Tizen CLI](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html).
- [Creating certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).
- [Connecting a TV and SDK](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

A certificate profile combines author and distributor certificates. The documented Samsung development flow includes the target TV's DUID in the distributor certificate. Author-certificate continuity matters for subsequent published updates.

Developer Mode requires the appropriate TV menu, the developer computer's IP, a restart, and a device connection on the same network. Menu paths and cold-reboot behavior can vary with firmware. This research did not inspect existing accounts, certificates, DUIDs, device profiles, or network sessions.

### 4.3 Development installation is not distribution

Samsung's [application-testing FAQ, question 7](https://developer.samsung.com/smarttv/develop/faq/application-testing.html) explicitly says that applications installed through Tizen Studio are uninstalled when the TV is switched off or disconnected from Studio, describing this as intended behavior.

Treat that documented limitation as a deployment risk to test on the actual firmware, not as a guarantee that every community installer behaves identically. Reports that a sideload persists do not automatically establish a supported long-term distribution channel.

Raw `.wgt` USB installation is not the standard documented retail-TV path. Seller Office's USB Demo Packaging Tool instead produces `.tmg` and license files for its particular demo workflow. Store publication, closed beta, and partner alpha are separate Seller Office processes with their own eligibility, review, activation, or device restrictions.

See [Samsung application distribution](https://developer.samsung.com/tv-seller-office/guides/applications/distributing-application.html) and the [application-installation FAQ](https://developer.samsung.com/smarttv/develop/faq/application-installation.html).

Consequences for Calinguero:

- “No login or activation inside the app” does not eliminate development signing or per-device installation requirements.
- A closed-beta activation mechanism would be an installation/distribution choice, not an already approved change to Calinguero's first-launch product flow.
- Do not promise permanent installation, automatic binary updates, or store acceptance before validating the chosen route.
- Keep signing keys and any DUID/device inventory private; do not place them in this report or a public repository.

### 4.4 Playback paths

Samsung documents both [HTML5 video](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-video-elements.html) and [AVPlay](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html).

| Path | Evidence-backed role | Important qualification |
| --- | --- | --- |
| HTML5 `<video>` | Ordinary supported media and WebVTT tracks; browser-level integration. | A supported web engine does not prove every container, codec, MSE library version, or long session works. |
| AVPlay | Adaptive streaming, broader format/codec integration, UHD, DRM features where authorized, track/subtitle selection, seek, and streaming controls. | This is a Samsung-specific player integration, not an import of webOS Luna or Android mpv. Model, format, state-machine, and firmware constraints remain. |
| hls.js/MSE | A possible browser playback path on supported combinations; community reports demonstrate both working and failing versions. | “hls.js never works on Tizen” is false as a universal claim. MSE resolution limits and long-session regressions matter. |

The [AVPlay API reference](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html) documents HLS, MPEG-DASH, Smooth Streaming, audio/subtitle selection, cookies, user-agent override, and adaptive-streaming controls.

The research found `COOKIE` and `USER_AGENT` controls, but **did not establish a generic arbitrary-header or `Referer` injection API for media requests**. This is an evidence gap, not a proof that every possible Samsung integration is incapable of it. Provider-specific header requirements are a hard feasibility test: do not silently introduce a retransmitting proxy or reuse the webOS Node service to solve them.

Network access, allowed origins, privileges, and CSP need explicit configuration. CORS success alone is not playback proof, while missing AVPlay traffic in Web Inspector is not proof of missing network activity.

### 4.5 Reference media limits, not a compatibility guarantee

For the documented 2023 `23TV_BASIC1` reference group, the [2023 media specification](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2023-tv-video-specifications.html) lists, subject to its profile/container conditions:

| Item | Documented reference limit |
| --- | --- |
| H.264 | 4K/30 or 1080p/60, depending on resolution/profile conditions. |
| HEVC Main/Main10 | 4K/30. |
| AV1 / VP9 | Up to 4K/60 under the listed conditions. |
| MSE | FHD limit in the reference specification. |
| DTS | Not supported on the documented 2023 Tizen 7.0 models. |

These are not promises about every stream, the target's unidentified regional SKU, or an upgraded OS. Audio, subtitles, manifest structure, redirects, transport behavior, and actual sustained decoding require separate tests.

Older official sample code also needs version scrutiny: an AVPlay privilege appearing in a legacy sample must not override current documentation saying that privilege has been unused in TV web applications since 2015.

## 5. Repository comparison

The following revisions were inspected on 2026-11-23. Tests and build scripts were inspected, not executed. “Latest” activity is a snapshot of this investigation and must be refreshed before adopting a fork.

| Candidate and pinned source | License and provenance observed | Implemented shape / fit | Decision for M0 |
| --- | --- | --- | --- |
| [OpenIPTV — `91b336a`](https://github.com/shayanline/OpenIPTV/tree/91b336a3a6ba5ecf28720b303438297e48163223) | [MIT text](https://github.com/shayanline/OpenIPTV/blob/91b336a3a6ba5ecf28720b303438297e48163223/LICENSE); HEAD dated 2026-11-21; [release 1.9.3](https://github.com/shayanline/OpenIPTV/releases/tag/1.9.3), 2026-10-05. | React/TypeScript/Vite, AVPlay plus HTML5 fallback, M3U, Xtream live/VOD/series, EPG/catch-up, remote keys, persistence/cache, Vitest and WGT/deployment scripts. Its viewer-driven provider-entry workflow does not implement Calinguero's automatic central provisioning. | **Strongest inspected standalone Tizen fallback/reference.** Good feature and release/test evidence; still needs product-specific provisioning and actual CU7000 proof. |
| [Chouette TV — `794dbef`](https://github.com/ipaifix/chouette-tv/tree/794dbef6331df08560a2ef93f95532e90bc3cbd7) | [MIT text](https://github.com/ipaifix/chouette-tv/blob/794dbef6331df08560a2ef93f95532e90bc3cbd7/LICENSE); HEAD dated 2026-10-22; no GitHub release found during inspection. | Standalone JavaScript; AVPlay/HTML5, M3U/Xtream live/VOD/series, EPG, remote control, browser/Tizen storage, tests and offline build. | Credible lightweight alternative, with weaker observed release provenance than OpenIPTV. |
| [SKY IPTV Tizen — `f816178`](https://github.com/sanwhere/sky-iptv-tizen/tree/f816178dc8ed54efa0d204c51b31227bf8d92cb1) | [MIT text](https://github.com/sanwhere/sky-iptv-tizen/blob/f816178dc8ed54efa0d204c51b31227bf8d92cb1/LICENSE); HEAD dated 2026-09-01; [v1.1.1](https://github.com/sanwhere/sky-iptv-tizen/releases/tag/v1.1.1), 2026-08-06. | Standalone JavaScript; AVPlay/HTML5, M3U/Xtream-derived content, remote controls, IndexedDB/localStorage and tests. EPG is an identified gap. | Useful focused playback/storage reference; less complete for the later roadmap. |
| [StreamVault — `0144e91`](https://github.com/christopherklint97/streamvault/tree/0144e91657d5ae59bca13c5a722fcff5152e80f0) | [MIT application](https://github.com/christopherklint97/streamvault/blob/0144e91657d5ae59bca13c5a722fcff5152e80f0/LICENSE); [v0.1.0](https://github.com/christopherklint97/streamvault/releases/tag/v0.1.0), 2026-11-07. Its distributed backend image also contains GPL-licensed components. | Preact/TypeScript/Vite frontend with a required separate Node/SQLite backend. Its [pinned README](https://github.com/christopherklint97/streamvault/blob/0144e91657d5ae59bca13c5a722fcff5152e80f0/README.md) explicitly says a WGT alone is not a standalone player and describes FFmpeg/x264/x265 and other image-license obligations. | Do not choose for the first prototype: it adds a second application-specific backend and operational obligations. Calinguero already needs a central catalog backend; the objection is unnecessary additional coupling, **not a nonexistent ban on all backends**. |
| [APL-TV — `6a2cfd5`](https://github.com/Knikt/APL-TV/tree/6a2cfd54763a3d49651d281e01c5dd65baf45556) | [MIT text with third-party exclusions](https://github.com/Knikt/APL-TV/blob/6a2cfd54763a3d49651d281e01c5dd65baf45556/LICENSE); [v1.4.14](https://github.com/Knikt/APL-TV/releases/tag/v1.4.14), 2026-11-23. | Broad player functionality, but helper/network/default-content machinery and automatic remote code-update behavior expand the inspection and maintenance surface. | Do not adopt as the base without a separate need and supply-chain assessment. A narrow catalog-source update is not the same as remote executable-code updating. |

### 5.1 Concrete code evidence

- OpenIPTV: [playback adapter](https://github.com/shayanline/OpenIPTV/blob/91b336a3a6ba5ecf28720b303438297e48163223/src/services/player.ts#L26-L32), [Xtream content support](https://github.com/shayanline/OpenIPTV/blob/91b336a3a6ba5ecf28720b303438297e48163223/src/services/xtream.ts#L290-L295), and [Tizen remote-key integration](https://github.com/shayanline/OpenIPTV/blob/91b336a3a6ba5ecf28720b303438297e48163223/src/hooks/useRemote.ts#L75-L77).
- Chouette: [player integration](https://github.com/ipaifix/chouette-tv/blob/794dbef6331df08560a2ef93f95532e90bc3cbd7/app/js/player.js#L10-L30) and [Xtream live/VOD/series paths](https://github.com/ipaifix/chouette-tv/blob/794dbef6331df08560a2ef93f95532e90bc3cbd7/app/js/xtream.js#L325-L359).
- SKY: [player implementation](https://github.com/sanwhere/sky-iptv-tizen/blob/f816178dc8ed54efa0d204c51b31227bf8d92cb1/js/player.js#L66-L75) and [storage layer](https://github.com/sanwhere/sky-iptv-tizen/blob/f816178dc8ed54efa0d204c51b31227bf8d92cb1/js/store.js#L1-L3).
- APL-TV: [code-updater implementation](https://github.com/Knikt/APL-TV/blob/6a2cfd54763a3d49651d281e01c5dd65baf45556/app/js/updater.js#L1-L17).

These references establish implementation paths, not independent runtime verification, absence of telemetry, or a complete security review.

### 5.2 Candidates not cleared for reuse

- `smjmusavi/Lumio-IPTV` and `kingflooow/floh-iptv`: no license text was detected in the research inspection. This is not a legal conclusion about every branch or historical version, but it blocks recommending code reuse until permission is established.
- `dearbulut/tizen-xtream-iptv`: the requested public repository returned HTTP 404. Its existence, accessibility, and reuse conditions were not established.
- Installer catalogs, including Apps2Samsung community packages, are useful discovery aids, not proof of source availability, license compatibility, device support, or safety.

An MIT or Apache root license is not complete dependency/license clearance. Preserve required notices and inspect the actual dependency/binary distribution before copying or publishing code. Do not assume installer-project licensing is constant across versions.

## 6. Reusing the webOS client versus a Tizen-specific base

The local webOS baseline is `webos-iptv-player` 1.18.0 at commit `15243b2ffe8d6b919a13595c70fdada4840bb1c1`, under Apache-2.0. Its original IPK has been built and structurally verified, including its Node.js 0.12.2 service smoke. **That is LG build evidence, not Samsung compatibility evidence.**

The local code inspection covered `src/app.ts`, `src/components/player-pipeline.ts`, `src/navigation/key-handler.ts`, `src/services/playlist-service.ts`, `src/services/storage-service.ts`, `src/services/luna.ts`, `src/services/luna-media.ts`, and `src/utils/platform.ts`.

| Concern | Reuse candidate | Tizen-specific work or uncertainty |
| --- | --- | --- |
| Catalog domain and parsing | M3U/XMLTV, Xtream content concepts, categories and content identifiers. | Central automatic provisioning/refresh is still product work; a source-entry screen is not the requested first launch. |
| UI and focus | Existing Live/Guide/Movies/Series/Search views, reusable DOM logic and focus scopes. | Key registration, Back/exit behavior, lifecycle and actual Tizen engine behavior need proof. |
| Persistence | Existing browser storage concepts and cache behavior. | Verify quotas, update/uninstall semantics, recovery and restored state on Samsung. |
| Playback | The existing player facade is a possible replacement boundary. | Add/test a Samsung AVPlay path and appropriate HTML5 fallback; do not reuse Luna calls or claim an identical media state machine. |
| Native services | None assumed. | The webOS Luna/bundled Node service is not a Tizen TV service. LAN upload, media-header proxying and reminders must not be carried over as if they were portable web code. |
| Packaging and permissions | Branding and product concepts only. | `config.xml`, privileges, signing, WGT creation and distribution are separate. |

**Why try the existing frontend first:** it preserves already available product behavior and avoids replacing the entire UI/catalog stack merely to add one platform. **Why this remains conditional:** no costed port, Tizen compile, service-coupling experiment, or on-device media test was executed.

**When to prefer OpenIPTV:** the spike shows unavoidable webOS coupling, playback integration problems, or lifecycle/focus failures that make the adaptation materially less contained than using its existing Tizen implementation. Conversely, a new native base must still replace manual provider setup with Calinguero provisioning and reproduce the required product behavior.

Neither route fixes the central panel's existing omissions automatically. The [public project plan](PROJECT_PLAN.md) records that the inspected curated output is live-only and does not yet supply managed movies, series, or EPG. A feature in a player does not create the corresponding server contract.

## 7. Community and hardware evidence

The following reports identify useful failure modes, not compatibility guarantees. The target television has not been connected to or tested.

| Source and date | Device or context | Observed evidence and its limits |
| --- | --- | --- |
| [Samsung application-testing FAQ](https://developer.samsung.com/smarttv/develop/faq/application-testing.html), undated; accessed 2026-11-23 | Official TV development guidance | Developer Mode and real-device testing are part of the documented workflow. Samsung Instant On can require a genuine power cycle. Web Inspector does not capture AVPlay media traffic, so missing inspector requests are not proof that no media request occurred. |
| [Samsung data/file FAQ](https://developer.samsung.com/smarttv/develop/faq/data-and-file-handling.html), undated; accessed 2026-11-23 | Official storage/update behavior | Ordinary application updates preserve Web Storage; uninstalling deletes it. Samsung explicitly notes that Studio test-build updates uninstall the previous build first, deleting local Web Storage. Do not confuse a catalog refresh with replacing a test application binary. |
| [Author/distributor certificate discussion](https://forum.developer.samsung.com/t/can-i-test-my-tizen-app-on-my-samsung-tv-without-author-certificate/25108), 2023-04-14 | Samsung developer forum | Describes Samsung author/distributor signing and device DUID registration. Useful process evidence, but the age of the thread means current SDK interfaces and requirements still need official confirmation. |
| [SDB connection discussion](https://forum.developer.samsung.com/t/cant-connect-to-tv-using-tizen/20638), reports from 2022–2024 | Includes UE50TU7070UXZT | Reports distinguish cold reboot from standby, certificate type, active network interface, IP changes, and firewall problems. These are troubleshooting leads, not one proven cause applying to every TV. |
| [Apps2Samsung CU-family report](https://github.com/Apps2Samsung/Apps2Samsung/issues/118#issuecomment-3397481326), 2025-10-13 | UN55CU7700GXZD and UN65RU7100GXZD | A user reports beta-installer success after earlier Studio/certificate conflicts. This is nearby CU-family evidence, **not a test of CU7000 or the target device**. |
| [Developer Mode navigation change](https://github.com/jellyfin/jellyfin-tizen/issues/299), 2024-10-23 | One UI interface | A report locates Developer Mode through Apps → App Settings → `12345`. Navigation instructions are firmware-sensitive; do not assume an older menu path remains correct. |
| [Tizen 9 connection report](https://github.com/Apps2Samsung/Apps2Samsung/issues/751), 2026-10-17 | QN77S90FAFXZA, firmware 1301.0 | The reported SDB port stayed closed. A cold-boot suggestion is not a confirmed resolution. This is not evidence about the CU7000's installed OS. |
| [hls.js issue 3211](https://github.com/video-dev/hls.js/issues/3211), 2020-11-05 | 2017 TV, Tizen 3 | Reports a stream working with hls.js 0.14.3 and failing with later versions. This directly contradicts the universal claim that hls.js can never work on Tizen, without establishing suitability for a new client. |
| [hls.js issue 6562](https://github.com/video-dev/hls.js/issues/6562), 2024-07-18 | Tizen 7 / Chromium 94, hls.js 1.5.13 | Reports playback followed by buffer slowdown/crash after 10–30 minutes. Correct CORS configuration did not establish long-session stability. |
| [Moonfin live-playback report](https://github.com/Moonfin-Client/Smart-TV/issues/232), 2026-06-05 | Tizen 5.5 / 2020; corroboration on 2019 Q70R | Reports an HLS regression after a playback-path change. The proposed fMP4/profile explanation was not a final verified diagnosis; AVPlay use alone does not prove format compatibility. |
| [Jellyfin AVPlay discussion](https://github.com/jellyfin/jellyfin-tizen/issues/214), opened 2023-08-13 | Samsung Q55Q70R | Discusses remux playback, wrong audio selection, and missing subtitle overlays. It is implementation/field evidence, not a complete codec or subtitle-support matrix. |

### 7.1 Implications for the pilot

- Record full SKU, region, firmware, installed platform version, and active network interface before transferring claims from another report.
- Treat a signed Developer Mode installation as a development route, not proof of permanent installation or general distribution.
- Check application installation, application update, uninstall/reinstall, and central catalog refresh as different operations with different storage effects.
- Exercise remote focus and Back behavior, network loss, redirects, expiring playback URLs, HTTP headers, TLS, audio tracks, and subtitle tracks with specifically authorized samples.
- Include a sustained-playback experiment in the proposed hardware proof; merely opening a stream is insufficient to rule out the reported long-session failures.
- Do not recommend rooting, security bypasses, or unverified installers as a shortcut around signing or deployment issues.

### 7.2 Source-access limitations

The field-research stream received HTTP 403 from Reddit JSON endpoints, while `old.reddit` exposed only a page shell. No authenticated session or anti-bot bypass was attempted. This is an access limitation, not evidence that relevant Reddit reports do not exist.

Official Samsung FAQs and accessible public forum/GitHub discussions supplied the evidence above. Dates identify individual reports rather than the date of the last search-index crawl. Root-cause suggestions and successful behavior on another TV remain explicitly qualified.

## 8. Recommendation and minimal M0 proof

### 8.1 Recommended sequence

1. Resolve the television's actual identity and the pilot's acceptable installation route.
2. Authorize a bounded prototype using the existing web frontend with a separate Tizen platform/playback/build target.
3. Use OpenIPTV as a source-reviewed comparison and fallback, not as an automatic second full implementation.
4. Stop at the first consequential media, header, lifecycle, or distribution incompatibility and decide its treatment explicitly.
5. Only then commit to the wider Calinguero UI/catalog adaptation. Keep Android and LG work independent of a claim of Samsung parity.

The implementation and hardware proof remain proposed work; none was performed as part of this research.

### 8.2 Proposed staged proof

The following is a proposed acceptance outline to agree before execution, not a record of tests performed:

| Stage | Smallest useful experiment | Evidence to record |
| --- | --- | --- |
| Identity and deployment | Obtain exact model/firmware/platform information; choose supported signing and pilot-installation route. | Actual device identity, documented versus observed installation restrictions; sensitive certificate/DUID details kept outside public notes. |
| Signed shell | Build/sign/install a minimal WGT and confirm launch, registered remote keys, Back/focus behavior, cold restart and power cycle. | Build/package versions, install/launch result, lifecycle behavior, persistence or removal after disconnection. |
| Playback | One or a few explicitly authorized representative live samples through AVPlay and/or HTML5; no provider-wide scanning. | Format, codecs, start result, picture/audio, required headers, redirects/TLS, and player error details without secrets. |
| Automatic catalog | Obtain a small central catalog on first open without viewer-entered URL/account data; retain categories and stable local identifiers. | First-launch recording, cache/offline state, central-source address/configuration handling and failure state. |
| Source update | Change an approved source centrally and refresh without reinstalling the application or reconfiguring the viewer. | Preserved content identity, new source selection and actual playback; do not confuse this with a binary test update. |
| Resilience and duration | Test network interruption/recovery, relaunch, source expiry and a sustained session, with an agreed duration such as 30–60 minutes. | Observed recovery, memory/playback degradation and focus restoration. No universal reliability claim from one success. |

Add representative movies, episodes, EPG, audio tracks and subtitles as the corresponding managed contracts become available. The first proof does not require implementing the entire VOD/series roadmap.

The multi-network pilot remains a separate concern: central catalog reachability, installation logistics, authorized account concurrency and three-to-six simultaneous TV playback are not proved by a local WGT or a single TV.

### 8.3 Decision gates

- **Proceed with adaptation** only after the signed shell, direct playback and automatic-catalog experiments work on the real target within the agreed installation constraints.
- **Reconsider OpenIPTV or another inspected base** if its existing Tizen integration materially reduces observed platform work without unacceptable product or license gaps.
- **Return to a product decision** if required media headers, codecs, distribution persistence, or provider limits cannot be satisfied. A video proxy/transcoder, per-viewer activation, root access or a new backend is not an automatic fallback authorized by this research.

## 9. Open questions, risks, and limitations

| Open item | Why it matters | How to resolve it |
| --- | --- | --- |
| Exact CU7000 SKU, region, firmware and installed platform | Family/year evidence cannot establish actual runtime behavior. | Obtain device information before selecting SDK target and hardware tests. |
| Signing, DUID and installation persistence | Developer installation may not support the desired near-user distribution model. | Validate current official tooling and observe the exact TV; choose deployment separately. |
| Required provider headers, TLS and redirects | AVPlay's documented controls do not establish arbitrary header support. | Agree on authorized samples and test the media request path; do not expose credentials in logs. |
| Codec/container/subtitle combinations | HTML5, MSE and AVPlay expose different capabilities and limits. | Build a small representative, model-specific test matrix. |
| WebOS platform/service coupling | A shared web language does not make Luna or the bundled Node service portable. | Bound the adapter spike and record missing features rather than pretending parity. |
| Central catalog contracts | Current inspected curated output does not implement all VOD/series/EPG requirements. | Continue the corresponding planned modules; do not attribute this server gap to the Tizen player. |
| Binary updates versus catalog refresh | Development updates may erase storage, while catalog updates must not require reinstall. | Exercise and document the two operations separately. |
| Dependency/license clearance | Root licenses and public availability do not cover every bundled component. | Recheck pinned revisions and distribution obligations before code reuse or publication. |
| Community evidence freshness/access | A report on another firmware, an unresolved issue, or an inaccessible Reddit page is incomplete evidence. | Preserve dates and device scope; confirm decisive claims through official sources or on-device proof. |

No physical Samsung TV, emulator, proposed repository build, SDK/certificate tool, content provider, or cloud deployment was exercised for this report. No security/telemetry clearance, legal opinion, store-approval prediction, performance guarantee, or implementation timeline is implied.

Research is sufficient to recommend the next experiment, not to certify production readiness or eliminate the remaining hardware and distribution decisions.

## 10. Sources

Sources are cited inline at the exact claims, with pinned repository revisions in section 5 and dated field reports in section 7.

Primary official reference set, accessed 2026-11-23:

1. [CU7000 product reference](https://www.samsung.com/latin_en/tvs/uhd-4k-tv/cu7000-43-inch-un43cu7000pxpa/).
2. [TV model groups](https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html).
3. [General platform specifications](https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html).
4. [Retrieving platform information](https://developer.samsung.com/smarttv/develop/guides/fundamentals/retrieving-platform-information.html).
5. [2023 TV video specifications](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2023-tv-video-specifications.html).
6. [HTML5 video playback](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-video-elements.html).
7. [AVPlay guide](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html) and [API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html).
8. [Certificate creation](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).
9. [TV/SDK connection](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).
10. [CLI](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html).
11. [Application testing FAQ](https://developer.samsung.com/smarttv/develop/faq/application-testing.html).
12. [Data/file handling FAQ](https://developer.samsung.com/smarttv/develop/faq/data-and-file-handling.html).
13. [Distribution](https://developer.samsung.com/tv-seller-office/guides/applications/distributing-application.html).

The [public project plan](PROJECT_PLAN.md), the webOS source at the named commit, and its previously verified build/test results provide project context only. They are not evidence of execution on Samsung.

Reddit access limits are recorded in section 7.2. Direct official documentation, public source, and accessible public discussions were used.
