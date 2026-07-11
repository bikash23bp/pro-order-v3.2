import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/use-auth";

import appCss from "../styles.css?url";

const PERSONAL_BACKEND_URL = "https://cmqqxjfadpfbtvlykcgz.supabase.co";
const PERSONAL_BACKEND_PUBLISHABLE_KEY = "sb_publishable_UD-P5lLzKAcjeS4PO2UDmQ_wLhlpuqO";

function getPublicRuntimeEnvScript() {
  const env = typeof process !== "undefined" ? process.env : {};
  const viteEnv = import.meta.env;
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || viteEnv.VITE_SUPABASE_URL || PERSONAL_BACKEND_URL;
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY || viteEnv.VITE_SUPABASE_ANON_KEY || PERSONAL_BACKEND_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) return "";

  // Escape `</` so a malicious env value can't break out of the script tag.
  const payload = JSON.stringify({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: supabaseKey,
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: supabaseKey,
  }).replace(/</g, "\\u003c");
  return `globalThis.__OMS_RUNTIME_ENV_READY__=true;globalThis.process=globalThis.process||{};globalThis.process.env=Object.assign({},globalThis.process.env||{},${payload});`;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "order" },
      { name: "description", content: "OrderFlow Pro is a PHP Laravel-based application for managing e-commerce orders, inventory, and courier integrations." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "order" },
      { property: "og:description", content: "OrderFlow Pro is a PHP Laravel-based application for managing e-commerce orders, inventory, and courier integrations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "order" },
      { name: "twitter:description", content: "OrderFlow Pro is a PHP Laravel-based application for managing e-commerce orders, inventory, and courier integrations." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f253dde9-1d3b-42f5-9284-2ebf7249430d/id-preview-31aeaa7a--8fae470b-497a-47a4-99a3-ca8bea2011b7.lovable.app-1778770496050.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f253dde9-1d3b-42f5-9284-2ebf7249430d/id-preview-31aeaa7a--8fae470b-497a-47a4-99a3-ca8bea2011b7.lovable.app-1778770496050.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script id="runtime-env" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: getPublicRuntimeEnvScript() }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Persist React Query cache to localStorage so a browser reload restores
  // the previously-fetched data instantly (no full reload flash). Background
  // refetches + realtime keep it fresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const persister = createSyncStoragePersister({
        storage: window.localStorage,
        key: "oms-rq-cache-v1",
        throttleTime: 1000,
      });
      const [unsubscribe] = persistQueryClient({
        queryClient,
        persister,
        maxAge: 60 * 60 * 1000, // 1h
        buster: "v1",
      });
      return () => { unsubscribe?.(); };
    } catch { /* localStorage unavailable — skip persistence */ }
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
