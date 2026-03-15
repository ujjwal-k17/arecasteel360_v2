import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useInsertCustomer } from '@/hooks/useOrders';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export default function AddCustomerDialog({ open, onOpenChange }: Props) {
  const insertCustomer = useInsertCustomer();
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [creditTerms, setCreditTerms] = useState('');
  const [address, setAddress] = useState('');
  const [customerType, setCustomerType] = useState('Trade');
  const [gstNumber, setGstNumber] = useState('');

  const reset = () => { setName(''); setReference(''); setCreditTerms(''); setAddress(''); setCustomerType('Trade'); setGstNumber(''); };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Customer name is required'); return; }
    try {
      await insertCustomer.mutateAsync({
        customer_name: name.trim(),
        reference: reference || undefined,
        credit_terms: creditTerms || undefined,
        customer_address: address || undefined,
        customer_type: customerType,
        gst_number: gstNumber.trim() || undefined,
      });
      toast.success('Customer added');
      reset();
      onOpenChange(false);
    } catch (e: any) {
      if (e.message?.includes('customers_gst_number_unique')) {
        toast.error('A customer with this GST Number already exists');
      } else {
        toast.error(e.message || 'Failed to add customer');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Customer Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" />
          </div>
          <div className="space-y-1">
            <Label>GST Number</Label>
            <Input value={gstNumber} onChange={e => setGstNumber(e.target.value)} placeholder="e.g. 22AAAAA0000A1Z5" />
          </div>
          <div className="space-y-1">
            <Label>Reference</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Reference" />
          </div>
          <div className="space-y-1">
            <Label>Credit Terms</Label>
            <Input value={creditTerms} onChange={e => setCreditTerms(e.target.value)} placeholder="e.g. Net 30" />
          </div>
          <div className="space-y-1">
            <Label>Customer Address</Label>
            <Textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} placeholder="Address" />
          </div>
          <div className="space-y-1">
            <Label>Customer Type</Label>
            <Select value={customerType} onValueChange={setCustomerType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Trade">Trade</SelectItem>
                <SelectItem value="OEM">OEM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={insertCustomer.isPending}>
            {insertCustomer.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
