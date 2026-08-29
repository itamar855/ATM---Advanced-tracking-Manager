const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));

  try {
    await page.goto('https://atacadodasgaiolas.shop/', { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
  }
  
  await browser.close();
})();
