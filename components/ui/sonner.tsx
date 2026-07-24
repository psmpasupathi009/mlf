"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = (
    mounted && resolvedTheme === "dark" ? "dark" : "light"
  ) as ToasterProps["theme"];

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="top-center"
      richColors
      closeButton
      offset="calc(env(safe-area-inset-top) + 0.75rem)"
      {...props}
    />
  );
}
