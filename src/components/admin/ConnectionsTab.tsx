import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, HardDrive, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

type AccountInfo = {
  status: 'connected' | 'not_linked' | 'error';
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  id?: string | null;
  error?: string;
};

type WhoAmIResponse = {
  outlook: AccountInfo;
  onedrive: AccountInfo;
};

function StatusBadge({ status }: { status: AccountInfo['status'] }) {
  if (status === 'connected') {
    return (
      <Badge className="bg-green-600 hover:bg-green-600 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Connected
      </Badge>
    );
  }
  if (status === 'not_linked') {
    return <Badge variant="secondary">Not Linked</Badge>;
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertCircle className="h-3 w-3" /> Error
    </Badge>
  );
}

function AccountCard({
  title,
  icon: Icon,
  info,
}: {
  title: string;
  icon: typeof Mail;
  info?: AccountInfo;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
        <StatusBadge status={info?.status ?? 'not_linked'} />
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {info?.status === 'connected' ? (
          <>
            <div>
              <span className="text-muted-foreground">Name: </span>
              <span className="font-medium">{info.displayName || '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Email: </span>
              <span className="font-medium">{info.mail || info.userPrincipalName || '—'}</span>
            </div>
            {info.userPrincipalName && info.mail && info.userPrincipalName !== info.mail && (
              <div>
                <span className="text-muted-foreground">UPN: </span>
                <span className="font-mono text-xs">{info.userPrincipalName}</span>
              </div>
            )}
          </>
        ) : info?.status === 'error' ? (
          <p className="text-destructive text-xs break-all">{info.error}</p>
        ) : (
          <p className="text-muted-foreground text-xs">Connection not linked to this project.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConnectionsTab() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['whoami-microsoft'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<WhoAmIResponse>('whoami-microsoft');
      if (error) throw error;
      return data!;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Microsoft Connections</h2>
          <p className="text-sm text-muted-foreground">
            Identifies which Microsoft account is connected to this app for Outlook and OneDrive access.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Checking connections…</p>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <AccountCard title="Microsoft Outlook" icon={Mail} info={data?.outlook} />
          <AccountCard title="Microsoft OneDrive" icon={HardDrive} info={data?.onedrive} />
        </div>
      )}
    </div>
  );
}
