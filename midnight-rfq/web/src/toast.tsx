import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, error = false) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 12000 : 7000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? " error" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
