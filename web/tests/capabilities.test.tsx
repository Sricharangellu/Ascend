/**
 * @vitest-environment jsdom
 *
 * CapabilitiesContext — the tenant layer of the four-layer access model.
 * Verifies the provider loads GET /api/v1/capabilities (served by the MSW
 * mock, which mirrors the real backend contract), that module/route gating
 * reflects the retail business pack, and that the checks fail open while
 * loading or when capabilities are unavailable.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CapabilitiesProvider,
  useCapabilities,
  invalidateCapabilitiesCache,
} from "@/contexts/CapabilitiesContext";

function Probe() {
  const { capabilities, loading, moduleEnabled, routeEnabled } = useCapabilities();
  if (loading || !capabilities) return <p>loading</p>;
  return (
    <div>
      <p>type:{capabilities.business.type}</p>
      <p>label:{capabilities.business.label}</p>
      <p>pos:{String(moduleEnabled("pos_terminal"))}</p>
      <p>tables:{String(moduleEnabled("tables"))}</p>
      <p>terminal-route:{String(routeEnabled("/terminal"))}</p>
      <p>floorplan-route:{String(routeEnabled("/restaurant/floor-plan"))}</p>
      <p>unknown-route:{String(routeEnabled("/some/unregistered/page"))}</p>
    </div>
  );
}

beforeEach(() => {
  invalidateCapabilitiesCache();
});

describe("CapabilitiesContext", () => {
  it("loads capabilities and gates modules/routes by the retail pack", async () => {
    render(
      <CapabilitiesProvider>
        <Probe />
      </CapabilitiesProvider>,
    );

    // Retail is the default business pack in the mock (as on a fresh tenant).
    expect(await screen.findByText("type:retail")).toBeInTheDocument();

    // Tenant module layer: retail bundle includes the POS terminal but not
    // restaurant table management.
    expect(screen.getByText("pos:true")).toBeInTheDocument();
    expect(screen.getByText("tables:false")).toBeInTheDocument();

    // Route gating follows the module registry's route ownership.
    expect(screen.getByText("terminal-route:true")).toBeInTheDocument();
    expect(screen.getByText("floorplan-route:false")).toBeInTheDocument();

    // Routes not owned by any module stay visible (conservative gating).
    expect(screen.getByText("unknown-route:true")).toBeInTheDocument();
  });

  it("fails open while loading", () => {
    let gates: { moduleEnabled: boolean; routeEnabled: boolean } | null = null;
    function LoadingProbe() {
      const { loading, moduleEnabled, routeEnabled } = useCapabilities();
      if (loading) {
        gates = {
          moduleEnabled: moduleEnabled("tables"),
          routeEnabled: routeEnabled("/restaurant/floor-plan"),
        };
      }
      return <p>{loading ? "loading" : "done"}</p>;
    }

    render(
      <CapabilitiesProvider>
        <LoadingProbe />
      </CapabilitiesProvider>,
    );

    // Captured during the loading render: everything must be treated as
    // enabled so the navigation never blanks while capabilities fetch.
    expect(gates).toEqual({ moduleEnabled: true, routeEnabled: true });
  });
});
