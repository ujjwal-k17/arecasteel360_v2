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
import WorkingCapitalPage from "./pages/WorkingCapitalPage";
import FreightJobWorkPage from "./pages/FreightJobWorkPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<ProtectedRoute page="dashboard"><DashboardPage /></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute page="inventory"><Index /></ProtectedRoute>} />
              <Route path="/consumables" element={<ProtectedRoute page="consumables"><ConsumablesPage /></ProtectedRoute>} />
              <Route path="/order-book" element={<ProtectedRoute page="order-book"><OrderBookPage /></ProtectedRoute>} />
              <Route path="/working-capital" element={<ProtectedRoute page="working-capital"><WorkingCapitalPage /></ProtectedRoute>} />
              <Route path="/freight-jobwork" element={<ProtectedRoute page="freight-jobwork"><FreightJobWorkPage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
