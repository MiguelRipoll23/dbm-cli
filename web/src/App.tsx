import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/context/theme-provider";
import { TokenProvider } from "@/context/token-context";
import { VaultProvider, useVault } from "@/context/vault-context";
import { UnlockPage } from "@/pages/unlock-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { PendingConnectPage } from "@/pages/pending-connect-page";
import { api } from "@/lib/api";
import type { PendingUnlock } from "@/types/credentials";

function AppRoutes() {
  const { vault } = useVault();
  const [unlocked, setUnlocked] = useState(false);
  const [pending, setPending] = useState<PendingUnlock>(null);
  const [pendingChecked, setPendingChecked] = useState(false);

  const checkPending = useCallback(async () => {
    try {
      const result = await api.getPendingUnlock();
      setPending(result);
    } catch {
      setPending(null);
    } finally {
      setPendingChecked(true);
    }
  }, []);

  useEffect(() => {
    if (vault && unlocked) {
      void checkPending();
    }
  }, [vault, unlocked, checkPending]);

  if (!vault || !unlocked) {
    return <UnlockPage onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <Routes>
      <Route
        path="/unlock/:requestId"
        element={<PendingConnectRoute pending={pending} pendingChecked={pendingChecked} />}
      />
      <Route
        path="*"
        element={
          pendingChecked && pending ? (
            <PendingConnectPage requestId={pending.id} pending={pending} />
          ) : (
            <DashboardPage />
          )
        }
      />
    </Routes>
  );
}

function PendingConnectRoute({
  pending,
  pendingChecked,
}: {
  pending: PendingUnlock;
  pendingChecked: boolean;
}) {
  const { requestId } = useParams<{ requestId: string }>();
  if (!pendingChecked) {
    return null;
  }
  return <PendingConnectPage requestId={requestId ?? pending?.id ?? ""} pending={pending} />;
}

function App() {
  return (
    <ThemeProvider>
      <TokenProvider>
        <VaultProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <Toaster />
        </VaultProvider>
      </TokenProvider>
    </ThemeProvider>
  );
}

export default App;
