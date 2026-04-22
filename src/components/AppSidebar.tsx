import { Package, Wrench, ClipboardList, Wallet, Truck, LayoutDashboard, Settings, LogOut } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import arecaLogo from '@/assets/areca-steel-logo.png';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

const modules = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, page: 'dashboard' },
  { title: 'Inventory', url: '/inventory', icon: Package, page: 'inventory' },
  { title: 'Consumables', url: '/consumables', icon: Wrench, page: 'consumables' },
  { title: 'Order Book', url: '/order-book', icon: ClipboardList, page: 'order-book' },
  { title: 'Working Capital', url: '/working-capital', icon: Wallet, page: 'working-capital' },
  { title: 'Petty Cash', url: '/petty-cash', icon: Wallet, page: 'petty-cash' },
  { title: 'Transportation', url: '/freight', icon: Truck, page: 'freight' },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { isAdmin, canView, signOut, user } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  const visibleModules = modules.filter(m => isAdmin || canView(m.page));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex flex-col items-start">
          <img src={arecaLogo} alt="Areca Steel" className="h-8 w-auto shrink-0" />
          {!collapsed && (
            <div className="mt-1 text-xs text-sidebar-foreground/60 leading-none">
              ArecaSteel 360
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleModules.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t border-sidebar-border">
        {isAdmin && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive('/admin')}
                tooltip="Admin"
              >
                <NavLink
                  to="/admin"
                  end
                  className="hover:bg-sidebar-accent/50"
                  activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                >
                  <Settings className="h-4 w-4" />
                  {!collapsed && <span>Admin</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        {!collapsed && user && (
          <p className="text-[10px] text-sidebar-foreground/50 truncate px-2 mb-1">{user.email}</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground"
          onClick={signOut}
        >
          <LogOut className="h-3.5 w-3.5" />
          {!collapsed && <span>Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
