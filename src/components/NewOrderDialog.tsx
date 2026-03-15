import { useState, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers } from '@/hooks/useOrders';
import { useInsertOrder, useUpdateOrder } from '@/hooks/useOrders';
import InventoryFieldSelect from '@/components/InventoryFieldSelect';
import AddCustomerDialog from '@/components/AddCustomerDialog';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderItem {
  id?: string;
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
  editOrder?: any; // pass existing order for edit mode
}

export default function NewOrderDialog({ open, onOpenChange, editOrder }: Props) {
  const { data: customers } = useCustomers();
  const insertOrder = useInsertOrder();
  const updateOrder = useUpdateOrder();
  const [orderNumber, setOrderNumber] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [orderComments, setOrderComments] = useState('');
  const [orderDate, setOrderDate] = useState<Date | undefined>(new Date());
  const [items, setItems] = useState<OrderItem[]>([emptyItem()]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isEditMode = !!editOrder;

  // Populate form when editing
  useEffect(() => {
    if (editOrder && open) {
      setOrderNumber(editOrder.order_number || '');
      setPoNumber(editOrder.po_number || '');
      setCustomerId(editOrder.customer_id || '');
      setCustomerSearch((editOrder.customers as any)?.customer_name || '');
      setOrderComments(editOrder.comments || '');
      setOrderDate(editOrder.order_date ? new Date(editOrder.order_date) : new Date());
      if (editOrder.order_items?.length > 0) {
        setItems(editOrder.order_items.map((i: any) => ({
          id: i.id,
          material: i.material || '',
          form: i.form || '',
          thickness: i.thickness?.toString() || '',
          width: i.width?.toString() || '',
          length: i.length?.toString() || '',
          coating: i.coating || '',
          grade: i.grade || '',
          net_weight: i.net_weight?.toString() || '',
          comments: i.comments || '',
        })));
      }
    } else if (!editOrder && open) {
      resetForm();
    }
  }, [editOrder, open]);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!customerSearch.trim()) return customers;
    return customers.filter(c =>
      c.customer_name.toLowerCase().includes(customerSearch.toLowerCase())
    );
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(() => {
    return customers?.find(c => c.id === customerId);
  }, [customers, customerId]);

  const updateItem = (idx: number, field: keyof OrderItem, value: string) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
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
    setCustomerSearch('');
    setOrderComments('');
    setOrderDate(new Date());
    setItems([emptyItem()]);
  };

  const handleCustomerSelect = (c: any) => {
    setCustomerId(c.id);
    setCustomerSearch(c.customer_name);
    setShowDropdown(false);
  };

  const handleCustomerBlur = () => {
    setTimeout(() => setShowDropdown(false), 200);
    if (customerSearch.trim() && !selectedCustomer) {
      // Don't clear - show error on save
    }
  };

  const buildItemsPayload = () => {
    return items.filter(i => i.material || i.net_weight).map(({ id, ...i }) => ({
      material: i.material || undefined,
      form: i.form || undefined,
      thickness: i.thickness ? Number(i.thickness) : undefined,
      width: i.width ? Number(i.width) : undefined,
      length: i.length ? Number(i.length) : undefined,
      coating: i.coating || undefined,
      grade: i.grade || undefined,
      net_weight: i.net_weight ? Number(i.net_weight) : undefined,
      comments: i.comments || undefined,
    }));
  };

  const handleSave = async () => {
    if (!orderNumber.trim()) { toast.error('Order ID is required'); return; }
    if (!customerId || !selectedCustomer) {
      toast.error('Customer not found. Please select from the list or add a new customer.');
      return;
    }
    if (items.every(i => !i.material && !i.net_weight)) { toast.error('Add at least one item'); return; }

    try {
      const orderPayload = {
        order_number: orderNumber.trim(),
        customer_id: customerId,
        comments: orderComments || undefined,
        order_date: orderDate ? format(orderDate, 'yyyy-MM-dd') : undefined,
      };

      if (isEditMode) {
        await updateOrder.mutateAsync({
          orderId: editOrder.id,
          order: orderPayload,
          items: buildItemsPayload(),
        });
        toast.success('Order updated');
      } else {
        await insertOrder.mutateAsync({
          order: orderPayload,
          items: buildItemsPayload(),
        });
        toast.success('Order created');
      }
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      if (e.message?.includes('orders_order_number_unique')) {
        toast.error('This Order ID already exists. Please use a unique Order ID.');
      } else {
        toast.error(e.message || 'Failed to save order');
      }
    }
  };

  const isPending = insertOrder.isPending || updateOrder.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Order' : 'New Order'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Order ID *</Label>
              <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="e.g. ORD-001" disabled={isEditMode} />
            </div>
            <div className="space-y-1 relative" ref={dropdownRef}>
              <Label>Customer *</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={customerSearch}
                    onChange={e => {
                      setCustomerSearch(e.target.value);
                      setCustomerId('');
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={handleCustomerBlur}
                    placeholder="Type to search customer"
                    className={cn(!customerId && customerSearch.trim() ? 'border-destructive' : '')}
                  />
                  {showDropdown && (
                    <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                      {filteredCustomers.length > 0 ? filteredCustomers.map(c => (
                        <div
                          key={c.id}
                          className="px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                          onMouseDown={() => handleCustomerSelect(c)}
                        >
                          {c.customer_name}
                        </div>
                      )) : (
                        <div className="px-3 py-2 text-sm text-destructive">
                          No match found. Please add a new customer.
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Button variant="outline" size="icon" onClick={() => setShowAddCustomer(true)} title="Add customer">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Order Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !orderDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {orderDate ? format(orderDate, 'dd/MM/yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={orderDate} onSelect={setOrderDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
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
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving…' : isEditMode ? 'Update Order' : 'Save Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddCustomerDialog open={showAddCustomer} onOpenChange={setShowAddCustomer} />
    </>
  );
}
