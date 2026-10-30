"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({
  position = "top-right",
  richColors = true,
  closeButton = true,
  ...props
}: ToasterProps) {
  return (
    <Sonner
      position={position}
      richColors={richColors}
      closeButton={closeButton}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "!border !border-border !bg-background !text-foreground hover:!bg-muted",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
