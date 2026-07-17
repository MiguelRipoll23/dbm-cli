import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { setApiToken } from "@/lib/api";

type TokenContextValue = {
  token: string | null;
};

const TokenContext = createContext<TokenContextValue>({ token: null });

function readTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

/**
 * Reads the `?token=` query param the CLI embeds in the URL it opens the
 * browser with, stores it in memory (React state) for the lifetime of the
 * tab, and mirrors it into the api.ts module so every fetch call attaches
 * the x-dbm-cli-token header automatically. Never persisted to storage.
 *
 * The mirror into api.ts happens eagerly during render (via useState's
 * initializer), not in a useEffect — child components (e.g. UnlockPage) run
 * their mount effects before this provider's effects would, so an
 * effect-based mirror would race the first fetch and send it without a
 * token. Reading from the URL is synchronous, so there is nothing to wait on.
 */
export function TokenProvider({ children }: { children: ReactNode }) {
  const [token] = useState<string | null>(() => {
    const value = readTokenFromUrl();
    setApiToken(value ?? "");
    return value;
  });

  const value = useMemo(() => ({ token }), [token]);

  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

export function useToken(): TokenContextValue {
  return useContext(TokenContext);
}
