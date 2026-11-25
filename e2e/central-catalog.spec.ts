import {
  enterTab,
  expect,
  liveLoaded,
  routeLiveManifest,
  test,
  type Page,
} from './helpers';

const CATALOG_URL = 'http://catalog.example.com/catalog.json';
const M1_URL = 'http://catalog.example.com/m1.m3u';
const M2_URL = 'http://catalog.example.com/m2.m3u';

const M1_V1 = [
  '#EXTM3U',
  '#EXTINF:-1 calinguero-id="cid-alpha" group-title="News",Alpha One',
  'http://streams.example.com/alpha-v1.m3u8',
  '#EXTINF:-1 calinguero-id="cid-beta" group-title="News",Beta Two',
  'http://streams.example.com/beta.m3u8',
].join('\n');

const M1_V2 = [
  '#EXTM3U',
  '#EXTINF:-1 calinguero-id="cid-alpha" group-title="News",Alpha One',
  'http://streams.example.com/alpha-v2.m3u8',
  '#EXTINF:-1 calinguero-id="cid-gamma" group-title="News",Gamma Three',
  'http://streams.example.com/gamma.m3u8',
].join('\n');

const M2_V2 = [
  '#EXTM3U',
  '#EXTINF:-1 calinguero-id="cid-delta" group-title="Sports",Delta Four',
  'http://streams.example.com/delta.m3u8',
].join('\n');

async function routeCentralCatalog(
  page: Page,
  getRevision: () => number,
  onCatalogRequest?: () => void,
): Promise<void> {
  await routeLiveManifest(page);
  await page.route(CATALOG_URL, (route) => {
    onCatalogRequest?.();
    const rev = getRevision();
    let manifest;
    if (rev === 1) {
      manifest = {
        version: 1,
        revision: 'rev-1',
        playlists: [
          { id: 'm1', name: 'Central One', source: 'url', url: M1_URL, revision: 'm1-r1' },
        ],
        epgSources: [],
      };
    } else if (rev === 2) {
      manifest = {
        version: 1,
        revision: 'rev-2',
        playlists: [
          { id: 'm1', name: 'Central One', source: 'url', url: M1_URL, revision: 'm1-r2' },
          { id: 'm2', name: 'Central Two', source: 'url', url: M2_URL, revision: 'm2-r1' },
        ],
        epgSources: [],
      };
    } else {
      manifest = {
        version: 1,
        revision: 'rev-3',
        playlists: [],
        epgSources: [],
      };
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(manifest),
    });
  });
  await page.route(M1_URL, (route) => route.fulfill({
    status: 200,
    contentType: 'application/x-mpegurl',
    body: getRevision() === 1 ? M1_V1 : M1_V2,
  }));
  await page.route(M2_URL, (route) => route.fulfill({
    status: 200,
    contentType: 'application/x-mpegurl',
    body: M2_V2,
  }));
}

async function focusFirstChannelRow(page: Page): Promise<void> {
  const row0 = page.locator('#view-channels .channel-main [data-list-position="0"]');
  await expect(row0).toBeVisible();
  for (let i = 0; i < 4; i++) {
    if (await row0.evaluate((el) => el.classList.contains('focused'))) break;
    await page.keyboard.press('ArrowRight');
  }
  await expect(row0).toHaveClass(/\bfocused\b/);
}

test('provisions managed lists at boot, hides them in Settings, and keeps calinguero-id favorites across updates', async ({
  page,
}) => {
  let revision = 1;
  await routeCentralCatalog(page, () => revision);

  await page.addInitScript((url) => {
    localStorage.setItem('iptv_catalog_url', url);
  }, CATALOG_URL);

  await page.goto('/');
  await liveLoaded(page);
  await expect(page.locator('#view-settings')).toBeHidden();
  await expect(page.locator('.channel-main .channel-item')).toHaveCount(2);

  await focusFirstChannelRow(page);
  await expect(page.locator('#view-channels .channel-main [data-list-position="0"]'))
    .toContainText('Alpha One');
  await page.evaluate(() =>
    document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 404, bubbles: true })));

  await page.locator('[data-group="builtin:favorites"]').click();
  await expect(page.locator('.channel-main .channel-item')).toHaveCount(1);
  await expect(page.locator('.channel-main .channel-item').first()).toContainText('Alpha One');
  await page.locator('[data-group="builtin:all"]').click();

  revision = 2;
  await enterTab(page, 'settings');
  await expect(page.locator('#view-settings')).toBeVisible();
  await expect(page.locator('#playlist-entries [data-source-entry]')).toHaveCount(0);
  await page.locator('#refresh-data').click();

  await liveLoaded(page);
  await expect(page.locator('.playlist-tab[data-playlist="m1"]')).toHaveText('Central One');
  await expect(page.locator('.playlist-tab[data-playlist="m2"]')).toHaveText('Central Two');
  await expect(page.locator('.channel-main .channel-item')).toHaveCount(3);
  await expect(page.locator('.channel-main')).toContainText('Alpha One');
  await expect(page.locator('.channel-main')).toContainText('Gamma Three');
  await expect(page.locator('.channel-main')).toContainText('Delta Four');
  await expect(page.locator('.channel-main')).not.toContainText('Beta Two');

  await page.locator('[data-group="builtin:favorites"]').click();
  await expect(page.locator('.channel-main .channel-item')).toHaveCount(1);
  await expect(page.locator('.channel-main .channel-item').first()).toContainText('Alpha One');
});

test('syncs added, removed, and restored central playlists during scheduled background refresh', async ({
  page,
}) => {
  let revision = 1;
  let catalogRequests = 0;
  await routeCentralCatalog(page, () => revision, () => { catalogRequests++; });

  await page.clock.install();
  await page.addInitScript((url) => {
    localStorage.setItem('iptv_catalog_url', url);
    localStorage.setItem('iptv_playlist_refresh_interval_hours', '1');
  }, CATALOG_URL);

  await page.goto('/');
  await liveLoaded(page);
  await expect(page.locator('.channel-main .channel-item')).toHaveCount(2);
  expect(catalogRequests).toBe(1);

  revision = 2;
  await page.clock.fastForward(60 * 60 * 1000 + 2000);
  await expect.poll(() => catalogRequests).toBe(2);
  await expect(page.locator('.playlist-tab[data-playlist="m2"]')).toHaveText('Central Two');
  await expect(page.locator('.channel-main .channel-item')).toHaveCount(3);
  await expect(page.locator('.channel-main')).toContainText('Gamma Three');
  await expect(page.locator('.channel-main')).toContainText('Delta Four');
  await expect(page.locator('.channel-main')).not.toContainText('Beta Two');

  // Allow queuePlaylistRefresh().then(onSettled) to schedule the next interval timer.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  revision = 3;
  await page.clock.fastForward(60 * 60 * 1000 + 2000);
  await expect.poll(() => catalogRequests).toBe(3);
  await expect(page.locator('.channel-main .channel-item')).toHaveCount(0);
  await expect(page.locator('#view-channels .playlist-tabs')).toHaveCount(0);

  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  revision = 2;
  await page.clock.fastForward(60 * 60 * 1000 + 2000);
  await expect.poll(() => catalogRequests).toBe(4);
  await expect(page.locator('.playlist-tab[data-playlist="m2"]')).toHaveText('Central Two');
  await expect(page.locator('.channel-main .channel-item')).toHaveCount(3);
  await expect(page.locator('.channel-main')).toContainText('Delta Four');
});
