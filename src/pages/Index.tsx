import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, Warehouse, Trash2, AlertTriangle, Layers, CheckCircle, ArrowDownUp, LayoutGrid } from 'lucide-react';
import InTransitTab from '@/components/InTransitTab';
import CoilsInventoryTab from '@/components/CoilsInventoryTab';
import ScrapManagementTab from '@/components/ScrapManagementTab';
import DefectiveManagementTab from '@/components/DefectiveManagementTab';
import WIPInventoryTab from '@/components/WIPInventoryTab';
import FGInventoryTab from '@/components/FGInventoryTab';
import SalesDataTab from '@/components/SalesDataTab';
import InventorySummaryTab from '@/components/InventorySummaryTab';

const tabClass = "gap-2 text-xs sm:text-sm rounded-lg border border-border bg-card px-3 py-2 shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md transition-all";

const Index = () => {
  return (
    <div className="container py-6">
      <Tabs defaultValue="summary">
        <TabsList className="mb-6 h-auto gap-1 bg-transparent p-0 flex flex-wrap">
          <TabsTrigger value="summary" className="gap-2 text-xs sm:text-sm rounded-lg border-2 border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-2 shadow-sm text-indigo-700 dark:text-indigo-300 font-semibold data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:border-indigo-600 data-[state=active]:shadow-md transition-all">
            <LayoutGrid className="h-4 w-4" /> Summary
          </TabsTrigger>
          <TabsTrigger value="in-transit" className={tabClass}>
            <Package className="h-4 w-4" /> In-Transit
          </TabsTrigger>
          <TabsTrigger value="coils" className={tabClass}>
            <Warehouse className="h-4 w-4" /> Coils Inventory
          </TabsTrigger>
          <TabsTrigger value="wip" className={tabClass}>
            <Layers className="h-4 w-4" /> WIP Inventory
          </TabsTrigger>
          <TabsTrigger value="fg" className={tabClass}>
            <CheckCircle className="h-4 w-4" /> FG Inventory
          </TabsTrigger>
          <TabsTrigger value="scrap" className={tabClass}>
            <Trash2 className="h-4 w-4" /> Scrap
          </TabsTrigger>
          <TabsTrigger value="defective" className={tabClass}>
            <AlertTriangle className="h-4 w-4" /> Defective
          </TabsTrigger>
          <TabsTrigger value="dispatch-data" className="gap-2 text-xs sm:text-sm rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 shadow-sm text-rose-700 dark:text-rose-300 data-[state=active]:bg-rose-600 data-[state=active]:text-white data-[state=active]:border-rose-600 data-[state=active]:shadow-md transition-all">
            <ArrowDownUp className="h-4 w-4" /> Dispatch Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <InventorySummaryTab />
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
        <TabsContent value="dispatch-data">
          <SalesDataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
