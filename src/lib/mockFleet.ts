export type StationType = "fast" | "swap";

export type VehicleStatus =
  | "En route"
  | "Detouring to swap"
  | "Detouring to charger"
  | "Swapping battery"
  | "Fast charging";

export type Point = {
  x: number;
  y: number;
};

export type Station = {
  id: string;
  name: string;
  type: StationType;
  x: number;
  y: number;
  capacity: string;
  waitTimeMinutes: number;
};

export type Vehicle = {
  id: string;
  name: string;
  model: string;
  batterySoc: number;
  status: VehicleStatus;
  x: number;
  y: number;
  speed: number;
  mileage: number;
  energyUsedKwh: number;
  packagesDelivered: number;
  assignedPackages: number;
  supportsSwap: boolean;
  recoveryStationId: string | null;
  routeIndex: number;
  route: Point[];
};

export type FleetState = {
  vehicles: Vehicle[];
  stations: Station[];
  lastUpdated: string;
};

export type CarbonMetrics = {
  totalMiles: number;
  totalEnergyKwh: number;
  dieselEmissionsKg: number;
  gridEmissionsKg: number;
  emissionsSavedKg: number;
  emissionsSavedPercent: number;
  dieselFuelCost: number;
  evEnergyCost: number;
  costSaved: number;
};

const cities = {
  depot: { x: 18, y: 84 },
  downtown: { x: 72, y: 30 },
  harbor: { x: 84, y: 72 },
  north: { x: 35, y: 18 },
  east: { x: 92, y: 42 },
};

export const stations: Station[] = [
  { id: "swap-1", name: "North Loop Swap", type: "swap", x: 28, y: 24, capacity: "12 bays", waitTimeMinutes: 4 },
  { id: "swap-2", name: "Harbor Swap Hub", type: "swap", x: 76, y: 66, capacity: "9 bays", waitTimeMinutes: 5 },
  { id: "fast-1", name: "Downtown Fast Hub", type: "fast", x: 60, y: 28, capacity: "16 ports", waitTimeMinutes: 18 },
  { id: "fast-2", name: "West Grid Charge", type: "fast", x: 16, y: 56, capacity: "10 ports", waitTimeMinutes: 22 },
];

export function createInitialFleetState(): FleetState {
  return {
    stations,
    lastUpdated: "Ready",
    vehicles: [
      {
        id: "veh-1",
        name: "Atlas 01",
        model: "E-van",
        batterySoc: 82,
        status: "En route",
        x: 20,
        y: 80,
        speed: 1.8,
        mileage: 42,
        energyUsedKwh: 15.6,
        packagesDelivered: 9,
        assignedPackages: 14,
        supportsSwap: true,
        recoveryStationId: null,
        routeIndex: 0,
        route: [cities.depot, { x: 34, y: 74 }, { x: 45, y: 61 }, { x: 58, y: 54 }, cities.downtown],
      },
      {
        id: "veh-2",
        name: "Atlas 02",
        model: "E-cargo",
        batterySoc: 64,
        status: "En route",
        x: 22,
        y: 64,
        speed: 1.5,
        mileage: 31,
        energyUsedKwh: 11.2,
        packagesDelivered: 8,
        assignedPackages: 12,
        supportsSwap: false,
        recoveryStationId: null,
        routeIndex: 0,
        route: [cities.depot, { x: 34, y: 58 }, { x: 51, y: 51 }, { x: 68, y: 45 }, cities.east],
      },
      {
        id: "veh-3",
        name: "Atlas 03",
        model: "E-van",
        batterySoc: 27,
        status: "En route",
        x: 64,
        y: 18,
        speed: 1.95,
        mileage: 46,
        energyUsedKwh: 17.9,
        packagesDelivered: 11,
        assignedPackages: 13,
        supportsSwap: true,
        recoveryStationId: null,
        routeIndex: 0,
        route: [cities.north, { x: 52, y: 30 }, { x: 60, y: 41 }, { x: 70, y: 54 }, cities.harbor],
      },
      {
        id: "veh-4",
        name: "Atlas 04",
        model: "E-sprinter",
        batterySoc: 91,
        status: "En route",
        x: 48,
        y: 52,
        speed: 1.35,
        mileage: 28,
        energyUsedKwh: 9.4,
        packagesDelivered: 6,
        assignedPackages: 11,
        supportsSwap: false,
        recoveryStationId: null,
        routeIndex: 0,
        route: [
          { x: 48, y: 52 },
          { x: 40, y: 44 },
          { x: 32, y: 42 },
          { x: 24, y: 36 },
          { x: 20, y: 26 },
        ],
      },
    ],
  };
}

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

function nearestStation(vehicle: Vehicle, stationsList: Station[], type: StationType): Station | null {
  const eligibleStations = stationsList.filter((station) => station.type === type);

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

export function advanceFleetState(state: FleetState): FleetState {
  const updatedVehicles = state.vehicles.map((vehicle) => {
    const recoveryStation = vehicle.recoveryStationId
      ? state.stations.find((station) => station.id === vehicle.recoveryStationId) ?? null
      : null;
    const intendedRecoveryType: StationType = vehicle.supportsSwap ? "swap" : "fast";
    const lowBattery = vehicle.batterySoc <= 20;
    const needsRecovery = lowBattery && !recoveryStation;
    const targetPoint = recoveryStation
      ? { x: recoveryStation.x, y: recoveryStation.y }
      : vehicle.route[vehicle.routeIndex] ?? vehicle.route[0];
    const speedBoost = vehicle.recoveryStationId ? 1.18 : 1;
    const nextPosition = moveTowards({ x: vehicle.x, y: vehicle.y }, targetPoint, vehicle.speed * speedBoost);
    const travelled = distance({ x: vehicle.x, y: vehicle.y }, nextPosition);
    const drainRate = vehicle.supportsSwap ? 0.5 : 0.38;
    const drainedBattery = Math.max(0, vehicle.batterySoc - travelled * drainRate);
    const mileage = vehicle.mileage + travelled * 2.4;
    const energyUsedKwh = vehicle.energyUsedKwh + travelled * (vehicle.supportsSwap ? 0.24 : 0.19);
    let status: VehicleStatus = vehicle.status;
    let recoveryStationId = vehicle.recoveryStationId;
    let routeIndex = vehicle.routeIndex;
    let packagesDelivered = vehicle.packagesDelivered;
    let batterySoc = drainedBattery;

    if (needsRecovery) {
      const station = nearestStation(vehicle, state.stations, intendedRecoveryType);

      if (station) {
        recoveryStationId = station.id;
        status = intendedRecoveryType === "swap" ? "Detouring to swap" : "Detouring to charger";
      }
    }

    if (recoveryStation && distance(nextPosition, targetPoint) < 1.5) {
      if (recoveryStation.type === "swap") {
        batterySoc = Math.min(96, batterySoc + 56);
        status = "Swapping battery";
      } else {
        batterySoc = Math.min(100, batterySoc + 24);
        status = "Fast charging";
      }
      recoveryStationId = null;
      routeIndex = progressWaypointIndex(vehicle);
      packagesDelivered = Math.min(vehicle.assignedPackages, packagesDelivered + 2);
    } else if (!recoveryStation && distance(nextPosition, targetPoint) < 1.2) {
      routeIndex = progressWaypointIndex(vehicle);
      packagesDelivered = Math.min(vehicle.assignedPackages, packagesDelivered + 1);
    }

    if (!recoveryStationId && batterySoc > 20 && status === vehicle.status) {
      status = "En route";
    }

    if (recoveryStationId && recoveryStation) {
      status = recoveryStation.type === "swap" ? "Detouring to swap" : "Detouring to charger";
    }

    return {
      ...vehicle,
      x: nextPosition.x,
      y: nextPosition.y,
      batterySoc: Number(batterySoc.toFixed(1)),
      status,
      recoveryStationId,
      routeIndex,
      mileage: Number(mileage.toFixed(1)),
      energyUsedKwh: Number(energyUsedKwh.toFixed(1)),
      packagesDelivered,
    };
  });

  return {
    ...state,
    vehicles: updatedVehicles,
    lastUpdated: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

export function getNearestCompatibleStation(vehicle: Vehicle, stationsList: Station[]): Station | null {
  const recoveryType: StationType = vehicle.supportsSwap ? "swap" : "fast";
  return nearestStation(vehicle, stationsList, recoveryType);
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
