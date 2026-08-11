import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import SKUManagement from './pages/SKUManagement';
import Inventory from './pages/Inventory';
import Analytics from './pages/Analytics';
import Profitability from './pages/Profitability';
import PriceTesting from './pages/PriceTesting';
import DataImport from './pages/DataImport';
import Settings from './pages/Settings';

/** Redirect to /login if not authenticated */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loader" />
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
}

/** Redirect to / if already authenticated */
function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

      {/* Protected shell */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index                element={<Dashboard />} />
        <Route path="sales"         element={<Sales />} />
        <Route path="skus"          element={<SKUManagement />} />
        <Route path="inventory"     element={<Inventory />} />
        <Route path="analytics"     element={<Analytics />} />
        <Route path="profitability" element={<Profitability />} />
        <Route path="price-testing" element={<PriceTesting />} />
        <Route path="import"        element={<DataImport />} />
        <Route path="settings"      element={<Settings />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
