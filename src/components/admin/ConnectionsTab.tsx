import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Mail, HardDrive, RefreshCw, AlertCircle, CheckCircle2, Paperclip, Search, Inbox } from 'lucide-react';
import { toast } from 'sonner';

type AccountInfo = {
  status: 'connected' | 'not_linked' | 'error';
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  id?: string | null;
  error?: string;
};

type WhoAmIResponse = { outlook: AccountInfo; onedrive: AccountInfo };

type OutlookMessage = {
  id: string;
  subject: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime: string;
  bodyPreview: string;
  hasAttachments: boolean;
  isRead: boolean;
};

type OutlookAttachment = { id: string; name: string; size: number; contentType: string };

function StatusBadge({ status }: { status: AccountInfo['status'] }) {
  if (status === 'connected') return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>;
  if (status === 'not_linked') return <Badge variant="secondary">Not Linked</Badge>;
  return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Error</Badge>;
}

function AccountCard({ title, icon: Icon, info }: { title: string; icon: typeof Mail; info?: AccountInfo }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Icon className="h-4 w-4" />{title}</CardTitle>
        <StatusBadge status={info?.status ?? 'not_linked'} />
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {info?.status === 'connected' ? (
          <>
            <div><span className="text-muted-foreground">Name: </span><span className="font-medium">{info.displayName || '—'}</span></div>
            <div><span className="text-muted-foreground">Email: </span><span className="font-medium">{info.mail || info.userPrincipalName || '—'}</span></div>
            {info.userPrincipalName && info.mail && info.userPrincipalName !== info.mail && (
              <div><span className="text-muted-foreground">UPN: </span><span className="font-mono text-xs">{info.userPrincipalName}</span></div>
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

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function OutlookBrowser() {
  const [sender, setSender] = useState('amns.customercare@amns.in');
  const [top, setTop] = useState(25);
  const [submitted, setSubmitted] = useState<{ sender: string; top: number } | null>({ sender: 'amns.customercare@amns.in', top: 25 });
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['outlook-messages', submitted],
    enabled: !!submitted,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ messages: OutlookMessage[] }>('outlook-list-messages', {
        body: submitted,
      });
      if (error) throw error;
      return data!.messages;
    },
  });

  const detail = useQuery({
    queryKey: ['outlook-message', openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ message: any; attachments: OutlookAttachment[] }>('outlook-get-message', {
        body: { messageId: openId },
      });
      if (error) throw error;
      return data!;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Inbox className="h-4 w-4" /> Browse Outlook Inbox</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs text-muted-foreground">From (sender email)</label>
            <Input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="sender@example.com" />
          </div>
          <div className="w-24">
            <label className="text-xs text-muted-foreground">Limit</label>
            <Input type="number" min={1} max={100} value={top} onChange={(e) => setTop(Number(e.target.value) || 25)} />
          </div>
          <Button
            onClick={() => setSubmitted({ sender: sender.trim(), top })}
            disabled={list.isFetching}
            className="gap-2"
          >
            <Search className="h-4 w-4" /> Fetch
          </Button>
        </div>

        {list.isFetching ? (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        ) : list.error ? (
          <p className="text-sm text-destructive">{(list.error as Error).message}</p>
        ) : list.data ? (
          list.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages found.</p>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Date</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="w-[80px] text-center">Attach</TableHead>
                    <TableHead className="w-[80px] text-center">Read</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.map((m) => (
                    <TableRow
                      key={m.id}
                      className="cursor-pointer"
                      onClick={() => setOpenId(m.id)}
                    >
                      <TableCell className="text-xs">{new Date(m.receivedDateTime).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className={m.isRead ? 'font-normal' : 'font-semibold'}>{m.subject || '(no subject)'}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{m.bodyPreview}</div>
                      </TableCell>
                      <TableCell className="text-center">{m.hasAttachments ? <Paperclip className="h-4 w-4 inline" /> : '—'}</TableCell>
                      <TableCell className="text-center text-xs">{m.isRead ? 'Read' : 'Unread'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}

        <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{detail.data?.message?.subject || 'Message'}</DialogTitle>
            </DialogHeader>
            {detail.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : detail.error ? (
              <p className="text-sm text-destructive">{(detail.error as Error).message}</p>
            ) : detail.data ? (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  From: {detail.data.message?.from?.emailAddress?.address} · {new Date(detail.data.message?.receivedDateTime).toLocaleString()}
                </div>
                {detail.data.attachments.length > 0 && (
                  <div className="border rounded p-2 space-y-1">
                    <div className="text-xs font-medium">Attachments ({detail.data.attachments.length})</div>
                    {detail.data.attachments.map((a) => (
                      <div key={a.id} className="text-xs flex items-center gap-2">
                        <Paperclip className="h-3 w-3" />
                        <span className="font-medium">{a.name}</span>
                        <span className="text-muted-foreground">{formatBytes(a.size)} · {a.contentType}</span>
                      </div>
                    ))}
                  </div>
                )}
                <iframe
                  sandbox=""
                  className="w-full h-[55vh] border rounded bg-background"
                  srcDoc={detail.data.message?.body?.content || ''}
                  title="Email body"
                />
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
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
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Checking connections…</p>
      ) : error ? (
        <Card><CardContent className="pt-6"><p className="text-sm text-destructive">Failed to load: {error instanceof Error ? error.message : 'Unknown error'}</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <AccountCard title="Microsoft Outlook" icon={Mail} info={data?.outlook} />
          <AccountCard title="Microsoft OneDrive" icon={HardDrive} info={data?.onedrive} />
        </div>
      )}

      {data?.outlook?.status === 'connected' && <OutlookBrowser />}
    </div>
  );
}
