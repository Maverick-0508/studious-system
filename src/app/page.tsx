"use client";

import { jsPDF } from "jspdf";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  advanceFleetState,
  buildStationScenarioMetrics,
  calculateCarbonMetrics,
  createDispatchPlan,
  createOperationalAlerts,
  getNearestCompatibleStation,
} from "@/lib/fleetEngine";
import type {
  DashboardPreset,
  DateRange,
  FleetDatabase,
  Role,
  Vehicle,
  VehicleStatus,
} from "@/lib/fleetTypes";

const ROLE_LABELS: Record<Role, string> = {
  dispatcher: "Dispatcher",
  ops_manager: "Ops manager",
  admin: "Admin",
  client_view: "Client view",
};

const RANGE_POINTS: Record<DateRange, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
};

const ROLE_PERMISSIONS: Record<Role, { canExport: boolean; canPlan: boolean; canSavePreset: boolean }> = {
  dispatcher: { canExport: false, canPlan: false, canSavePreset: true },
  ops_manager: { canExport: true, canPlan: true, canSavePreset: true },
  admin: { canExport: true, canPlan: true, canSavePreset: true },
  client_view: { canExport: true, canPlan: false, canSavePreset: false },
};

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: VehicleStatus): string {
  if (status === "Detouring to swap" || status === "Detouring to charger" || status === "Delayed") {
    return "status-warning";
  }

  if (status === "Swapping battery" || status === "Fast charging") {
    return "status-success";
  }

  return "status-neutral";
}

function severityTone(severity: "high" | "medium" | "low"): string {
  if (severity === "high") {
    return "pill-danger";
  }

  if (severity === "medium") {
    return "pill-warning";
  }

  return "pill-neutral";
}

function downloadTextFile(filename: string, content: string, type = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function MeterBar({
  value,
  tone,
}: {
  value: number;
  tone: "battery" | "diesel" | "grid" | "saved" | "warning";
}) {
  return (
    <svg className="meter" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
      <rect className="meter-track" x="0" y="0" width="100" height="10" rx="5" />
      <rect className={`meter-fill meter-${tone}`} x="0" y="0" width={Math.max(5, Math.min(100, value))} height="10" rx="5" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: "dark" | "light" }) {
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 24 24" className="theme-icon" aria-hidden="true">
        <path d="M19.5 12.7A8.4 8.4 0 0 1 11.3 4 8.6 8.6 0 1 0 20 13a8.1 8.1 0 0 1-.5-.3Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="theme-icon" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2m0 14.6v2.2m9.5-9.5h-2.2M4.7 12H2.5m16.9-6.8-1.6 1.6m-12.6 12.6-1.6 1.6m15.8 0-1.6-1.6M4.7 5.2 3.1 3.6" />
    </svg>
  );
}

function handleActionKey(event: KeyboardEvent<SVGGElement>, callback: () => void): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    callback();
  }
}

export default function Home() {
  const [database, setDatabase] = useState<FleetDatabase | null>(null);
  const [tenantVehicles, setTenantVehicles] = useState<Record<string, Vehicle[]>>({});
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | "all">("all");
  const [lowBatteryOnly, setLowBatteryOnly] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [playbackMode, setPlaybackMode] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [showScenario, setShowScenario] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("Waiting for live data");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("ecofleet-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      return;
    }

    setTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("ecofleet-theme", theme);
  }, [theme]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch("/api/fleet", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Dashboard data could not be loaded.");
        }

        const nextDatabase = (await response.json()) as FleetDatabase;

        if (!active) {
          return;
        }

        setDatabase(nextDatabase);
        setTenantVehicles(
          Object.fromEntries(nextDatabase.dashboards.map((dashboard) => [dashboard.tenant.id, dashboard.vehicles])),
        );

        const savedTenantId = window.localStorage.getItem("ecofleet-tenant");
        const fallbackTenantId = nextDatabase.dashboards[0]?.tenant.id ?? "";
        const nextTenantId =
          savedTenantId && nextDatabase.dashboards.some((dashboard) => dashboard.tenant.id === savedTenantId)
            ? savedTenantId
            : fallbackTenantId;
        const savedUserId = window.localStorage.getItem("ecofleet-user");
        const usersForTenant = nextDatabase.users.filter((user) => user.tenantId === nextTenantId);
        const nextUserId = usersForTenant.some((user) => user.id === savedUserId) ? savedUserId ?? "" : usersForTenant[0]?.id ?? "";

        setSelectedTenantId(nextTenantId);
        setSelectedUserId(nextUserId);
        setSelectedVehicleId(nextDatabase.dashboards[0]?.vehicles[0]?.id ?? "");
        setSearch(window.localStorage.getItem("ecofleet-search") ?? "");
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unexpected dashboard error.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTenantId) {
      return;
    }

    window.localStorage.setItem("ecofleet-tenant", selectedTenantId);
  }, [selectedTenantId]);

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }

    window.localStorage.setItem("ecofleet-user", selectedUserId);
  }, [selectedUserId]);

  useEffect(() => {
    window.localStorage.setItem("ecofleet-search", search);
  }, [search]);

  useEffect(() => {
    if (!database) {
      return;
    }

    const timer = window.setInterval(() => {
      setTenantVehicles((current) =>
        Object.fromEntries(
          database.dashboards.map((dashboard) => {
            const existingVehicles = current[dashboard.tenant.id] ?? dashboard.vehicles;
            return [dashboard.tenant.id, advanceFleetState(existingVehicles, dashboard.stations)];
          }),
        ),
      );
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 2200);

    return () => window.clearInterval(timer);
  }, [database]);

  useEffect(() => {
    if (!database || !selectedTenantId) {
      return;
    }

    const tenantUsers = database.users.filter((user) => user.tenantId === selectedTenantId);

    if (!tenantUsers.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(tenantUsers[0]?.id ?? "");
    }
  }, [database, selectedTenantId, selectedUserId]);

  useEffect(() => {
    if (!playbackMode || !timelinePlaying || !database) {
      return;
    }

    const activeDashboard = database.dashboards.find((dashboard) => dashboard.tenant.id === selectedTenantId);

    if (!activeDashboard) {
      return;
    }

    const timer = window.setInterval(() => {
      setTimelineIndex((currentIndex) => (currentIndex + 1) % activeDashboard.playbackFrames.length);
    }, 1200);

    return () => window.clearInterval(timer);
  }, [database, playbackMode, selectedTenantId, timelinePlaying]);

  const activeDashboard = useMemo(
    () => database?.dashboards.find((dashboard) => dashboard.tenant.id === selectedTenantId) ?? null,
    [database, selectedTenantId],
  );

  const usersForTenant = useMemo(
    () => database?.users.filter((user) => user.tenantId === selectedTenantId) ?? [],
    [database, selectedTenantId],
  );

  const activeUser = useMemo(
    () => usersForTenant.find((user) => user.id === selectedUserId) ?? usersForTenant[0] ?? null,
    [selectedUserId, usersForTenant],
  );

  const permissions = activeUser ? ROLE_PERMISSIONS[activeUser.role] : ROLE_PERMISSIONS.dispatcher;
  const liveVehicles = activeDashboard ? tenantVehicles[activeDashboard.tenant.id] ?? activeDashboard.vehicles : [];
  const playbackFrame = activeDashboard?.playbackFrames[timelineIndex] ?? null;
  const displayVehicles = playbackMode && playbackFrame ? playbackFrame.vehicles : liveVehicles;
  const plannedStations =
    showScenario && permissions.canPlan && activeDashboard
      ? [...activeDashboard.stations, activeDashboard.candidateStation]
      : activeDashboard?.stations ?? [];
  const routeList = activeDashboard?.routes ?? [];
  const alerts = useMemo(
    () => createOperationalAlerts(liveVehicles, plannedStations, routeList),
    [liveVehicles, plannedStations, routeList],
  );
  const history = activeDashboard?.history ?? [];
  const visibleHistory = history.slice(-RANGE_POINTS[dateRange]);

  const filteredVehicles = useMemo(() => {
    return displayVehicles.filter((vehicle) => {
      const matchesSearch =
        search.trim().length === 0 ||
        `${vehicle.name} ${vehicle.model}`.toLowerCase().includes(search.trim().toLowerCase());
      const matchesStatus = statusFilter === "all" || vehicle.status === statusFilter;
      const matchesBattery = !lowBatteryOnly || vehicle.batterySoc <= 25;
      return matchesSearch && matchesStatus && matchesBattery;
    });
  }, [displayVehicles, lowBatteryOnly, search, statusFilter]);

  useEffect(() => {
    if (!filteredVehicles.length) {
      return;
    }

    if (!filteredVehicles.some((vehicle) => vehicle.id === selectedVehicleId)) {
      setSelectedVehicleId(filteredVehicles[0].id);
    }
  }, [filteredVehicles, selectedVehicleId]);

  const selectedVehicle = filteredVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? filteredVehicles[0] ?? displayVehicles[0];
  const focusStation = selectedVehicle ? getNearestCompatibleStation(selectedVehicle, plannedStations) : null;
  const carbonMetrics = useMemo(() => calculateCarbonMetrics(liveVehicles), [liveVehicles]);
  const playbackMetrics = useMemo(() => calculateCarbonMetrics(displayVehicles), [displayVehicles]);
  const stationMetrics = useMemo(() => buildStationScenarioMetrics(plannedStations), [plannedStations]);
  const dispatchPlan = useMemo(
    () => createDispatchPlan(liveVehicles, routeList, plannedStations).sort((left, right) => right.score - left.score),
    [liveVehicles, plannedStations, routeList],
  );

  const vehicleBreakdown = useMemo(
    () =>
      liveVehicles.map((vehicle) => ({
        id: vehicle.id,
        name: vehicle.name,
        emissionsSavedKg: vehicle.mileage * 0.64,
        gridFootprintKg: vehicle.mileage * 0.18,
        costSaved: (vehicle.mileage / 8.8) * 4.45 - vehicle.energyUsedKwh * 0.16,
      })),
    [liveVehicles],
  );

  const routeBreakdown = useMemo(
    () =>
      routeList.map((route) => {
        const assignedVehicle = liveVehicles.find((vehicle) => vehicle.id === route.vehicleId);
        return {
          id: route.id,
          name: route.name,
          priority: route.priority,
          emissionsSavedKg: (assignedVehicle?.mileage ?? route.estimatedMiles) * 0.64,
          delayMinutes: route.trafficDelayMinutes,
        };
      }),
    [liveVehicles, routeList],
  );

  const emissionsTrend =
    visibleHistory.length > 1
      ? visibleHistory[visibleHistory.length - 1].emissionsSavedKg - visibleHistory[0].emissionsSavedKg
      : carbonMetrics.emissionsSavedKg;
  const onTimeTrend =
    visibleHistory.length > 1 ? visibleHistory[visibleHistory.length - 1].onTimeRate - visibleHistory[0].onTimeRate : 0;

  async function retryLoad(): Promise<void> {
    setDatabase(null);
    setTenantVehicles({});
    setSelectedTenantId("");
    setSelectedUserId("");
    setSelectedVehicleId("");
    setError(null);
    setIsLoading(true);

    const response = await fetch("/api/fleet", { cache: "no-store" });
    const nextDatabase = (await response.json()) as FleetDatabase;
    setDatabase(nextDatabase);
    setTenantVehicles(Object.fromEntries(nextDatabase.dashboards.map((dashboard) => [dashboard.tenant.id, dashboard.vehicles])));
    setSelectedTenantId(nextDatabase.dashboards[0]?.tenant.id ?? "");
    setSelectedUserId(nextDatabase.users[0]?.id ?? "");
    setSelectedVehicleId(nextDatabase.dashboards[0]?.vehicles[0]?.id ?? "");
    setIsLoading(false);
  }

  function exportCsv(): void {
    if (!permissions.canExport) {
      return;
    }

    const lines = [
      ["Metric", "Value"],
      ["Tenant", activeDashboard?.tenant.name ?? ""],
      ["Role", activeUser ? ROLE_LABELS[activeUser.role] : ""],
      ["Total miles", formatNumber(carbonMetrics.totalMiles, 1)],
      ["EV energy used (kWh)", formatNumber(carbonMetrics.totalEnergyKwh, 1)],
      ["Diesel emissions (kg CO2)", formatNumber(carbonMetrics.dieselEmissionsKg, 1)],
      ["Grid emissions (kg CO2)", formatNumber(carbonMetrics.gridEmissionsKg, 1)],
      ["Emissions saved (kg CO2)", formatNumber(carbonMetrics.emissionsSavedKg, 1)],
      ["Cost saved", formatCurrency(carbonMetrics.costSaved)],
    ]
      .map((row) => row.join(","))
      .join("\n");

    downloadTextFile("ecofleet-carbon-report.csv", lines, "text/csv;charset=utf-8");
  }

  function exportPdf(): void {
    if (!permissions.canExport) {
      return;
    }

    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text("EcoFleet ESG report", 16, 18);
    pdf.setFontSize(11);
    pdf.text(`Tenant: ${activeDashboard?.tenant.name ?? "Unknown"}`, 16, 28);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 16, 35);
    pdf.text(`Emissions saved: ${formatNumber(carbonMetrics.emissionsSavedKg, 1)} kg CO2`, 16, 46);
    pdf.text(`Cost saved: ${formatCurrency(carbonMetrics.costSaved)}`, 16, 53);
    pdf.text(`On-time delivery trend: ${formatNumber(onTimeTrend, 1)} pts`, 16, 60);
    pdf.text("Per-vehicle breakdown", 16, 74);

    let y = 84;

    vehicleBreakdown.slice(0, 6).forEach((vehicle) => {
      pdf.text(
        `${vehicle.name}: ${formatNumber(vehicle.emissionsSavedKg, 1)} kg saved / ${formatCurrency(vehicle.costSaved)} avoided`,
        18,
        y,
      );
      y += 8;
    });

    pdf.save("ecofleet-esg-report.pdf");
  }

  async function savePreset(): Promise<void> {
    if (!activeDashboard || !permissions.canSavePreset || !presetName.trim()) {
      return;
    }

    const preset: DashboardPreset = {
      id: `preset-${Date.now()}`,
      name: presetName.trim(),
      city: activeDashboard.tenant.city,
      search,
      statusFilter,
      lowBatteryOnly,
      dateRange,
    };

    const response = await fetch("/api/fleet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "save-preset",
        tenantId: activeDashboard.tenant.id,
        preset,
      }),
    });

    if (!response.ok) {
      return;
    }

    const nextDatabase = (await response.json()) as FleetDatabase;
    setDatabase(nextDatabase);
    setPresetName("");
  }

  function applyPreset(preset: DashboardPreset): void {
    setSearch(preset.search);
    setStatusFilter(preset.statusFilter);
    setLowBatteryOnly(preset.lowBatteryOnly);
    setDateRange(preset.dateRange);
  }

  if (isLoading) {
    return (
      <main className="shell loading-shell">
        <section className="hero-panel loading-panel">
          <p className="eyebrow">EcoFleet OS</p>
          <h1>Loading fleet intelligence…</h1>
          <p className="hero-copy">Connecting to the local API, telemetry history, alerts, presets, and station planning data.</p>
        </section>
      </main>
    );
  }

  if (error || !activeDashboard || !activeUser) {
    return (
      <main className="shell loading-shell">
        <section className="hero-panel loading-panel">
          <p className="eyebrow">EcoFleet OS</p>
          <h1>Dashboard unavailable</h1>
          <p className="hero-copy">{error ?? "Tenant data could not be resolved."}</p>
          <button type="button" className="primary-button" onClick={() => void retryLoad()}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">EcoFleet OS</p>
          <h1>Live fleet ops, role-aware dispatching, and auditable ESG reporting.</h1>
          <p className="hero-copy">
            This upgrade adds a local API/data layer, tenant-aware access, dispatch recommendations, alert routing, station scenario
            planning, history filters, preset storage, and timeline playback.
          </p>
        </div>

        <div className="hero-actions">
          <button type="button" className="primary-button" onClick={exportCsv} disabled={!permissions.canExport}>
            Export CSV
          </button>
          <button type="button" className="secondary-button" onClick={exportPdf} disabled={!permissions.canExport}>
            Export PDF
          </button>
          <div className="hero-meta">
            <span>Live sync</span>
            <strong>{lastUpdated}</strong>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="theme-fab"
        onClick={() => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        <ThemeIcon theme={theme} />
      </button>

      <section className="toolbar-grid">
        <article className="panel control-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Authentication + roles</p>
              <h2>Tenant access</h2>
            </div>
            <span className="badge">{ROLE_LABELS[activeUser.role]}</span>
          </div>
          <label className="field">
            <span>Tenant</span>
            <select value={selectedTenantId} onChange={(event) => setSelectedTenantId(event.target.value)}>
              {database.dashboards.map((dashboard) => (
                <option key={dashboard.tenant.id} value={dashboard.tenant.id}>
                  {dashboard.tenant.name} · {dashboard.tenant.city}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Signed in as</span>
            <select value={activeUser.id} onChange={(event) => setSelectedUserId(event.target.value)}>
              {usersForTenant.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {ROLE_LABELS[user.role]}
                </option>
              ))}
            </select>
          </label>
          <div className="tenant-meta">
            <div>
              <span>City</span>
              <strong>{activeDashboard.tenant.city}</strong>
            </div>
            <div>
              <span>Timezone</span>
              <strong>{activeDashboard.tenant.timezone}</strong>
            </div>
            <div>
              <span>Carbon target</span>
              <strong>{activeDashboard.tenant.carbonTargetPercent}% reduction</strong>
            </div>
          </div>
        </article>

        <article className="panel control-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Search + presets</p>
              <h2>Operator filters</h2>
            </div>
            <span className="badge">{filteredVehicles.length} matches</span>
          </div>
          <label className="field">
            <span>Search vehicles</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Atlas, E-van, E-cargo…" />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as VehicleStatus | "all")}>
                <option value="all">All</option>
                <option value="En route">En route</option>
                <option value="Delayed">Delayed</option>
                <option value="Detouring to swap">Detouring to swap</option>
                <option value="Detouring to charger">Detouring to charger</option>
                <option value="Swapping battery">Swapping battery</option>
                <option value="Fast charging">Fast charging</option>
              </select>
            </label>
            <label className="field">
              <span>Date range</span>
              <select value={dateRange} onChange={(event) => setDateRange(event.target.value as DateRange)}>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
              </select>
            </label>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={lowBatteryOnly} onChange={(event) => setLowBatteryOnly(event.target.checked)} />
            <span>Only show vehicles at 25% SoC or lower</span>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Save preset</span>
              <input
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder={permissions.canSavePreset ? "Morning dispatch review" : "Preset saving unavailable"}
                disabled={!permissions.canSavePreset}
              />
            </label>
            <button type="button" className="secondary-button" onClick={() => void savePreset()} disabled={!permissions.canSavePreset}>
              Save
            </button>
          </div>
          <div className="preset-list">
            {activeDashboard.presets.map((preset) => (
              <button key={preset.id} type="button" className="preset-chip" onClick={() => applyPreset(preset)}>
                {preset.name}
              </button>
            ))}
          </div>
        </article>

        <article className="panel control-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Notifications</p>
              <h2>Alert center</h2>
            </div>
            <span className="badge badge-strong">{alerts.length} active</span>
          </div>
          <div className="alert-list">
            {alerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="alert-card">
                <div className="alert-top">
                  <strong>{alert.title}</strong>
                  <span className={`pill ${severityTone(alert.severity)}`}>{alert.severity}</span>
                </div>
                <p>{alert.message}</p>
                <small>{alert.channels.join(" · ")}</small>
              </div>
            ))}
          </div>
          <div className="endpoint-list">
            {activeDashboard.notificationEndpoints.map((endpoint) => (
              <div key={endpoint.id} className="endpoint-row">
                <div>
                  <strong>{endpoint.name}</strong>
                  <span>{endpoint.channel}</span>
                </div>
                <span>{endpoint.enabled ? endpoint.target : "Disabled"}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="stat-grid">
        <article className="stat-card accent-cyan">
          <span>Active vehicles</span>
          <strong>{liveVehicles.length}</strong>
          <p>Tenant-aware telemetry and role-gated operations.</p>
        </article>
        <article className="stat-card accent-amber">
          <span>Low battery alerts</span>
          <strong>{alerts.filter((alert) => alert.vehicleId).length}</strong>
          <p>Auto rerouting triggers below the recovery threshold.</p>
        </article>
        <article className="stat-card accent-lime">
          <span>Emissions saved</span>
          <strong>{formatNumber(carbonMetrics.emissionsSavedKg, 1)} kg</strong>
          <p>{formatNumber(emissionsTrend, 1)} kg trend across the selected window.</p>
        </article>
        <article className="stat-card accent-rose">
          <span>On-time delivery</span>
          <strong>{formatNumber(visibleHistory.at(-1)?.onTimeRate ?? 0, 0)}%</strong>
          <p>{onTimeTrend >= 0 ? "+" : ""}{formatNumber(onTimeTrend, 1)} pts versus window start.</p>
        </article>
      </section>

      <section className="workspace-grid">
        <div className="panel fleet-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">EV fleet management</p>
              <h2>Vehicles + route health</h2>
            </div>
            <span className="badge">{routeList.length} active routes</span>
          </div>

          <div className="vehicle-list">
            {filteredVehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                type="button"
                className={`vehicle-row ${selectedVehicle?.id === vehicle.id ? "vehicle-row-selected" : ""}`}
                onClick={() => setSelectedVehicleId(vehicle.id)}
              >
                <div className="vehicle-row-top">
                  <div>
                    <strong>{vehicle.name}</strong>
                    <span>{vehicle.model}</span>
                  </div>
                  <span className={`status-pill ${statusTone(vehicle.status)}`}>{vehicle.status}</span>
                </div>

                <div className="progress-block">
                  <div className="progress-label">
                    <span>State of charge</span>
                    <strong>{formatNumber(vehicle.batterySoc, 0)}%</strong>
                  </div>
                  <MeterBar value={vehicle.batterySoc} tone={vehicle.batterySoc <= 25 ? "warning" : "battery"} />
                </div>

                <div className="progress-block">
                  <div className="progress-label">
                    <span>Battery health</span>
                    <strong>{formatNumber(vehicle.batteryHealth, 0)}%</strong>
                  </div>
                  <MeterBar value={vehicle.batteryHealth} tone="grid" />
                </div>

                <div className="vehicle-row-meta">
                  <span>
                    {vehicle.packagesDelivered}/{vehicle.assignedPackages} deliveries
                  </span>
                  <span>{formatNumber(vehicle.etaMinutes, 0)} min ETA</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel map-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Map playback + station planning</p>
              <h2>Live monitoring</h2>
            </div>
            <span className="badge badge-strong">{playbackMode ? "Playback mode" : "Live mode"}</span>
          </div>

          <div className="timeline-toolbar">
            <button type="button" className="secondary-button" onClick={() => setPlaybackMode((current) => !current)}>
              {playbackMode ? "Use live feed" : "Open playback"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setTimelinePlaying((current) => !current)}
              disabled={!playbackMode}
            >
              {timelinePlaying ? "Pause timeline" : "Play timeline"}
            </button>
            <label className="timeline-range">
              <span>{playbackFrame ? `${playbackFrame.label} · ${formatDateTime(playbackFrame.timestamp)}` : "Current state"}</span>
              <input
                type="range"
                min="0"
                max={Math.max(0, activeDashboard.playbackFrames.length - 1)}
                value={timelineIndex}
                onChange={(event) => setTimelineIndex(Number(event.target.value))}
                disabled={!playbackMode}
              />
            </label>
          </div>

          <div className="map-frame">
            <svg className="map-svg" viewBox="0 0 100 100" role="img" aria-label="Fleet and station map">
              {Array.from({ length: 11 }, (_, index) => (
                <line key={`v-${index}`} className="map-grid-line" x1={index * 10} y1="0" x2={index * 10} y2="100" />
              ))}
              {Array.from({ length: 11 }, (_, index) => (
                <line key={`h-${index}`} className="map-grid-line" x1="0" y1={index * 10} x2="100" y2={index * 10} />
              ))}

              {plannedStations.map((station) => {
                const isFocused = station.id === focusStation?.id;

                return (
                  <g
                    key={station.id}
                    className={`map-station ${station.type === "swap" ? "map-station-swap" : "map-station-fast"} ${
                      isFocused ? "map-station-highlight" : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${station.name}, ${station.waitTimeMinutes} minute wait`}
                    onClick={() => setShowScenario((current) => current)}
                    onKeyDown={(event) => handleActionKey(event, () => setShowScenario((current) => current))}
                  >
                    <circle cx={station.x} cy={station.y} r="3.4" />
                    <circle cx={station.x} cy={station.y} r="5.8" className="map-station-ring" />
                    <text x={station.x} y={station.y + 1.1} textAnchor="middle" className="map-station-label">
                      {station.type === "swap" ? "SWP" : "CHG"}
                    </text>
                  </g>
                );
              })}

              {displayVehicles.map((vehicle) => {
                const isSelected = vehicle.id === selectedVehicle?.id;
                const recoveryStation = vehicle.recoveryStationId
                  ? plannedStations.find((station) => station.id === vehicle.recoveryStationId) ?? null
                  : null;

                return (
                  <g
                    key={vehicle.id}
                    className={`map-vehicle ${isSelected ? "map-vehicle-selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${vehicle.name}, battery ${formatNumber(vehicle.batterySoc, 0)} percent`}
                    onClick={() => setSelectedVehicleId(vehicle.id)}
                    onKeyDown={(event) => handleActionKey(event, () => setSelectedVehicleId(vehicle.id))}
                  >
                    {recoveryStation ? <circle cx={vehicle.x} cy={vehicle.y} r="5.5" className="map-vehicle-ring" /> : null}
                    <circle cx={vehicle.x} cy={vehicle.y} r="3.8" className="map-vehicle-core" />
                    <text x={vehicle.x} y={vehicle.y - 6} textAnchor="middle" className="map-vehicle-label">
                      {formatNumber(vehicle.batterySoc, 0)}%
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="map-footer">
            <div>
              <span>Focused vehicle</span>
              <strong>{selectedVehicle?.name ?? "No vehicle selected"}</strong>
            </div>
            <div>
              <span>Nearest compatible station</span>
              <strong>{focusStation?.name ?? "No station available"}</strong>
            </div>
            <div>
              <span>Playback emissions</span>
              <strong>{formatNumber(playbackMetrics.emissionsSavedKg, 1)} kg saved</strong>
            </div>
          </div>
        </div>

        <div className="panel insights-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Dispatch intelligence + ESG analytics</p>
              <h2>Decision support</h2>
            </div>
            <span className="badge">{dateRange} window</span>
          </div>

          <div className="metric-stack">
            <div>
              <span>Total miles</span>
              <strong>{formatNumber(carbonMetrics.totalMiles, 1)}</strong>
            </div>
            <div>
              <span>Cost saved</span>
              <strong>{formatCurrency(carbonMetrics.costSaved)}</strong>
            </div>
            <div>
              <span>Grid footprint</span>
              <strong>{formatNumber(carbonMetrics.gridEmissionsKg, 1)} kg</strong>
            </div>
            <div>
              <span>Diesel baseline</span>
              <strong>{formatNumber(carbonMetrics.dieselEmissionsKg, 1)} kg</strong>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <span>Baseline comparison</span>
              <strong>{formatNumber(carbonMetrics.emissionsSavedPercent, 0)}% below diesel</strong>
            </div>
            <div className="bar-row">
              <span>Diesel</span>
              <MeterBar value={100} tone="diesel" />
              <strong>{formatNumber(carbonMetrics.dieselEmissionsKg, 1)}</strong>
            </div>
            <div className="bar-row">
              <span>Grid</span>
              <MeterBar value={(carbonMetrics.gridEmissionsKg / Math.max(1, carbonMetrics.dieselEmissionsKg)) * 100} tone="grid" />
              <strong>{formatNumber(carbonMetrics.gridEmissionsKg, 1)}</strong>
            </div>
            <div className="bar-row">
              <span>Saved</span>
              <MeterBar value={(carbonMetrics.emissionsSavedKg / Math.max(1, carbonMetrics.dieselEmissionsKg)) * 100} tone="saved" />
              <strong>{formatNumber(carbonMetrics.emissionsSavedKg, 1)}</strong>
            </div>
          </div>

          <div className="dispatch-card">
            <div className="dispatch-header">
              <span>Auto-reassignment</span>
              <strong>Traffic, battery, and wait-aware route recommendations</strong>
            </div>
            <div className="dispatch-list">
              {dispatchPlan.map((item) => (
                <div key={item.routeId} className="dispatch-row">
                  <div>
                    <strong>{item.routeName}</strong>
                    <span>
                      {item.currentVehicleName} → {item.recommendedVehicleName}
                    </span>
                  </div>
                  <strong>{formatNumber(item.score, 0)}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel table-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Per-vehicle ESG proof</p>
              <h2>Vehicle breakdown</h2>
            </div>
            <span className="badge">{vehicleBreakdown.length} assets</span>
          </div>
          <div className="table-list">
            {vehicleBreakdown.map((vehicle) => (
              <div key={vehicle.id} className="table-row">
                <div>
                  <strong>{vehicle.name}</strong>
                  <span>{formatNumber(vehicle.gridFootprintKg, 1)} kg grid CO2</span>
                </div>
                <div>
                  <strong>{formatNumber(vehicle.emissionsSavedKg, 1)} kg</strong>
                  <span>{formatCurrency(vehicle.costSaved)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel table-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Per-route analytics</p>
              <h2>Route breakdown</h2>
            </div>
            <span className="badge">{routeBreakdown.length} lanes</span>
          </div>
          <div className="table-list">
            {routeBreakdown.map((route) => (
              <div key={route.id} className="table-row">
                <div>
                  <strong>{route.name}</strong>
                  <span>{route.priority} priority</span>
                </div>
                <div>
                  <strong>{formatNumber(route.emissionsSavedKg, 1)} kg</strong>
                  <span>{formatNumber(route.delayMinutes, 0)} min delay</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel table-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Station operations</p>
              <h2>Queue + SLA view</h2>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowScenario((current) => !current)}
              disabled={!permissions.canPlan}
            >
              {showScenario ? "Hide what-if station" : "Enable what-if station"}
            </button>
          </div>
          <div className="table-list">
            {stationMetrics.map((station) => (
              <div key={station.id} className="table-row">
                <div>
                  <strong>{station.name}</strong>
                  <span>{station.queueLength} vehicles queued</span>
                </div>
                <div>
                  <strong>{formatNumber(station.waitTimeMinutes, 0)} min</strong>
                  <span>{station.utilizationPercent}% util · {station.slaRisk}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
