import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const src = useMemo(() => {
    if (typeof window === "undefined") return "/guandan.html";
    const q = window.location.search || "";
    return `/guandan.html${q}`;
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <h1 className="sr-only">银河科技掼蛋竞技场 · 多人联机 · 电脑补位</h1>
      <iframe
        title="银河科技掼蛋竞技场"
        src={src}
        className="h-full w-full border-0"
        allow="clipboard-write; autoplay"
      />
    </main>
  );
}
