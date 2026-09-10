import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { RuntimeErrorBoundary } from './app/RuntimeErrorBoundary';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Application root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <RuntimeErrorBoundary>
      <App />
    </RuntimeErrorBoundary>
  </StrictMode>,
);
