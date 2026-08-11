import { TrendingUp } from 'lucide-react';

export default function SalePlanning() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Sale Planning</h1>
          <p>Targets, forecasts & performance tracking</p>
        </div>
        <span className="badge badge-warning">Phase 1</span>
      </div>
      <div className="card empty-state">
        <div className="empty-state-icon">
          <TrendingUp size={28} />
        </div>
        <h3>Coming in Phase 1</h3>
        <p>Set SKU-level targets, track actuals vs. targets, and manage city-wise accounts.</p>
      </div>
    </div>
  );
}
