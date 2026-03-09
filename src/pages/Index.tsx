import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, Warehouse, Trash2, AlertTriangle, Layers, CheckCircle, LayoutDashboard, BarChart3 } from 'lucide-react';
import DashboardTab from '@/components/DashboardTab';
import InTransitTab from '@/components/InTransitTab';
import CoilsInventoryTab from '@/components/CoilsInventoryTab';
import ScrapManagementTab from '@/components/ScrapManagementTab';
import DefectiveManagementTab from '@/components/DefectiveManagementTab';
import WIPInventoryTab from '@/components/WIPInventoryTab';
import FGInventoryTab from '@/components/FGInventoryTab';
import SalesDataTab from '@/components/SalesDataTab';

const Index = () => {
  return (
    <div className="container py-6">
      <Tabs defaultValue="dashboard">
        <TabsList className="mb-6 h-auto gap-1 bg-transparent p-0 flex flex-wrap">
          <TabsTrigger value="dashboard" className="gap-2 text-xs sm:text-sm rounded-lg border border-border bg-card px-3 py-2 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md transition-all">
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="in-transit" className="gap-2 text-xs sm:text-sm rounded-lg border border-border bg-card px-3 py-2 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md transition-all">
            <Package className="h-4 w-4" /> In-Transit
          </TabsTrigger>
          <TabsTrigger value="coils" className="gap-2 text-xs sm:text-sm rounded-lg border border-border bg-card px-3 py-2 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md transition-all">
            <Warehouse className="h-4 w-4" /> Coils Inventory
          </TabsTrigger>
          <TabsTrigger value="wip" className="gap-2 text-xs sm:text-sm rounded-lg border border-border bg-card px-3 py-2 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md transition-all">
            <Layers className="h-4 w-4" /> WIP Inventory
          </TabsTrigger>
          <TabsTrigger value="fg" className="gap-2 text-xs sm:text-sm rounded-lg border border-border bg-card px-3 py-2 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md transition-all">
            <CheckCircle className="h-4 w-4" /> FG Inventory
          </TabsTrigger>
          <TabsTrigger value="scrap" className="gap-2 text-xs sm:text-sm rounded-lg border border-border bg-card px-3 py-2 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md transition-all">
            <Trash2 className="h-4 w-4" /> Scrap
          </TabsTrigger>
          <TabsTrigger value="defective" className="gap-2 text-xs sm:text-sm rounded-lg border border-border bg-card px-3 py-2 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md transition-all">
            <AlertTriangle className="h-4 w-4" /> Defective
          </TabsTrigger>
          <TabsTrigger value="sales-data" className="gap-2 text-xs sm:text-sm rounded-lg border border-border bg-card px-3 py-2 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md transition-all">
            <BarChart3 className="h-4 w-4" /> Sales Data
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
      </Tabs>
    </div>
  );
};

export default Index;
