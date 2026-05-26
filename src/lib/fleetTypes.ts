export type Role = "dispatcher" | "ops_manager" | "admin" | "client_view";

export type DateRange = "24h" | "7d" | "30d";

export type StationType = "fast" | "swap";

export type Priority = "High" | "Medium" | "Low";

export type AlertSeverity = "high" | "medium" | "low";

export type NotificationChannel = "in-app" | "email" | "sms" | "webhook";

export type VehicleStatus =
  | "En route"
  | "Detouring to swap"
  | "Detouring to charger"
  | "Swapping battery"
  | "Fast charging"
  | "Delayed";

export type Point = {
  x: number;
  y: number;
};

export type Tenant = {
  id: string;
  name: string;
  city: string;
  region: string;
  timezone: string;
  fleetTarget: number;
  carbonTargetPercent: number;
};

export type User = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
};

export type Station = {
  id: string;
  tenantId: string;
  city: string;
  name: string;
  type: StationType;
  x: number;
  y: number;
  totalPorts: number;
  activePorts: number;
  queueLength: number;
  waitTimeMinutes: number;
  slaTargetMinutes: number;
};

export type Vehicle = {
  id: string;
  tenantId: string;
  city: string;
  name: string;
  model: string;
  batterySoc: number;
  batteryHealth: number;
  status: VehicleStatus;
  x: number;
  y: number;
  speed: number;
  mileage: number;
  energyUsedKwh: number;
  packagesDelivered: number;
  assignedPackages: number;
  etaMinutes: number;
  delayed: boolean;
  supportsSwap: boolean;
  recoveryStationId: string | null;
  routeIndex: number;
  route: Point[];
  currentRouteId: string | null;
};

export type DeliveryRoute = {
  id: string;
  tenantId: string;
  vehicleId: string;
  name: string;
  priority: Priority;
  trafficDelayMinutes: number;
  stopCount: number;
  estimatedMiles: number;
  promisedWindow: string;
};

export type Alert = {
  id: string;
  tenantId: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  channels: NotificationChannel[];
  status: "open" | "acknowledged";
  vehicleId?: string;
  stationId?: string;
  routeId?: string;
  createdAt: string;
};

export type NotificationEndpoint = {
  id: string;
  tenantId: string;
  name: string;
  channel: Exclude<NotificationChannel, "in-app">;
  target: string;
  enabled: boolean;
};

export type DashboardPreset = {
  id: string;
  name: string;
  city: string | "all";
  search: string;
  statusFilter: VehicleStatus | "all";
  lowBatteryOnly: boolean;
  dateRange: DateRange;
};

export type TelemetryPoint = {
  timestamp: string;
  totalMiles: number;
  totalEnergyKwh: number;
  dieselEmissionsKg: number;
  gridEmissionsKg: number;
  emissionsSavedKg: number;
  emissionsSavedPercent: number;
  costSaved: number;
  onTimeRate: number;
  lowBatteryVehicles: number;
};

export type PlaybackFrame = {
  id: string;
  label: string;
  timestamp: string;
  vehicles: Vehicle[];
};

export type TenantDashboard = {
  tenant: Tenant;
  vehicles: Vehicle[];
  stations: Station[];
  routes: DeliveryRoute[];
  alerts: Alert[];
  history: TelemetryPoint[];
  playbackFrames: PlaybackFrame[];
  presets: DashboardPreset[];
  notificationEndpoints: NotificationEndpoint[];
  candidateStation: Station;
};

export type FleetDatabase = {
  users: User[];
  dashboards: TenantDashboard[];
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

export type DispatchRecommendation = {
  routeId: string;
  routeName: string;
  currentVehicleName: string;
  recommendedVehicleName: string;
  priority: Priority;
  score: number;
  reason: string;
};

export type StationScenarioMetrics = {
  id: string;
  name: string;
  waitTimeMinutes: number;
  queueLength: number;
  slaRisk: "healthy" | "watch" | "breach";
  utilizationPercent: number;
};
