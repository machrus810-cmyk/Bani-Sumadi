import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initAutoUpdate } from './autoUpdate';

// Inisialisasi auto-update otomatis: mendeteksi rilis/publish baru
// dan memperbarui aplikasi secara seamless tanpa refresh manual oleh pengguna
initAutoUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
