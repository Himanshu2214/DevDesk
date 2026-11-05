// Runs after the cloud tests (project "cloud-teardown", also when tests failed): removes any E2E account of this run that
// a test's own clean-up missed, and abandoned ones from earlier runs. A failure here fails the run.
import { test as teardown } from '@playwright/test';
import { sweepAccounts } from './cloud';

teardown('no E2E accounts are left behind', async () => {
  const n = await sweepAccounts(true);
  if (n) console.log(`Removed ${n} leftover E2E account${n > 1 ? 's' : ''}.`);
});
