import { advanceFleetState, createHistoryPoint } from "@/lib/fleetEngine";
import type {
  DashboardPreset,
  FleetDatabase,
  NotificationEndpoint,
  PlaybackFrame,
  Point,
  Station,
  Tenant,
  TenantDashboard,
  User,
  Vehicle,
} from "@/lib/fleetTypes";

function offsetRoute(route: Point[], dx: number, dy: number): Point[] {
  return route.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

function createTenant(id: string, name: string, city: string, region: string, timezone: string): Tenant {
  return {
    id,
    name,
    city,
    region,
    timezone,
    fleetTarget: 18,
    carbonTargetPercent: 62,
  };
}

function createVehicles(tenantId: string, city: string, dx: number, dy: number): Vehicle[] {
  return [
    {
      id: `${tenantId}-veh-1`,
      tenantId,
      city,
      name: "Atlas 01",
      model: "E-van",
      batterySoc: 82,
      batteryHealth: 95,
      status: "En route",
      x: 20 + dx,
      y: 80 + dy,
      speed: 1.8,
      mileage: 42,
      energyUsedKwh: 15.6,
      packagesDelivered: 9,
      assignedPackages: 14,
      etaMinutes: 19,
      delayed: false,
      supportsSwap: true,
      recoveryStationId: null,
      routeIndex: 1,
      currentRouteId: `${tenantId}-route-1`,
      route: offsetRoute(
        [{ x: 18, y: 84 }, { x: 34, y: 74 }, { x: 45, y: 61 }, { x: 58, y: 54 }, { x: 72, y: 30 }],
        dx,
        dy,
      ),
    },
    {
      id: `${tenantId}-veh-2`,
      tenantId,
      city,
      name: "Atlas 02",
      model: "E-cargo",
      batterySoc: 64,
      batteryHealth: 93,
      status: "En route",
      x: 22 + dx,
      y: 64 + dy,
      speed: 1.5,
      mileage: 31,
      energyUsedKwh: 11.2,
      packagesDelivered: 8,
      assignedPackages: 12,
      etaMinutes: 24,
      delayed: false,
      supportsSwap: false,
      recoveryStationId: null,
      routeIndex: 1,
      currentRouteId: `${tenantId}-route-2`,
      route: offsetRoute(
        [{ x: 18, y: 84 }, { x: 34, y: 58 }, { x: 51, y: 51 }, { x: 68, y: 45 }, { x: 92, y: 42 }],
        dx,
        dy,
      ),
    },
    {
      id: `${tenantId}-veh-3`,
      tenantId,
      city,
      name: "Atlas 03",
      model: "E-van",
      batterySoc: 27,
      batteryHealth: 91,
      status: "En route",
      x: 64 + dx,
      y: 18 + dy,
      speed: 1.95,
      mileage: 46,
      energyUsedKwh: 17.9,
      packagesDelivered: 11,
      assignedPackages: 13,
      etaMinutes: 31,
      delayed: true,
      supportsSwap: true,
      recoveryStationId: null,
      routeIndex: 2,
      currentRouteId: `${tenantId}-route-3`,
      route: offsetRoute(
        [{ x: 35, y: 18 }, { x: 52, y: 30 }, { x: 60, y: 41 }, { x: 70, y: 54 }, { x: 84, y: 72 }],
        dx,
        dy,
      ),
    },
    {
      id: `${tenantId}-veh-4`,
      tenantId,
      city,
      name: "Atlas 04",
      model: "E-sprinter",
      batterySoc: 91,
      batteryHealth: 97,
      status: "En route",
      x: 48 + dx,
      y: 52 + dy,
      speed: 1.35,
      mileage: 28,
      energyUsedKwh: 9.4,
      packagesDelivered: 6,
      assignedPackages: 11,
      etaMinutes: 16,
      delayed: false,
      supportsSwap: false,
      recoveryStationId: null,
      routeIndex: 1,
      currentRouteId: `${tenantId}-route-4`,
      route: offsetRoute([{ x: 48, y: 52 }, { x: 40, y: 44 }, { x: 32, y: 42 }, { x: 24, y: 36 }, { x: 20, y: 26 }], dx, dy),
    },
  ];
}

function createStations(tenantId: string, city: string, dx: number, dy: number): Station[] {
  return [
    {
      id: `${tenantId}-swap-1`,
      tenantId,
      city,
      name: "North Loop Swap",
      type: "swap",
      x: 28 + dx,
      y: 24 + dy,
      totalPorts: 12,
      activePorts: 9,
      queueLength: 2,
      waitTimeMinutes: 6,
      slaTargetMinutes: 12,
    },
    {
      id: `${tenantId}-swap-2`,
      tenantId,
      city,
      name: "Harbor Swap Hub",
      type: "swap",
      x: 76 + dx,
      y: 66 + dy,
      totalPorts: 9,
      activePorts: 8,
      queueLength: 3,
      waitTimeMinutes: 11,
      slaTargetMinutes: 12,
    },
    {
      id: `${tenantId}-fast-1`,
      tenantId,
      city,
      name: "Downtown Fast Hub",
      type: "fast",
      x: 60 + dx,
      y: 28 + dy,
      totalPorts: 16,
      activePorts: 13,
      queueLength: 4,
      waitTimeMinutes: 19,
      slaTargetMinutes: 16,
    },
    {
      id: `${tenantId}-fast-2`,
      tenantId,
      city,
      name: "West Grid Charge",
      type: "fast",
      x: 16 + dx,
      y: 56 + dy,
      totalPorts: 10,
      activePorts: 7,
      queueLength: 1,
      waitTimeMinutes: 9,
      slaTargetMinutes: 14,
    },
  ];
}

function createRoutes(tenantId: string): TenantDashboard["routes"] {
  return [
    {
      id: `${tenantId}-route-1`,
      tenantId,
      vehicleId: `${tenantId}-veh-1`,
      name: "Medical priority corridor",
      priority: "High",
      trafficDelayMinutes: 8,
      stopCount: 12,
      estimatedMiles: 41,
      promisedWindow: "08:30 - 10:00",
    },
    {
      id: `${tenantId}-route-2`,
      tenantId,
      vehicleId: `${tenantId}-veh-2`,
      name: "Retail replenishment",
      priority: "Medium",
      trafficDelayMinutes: 5,
      stopCount: 10,
      estimatedMiles: 29,
      promisedWindow: "09:00 - 11:30",
    },
    {
      id: `${tenantId}-route-3`,
      tenantId,
      vehicleId: `${tenantId}-veh-3`,
      name: "Harbor cold-chain",
      priority: "High",
      trafficDelayMinutes: 14,
      stopCount: 8,
      estimatedMiles: 38,
      promisedWindow: "10:15 - 12:00",
    },
    {
      id: `${tenantId}-route-4`,
      tenantId,
      vehicleId: `${tenantId}-veh-4`,
      name: "Campus parcels",
      priority: "Low",
      trafficDelayMinutes: 3,
      stopCount: 7,
      estimatedMiles: 24,
      promisedWindow: "11:00 - 13:00",
    },
  ];
}

function createPresets(city: string): DashboardPreset[] {
  return [
    {
      id: `${city.toLowerCase()}-preset-1`,
      name: "Battery escalations",
      city,
      search: "Atlas",
      statusFilter: "all",
      lowBatteryOnly: true,
      dateRange: "24h",
    },
    {
      id: `${city.toLowerCase()}-preset-2`,
      name: "Weekly ESG review",
      city: "all",
      search: "",
      statusFilter: "all",
      lowBatteryOnly: false,
      dateRange: "7d",
    },
  ];
}

function createNotificationEndpoints(tenantId: string): NotificationEndpoint[] {
  return [
    { id: `${tenantId}-endpoint-1`, tenantId, name: "Ops email", channel: "email", target: "ops@ecofleet.example", enabled: true },
    { id: `${tenantId}-endpoint-2`, tenantId, name: "Dispatch SMS", channel: "sms", target: "+1 (415) 555-0188", enabled: true },
    { id: `${tenantId}-endpoint-3`, tenantId, name: "Slack webhook", channel: "webhook", target: "https://hooks.slack.example/ev-fleet", enabled: true },
  ];
}

function createPlaybackFrames(vehicles: Vehicle[], stations: Station[]): PlaybackFrame[] {
  let nextVehicles = vehicles.map((vehicle) => ({ ...vehicle, route: vehicle.route.map((point) => ({ ...point })) }));

  return Array.from({ length: 8 }, (_, index) => {
    if (index > 0) {
      nextVehicles = advanceFleetState(nextVehicles, stations);
    }

    return {
      id: `frame-${index + 1}`,
      label: `T-${7 - index}`,
      timestamp: new Date(Date.now() - (7 - index) * 15 * 60 * 1000).toISOString(),
      vehicles: nextVehicles.map((vehicle) => ({ ...vehicle, route: vehicle.route.map((point) => ({ ...point })) })),
    };
  });
}

function createHistory(vehicles: Vehicle[], stations: Station[]) {
  let sampleVehicles = vehicles.map((vehicle) => ({ ...vehicle, route: vehicle.route.map((point) => ({ ...point })) }));

  return Array.from({ length: 30 }, (_, index) => {
    sampleVehicles = advanceFleetState(sampleVehicles, stations);
    const timestamp = new Date(Date.now() - (29 - index) * 24 * 60 * 60 * 1000).toISOString();
    return createHistoryPoint(timestamp, sampleVehicles);
  });
}

function createDashboard(tenant: Tenant, dx: number, dy: number): TenantDashboard {
  const vehicles = createVehicles(tenant.id, tenant.city, dx, dy);
  const stations = createStations(tenant.id, tenant.city, dx, dy);

  return {
    tenant,
    vehicles,
    stations,
    routes: createRoutes(tenant.id),
    alerts: [],
    history: createHistory(vehicles, stations),
    playbackFrames: createPlaybackFrames(vehicles, stations),
    presets: createPresets(tenant.city),
    notificationEndpoints: createNotificationEndpoints(tenant.id),
    candidateStation: {
      id: `${tenant.id}-candidate-fast`,
      tenantId: tenant.id,
      city: tenant.city,
      name: `${tenant.city} East Relief Hub`,
      type: "fast",
      x: 88 + dx,
      y: 34 + dy,
      totalPorts: 8,
      activePorts: 0,
      queueLength: 0,
      waitTimeMinutes: 4,
      slaTargetMinutes: 14,
    },
  };
}

export function buildSeedDatabase(): FleetDatabase {
  const tenants = [
    createTenant("tenant-sf", "EcoFleet West", "San Francisco", "West Coast", "America/Los_Angeles"),
    createTenant("tenant-ny", "EcoFleet East", "New York", "East Coast", "America/New_York"),
  ];

  const users: User[] = [
    { id: "user-1", tenantId: "tenant-sf", name: "Maya Dispatch", email: "maya@ecofleet.example", role: "dispatcher" },
    { id: "user-2", tenantId: "tenant-sf", name: "Jordan Ops", email: "jordan@ecofleet.example", role: "ops_manager" },
    { id: "user-3", tenantId: "tenant-sf", name: "Riley Admin", email: "riley@ecofleet.example", role: "admin" },
    { id: "user-4", tenantId: "tenant-sf", name: "Casey Client", email: "casey@client.example", role: "client_view" },
    { id: "user-5", tenantId: "tenant-ny", name: "Taylor Dispatch", email: "taylor@ecofleet.example", role: "dispatcher" },
    { id: "user-6", tenantId: "tenant-ny", name: "Morgan Ops", email: "morgan@ecofleet.example", role: "ops_manager" },
  ];

  return {
    users,
    dashboards: [createDashboard(tenants[0], 0, 0), createDashboard(tenants[1], -6, -4)],
  };
}
