import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = ['material', 'make', 'form', 'coating', 'grade', 'cash_in_category', 'cash_in_subcategory', 'cash_out_category', 'cash_out_subcategory'];

const CATEGORY_LABELS: Record<string, string> = {
  material: 'Material',
  make: 'Make',
  form: 'Form',
  coating: 'Coating',
  grade: 'Grade',
  cash_in_category: 'Cash In Category',
  cash_in_subcategory: 'Cash In Sub-Category',
  cash_out_category: 'Cash Out Category',
  cash_out_subcategory: 'Cash Out Sub-Category',
};

export default function DropdownManagementTab() {
  const qc = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState('material');
  const [newValue, setNewValue] = useState('');
  const [newParent, setNewParent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const { data: options, isLoading } = useQuery({
    queryKey: ['dropdown_options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dropdown_options')
        .select('*')
        .order('category')
        .order('sort_order')
        .order('value');
      if (error) throw error;
      return data;
    },
  });

  const { data: materials } = useQuery({
    queryKey: ['dropdown_options_materials'],
    queryFn: async () => {
      const { data } = await supabase.from('dropdown_options').select('value').eq('category', 'material').eq('is_active', true);
      return (data || []).map((d: any) => d.value);
    },
  });

  const { data: cashCats } = useQuery({
    queryKey: ['dropdown_options_cash_category'],
    queryFn: async () => {
      const { data } = await supabase.from('dropdown_options').select('value').eq('category', 'cash_category').eq('is_active', true);
      return (data || []).map((d: any) => d.value);
    },
  });

  const filtered = (options || []).filter((o: any) => o.category === selectedCategory);
  const needsParent = selectedCategory === 'coating' || selectedCategory === 'grade' || selectedCategory === 'cash_subcategory';
  const parentOptions: string[] = selectedCategory === 'cash_subcategory' ? (cashCats || []) : (materials || []);
  const parentLabel = selectedCategory === 'cash_subcategory' ? 'Parent Category' : 'Parent Material';

  const handleAdd = async () => {
    if (!newValue.trim()) { toast.error('Value is required'); return; }
    const { error } = await supabase.from('dropdown_options').insert({
      category: selectedCategory,
      value: newValue.trim(),
      parent_value: needsParent && newParent ? newParent : null,
    });
    if (error) { toast.error(error.message.includes('duplicate') ? 'Already exists' : error.message); return; }
    toast.success('Option added');
    setNewValue('');
    setNewParent('');
    qc.invalidateQueries({ queryKey: ['dropdown_options'] });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editValue.trim()) return;
    const oldOption = (options || []).find((o: any) => o.id === editingId);
    if (!oldOption) return;
    const oldValue = oldOption.value;
    const newVal = editValue.trim();
    const { error } = await supabase.from('dropdown_options').update({ value: newVal }).eq('id', editingId);
    if (error) { toast.error('Failed'); return; }
    // Cascade rename across all inventory tables
    if (oldValue !== newVal) {
      const { error: cascadeErr } = await supabase.rpc('cascade_dropdown_rename', {
        p_category: oldOption.category,
        p_old_value: oldValue,
        p_new_value: newVal,
      });
      if (cascadeErr) { toast.error('Updated option but failed to cascade: ' + cascadeErr.message); }
    }
    toast.success('Updated & cascaded to all inventory');
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ['dropdown_options'] });
    qc.invalidateQueries({ queryKey: ['batches'] });
    qc.invalidateQueries({ queryKey: ['wip_items'] });
    qc.invalidateQueries({ queryKey: ['fg_items'] });
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase.from('dropdown_options').update({ is_active: !currentActive }).eq('id', id);
    if (error) { toast.error('Failed'); return; }
    toast.success(currentActive ? 'Disabled' : 'Enabled');
    qc.invalidateQueries({ queryKey: ['dropdown_options'] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this option permanently?')) return;
    const { error } = await supabase.from('dropdown_options').delete().eq('id', id);
    if (error) { toast.error('Failed'); return; }
    toast.success('Deleted');
    qc.invalidateQueries({ queryKey: ['dropdown_options'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ['dropdown_options'] }); toast.success('Refreshed'); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        {CATEGORIES.map(cat => (
          <Button key={cat} variant={selectedCategory === cat ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory(cat)}>
            {CATEGORY_LABELS[cat] || cat}
          </Button>
        ))}
      </div>

      {/* Add new option */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder={`New ${CATEGORY_LABELS[selectedCategory] || selectedCategory} value`} value={newValue} onChange={e => setNewValue(e.target.value)} className="h-8 w-48 text-xs" onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        {needsParent && (
          <Select value={newParent} onValueChange={setNewParent}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder={parentLabel} /></SelectTrigger>
            <SelectContent>
              {parentOptions.map((m: string) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" onClick={handleAdd} className="gap-1 h-8"><Plus className="h-3.5 w-3.5" /> Add</Button>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} option(s)</span>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card max-h-[500px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs">Value</TableHead>
              {needsParent && <TableHead className="text-xs">{parentLabel}</TableHead>}
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No options.</TableCell></TableRow>}
            {filtered.map((o: any) => (
              <TableRow key={o.id}>
                <TableCell className="text-xs">
                  {editingId === o.id ? (
                    <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-7 text-xs w-40" onKeyDown={e => e.key === 'Enter' && handleSaveEdit()} />
                  ) : o.value}
                </TableCell>
                {needsParent && <TableCell className="text-xs">{o.parent_value || '-'}</TableCell>}
                <TableCell>
                  <Badge variant={o.is_active ? 'default' : 'secondary'} className="text-[10px] cursor-pointer" onClick={() => handleToggleActive(o.id, o.is_active)}>
                    {o.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {editingId === o.id ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleSaveEdit}><Check className="h-3 w-3 text-green-600" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingId(o.id); setEditValue(o.value); }}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(o.id)}><Trash2 className="h-3 w-3" /></Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
