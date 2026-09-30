import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './styles.css';
import './styles/login.css';
import './styles/comercial-foundation.css';
import './styles/comercial.css';
import './styles/comercial-bridge.css';
import './styles/comercial-access.css';
import './styles/comercial-api.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
