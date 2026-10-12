import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/global.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
