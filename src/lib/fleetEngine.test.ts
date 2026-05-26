import assert from "node:assert/strict";
import test from "node:test";
import { advanceFleetState, calculateCarbonMetrics, createDispatchPlan, createOperationalAlerts } from "@/lib/fleetEngine";
import { buildSeedDatabase } from "@/lib/fleetSeed";

test("advanceFleetState detours low battery vehicles to recovery", () => {
  const database = buildSeedDatabase();
  const dashboard = database.dashboards[0];
  const lowBatteryVehicle = {
    ...dashboard.vehicles[0],
    batterySoc: 15,
    recoveryStationId: null,
  };

  const [updatedVehicle] = advanceFleetState([lowBatteryVehicle], dashboard.stations);

  assert.equal(updatedVehicle.recoveryStationId !== null, true);
  assert.match(updatedVehicle.status, /Detouring/);
});

test("calculateCarbonMetrics keeps EV emissions below diesel baseline", () => {
  const database = buildSeedDatabase();
  const metrics = calculateCarbonMetrics(database.dashboards[0].vehicles);

  assert.equal(metrics.dieselEmissionsKg > metrics.gridEmissionsKg, true);
  assert.equal(metrics.emissionsSavedKg > 0, true);
  assert.equal(metrics.costSaved > 0, true);
});

test("createDispatchPlan recommends a battery-healthy asset for stressed routes", () => {
  const database = buildSeedDatabase();
  const dashboard = database.dashboards[0];
  const stressedVehicles = dashboard.vehicles.map((vehicle, index) =>
    index === 2
      ? {
          ...vehicle,
          batterySoc: 16,
          delayed: true,
        }
      : vehicle,
  );

  const recommendations = createDispatchPlan(stressedVehicles, dashboard.routes, dashboard.stations);
  const targetRoute = recommendations.find((route) => route.routeId === `${dashboard.tenant.id}-route-3`);

  assert.ok(targetRoute);
  assert.notEqual(targetRoute.recommendedVehicleName, targetRoute.currentVehicleName);
});

test("createOperationalAlerts emits vehicle, station, and route alerts", () => {
  const database = buildSeedDatabase();
  const dashboard = database.dashboards[0];
  const alerts = createOperationalAlerts(
    dashboard.vehicles.map((vehicle, index) => (index === 0 ? { ...vehicle, batterySoc: 14 } : vehicle)),
    dashboard.stations,
    dashboard.routes,
  );

  assert.equal(alerts.some((alert) => alert.vehicleId), true);
  assert.equal(alerts.some((alert) => alert.stationId), true);
  assert.equal(alerts.some((alert) => alert.routeId), true);
});
