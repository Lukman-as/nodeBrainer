"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ArrowLeft,
  Expand,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Minus,
  Plus,
} from "lucide-react";
import {
  FLIGHT_DURATION,
  flightProgress,
  fadeVisibility,
} from "@/lib/graph-motion";
import { edgeAppearance, layoutGraph } from "@/lib/graph-layout";
import { MapAnswer } from "./map-answer";
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
  "#5fd4a0",
  "#f2a65a",
  "#8fa8ff",
  "#f27ea9",
  "#e8d45c",
  "#6fd3e8",
  "#c792ea",
  "#ff8c73",
  "#9be36b",
  "#d9a5ff",
];
type Hover = {
  title: string;
  detail: string;
  meta?: string;
  hint?: string;
  x: number;
  y: number;
} | null;
export function GraphScene({
  items,
  edges,
  selectedId,
  onSelect,
  highlighted = [],
  large = false,
  question,
  onDismissQuestion,
}: GraphProps) {
  const container = useRef<HTMLDivElement>(null),
    mount = useRef<HTMLDivElement>(null);
  const current = useRef({
    selectedId,
    onSelect,
    highlighted,
    spinning: true,
  });
  const readingAnswer = useRef(false);
  const lastQuestion = useRef<number | null>(null);
  const [collapsedAnswer, setCollapsedAnswer] = useState<number | null>(null);
  const answerCollapsed = Boolean(question && collapsedAnswer === question.id);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [hover, setHover] = useState<Hover>(null),
    [failure, setFailure] = useState("");
  const [spinning, setSpinning] = useState(true),
    [fullscreen, setFullscreen] = useState(false),
    [focus, setFocus] = useState("");
  const [focusedCluster, setFocusedCluster] = useState<number | null>(null);
  const focusedClusterRef = useRef<number | null>(null);
  const navigation = useRef<{
    cluster: (id: number | null) => void;
    source: (id: string) => void;
    interrupt: () => void;
  } | null>(null);
  useEffect(() => {
    current.current = {
      selectedId: focus || selectedId,
      onSelect,
      highlighted,
      spinning,
    };
  }, [selectedId, onSelect, highlighted, spinning, focus]);
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
  const clusters = useMemo(() => {
    const groups = new Map<
      number,
      { id: number; name: string; count: number; tags: Map<string, number> }
    >();
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const position of positions) {
      const item = byId.get(position.id)!;
      const group = groups.get(position.cluster) ?? {
        id: position.cluster,
        name: item.title,
        count: 0,
        tags: new Map<string, number>(),
      };
      group.count++;
      for (const tag of item.tags)
        group.tags.set(tag, (group.tags.get(tag) ?? 0) + 1);
      groups.set(position.cluster, group);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      name: [...group.tags].sort((a, b) => b[1] - a[1])[0]?.[0] || group.name,
    }));
  }, [items, positions]);
  const activeCluster = clusters.find(
    (cluster) => cluster.id === focusedCluster,
  );
  const visibleEdges = useMemo(() => edges.slice(0, 1200), [edges]);
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
      "3D knowledge brain. Click a cluster to explore it. Hover a node for a summary; click again inside a cluster to open its source. Drag to orbit, scroll to zoom. Use the cluster selector and library for keyboard access.",
    );
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#0d1718", 0.0025);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1500);
    camera.position.set(40, 24, 190);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 12;
    controls.maxDistance = 480;
    controls.autoRotateSpeed = 0.3;
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
    const bounds = new Map<number, THREE.Sphere>();
    for (const cluster of clusterSize.keys()) {
      const members = positions
        .filter((p) => p.cluster === cluster)
        .map((p) => points.get(p.id)!);
      const center = new THREE.Box3()
        .setFromPoints(members)
        .getCenter(new THREE.Vector3());
      const radius = Math.max(
        6,
        ...members.map((point) => point.distanceTo(center) + 5),
      );
      bounds.set(cluster, new THREE.Sphere(center, radius));
    }
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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activeClusterId = focusedClusterRef.current;
    if (activeClusterId !== null && !bounds.has(activeClusterId))
      activeClusterId = null;
    focusedClusterRef.current = activeClusterId;
    queueMicrotask(() => {
      setFocusedCluster(activeClusterId);
      setHover(null);
    });
    let interactionUntil = 0;
    let interacting = false;
    let transition: {
      from: THREE.Vector3;
      to: THREE.Vector3;
      targetFrom: THREE.Vector3;
      targetTo: THREE.Vector3;
      started: number;
    } | null = null;
    const overview = new THREE.Sphere(
      new THREE.Vector3(),
      Math.max(80, ...positions.map((p) => Math.hypot(p.x, p.y, p.z) + 6)),
    );
    const clusterVisibility = new Map(
      [...bounds.keys()].map((id) => [
        id,
        activeClusterId === null || id === activeClusterId ? 1 : 0,
      ]),
    );
    let shellVisibility = activeClusterId === null ? 1 : 0;
    const frameBounds = (
      sphere: THREE.Sphere,
      animate = true,
      retarget = false,
    ) => {
      const halfFov = Math.atan(
        Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
          Math.min(1, camera.aspect),
      );
      const distance = Math.max(
        controls.minDistance,
        Math.min(
          controls.maxDistance,
          (sphere.radius / Math.sin(halfFov)) * 1.18,
        ),
      );
      const direction = camera.position
        .clone()
        .sub(controls.target)
        .normalize();
      const destination = sphere.center
        .clone()
        .addScaledVector(direction, distance);
      if (animate && !reducedMotion.matches) {
        if (retarget && transition) {
          transition.to.copy(destination);
          transition.targetTo.copy(sphere.center);
          return;
        }
        transition = {
          from: camera.position.clone(),
          to: destination,
          targetFrom: controls.target.clone(),
          targetTo: sphere.center.clone(),
          started: performance.now(),
        };
      } else {
        transition = null;
        camera.position.copy(destination);
        controls.target.copy(sphere.center);
      }
      interactionUntil = performance.now() + FLIGHT_DURATION + 250;
    };
    const exploreCluster = (id: number | null) => {
      if (id !== null && !bounds.has(id)) return;
      activeClusterId = id;
      focusedClusterRef.current = id;
      setFocusedCluster(id);
      setFocus("");
      leave();
      frameBounds(id === null ? overview : bounds.get(id)!);
    };
    const interrupt = () => {
      transition = null;
      interactionUntil = performance.now() + 2200;
      controls.autoRotate = false;
    };
    navigation.current = {
      cluster: exploreCluster,
      source: (id) => {
        const cluster = clusterOf.get(id);
        if (cluster === undefined) return;
        exploreCluster(cluster);
        setFocus(id);
      },
      interrupt,
    };
    const interactionStart = () => {
      interacting = true;
      interrupt();
      leave();
    };
    const interactionEnd = () => {
      interacting = false;
      interactionUntil = performance.now() + 2200;
    };
    controls.addEventListener("start", interactionStart);
    controls.addEventListener("end", interactionEnd);
    let previousAspect = 0;
    const resize = () => {
      const width = host.clientWidth,
        height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (Math.abs(previousAspect - camera.aspect) > 0.01) {
        frameBounds(
          activeClusterId === null ? overview : bounds.get(activeClusterId)!,
          previousAspect !== 0,
          true,
        );
        previousAspect = camera.aspect;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 1.3 };
    const pointer = new THREE.Vector2();
    let hoveredId = "",
      hoverEdge = "",
      hovering = false,
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
      const node = raycaster.intersectObjects(
        nodeMeshes.filter(
          (mesh) =>
            mesh.visible &&
            (activeClusterId === null ||
              clusterOf.get(mesh.userData.item.id) === activeClusterId),
        ),
        false,
      )[0]?.object;
      const edge = raycaster.intersectObjects(
        edgeObjects.filter(
          (object) =>
            object.visible &&
            (activeClusterId === null ||
              (clusterOf.get(object.userData.edge.source) === activeClusterId &&
                clusterOf.get(object.userData.edge.target) ===
                  activeClusterId)),
        ),
        false,
      )[0]?.object;
      let cluster = node ? clusterOf.get(node.userData.item.id) : undefined;
      if (cluster === undefined && activeClusterId === null) {
        let nearest = Infinity;
        for (const [id, sphere] of bounds) {
          const intersection = raycaster.ray.intersectSphere(
            sphere,
            new THREE.Vector3(),
          );
          if (intersection) {
            const distance = camera.position.distanceToSquared(intersection);
            if (distance < nearest) {
              nearest = distance;
              cluster = id;
            }
          }
        }
      }
      return { node, edge, cluster, box };
    }
    const move = (event: PointerEvent) => {
      if (
        event.buttons &&
        Math.hypot(event.clientX - downX, event.clientY - downY) > 5
      )
        dragging = true;
      if (dragging) {
        setHover(null);
        hovering = false;
        hoveredId = "";
        hoverEdge = "";
        return;
      }
      const { node, edge, cluster, box } = hit(event);
      hovering = Boolean(node || edge || cluster !== undefined);
      interactionUntil = performance.now() + 1500;
      hoveredId = node?.userData.item.id || "";
      hoverEdge = edge
        ? `${edge.userData.edge.source}:${edge.userData.edge.target}`
        : "";
      renderer.domElement.style.cursor =
        node || cluster !== undefined ? "pointer" : "grab";
      const coordinates = {
        x: Math.max(
          8,
          Math.min(
            event.clientX - box.left + 12,
            box.width - Math.min(280, box.width - 16) - 8,
          ),
        ),
        y: Math.max(
          8,
          Math.min(event.clientY - box.top + 12, box.height - 210),
        ),
      };
      if (node) {
        const item = node.userData.item;
        const excerpt = (
          item.content ||
          item.segments
            .map((segment: { text: string }) => segment.text)
            .join(" ")
        )
          .replace(/\[\[([^\]]+)\]\]/g, "$1")
          .replace(/\s+/g, " ")
          .trim();
        setHover({
          title: item.title,
          meta: `${item.type.toUpperCase()} · ${counts.get(item.id) ?? 0} connections${item.tags.length ? ` · ${item.tags.slice(0, 3).join(", ")}` : ""}`,
          hint:
            activeClusterId === null
              ? "Click to explore this cluster"
              : "Click to open source",
          detail: excerpt
            ? `${excerpt.slice(0, 220)}${excerpt.length > 220 ? "…" : ""}`
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
      } else if (cluster !== undefined && activeClusterId === null) {
        const group = clusters.find((group) => group.id === cluster);
        setHover({
          title: group?.name || "Cluster",
          detail: `${clusterSize.get(cluster)} connected sources`,
          hint: "Click to explore this cluster",
          ...coordinates,
        });
      } else setHover(null);
    };
    const down = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
      dragging = false;
      interrupt();
    };
    const up = (event: PointerEvent) => {
      if (
        !dragging &&
        event.isPrimary &&
        event.button === 0 &&
        Math.hypot(event.clientX - downX, event.clientY - downY) <= 5
      ) {
        const { node, cluster } = hit(event);
        if (activeClusterId === null && cluster !== undefined)
          exploreCluster(cluster);
        else if (node) openSource(node.userData.item.id);
      }
      dragging = false;
    };
    function leave() {
      hovering = false;
      hoveredId = "";
      hoverEdge = "";
      setHover(null);
      renderer.domElement.style.cursor = "grab";
    }
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
    canvas.addEventListener("pointercancel", leave);
    canvas.addEventListener("webglcontextlost", contextLost);
    let visible = true;
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    });
    intersection.observe(host);
    let frame = 0;
    let previousTime = performance.now();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const now = performance.now();
      const delta = Math.min((now - previousTime) / 1000, 0.05);
      previousTime = now;
      if (!visible || document.hidden) return;
      controls.autoRotate =
        current.current.spinning &&
        !reducedMotion.matches &&
        !interacting &&
        !hovering &&
        !readingAnswer.current &&
        !transition &&
        now >= interactionUntil;
      if (transition) {
        const progress = Math.min(
          1,
          (now - transition.started) / FLIGHT_DURATION,
        );
        const eased = flightProgress(now - transition.started);
        camera.position.lerpVectors(transition.from, transition.to, eased);
        controls.target.lerpVectors(
          transition.targetFrom,
          transition.targetTo,
          eased,
        );
        controls.enableDamping = false;
        controls.update(delta);
        controls.enableDamping = true;
        if (progress === 1) transition = null;
      } else controls.update(delta);
      for (const [id, visibility] of clusterVisibility) {
        const target =
          activeClusterId === null || activeClusterId === id ? 1 : 0;
        clusterVisibility.set(
          id,
          reducedMotion.matches
            ? target
            : fadeVisibility(visibility, target, delta),
        );
      }
      const shellTarget = activeClusterId === null ? 1 : 0;
      shellVisibility = reducedMotion.matches
        ? shellTarget
        : fadeVisibility(shellVisibility, shellTarget, delta);
      shell.visible = shellVisibility > 0;
      for (const contour of shell.children)
        ((contour as THREE.Line).material as THREE.LineBasicMaterial).opacity =
          0.085 * shellVisibility;
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
        const visibility = clusterVisibility.get(clusterOf.get(id)!) ?? 1;
        mesh.visible = visibility > 0;
        const size = mesh.userData.size * (active ? 1.3 : 1);
        mesh.scale.setScalar(
          reducedMotion.matches
            ? size
            : THREE.MathUtils.lerp(
                mesh.scale.x,
                size,
                1 - Math.exp(-10 * delta),
              ),
        );
        mesh.material.opacity =
          visibility *
          (hoveredId && !connected.has(id) && id !== hoveredId ? 0.25 : 1);
        (mesh.children[0] as THREE.Sprite).material.opacity = 0.75 * visibility;
      });
      edgeObjects.forEach((object) => {
        const e = object.userData.edge,
          active = hoveredId
            ? e.source === hoveredId || e.target === hoveredId
            : current.current.highlighted.includes(e.source) &&
              current.current.highlighted.includes(e.target);
        const visibility = Math.min(
          clusterVisibility.get(clusterOf.get(e.source)!) ?? 1,
          clusterVisibility.get(clusterOf.get(e.target)!) ?? 1,
        );
        object.visible = visibility > 0;
        (object.material as THREE.Material).opacity =
          visibility *
          (active || hoverEdge === `${e.source}:${e.target}`
            ? 0.95
            : hoveredId
              ? 0.06
              : object.userData.baseOpacity);
      });
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      controls.removeEventListener("start", interactionStart);
      controls.removeEventListener("end", interactionEnd);
      navigation.current = null;
      controls.dispose();
      controlsRef.current = null;
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointercancel", leave);
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
  }, [items, edges, positions, clusters, visibleEdges, openSource]);
  const questionId = question?.id;
  const questionFocus = question?.focusItemId;
  useEffect(() => {
    if (questionId !== undefined) {
      lastQuestion.current = questionId;
      if (questionFocus) navigation.current?.source(questionFocus);
      else navigation.current?.cluster(null);
    } else if (lastQuestion.current !== null) {
      lastQuestion.current = null;
      readingAnswer.current = false;
      navigation.current?.cluster(null);
    }
  }, [questionId, questionFocus, positions, visibleEdges]);
  function zoom(factor: number) {
    const controls = controlsRef.current;
    if (!controls) return;
    navigation.current?.interrupt();
    const offset = controls.object.position
      .clone()
      .sub(controls.target)
      .multiplyScalar(factor);
    offset.clampLength(controls.minDistance, controls.maxDistance);
    controls.object.position.copy(controls.target).add(offset);
    controls.update();
  }
  return (
    <div
      ref={container}
      className={`neural-graph ${large ? "large" : "compact"} ${question && !answerCollapsed ? "has-question" : ""}`}
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
              navigation.current?.cluster(null);
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
                      "Fullscreen is unavailable. Open the Memory Map for a larger graph.",
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
        <div className="neural-cluster-nav">
          {activeCluster ? (
            <>
              <button
                className="neural-back"
                aria-label="Back to brain"
                title="Back to brain"
                onClick={() => navigation.current?.cluster(null)}
              >
                <ArrowLeft size={18} />
              </button>
              <span role="status">
                {activeCluster.name} · {activeCluster.count} sources
              </span>
            </>
          ) : items.length > 0 ? (
            <select
              aria-label="Explore a brain cluster"
              value=""
              onChange={(event) =>
                navigation.current?.cluster(Number(event.target.value))
              }
            >
              <option value="" disabled>
                Explore a cluster…
              </option>
              {clusters.map((cluster) => (
                <option key={cluster.id} value={cluster.id}>
                  {cluster.name} · {cluster.count} sources
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {hover && (
          <div
            className="neural-tooltip"
            role="tooltip"
            style={{ left: hover.x, top: hover.y }}
          >
            <strong>{hover.title}</strong>
            {hover.meta && <small>{hover.meta}</small>}
            <span>{hover.detail}</span>
            {hover.hint && <em>{hover.hint}</em>}
          </div>
        )}
        {question && (
          <div
            className="map-answer-container"
            onPointerEnter={() => {
              readingAnswer.current = true;
            }}
            onPointerLeave={() => {
              readingAnswer.current = false;
            }}
            onFocusCapture={() => {
              readingAnswer.current = true;
            }}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                readingAnswer.current = false;
            }}
          >
            <MapAnswer
              question={question}
              item={items.find(
                (item) => item.id === question.context?.matchedItemIds[0],
              )}
              collapsed={answerCollapsed}
              onCollapse={() =>
                setCollapsedAnswer(answerCollapsed ? null : question.id)
              }
              onDismiss={onDismissQuestion}
              onFocus={(id) => navigation.current?.source(id)}
              onOpen={openSource}
            />
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
      {failure && (
        <p className="neural-error" role="status">
          {failure}
        </p>
      )}
    </div>
  );
}
