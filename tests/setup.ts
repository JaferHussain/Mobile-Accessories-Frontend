import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// findBy* and waitFor give up after 1 second by default. On a busy machine running the whole suite
// at once, a form typed into by user-event can take longer than that to settle, and unrelated tests
// failed at random. More time to wait changes no assertion — only how long a slow machine may take.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
});
