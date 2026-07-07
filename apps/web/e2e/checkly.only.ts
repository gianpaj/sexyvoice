/**
  * To learn more about Playwright Test visit:
  * https://checklyhq.com/docs/browser-checks/playwright-test/
  * https://playwright.dev/docs/writing-tests
  */

const { expect, test } = require('@playwright/test')

// Configure the Playwright Test timeout to 210 seconds,
// ensuring that longer tests conclude before Checkly's browser check timeout of 240 seconds.
// The default Playwright Test timeout is set at 30 seconds.
// For additional information on timeouts, visit: https://checklyhq.com/docs/browser-checks/timeouts/
test.setTimeout(100000)

// Set the action timeout to 10 seconds to quickly identify failing actions.
// By default Playwright Test has no timeout for actions (e.g. clicking an element).
test.use({
  actionTimeout: 5000,
  extraHTTPHeaders: {
    'x-vercel-protection-bypass': process.env.VERCEL_BYPASS_TOKEN
  }
})

test('visit page and take screenshot', async ({ page }) => {
  const response = await page.goto('https://sexyvoice.ai/en')

  // Test that the response did not fail
  expect(response.status(), 'should respond with correct status code').toBeLessThan(400)

  // Take a screenshot
  await page.screenshot({ path: 'screenshot.jpg' })

  await page.getByRole('navigation').getByRole('link', { name: 'Log in' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('gianpa@gmail.com');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard/**', { timeout: 10000 });
  console.log('Authentication successful!');
  console.log('url', page.url)
  // Use domcontentloaded instead of load to avoid hanging on async resources
  // (Supabase realtime, PostHog analytics, etc. can prevent load event)
  await page.goto('https://sexyvoice.ai/en/dashboard/generate', {
    waitUntil: 'domcontentloaded',
  });
  const textInput = page.getByRole('textbox', {
    name: /enter the text you want to convert to speech/i,
  });
  await textInput.waitFor({ state: 'visible', timeout: 15000 });
  // await page.goto('https://sexyvoice.ai/en/dashboard/call')
  await textInput.fill('hello there');
  await page.getByTestId('generate-button').click();

  await page.getByText('Audio generated successfully!').waitFor();
  // Take a second screenshot
  await page.screenshot({ path: 'screenshot2.jpg' })
})
