import { execFileSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';

export const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

export async function verifySite(page: Page, site: string) {
  const previousErrors = (await page.pageErrors()).length;
  const home = new URL(site);
  if (!home.pathname.endsWith('/')) home.pathname += '/';
  home.searchParams.set('verify', revision);
  const response = await page.goto(home.href);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '關節動作分析', exact: true })).toBeVisible();
  await expect(page.locator('meta[name="build-revision"]')).toHaveAttribute('content', revision);

  const assets = await page.locator('script[type=module][src], link[rel=modulepreload], link[rel=stylesheet]').evaluateAll(nodes =>
    nodes.map(node => node instanceof HTMLScriptElement ? node.src : (node as HTMLLinkElement).href));
  expect(assets.some(url => url.endsWith('.css'))).toBe(true);
  expect(assets.some(url => url.endsWith('.js'))).toBe(true);
  for (const url of assets) {
    expect(url.startsWith(new URL('assets/', home).href), url).toBe(true);
    const asset = await page.request.get(url);
    expect(asset.status(), url).toBe(200);
    expect(asset.headers()['content-type'], url).toMatch(url.endsWith('.css') ? /text\/css/ : /javascript/);
  }
  for (const stem of ['vision_wasm_internal', 'vision_wasm_module_internal']) {
    for (const extension of ['js', 'wasm']) {
      const url = new URL(`mediapipe/wasm/${stem}.${extension}`, home).href;
      const asset = await page.request.get(url, { headers: { Range: 'bytes=0-7' } });
      expect([200, 206], url).toContain(asset.status());
      expect(asset.headers()['content-type'], url).toMatch(extension === 'js' ? /javascript/ : /application\/wasm/);
      if (extension === 'wasm') expect((await asset.body()).subarray(0, 4)).toEqual(Buffer.from([0,97,115,109]));
    }
  }
  expect((await page.pageErrors()).slice(previousErrors)).toEqual([]);
}
