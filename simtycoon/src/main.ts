import { bootstrap } from '@rendering/bootstrap';

const container = document.getElementById('app');

if (!container) {
  throw new Error('Missing #app container in index.html');
}

void bootstrap(container);
