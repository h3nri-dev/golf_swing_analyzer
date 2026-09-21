import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '*.spec.js', workers: 1,
  use: { baseURL: 'http://127.0.0.1:8080', viewport: {width:1440,height:1100}, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' },
  webServer: {command:'npm start', url:'http://127.0.0.1:8080', reuseExistingServer:true},
});
