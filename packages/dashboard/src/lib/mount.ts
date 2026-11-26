import { mount, unmount } from "svelte";
import Dashboard, { type DashboardProps } from "./Dashboard.svelte";

export interface MountedDashboard {
  destroy(): void;
}

/** Render the results dashboard into a DOM element, for apps that don't use Svelte themselves. */
export function mountDashboard(target: Element, props: DashboardProps): MountedDashboard {
  const app = mount(Dashboard, { target, props });
  return { destroy: () => void unmount(app) };
}
