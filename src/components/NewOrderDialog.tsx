import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers, useInsertCustomer } from '@/hooks/useOrders';
import { useInsertOrder } from '@/hooks/useOrders';
import InventoryFieldSelect from '@/components/InventoryFieldSelect';
import AddCustomerDialog from '@/components/AddCustomerDialog';

interface OrderItem {
  material: string;
  form: string;
  thickness: string;
  width: string;
  length: string;
  coating: string;
  grade: string;
  net_weight: string;
  comments: string;
}

const emptyItem = (): OrderItem => ({
  material: '', form: '', thickness: '', width: '', length: '',
  coating: '', grade: '', net_weight: '', comments: '',
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export default function NewOrderDialog({ open, onOpenChange }: Props) {
  const { data: customers } = useCustomers();
  const insertOrder = useInsertOrder();
  const [orderNumber, setOrderNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [orderComments, setOrderComments] = useState('');
  const [items, setItems] = useState<OrderItem[]>([emptyItem()]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  const updateItem = (idx: number, field: keyof OrderItem, value: string) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      // Reset coating & grade when material changes
      if (field === 'material') {
        updated.coating = '';
        updated.grade = '';
      }
      return updated;
    }));
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setOrderNumber('');
    setCustomerId('');
    setOrderComments('');
    setItems([emptyItem()]);
  };

  const handleSave = async () => {
    if (!orderNumber.trim()) { toast.error('Order ID is required'); return; }
    if (!customerId) { toast.error('Select a customer'); return; }
    if (items.every(i => !i.material && !i.net_weight)) { toast.error('Add at least one item'); return; }

    try {
      await insertOrder.mutateAsync({
        order: { order_number: orderNumber.trim(), customer_id: customerId, comments: orderComments || undefined },
        items: items.filter(i => i.material || i.net_weight).map(i => ({
          material: i.material || undefined,
          form: i.form || undefined,
          thickness: i.thickness ? Number(i.thickness) : undefined,
          width: i.width ? Number(i.width) : undefined,
          length: i.length ? Number(i.length) : undefined,
          coating: i.coating || undefined,
          grade: i.grade || undefined,
          net_weight: i.net_weight ? Number(i.net_weight) : undefined,
          comments: i.comments || undefined,
        })),
      });
      toast.success('Order created');
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create order');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Order</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Order ID *</Label>
              <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="e.g. ORD-001" />
            </div>
            <div className="space-y-1">
              <Label>Customer *</Label>
              <div className="flex gap-2">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => setShowAddCustomer(true)} title="Add customer">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Comments</Label>
            <Textarea value={orderComments} onChange={e => setOrderComments(e.target.value)} rows={2} placeholder="Order-level comments" />
          </div>

          {/* Items */}
          <div className="space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Order Items</Label>
              <Button variant="outline" size="sm" onClick={() => setItems(prev => [...prev, emptyItem()])}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Material</Label>
                    <InventoryFieldSelect field="material" value={item.material} onChange={v => updateItem(idx, 'material', v)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Form</Label>
                    <InventoryFieldSelect field="form" value={item.form} onChange={v => updateItem(idx, 'form', v)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Thickness</Label>
                    <Input type="number" value={item.thickness} onChange={e => updateItem(idx, 'thickness', e.target.value)} className="h-8 text-xs" placeholder="mm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Width</Label>
                    <Input type="number" value={item.width} onChange={e => updateItem(idx, 'width', e.target.value)} className="h-8 text-xs" placeholder="mm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Length</Label>
                    <Input type="number" value={item.length} onChange={e => updateItem(idx, 'length', e.target.value)} className="h-8 text-xs" placeholder="mm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Coating</Label>
                    <InventoryFieldSelect field="coating" value={item.coating} material={item.material} onChange={v => updateItem(idx, 'coating', v)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Grade</Label>
                    <InventoryFieldSelect field="grade" value={item.grade} material={item.material} onChange={v => updateItem(idx, 'grade', v)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Net Weight (Kg)</Label>
                    <Input type="number" value={item.net_weight} onChange={e => updateItem(idx, 'net_weight', e.target.value)} className="h-8 text-xs" placeholder="Kg" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Comments</Label>
                  <Input value={item.comments} onChange={e => updateItem(idx, 'comments', e.target.value)} className="h-8 text-xs" placeholder="Item comments" />
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={insertOrder.isPending}>
              {insertOrder.isPending ? 'Saving…' : 'Save Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddCustomerDialog open={showAddCustomer} onOpenChange={setShowAddCustomer} />
    </>
  );
}
