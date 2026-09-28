import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import HomePage from './pages/HomePage';
import JoinPage from './pages/JoinPage';
import CartPage from './pages/CartPage';
import SettlePage from './pages/SettlePage';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/cart/:token" element={<CartPage />} />
          <Route path="/cart/:token/settle" element={<SettlePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
