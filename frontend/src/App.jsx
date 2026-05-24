import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Activity, 
  Package, 
  Send, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw,
  PlusCircle,
  TrendingDown
} from 'lucide-react';
import './App.css';

const API_BASE = 'http://localhost:3000/api';

function App() {
  const [zones, setZones] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [quantity, setQuantity] = useState('');

  // Fetch Dashboard Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [zonesRes, invRes] = await Promise.all([
        fetch(`${API_BASE}/zones`),
        fetch(`${API_BASE}/inventory`)
      ]);

      if (!zonesRes.ok || !invRes.ok) {
        throw new Error('Failed to retrieve live data.');
      }

      const zonesData = await zonesRes.json();
      const invData = await invRes.json();

      setZones(zonesData);
      setInventory(invData);
    } catch (error) {
      showToast('error', 'Data Retrieval Failure', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Show dynamic toast alert
  const showToast = (type, title, message, details = null) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message, details, closing: false }]);
    
    // Auto dismiss after 6 seconds
    setTimeout(() => {
      dismissToast(id);
    }, 6000);
  };

  const dismissToast = (id) => {
    setToasts(prev => 
      prev.map(t => t.id === id ? { ...t, closing: true } : t)
    );
    // Remove after closing animation completes
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  };

  // Secure ACID Dispatch Handlers
  const handleSecureDispatch = async (e) => {
    e.preventDefault();
    if (!selectedItem || !selectedZone || !quantity) {
      showToast('error', 'Input Error', 'Please complete all required fields.');
      return;
    }

    const qtyVal = parseInt(quantity, 10);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      showToast('error', 'Input Error', 'Please supply a positive integer quantity.');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: selectedItem,
          zone_id: selectedZone,
          quantity: qtyVal
        })
      });

      const result = await response.json();

      if (response.ok) {
        // Database TRANSACTION COMMITTED successfully!
        showToast(
          'success', 
          'Secure Dispatch Committed', 
          `Transaction successfully committed to the database. ${result.data.quantity_sent} units of ${result.data.item_name} allocated.`,
          `Status: COMMIT | Log ID: ${result.data.dispatch_id} | Remaining Inventory: ${result.data.remaining_quantity}`
        );
        // Reset form inputs
        setQuantity('');
        // Refresh live dashboard updates
        fetchData();
      } else {
        // Database TRANSACTION ROLLED BACK!
        showToast(
          'error', 
          'Database Transaction Rolled Back', 
          `Allocation failed: ${result.error}`,
          `Status: ROLLBACK | Reason: ${result.details || 'Fails threshold criteria / database bounds constraint check.'}`
        );
      }
    } catch (error) {
      showToast(
        'error', 
        'API Request Failed', 
        'A connection timeout or hardware error interrupted the socket stream.',
        error.message
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Metrics computation helpers
  const totalActiveZones = zones.filter(z => z.status.toLowerCase().includes('active') || z.status === 'CRITICAL SYSTEM ALERT').length;
  const criticalAlertZones = zones.filter(z => z.status === 'CRITICAL SYSTEM ALERT').length;
  const lowStockItems = inventory.filter(i => i.quantity < i.minimum_threshold).length;

  return (
    <div className="dashboard-container">
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type} ${toast.closing ? 'closing' : ''}`}>
            <div className="toast-icon">
              {toast.type === 'success' ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
            </div>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              <div className="toast-message">{toast.message}</div>
              {toast.details && (
                <div className="toast-details">
                  {toast.details}
                </div>
              )}
            </div>
            <button className="toast-close-btn" onClick={() => dismissToast(toast.id)}>
              <XCircle size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Control Center Header */}
      <header className="dashboard-header">
        <div className="header-title-section">
          <ShieldAlert size={36} className="logo-icon" />
          <div>
            <h1>ResQ-Route Control Center</h1>
            <p>Real-Time Emergency Logistics & Live ACID Transaction Monitor</p>
          </div>
        </div>
        <div className="header-meta">
          <div className="system-status">
            <div className="status-pulse"></div>
            <span>MySQL DATABASE ACTIVE</span>
          </div>
        </div>
      </header>

      {/* Metrics Row */}
      <section className="metrics-row">
        <div className="metric-card">
          <div className="metric-info">
            <h3>Active Disaster Zones</h3>
            <div className="metric-value">{totalActiveZones}</div>
          </div>
          <div className="metric-icon">
            <Activity size={24} />
          </div>
        </div>

        <div className="metric-card alert-metric">
          <div className="metric-info">
            <h3>Critical Alerts Active</h3>
            <div className="metric-value">{criticalAlertZones}</div>
          </div>
          <div className="metric-icon">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="metric-card success-metric">
          <div className="metric-info">
            <h3>Resource Warehouses</h3>
            <div className="metric-value">{inventory.length}</div>
          </div>
          <div className="metric-icon">
            <Package size={24} />
          </div>
        </div>

        <div className="metric-card alert-metric">
          <div className="metric-info">
            <h3>Low Inventory Alerts</h3>
            <div className="metric-value">{lowStockItems}</div>
          </div>
          <div className="metric-icon">
            <TrendingDown size={24} />
          </div>
        </div>
      </section>

      {/* Primary Workspace Grid */}
      <div className="dashboard-grid">
        
        {/* Left Column: Disaster Zones Grid */}
        <div className="section-card zones-section">
          <div className="section-header">
            <h2>
              <Activity size={20} />
              Active Disaster Zones
            </h2>
            <button className="toast-close-btn" onClick={fetchData} title="Refresh Live Data" disabled={loading}>
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Querying disaster zones data state...
            </div>
          ) : (
            <div className="zones-scroll-container">
              <div className="zones-grid">
                {zones.map(zone => {
                  const isCritical = zone.status === 'CRITICAL SYSTEM ALERT';
                  return (
                    <div key={zone.zone_id} className={`zone-card ${isCritical ? 'critical-alert' : ''}`}>
                      <div className="zone-card-header">
                        <div>
                          <div className="zone-name">{zone.area_name}</div>
                          <div className="zone-type">{zone.disaster_type}</div>
                        </div>
                        <span className={`severity-badge level-${zone.severity_level}`}>
                          Lvl {zone.severity_level}
                        </span>
                      </div>

                      <div className={`zone-status-badge ${
                        isCritical ? 'critical' : 
                        zone.status.toLowerCase().includes('active') ? 'active' :
                        zone.status.toLowerCase().includes('monitored') ? 'monitored' : 'resolved'
                      }`}>
                        {isCritical && <ShieldAlert size={14} />}
                        {zone.status}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Secure Dispatch and Inventory List Stack */}
        <div className="right-dashboard-column">
          
          {/* Secure Dispatch Action Panel */}
          <div className="section-card dispatch-section">
            <div className="section-header">
              <h2>
                <Send size={20} />
                Secure Dispatch Panel
              </h2>
            </div>

            <form className="dispatch-form" onSubmit={handleSecureDispatch}>
              <div className="form-group">
                <label>Select Emergency Item</label>
                <div className="input-wrapper">
                  <Package size={18} className="input-icon" />
                  <select 
                    value={selectedItem} 
                    onChange={e => setSelectedItem(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Supplying Camp Item --</option>
                    {inventory.map(item => (
                      <option key={item.item_id} value={item.item_id}>
                        {item.item_name} ({item.camp_name}) - Available: {item.quantity}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group-row">
                <div className="form-group">
                  <label>Target Disaster Zone</label>
                  <div className="input-wrapper">
                    <Activity size={18} className="input-icon" />
                    <select 
                      value={selectedZone} 
                      onChange={e => setSelectedZone(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Allocation Destination --</option>
                      {zones.map(zone => (
                        <option key={zone.zone_id} value={zone.zone_id}>
                          {zone.area_name} [{zone.status}]
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Allocation Quantity</label>
                  <div className="input-wrapper">
                    <PlusCircle size={18} className="input-icon" />
                    <input 
                      type="number" 
                      placeholder="Enter units" 
                      value={quantity}
                      onChange={e => setQuantity(e.target.value)}
                      min="1"
                      required
                    />
                  </div>
                </div>
              </div>

              <button type="submit" className="btn-dispatch" disabled={submitting}>
                {submitting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Processing ACID Transaction...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Execute Secure Dispatch
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Inventory & Safety Threshold Trackers */}
          <div className="section-card inventory-section">
            <div className="section-header">
              <h2>
                <Package size={20} />
                Camp Inventory & Safety Trackers
              </h2>
            </div>

            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Polling warehouse inventory stocks...
              </div>
            ) : (
              <div className="table-responsive">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Supply Resource & Source camp</th>
                      <th>Current Stock</th>
                      <th>Threshold Gauge</th>
                      <th>Status Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map(item => {
                      const isLow = item.quantity < item.minimum_threshold;
                      const ratio = Math.min((item.quantity / (item.minimum_threshold * 2)) * 100, 100);
                      return (
                        <tr key={item.item_id}>
                          <td>
                            <div className="item-badge-cell">
                              <Package size={16} className="item-type-icon" />
                              <div>
                                <div style={{ fontWeight: '600' }}>{item.item_name}</div>
                                <span className="camp-tag">{item.camp_name}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: '1.05rem', fontWeight: '800', color: isLow ? 'var(--color-danger)' : '#fff' }}>
                              {item.quantity}
                            </span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}> / {item.minimum_threshold} Min</span>
                          </td>
                          <td style={{ width: '25%' }}>
                            <div className="progress-bar-container">
                              <div 
                                className="progress-bar" 
                                style={{ 
                                  width: `${ratio}%`, 
                                  backgroundColor: isLow ? 'var(--color-danger)' : 'var(--color-success)' 
                                }}
                              ></div>
                            </div>
                          </td>
                          <td>
                            <span className={`stock-status ${isLow ? 'low' : 'optimal'}`}>
                              {isLow ? (
                                <>
                                  <AlertTriangle size={11} />
                                  LOW STOCK
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={11} />
                                  OPTIMAL
                                </>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}

export default App;
