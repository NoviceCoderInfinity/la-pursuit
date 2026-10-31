"use client";

// Client-only (three.js). Import through next/dynamic with ssr:false.
import { useEffect, useMemo, useRef } from "react";
import Globe, { type GlobeMethods, type GlobeProps } from "react-globe.gl";
import { polygonToCells } from "h3-js";
import { MeshPhongMaterial, Color } from "three";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import countries110 from "world-atlas/countries-110m.json";
import { cssVar, useTheme } from "./ui";

const HEX_RES = 3;

// h3 throws on a few 110m polygons (e.g. North Korea), and one throw aborts the whole
// layer, so drop any shape it can't fill. Antarctica carries no market data anyway.
const fillable = (f: GeoJSON.Feature) => {
  const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  try {
    polys.forEach((p) => polygonToCells(p, HEX_RES, true));
    return true;
  } catch {
    return false;
  }
};
const LAND = (feature(countries110 as unknown as Topology, (countries110 as unknown as Topology).objects.countries) as unknown as GeoJSON.FeatureCollection)
  .features.filter((f) => f.properties?.name !== "Antarctica" && fillable(f));

export default function GlobeCanvas({
  autoRotate = false, rotateSpeed = 0.4, pov, interactive = true, ...props
}: GlobeProps & { autoRotate?: boolean; rotateSpeed?: number; pov?: { lat: number; lng: number; altitude: number }; interactive?: boolean }) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const theme = useTheme();

  // One material for the globe's lifetime; swapping it on a theme flip blanks the canvas.
  const material = useMemo(() => {
    const m = new MeshPhongMaterial();
    m.shininess = 0;
    m.emissiveIntensity = 0.6;
    return m;
  }, []);
  useEffect(() => {
    const c = cssVar("--globe") || "#0f1013";
    material.color = new Color(c);
    material.emissive = new Color(c);
    material.needsUpdate = true;
  }, [material, theme]);

  const dot = useMemo(() => cssVar("--globe-dot") || "rgba(237,237,237,0.26)", [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const c = g.controls();
    c.autoRotate = autoRotate;
    c.autoRotateSpeed = rotateSpeed;
    c.enableZoom = interactive;
    c.enableRotate = interactive;
  }, [autoRotate, rotateSpeed, interactive]);

  useEffect(() => {
    if (pov) ref.current?.pointOfView(pov, 1200);
  }, [pov]);

  return (
    <Globe
      ref={ref}
      backgroundColor="rgba(0,0,0,0)"
      globeMaterial={material}
      showAtmosphere
      atmosphereColor={theme === "dark" ? "#3b82f6" : "#9ec5f4"}
      atmosphereAltitude={0.12}
      hexPolygonsData={LAND}
      hexPolygonResolution={HEX_RES}
      hexPolygonMargin={0.55}
      hexPolygonUseDots
      hexPolygonColor={() => dot}
      onGlobeReady={() => {
        const g = ref.current;
        if (!g) return;
        const c = g.controls();
        c.autoRotate = autoRotate;
        c.autoRotateSpeed = rotateSpeed;
        c.enableZoom = interactive;
        c.enableRotate = interactive;
        if (pov) g.pointOfView(pov, 0);
      }}
      {...props}
    />
  );
}
