import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AskProvider } from './panels/ask.tsx';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('No #root element');

createRoot(container).render(
  <React.StrictMode>
    <AskProvider>
      <App />
    </AskProvider>
  </React.StrictMode>,
);
