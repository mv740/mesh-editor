import Constrainautor from '@kninnug/constrainautor'
import Delaunator from 'delaunator'
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Vector3,
  type ColorRepresentation,
} from 'three'
import {
  mergeGeometries,
  mergeVertices,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { computeConsistentNormals } from './normal'

export type BoundaryResult = {
  boundaryEdges: [number, number][]
  logicalIndex: number[]
  logicalToPosition: Map<number, Vector3>
}

function computeLoopNormal(loopVerts: Vector3[]): Vector3 {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let i = 0; i < loopVerts.length; i++) {
    const a = loopVerts[i]
    const b = loopVerts[(i + 1) % loopVerts.length]
    nx += (a.y - b.y) * (a.z + b.z)
    ny += (a.z - b.z) * (a.x + b.x)
    nz += (a.x - b.x) * (a.y + b.y)
  }
  const normal = new Vector3(nx, ny, nz)
  return normal.lengthSq() ? normal.normalize() : new Vector3(0, 0, 1)
}

/**
 * Finds boundary edges by quantizing positions to logical indices.
 */
export function findPositionBasedBoundaryEdges(
  geometry: BufferGeometry,
  tolerance = 1e-5,
): BoundaryResult {
  const posAttr = geometry.getAttribute('position') as BufferAttribute
  const vertexMap = new Map<string, number>()
  const logicalToPosition = new Map<number, Vector3>()
  const logicalIndex: number[] = []
  let nextIndex = 0

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i)
    const y = posAttr.getY(i)
    const z = posAttr.getZ(i)
    const key = `${Math.round(x / tolerance)}_${Math.round(y / tolerance)}_${Math.round(z / tolerance)}`
    if (!vertexMap.has(key)) {
      vertexMap.set(key, nextIndex)
      logicalToPosition.set(nextIndex, new Vector3(x, y, z))
      nextIndex++
    }
    logicalIndex[i] = vertexMap.get(key)!
  }

  const indexArray = geometry.index
    ? Array.from(geometry.index.array as ArrayLike<number>)
    : Array.from({ length: posAttr.count }, (_, i) => i)

  const edgeCount = new Map<string, number>()
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)

  for (let i = 0; i < indexArray.length; i += 3) {
    const [a, b, c] = [
      logicalIndex[indexArray[i]],
      logicalIndex[indexArray[i + 1]],
      logicalIndex[indexArray[i + 2]],
    ]
    for (const [v1, v2] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = edgeKey(v1, v2)
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1)
    }
  }

  const boundaryEdges: [number, number][] = []
  for (const [key, count] of edgeCount.entries())
    if (count === 1)
      boundaryEdges.push(key.split('_').map(Number) as [number, number])

  return { boundaryEdges, logicalIndex, logicalToPosition }
}

/**
 * Reconstruct closed loops from undirected boundary edges.
 */
export function findBoundaryLoops(boundaryEdges: [number, number][]) {
  const adj = new Map<number, Set<number>>()
  for (const [a, b] of boundaryEdges) {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }

  const removeEdge = (u: number, v: number) => {
    const s = adj.get(u)
    if (!s) return
    s.delete(v)
    if (s.size === 0) adj.delete(u)
  }

  const loops: number[][] = []

  while (true) {
    let start: number | undefined
    for (const [k, s] of adj.entries()) {
      if (s.size > 0) {
        start = k
        break
      }
    }
    if (start === undefined) break

    const nbrs = adj.get(start)!
    const firstIter = nbrs.values().next()
    const first = firstIter.value
    if (first === undefined) {
      removeEdge(start, start)
      continue
    }

    removeEdge(start, first)
    removeEdge(first, start)

    const loop: number[] = [start, first]
    let prev = start
    let cur = first
    let closed = false

    while (true) {
      const neighbors = adj.get(cur)
      if (!neighbors || neighbors.size === 0) break

      let next: number | undefined
      for (const n of neighbors) {
        next = n
        if (n !== prev) break
      }
      if (next === undefined) break

      removeEdge(cur, next)
      removeEdge(next, cur)
      loop.push(next)

      prev = cur
      cur = next
      if (cur === start) {
        closed = true
        break
      }
    }

    if (closed) {
      if (loop.length >= 2 && loop[0] === loop.at(-1)) loop.pop()
      if (loop.length >= 3) loops.push(loop)
    }
  }

  return loops
}

function projectLoopWithIndexMap(
  loop: number[],
  logicalToPosition: Map<number, Vector3>,
) {
  const pts3 = loop.map((i) => logicalToPosition.get(i)!.clone())
  const normal = computeLoopNormal(pts3)
  const u =
    Math.abs(normal.x) > 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  u.cross(normal).normalize()
  const v = new Vector3().crossVectors(normal, u).normalize()
  const centroid = pts3
    .reduce((acc, p) => acc.add(p), new Vector3())
    .multiplyScalar(1 / pts3.length)
  const pts2: [number, number][] = pts3.map((p) => {
    const rel = new Vector3().subVectors(p, centroid)
    return [rel.dot(u), rel.dot(v)]
  })
  return { pts2, indexMap: loop.slice(), centroid, u, v }
}

function computeLoopArea(
  loop: number[],
  logicalToPosition: Map<number, Vector3>,
) {
  const { pts2 } = projectLoopWithIndexMap(loop, logicalToPosition)
  let sum = 0
  for (let i = 0; i < pts2.length; i++) {
    const [x1, y1] = pts2[i]
    const [x2, y2] = pts2[(i + 1) % pts2.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) * 0.5
}

function sampleSteinerPoints2D(polygon: [number, number][], numPoints: number) {
  const xs = polygon.map((p) => p[0])
  const ys = polygon.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const points: [number, number][] = []
  let tries = 0
  while (points.length < numPoints && tries < numPoints * 100) {
    const x = minX + Math.random() * (maxX - minX)
    const y = minY + Math.random() * (maxY - minY)
    if (pointInPolygon([x, y], polygon)) points.push([x, y])
    tries++
  }
  return points
}

/**
 * Determines whether a given point lies inside a polygon using the ray-casting algorithm.
 *
 * @param pt - The point to test, represented as a tuple [x, y].
 * @param polygon - An array of points representing the polygon, each as a tuple [x, y].
 * @returns `true` if the point is inside the polygon, `false` otherwise.
 */
function pointInPolygon(pt: [number, number], polygon: [number, number][]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]
    const intersect =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Filters triangles whose centroids are inside a given boundary polygon.
 *
 * Iterates over the provided triangle indices, computes the centroid of each triangle
 * using the corresponding 2D points, and includes the triangle in the result if its
 * centroid lies within the specified boundary polygon.
 *
 * @param triangles - An array of triangle vertex indices (each group of 3 defines a triangle).
 * @param points2d - An array of 2D points corresponding to the vertex indices.
 * @param boundary - An array of 2D points defining the boundary polygon.
 * @returns An array of triangle vertex indices for triangles whose centroids are inside the boundary.
 */
function filterTrianglesInsideBoundary(
  triangles: Uint32Array | number[],
  points2d: [number, number][],
  boundary: [number, number][],
) {
  const filtered: number[] = []
  for (let i = 0; i < triangles.length; i += 3) {
    const a = points2d[triangles[i]]
    const b = points2d[triangles[i + 1]]
    const c = points2d[triangles[i + 2]]
    const centroid: [number, number] = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
    ]
    if (pointInPolygon(centroid, boundary))
      filtered.push(triangles[i], triangles[i + 1], triangles[i + 2])
  }
  return filtered
}

function makePatchIndices(
  tris: number[] | Uint32Array,
  base: number,
  flip: boolean,
) {
  const inds: number[] = []
  for (let i = 0; i < tris.length; i += 3) {
    inds.push(
      base + tris[i],
      base + tris[flip ? i + 2 : i + 1],
      base + tris[flip ? i + 1 : i + 2],
    )
  }
  return inds
}

/**
 * Computes the barycentric coordinates (u, v, w) of a point (px, py) with respect to a triangle defined by vertices a, b, and c in 2D space.
 *
 * @param px - The x-coordinate of the point to evaluate.
 * @param py - The y-coordinate of the point to evaluate.
 * @param a - The first vertex of the triangle as a tuple [x, y].
 * @param b - The second vertex of the triangle as a tuple [x, y].
 * @param c - The third vertex of the triangle as a tuple [x, y].
 * @returns An object containing the barycentric coordinates { u, v, w }, or `null` if the triangle is degenerate (area is too small).
 */
function barycentric2D(
  px: number,
  py: number,
  a: [number, number],
  b: [number, number],
  c: [number, number],
  eps = 1e-12,
) {
  const v0x = b[0] - a[0]
  const v0y = b[1] - a[1]
  const v1x = c[0] - a[0]
  const v1y = c[1] - a[1]
  const v2x = px - a[0]
  const v2y = py - a[1]
  const den = v0x * v1y - v1x * v0y
  if (Math.abs(den) < eps) return null
  const inv = 1 / den
  const u = (v2x * v1y - v1x * v2y) * inv
  const v_ = (v0x * v2y - v2x * v0y) * inv
  const w = 1 - u - v_
  return { u, v: v_, w }
}

/**
 * Computes the Inverse Distance Weighted (IDW) interpolation for a given 2D point.
 *
 * Given a point `s2`, this function calculates weights based on the inverse squared distance
 * to each point in `pts2`, applies these weights to the corresponding 3D boundary vertices,
 * and returns the interpolated 3D position.
 *
 * @param s2 - The 2D point `[x, y]` for which to compute the IDW interpolation.
 * @returns The interpolated `Vector3` position.
 *
 * @remarks
 * - Uses a small epsilon (`epsIdw`) to avoid division by zero.
 * - Assumes `pts2` is an array of 2D points and `boundaryVerts` is an array of corresponding `Vector3` objects.
 */
function computeIDW(
  s2: [number, number],
  pts2: [number, number][],
  boundaryVerts: Vector3[],
) {
  const epsIdw = 1e-12
  let wsum = 0
  const weights: number[] = []
  for (const b of pts2) {
    const dx = s2[0] - b[0]
    const dy = s2[1] - b[1]
    const d2 = dx * dx + dy * dy
    const w = 1 / (d2 + epsIdw)
    weights.push(w)
    wsum += w
  }
  const p = new Vector3(0, 0, 0)
  for (let i = 0; i < boundaryVerts.length; i++)
    p.add(boundaryVerts[i].clone().multiplyScalar(weights[i] / wsum))
  return p
}

/**
 * Triangulates one or more boundary loops with optional Steiner point insertion and constrained Delaunay triangulation.
 *
 * This function projects each input loop to 2D, optionally samples additional Steiner points for improved triangulation,
 * and applies constrained Delaunay triangulation to ensure the boundary edges are preserved. The resulting triangles are
 * filtered to remain inside the boundary. Steiner points are lifted back to 3D using barycentric interpolation from the boundary,
 * with inverse distance weighting (IDW) as a fallback. The final mesh is returned as a BufferGeometry.
 *
 * @param loops - An array of boundary loops, each represented as an array of logical vertex indices.
 * @param logicalToPosition - A map from logical vertex indices to their corresponding 3D positions (Vector3).
 * @param steinerDensity - Optional density factor for sampling Steiner points inside the boundary (default: 0).
 * @returns A BufferGeometry containing the triangulated mesh for all input loops.
 */
export function triangulateBoundaryLoopsConstrainautor(
  loops: number[][],
  logicalToPosition: Map<number, Vector3>,
  steinerDensity: number = 0,
): BufferGeometry {
  const outPositions: number[] = []
  const outIndices: number[] = []
  const boundaryMask: number[] = [] // 1 => boundary vertex, 0 => steiner/interior
  let nextIndex = 0

  for (const [, loop] of loops.entries()) {
    if (loop.length < 3) continue
    const { pts2, indexMap } = projectLoopWithIndexMap(loop, logicalToPosition)
    const nSteiner = Math.max(0, Math.round(pts2.length * steinerDensity))
    const steiner2d = nSteiner > 0 ? sampleSteinerPoints2D(pts2, nSteiner) : []
    const all2d = pts2.concat(steiner2d)
    const edges: [number, number][] = pts2.map((_, i) => [
      i,
      (i + 1) % pts2.length,
    ])

    let delaunay = Delaunator.from(all2d)
    try {
      const con = new Constrainautor(delaunay)
      con.delaunify(true)
      con.constrainAll(edges)
    } catch {
      if (steiner2d.length > 0) {
        try {
          const all2dRetry = pts2.slice()
          delaunay = Delaunator.from(all2dRetry)
          const con2 = new Constrainautor(delaunay)
          con2.delaunify(true)
          con2.constrainAll(edges)
        } catch {
          // leave delaunay as-is (unconstrained)
        }
      }
    }

    const filteredTriangles = filterTrianglesInsideBoundary(
      delaunay.triangles,
      all2d,
      pts2,
    )

    // Boundary verts (preserve exactly)
    const boundaryVerts = indexMap.map((idx) =>
      logicalToPosition.get(idx)!.clone(),
    )

    // Build a boundary-only triangulation for barycentric lifting
    let boundaryTris: number[] = []
    try {
      const bd = Delaunator.from(pts2)
      boundaryTris = filterTrianglesInsideBoundary(bd.triangles, pts2, pts2)
    } catch {
      boundaryTris = []
    }

    // Lift: boundary verts + steiner lifts
    const steinerVerts: Vector3[] = []
    for (const s2 of steiner2d) {
      let lifted: Vector3 | null = null
      // search for a boundary triangle that contains s2
      for (let t = 0; t < boundaryTris.length; t += 3) {
        const ia = boundaryTris[t]
        const ib = boundaryTris[t + 1]
        const ic = boundaryTris[t + 2]
        const a2 = pts2[ia]
        const b2 = pts2[ib]
        const c2 = pts2[ic]
        const bary = barycentric2D(s2[0], s2[1], a2, b2, c2)
        if (bary && bary.u >= -1e-8 && bary.v >= -1e-8 && bary.w >= -1e-8) {
          // use barycentric to interpolate 3D from boundaryVerts
          const pa = boundaryVerts[ia]
          const pb = boundaryVerts[ib]
          const pc = boundaryVerts[ic]
          lifted = new Vector3(0, 0, 0)
            .add(pa.clone().multiplyScalar(bary.w))
            .add(pb.clone().multiplyScalar(bary.u))
            .add(pc.clone().multiplyScalar(bary.v))
          break
        }
      }
      if (!lifted) {
        // fallback IDW
        lifted = computeIDW(s2, pts2, boundaryVerts)
      }
      steinerVerts.push(lifted)
    }

    const all3d = boundaryVerts.concat(steinerVerts)

    const baseIndex = nextIndex
    for (const p of all3d) outPositions.push(p.x, p.y, p.z)
    // record boundary mask: first boundaryVerts.length are boundary
    for (let i = 0; i < boundaryVerts.length; i++) boundaryMask.push(1)
    for (let i = 0; i < steinerVerts.length; i++) boundaryMask.push(0)
    nextIndex += all3d.length

    const indices = makePatchIndices(filteredTriangles, baseIndex, false)
    outIndices.push(...indices)
  }

  const geom = new BufferGeometry()
  geom.setAttribute('position', new Float32BufferAttribute(outPositions, 3))
  // mark boundary vertices so consumers can fix them during smoothing
  geom.setAttribute(
    'boundaryMask',
    new BufferAttribute(new Uint8Array(boundaryMask), 1),
  )
  geom.setIndex(outIndices)
  return geom
}

/**
 * Constrained / Taubin Laplacian smoother for an indexed BufferGeometry.
 * - geometry must be indexed and have 'position' attribute.
 * - fixedVerts is a Set<number> of vertex indices (in geometry's position attr) to keep fixed.
 * - iterations: number of smoothing passes.
 * - lambda: positive smoothing weight (typical 0.2 - 0.6)
 * - useTaubin: if true, performs lambda followed by mu to avoid shrink; mu should be negative (e.g. -0.53)
 * - maxMove: clamp maximum vertex displacement per step (in world units), 0 means no clamp.
 */
export function laplacianSmooth(
  geometry: BufferGeometry,
  fixedVerts: Set<number> = new Set(),
  iterations = 6,
  lambda = 0.35,
  useTaubin = true,
  mu = -0.53,
  maxMove = 1e-4,
) {
  if (!geometry.index) return
  const posAttr = geometry.getAttribute('position') as BufferAttribute
  const n = posAttr.count

  // build adjacency
  const adj: number[][] = Array.from({ length: n }, () => [])
  const idx = Array.from(geometry.index!.array as ArrayLike<number>)
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i]
    const b = idx[i + 1]
    const c = idx[i + 2]
    if (!adj[a].includes(b)) adj[a].push(b)
    if (!adj[a].includes(c)) adj[a].push(c)
    if (!adj[b].includes(a)) adj[b].push(a)
    if (!adj[b].includes(c)) adj[b].push(c)
    if (!adj[c].includes(a)) adj[c].push(a)
    if (!adj[c].includes(b)) adj[c].push(b)
  }

  const readPos = () => {
    const a = posAttr.array as Float32Array
    const arr: Vector3[] = Array.from(
      { length: n },
      (_, i) => new Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]),
    )
    return arr
  }

  let positions = readPos()

  const step = (weight: number) => {
    const newPos = positions.map((p) => p.clone())
    for (let i = 0; i < n; i++) {
      if (fixedVerts.has(i)) continue
      const nbrs = adj[i]
      if (!nbrs || nbrs.length === 0) continue
      const avg = new Vector3(0, 0, 0)
      for (const j of nbrs) avg.add(positions[j])
      avg.multiplyScalar(1 / nbrs.length)
      const disp = avg.sub(positions[i]).multiplyScalar(weight)
      if (maxMove > 0 && disp.length() > maxMove) disp.setLength(maxMove)
      newPos[i].add(disp)
    }
    positions = newPos
  }

  for (let it = 0; it < iterations; it++) {
    if (useTaubin) {
      step(lambda)
      step(mu)
    } else {
      step(lambda)
    }
  }

  // write back
  for (let i = 0; i < n; i++) {
    posAttr.setXYZ(i, positions[i].x, positions[i].y, positions[i].z)
  }
  posAttr.needsUpdate = true
  geometry.computeVertexNormals()
}

type FillHoleResult = {
  output: BufferGeometry
  boundaryResult?: BoundaryResult
  triangulatedFilledHoleMesh?: BufferGeometry
  loops?: number[][]
}

/**
 * Fills holes in a given indexed `BufferGeometry` by detecting boundary edges,
 * optionally filtering holes by area, and triangulating the boundaries.
 *
 * @param geometry - The indexed `BufferGeometry` to process. Must have an index.
 * @param tolerance - Tolerance for detecting boundary edges (default: `1e-5`).
 * @param steinerDensity - Density factor for Steiner points in triangulation (default: `0.7`).
 * @param maxHoleArea - Optional maximum area for holes to fill. Holes with projected area above this are skipped.
 * @param debugOnlyBoundary - If `true`, only computes and returns boundary information without filling holes.
 * @param splitAngleDeg - Angle in degrees for splitting normals during normal computation (default: `0`).
 * @param weldTolerance - Tolerance for welding vertices after merging geometries (default: `1e-6`).
 * @param enabledLaplacian - If true, run a constrained Laplacian smoother on the generated patch before merging (default: `false`).
 * @returns An object containing the output geometry with filled holes, boundary information, triangulated mesh for filled holes, and boundary loops.
 * @throws If the input geometry is not indexed.
 */
export function fillGeometryHoles(
  geometry: BufferGeometry,
  tolerance = 1e-5,
  steinerDensity = 0.7,
  maxHoleArea?: number,
  debugOnlyBoundary = false,
  splitAngleDeg = 0,
  weldTolerance = 1e-6,
  enabledLaplacian = false,
): FillHoleResult {
  if (!geometry.index) {
    throw new Error(
      'fillGeometryHoles requires an indexed geometry (geometry.index must be present)',
    )
  }
  const boundaryResult = findPositionBasedBoundaryEdges(geometry, tolerance)
  if (!boundaryResult.boundaryEdges.length) return { output: geometry }
  const loops = findBoundaryLoops(boundaryResult.boundaryEdges)

  if (debugOnlyBoundary) return { output: geometry, boundaryResult, loops }

  // Optionally skip very large loops (e.g. big openings or cavities). If
  // maxHoleArea is provided, compute each loop area and filter out loops
  // whose projected area exceeds the threshold. Default behavior (no
  // options) preserves previous behavior.
  const maxArea = maxHoleArea ?? Infinity
  let usedLoops = loops
  if (Number.isFinite(maxArea)) {
    usedLoops = loops.filter(
      (loop) =>
        computeLoopArea(loop, boundaryResult.logicalToPosition) <= maxArea,
    )
  }
  if (usedLoops.length === 0) return { output: geometry, boundaryResult, loops }

  const fillGeometry = triangulateBoundaryLoopsConstrainautor(
    usedLoops,
    boundaryResult.logicalToPosition,
    steinerDensity,
  )

  // Optionally run a constrained Laplacian smoother on the patch to test
  // visual improvement. Use the temporary 'boundaryMask' attribute to keep
  // boundary vertices fixed. After smoothing, remove the attribute so the
  // patch can be merged with the source geometry.
  if (enabledLaplacian) {
    const bm =
      fillGeometry.getAttribute &&
      (fillGeometry.getAttribute('boundaryMask') as BufferAttribute | undefined)
    if (bm) {
      const arr = bm.array as Uint8Array | any
      const fixed = new Set<number>()
      for (let i = 0; i < (arr.length || 0); i++) if (arr[i]) fixed.add(i)
      // conservative defaults; tune if you want stronger/weaker smoothing
      laplacianSmooth(fillGeometry, fixed, 6, 0.35, true, -0.53, 1e-4)
    }
  }

  // The patch generator sets a temporary 'boundaryMask' attribute to mark
  // which vertices are boundary vs interior. Remove it before merging so
  // BufferGeometryUtils.mergeGeometries doesn't fail due to mismatched attrs.
  if (fillGeometry.getAttribute && fillGeometry.getAttribute('boundaryMask')) {
    fillGeometry.deleteAttribute('boundaryMask')
  }

  geometry.computeVertexNormals()
  fillGeometry.computeVertexNormals()

  const merged = mergeGeometries(
    [geometry, fillGeometry],
    true,
  ) as BufferGeometry
  const welded = mergeVertices(merged, weldTolerance) as BufferGeometry
  welded.computeVertexNormals()

  // compute and fix normals using your global routine
  const normalMeshFixed = computeConsistentNormals(welded, {
    flipIfInward: true,
    splitAngleDeg: splitAngleDeg ?? 0,
  })

  return {
    output: normalMeshFixed,
    boundaryResult,
    triangulatedFilledHoleMesh: fillGeometry,
    loops,
  }
}

/** Create a line segments mesh showing boundary edges (for debug/visualization) */
export function createBoundaryEdgesMesh(
  boundaryResult: BoundaryResult,
  color: ColorRepresentation = 0xff0000,
) {
  const { boundaryEdges, logicalToPosition } = boundaryResult
  const positions = new Float32Array(boundaryEdges.length * 2 * 3)
  let i = 0
  for (const [v1, v2] of boundaryEdges) {
    const p1 = logicalToPosition.get(v1)!
    const p2 = logicalToPosition.get(v2)!
    positions[i++] = p1.x
    positions[i++] = p1.y
    positions[i++] = p1.z
    positions[i++] = p2.x
    positions[i++] = p2.y
    positions[i++] = p2.z
  }
  const edgeGeometry = new BufferGeometry()
  edgeGeometry.setAttribute('position', new BufferAttribute(positions, 3))
  const material = new LineBasicMaterial({ color, depthTest: false })
  const segments = new LineSegments(edgeGeometry, material)
  segments.name = 'Hole Edges'
  return segments
}
