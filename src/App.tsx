import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import Index from "./pages/Index";
import ConsumablesPage from "./pages/ConsumablesPage";
import OrderBookPage from "./pages/OrderBookPage";
import WorkingCapitalPage from "./pages/WorkingCapitalPage";
import FreightJobWorkPage from "./pages/FreightJobWorkPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/inventory" element={<Index />} />
            <Route path="/consumables" element={<ConsumablesPage />} />
            <Route path="/order-book" element={<OrderBookPage />} />
            <Route path="/working-capital" element={<WorkingCapitalPage />} />
            <Route path="/freight-jobwork" element={<FreightJobWorkPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
