# Central Catalog Provisioning

Optional zero-config provisioning for centrally curated M3U live lists, EPG feeds, and catalog accounts (`src/services/catalog-bootstrap.ts`).

## Configuration

`CatalogBootstrapService.sync()` runs once during `App.init()` before `loadData()`.

1. Set the optional `iptv_catalog_url` `localStorage` override, or build with `CALINGUERO_CATALOG_URL=https://host/catalog.json npm run build`.
2. When no valid `http://` or `https://` catalog URL is configured, `sync()` returns `{ status: 'disabled' }` without making network requests or mutating manual playlists.
3. On network or manifest validation errors, `sync()` preserves any previously provisioned managed sources in local storage and logs only the credential-redacted URL.

## Manifest Schema (`version: 1`)

```json
{
  "version": 1,
  "revision": "2026-11-24-01",
  "playlists": [
    {
      "id": "central-live",
      "name": "Central Live",
      "source": "url",
      "url": "https://host/live.m3u"
    }
  ],
  "epgSources": [
    {
      "url": "https://host/guide.xml",
      "playlistIds": ["central-live"]
    }
  ]
}
```

- **`revision`**: Required non-empty string (`<= 128` chars, no control characters). Changing `catalogRevision` triggers `ParentalControlService.reviewChangedSources()` even when the playlist URL itself stays fixed.
- **`playlists`**: Supports `'url'` and `'xtream'` sources with `http://` or `https://` URLs and unique `id` values. Reconciles only `managed: true` entries; unmanaged user lists and uploads remain intact.
- **`epgSources`**: Optional array of `http://` or `https://` XMLTV URLs with optional `playlistIds` scoping. Duplicate URLs already configured manually by the user keep user ownership.

## Stable Channel Identity (`calinguero-id`)

Curated `#EXTINF` lines may carry `calinguero-id="<id>"` (non-empty trimmed string, `<= 128` chars, no control characters):

```m3u
#EXTM3U
#EXTINF:-1 calinguero-id="ch-news-1" tvg-id="n1" group-title="News",News One
http://host/a.m3u8
```

When `Channel.canonicalId` is present, `channelKey(ch)` evaluates to `cid:<encoded-canonicalId>` instead of hashing the stream URL, keeping favorites, channel overrides, parental locks, reminders, catch-up progress, and A/V preferences intact across upstream URL swaps. Channels without `calinguero-id` fall back to the normalized stream URL hash.
