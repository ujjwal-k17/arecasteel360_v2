import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTallyCompanies } from '@/hooks/useTallyCompanies';

interface Props {
  value: string; // 'all' or company_name
  onChange: (v: string) => void;
  className?: string;
}

export function CompanyFilter({ value, onChange, className }: Props) {
  const { data: companies = [] } = useTallyCompanies();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? 'w-[260px]'}>
        <SelectValue placeholder="Select company" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Companies</SelectItem>
        {companies.map((c: any) => (
          <SelectItem key={c.id} value={c.company_name}>
            {c.company_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
