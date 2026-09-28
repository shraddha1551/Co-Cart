/** Global dismissible toast (FR-UI-10): useToast()(message) shows it for 4 s. */
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const timer = useRef();
  const show = useCallback((text) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), 4000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div className="toast" role="alert">
          <span>{message}</span>
          <button className="icon" aria-label="Dismiss" onClick={() => setMessage(null)}>×</button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
