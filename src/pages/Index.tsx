import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, Warehouse, Trash2, AlertTriangle, Layers, CheckCircle, LayoutDashboard, BarChart3, Boxes } from 'lucide-react';
import DashboardTab from '@/components/DashboardTab';
import InTransitTab from '@/components/InTransitTab';
import CoilsInventoryTab from '@/components/CoilsInventoryTab';
import ScrapManagementTab from '@/components/ScrapManagementTab';
import DefectiveManagementTab from '@/components/DefectiveManagementTab';
import WIPInventoryTab from '@/components/WIPInventoryTab';
import FGInventoryTab from '@/components/FGInventoryTab';
import SalesDataTab from '@/components/SalesDataTab';
import WoodenPalletsTab from '@/components/WoodenPalletsTab';
import arecaLogo from '@/assets/areca-steel-logo.png';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <img src={arecaLogo} alt="Areca Steel" className="h-10" />
          <p className="text-xs text-muted-foreground">Inventory Management System</p>
        </div>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="dashboard">
          <TabsList className="mb-6 h-10 flex-wrap">
            <TabsTrigger value="dashboard" className="gap-2 text-sm">
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="in-transit" className="gap-2 text-sm">
              <Package className="h-4 w-4" /> In-Transit
            </TabsTrigger>
            <TabsTrigger value="coils" className="gap-2 text-sm">
              <Warehouse className="h-4 w-4" /> Coils Inventory
            </TabsTrigger>
            <TabsTrigger value="wip" className="gap-2 text-sm">
              <Layers className="h-4 w-4" /> WIP Inventory
            </TabsTrigger>
            <TabsTrigger value="fg" className="gap-2 text-sm">
              <CheckCircle className="h-4 w-4" /> FG Inventory
            </TabsTrigger>
            <TabsTrigger value="scrap" className="gap-2 text-sm">
              <Trash2 className="h-4 w-4" /> Scrap Management
            </TabsTrigger>
            <TabsTrigger value="defective" className="gap-2 text-sm">
              <AlertTriangle className="h-4 w-4" /> Defective Material
            </TabsTrigger>
            <TabsTrigger value="sales-data" className="gap-2 text-sm">
              <BarChart3 className="h-4 w-4" /> Sales Data
            </TabsTrigger>
            <TabsTrigger value="pallets" className="gap-2 text-sm">
              <Boxes className="h-4 w-4" /> Wooden Pallets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab />
          </TabsContent>
          <TabsContent value="in-transit">
            <InTransitTab />
          </TabsContent>
          <TabsContent value="coils">
            <CoilsInventoryTab />
          </TabsContent>
          <TabsContent value="wip">
            <WIPInventoryTab />
          </TabsContent>
          <TabsContent value="fg">
            <FGInventoryTab />
          </TabsContent>
          <TabsContent value="scrap">
            <ScrapManagementTab />
          </TabsContent>
          <TabsContent value="defective">
            <DefectiveManagementTab />
          </TabsContent>
          <TabsContent value="sales-data">
            <SalesDataTab />
          </TabsContent>
          <TabsContent value="pallets">
            <WoodenPalletsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
