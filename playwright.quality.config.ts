import { defineConfig } from '@playwright/test';

const subpath = process.env.PAGES_BASE_PATH || '/115-1-Innovative-Integration-of-Medicine-and-EECS-Final-Project/';
const local = 'http://127.0.0.1:5193' + subpath;
const published = process.env.DEPLOYED_URL;
if (published && new URL(published).protocol !== 'https:') throw new Error('Expected a deployed HTTPS URL');

export default defineConfig({
  testDir: './quality',
  testMatch: published ? 'published.spec.ts' : '*.spec.ts',
  testIgnore: published ? [] : ['**/published.spec.ts'],
  timeout: 60_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: published || local, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: {
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    } } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: published ? [] : {
    command: 'npm run preview -- --host 127.0.0.1 --port 5193 --strictPort',
    env: { PAGES_BASE_PATH: subpath },
    url: local, reuseExistingServer: false, timeout: 30_000,
  },
});
