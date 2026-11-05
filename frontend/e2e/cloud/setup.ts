// Runs before the cloud tests (project "cloud-setup"): every safety check, then removes E2E accounts abandoned by earlier
// interrupted runs. If anything fails here, no cloud test runs.
import { test as setup } from '@playwright/test';
import { ensureSafe, sweepAccounts } from './cloud';

setup('the test project passes the safety checks; abandoned E2E accounts are removed', async () => {
  await ensureSafe();
  const n = await sweepAccounts(false);
  if (n) console.log(`Removed ${n} abandoned E2E account${n > 1 ? 's' : ''} from earlier runs.`);
});
