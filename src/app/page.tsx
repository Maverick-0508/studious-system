"use client";

import { useEffect, useMemo, useState } from "react";
import {
  advanceFleetState,
  calculateCarbonMetrics,
  createInitialFleetState,
  getNearestCompatibleStation,
  type Vehicle,
} from "@/lib/mockFleet";

const emissionBars = [
  { label: "Diesel fleet", valueKey: "diesel" as const },
  { label: "EV fleet", valueKey: "grid" as const },
  { label: "Saved", valueKey: "saved" as const },
];

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

function statusTone(status: Vehicle["status"]): string {
  if (status === "Detouring to swap" || status === "Detouring to charger") {
    return "status-warning";
  }

  if (status === "Swapping battery" || status === "Fast charging") {
    return "status-success";
  }

  return "status-neutral";
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function MeterBar({ value, tone }: { value: number; tone: "battery" | "diesel" | "grid" | "saved" }) {
  const fillClass =
    tone === "battery"
      ? "meter-fill meter-battery"
      : tone === "diesel"
        ? "meter-fill meter-diesel"
        : tone === "grid"
          ? "meter-fill meter-grid"
          : "meter-fill meter-saved";

  return (
    <svg className="meter" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
      <rect className="meter-track" x="0" y="0" width="100" height="10" rx="5" />
      <rect className={fillClass} x="0" y="0" width={Math.max(6, Math.min(100, value))} height="10" rx="5" />
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

export default function Home() {
  const [fleetState, setFleetState] = useState(() => createInitialFleetState());
  const [selectedVehicleId, setSelectedVehicleId] = useState(fleetState.vehicles[0].id);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("ecofleet-theme");

    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      return;
    }

    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    setTheme(prefersLight ? "light" : "dark");
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("ecofleet-theme", theme);
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFleetState((currentState) => advanceFleetState(currentState));
    }, 1800);

    return () => window.clearInterval(timer);
  }, []);

  const carbonMetrics = useMemo(() => calculateCarbonMetrics(fleetState.vehicles), [fleetState.vehicles]);
  const selectedVehicle = fleetState.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? fleetState.vehicles[0];
  const focusStation = getNearestCompatibleStation(selectedVehicle, fleetState.stations);
  const lowBatteryVehicles = fleetState.vehicles.filter((vehicle) => vehicle.batterySoc <= 20);
  const topDispatches = [...fleetState.vehicles].sort((left, right) => right.batterySoc - left.batterySoc);
  const emissionChartMax = Math.max(carbonMetrics.dieselEmissionsKg, carbonMetrics.gridEmissionsKg);
  const focusTransform = `translate(${Math.max(-28, 50 - selectedVehicle.x)} ${Math.max(-28, 50 - selectedVehicle.y)}) scale(1.08)`;

  const exportReport = () => {
    const lines = [
      ["Metric", "Value"],
      ["Total miles", formatNumber(carbonMetrics.totalMiles, 1)],
      ["EV energy used (kWh)", formatNumber(carbonMetrics.totalEnergyKwh, 1)],
      ["Diesel emissions (kg CO2)", formatNumber(carbonMetrics.dieselEmissionsKg, 1)],
      ["Grid emissions (kg CO2)", formatNumber(carbonMetrics.gridEmissionsKg, 1)],
      ["Emissions saved (kg CO2)", formatNumber(carbonMetrics.emissionsSavedKg, 1)],
      ["Cost saved", formatCurrency(carbonMetrics.costSaved)],
    ]
      .map((row) => row.join(","))
      .join("\n");

    downloadTextFile("ecofleet-carbon-dashboard.csv", lines);
  };

  return (
    <main className="shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">EcoFleet OS</p>
          <h1>One platform for EV fleet operations, charging intelligence, and ESG proof.</h1>
          <p className="hero-copy">
            Dispatch fifty deliveries, monitor battery health in real time, intercept low-charge vans with the nearest
            compatible swap station, and export a carbon report clients can actually trust.
          </p>
        </div>

        <div className="hero-actions">
          <button type="button" className="primary-button" onClick={exportReport}>
            Export carbon report
          </button>
          <div className="hero-meta">
            <span>Live sync</span>
            <strong>{fleetState.lastUpdated}</strong>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="theme-fab"
        onClick={() => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        <ThemeIcon theme={theme} />
      </button>

      <section className="stat-grid">
        <article className="stat-card accent-cyan">
          <span>Active vehicles</span>
          <strong>{fleetState.vehicles.length}</strong>
          <p>Unified fleet telemetry across the city.</p>
        </article>
        <article className="stat-card accent-amber">
          <span>Low battery alerts</span>
          <strong>{lowBatteryVehicles.length}</strong>
          <p>Automatic intervention at 20% SoC.</p>
        </article>
        <article className="stat-card accent-lime">
          <span>Emissions saved</span>
          <strong>{formatNumber(carbonMetrics.emissionsSavedKg, 1)} kg</strong>
          <p>{formatNumber(carbonMetrics.emissionsSavedPercent, 0)}% below diesel baseline.</p>
        </article>
        <article className="stat-card accent-rose">
          <span>Cost avoided</span>
          <strong>{formatCurrency(carbonMetrics.costSaved)}</strong>
          <p>Electric miles beat fuel spend and idle time.</p>
        </article>
      </section>

      <section className="workspace-grid">
        <div className="panel fleet-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">EV fleet management</p>
              <h2>Active vehicles</h2>
            </div>
            <span className="badge">50 packages on deck</span>
          </div>

          <div className="vehicle-list">
            {fleetState.vehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                type="button"
                className={`vehicle-row ${selectedVehicle.id === vehicle.id ? "vehicle-row-selected" : ""}`}
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
                  <MeterBar value={vehicle.batterySoc} tone="battery" />
                </div>

                <div className="vehicle-row-meta">
                  <span>{vehicle.packagesDelivered}/{vehicle.assignedPackages} deliveries</span>
                  <span>{formatNumber(vehicle.mileage, 1)} mi</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel map-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Live monitoring</p>
              <h2>Map + station interception</h2>
            </div>
            <span className="badge badge-strong">Detour logic active</span>
          </div>

          <div className="map-frame">
            <svg className="map-svg" viewBox="0 0 100 100" role="img" aria-label="EcoFleet city map">
              <g transform={focusTransform}>
                {Array.from({ length: 11 }, (_, index) => (
                  <line key={`v-${index}`} className="map-grid-line" x1={index * 10} y1="0" x2={index * 10} y2="100" />
                ))}
                {Array.from({ length: 11 }, (_, index) => (
                  <line key={`h-${index}`} className="map-grid-line" x1="0" y1={index * 10} x2="100" y2={index * 10} />
                ))}
                <circle className="map-glow map-glow-one" cx="20" cy="12" r="11" />
                <circle className="map-glow map-glow-two" cx="82" cy="76" r="13" />

                {fleetState.stations.map((station) => {
                  const isCompatible = station.id === focusStation?.id;

                  return (
                    <g
                      key={station.id}
                      className={`map-station ${station.type === "swap" ? "map-station-swap" : "map-station-fast"} ${
                        isCompatible ? "map-station-highlight" : ""
                      }`}
                      onClick={() => setSelectedVehicleId(selectedVehicle.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <circle cx={station.x} cy={station.y} r="3.4" />
                      <circle cx={station.x} cy={station.y} r="5.9" className="map-station-ring" />
                      <text x={station.x} y={station.y + 1.1} textAnchor="middle" className="map-station-label">
                        {station.type === "swap" ? "SWP" : "CHG"}
                      </text>
                    </g>
                  );
                })}

                {fleetState.vehicles.map((vehicle) => {
                  const isSelected = vehicle.id === selectedVehicle.id;
                  const recoveryStation = vehicle.recoveryStationId
                    ? fleetState.stations.find((station) => station.id === vehicle.recoveryStationId) ?? null
                    : null;

                  return (
                    <g
                      key={vehicle.id}
                      className={`map-vehicle ${isSelected ? "map-vehicle-selected" : ""}`}
                      onClick={() => setSelectedVehicleId(vehicle.id)}
                      role="button"
                      tabIndex={0}
                    >
                      {recoveryStation ? <circle cx={vehicle.x} cy={vehicle.y} r="5.6" className="map-vehicle-ring" /> : null}
                      <circle cx={vehicle.x} cy={vehicle.y} r="3.8" className="map-vehicle-core" />
                      <text x={vehicle.x} y={vehicle.y - 6} textAnchor="middle" className="map-vehicle-label">
                        {formatNumber(vehicle.batterySoc, 0)}%
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="map-footer">
            <div>
              <span>Focused vehicle</span>
              <strong>{selectedVehicle.name}</strong>
            </div>
            <div>
              <span>Nearest compatible station</span>
              <strong>{focusStation?.name ?? "No station available"}</strong>
            </div>
            <div>
              <span>Route status</span>
              <strong>{selectedVehicle.status}</strong>
            </div>
          </div>
        </div>

        <div className="panel insights-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Carbon footprint calculator</p>
              <h2>ESG proof for clients</h2>
            </div>
            <span className="badge">CO2 savings dashboard</span>
          </div>

          <div className="carbon-summary">
            <div className="metric-stack">
              <div>
                <span>Total miles</span>
                <strong>{formatNumber(carbonMetrics.totalMiles, 1)}</strong>
              </div>
              <div>
                <span>EV energy</span>
                <strong>{formatNumber(carbonMetrics.totalEnergyKwh, 1)} kWh</strong>
              </div>
            </div>
            <div className="metric-stack">
              <div>
                <span>Diesel baseline</span>
                <strong>{formatNumber(carbonMetrics.dieselEmissionsKg, 1)} kg CO2</strong>
              </div>
              <div>
                <span>Grid footprint</span>
                <strong>{formatNumber(carbonMetrics.gridEmissionsKg, 1)} kg CO2</strong>
              </div>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <span>Comparison</span>
              <strong>{formatNumber(carbonMetrics.emissionsSavedKg, 1)} kg saved</strong>
            </div>
            <div className="chart-bars">
              {emissionBars.map((bar) => {
                const value =
                  bar.valueKey === "diesel"
                    ? carbonMetrics.dieselEmissionsKg
                    : bar.valueKey === "grid"
                      ? carbonMetrics.gridEmissionsKg
                      : carbonMetrics.emissionsSavedKg;
                return (
                  <div key={bar.label} className="bar-row">
                    <span>{bar.label}</span>
                    <MeterBar value={(value / emissionChartMax) * 100} tone={bar.valueKey} />
                    <strong>{formatNumber(value, 1)}</strong>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dispatch-card">
            <div className="dispatch-header">
              <span>Route optimization</span>
              <strong>Best-fit assignments by battery health</strong>
            </div>
            <div className="dispatch-list">
              {topDispatches.map((vehicle, index) => (
                <div key={vehicle.id} className="dispatch-row">
                  <div>
                    <strong>{index + 1}. {vehicle.name}</strong>
                    <span>{vehicle.assignedPackages} packages</span>
                  </div>
                  <strong>{formatNumber(vehicle.batterySoc, 0)}%</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
