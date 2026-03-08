import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MATERIALS, MAKES, COATING_BY_MATERIAL, GRADE_BY_MATERIAL, FORMS } from '@/lib/inventory-options';

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
 * For coating & grade, options depend on the selected material.
 */
export default function InventoryFieldSelect({ field, value, material, onChange, className, placeholder }: Props) {
  let options: string[] = [];

  if (field === 'material') {
    options = MATERIALS;
  } else if (field === 'make') {
    options = MAKES;
  } else if (field === 'coating') {
    options = material ? (COATING_BY_MATERIAL[material] || []) : [];
  } else if (field === 'grade') {
    options = material ? (GRADE_BY_MATERIAL[material] || []) : [];
  } else if (field === 'form') {
    options = FORMS;
  }

  if (options.length === 0) {
    return null; // No dropdown needed (e.g. coating for HR)
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
