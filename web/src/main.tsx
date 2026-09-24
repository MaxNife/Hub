import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts: Hub runs locally and must look right offline.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
