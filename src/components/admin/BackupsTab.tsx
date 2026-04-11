import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { RefreshCw, Download, Play, Database, Shield } from 'lucide-react';

interface BackupManifest {
  backup_date: string;
  folder: string;
  tables: Record<string, { rows: number; error?: string }>;
  total_tables: number;
  successful: number;
  total_rows?: number;
}

export default function BackupsTab() {
  const [triggering, setTriggering] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: backups, isLoading } = useQuery({
    queryKey: ['backups-list'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('daily-backup', {
        body: null,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      // The function uses query params, so we need to use fetch directly
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-backup?action=list`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch backups');
      return (await res.json()) as BackupManifest[];
    },
  });

  const triggerBackup = async () => {
    setTriggering(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-backup?action=backup`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error('Backup failed');
      const result = await res.json();
      toast.success(`Backup completed! ${result.successful}/${result.total_tables} tables backed up, ${result.total_rows} total rows.`);
      queryClient.invalidateQueries({ queryKey: ['backups-list'] });
    } catch (err: any) {
      toast.error(`Backup failed: ${err.message}`);
    } finally {
      setTriggering(false);
    }
  };

  const downloadBackup = async (folder: string) => {
    setDownloading(folder);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-backup?action=download&folder=${encodeURIComponent(folder)}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${folder}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Backup downloaded!');
    } catch (err: any) {
      toast.error(`Download failed: ${err.message}`);
    } finally {
      setDownloading(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const formatSize = (totalRows: number) => {
    // Rough estimate: ~200 bytes per row in JSON
    const bytes = totalRows * 200;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Database className="h-5 w-5" /> Database Backups
          </h2>
          <p className="text-sm text-muted-foreground">
            Full database snapshots including all tables and auth users. Auto-backup runs daily at 2:00 AM UTC.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['backups-list'] })}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={triggerBackup}
            disabled={triggering}
          >
            <Play className="h-4 w-4 mr-1" />
            {triggering ? 'Running Backup...' : 'Run Backup Now'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" /> What's included
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">Database Tables</span>
              <p className="text-muted-foreground">All {TABLES.length} tables with complete data</p>
            </div>
            <div>
              <span className="font-medium">Auth Users</span>
              <p className="text-muted-foreground">User accounts, emails, metadata</p>
            </div>
            <div>
              <span className="font-medium">Disaster Recovery</span>
              <p className="text-muted-foreground">Download JSON to rebuild entire database</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Backup Date</TableHead>
              <TableHead>Tables</TableHead>
              <TableHead>Total Rows</TableHead>
              <TableHead>Est. Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading backups...
                </TableCell>
              </TableRow>
            ) : !backups || backups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No backups found. Click "Run Backup Now" to create one.
                </TableCell>
              </TableRow>
            ) : (
              backups.map((b) => (
                <TableRow key={b.folder}>
                  <TableCell className="font-medium">{formatDate(b.backup_date)}</TableCell>
                  <TableCell>{b.successful}/{b.total_tables}</TableCell>
                  <TableCell>{b.total_rows?.toLocaleString() ?? '—'}</TableCell>
                  <TableCell>{b.total_rows ? formatSize(b.total_rows) : '—'}</TableCell>
                  <TableCell>
                    {b.successful === b.total_tables ? (
                      <Badge variant="default" className="bg-green-600">Complete</Badge>
                    ) : (
                      <Badge variant="destructive">Partial</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadBackup(b.folder)}
                      disabled={downloading === b.folder}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      {downloading === b.folder ? 'Downloading...' : 'Download'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const TABLES = [
  "batches", "inventory_actions", "orders", "order_items", "order_dispatches",
  "customers", "processing_records", "processing_output_items", "wip_items",
  "fg_items", "fg_sales", "fg_defectives", "defective_sales", "scrap_sales",
  "invoice_details", "inward_payments", "pallet_skus", "pallet_purchases",
  "pallet_consumptions", "steel_pallet_skus", "steel_pallet_purchases",
  "steel_pallet_consumptions", "skus", "profiles", "user_roles", "user_permissions",
  "action_logs", "allowed_ips", "pending_approvals", "dropdown_options",
  "transporters", "transporter_freight", "transporter_freight_payments",
  "transporter_freight_comments", "user_devices", "wip_defectives", "auth_users",
];
