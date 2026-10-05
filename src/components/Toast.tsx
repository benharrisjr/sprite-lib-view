import { useCallback, useRef, useState } from "react";

export interface ToastState {
  id: number;
  message: string;
  kind: "info" | "error";
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((message: string, kind: ToastState["kind"] = "info") => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, kind });
    timer.current = setTimeout(() => setToast(null), kind === "error" ? 6000 : 2200);
  }, []);

  return { toast, showToast };
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div key={toast.id} className={`toast ${toast.kind}`} role="status">
      {toast.message}
    </div>
  );
}
