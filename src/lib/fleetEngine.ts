import type {
  Alert,
  CarbonMetrics,
  DeliveryRoute,
  DispatchRecommendation,
  Point,
  Station,
  StationScenarioMetrics,
  StationType,
  TelemetryPoint,
  Vehicle,
  VehicleStatus,
} from "@/lib/fleetTypes";

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function moveTowards(origin: Point, target: Point, step: number): Point {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);

  if (length === 0 || step >= length) {
    return target;
  }

  return {
    x: origin.x + (dx / length) * step,
    y: origin.y + (dy / length) * step,
  };
}

function nearestStation(vehicle: Vehicle, stations: Station[], type: StationType): Station | null {
  const eligibleStations = stations.filter((station) => station.type === type);

  if (eligibleStations.length === 0) {
    return null;
  }

  return eligibleStations.reduce((closest, candidate) => {
    const currentDistance = distance({ x: vehicle.x, y: vehicle.y }, { x: candidate.x, y: candidate.y });
    const closestDistance = distance({ x: vehicle.x, y: vehicle.y }, { x: closest.x, y: closest.y });

    return currentDistance < closestDistance ? candidate : closest;
  });
}

function progressWaypointIndex(vehicle: Vehicle): number {
  return (vehicle.routeIndex + 1) % vehicle.route.length;
}

export function getNearestCompatibleStation(vehicle: Vehicle, stations: Station[]): Station | null {
  const recoveryType: StationType = vehicle.supportsSwap ? "swap" : "fast";
  return nearestStation(vehicle, stations, recoveryType);
}

export function advanceFleetState(vehicles: Vehicle[], stations: Station[]): Vehicle[] {
  return vehicles.map((vehicle) => {
    const recoveryStation = vehicle.recoveryStationId
      ? stations.find((station) => station.id === vehicle.recoveryStationId) ?? null
      : null;
    const intendedRecoveryType: StationType = vehicle.supportsSwap ? "swap" : "fast";
    const lowBattery = vehicle.batterySoc <= 20;
    const needsRecovery = lowBattery && !recoveryStation;
    const targetPoint = recoveryStation ? { x: recoveryStation.x, y: recoveryStation.y } : vehicle.route[vehicle.routeIndex];
    const speedBoost = vehicle.recoveryStationId ? 1.16 : 1;
    const nextPosition = moveTowards({ x: vehicle.x, y: vehicle.y }, targetPoint, vehicle.speed * speedBoost);
    const travelled = distance({ x: vehicle.x, y: vehicle.y }, nextPosition);
    const drainRate = vehicle.supportsSwap ? 0.46 : 0.36;
    const drainedBattery = Math.max(0, vehicle.batterySoc - travelled * drainRate);
    const mileage = vehicle.mileage + travelled * 2.2;
    const energyUsedKwh = vehicle.energyUsedKwh + travelled * (vehicle.supportsSwap ? 0.23 : 0.18);
    let status: VehicleStatus = vehicle.status;
    let recoveryStationId = vehicle.recoveryStationId;
    let routeIndex = vehicle.routeIndex;
    let packagesDelivered = vehicle.packagesDelivered;
    let batterySoc = drainedBattery;

    if (needsRecovery) {
      const station = nearestStation(vehicle, stations, intendedRecoveryType);

      if (station) {
        recoveryStationId = station.id;
        status = intendedRecoveryType === "swap" ? "Detouring to swap" : "Detouring to charger";
      }
    }

    if (recoveryStation && distance(nextPosition, targetPoint) < 1.3) {
      if (recoveryStation.type === "swap") {
        batterySoc = Math.min(95, batterySoc + 54);
        status = "Swapping battery";
      } else {
        batterySoc = Math.min(100, batterySoc + 22);
        status = "Fast charging";
      }
      recoveryStationId = null;
      routeIndex = progressWaypointIndex(vehicle);
      packagesDelivered = Math.min(vehicle.assignedPackages, packagesDelivered + 2);
    } else if (!recoveryStation && distance(nextPosition, targetPoint) < 1.2) {
      routeIndex = progressWaypointIndex(vehicle);
      packagesDelivered = Math.min(vehicle.assignedPackages, packagesDelivered + 1);
    }

    const nextEtaMinutes = Math.max(6, vehicle.etaMinutes + (lowBattery ? 4 : -1) + (vehicle.delayed ? 1 : 0));
    const delayed = nextEtaMinutes > 28;

    if (!recoveryStationId && batterySoc > 20 && !delayed) {
      status = "En route";
    } else if (delayed && !recoveryStationId) {
      status = "Delayed";
    } else if (recoveryStationId && recoveryStation) {
      status = recoveryStation.type === "swap" ? "Detouring to swap" : "Detouring to charger";
    }

    return {
      ...vehicle,
      x: nextPosition.x,
      y: nextPosition.y,
      batterySoc: Number(batterySoc.toFixed(1)),
      batteryHealth: Number(Math.max(82, vehicle.batteryHealth - travelled * 0.02).toFixed(1)),
      status,
      delayed,
      etaMinutes: nextEtaMinutes,
      recoveryStationId,
      routeIndex,
      mileage: Number(mileage.toFixed(1)),
      energyUsedKwh: Number(energyUsedKwh.toFixed(1)),
      packagesDelivered,
    };
  });
}

export function calculateCarbonMetrics(vehicles: Vehicle[]): CarbonMetrics {
  const totalMiles = vehicles.reduce((sum, vehicle) => sum + vehicle.mileage, 0);
  const totalEnergyKwh = vehicles.reduce((sum, vehicle) => sum + vehicle.energyUsedKwh, 0);
  const dieselEmissionsKg = totalMiles * 0.82;
  const gridEmissionsKg = totalMiles * 0.18;
  const emissionsSavedKg = dieselEmissionsKg - gridEmissionsKg;
  const emissionsSavedPercent = dieselEmissionsKg === 0 ? 0 : (emissionsSavedKg / dieselEmissionsKg) * 100;
  const dieselFuelCost = (totalMiles / 8.8) * 4.45;
  const evEnergyCost = totalEnergyKwh * 0.16;

  return {
    totalMiles,
    totalEnergyKwh,
    dieselEmissionsKg,
    gridEmissionsKg,
    emissionsSavedKg,
    emissionsSavedPercent,
    dieselFuelCost,
    evEnergyCost,
    costSaved: dieselFuelCost - evEnergyCost,
  };
}

export function createOperationalAlerts(vehicles: Vehicle[], stations: Station[], routes: DeliveryRoute[]): Alert[] {
  const lowBatteryAlerts: Alert[] = vehicles
    .filter((vehicle) => vehicle.batterySoc <= 22)
    .map<Alert>((vehicle) => ({
      id: `battery-${vehicle.id}`,
      tenantId: vehicle.tenantId,
      severity: vehicle.batterySoc <= 15 ? "high" : "medium",
      title: `${vehicle.name} battery intervention`,
      message: `${vehicle.name} is at ${vehicle.batterySoc.toFixed(0)}% SoC and needs recovery routing.`,
      channels: ["in-app", "email", "sms"],
      status: "open",
      vehicleId: vehicle.id,
      createdAt: new Date().toISOString(),
    }));

  const stationAlerts: Alert[] = stations
    .filter((station) => station.waitTimeMinutes >= station.slaTargetMinutes)
    .map<Alert>((station) => ({
      id: `station-${station.id}`,
      tenantId: station.tenantId,
      severity: station.waitTimeMinutes > station.slaTargetMinutes + 6 ? "high" : "medium",
      title: `${station.name} queue risk`,
      message: `${station.queueLength} vehicles are queued and wait time is ${station.waitTimeMinutes} minutes.`,
      channels: ["in-app", "webhook"],
      status: "open",
      stationId: station.id,
      createdAt: new Date().toISOString(),
    }));

  const routeAlerts: Alert[] = routes
    .filter((route) => route.trafficDelayMinutes >= 12)
    .map<Alert>((route) => ({
      id: `route-${route.id}`,
      tenantId: route.tenantId,
      severity: route.priority === "High" ? "high" : "low",
      title: `${route.name} route delay`,
      message: `${route.name} is carrying a ${route.priority.toLowerCase()} priority load with ${route.trafficDelayMinutes} minutes of delay.`,
      channels: ["in-app", "email", "webhook"],
      status: "open",
      routeId: route.id,
      createdAt: new Date().toISOString(),
    }));

  return [...lowBatteryAlerts, ...stationAlerts, ...routeAlerts];
}

function recommendationScore(vehicle: Vehicle, route: DeliveryRoute, station: Station | null): number {
  const batteryScore = vehicle.batterySoc * 0.55;
  const healthScore = vehicle.batteryHealth * 0.15;
  const priorityBonus = route.priority === "High" ? 14 : route.priority === "Medium" ? 8 : 3;
  const trafficPenalty = route.trafficDelayMinutes * 0.9;
  const waitPenalty = station ? station.waitTimeMinutes * 0.6 : 0;
  const delayPenalty = vehicle.delayed ? 10 : 0;

  return Number((batteryScore + healthScore + priorityBonus - trafficPenalty - waitPenalty - delayPenalty).toFixed(1));
}

export function createDispatchPlan(
  vehicles: Vehicle[],
  routes: DeliveryRoute[],
  stations: Station[],
): DispatchRecommendation[] {
  return routes.map((route) => {
    const currentVehicle = vehicles.find((vehicle) => vehicle.id === route.vehicleId) ?? vehicles[0];
    const recommendedVehicle =
      [...vehicles]
        .sort((left, right) => {
          const leftScore = recommendationScore(left, route, getNearestCompatibleStation(left, stations));
          const rightScore = recommendationScore(right, route, getNearestCompatibleStation(right, stations));
          return rightScore - leftScore;
        })
        .find((vehicle) => vehicle.batterySoc > 28) ?? currentVehicle;

    const score = recommendationScore(recommendedVehicle, route, getNearestCompatibleStation(recommendedVehicle, stations));
    const reason =
      recommendedVehicle.id === currentVehicle.id
        ? "Current assignment remains optimal for traffic, battery, and queue conditions."
        : `Auto-reassign to ${recommendedVehicle.name} to protect SLA under current traffic and battery constraints.`;

    return {
      routeId: route.id,
      routeName: route.name,
      currentVehicleName: currentVehicle.name,
      recommendedVehicleName: recommendedVehicle.name,
      priority: route.priority,
      score,
      reason,
    };
  });
}

export function buildStationScenarioMetrics(stations: Station[]): StationScenarioMetrics[] {
  return stations.map((station) => {
    const utilizationPercent = (station.activePorts / station.totalPorts) * 100;
    const slaRisk =
      station.waitTimeMinutes > station.slaTargetMinutes
        ? "breach"
        : station.waitTimeMinutes >= station.slaTargetMinutes - 4
          ? "watch"
          : "healthy";

    return {
      id: station.id,
      name: station.name,
      waitTimeMinutes: station.waitTimeMinutes,
      queueLength: station.queueLength,
      utilizationPercent: Number(utilizationPercent.toFixed(0)),
      slaRisk,
    };
  });
}

export function createHistoryPoint(timestamp: string, vehicles: Vehicle[]): TelemetryPoint {
  const metrics = calculateCarbonMetrics(vehicles);
  const delayedCount = vehicles.filter((vehicle) => vehicle.delayed).length;
  const lowBatteryVehicles = vehicles.filter((vehicle) => vehicle.batterySoc <= 22).length;
  const onTimeRate = vehicles.length === 0 ? 100 : ((vehicles.length - delayedCount) / vehicles.length) * 100;

  return {
    timestamp,
    totalMiles: Number(metrics.totalMiles.toFixed(1)),
    totalEnergyKwh: Number(metrics.totalEnergyKwh.toFixed(1)),
    dieselEmissionsKg: Number(metrics.dieselEmissionsKg.toFixed(1)),
    gridEmissionsKg: Number(metrics.gridEmissionsKg.toFixed(1)),
    emissionsSavedKg: Number(metrics.emissionsSavedKg.toFixed(1)),
    emissionsSavedPercent: Number(metrics.emissionsSavedPercent.toFixed(1)),
    costSaved: Number(metrics.costSaved.toFixed(1)),
    onTimeRate: Number(onTimeRate.toFixed(1)),
    lowBatteryVehicles,
  };
}
