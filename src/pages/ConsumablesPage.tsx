import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WoodenPalletsTab from '@/components/WoodenPalletsTab';
import SteelPalletsTab from '@/components/SteelPalletsTab';

const ConsumablesPage = () => {
  return (
    <div className="container py-6">
      <h1 className="text-2xl font-semibold mb-6">Consumables</h1>
      <Tabs defaultValue="wooden" className="w-full">
        <TabsList>
          <TabsTrigger value="wooden">Wooden Pallets</TabsTrigger>
          <TabsTrigger value="steel">Steel Pallets</TabsTrigger>
        </TabsList>
        <TabsContent value="wooden" className="mt-4">
          <WoodenPalletsTab />
        </TabsContent>
        <TabsContent value="steel" className="mt-4">
          <SteelPalletsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConsumablesPage;
