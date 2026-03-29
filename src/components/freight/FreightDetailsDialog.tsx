import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FreightDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNumber: string;
  transporters: { id: string; name: string }[];
  existingData?: { transporter_id: string | null; total_freight: number | null } | null;
  onSave: (data: { invoice_number: string; transporter_id: string; total_freight: number }) => void;
}

export function FreightDetailsDialog({
  open,
  onOpenChange,
  invoiceNumber,
  transporters,
  existingData,
  onSave,
}: FreightDetailsDialogProps) {
  const [transporterId, setTransporterId] = useState('');
  const [totalFreight, setTotalFreight] = useState('');

  useEffect(() => {
    if (open) {
      setTransporterId(existingData?.transporter_id || '');
      setTotalFreight(existingData?.total_freight?.toString() || '');
    }
  }, [open, existingData]);

  const handleSave = () => {
    if (!transporterId || !totalFreight) return;
    onSave({
      invoice_number: invoiceNumber,
      transporter_id: transporterId,
      total_freight: parseFloat(totalFreight),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Freight Details — {invoiceNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Transporter Name</Label>
            <Select value={transporterId} onValueChange={setTransporterId}>
              <SelectTrigger>
                <SelectValue placeholder="Select transporter..." />
              </SelectTrigger>
              <SelectContent>
                {transporters.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Total Freight (₹)</Label>
            <Input
              type="number"
              placeholder="Enter total freight amount"
              value={totalFreight}
              onChange={e => setTotalFreight(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!transporterId || !totalFreight}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
