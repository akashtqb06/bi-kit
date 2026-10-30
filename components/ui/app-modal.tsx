"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  AlertCircleIcon,
} from "lucide-react";
import { cn } from "cn";

export type ModalVariant = "default" | "destructive" | "warning" | "success" | "info";

export interface AlertModalOptions {
  title?: string;
  description: React.ReactNode;
  confirmText?: string;
  variant?: ModalVariant;
}

export interface ConfirmModalOptions extends AlertModalOptions {
  cancelText?: string;
}

interface ModalState {
  isOpen: boolean;
  type: "alert" | "confirm";
  title: string;
  description: React.ReactNode;
  confirmText: string;
  cancelText: string;
  variant: ModalVariant;
  resolve: (value: boolean) => void;
}

interface AppModalContextType {
  showAlert: (options: AlertModalOptions | string) => Promise<void>;
  showConfirm: (options: ConfirmModalOptions | string) => Promise<boolean>;
}

const AppModalContext = React.createContext<AppModalContextType | null>(null);

// Global fallback handler when outside React context or for window.alert override
let globalShowAlert: ((options: AlertModalOptions | string) => Promise<void>) | null = null;
let globalShowConfirm: ((options: ConfirmModalOptions | string) => Promise<boolean>) | null = null;

export function appAlert(options: AlertModalOptions | string): Promise<void> {
  if (globalShowAlert) {
    return globalShowAlert(options);
  }
  if (typeof window !== "undefined") {
    const message = typeof options === "string" ? options : `${options.title ? `${options.title}\n` : ""}${options.description}`;
    window.alert(message);
  }
  return Promise.resolve();
}

export function appConfirm(options: ConfirmModalOptions | string): Promise<boolean> {
  if (globalShowConfirm) {
    return globalShowConfirm(options);
  }
  if (typeof window !== "undefined") {
    const message = typeof options === "string" ? options : `${options.title ? `${options.title}\n` : ""}${options.description}`;
    return Promise.resolve(window.confirm(message));
  }
  return Promise.resolve(false);
}

export function AppModalProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = React.useState<ModalState | null>(null);

  const showAlert = React.useCallback(
    (options: AlertModalOptions | string): Promise<void> => {
      const opts = typeof options === "string" ? { description: options } : options;
      return new Promise<void>((resolve) => {
        setModalState({
          isOpen: true,
          type: "alert",
          title: opts.title || "Alert",
          description: opts.description,
          confirmText: opts.confirmText || "OK",
          cancelText: "Cancel",
          variant: opts.variant || "default",
          resolve: () => resolve(),
        });
      });
    },
    []
  );

  const showConfirm = React.useCallback(
    (options: ConfirmModalOptions | string): Promise<boolean> => {
      const opts = typeof options === "string" ? { description: options } : options;
      return new Promise<boolean>((resolve) => {
        setModalState({
          isOpen: true,
          type: "confirm",
          title: opts.title || "Confirm Action",
          description: opts.description,
          confirmText: opts.confirmText || "Confirm",
          cancelText: opts.cancelText || "Cancel",
          variant: opts.variant || "default",
          resolve,
        });
      });
    },
    []
  );

  React.useEffect(() => {
    globalShowAlert = showAlert;
    globalShowConfirm = showConfirm;

    // Gracefully redirect any window.alert calls to the app modal
    if (typeof window !== "undefined") {
      const originalAlert = window.alert;
      window.alert = (message?: unknown) => {
        void showAlert(String(message ?? ""));
      };

      return () => {
        globalShowAlert = null;
        globalShowConfirm = null;
        window.alert = originalAlert;
      };
    }

    return () => {
      globalShowAlert = null;
      globalShowConfirm = null;
    };
  }, [showAlert, showConfirm]);

  const handleConfirm = () => {
    if (modalState) {
      modalState.resolve(true);
      setModalState(null);
    }
  };

  const handleCancel = () => {
    if (modalState) {
      modalState.resolve(false);
      setModalState(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && modalState) {
      modalState.resolve(false);
      setModalState(null);
    }
  };

  const getIcon = (variant: ModalVariant) => {
    switch (variant) {
      case "destructive":
        return (
          <div className="size-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
            <AlertTriangleIcon className="size-5" />
          </div>
        );
      case "warning":
        return (
          <div className="size-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <AlertCircleIcon className="size-5" />
          </div>
        );
      case "success":
        return (
          <div className="size-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <CheckCircle2Icon className="size-5" />
          </div>
        );
      default:
        return (
          <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <InfoIcon className="size-5" />
          </div>
        );
    }
  };

  return (
    <AppModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {modalState && (
        <AlertDialog open={modalState.isOpen} onOpenChange={handleOpenChange}>
          <AlertDialogContent className="sm:max-w-[420px]">
            <div className="flex gap-4 items-start">
              {getIcon(modalState.variant)}
              <div className="flex-1 space-y-1.5 pt-0.5">
                <AlertDialogHeader className="text-left sm:text-left">
                  <AlertDialogTitle className="text-base font-semibold leading-none">
                    {modalState.title}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
                    {modalState.description}
                  </AlertDialogDescription>
                </AlertDialogHeader>
              </div>
            </div>
            <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
              {modalState.type === "confirm" && (
                <AlertDialogCancel
                  variant="outline"
                  onClick={handleCancel}
                  className="text-xs h-8"
                >
                  {modalState.cancelText}
                </AlertDialogCancel>
              )}
              <AlertDialogAction
                variant={modalState.variant === "destructive" ? "destructive" : "default"}
                onClick={handleConfirm}
                className={cn(
                  "text-xs h-8",
                  modalState.variant === "destructive"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : ""
                )}
              >
                {modalState.confirmText}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppModalContext.Provider>
  );
}

export function useAppModal() {
  const context = React.useContext(AppModalContext);
  if (!context) {
    return {
      showAlert: appAlert,
      showConfirm: appConfirm,
    };
  }
  return context;
}
