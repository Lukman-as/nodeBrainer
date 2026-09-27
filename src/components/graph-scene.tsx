"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  Expand,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Minus,
  Plus,
} from "lucide-react";
import { edgeAppearance, layoutGraph } from "@/lib/graph-layout";
import type { GraphProps } from "./knowledge-graph";
const colors = {
  note: "#b8e89f",
  pdf: "#e7b390",
  image: "#c2a5f1",
  video: "#90c7f4",
  link: "#e3d08d",
};
// Obsidian-style: nodes take their cluster's colour (largest cluster first); a node in no group
// keeps its content-type colour.
const clusterColors = [
  "#5fd4a0", "#f2a65a", "#8fa8ff", "#f27ea9", "#e8d45c",
  "#6fd3e8", "#c792ea", "#ff8c73", "#9be36b", "#d9a5ff",
];
type Hover = { title: string; detail: string; x: number; y: number } | null;
export function GraphScene({
  items,
  edges,
  selectedId,
  onSelect,
  highlighted = [],
  large = false,
}: GraphProps) {
  const container = useRef<HTMLDivElement>(null),
    mount = useRef<HTMLDivElement>(null);
  const current = useRef({
    selectedId,
    onSelect,
    highlighted,
    spinning: false,
  });
  const controlsRef = useRef<OrbitControls | null>(null);
  const [hover, setHover] = useState<Hover>(null),
    [failure, setFailure] = useState("");
  const [spinning, setSpinning] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [threshold, setThreshold] = useState(0),
    [focus, setFocus] = useState("");
  useEffect(() => {
    current.current = { selectedId, onSelect, highlighted, spinning };
    if (controlsRef.current) controlsRef.current.autoRotate = spinning;
  }, [selectedId, onSelect, highlighted, spinning]);
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  const openSource = useCallback((id: string) => {
    const open = () => current.current.onSelect(id);
    if (document.fullscreenElement === container.current)
      void document.exitFullscreen().then(open, open);
    else open();
  }, []);
  const positions = useMemo(() => layoutGraph(items, edges), [items, edges]);
  const visibleEdges = useMemo(
    () => edges.filter((e) => e.weight >= threshold).slice(0, 1200),
    [edges, threshold],
  );
  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() =>
        setFailure(
          "3D is unavailable. Enable hardware acceleration, or use the source list below.",
        ),
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor("#0d1718", 1);
    renderer.domElement.setAttribute(
      "aria-label",
      "3D knowledge graph. Drag to orbit, scroll to zoom, right-drag to pan. Use the source list below for keyboard access.",
    );
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#0d1718", 0.0025);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1500);
    camera.position.set(40, 24, 190);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 35;
    controls.maxDistance = 480;
    controls.autoRotateSpeed = 0.45;
    controls.autoRotate = current.current.spinning;
    controlsRef.current = controls;
    const graph = new THREE.Group();
    scene.add(graph);
    const sphere = new THREE.SphereGeometry(1, 20, 16);
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 64;
    const ctx = glowCanvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    // Neutral white: the sprite colour (the node's cluster) sets the halo's hue.
    gradient.addColorStop(0, "rgba(255,255,255,.8)");
    gradient.addColorStop(0.2, "rgba(255,255,255,.3)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(glowCanvas);
    const nodeMeshes: THREE.Mesh<
      THREE.SphereGeometry,
      THREE.MeshBasicMaterial
    >[] = [];
    const edgeObjects: (THREE.Mesh | THREE.Line)[] = [];
    const points = new Map(
      positions.map((p) => [p.id, new THREE.Vector3(p.x, p.y, p.z)]),
    );
    const counts = new Map(
      items.map((item) => [
        item.id,
        edges.filter((e) => e.source === item.id || e.target === item.id)
          .length,
      ]),
    );
    const clusterOf = new Map(positions.map((p) => [p.id, p.cluster]));
    const clusterSize = new Map<number, number>();
    for (const c of clusterOf.values())
      clusterSize.set(c, (clusterSize.get(c) ?? 0) + 1);
    for (const item of items) {
      const cluster = clusterOf.get(item.id) ?? 0;
      const tint =
        (clusterSize.get(cluster) ?? 1) > 1
          ? clusterColors[cluster % clusterColors.length]
          : colors[item.type];
      const mesh = new THREE.Mesh(
        sphere,
        new THREE.MeshBasicMaterial({
          color: tint,
          transparent: true,
        }),
      );
      mesh.position.copy(points.get(item.id)!);
      const size = 2 + Math.min(2, Math.sqrt(counts.get(item.id) || 0) * 0.55);
      mesh.scale.setScalar(size);
      mesh.userData = { item, size };
      graph.add(mesh);
      nodeMeshes.push(mesh);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          color: tint,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.add(glow);
      glow.scale.setScalar(6);
    }
    for (const edge of visibleEdges) {
      const a = points.get(edge.source),
        b = points.get(edge.target);
      if (!a || !b) continue;
      const style = edgeAppearance(edge.weight),
        mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += 5;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      let object: THREE.Mesh | THREE.Line;
      if (style.dashed) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(30)),
          new THREE.LineDashedMaterial({
            color: style.color,
            transparent: true,
            opacity: style.opacity,
            dashSize: 1.3,
            gapSize: 1.6,
          }),
        );
        line.computeLineDistances();
        object = line;
      } else
        object = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 24, style.radius, 5, false),
          new THREE.MeshBasicMaterial({
            color: style.color,
            transparent: true,
            opacity: style.opacity,
          }),
        );
      object.userData = { edge, baseOpacity: style.opacity };
      graph.add(object);
      edgeObjects.push(object);
    }
    // Decorative cortical contours, not additional data nodes or relationships.
    const shell = new THREE.Group();
    shell.rotation.z = -0.09;
    scene.add(shell);
    for (const side of [-1, 1])
      for (let band = 0; band < 12; band++) {
        const latitude = -Math.PI / 2 + ((band + 0.5) * Math.PI) / 12,
          points: THREE.Vector3[] = [];
        for (let j = 0; j <= 100; j++) {
          const angle = (j * Math.PI * 2) / 100,
            ripple = 1 + 0.035 * Math.sin(angle * 9 + band);
          points.push(
            new THREE.Vector3(
              side * 25 + 33 * Math.cos(latitude) * Math.cos(angle) * ripple,
              49 * Math.sin(latitude),
              44 * Math.cos(latitude) * Math.sin(angle) * ripple,
            ),
          );
        }
        shell.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({
              color: "#5b987d",
              transparent: true,
              opacity: 0.085,
              depthWrite: false,
            }),
          ),
        );
      }
    const resize = () => {
      const width = host.clientWidth,
        height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 1.3 };
    const pointer = new THREE.Vector2();
    let hoveredId = "",
      hoverEdge = "",
      dragging = false,
      downX = 0,
      downY = 0;
    function hit(event: PointerEvent) {
      const box = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        (-(event.clientY - box.top) / box.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return {
        node: raycaster.intersectObjects(nodeMeshes, false)[0]?.object,
        edge: raycaster.intersectObjects(edgeObjects, false)[0]?.object,
        box,
      };
    }
    const move = (event: PointerEvent) => {
      if (
        event.buttons &&
        Math.hypot(event.clientX - downX, event.clientY - downY) > 5
      )
        dragging = true;
      if (dragging) {
        setHover(null);
        hoveredId = "";
        hoverEdge = "";
        return;
      }
      const { node, edge, box } = hit(event);
      hoveredId = node?.userData.item.id || "";
      hoverEdge = edge
        ? `${edge.userData.edge.source}:${edge.userData.edge.target}`
        : "";
      renderer.domElement.style.cursor = node ? "pointer" : "grab";
      const coordinates = {
        x: Math.max(
          8,
          Math.min(event.clientX - box.left + 12, box.width - 200),
        ),
        y: Math.max(8, Math.min(event.clientY - box.top + 12, box.height - 125)),
      };
      if (node) {
        const item = node.userData.item;
        const excerpt = item.content.trim();
        setHover({
          title: item.title,
          detail: excerpt
            ? `${excerpt.slice(0, 180)}${excerpt.length > 180 ? "…" : ""}`
            : "No content preview available.",
          ...coordinates,
        });
      } else if (edge) {
        const e = edge.userData.edge;
        setHover({
          title: `${edgeAppearance(e.weight).label} connection · ${e.weight.toFixed(2)}`,
          detail: `${e.explicit ? "Explicit link · " : ""}${e.basis === "semantic" ? `Meaning match ${Math.round(e.semantic * 100)}%` : `Shared wording ${Math.round(e.lexical * 100)}%`}${e.sharedTags.length ? ` · ${e.sharedTags.join(", ")}` : ""}`,
          ...coordinates,
        });
      } else setHover(null);
    };
    const down = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
      dragging = false;
    };
    const up = (event: PointerEvent) => {
      if (!dragging && event.button === 0) {
        const node = hit(event).node;
        if (node) openSource(node.userData.item.id);
      }
      dragging = false;
    };
    const leave = () => {
      hoveredId = "";
      hoverEdge = "";
      setHover(null);
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      setFailure(
        "The graphics context was lost. Reload this page or use the source list below.",
      );
    };
    const canvas = renderer.domElement;
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("webglcontextlost", contextLost);
    let visible = true;
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    });
    intersection.observe(host);
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      controls.update();
      const connected = new Set(
        visibleEdges
          .filter((e) => e.source === hoveredId || e.target === hoveredId)
          .flatMap((e) => [e.source, e.target]),
      );
      nodeMeshes.forEach((mesh) => {
        const id = mesh.userData.item.id,
          active =
            id === current.current.selectedId ||
            id === hoveredId ||
            current.current.highlighted.includes(id);
        mesh.scale.setScalar(mesh.userData.size * (active ? 1.3 : 1));
        mesh.material.opacity =
          hoveredId && !connected.has(id) && id !== hoveredId ? 0.25 : 1;
      });
      edgeObjects.forEach((object) => {
        const e = object.userData.edge,
          active = hoveredId
            ? e.source === hoveredId || e.target === hoveredId
            : current.current.highlighted.includes(e.source) &&
              current.current.highlighted.includes(e.target);
        (object.material as THREE.Material).opacity =
          active || hoverEdge === `${e.source}:${e.target}`
            ? 0.95
            : hoveredId
              ? 0.06
              : object.userData.baseOpacity;
      });
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      controls.dispose();
      controlsRef.current = null;
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("webglcontextlost", contextLost);
      scene.traverse((object) => {
        const renderable = object as THREE.Mesh;
        if (renderable.geometry && renderable.geometry !== sphere)
          renderable.geometry.dispose();
        if (renderable.material) {
          const materials = Array.isArray(renderable.material)
            ? renderable.material
            : [renderable.material];
          materials.forEach((m) => m.dispose());
        }
      });
      sphere.dispose();
      texture.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [items, edges, positions, visibleEdges, openSource]);
  function zoom(factor: number) {
    const controls = controlsRef.current;
    if (!controls) return;
    const offset = controls.object.position
      .clone()
      .sub(controls.target)
      .multiplyScalar(factor);
    offset.clampLength(controls.minDistance, controls.maxDistance);
    controls.object.position.copy(controls.target).add(offset);
    controls.update();
  }
  function focusNode(id: string) {
    setFocus(id);
    const point = positions.find((p) => p.id === id),
      controls = controlsRef.current;
    if (point && controls) {
      const offset = controls.object.position.clone().sub(controls.target);
      controls.target.set(point.x, point.y, point.z);
      controls.object.position.copy(controls.target).add(offset);
      controls.update();
    }
  }
  return (
    <div
      ref={container}
      className={`neural-graph ${large ? "large" : "compact"}`}
    >
      <div className="neural-toolbar">
        <span>
          <span className="neural-live-dot" />
          KNOWLEDGE BRAIN
        </span>
        <div>
          <button
            aria-label={spinning ? "Pause rotation" : "Auto rotate"}
            aria-pressed={spinning}
            onClick={() => setSpinning(!spinning)}
          >
            {spinning ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button
            aria-label="Reset graph view"
            onClick={() => {
              controlsRef.current?.reset();
              setFocus("");
            }}
          >
            <RotateCcw size={13} />
          </button>
          <button
            aria-label={fullscreen ? "Exit fullscreen" : "Expand graph"}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void container.current
                  ?.requestFullscreen()
                  .catch(() =>
                    setFailure(
                      "Fullscreen is unavailable. Open Connections for a larger graph.",
                    ),
                  );
            }}
          >
            {fullscreen ? <Minimize size={13} /> : <Expand size={13} />}
          </button>
        </div>
      </div>
      <div className="neural-stage">
        <div ref={mount} className="neural-canvas" />
        {hover && (
          <div
            className="neural-tooltip"
            style={{ left: hover.x, top: hover.y }}
          >
            <strong>{hover.title}</strong>
            <span>{hover.detail}</span>
          </div>
        )}
        {!items.length && (
          <div className="neural-empty">
            Add a source to grow your knowledge brain.
          </div>
        )}
        <div className="neural-zoom">
          <button aria-label="Zoom in" onClick={() => zoom(0.8)}>
            <Plus size={14} />
          </button>
          <button aria-label="Zoom out" onClick={() => zoom(1.25)}>
            <Minus size={14} />
          </button>
        </div>
      </div>
      <div className="neural-bottom">
        <span>Drag to orbit · scroll to zoom · hover to explore</span>
        <div className="strength-legend">
          <i /> Weak <i /> Medium <i /> Strong
        </div>
        <label>
          Min. strength{" "}
          <input
            aria-label="Minimum connection strength"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <output>{threshold.toFixed(2)}</output>
        </label>
        <small>
          {items.length} sources · {visibleEdges.length} / {edges.length}{" "}
          connections
        </small>
      </div>
      {failure && (
        <p className="neural-error" role="status">
          {failure}
        </p>
      )}
      <div className="neural-source-picker">
        <select
          aria-label="Focus a graph source"
          value={focus}
          onChange={(e) => focusNode(e.target.value)}
        >
          <option value="">Focus a source…</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <button disabled={!focus} onClick={() => openSource(focus)}>
          Open source ↗
        </button>
      </div>
    </div>
  );
}
