import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { ToastProvider } from "@/components/Toast";
import { GlobalErrorBoundary } from "@/components/ErrorBoundary";
import { FlagProvider } from "@/flags/FlagProvider";
import MockWorkerInit from "@/mocks/MockWorkerInit";

// Layouts
const ProtectedLayout = lazy(() => import("@/pages/(protected)/layout"));

// Public pages
const LandingPage    = lazy(() => import("@/pages/page"));
const LoginPage      = lazy(() => import("@/pages/login/page"));
const LoginMfaPage   = lazy(() => import("@/pages/login/mfa/page"));
const ForgotPassPage = lazy(() => import("@/pages/login/forgot-password/page"));
const ResetPassPage  = lazy(() => import("@/pages/login/reset-password/page"));
const DeviceVerifyPage = lazy(() => import("@/pages/login/device-verification/page"));
const SecurityAlertPage = lazy(() => import("@/pages/login/security-alert/page"));
const SignupPage      = lazy(() => import("@/pages/signup/page"));
const NotFoundPage   = lazy(() => import("@/pages/not-found"));

// Store pages
const StorePage        = lazy(() => import("@/pages/store/page"));
const StoreProductPage = lazy(() => import("@/pages/store/[id]/page"));
const StoreLoginPage   = lazy(() => import("@/pages/store/login/page"));
const StoreAccountPage = lazy(() => import("@/pages/store/account/page"));

// Protected pages — core
const DashboardPage   = lazy(() => import("@/pages/(protected)/dashboard/page"));
const TerminalPage    = lazy(() => import("@/pages/(protected)/terminal/page"));
const CatalogPage     = lazy(() => import("@/pages/(protected)/catalog/page"));
const CatalogDetailPage = lazy(() => import("@/pages/(protected)/catalog/[id]/page"));
const CatalogCategoriesDetailPage = lazy(() => import("@/pages/(protected)/catalog/categories/[id]/page"));
const CatalogPriceBookPage = lazy(() => import("@/pages/(protected)/catalog/price-book/page"));
const CatalogPromotionsPage = lazy(() => import("@/pages/(protected)/catalog/promotions/page"));
const InventoryPage   = lazy(() => import("@/pages/(protected)/inventory/page"));
const InventoryCountsPage = lazy(() => import("@/pages/(protected)/inventory/counts/page"));
const InventoryErrorsPage = lazy(() => import("@/pages/(protected)/inventory/errors/page"));
const InventoryExpiryPage = lazy(() => import("@/pages/(protected)/inventory/expiry/page"));
const InventoryExpiryPoolPage = lazy(() => import("@/pages/(protected)/inventory/expiry-pool/page"));
const InventoryLocationsPage = lazy(() => import("@/pages/(protected)/inventory/locations/page"));
const InventoryPipelinePage = lazy(() => import("@/pages/(protected)/inventory/pipeline/page"));
const InventoryReceivePage = lazy(() => import("@/pages/(protected)/inventory/receive-stock/page"));
const InventoryReorderPage = lazy(() => import("@/pages/(protected)/inventory/reorder/page"));
const InventorySerialsPage = lazy(() => import("@/pages/(protected)/inventory/serials/page"));
const InventoryTransfersPage = lazy(() => import("@/pages/(protected)/inventory/transfers/page"));
const CustomersPage   = lazy(() => import("@/pages/(protected)/customers/page"));
const CustomerDetailPage = lazy(() => import("@/pages/(protected)/customers/[id]/page"));
const OrdersPage      = lazy(() => import("@/pages/(protected)/orders/page"));
const OrderDetailPage = lazy(() => import("@/pages/(protected)/orders/[id]/page"));
const SalesPage       = lazy(() => import("@/pages/(protected)/sales/page"));
const PaymentsPage    = lazy(() => import("@/pages/(protected)/payments/page"));
const ReturnsPage     = lazy(() => import("@/pages/(protected)/returns/page"));
const QuotesPage      = lazy(() => import("@/pages/(protected)/quotes/page"));
const InvoicingPage   = lazy(() => import("@/pages/(protected)/invoicing/page"));
const PurchasingPage  = lazy(() => import("@/pages/(protected)/purchasing/page"));
const VendorsPage     = lazy(() => import("@/pages/(protected)/vendors/page"));
const VendorDetailPage = lazy(() => import("@/pages/(protected)/vendors/[id]/page"));
const ShippingPage    = lazy(() => import("@/pages/(protected)/shipping/page"));
const DeliveryPage    = lazy(() => import("@/pages/(protected)/delivery/page"));
const DiscountsPage   = lazy(() => import("@/pages/(protected)/discounts/page"));
const LoyaltyPage     = lazy(() => import("@/pages/(protected)/loyalty/page"));
const GiftCardsPage   = lazy(() => import("@/pages/(protected)/gift-cards/page"));
const ReportsPage     = lazy(() => import("@/pages/(protected)/reports/page"));
const InsightsPage    = lazy(() => import("@/pages/(protected)/insights/page"));
const AccountingPage  = lazy(() => import("@/pages/(protected)/accounting/page"));
const FinancePage     = lazy(() => import("@/pages/(protected)/finance/page"));
const FinanceBillsPage = lazy(() => import("@/pages/(protected)/finance/bills/page"));
const FinancePaymentMadePage = lazy(() => import("@/pages/(protected)/finance/payment-made/page"));
const FinanceSettingsPage = lazy(() => import("@/pages/(protected)/finance/settings/page"));
const BillsPage       = lazy(() => import("@/pages/(protected)/bills/page"));
const TaxCompliancePage = lazy(() => import("@/pages/(protected)/tax-compliance/page"));
const TeamPage        = lazy(() => import("@/pages/(protected)/team/page"));
const TeamDetailPage  = lazy(() => import("@/pages/(protected)/team/[id]/page"));
const TeamCustomRolesPage = lazy(() => import("@/pages/(protected)/team/custom-roles/page"));
const SettingsPage    = lazy(() => import("@/pages/(protected)/settings/page"));
const SettingsPermissionsPage = lazy(() => import("@/pages/(protected)/settings/permissions/page"));
const SettingsModesPage = lazy(() => import("@/pages/(protected)/settings/modes/page"));
const SettingsKioskPage = lazy(() => import("@/pages/(protected)/settings/kiosk/page"));
const SettingsB2BPage = lazy(() => import("@/pages/(protected)/settings/b2b/page"));
const SetupPage       = lazy(() => import("@/pages/(protected)/setup/page"));
const SetupBusinessProfilePage = lazy(() => import("@/pages/(protected)/setup/business-profile/page"));
const SetupDevicesPage = lazy(() => import("@/pages/(protected)/setup/devices/page"));
const SetupInventoryLocationsPage = lazy(() => import("@/pages/(protected)/setup/inventory-locations/page"));
const SetupLoyaltyPage = lazy(() => import("@/pages/(protected)/setup/loyalty/page"));
const SetupModulesPage = lazy(() => import("@/pages/(protected)/setup/modules/page"));
const SetupOutletsPage = lazy(() => import("@/pages/(protected)/setup/outlets/page"));
const SetupPaymentModesPage = lazy(() => import("@/pages/(protected)/setup/payment-modes/page"));
const SetupPaymentTermsPage = lazy(() => import("@/pages/(protected)/setup/payment-terms/page"));
const SetupPaymentTypesPage = lazy(() => import("@/pages/(protected)/setup/payment-types/page"));
const SetupSecurityPage = lazy(() => import("@/pages/(protected)/setup/security/page"));
const SetupShippingPage = lazy(() => import("@/pages/(protected)/setup/shipping/page"));
const SetupTaxesPage  = lazy(() => import("@/pages/(protected)/setup/taxes/page"));
const SetupUsersPage  = lazy(() => import("@/pages/(protected)/setup/users/page"));
const WorkflowsPage   = lazy(() => import("@/pages/(protected)/workflows/page"));
const WorkforcePage   = lazy(() => import("@/pages/(protected)/workforce/page"));
const AppointmentsPage = lazy(() => import("@/pages/(protected)/appointments/page"));
const OperationsPage  = lazy(() => import("@/pages/(protected)/operations/page"));
const NotificationsPage = lazy(() => import("@/pages/(protected)/notifications/page"));
const AuditLogPage    = lazy(() => import("@/pages/(protected)/audit-log/page"));
const IntegrationsPage = lazy(() => import("@/pages/(protected)/integrations/page"));
const ImportsExportsPage = lazy(() => import("@/pages/(protected)/imports-exports/page"));
const EcommercePage   = lazy(() => import("@/pages/(protected)/ecommerce/page"));
const EcommerceOrdersPage = lazy(() => import("@/pages/(protected)/ecommerce/orders/page"));
const EcommerceCustomersPage = lazy(() => import("@/pages/(protected)/ecommerce/customers/page"));
const EcommerceDeliveryPage = lazy(() => import("@/pages/(protected)/ecommerce/delivery/page"));
const EcommercePromotionsPage = lazy(() => import("@/pages/(protected)/ecommerce/promotions/page"));
const EcommerceShippingPage = lazy(() => import("@/pages/(protected)/ecommerce/shipping/page"));
const ServiceOrdersPage = lazy(() => import("@/pages/(protected)/service-orders/page"));
const WarehousePage   = lazy(() => import("@/pages/(protected)/warehouse/page"));
const DisplayPage     = lazy(() => import("@/pages/(protected)/display/page"));
const DocumentsPage   = lazy(() => import("@/pages/(protected)/documents/page"));
const OnboardingPage  = lazy(() => import("@/pages/(protected)/onboarding/page"));
const PurchasePage    = lazy(() => import("@/pages/(protected)/purchase/page"));
const PricingPage     = lazy(() => import("@/pages/(protected)/pricing/page"));

// Industry-specific pages
const HealthcarePage     = lazy(() => import("@/pages/(protected)/healthcare/page"));
const AutomotivePage     = lazy(() => import("@/pages/(protected)/automotive/page"));
const HospitalityPage    = lazy(() => import("@/pages/(protected)/hospitality/page"));
const ManufacturingPage  = lazy(() => import("@/pages/(protected)/manufacturing/page"));
const RentalPage         = lazy(() => import("@/pages/(protected)/rental/page"));
const EntertainmentPage  = lazy(() => import("@/pages/(protected)/entertainment/page"));
const EducationPage      = lazy(() => import("@/pages/(protected)/education/page"));
const GolfPage           = lazy(() => import("@/pages/(protected)/golf/page"));
const GolfBookingsPage   = lazy(() => import("@/pages/(protected)/golf/bookings/page"));
const GolfMembersPage    = lazy(() => import("@/pages/(protected)/golf/members/page"));
const GolfProShopPage    = lazy(() => import("@/pages/(protected)/golf/pro-shop/page"));
const RestaurantDashPage = lazy(() => import("@/pages/(protected)/restaurant/dashboard/page"));
const RestaurantFloorPlanPage = lazy(() => import("@/pages/(protected)/restaurant/floor-plan/page"));
const RestaurantKitchenPage = lazy(() => import("@/pages/(protected)/restaurant/kitchen/page"));
const RestaurantTabsPage = lazy(() => import("@/pages/(protected)/restaurant/tabs/page"));

// Report sub-pages
const ReportsSalesPage    = lazy(() => import("@/pages/(protected)/reports/sales/page"));

// Spinner fallback
function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
    </div>
  );
}

// Wrap a page in the protected layout (auth guard + providers)
function Protected({ Component }: { Component: React.ComponentType }) {
  return (
    <Suspense fallback={<Spinner />}>
      <ProtectedLayout>
        <Component />
      </ProtectedLayout>
    </Suspense>
  );
}

function Router() {
  return (
    <Suspense fallback={<Spinner />}>
      <Switch>
        {/* Public */}
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/login/mfa" component={LoginMfaPage} />
        <Route path="/login/forgot-password" component={ForgotPassPage} />
        <Route path="/login/reset-password" component={ResetPassPage} />
        <Route path="/login/device-verification" component={DeviceVerifyPage} />
        <Route path="/login/security-alert" component={SecurityAlertPage} />
        <Route path="/signup" component={SignupPage} />

        {/* Store (public storefront) */}
        <Route path="/store" component={StorePage} />
        <Route path="/store/login" component={StoreLoginPage} />
        <Route path="/store/account" component={StoreAccountPage} />
        <Route path="/store/:id" component={StoreProductPage} />

        {/* Protected */}
        <Route path="/dashboard"><Protected Component={DashboardPage} /></Route>
        <Route path="/terminal"><Protected Component={TerminalPage} /></Route>
        <Route path="/sell"><Protected Component={TerminalPage} /></Route>

        {/* Catalog */}
        <Route path="/catalog"><Protected Component={CatalogPage} /></Route>
        <Route path="/catalog/price-book"><Protected Component={CatalogPriceBookPage} /></Route>
        <Route path="/catalog/promotions"><Protected Component={CatalogPromotionsPage} /></Route>
        <Route path="/catalog/categories/:id"><Protected Component={CatalogCategoriesDetailPage} /></Route>
        <Route path="/catalog/:id"><Protected Component={CatalogDetailPage} /></Route>

        {/* Inventory */}
        <Route path="/inventory"><Protected Component={InventoryPage} /></Route>
        <Route path="/inventory/counts"><Protected Component={InventoryCountsPage} /></Route>
        <Route path="/inventory/errors"><Protected Component={InventoryErrorsPage} /></Route>
        <Route path="/inventory/expiry"><Protected Component={InventoryExpiryPage} /></Route>
        <Route path="/inventory/expiry-pool"><Protected Component={InventoryExpiryPoolPage} /></Route>
        <Route path="/inventory/locations"><Protected Component={InventoryLocationsPage} /></Route>
        <Route path="/inventory/pipeline"><Protected Component={InventoryPipelinePage} /></Route>
        <Route path="/inventory/receive-stock"><Protected Component={InventoryReceivePage} /></Route>
        <Route path="/inventory/reorder"><Protected Component={InventoryReorderPage} /></Route>
        <Route path="/inventory/serials"><Protected Component={InventorySerialsPage} /></Route>
        <Route path="/inventory/transfers"><Protected Component={InventoryTransfersPage} /></Route>

        {/* Customers */}
        <Route path="/customers"><Protected Component={CustomersPage} /></Route>
        <Route path="/customers/:id"><Protected Component={CustomerDetailPage} /></Route>

        {/* Orders / Sales */}
        <Route path="/orders"><Protected Component={OrdersPage} /></Route>
        <Route path="/orders/:id"><Protected Component={OrderDetailPage} /></Route>
        <Route path="/sales"><Protected Component={SalesPage} /></Route>
        <Route path="/payments"><Protected Component={PaymentsPage} /></Route>
        <Route path="/returns"><Protected Component={ReturnsPage} /></Route>
        <Route path="/quotes"><Protected Component={QuotesPage} /></Route>
        <Route path="/invoicing"><Protected Component={InvoicingPage} /></Route>
        <Route path="/service-orders"><Protected Component={ServiceOrdersPage} /></Route>

        {/* Purchasing / Vendors */}
        <Route path="/purchasing"><Protected Component={PurchasingPage} /></Route>
        <Route path="/vendors"><Protected Component={VendorsPage} /></Route>
        <Route path="/vendors/:id"><Protected Component={VendorDetailPage} /></Route>
        <Route path="/shipping"><Protected Component={ShippingPage} /></Route>
        <Route path="/delivery"><Protected Component={DeliveryPage} /></Route>
        <Route path="/purchase"><Protected Component={PurchasePage} /></Route>

        {/* Commerce */}
        <Route path="/discounts"><Protected Component={DiscountsPage} /></Route>
        <Route path="/loyalty"><Protected Component={LoyaltyPage} /></Route>
        <Route path="/gift-cards"><Protected Component={GiftCardsPage} /></Route>
        <Route path="/pricing"><Protected Component={PricingPage} /></Route>
        <Route path="/ecommerce"><Protected Component={EcommercePage} /></Route>
        <Route path="/ecommerce/orders"><Protected Component={EcommerceOrdersPage} /></Route>
        <Route path="/ecommerce/customers"><Protected Component={EcommerceCustomersPage} /></Route>
        <Route path="/ecommerce/delivery"><Protected Component={EcommerceDeliveryPage} /></Route>
        <Route path="/ecommerce/promotions"><Protected Component={EcommercePromotionsPage} /></Route>
        <Route path="/ecommerce/shipping"><Protected Component={EcommerceShippingPage} /></Route>

        {/* Reports / Finance */}
        <Route path="/reports"><Protected Component={ReportsPage} /></Route>
        <Route path="/reports/sales"><Protected Component={ReportsSalesPage} /></Route>
        <Route path="/insights"><Protected Component={InsightsPage} /></Route>
        <Route path="/accounting"><Protected Component={AccountingPage} /></Route>
        <Route path="/finance"><Protected Component={FinancePage} /></Route>
        <Route path="/finance/bills"><Protected Component={FinanceBillsPage} /></Route>
        <Route path="/finance/payment-made"><Protected Component={FinancePaymentMadePage} /></Route>
        <Route path="/finance/settings"><Protected Component={FinanceSettingsPage} /></Route>
        <Route path="/bills"><Protected Component={BillsPage} /></Route>
        <Route path="/tax-compliance"><Protected Component={TaxCompliancePage} /></Route>

        {/* Team / Settings / Setup */}
        <Route path="/team"><Protected Component={TeamPage} /></Route>
        <Route path="/team/custom-roles"><Protected Component={TeamCustomRolesPage} /></Route>
        <Route path="/team/:id"><Protected Component={TeamDetailPage} /></Route>
        <Route path="/settings"><Protected Component={SettingsPage} /></Route>
        <Route path="/settings/permissions"><Protected Component={SettingsPermissionsPage} /></Route>
        <Route path="/settings/modes"><Protected Component={SettingsModesPage} /></Route>
        <Route path="/settings/kiosk"><Protected Component={SettingsKioskPage} /></Route>
        <Route path="/settings/b2b"><Protected Component={SettingsB2BPage} /></Route>
        <Route path="/setup"><Protected Component={SetupPage} /></Route>
        <Route path="/setup/business-profile"><Protected Component={SetupBusinessProfilePage} /></Route>
        <Route path="/setup/devices"><Protected Component={SetupDevicesPage} /></Route>
        <Route path="/setup/inventory-locations"><Protected Component={SetupInventoryLocationsPage} /></Route>
        <Route path="/setup/loyalty"><Protected Component={SetupLoyaltyPage} /></Route>
        <Route path="/setup/modules"><Protected Component={SetupModulesPage} /></Route>
        <Route path="/setup/outlets"><Protected Component={SetupOutletsPage} /></Route>
        <Route path="/setup/payment-modes"><Protected Component={SetupPaymentModesPage} /></Route>
        <Route path="/setup/payment-terms"><Protected Component={SetupPaymentTermsPage} /></Route>
        <Route path="/setup/payment-types"><Protected Component={SetupPaymentTypesPage} /></Route>
        <Route path="/setup/security"><Protected Component={SetupSecurityPage} /></Route>
        <Route path="/setup/shipping"><Protected Component={SetupShippingPage} /></Route>
        <Route path="/setup/taxes"><Protected Component={SetupTaxesPage} /></Route>
        <Route path="/setup/users"><Protected Component={SetupUsersPage} /></Route>

        {/* Ops */}
        <Route path="/operations"><Protected Component={OperationsPage} /></Route>
        <Route path="/workflows"><Protected Component={WorkflowsPage} /></Route>
        <Route path="/workforce"><Protected Component={WorkforcePage} /></Route>
        <Route path="/appointments"><Protected Component={AppointmentsPage} /></Route>
        <Route path="/notifications"><Protected Component={NotificationsPage} /></Route>
        <Route path="/audit-log"><Protected Component={AuditLogPage} /></Route>
        <Route path="/integrations"><Protected Component={IntegrationsPage} /></Route>
        <Route path="/imports-exports"><Protected Component={ImportsExportsPage} /></Route>
        <Route path="/warehouse"><Protected Component={WarehousePage} /></Route>
        <Route path="/display"><Protected Component={DisplayPage} /></Route>
        <Route path="/documents"><Protected Component={DocumentsPage} /></Route>
        <Route path="/onboarding"><Protected Component={OnboardingPage} /></Route>

        {/* Industry modules */}
        <Route path="/healthcare"><Protected Component={HealthcarePage} /></Route>
        <Route path="/automotive"><Protected Component={AutomotivePage} /></Route>
        <Route path="/hospitality"><Protected Component={HospitalityPage} /></Route>
        <Route path="/manufacturing"><Protected Component={ManufacturingPage} /></Route>
        <Route path="/rental"><Protected Component={RentalPage} /></Route>
        <Route path="/entertainment"><Protected Component={EntertainmentPage} /></Route>
        <Route path="/education"><Protected Component={EducationPage} /></Route>
        <Route path="/golf"><Protected Component={GolfPage} /></Route>
        <Route path="/golf/bookings"><Protected Component={GolfBookingsPage} /></Route>
        <Route path="/golf/members"><Protected Component={GolfMembersPage} /></Route>
        <Route path="/golf/pro-shop"><Protected Component={GolfProShopPage} /></Route>
        <Route path="/restaurant/dashboard"><Protected Component={RestaurantDashPage} /></Route>
        <Route path="/restaurant/floor-plan"><Protected Component={RestaurantFloorPlanPage} /></Route>
        <Route path="/restaurant/kitchen"><Protected Component={RestaurantKitchenPage} /></Route>
        <Route path="/restaurant/tabs"><Protected Component={RestaurantTabsPage} /></Route>

        {/* 404 */}
        <Route component={NotFoundPage} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <MockWorkerInit>
        <FlagProvider>
          <ToastProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </ToastProvider>
        </FlagProvider>
      </MockWorkerInit>
    </GlobalErrorBoundary>
  );
}
