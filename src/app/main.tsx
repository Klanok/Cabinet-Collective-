import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorScreen } from './ErrorScreen.tsx';
import { AskProvider } from './panels/ask.tsx';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('No #root element');

createRoot(container).render(
  <React.StrictMode>
    {/*
      Outside `AskProvider`, so a crash is caught even if it happens on the way to putting the
      app on screen at all — which is exactly what a bad saved job does.
    */}
    <ErrorScreen>
      <AskProvider>
        <App />
      </AskProvider>
    </ErrorScreen>
  </React.StrictMode>,
);
