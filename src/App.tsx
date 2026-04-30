import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import Index from "./pages/Index";
import ConsumablesPage from "./pages/ConsumablesPage";
import OrderBookPage from "./pages/OrderBookPage";

import PettyCashPage from "./pages/PettyCashPage";
import FreightPage from "./pages/FreightPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";

import SetupPage from "./pages/SetupPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,    // data stays fresh for 2 minutes
      gcTime: 5 * 60 * 1000,       // cache kept for 5 minutes
      refetchOnWindowFocus: false,  // don't refetch when switching browser tabs
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<ProtectedRoute page="dashboard"><DashboardPage /></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute page="inventory"><Index /></ProtectedRoute>} />
              <Route path="/consumables" element={<ProtectedRoute page="consumables"><ConsumablesPage /></ProtectedRoute>} />
              <Route path="/order-book" element={<ProtectedRoute page="order-book"><OrderBookPage /></ProtectedRoute>} />
              
              <Route path="/petty-cash" element={<ProtectedRoute page="petty-cash"><PettyCashPage /></ProtectedRoute>} />
              <Route path="/freight" element={<ProtectedRoute page="freight"><FreightPage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute page="admin"><AdminPage /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
