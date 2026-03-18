import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderOption {
  id: string;
  order_number: string;
  customers?: { customer_name: string } | null;
}

interface OrderIdComboboxProps {
  value: string;
  onChange: (value: string) => void;
  orders: OrderOption[];
  placeholder?: string;
}

export default function OrderIdCombobox({ value, onChange, orders, placeholder = 'Select or type order...' }: OrderIdComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return orders;
    const q = search.toLowerCase();
    return orders.filter(o =>
      o.order_number.toLowerCase().includes(q) ||
      (o.customers?.customer_name || '').toLowerCase().includes(q)
    );
  }, [orders, search]);

  const displayValue = value || '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal mt-1 h-10',
            !value && 'text-muted-foreground'
          )}
        >
          <span className="truncate">{displayValue || placeholder}</span>
          <div className="flex items-center gap-1 ml-1 shrink-0">
            {value && (
              <X
                className="h-3.5 w-3.5 opacity-50 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
              />
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <Input
          placeholder="Search or type order ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-sm mb-2"
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && search) {
              onChange(search);
              setSearch('');
              setOpen(false);
            }
          }}
        />
        <div className="max-h-48 overflow-y-auto">
          {filtered.length === 0 && search && (
            <button
              className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => { onChange(search); setSearch(''); setOpen(false); }}
            >
              Use "<span className="font-medium">{search}</span>"
            </button>
          )}
          {filtered.map(o => (
            <button
              key={o.id}
              className={cn(
                'w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground',
                value === o.order_number && 'bg-accent text-accent-foreground'
              )}
              onClick={() => { onChange(o.order_number); setSearch(''); setOpen(false); }}
            >
              {o.order_number} {o.customers?.customer_name ? `— ${o.customers.customer_name}` : ''}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
