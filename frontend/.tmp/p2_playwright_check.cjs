const { chromium } = require('playwright');
const fs = require('node:fs/promises');

const baseUrl = 'http://localhost:3000';
const invalidRefreshToken = 'invalid.refresh.token';
const out = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  apiStateMachine: {},
  uiFlow: {},
};

function pickCookie(cookies, name) {
  return cookies.find((c) => c.name === name) || null;
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: 'refresh_token',
        value: invalidRefreshToken,
        url: baseUrl,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const request = context.request;

    const first = await request.get(`${baseUrl}/api/auth/me`);
    const firstJson = await first.json().catch(() => ({}));
    const firstCookies = await context.cookies(baseUrl);

    const second = await request.get(`${baseUrl}/api/auth/me`);
    const secondJson = await second.json().catch(() => ({}));
    const secondCookies = await context.cookies(baseUrl);

    out.apiStateMachine = {
      firstCall: {
        status: first.status(),
        body: firstJson,
        refreshCookiePresent: Boolean(pickCookie(firstCookies, 'refresh_token')),
        markerCookiePresent: Boolean(pickCookie(firstCookies, 'refresh_auth_error')),
      },
      secondCall: {
        status: second.status(),
        body: secondJson,
        refreshCookiePresent: Boolean(pickCookie(secondCookies, 'refresh_token')),
        markerCookiePresent: Boolean(pickCookie(secondCookies, 'refresh_auth_error')),
      },
    };

    await context.close();

    const uiContext = await browser.newContext();
    await uiContext.addCookies([
      {
        name: 'refresh_token',
        value: invalidRefreshToken,
        url: baseUrl,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const page = await uiContext.newPage();
    const apiResponses = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/api/auth/me') && !url.includes('/api/auth/refresh')) return;

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      apiResponses.push({
        url,
        status: response.status(),
        payload,
      });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.waitForSelector('text=Sign in to GoPlan', { timeout: 8000 });

    const finalCookies = await uiContext.cookies(baseUrl);
    const screenshotPath = '/Users/quangminh/Home/Python/Website/GoPlan/explain/screenshots/p2-invalid-refresh-final-login.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });

    out.uiFlow = {
      finalUrl: page.url(),
      refreshCookiePresent: Boolean(pickCookie(finalCookies, 'refresh_token')),
      markerCookiePresent: Boolean(pickCookie(finalCookies, 'refresh_auth_error')),
      apiResponses,
      screenshotPath,
    };

    await uiContext.close();

    const reportPath = '/Users/quangminh/Home/Python/Website/GoPlan/explain/p2_playwright_report.json';
    await fs.writeFile(reportPath, JSON.stringify(out, null, 2), 'utf-8');

    console.log(`REPORT_PATH=${reportPath}`);
    console.log(`SCREENSHOT_PATH=${out.uiFlow.screenshotPath}`);
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await browser.close();
  }
})();
