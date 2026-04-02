import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDerivedOptions } from '@/hooks/useDropdownOptions';

interface Props {
  field: string;
  value: string;
  material?: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Renders a Select dropdown for material, make, coating, or grade fields.
 * Options are fetched from the dropdown_options database table.
 */
export default function InventoryFieldSelect({ field, value, material, onChange, className, placeholder }: Props) {
  const { materials, makes, forms, coatingByMaterial, gradeByMaterial } = useDerivedOptions();

  let options: string[] = [];

  if (field === 'material') {
    options = materials;
  } else if (field === 'make') {
    options = makes;
  } else if (field === 'coating') {
    options = material ? (coatingByMaterial[material] || []) : [];
  } else if (field === 'grade') {
    options = material ? (gradeByMaterial[material] || []) : [];
  } else if (field === 'form') {
    options = forms;
  }

  if (options.length === 0) {
    return null;
  }

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder || `Select ${field}`} />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
