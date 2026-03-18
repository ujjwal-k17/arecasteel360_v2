import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import arecaLogo from '@/assets/areca-steel-logo.png';

export default function SetupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.rpc('admin_exists').then(({ data }) => {
      if (data) {
        setHasAdmin(true);
        navigate('/login');
      } else {
        setHasAdmin(false);
      }
    });
  }, [navigate]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Enter email and password'); return; }
    if (password.length < 6) { toast.error('Password min 6 characters'); return; }

    setLoading(true);
    try {
      // Sign up the first admin user directly (signup is disabled in UI but we'll do it via auth API)
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) { toast.error(error.message); setLoading(false); return; }

      if (data.user) {
        // Assign admin role - use service role via edge function won't work since no admin exists yet
        // So we insert directly (RLS won't block since has_role check won't find any admin - we need to handle this)
        // Actually, the insert policy requires has_role('admin'), but there's no admin yet
        // We need a special migration for this. Let's use a database function instead.
        const { error: roleErr } = await supabase.rpc('setup_first_admin' as any, { admin_user_id: data.user.id });
        if (roleErr) {
          toast.error('Failed to set admin role: ' + roleErr.message);
          setLoading(false);
          return;
        }
        // Sign out so user goes through proper login flow with role loaded
        await supabase.auth.signOut();
        toast.success('Admin account created! Please sign in.');
        navigate('/login');
      }
    } catch (err: any) {
      toast.error(err.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  if (hasAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-sm mx-4">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <img src={arecaLogo} alt="Areca Steel" className="h-12" />
          </div>
          <CardTitle className="text-xl">Initial Setup</CardTitle>
          <p className="text-sm text-muted-foreground">Create the first admin account</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <Label htmlFor="email">Admin Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Setting up...' : 'Create Admin Account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
