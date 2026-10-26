import { test as base, expect } from '@playwright/test';

// Citizen regressions exercise the installed app; browser gateway tests use the base fixture.
export async function emulateInstalledPwa(context) {
  await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
}

export const test = base.extend({
  context: async ({ context }, use) => { await emulateInstalledPwa(context); await use(context); },
});
export { expect };
