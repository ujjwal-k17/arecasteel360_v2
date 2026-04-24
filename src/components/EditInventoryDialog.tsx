import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSubmitApproval } from '@/hooks/useActionLog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Props {
  item: any;
  entityType: 'wip_item' | 'fg_item';
  open: boolean;
  onClose: () => void;
}

const EDITABLE = ['qty', 'num_pcs', 'length', 'width', 'thickness'] as const;

export default function EditInventoryDialog({ item, entityType, open, onClose }: Props) {
  const { isAdmin } = useAuth();
  const submitApproval = useSubmitApproval();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({
    qty: item?.qty != null ? String(item.qty) : '',
    num_pcs: item?.num_pcs != null ? String(item.num_pcs) : '',
    length: item?.length != null ? String(item.length) : '',
    width: item?.width != null ? String(item.width) : '',
    thickness: item?.thickness != null ? String(item.thickness) : '',
  });

  const handleNum = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setValues(v => ({ ...v, [k]: e.target.value }));

  const buildChanges = () => {
    const newValues: Record<string, number | null> = {};
    const oldValues: Record<string, number | null> = {};
    for (const k of EDITABLE) {
      const raw = values[k];
      const parsed = raw === '' ? null : Number(raw);
      if (raw !== '' && Number.isNaN(parsed as any)) continue;
      const orig = item?.[k] ?? null;
      if (parsed !== orig) {
        newValues[k] = parsed;
        oldValues[k] = orig;
      }
    }
    return { newValues, oldValues };
  };

  const handleSubmit = async () => {
    const { newValues, oldValues } = buildChanges();
    if (Object.keys(newValues).length === 0) {
      toast.info('No changes to save');
      return;
    }
    if (newValues.qty != null && (newValues.qty as number) < 0) {
      toast.error('Quantity cannot be negative');
      return;
    }
    setSubmitting(true);
    try {
      const desc = `Edit ${entityType === 'wip_item' ? 'WIP' : 'FG'} item (${item.material || '-'} ${item.thickness ?? ''}x${item.width ?? ''}): ${Object.keys(newValues).map(k => `${k} ${oldValues[k] ?? '-'} → ${newValues[k] ?? '-'}`).join(', ')}`;

      if (isAdmin) {
        // Apply directly
        const table = entityType === 'wip_item' ? 'wip_items' : 'fg_items';
        const { error } = await supabase.from(table as any).update(newValues as any).eq('id', item.id);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: [table] });
        toast.success('Changes applied');
      } else {
        await submitApproval.mutateAsync({
          action_type: 'edit',
          entity_type: entityType,
          entity_id: item.id,
          description: desc,
          metadata: { new_values: newValues, old_values: oldValues },
        });
        toast.success('Edit request submitted for approval');
      }
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to submit edit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {entityType === 'wip_item' ? 'WIP' : 'FG'} Item</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Qty (Kg)</Label>
            <Input type="number" step="0.01" value={values.qty} onChange={handleNum('qty')} onWheel={(e) => (e.target as HTMLInputElement).blur()} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">No. of Pieces</Label>
            <Input type="number" step="1" value={values.num_pcs} onChange={handleNum('num_pcs')} onWheel={(e) => (e.target as HTMLInputElement).blur()} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Thickness</Label>
            <Input type="number" step="0.01" value={values.thickness} onChange={handleNum('thickness')} onWheel={(e) => (e.target as HTMLInputElement).blur()} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Width</Label>
            <Input type="number" step="0.01" value={values.width} onChange={handleNum('width')} onWheel={(e) => (e.target as HTMLInputElement).blur()} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Length</Label>
            <Input type="number" step="0.01" value={values.length} onChange={handleNum('length')} onWheel={(e) => (e.target as HTMLInputElement).blur()} />
          </div>
        </div>
        {!isAdmin && (
          <p className="text-xs text-muted-foreground">Changes will be applied after admin approval.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>{isAdmin ? 'Save' : 'Submit for Approval'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
