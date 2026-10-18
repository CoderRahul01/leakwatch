import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './styles/base.css';
import './styles/site.css';
import './styles/app.css';
import { ToastProvider } from './lib/toast';
import { Landing } from './pages/Landing';
import { Pricing } from './pages/Pricing';
import { SignIn } from './pages/SignIn';
import { Connect } from './pages/Connect';
import { NotFound } from './pages/NotFound';
import { AppRoot } from './app/AppRoot';

function ScrollTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
      return;
    }
    if (!/\/(leak|pages)\//.test(pathname)) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ScrollTop />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/demo/*" element={<AppRoot mode="demo" />} />
          <Route path="/app/*" element={<AppRoot mode="account" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
