import React from 'react';
import { createRoot } from 'react-dom/client';
import BeatboxStory from './beatbox-story.jsx';

const mount = () => {
  const el = document.getElementById('root');
  if (!el) {
    console.error('No #root element to mount BeatboxStory into.');
    return;
  }
  createRoot(el).render(<BeatboxStory />);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
