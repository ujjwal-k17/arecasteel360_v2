import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, Warehouse, Trash2, AlertTriangle } from 'lucide-react';
import InTransitTab from '@/components/InTransitTab';
import PhysicalInventoryTab from '@/components/PhysicalInventoryTab';
import ScrapManagementTab from '@/components/ScrapManagementTab';
import DefectiveManagementTab from '@/components/DefectiveManagementTab';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">AS</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Areca Steel</h1>
            <p className="text-xs text-muted-foreground">Inventory Management System</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        <Tabs defaultValue="in-transit">
          <TabsList className="mb-6 h-10">
            <TabsTrigger value="in-transit" className="gap-2 text-sm">
              <Package className="h-4 w-4" /> In-Transit Material
            </TabsTrigger>
            <TabsTrigger value="physical" className="gap-2 text-sm">
              <Warehouse className="h-4 w-4" /> Physical Inventory
            </TabsTrigger>
            <TabsTrigger value="scrap" className="gap-2 text-sm">
              <Trash2 className="h-4 w-4" /> Scrap Management
            </TabsTrigger>
            <TabsTrigger value="defective" className="gap-2 text-sm">
              <AlertTriangle className="h-4 w-4" /> Defective Material
            </TabsTrigger>
          </TabsList>

          <TabsContent value="in-transit">
            <InTransitTab />
          </TabsContent>
          <TabsContent value="physical">
            <PhysicalInventoryTab />
          </TabsContent>
          <TabsContent value="scrap">
            <ScrapManagementTab />
          </TabsContent>
          <TabsContent value="defective">
            <DefectiveManagementTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
