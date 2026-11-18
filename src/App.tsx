/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  BarChart3,
  Briefcase,
  CreditCard,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { PortalTab } from './types/portal';
import { BRAND_LOGO_URL } from './components/UiPrimitives';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { CustomersView } from './components/CustomersView';
import { OrdersView } from './components/OrdersView';
import { PaymentsView } from './components/PaymentsView';
import { ReceiptsView } from './components/ReceiptsView';
import { DocumentsView } from './components/DocumentsView';
import { ReportsView } from './components/ReportsView';
import {
  AuditLogsView,
  CompanySettingsView,
  ServicesManagementView,
  UsersAndRolesView,
} from './components/AdminViews';
import { ReceiptPreviewModal } from './components/ReceiptPreviewModal';
import { VerifyReceiptPage } from './components/VerifyReceiptPage';

interface NavItem {
  id: PortalTab;
  label: string;
  permission?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', permission: 'dashboard.view', icon: LayoutDashboard },
  { id: 'customers', label: 'Customers', permission: 'customers.view', icon: Users },
  { id: 'orders', label: 'Orders', permission: 'orders.view', icon: FileText },
  { id: 'payments', label: 'Payments', permission: 'payments.view', icon: CreditCard },
  { id: 'receipts', label: 'Receipts', permission: 'receipts.view', icon: ReceiptText },
  { id: 'documents', label: 'Documents', permission: 'documents.manage', icon: FolderOpen },
  { id: 'reports', label: 'Reports', permission: 'reports.view', icon: BarChart3 },
  { id: 'services', label: 'Services', icon: Briefcase },
  { id: 'users', label: 'Users & Roles', permission: 'users.manage', icon: Shield },
  { id: 'settings', label: 'Company Settings', permission: 'settings.manage', icon: Settings },
  { id: 'audit', label: 'Audit Logs', permission: 'audit.view', icon: History },
];

function PortalShell() {
  const { user, companySettings, loading, logout, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<PortalTab>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Cross-module deep-link state
  const [previewReceiptId, setPreviewReceiptId] = useState<number | null>(null);
  const [orderToOpenId, setOrderToOpenId] = useState<number | null>(null);
  const [createOrderCustomerId, setCreateOrderCustomerId] = useState<number | null>(null);
  const [openCreateOrderModal, setOpenCreateOrderModal] = useState(false);
  const [recordPaymentOrderId, setRecordPaymentOrderId] = useState<number | null>(null);

  // Public receipt verification route detection
  const [verifyToken, setVerifyToken] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/verify-receipt\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  if (verifyToken) {
    return (
      <VerifyReceiptPage
        token={verifyToken}
        onBackToPortal={() => {
          window.history.pushState({}, '', '/');
          setVerifyToken(null);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E8E6EC] rounded-xl px-8 py-6 text-center space-y-3">
          <img
            src={BRAND_LOGO_URL}
            alt="eDrafter"
            className="h-10 w-auto mx-auto object-contain"
          />
          <p className="text-xs text-[#777481]">Loading eDrafter Operations Portal...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const visibleNav = NAV_ITEMS.filter((item) => !item.permission || hasPermission(item.permission));
  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Dashboard';

  const navigateTo = (tab: PortalTab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-[#25212B]/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar (260px) */}
      <aside
        className={`no-print fixed lg:sticky top-0 left-0 z-40 h-screen w-[260px] bg-white border-r border-[#E8E6EC] flex flex-col justify-between transition-transform duration-200 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Logo Header */}
          <div className="px-5 py-4 border-b border-[#E8E6EC] flex items-center justify-between gap-2">
            <img
              src={companySettings?.logoUrl || BRAND_LOGO_URL}
              alt="eDrafter — Crafting Legal Solutions"
              referrerPolicy="no-referrer"
              className="h-10 w-auto object-contain"
            />
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation menu"
              className="lg:hidden p-1 text-[#777481] hover:text-[#25212B]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav aria-label="Primary Sidebar Navigation" className="p-3 space-y-1 flex-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#310D35] text-white'
                      : 'text-[#25212B] hover:bg-[#F7F8FA] hover:text-[#310D35]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#83C441]' : 'text-[#777481]'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Bottom User Summary */}
          <div className="p-4 border-t border-[#E8E6EC] bg-[#F7F8FA]/60">
            <div className="text-xs">
              <p className="font-semibold text-[#25212B] truncate">{user.fullName}</p>
              <p className="text-[#008C98] font-medium truncate">{user.roleName}</p>
              <p className="text-[11px] text-[#777481] truncate">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#25212B] bg-white border border-[#E8E6EC] rounded-lg hover:bg-[#FEF2F2] hover:text-[#991B1B] hover:border-[#FECACA] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="no-print sticky top-0 z-20 bg-white border-b border-[#E8E6EC] px-4 md:px-7 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 text-[#25212B] border border-[#E8E6EC] rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs md:text-sm min-w-0">
              <span className="font-semibold text-[#310D35] whitespace-nowrap">
                {companySettings?.companyName || 'eDrafter'}
              </span>
              <span className="text-[#777481]" aria-hidden="true">/</span>
              <span className="font-medium text-[#25212B] truncate">{activeNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <img
              src={companySettings?.logoUrl || BRAND_LOGO_URL}
              alt="eDrafter"
              referrerPolicy="no-referrer"
              className="hidden sm:block lg:hidden h-7 w-auto object-contain"
            />
            {hasPermission('payments.collect') && (
              <button
                type="button"
                onClick={() => navigateTo('payments')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] whitespace-nowrap shrink-0"
              >
                Collect Payment
              </button>
            )}
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 md:p-7 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              onNavigate={navigateTo}
              onOpenOrder={(id) => {
                setOrderToOpenId(id);
                navigateTo('orders');
              }}
              onPreviewReceipt={(id) => setPreviewReceiptId(id)}
              onNewOrder={() => {
                setOpenCreateOrderModal(true);
                navigateTo('orders');
              }}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersView
              onOpenOrder={(id) => {
                setOrderToOpenId(id);
                navigateTo('orders');
              }}
              onPreviewReceipt={(id) => setPreviewReceiptId(id)}
              onCreateOrderForCustomer={(custId) => {
                setCreateOrderCustomerId(custId);
                navigateTo('orders');
              }}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              initialOrderId={orderToOpenId}
              initialCreateCustomerId={createOrderCustomerId}
              openCreateInitially={openCreateOrderModal}
              onClearInitialTriggers={() => {
                setOrderToOpenId(null);
                setCreateOrderCustomerId(null);
                setOpenCreateOrderModal(false);
              }}
              onPreviewReceipt={(id) => setPreviewReceiptId(id)}
              onRecordPaymentForOrder={(ordId) => {
                setRecordPaymentOrderId(ordId);
                navigateTo('payments');
              }}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsView
              initialOrderId={recordPaymentOrderId}
              onClearInitialOrder={() => setRecordPaymentOrderId(null)}
              onPreviewReceipt={(id) => setPreviewReceiptId(id)}
              onOpenOrder={(id) => {
                setOrderToOpenId(id);
                navigateTo('orders');
              }}
            />
          )}

          {activeTab === 'receipts' && (
            <ReceiptsView onPreviewReceipt={(id) => setPreviewReceiptId(id)} />
          )}

          {activeTab === 'documents' && <DocumentsView />}

          {activeTab === 'reports' && <ReportsView />}

          {activeTab === 'services' && <ServicesManagementView />}

          {activeTab === 'users' && <UsersAndRolesView />}

          {activeTab === 'settings' && <CompanySettingsView />}

          {activeTab === 'audit' && <AuditLogsView />}
        </main>
      </div>

      {previewReceiptId !== null && (
        <ReceiptPreviewModal
          receiptId={previewReceiptId}
          onClose={() => setPreviewReceiptId(null)}
          onRevised={(newId) => setPreviewReceiptId(newId)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PortalShell />
    </AuthProvider>
  );
}
