import type { Locator, Page } from '@playwright/test';

import en from '@/messages/en.json';
import { setE2ECallUser } from './e2e-call-user';
import { expect, test } from './fixtures';
import { CallPage } from './pages/call.page';
import { ClonePage } from './pages/clone.page';
import { waitForHydration } from './wait-for-hydration';

const sampleName = 'heike-reference.mp3';
const samplePath = `public/demo-clones/voxtral-3/${sampleName}`;
const fileInputSelector = 'input[type="file"]';

async function chooseMp3(page: Page, input: Locator, trigger: Locator) {
  // Playwright supplies the file directly. The accept check guards against
  // the iOS Files picker interpreting audio/* as a video filter.
  const formats = (await input.getAttribute('accept'))?.split(',') ?? [];
  expect(formats).toEqual(expect.arrayContaining(['.mp3', '.wav', '.m4a']));
  expect(formats).not.toContain('audio/*');

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    trigger.click(),
  ]);
  await chooser.setFiles(samplePath);
}

test('Call creator accepts a voice sample', async ({ page, baseURL }) => {
  await setE2ECallUser(page, baseURL, 'paid');
  const callPage = new CallPage(page);
  await callPage.goto();
  await waitForHydration(page, '[data-testid="character-picker"]');
  await callPage.ownCharacters
    .getByRole('button', { name: new RegExp(en.call.picker.createTitle) })
    .click();
  await callPage.creator
    .getByRole('button', { name: new RegExp(en.call.voices.cloneTitle) })
    .click();

  const dialog = page.getByTestId('clone-voice-dialog');
  await expect(dialog).toBeVisible();
  const upload = dialog.getByRole('button', { name: en.call.clone.uploadFile });
  if (await upload.isVisible()) await upload.click();
  const input = dialog.locator(fileInputSelector);
  await chooseMp3(page, input, input);
  await expect(dialog.getByText(sampleName, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: en.call.clone.next }).click();
  await expect(dialog.getByLabel(en.call.clone.nameLabel)).toBeVisible();
});

test('Clone dashboard accepts a voice sample', async ({ page, baseURL }) => {
  await setE2ECallUser(page, baseURL, 'paid');
  const clonePage = new ClonePage(page);
  await clonePage.goto();
  await chooseMp3(
    page,
    clonePage.fileInput,
    page.getByTestId('clone-upload-dropzone'),
  );
  await expect(page.getByText(sampleName, { exact: true })).toBeVisible();
});

for (const tool of ['audio-converter', 'transcribe', 'audio-joiner']) {
  test(`${tool} accepts an MP3`, async ({ page }) => {
    await page.goto(`/en/tools/${tool}`, { waitUntil: 'domcontentloaded' });
    const input = page.locator(`main ${fileInputSelector}`);
    await waitForHydration(page, `main ${fileInputSelector}`);
    const trigger =
      tool === 'audio-joiner'
        ? page.getByRole('button', { name: en.audioJoiner.dropZone.addFiles })
        : page.getByRole('button').filter({
            has: page.locator(fileInputSelector),
          });
    await chooseMp3(page, input, trigger);
    await expect(page.locator('main').getByText(sampleName)).toBeVisible();
    if (tool === 'transcribe') {
      await expect(
        page.getByRole('button', { name: en.transcribe.loadAndTranscribe }),
      ).toBeEnabled();
    }
  });
}
