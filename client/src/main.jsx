import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource/tajawal/arabic-400.css';
import '@fontsource/tajawal/arabic-500.css';
import '@fontsource/tajawal/arabic-700.css';
import '@fontsource/tajawal/arabic-800.css';
import '@fontsource/tajawal/latin-400.css';
import './styles/index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { PwaProvider } from './pwa/PwaProvider';
import { NetworkBoundary, PwaNotices } from './pwa/PwaExperience';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><PwaProvider><NetworkBoundary><AuthProvider><App /><PwaNotices /></AuthProvider></NetworkBoundary></PwaProvider></BrowserRouter></React.StrictMode>,
);
