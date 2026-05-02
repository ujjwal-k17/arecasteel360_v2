import { useLastSyncAt } from '@/hooks/useTallyCompanies';
import { formatDate } from '@/lib/business-overview-utils';

export function LastSyncedFooter() {
  const { data } = useLastSyncAt();
  return (
    <div className="text-xs text-muted-foreground text-right pt-4 border-t mt-6">
      Last synced: {data ? `${formatDate(data)}, ${new Date(data).toLocaleTimeString('en-IN')}` : '—'}
    </div>
  );
}
