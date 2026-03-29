import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface FreightDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNumber: string;
  transporters: { id: string; name: string }[];
  existingData?: { transporter_id: string | null; total_freight: number | null; comments: string | null } | null;
  onSave: (data: { invoice_number: string; transporter_id: string; total_freight: number; comments: string }) => void;
}

export function FreightDetailsDialog({
  open,
  onOpenChange,
  invoiceNumber,
  transporters,
  existingData,
  onSave,
}: FreightDetailsDialogProps) {
  const queryClient = useQueryClient();
  const [transporterId, setTransporterId] = useState('');
  const [totalFreight, setTotalFreight] = useState('');
  const [comments, setComments] = useState('');
  const [showAddNew, setShowAddNew] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (open) {
      setTransporterId(existingData?.transporter_id || '');
      setTotalFreight(existingData?.total_freight?.toString() || '');
      setComments(existingData?.comments || '');
      setShowAddNew(false);
      setNewName('');
    }
  }, [open, existingData]);

  const addTransporter = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from('transporters').insert({ name }).select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transporters_list'] });
      setTransporterId(data.id);
      setShowAddNew(false);
      setNewName('');
      toast.success('Transporter added');
    },
    onError: () => toast.error('Failed to add transporter'),
  });

  const handleSave = () => {
    if (!transporterId || !totalFreight) return;
    onSave({
      invoice_number: invoiceNumber,
      transporter_id: transporterId,
      total_freight: parseFloat(totalFreight),
      comments,
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
            <div className="flex items-center gap-2">
              <Select value={transporterId} onValueChange={setTransporterId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select transporter..." />
                </SelectTrigger>
                <SelectContent>
                  {transporters.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="shrink-0" onClick={() => setShowAddNew(!showAddNew)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {showAddNew && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="New transporter name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={() => addTransporter.mutate(newName.trim())} disabled={!newName.trim()}>
                  Add
                </Button>
              </div>
            )}
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
          <div className="space-y-2">
            <Label>Comments</Label>
            <Textarea
              placeholder="Add comments..."
              value={comments}
              onChange={e => setComments(e.target.value)}
              rows={3}
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
