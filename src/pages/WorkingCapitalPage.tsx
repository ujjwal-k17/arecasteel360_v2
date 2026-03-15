import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WCSalesTab from '@/components/working-capital/WCSalesTab';
import WCPaymentsTab from '@/components/working-capital/WCPaymentsTab';
import WCCustomerView from '@/components/working-capital/WCCustomerView';

const WorkingCapitalPage = () => {
  return (
    <div className="container py-6">
      <h1 className="text-2xl font-semibold mb-6">Working Capital</h1>
      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales Data</TabsTrigger>
          <TabsTrigger value="payments">Payments Received</TabsTrigger>
          <TabsTrigger value="customer">Customer Wise View</TabsTrigger>
        </TabsList>
        <TabsContent value="sales"><WCSalesTab /></TabsContent>
        <TabsContent value="payments"><WCPaymentsTab /></TabsContent>
        <TabsContent value="customer"><WCCustomerView /></TabsContent>
      </Tabs>
    </div>
  );
};

export default WorkingCapitalPage;
