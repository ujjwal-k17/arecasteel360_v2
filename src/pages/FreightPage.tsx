import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck } from 'lucide-react';

const FreightPage = () => {
  return (
    <div className="container py-6">
      <h1 className="text-2xl font-semibold mb-6">Freight</h1>
      <Tabs defaultValue="areca-trucks">
        <TabsList>
          <TabsTrigger value="areca-trucks">Areca Trucks</TabsTrigger>
          <TabsTrigger value="tpt-freight">TPT Freight</TabsTrigger>
        </TabsList>
        <TabsContent value="areca-trucks">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="h-5 w-5 text-muted-foreground" />
                Areca Trucks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Areca Trucks module is under development.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tpt-freight">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="h-5 w-5 text-muted-foreground" />
                TPT Freight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">TPT Freight module is under development.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FreightPage;
