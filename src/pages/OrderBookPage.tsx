import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';

const OrderBookPage = () => {
  return (
    <div className="container py-6">
      <h1 className="text-2xl font-semibold mb-6">Order Book</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Order Book module is under development.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderBookPage;
